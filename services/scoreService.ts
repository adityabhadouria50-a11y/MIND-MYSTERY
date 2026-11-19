import { getDb } from '../db/database.ts';
import type { BadgeInfo, CategoryId, LeaderboardEntry, RankInfo, UserProfile } from '../shared/types.ts';
import { RIDDLE_CATEGORIES } from '../shared/types.ts';

export const BADGE_DEFINITIONS: Array<{ key: string; name: string; description: string }> = [
  { key: 'first_mind_read', name: 'First Mind Read', description: 'Complete your first accurate Mind Reader prediction.' },
  { key: 'mind_master', name: 'Mind Master', description: 'Achieve 10 successful Mind Reader predictions.' },
  { key: 'brain_explorer', name: 'Brain Explorer', description: 'Solve riddles in all 5 Brain Arena categories.' },
  { key: 'riddle_champion', name: 'Riddle Champion', description: 'Reach a 20-riddle streak or hold the #1 weekly riddle score.' },
  { key: 'perfect_prediction', name: 'Perfect Prediction', description: 'Get a correct Mind Reader match in 7 questions or fewer.' },
  { key: 'ten_games', name: '10 Games Completed', description: 'Finish 10 Mind Reader sessions across any categories.' },
];

const RANKS: Array<{ name: RankInfo['name']; minPoints: number }> = [
  { name: 'Curious', minPoints: 0 },
  { name: 'Thinker', minPoints: 150 },
  { name: 'Analyst', minPoints: 400 },
  { name: 'Mind Reader', minPoints: 800 },
  { name: 'Oracle', minPoints: 1500 },
];

export function computeRank(points: number): RankInfo {
  let currentIdx = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (points >= RANKS[i].minPoints) currentIdx = i;
  }
  const current = RANKS[currentIdx];
  const next = RANKS[currentIdx + 1] ?? null;
  const progressPct = next
    ? Math.max(0, Math.min(100, Math.round(((points - current.minPoints) / (next.minPoints - current.minPoints)) * 100)))
    : 100;

  return {
    name: current.name,
    minPoints: current.minPoints,
    nextRankName: next?.name ?? null,
    nextRankPoints: next?.minPoints ?? null,
    progressPct,
  };
}

export interface DbUserRow {
  id: number;
  device_token: string;
  nickname: string;
  total_points: number;
  games_played: number;
  successful_guesses: number;
  riddles_solved: number;
  riddle_streak: number;
  best_riddle_streak: number;
  current_streak: number;
  best_streak: number;
  last_played_date: string | null;
}

export function getOrCreateUser(deviceToken: string, optionalNickname?: string): DbUserRow {
  const db = getDb();
  const cleanToken = deviceToken.trim().slice(0, 128) || 'anonymous_default_token';
  const existing = db.prepare('SELECT * FROM users WHERE device_token = ?').get(cleanToken) as DbUserRow | undefined;
  if (existing) return existing;

  const fallbackNick =
    optionalNickname && optionalNickname.trim().length >= 2
      ? optionalNickname.trim().slice(0, 24)
      : `Seeker-${Math.floor(1000 + Math.random() * 9000)}`;

  db.prepare('INSERT INTO users (device_token, nickname) VALUES (?, ?)').run(cleanToken, fallbackNick);
  return db.prepare('SELECT * FROM users WHERE device_token = ?').get(cleanToken) as DbUserRow;
}

export function updateNickname(userId: number, nickname: string): DbUserRow {
  const db = getDb();
  const clean = nickname.trim().replace(/\s+/g, ' ').slice(0, 24);
  if (clean.length < 2) {
    throw new Error('Nickname must be at least 2 characters.');
  }
  db.prepare('UPDATE users SET nickname = ? WHERE id = ?').run(clean, userId);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUserRow;
}

