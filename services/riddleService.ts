import crypto from 'crypto';
import {
  GeminiClientError,
  generateGroundedContent,
  generateStructuredJson,
  Type,
} from '../ai/geminiClient.ts';
import { getDb } from '../db/database.ts';
import {
  RIDDLE_DIFFICULTIES,
  type RiddleCategory,
  type RiddleDifficulty,
  type RiddleItem,
} from '../shared/types.ts';
import { recordRiddleOutcome, type DbUserRow } from './scoreService.ts';

interface DbRiddleRow {
  id: number;
  category: RiddleCategory;
  difficulty: RiddleDifficulty;
  question: string;
  options_json: string;
  correct_index: number;
  hint: string;
  explanation: string;
  as_of_date: string | null;
  sources_json: string;
  verified: number;
}

interface DbAttemptRow {
  id: number;
  attempt_token: string;
  user_id: number;
  riddle_id: number;
  category: RiddleCategory;
  difficulty: RiddleDifficulty;
  time_limit_sec: number;
  started_at_ms: number;
  submitted_at_ms: number | null;
  selected_index: number | null;
  used_hint: number;
  is_correct: number | null;
  points_awarded: number;
}

function getDifficultySpec(difficulty: RiddleDifficulty) {
  return RIDDLE_DIFFICULTIES.find((d) => d.level === difficulty) ?? RIDDLE_DIFFICULTIES[0];
}

