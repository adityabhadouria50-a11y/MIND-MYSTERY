import crypto from 'crypto';
import {
  GeminiClientError,
  parseClueWithGemini,
  wordQuestionWithGemini,
  writeRevealExplanationWithGemini,
} from '../ai/geminiClient.ts';
import { getDb } from '../db/database.ts';
import {
  CATEGORIES,
  type ActiveQuestion,
  type AnswerLogEntry,
  type CandidateRecord,
  type CategoryId,
  type GameMode,
  type RevealPayload,
} from '../shared/types.ts';
import {
  applyAnswerToScores,
  applyClueToScores,
  computeScoringSnapshot,
  initializeScores,
  NOT_SURE_VALUE,
} from './candidateScorer.ts';
import { generateDobCandidates, generateNumberCandidates } from './deterministicPools.ts';
import { getAllowedAttributesMap, selectNextBestQuestion } from './questionSelector.ts';
import { recordMindReaderOutcome } from './scoreService.ts';
import { fetchAndCacheTmdbPoster } from './tmdbService.ts';

interface DbSessionRow {
  id: string;
  user_id: number;
  mode: GameMode;
  category: CategoryId;
  industry: string | null;
  status: string;
  question_count: number;
  bonus_used: number;
  max_questions: number;
  scores_json: string;
  asked_attributes_json: string;
  history_json: string;
  current_question_json: string | null;
  clue_asked: number;
  range_min: number | null;
  range_max: number | null;
  top_candidate_id: string | null;
  confidence: number | null;
  predicted_correct: number | null;
  points_awarded: number;
}

export function loadCandidatesForPool(category: CategoryId, industry: string | null): CandidateRecord[] {
  if (category === 'number') {
    return generateNumberCandidates(industry).candidates;
  }
  if (category === 'dob') {
    return generateDobCandidates(industry);
  }

  const db = getDb();
  const rows = industry
    ? (db
        .prepare('SELECT * FROM candidates WHERE category = ? AND industry = ? AND verified = 1')
        .all(category, industry) as any[])
    : (db.prepare('SELECT * FROM candidates WHERE category = ? AND verified = 1').all(category) as any[]);

  return rows.map((r) => ({
    id: r.id,
    category: r.category as CategoryId,
    industry: r.industry,
    name: r.name,
    subtitle: r.subtitle,
    releaseYear: r.release_year,
    endYear: r.end_year,
    decade: r.decade,
    era: r.era,
    popularityPrior: r.popularity_prior,
    verified: r.verified === 1,
    attributes: JSON.parse(r.attributes_json),
    posterUrl: r.poster_url,
  }));
}

function getCategoryMeta(category: CategoryId) {
  const meta = CATEGORIES.find((c) => c.id === category);
  if (!meta) throw new Error(`Unsupported category: ${category}`);
  return meta;
}

function getSessionRow(sessionId: string, userId: number): DbSessionRow {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM sessions WHERE id = ? AND user_id = ?')
    .get(sessionId, userId) as DbSessionRow | undefined;
  if (!row) {
    throw new Error('Session not found.');
  }
  return row;
}