export function recordMindReaderOutcome(params: {
  userId: number;
  wasCorrect: boolean;
  questionsAsked: number;
  confidencePct: number;
  isDailyChallenge?: boolean;
}): { pointsAwarded: number; newBadges: string[] } {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(params.userId) as DbUserRow;
  const today = new Date().toISOString().slice(0, 10);

  let pointsAwarded = 0;
  let nextStreak = user.current_streak;
  let nextSuccess = user.successful_guesses;
  const nextGames = user.games_played + 1;

  if (params.wasCorrect) {
    nextStreak += 1;
    nextSuccess += 1;
    const base = 30;
    const efficiencyBonus = params.questionsAsked <= 7 ? 15 : params.questionsAsked <= 9 ? 8 : 0;
    const streakBonus = Math.min(25, nextStreak * 5);
    const dailyBonus = params.isDailyChallenge ? 25 : 0;
    pointsAwarded = base + efficiencyBonus + streakBonus + dailyBonus;
  } else {
    // Honest participation credit for teaching the database
    pointsAwarded = 5;
    nextStreak = 0;
  }

  const nextBestStreak = Math.max(user.best_streak, nextStreak);
  const nextTotal = user.total_points + pointsAwarded;

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE users
       SET total_points = ?, games_played = ?, successful_guesses = ?,
           current_streak = ?, best_streak = ?, last_played_date = ?
       WHERE id = ?`
    ).run(nextTotal, nextGames, nextSuccess, nextStreak, nextBestStreak, today, params.userId);

    db.prepare(
      `INSERT INTO scores (user_id, source, points, is_correct_prediction, is_riddle_correct)
       VALUES (?, ?, ?, ?, 0)`
    ).run(params.userId, params.isDailyChallenge ? 'daily' : 'mind_reader', pointsAwarded, params.wasCorrect ? 1 : 0);
  });
  tx();

  const newBadges = evaluateAndUnlockBadges(params.userId, {
    justGotPerfectPrediction: params.wasCorrect && params.questionsAsked <= 7,
  });

  return { pointsAwarded, newBadges };
}

export function recordRiddleOutcome(params: {
  userId: number;
  isCorrect: boolean;
  pointsAwarded: number;
}): { newBadges: string[] } {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(params.userId) as DbUserRow;
  const today = new Date().toISOString().slice(0, 10);

  const nextRiddlesSolved = user.riddles_solved + (params.isCorrect ? 1 : 0);
  const nextRiddleStreak = params.isCorrect ? user.riddle_streak + 1 : 0;
  const nextBestRiddleStreak = Math.max(user.best_riddle_streak, nextRiddleStreak);
  const nextTotal = user.total_points + params.pointsAwarded;

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE users
       SET total_points = ?, riddles_solved = ?, riddle_streak = ?,
           best_riddle_streak = ?, last_played_date = ?
       WHERE id = ?`
    ).run(nextTotal, nextRiddlesSolved, nextRiddleStreak, nextBestRiddleStreak, today, params.userId);

    if (params.pointsAwarded > 0 || params.isCorrect) {
      db.prepare(
        `INSERT INTO scores (user_id, source, points, is_correct_prediction, is_riddle_correct)
         VALUES (?, 'riddle', ?, 0, ?)`
      ).run(params.userId, params.pointsAwarded, params.isCorrect ? 1 : 0);
    }
  });
  tx();

  const newBadges = evaluateAndUnlockBadges(params.userId);
  return { newBadges };
}

export function evaluateAndUnlockBadges(
  userId: number,
  extra?: { justGotPerfectPrediction?: boolean }
): string[] {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUserRow;
  const existingRows = db.prepare('SELECT badge_key FROM badges WHERE user_id = ?').all(userId) as Array<{
    badge_key: string;
  }>;
  const owned = new Set(existingRows.map((r) => r.badge_key));
  const newlyUnlocked: string[] = [];

  const grant = (key: string) => {
    if (!owned.has(key)) {
      db.prepare('INSERT OR IGNORE INTO badges (user_id, badge_key) VALUES (?, ?)').run(userId, key);
      owned.add(key);
      newlyUnlocked.push(key);
    }
  };

  if (user.successful_guesses >= 1) grant('first_mind_read');
  if (user.successful_guesses >= 10) grant('mind_master');
  if (user.games_played >= 10) grant('ten_games');
  if (extra?.justGotPerfectPrediction) grant('perfect_prediction');

  // Brain Explorer: solved riddles in all 5 categories
  const solvedCats = db
    .prepare('SELECT DISTINCT category FROM riddle_attempts WHERE user_id = ? AND is_correct = 1')
    .all(userId) as Array<{ category: string }>;
  const solvedSet = new Set(solvedCats.map((r) => r.category));
  if (RIDDLE_CATEGORIES.every((c) => solvedSet.has(c))) {
    grant('brain_explorer');
  }

  // Riddle Champion: 20 riddles in a row OR #1 weekly riddle score (with >= 50 weekly riddle pts)
  if (user.best_riddle_streak >= 20) {
    grant('riddle_champion');
  } else {
    const topWeekly = db
      .prepare(
        `SELECT user_id, SUM(points) as pts
         FROM scores
         WHERE source = 'riddle' AND created_at >= datetime('now', '-7 days')
         GROUP BY user_id
         ORDER BY pts DESC
         LIMIT 1`
      )
      .get() as { user_id: number; pts: number } | undefined;
    if (topWeekly && topWeekly.user_id === userId && topWeekly.pts >= 50) {
      grant('riddle_champion');
    }
  }

  return newlyUnlocked;
}