// Generate + independently verify a fresh riddle via two-pass Gemini verification
async function generateAndVerifyFreshRiddle(
  category: RiddleCategory,
  difficulty: RiddleDifficulty,
  seenQuestions: string[],
  simulateAiError?: 'timeout' | 'invalid_json' | 'api_error' | null
): Promise<DbRiddleRow | null> {
  const isCurrentAffairs = category === 'Politics and Governance';
  const todayStr = new Date().toISOString().slice(0, 10);
  let groundedFactsContext = '';
  let groundedSources: Array<{ title: string; uri: string }> = [];

  if (isCurrentAffairs && !simulateAiError) {
    try {
      const grounded = await generateGroundedContent({
        prompt: `Provide 2 concise, neutral, well-established, non-contested factual governance or international-institution facts (such as UN bodies, constitutional frameworks, multilateral organizations, or verified milestones up to ${todayStr}) suitable for a ${difficulty} quiz question. Avoid partisan debates or fast-changing polls.`,
        systemInstruction:
          'You are a strictly neutral, factual encyclopedic researcher. Cite authoritative sources and avoid contested political opinions.',
        timeoutMs: 9000,
      });
      groundedFactsContext = grounded.text;
      groundedSources = grounded.sources;
    } catch {
      // Grounding optional fallback to verified constitutional/governance facts
    }
  }

  const genSchema = {
    type: Type.OBJECT,
    properties: {
      question: { type: Type.STRING },
      options: { type: Type.ARRAY, items: { type: Type.STRING } },
      correctIndex: { type: Type.INTEGER },
      hint: { type: Type.STRING },
      explanation: { type: Type.STRING },
    },
    required: ['question', 'options', 'correctIndex', 'hint', 'explanation'],
  };

  // Pass 1: Draft riddle
  const draft = await generateStructuredJson<{
    question: string;
    options: string[];
    correctIndex: number;
    hint: string;
    explanation: string;
  }>({
    systemInstruction:
      'Create ONE sharp, unambiguous, factually verified multiple-choice riddle or brain-challenge question with EXACTLY 4 distinct options where strictly ONE option is correct. Keep tone neutral, clear, and engaging.',
    prompt: JSON.stringify({
      category,
      difficulty,
      asOfDate: isCurrentAffairs ? todayStr : null,
      groundedReference: groundedFactsContext || undefined,
      avoidDuplicateQuestions: seenQuestions.slice(-8),
      rules: [
        'Exactly 4 options.',
        'correctIndex must be 0, 1, 2, or 3.',
        'Hint must help without naming the exact answer.',
        'Explanation must be 1-2 crisp factual sentences.',
      ],
    }),
    responseSchema: genSchema,
    timeoutMs: 7500,
    simulateError: simulateAiError,
  });

  if (
    !draft.question?.trim() ||
    !Array.isArray(draft.options) ||
    draft.options.length !== 4 ||
    draft.correctIndex < 0 ||
    draft.correctIndex > 3
  ) {
    return null;
  }

  const uniqueOpts = new Set(draft.options.map((o) => o.trim().toLowerCase()));
  if (uniqueOpts.size !== 4) return null;

  // Pass 2: Independent verification — second Gemini call solves without seeing correctIndex!
  const verifySchema = {
    type: Type.OBJECT,
    properties: {
      solvedIndex: { type: Type.INTEGER },
      exactlyOneOptionCorrect: { type: Type.BOOLEAN },
      isFactualAndNeutral: { type: Type.BOOLEAN },
    },
    required: ['solvedIndex', 'exactlyOneOptionCorrect', 'isFactualAndNeutral'],
  };

  const verification = await generateStructuredJson<{
    solvedIndex: number;
    exactlyOneOptionCorrect: boolean;
    isFactualAndNeutral: boolean;
  }>({
    systemInstruction:
      'You are an independent fact-checker and quiz verifier. Solve the multiple-choice question on your own, confirm whether strictly ONE option is unambiguously correct, and confirm it is factual and neutral.',
    prompt: JSON.stringify({
      category,
      question: draft.question,
      options: draft.options.map((opt, idx) => ({ index: idx, text: opt })),
    }),
    responseSchema: verifySchema,
    timeoutMs: 6500,
  });

  // Discard unless both passes agree AND exactly one option is correct!
  if (
    verification.solvedIndex !== draft.correctIndex ||
    !verification.exactlyOneOptionCorrect ||
    !verification.isFactualAndNeutral
  ) {
    return null;
  }

  const db = getDb();
  const info = db
    .prepare(
      `INSERT OR IGNORE INTO riddles (
        category, difficulty, question, options_json, correct_index,
        hint, explanation, as_of_date, sources_json, verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    )
    .run(
      category,
      difficulty,
      draft.question.trim(),
      JSON.stringify(draft.options.map((o) => o.trim())),
      draft.correctIndex,
      draft.hint.trim(),
      draft.explanation.trim(),
      isCurrentAffairs ? todayStr : null,
      JSON.stringify(groundedSources)
    );

  if (info.changes === 0) {
    return db.prepare('SELECT * FROM riddles WHERE question = ?').get(draft.question.trim()) as DbRiddleRow;
  }
  return db.prepare('SELECT * FROM riddles WHERE id = ?').get(info.lastInsertRowid) as DbRiddleRow;
}

export async function getNextRiddle(params: {
  userId: number;
  category: RiddleCategory;
  difficulty: RiddleDifficulty;
  preferAiFresh?: boolean;
  simulateAiError?: 'timeout' | 'invalid_json' | 'api_error' | null;
}): Promise<{ riddle: RiddleItem; aiGenerated: boolean; aiFallback?: boolean; aiError?: string }> {
  const db = getDb();
  const spec = getDifficultySpec(params.difficulty);

  // Never repeat a riddle already attempted by this user
  const attemptedIds = (
    db
      .prepare('SELECT riddle_id FROM riddle_attempts WHERE user_id = ?')
      .all(params.userId) as Array<{ riddle_id: number }>
  ).map((r) => r.riddle_id);

  let chosen: DbRiddleRow | null = null;
  let aiGenerated = false;
  let aiFallback = false;
  let aiError: string | undefined;

  if (params.simulateAiError) {
    // Explicitly test Gemini error path
    await generateAndVerifyFreshRiddle(params.category, params.difficulty, [], params.simulateAiError);
  }

  // First check unseen verified riddles in DB
  const allCatRiddles = db
    .prepare('SELECT * FROM riddles WHERE category = ? AND difficulty = ? AND verified = 1')
    .all(params.category, params.difficulty) as DbRiddleRow[];

  const seenSet = new Set(attemptedIds);
  const unseen = allCatRiddles.filter((r) => !seenSet.has(r.id));

  // If user wants a fresh AI riddle OR unseen pool is empty, generate & dual-verify via Gemini
  if (params.preferAiFresh || unseen.length === 0) {
    try {
      const fresh = await generateAndVerifyFreshRiddle(
        params.category,
        params.difficulty,
        allCatRiddles.map((r) => r.question)
      );
      if (fresh && !seenSet.has(fresh.id)) {
        chosen = fresh;
        aiGenerated = true;
      }
    } catch (err) {
      aiFallback = true;
      aiError = err instanceof GeminiClientError ? err.message : 'Live AI generation unavailable; using verified archive.';
    }
  }

  if (!chosen && unseen.length > 0) {
    chosen = unseen[Math.floor(Math.random() * unseen.length)];
  }

  // If all seed riddles were exhausted AND AI failed, avoid repeating the immediately preceding riddle
  if (!chosen) {
    if (allCatRiddles.length === 0) {
      throw new Error('No verified riddles available right now. Please retry.');
    }
    const lastId = attemptedIds.length > 0 ? attemptedIds[attemptedIds.length - 1] : -1;
    const nonImmediate = allCatRiddles.filter((r) => r.id !== lastId);
    const fallbackPool = nonImmediate.length > 0 ? nonImmediate : allCatRiddles;
    chosen = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
  }

  const attemptToken = crypto.randomUUID();
  const startedAtMs = Date.now();

  db.prepare(
    `INSERT INTO riddle_attempts (
      attempt_token, user_id, riddle_id, category, difficulty, time_limit_sec, started_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(attemptToken, params.userId, chosen.id, chosen.category, chosen.difficulty, spec.timeLimitSec, startedAtMs);

  const options = JSON.parse(chosen.options_json) as string[];
  const sources = JSON.parse(chosen.sources_json || '[]') as Array<{ title: string; uri: string }>;

  return {
    riddle: {
      id: chosen.id,
      attemptToken,
      category: chosen.category,
      difficulty: chosen.difficulty,
      question: chosen.question,
      options,
      timeLimitSec: spec.timeLimitSec,
      asOfDate: chosen.as_of_date,
      sources,
      verified: chosen.verified === 1,
      basePoints: spec.basePoints,
    },
    aiGenerated,
    aiFallback,
    aiError,
  };
}

export function requestRiddleHint(params: { userId: number; attemptToken: string }): { hint: string; penaltyPct: number } {
  const db = getDb();
  const attempt = db
    .prepare('SELECT * FROM riddle_attempts WHERE attempt_token = ? AND user_id = ?')
    .get(params.attemptToken, params.userId) as DbAttemptRow | undefined;

  if (!attempt) throw new Error('Riddle attempt not found.');
  if (attempt.submitted_at_ms !== null) throw new Error('This riddle was already submitted.');

  const riddle = db.prepare('SELECT hint FROM riddles WHERE id = ?').get(attempt.riddle_id) as { hint: string };
  db.prepare('UPDATE riddle_attempts SET used_hint = 1 WHERE id = ?').run(attempt.id);

  return { hint: riddle.hint, penaltyPct: 30 };
}

export function submitRiddleAnswer(params: {
  userId: number;
  attemptToken: string;
  selectedIndex: number | null; // null means timed out
}) {
  const db = getDb();
  const attempt = db
    .prepare('SELECT * FROM riddle_attempts WHERE attempt_token = ? AND user_id = ?')
    .get(params.attemptToken, params.userId) as DbAttemptRow | undefined;

  if (!attempt) throw new Error('Riddle attempt not found.');
  if (attempt.submitted_at_ms !== null) {
    throw new Error('This riddle attempt has already been scored.');
  }

  const riddle = db.prepare('SELECT * FROM riddles WHERE id = ?').get(attempt.riddle_id) as DbRiddleRow;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(params.userId) as DbUserRow;
  const spec = getDifficultySpec(attempt.difficulty);

  // Server-authoritative timer validation (2s grace for network latency)
  const nowMs = Date.now();
  const elapsedSec = Math.max(0, (nowMs - attempt.started_at_ms) / 1000);
  const timedOut = params.selectedIndex === null || elapsedSec > attempt.time_limit_sec + 2.0;

  const isCorrect = !timedOut && params.selectedIndex === riddle.correct_index;

  // Server-authoritative point calculation:
  // Easy 10, Medium 20, Hard 30, + up to 50% time bonus, - 30% when hint used, + 5 per streak step
  let pointsAwarded = 0;
  let breakdown = {
    basePoints: 0,
    timeBonus: 0,
    hintPenalty: 0,
    streakBonus: 0,
  };

  if (isCorrect) {
    const remainingRatio = Math.max(0, Math.min(1, (attempt.time_limit_sec - elapsedSec) / attempt.time_limit_sec));
    const timeBonus = Math.round(spec.basePoints * 0.5 * remainingRatio);
    const subtotal = spec.basePoints + timeBonus;
    const hintPenalty = attempt.used_hint === 1 ? Math.round(subtotal * 0.3) : 0;
    const nextStreakStep = user.riddle_streak + 1;
    const streakBonus = nextStreakStep * 5;
    pointsAwarded = Math.max(1, subtotal - hintPenalty + streakBonus);
    breakdown = {
      basePoints: spec.basePoints,
      timeBonus,
      hintPenalty,
      streakBonus,
    };
  }

  db.prepare(
    `UPDATE riddle_attempts
     SET submitted_at_ms = ?, selected_index = ?, is_correct = ?, points_awarded = ?
     WHERE id = ?`
  ).run(nowMs, params.selectedIndex, isCorrect ? 1 : 0, pointsAwarded, attempt.id);

  const { newBadges } = recordRiddleOutcome({
    userId: params.userId,
    isCorrect,
    pointsAwarded,
  });

  const updatedUser = db.prepare('SELECT riddle_streak, total_points FROM users WHERE id = ?').get(params.userId) as {
    riddle_streak: number;
    total_points: number;
  };

  return {
    isCorrect,
    timedOut,
    elapsedSec: Math.round(elapsedSec * 10) / 10,
    correctIndex: riddle.correct_index,
    explanation: riddle.explanation,
    pointsAwarded,
    breakdown,
    riddleStreak: updatedUser.riddle_streak,
    totalPoints: updatedUser.total_points,
    newBadges,
  };
}