async function buildNextQuestion(params: {
  category: CategoryId;
  industry: string | null;
  candidates: CandidateRecord[];
  scores: Record<string, number>;
  askedAttributes: string[];
  questionCount: number;
  maxQuestions: number;
  isBonus: boolean;
  clueAsked: boolean;
  useAiWording?: boolean;
  simulateAiError?: 'timeout' | 'invalid_json' | 'api_error' | null;
}): Promise<{ readyToReveal: boolean; question: ActiveQuestion | null }> {
  const meta = getCategoryMeta(params.category);
  const snapshot = computeScoringSnapshot(params.candidates, params.scores, params.questionCount);

  // Stop early if confidence rule triggers (at Q7..Q9) OR max questions reached
  const reachedTargetCap = params.questionCount >= params.maxQuestions;
  const deterministicSolved =
    meta.isDeterministic && params.questionCount >= 7 && snapshot.candidatesRemaining === 1 && snapshot.confidencePct >= 88;

  const selected = selectNextBestQuestion({
    category: params.category,
    candidates: params.candidates,
    scores: params.scores,
    askedAttributes: params.askedAttributes,
    questionIndex: params.questionCount + 1,
  });

  // For non-deterministic categories, offer the optional free-text clue as the final question before reveal
  const shouldAskFinalClue =
    !meta.isDeterministic &&
    !params.isBonus &&
    !params.clueAsked &&
    (params.questionCount >= 9 ||
      snapshot.shouldEarlyStop ||
      !selected ||
      (params.questionCount >= 7 && snapshot.candidatesRemaining <= 2));

  if (shouldAskFinalClue) {
    return {
      readyToReveal: false,
      question: {
        questionIndex: params.questionCount + 1,
        maxQuestions: params.maxQuestions,
        isBonus: false,
        isFinalClue: true,
        attributeKey: '__final_clue__',
        question: 'Give me one last hint in your own words (or skip straight to my guess).',
        options: [],
        candidatesRemaining: snapshot.candidatesRemaining,
        topScorePct: snapshot.topScorePct,
        confidencePct: snapshot.confidencePct,
        confidenceLabel: snapshot.confidenceLabel,
        rangeMin: snapshot.rangeMin,
        rangeMax: snapshot.rangeMax,
      },
    };
  }

  if (
    reachedTargetCap ||
    deterministicSolved ||
    (params.isBonus && snapshot.confidencePct >= 72) ||
    (snapshot.shouldEarlyStop && meta.isDeterministic) ||
    !selected
  ) {
    return { readyToReveal: true, question: null };
  }

  let finalQuestionText = selected.fallbackQuestion;
  let finalOptions = selected.options;
  let aiFallback = false;
  let aiError: string | undefined;

  // Use Gemini to word the selected attribute naturally (for non-deterministic pools or when enabled)
  const shouldUseGemini = params.useAiWording !== false && !meta.isDeterministic;
  if (shouldUseGemini) {
    try {
      const worded = await wordQuestionWithGemini({
        category: meta.name,
        industry: params.industry,
        attributeKey: selected.attributeKey,
        allowedValues: selected.options,
        questionIndex: params.questionCount + 1,
        fallbackQuestion: selected.fallbackQuestion,
        simulateError: params.simulateAiError,
      });
      finalQuestionText = worded.question;
      finalOptions = worded.options;
    } catch (err) {
      aiFallback = true;
      aiError = err instanceof Error ? err.message : 'AI phrasing unavailable; using direct engine question.';
    }
  }

  return {
    readyToReveal: false,
    question: {
      questionIndex: params.questionCount + 1,
      maxQuestions: params.maxQuestions,
      isBonus: params.isBonus,
      isFinalClue: false,
      attributeKey: selected.attributeKey,
      question: finalQuestionText,
      options: finalOptions,
      candidatesRemaining: snapshot.candidatesRemaining,
      topScorePct: snapshot.topScorePct,
      confidencePct: snapshot.confidencePct,
      confidenceLabel: snapshot.confidenceLabel,
      rangeMin: snapshot.rangeMin,
      rangeMax: snapshot.rangeMax,
      aiFallback,
      aiError,
    },
  };
}

