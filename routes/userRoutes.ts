import { Router } from 'express';
import { getDb } from '../db/database.ts';
import { getDailyChallenge, getLeaderboardByRange } from '../services/leaderboardService.ts';
import { getUserProfile, updateNickname } from '../services/scoreService.ts';
import { CATEGORIES } from '../shared/types.ts';
import { attachUserMiddleware, sendApiError } from './middleware.ts';

export const userRouter = Router();

userRouter.get('/meta', (_req, res) => {
  const db = getDb();
  const rows = db
    .prepare('SELECT category, COUNT(*) as cnt FROM candidates WHERE verified = 1 GROUP BY category')
    .all() as Array<{ category: string; cnt: number }>;
  const countMap: Record<string, number> = {};
  for (const r of rows) countMap[r.category] = r.cnt;
  countMap['number'] = 1000;
  countMap['dob'] = 366;

  const totalCandidates = rows.reduce((acc, r) => acc + r.cnt, 0);
  return res.json({
    categories: CATEGORIES.map((c) => ({
      ...c,
      poolCount: countMap[c.id] ?? 0,
    })),
    totalVerifiedCandidates: totalCandidates,
    dailyChallenge: getDailyChallenge(),
  });
});

userRouter.get('/daily', (_req, res) => {
  return res.json(getDailyChallenge());
});

userRouter.get('/profile', attachUserMiddleware, (req, res) => {
  try {
    const profile = getUserProfile(req.user!.id);
    return res.json(profile);
  } catch (err) {
    return sendApiError(res, 500, 'PROFILE_FAILED', err instanceof Error ? err.message : 'Unable to load profile.');
  }
});

userRouter.post('/profile/nickname', attachUserMiddleware, (req, res) => {
  try {
    const nickname = String(req.body?.nickname || '').trim();
    if (nickname.length < 2 || nickname.length > 24) {
      return sendApiError(res, 400, 'INVALID_NICKNAME', 'Nickname must be between 2 and 24 characters.');
    }
    const updated = updateNickname(req.user!.id, nickname);
    return res.json({ nickname: updated.nickname });
  } catch (err) {
    return sendApiError(res, 400, 'NICKNAME_UPDATE_FAILED', err instanceof Error ? err.message : 'Failed to update nickname.');
  }
});

userRouter.get('/leaderboard', attachUserMiddleware, (req, res) => {
  try {
    const rawRange = String(req.query.range || 'all').toLowerCase();
    const range: 'daily' | 'weekly' | 'all' =
      rawRange === 'daily' ? 'daily' : rawRange === 'weekly' ? 'weekly' : 'all';
    const entries = getLeaderboardByRange(range, req.user!.id);
    return res.json({ range, entries });
  } catch (err) {
    return sendApiError(res, 500, 'LEADERBOARD_FAILED', err instanceof Error ? err.message : 'Unable to load leaderboard.');
  }
});
