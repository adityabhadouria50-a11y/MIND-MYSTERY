import { Router } from 'express';
import { GeminiClientError } from '../ai/geminiClient.ts';
import { RIDDLE_CATEGORIES, type RiddleCategory, type RiddleDifficulty } from '../shared/types.ts';
import { getNextRiddle, requestRiddleHint, submitRiddleAnswer } from '../services/riddleService.ts';
import { attachUserMiddleware, sendApiError } from './middleware.ts';

const VALID_CATS = new Set<string>(RIDDLE_CATEGORIES);
const VALID_DIFFS = new Set<string>(['Easy', 'Medium', 'Hard']);

export const riddleRouter = Router();
riddleRouter.use(attachUserMiddleware);

riddleRouter.get('/next', async (req, res) => {
  try {
    const category = String(req.query.category || 'General Knowledge') as RiddleCategory;
    const difficulty = String(req.query.difficulty || 'Easy') as RiddleDifficulty;
    const preferAiFresh = req.query.fresh === 'true';
    const simulateAiError = (req.query.simulateAiError as 'timeout' | 'invalid_json' | 'api_error' | undefined) ?? null;

    if (!VALID_CATS.has(category)) {
      return sendApiError(res, 400, 'INVALID_RIDDLE_CATEGORY', 'Invalid Brain Arena category.');
    }
    if (!VALID_DIFFS.has(difficulty)) {
      return sendApiError(res, 400, 'INVALID_DIFFICULTY', 'Difficulty must be Easy, Medium, or Hard.');
    }

    const result = await getNextRiddle({
      userId: req.user!.id,
      category,
      difficulty,
      preferAiFresh,
      simulateAiError,
    });
    return res.json(result);
  } catch (err) {
    if (err instanceof GeminiClientError) {
      return sendApiError(res, 503, err.code, err.message, true);
    }
    return sendApiError(res, 400, 'RIDDLE_FETCH_FAILED', err instanceof Error ? err.message : 'Unable to fetch riddle.', true);
  }
});

riddleRouter.post('/hint', (req, res) => {
  try {
    const attemptToken = String(req.body?.attemptToken || '').trim();
    if (!attemptToken) {
      return sendApiError(res, 400, 'INVALID_INPUT', 'attemptToken is required.');
    }
    const result = requestRiddleHint({
      userId: req.user!.id,
      attemptToken,
    });
    return res.json(result);
  } catch (err) {
    return sendApiError(res, 400, 'HINT_FAILED', err instanceof Error ? err.message : 'Unable to unlock hint.');
  }
});

riddleRouter.post('/submit', (req, res) => {
  try {
    const attemptToken = String(req.body?.attemptToken || '').trim();
    const rawIdx = req.body?.selectedIndex;
    const selectedIndex =
      rawIdx === null || rawIdx === undefined ? null : Number.isInteger(Number(rawIdx)) ? Number(rawIdx) : NaN;

    if (!attemptToken) {
      return sendApiError(res, 400, 'INVALID_INPUT', 'attemptToken is required.');
    }
    if (selectedIndex !== null && (Number.isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex > 3)) {
      return sendApiError(res, 400, 'INVALID_OPTION', 'selectedIndex must be 0–3 or null for timeout.');
    }

    // Strictly server-authoritative: browser never supplies score or elapsed timer.
    const result = submitRiddleAnswer({
      userId: req.user!.id,
      attemptToken,
      selectedIndex,
    });
    return res.json(result);
  } catch (err) {
    return sendApiError(res, 400, 'RIDDLE_SUBMIT_FAILED', err instanceof Error ? err.message : 'Unable to submit answer.');
  }
});