export async function startSession(params: {
  userId: number;
  mode: GameMode;
  category?: CategoryId;
  industry?: string | null;
  useAiWording?: boolean;
  simulateAiError?: 'timeout' | 'invalid_json' | 'api_error' | null;
}) {
  let category: CategoryId = params.category ?? 'movie';
  let industry: string | null = params.industry ?? null;

  if (params.mode === 'surprise_me' && !params.category) {
    const surprisePool: Array<{ cat: CategoryId; ind: string | null }> = [
      { cat: 'movie', ind: 'Hollywood' },
      { cat: 'movie', ind: 'Bollywood' },
      { cat: 'movie', ind: 'Anime' },
      { cat: 'movie', ind: 'Web Series' },
      { cat: 'sports_person', ind: 'Cricket' },
      { cat: 'food', ind: null },
      { cat: 'animal', ind: null },
      { cat: 'place', ind: null },
      { cat: 'colour', ind: null },
    ];
    const pick = surprisePool[Math.floor(Math.random() * surprisePool.length)];
    category = pick.cat;
    industry = pick.ind;
  }

  const meta = getCategoryMeta(category);
  if (meta.subOptions && meta.subOptions.length > 0 && !industry) {
    industry = meta.subOptions[0];
  }

  const candidates = loadCandidatesForPool(category, industry);
  if (candidates.length === 0) {
    throw new Error(`No verified candidates found for ${category} (${industry ?? 'all'}).`);
  }

  const scores = initializeScores(candidates);
  const sessionId = crypto.randomUUID();
  const maxQuestions = 10;

  const built = await buildNextQuestion({
    category,
    industry,
    candidates,
    scores,
    askedAttributes: [],
    questionCount: 0,
    maxQuestions,
    isBonus: false,
    clueAsked: false,
    useAiWording: params.useAiWording,
    simulateAiError: params.simulateAiError,
  });

  const db = getDb();
  const rangeMin = category === 'number' ? 1 : null;
  const rangeMax = category === 'number' ? (industry?.includes('1000') ? 1000 : 100) : null;

  db.prepare(
    `INSERT INTO sessions (
      id, user_id, mode, category, industry, status, question_count, bonus_used,
      max_questions, scores_json, asked_attributes_json, history_json,
      current_question_json, clue_asked, range_min, range_max
    ) VALUES (?, ?, ?, ?, ?, 'active', 0, 0, ?, ?, '[]', '[]', ?, 0, ?, ?)`
  ).run(
    sessionId,
    params.userId,
    params.mode,
    category,
    industry,
    maxQuestions,
    JSON.stringify(scores),
    JSON.stringify(built.question),
    rangeMin,
    rangeMax
  );

  return {
    sessionId,
    mode: params.mode,
    category,
    categoryName: meta.name,
    industry,
    poolSize: candidates.length,
    isDeterministic: meta.isDeterministic,
    readyToReveal: built.readyToReveal,
    question: built.question,
  };
}

export async function answerSessionQuestion(params: {
  sessionId: string;
  userId: number;
  answerValue: string;
  useAiWording?: boolean;
  simulateAiError?: 'timeout' | 'invalid_json' | 'api_error' | null;
}) {
  const row = getSessionRow(params.sessionId, params.userId);
  if (row.status !== 'active' && row.status !== 'bonus') {
    throw new Error('This session is no longer accepting answers.');
  }
  const currentQ = row.current_question_json ? (JSON.parse(row.current_question_json) as ActiveQuestion) : null;
  if (!currentQ || currentQ.isFinalClue) {
    throw new Error('No active multiple-choice question to answer.');
  }

  // Validate answerValue is either NOT_SURE or one of the allowed options
  const validOption = currentQ.options.find((o) => o.value === params.answerValue);
  if (params.answerValue !== NOT_SURE_VALUE && !validOption) {
    throw new Error('Invalid answer option submitted.');
  }

  const candidates = loadCandidatesForPool(row.category, row.industry);
  const currentScores = JSON.parse(row.scores_json) as Record<string, number>;
  const askedAttributes = JSON.parse(row.asked_attributes_json) as string[];
  const history = JSON.parse(row.history_json) as AnswerLogEntry[];

  const nextScores = applyAnswerToScores(candidates, currentScores, currentQ.attributeKey, params.answerValue);
  const nextQuestionCount = row.question_count + 1;
  const nextBonusUsed = row.status === 'bonus' ? row.bonus_used + 1 : row.bonus_used;

  if (!askedAttributes.includes(currentQ.attributeKey)) {
    askedAttributes.push(currentQ.attributeKey);
  }

  const snapAfter = computeScoringSnapshot(candidates, nextScores, nextQuestionCount);
  const answerLabel = params.answerValue === NOT_SURE_VALUE ? 'Not sure' : validOption!.label;

  history.push({
    questionIndex: nextQuestionCount,
    attributeKey: currentQ.attributeKey,
    questionText: currentQ.question,
    userAnswer: params.answerValue,
    userAnswerLabel: answerLabel,
    candidatesRemaining: snapAfter.candidatesRemaining,
    topScorePct: snapAfter.topScorePct,
  });

  const db = getDb();
  db.prepare(
    `INSERT INTO answers (session_id, question_index, attribute_key, question_text, user_answer, candidates_remaining, top_score)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    nextQuestionCount,
    currentQ.attributeKey,
    currentQ.question,
    answerLabel,
    snapAfter.candidatesRemaining,
    snapAfter.topScorePct / 100
  );

  const built = await buildNextQuestion({
    category: row.category,
    industry: row.industry,
    candidates,
    scores: nextScores,
    askedAttributes,
    questionCount: nextQuestionCount,
    maxQuestions: row.max_questions,
    isBonus: row.status === 'bonus',
    clueAsked: row.clue_asked === 1,
    useAiWording: params.useAiWording,
    simulateAiError: params.simulateAiError,
  });

  db.prepare(
    `UPDATE sessions
     SET question_count = ?, bonus_used = ?, scores_json = ?, asked_attributes_json = ?,
         history_json = ?, current_question_json = ?, range_min = ?, range_max = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    nextQuestionCount,
    nextBonusUsed,
    JSON.stringify(nextScores),
    JSON.stringify(askedAttributes),
    JSON.stringify(history),
    JSON.stringify(built.question),
    snapAfter.rangeMin ?? row.range_min,
    snapAfter.rangeMax ?? row.range_max,
    row.id
  );

  return {
    sessionId: row.id,
    readyToReveal: built.readyToReveal,
    question: built.question,
    history,
    candidatesRemaining: snapAfter.candidatesRemaining,
    topScorePct: snapAfter.topScorePct,
    confidencePct: snapAfter.confidencePct,
    confidenceLabel: snapAfter.confidenceLabel,
    rangeMin: snapAfter.rangeMin,
    rangeMax: snapAfter.rangeMax,
  };
}