export function getUserProfile(userId: number): UserProfile {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as DbUserRow;
  const badgeRows = db.prepare('SELECT badge_key, unlocked_at FROM badges WHERE user_id = ?').all(userId) as Array<{
    badge_key: string;
    unlocked_at: string;
  }>;
  const badgeMap = new Map(badgeRows.map((b) => [b.badge_key, b.unlocked_at]));

  const badges: BadgeInfo[] = BADGE_DEFINITIONS.map((def) => ({
    key: def.key,
    name: def.name,
    description: def.description,
    unlocked: badgeMap.has(def.key),
    unlockedAt: badgeMap.get(def.key),
  }));

  const recentRows = db
    .prepare(
      `SELECT s.id, s.category, s.industry, s.confidence, s.predicted_correct, s.points_awarded, s.created_at,
              c.name as top_name, s.top_candidate_id
       FROM sessions s
       LEFT JOIN candidates c ON c.id = s.top_candidate_id
       WHERE s.user_id = ? AND s.status IN ('revealed', 'completed')
       ORDER BY s.created_at DESC
       LIMIT 8`
    )
    .all(userId) as Array<{
    id: string;
    category: CategoryId;
    industry: string | null;
    confidence: number | null;
    predicted_correct: number | null;
    points_awarded: number;
    created_at: string;
    top_name: string | null;
    top_candidate_id: string | null;
  }>;

  const accuracyPct =
    user.games_played > 0 ? Math.round((user.successful_guesses / user.games_played) * 100) : 0;

  return {
    id: user.id,
    nickname: user.nickname,
    totalPoints: user.total_points,
    gamesPlayed: user.games_played,
    successfulGuesses: user.successful_guesses,
    riddlesSolved: user.riddles_solved,
    riddleStreak: user.riddle_streak,
    bestRiddleStreak: user.best_riddle_streak,
    currentStreak: user.current_streak,
    bestStreak: user.best_streak,
    accuracyPct,
    rank: computeRank(user.total_points),
    badges,
    recentSessions: recentRows.map((r) => ({
      id: r.id,
      category: r.category,
      industry: r.industry,
      topName: r.top_name ?? formatDynamicCandidateName(r.top_candidate_id),
      confidencePct: Math.round((r.confidence ?? 0) * 100),
      predictedCorrect: r.predicted_correct === null ? null : r.predicted_correct === 1,
      pointsAwarded: r.points_awarded,
      createdAt: r.created_at,
    })),
  };
}

function formatDynamicCandidateName(id: string | null): string | null {
  if (!id) return null;
  if (id.startsWith('number_')) return `Number ${id.slice('number_'.length)}`;
  if (id.startsWith('dob_')) {
    const [, m, d] = id.split('_');
    const months = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d} ${months[Number(m)] || m}`;
  }
  return id;
}

export function getLeaderboard(range: 'daily' | 'weekly' | 'all', currentUserId: number): LeaderboardEntry[] {
  const db = getDb();
  const timeFilter =
    range === 'daily'
      ? `AND sc.created_at >= datetime('now', '-1 day')`
      : range === 'weekly'
      ? `AND sc.created_at >= datetime('now', '-7 days')`
      : '';

  const rows = db
    .prepare(
      `SELECT u.id as user_id,
              u.nickname,
              COALESCE(SUM(sc.points), 0) as points,
              COALESCE(SUM(sc.is_correct_prediction), 0) as correct_predictions,
              COALESCE(SUM(CASE WHEN sc.source = 'riddle' THEN sc.points ELSE 0 END), 0) as riddle_score,
              COALESCE(SUM(sc.is_riddle_correct), 0) as riddles_solved
       FROM users u
       LEFT JOIN scores sc ON sc.user_id = u.id ${timeFilter}
       GROUP BY u.id
       HAVING points > 0 OR u.id = ?
       ORDER BY points DESC, correct_predictions DESC, u.id ASC
       LIMIT 30`
    )
    .all(currentUserId) as Array<{
    user_id: number;
    nickname: string;
    points: number;
    correct_predictions: number;
    riddle_score: number;
    riddles_solved: number;
  }>;

  return rows.map((r, idx) => ({
    rank: idx + 1,
    userId: r.user_id,
    nickname: r.nickname,
    points: r.points,
    correctPredictions: r.correct_predictions,
    riddleScore: r.riddle_score,
    riddlesSolved: r.riddles_solved,
    isCurrentUser: r.user_id === currentUserId,
  }));
}