export async function submitSessionClue(params: {
  sessionId: string;
  userId: number;
  clueText: string;
  skip?: boolean;
  simulateAiError?: 'timeout' | 'invalid_json' | 'api_error' | null;
}) {
  const row = getSessionRow(params.sessionId, params.userId);
  const candidates = loadCandidatesForPool(row.category, row.industry);
  const currentScores = JSON.parse(row.scores_json) as Record<string, number>;
  const history = JSON.parse(row.history_json) as AnswerLogEntry[];
  const cleanClue = (params.clueText ?? '').trim().slice(0, 180);

  if (params.skip || cleanClue.length === 0) {
    const db = getDb();
    db.prepare(`UPDATE sessions SET clue_asked = 1, current_question_json = NULL, updated_at = datetime('now') WHERE id = ?`).run(row.id);
    return { sessionId: row.id, readyToReveal: true, appliedFilters: [], aiFallback: false };
  }

  const availableAttributes = getAllowedAttributesMap(candidates);
  let filters: Array<{ attributeKey: string; value: string }> = [];
  let keywords: string[] = [];
  let aiFallback = false;
  let aiError: string | undefined;

  try {
    const parsed = await parseClueWithGemini({
      category: row.category,
      industry: row.industry,
      clueText: cleanClue,
      availableAttributes,
      simulateError: params.simulateAiError,
    });
    filters = parsed.filters;
    keywords = parsed.keywords;
  } catch (err) {
    if (params.simulateAiError) {
      // Preserve session state and return explicit retryable error!
      throw err instanceof GeminiClientError
        ? err
        : new GeminiClientError('AI failed to parse your clue. Please retry or skip.', 'API_ERROR');
    }
    aiFallback = true;
    aiError = err instanceof Error ? err.message : 'Used direct keyword matching for your clue.';
  }

  const nextScores = applyClueToScores(candidates, currentScores, filters, keywords, cleanClue);
  const nextQuestionCount = row.question_count + 1;
  const snapAfter = computeScoringSnapshot(candidates, nextScores, nextQuestionCount);

  history.push({
    questionIndex: nextQuestionCount,
    attributeKey: '__final_clue__',
    questionText: 'One last hint (typed)',
    userAnswer: cleanClue,
    userAnswerLabel: `"${cleanClue}"`,
    candidatesRemaining: snapAfter.candidatesRemaining,
    topScorePct: snapAfter.topScorePct,
  });

  const db = getDb();
  db.prepare(
    `INSERT INTO answers (session_id, question_index, attribute_key, question_text, user_answer, candidates_remaining, top_score)
     VALUES (?, ?, '__final_clue__', 'One last hint (typed)', ?, ?, ?)`
  ).run(row.id, nextQuestionCount, cleanClue, snapAfter.candidatesRemaining, snapAfter.topScorePct / 100);

  db.prepare(
    `UPDATE sessions
     SET question_count = ?, clue_asked = 1, scores_json = ?, history_json = ?,
         current_question_json = NULL, updated_at = datetime('now')
     WHERE id = ?`
  ).run(nextQuestionCount, JSON.stringify(nextScores), JSON.stringify(history), row.id);

  return {
    sessionId: row.id,
    readyToReveal: true,
    appliedFilters: filters,
    candidatesRemaining: snapAfter.candidatesRemaining,
    topScorePct: snapAfter.topScorePct,
    confidencePct: snapAfter.confidencePct,
    aiFallback,
    aiError,
  };
}

function buildTimelineChip(candidate: RevealPayload['topCandidate']): string | null {
  if (!candidate.releaseYear) return null;
  const isPerson = candidate.category === 'actor' || candidate.category === 'singer';
  const isSport = candidate.category === 'sports_person';
  const yearLabel = candidate.endYear
    ? `${candidate.releaseYear}–${candidate.endYear}`
    : isPerson
    ? `Debut ${candidate.releaseYear}`
    : isSport
    ? `Peak ${candidate.releaseYear}`
    : `Released ${candidate.releaseYear}`;
  return candidate.decade ? `${yearLabel} · ${candidate.decade}` : yearLabel;
}

function buildDeterministicExplanation(params: {
  category: CategoryId;
  industry: string | null;
  top: RevealPayload['topCandidate'];
  runnersUp: RevealPayload['runnersUp'];
  confidencePct: number;
  history: AnswerLogEntry[];
  isDeterministic: boolean;
}): string {
  const { category, industry, top, runnersUp, confidencePct, history, isDeterministic } = params;

  if (category === 'dob') {
    const yearSkipped = !industry || industry.startsWith('Any');
    return yearSkipped
      ? `Deduced from your answers: ${top.name}. A birth year was not given, so I cannot tell the year.`
      : `Deduced from your answers: ${top.name} (birth-year window ${industry}). This exact date matches your month, quarter, and day splits.`;
  }

  if (category === 'number') {
    return `Deduced mathematically from your ${history.length} answers: ${top.name}. Every range split and number property narrowed the pool straight to ${top.name}.`;
  }

  if (category === 'alphabet' || category === 'colour') {
    return `Logically deduced from your ${history.length} answers: ${top.name}. Your selections isolated this exact match inside the curated ${category} set.`;
  }

  const keyChoices = history
    .filter((h) => h.userAnswer !== NOT_SURE_VALUE)
    .slice(0, 3)
    .map((h) => h.userAnswerLabel)
    .join(', ');

  if (confidencePct < 60 && runnersUp.length > 0) {
    const altNames = runnersUp
      .slice(0, 2)
      .map((r) => (r.releaseYear ? `${r.name} (${r.releaseYear})` : r.name))
      .join(' and ');
    return `Your answers (${keyChoices || 'selected clues'}) fit several strong possibilities, with ${top.name} leading slightly. ${altNames} are also close matches — want up to 5 bonus questions to be more certain?`;
  }

  const indLabel = industry ? `${industry} ` : '';
  const yearNote = top.releaseYear ? ` (${top.releaseYear})` : '';
  return `You narrowed the ${indLabel}pool with answers including ${keyChoices || 'your chosen traits'}, pointing directly to ${top.name}${yearNote}. Based on our verified database scores, this is the strongest overall match.`;
}

export async function revealSession(params: {
  sessionId: string;
  userId: number;
  useAiExplanation?: boolean;
  simulateAiError?: 'timeout' | 'invalid_json' | 'api_error' | null;
}): Promise<RevealPayload> {
  const row = getSessionRow(params.sessionId, params.userId);
  const meta = getCategoryMeta(row.category);
  const candidates = loadCandidatesForPool(row.category, row.industry);
  const scores = JSON.parse(row.scores_json) as Record<string, number>;
  const history = JSON.parse(row.history_json) as AnswerLogEntry[];

  const snapshot = computeScoringSnapshot(candidates, scores, row.question_count);
  const top = snapshot.topCandidate;
  const runnersUp = snapshot.runnersUp;

  // Optional server-side TMDB poster lookup for movies & series
  if (row.category === 'movie') {
    const poster = await fetchAndCacheTmdbPoster({
      candidateId: top.id,
      name: top.name,
      category: top.category,
      industry: top.industry,
      releaseYear: top.releaseYear,
      existingPosterUrl: top.posterUrl,
    });
    if (poster) top.posterUrl = poster;
  }

  let explanation = buildDeterministicExplanation({
    category: row.category,
    industry: row.industry,
    top,
    runnersUp,
    confidencePct: snapshot.confidencePct,
    history,
    isDeterministic: meta.isDeterministic,
  });

  let aiFallback = false;
  let aiError: string | undefined;

  if (params.useAiExplanation !== false && row.category !== 'dob') {
    try {
      explanation = await writeRevealExplanationWithGemini({
        category: meta.name,
        industry: row.industry,
        topName: top.name,
        topSubtitle: top.subtitle,
        releaseYear: top.releaseYear,
        decade: top.decade,
        confidencePct: snapshot.confidencePct,
        confidenceLabel: snapshot.confidenceLabel,
        runnersUpNames: runnersUp.map((r) => (r.releaseYear ? `${r.name} (${r.releaseYear})` : r.name)),
        answersSummary: history.map((h) => ({ question: h.questionText, answer: h.userAnswerLabel })),
        isDeterministic: meta.isDeterministic,
        simulateError: params.simulateAiError,
      });
    } catch (err) {
      aiFallback = true;
      aiError = err instanceof Error ? err.message : 'Used direct analytical explanation.';
    }
  }

  const bonusRemaining = Math.max(0, 5 - row.bonus_used);
  const canOfferBonus = snapshot.confidencePct < 60 && bonusRemaining > 0 && row.question_count >= 7;

  const db = getDb();
  db.prepare(
    `UPDATE sessions
     SET status = 'revealed', top_candidate_id = ?, confidence = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(top.id, snapshot.confidencePct / 100, row.id);

  return {
    sessionId: row.id,
    category: row.category,
    industry: row.industry,
    isDeterministic: meta.isDeterministic,
    topCandidate: top,
    runnersUp,
    confidencePct: snapshot.confidencePct,
    confidenceLabel: snapshot.confidenceLabel,
    questionsAsked: row.question_count,
    explanation,
    timelineChip: buildTimelineChip(top),
    canOfferBonus,
    bonusRemaining,
    answersHistory: history,
    aiFallback,
    aiError,
  };
}

export async function startBonusRound(params: {
  sessionId: string;
  userId: number;
  useAiWording?: boolean;
}) {
  const row = getSessionRow(params.sessionId, params.userId);
  const bonusRemaining = Math.max(0, 5 - row.bonus_used);
  if (bonusRemaining <= 0) {
    throw new Error('All 5 bonus questions have already been used.');
  }

  const candidates = loadCandidatesForPool(row.category, row.industry);
  const scores = JSON.parse(row.scores_json) as Record<string, number>;
  const askedAttributes = JSON.parse(row.asked_attributes_json) as string[];
  const nextMax = row.question_count + bonusRemaining;

  const built = await buildNextQuestion({
    category: row.category,
    industry: row.industry,
    candidates,
    scores,
    askedAttributes,
    questionCount: row.question_count,
    maxQuestions: nextMax,
    isBonus: true,
    clueAsked: true,
    useAiWording: params.useAiWording,
  });

  if (built.readyToReveal || !built.question) {
    return { sessionId: row.id, readyToReveal: true, question: null };
  }

  const db = getDb();
  db.prepare(
    `UPDATE sessions
     SET status = 'bonus', max_questions = ?, current_question_json = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(nextMax, JSON.stringify(built.question), row.id);

  return {
    sessionId: row.id,
    readyToReveal: false,
    question: built.question,
  };
}

export function submitSessionFeedback(params: {
  sessionId: string;
  userId: number;
  wasCorrect: boolean;
  correctAnswerName?: string;
  selectedRunnerUpId?: string;
  notes?: string;
}) {
  const row = getSessionRow(params.sessionId, params.userId);
  if (row.status === 'completed') {
    return {
      alreadyRecorded: true,
      pointsAwarded: row.points_awarded,
      newBadges: [] as string[],
      savedCorrection: false,
    };
  }

  const db = getDb();
  const confidencePct = Math.round((row.confidence ?? 0.5) * 100);
  const outcome = recordMindReaderOutcome({
    userId: params.userId,
    wasCorrect: params.wasCorrect,
    questionsAsked: row.question_count,
    confidencePct,
    isDailyChallenge: row.mode === 'daily_challenge',
  });

  const cleanCorrectName = params.correctAnswerName?.trim().slice(0, 120) || null;
  let savedCorrection = false;

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE sessions
       SET status = 'completed', predicted_correct = ?, points_awarded = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(params.wasCorrect ? 1 : 0, outcome.pointsAwarded, row.id);

    db.prepare(
      `INSERT INTO feedback (
        session_id, user_id, category, industry, predicted_candidate_id,
        was_correct, correct_answer_name, selected_runner_up_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      row.id,
      params.userId,
      row.category,
      row.industry,
      row.top_candidate_id,
      params.wasCorrect ? 1 : 0,
      cleanCorrectName,
      params.selectedRunnerUpId || null,
      params.notes?.trim().slice(0, 300) || null
    );

    // If user reported NO and provided the true item, update or save unverified candidate for future review/learning
    if (!params.wasCorrect && (cleanCorrectName || params.selectedRunnerUpId)) {
      savedCorrection = true;
      const history = JSON.parse(row.history_json) as AnswerLogEntry[];
      const inferredAttrs: Record<string, string> = {};
      for (const h of history) {
        if (
          h.attributeKey &&
          !h.attributeKey.startsWith('__') &&
          !h.attributeKey.startsWith('num_gt_') &&
          !h.attributeKey.startsWith('dob_') &&
          h.userAnswer !== NOT_SURE_VALUE
        ) {
          inferredAttrs[h.attributeKey] = h.userAnswer;
        }
      }

      if (params.selectedRunnerUpId) {
        // Boost popularity prior slightly for the chosen runner-up
        db.prepare(
          `UPDATE candidates SET popularity_prior = MIN(2.0, popularity_prior + 0.05) WHERE id = ?`
        ).run(params.selectedRunnerUpId);
      } else if (cleanCorrectName && row.category !== 'number' && row.category !== 'dob') {
        const existing = db
          .prepare('SELECT id, attributes_json FROM candidates WHERE LOWER(name) = LOWER(?) AND category = ?')
          .get(cleanCorrectName, row.category) as { id: string; attributes_json: string } | undefined;

        if (existing) {
          // Fill in any missing attributes only, preserve curated verified fields
          const curAttrs = JSON.parse(existing.attributes_json) as Record<string, unknown>;
          let changed = false;
          for (const [k, v] of Object.entries(inferredAttrs)) {
            if (curAttrs[k] === undefined) {
              curAttrs[k] = v;
              changed = true;
            }
          }
          if (changed) {
            db.prepare('UPDATE candidates SET attributes_json = ? WHERE id = ?').run(
              JSON.stringify(curAttrs),
              existing.id
            );
          }
          db.prepare('UPDATE candidates SET popularity_prior = MIN(2.0, popularity_prior + 0.05) WHERE id = ?').run(
            existing.id
          );
        } else {
          // Store as unverified user suggestion (never served as final answer until verified!)
          const slug = cleanCorrectName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
          const newId = `user_${row.category}_${slug}_${Date.now().toString(36)}`;
          db.prepare(
            `INSERT OR IGNORE INTO candidates (
              id, category, industry, name, subtitle, popularity_prior, verified, attributes_json
            ) VALUES (?, ?, ?, ?, 'User submitted suggestion (pending verification)', 0.9, 0, ?)`
          ).run(newId, row.category, row.industry, cleanCorrectName, JSON.stringify(inferredAttrs));
        }
      }
    }
  });
  tx();

  return {
    alreadyRecorded: false,
    pointsAwarded: outcome.pointsAwarded,
    newBadges: outcome.newBadges,
    savedCorrection,
  };
}
