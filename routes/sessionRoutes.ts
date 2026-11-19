import { Router } from 'express';
import { GeminiClientError } from '../ai/geminiClient.ts';
import { CATEGORIES, type CategoryId, type GameMode } from '../shared/types.ts';
import {
  answerSessionQuestion,
  revealSession,
  startBonusRound,
  startSession,
  submitSessionClue,
  submitSessionFeedback,
} from '../services/gameEngine.ts';
import { attachUserMiddleware, sendApiError } from './middleware.ts';

const VALID_CATEGORIES = new Set<string>(CATEGORIES.map((c) => c.id));
const VALID_MODES = new Set<string>([
  'mind_reader',
  'surprise_me',
  'number_reader',
  'double_challenge',
  'ultimate_challenge',
  'daily_challenge',
]);

export const sessionRouter = Router();
sessionRouter.use(attachUserMiddleware);

sessionRouter.post('/start', async (req, res) => {
  try {
    const mode = (req.body?.mode || 'mind_reader') as GameMode;
    const category = req.body?.category as CategoryId | undefined;
    const industry = typeof req.body?.industry === 'string' ? req.body.industry.trim() : null;
    const useAiWording = req.body?.useAiWording !== false;
    const simulateAiError = req.body?.simulateAiError ?? null;

    if (!VALID_MODES.has(mode)) {
      return sendApiError(res, 400, 'INVALID_MODE', 'Unsupported game mode.');
    }
    if (category && !VALID_CATEGORIES.has(category)) {
      return sendApiError(res, 400, 'INVALID_CATEGORY', 'Unsupported category selected.');
    }

    const result = await startSession({
      userId: req.user!.id,
      mode,
      category,
      industry,
      useAiWording,
      simulateAiError,
    });
    return res.json(result);
  } catch (err) {
    if (err instanceof GeminiClientError) {
      return sendApiError(res, 503, err.code, err.message, true);
    }
    return sendApiError(res, 400, 'START_SESSION_FAILED', err instanceof Error ? err.message : 'Unable to start session.');
  }
});

sessionRouter.post('/answer', async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    const answerValue = String(req.body?.answerValue || '').trim();
    const useAiWording = req.body?.useAiWording !== false;
    const simulateAiError = req.body?.simulateAiError ?? null;

    if (!sessionId || !answerValue) {
      return sendApiError(res, 400, 'INVALID_INPUT', 'sessionId and answerValue are required.');
    }

    const result = await answerSessionQuestion({
      sessionId,
      userId: req.user!.id,
      answerValue,
      useAiWording,
      simulateAiError,
    });
    return res.json(result);
  } catch (err) {
    if (err instanceof GeminiClientError) {
      return sendApiError(res, 503, err.code, err.message, true);
    }
    return sendApiError(res, 400, 'ANSWER_FAILED', err instanceof Error ? err.message : 'Unable to record answer.');
  }
});

sessionRouter.post('/clue', async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    const clueText = typeof req.body?.clueText === 'string' ? req.body.clueText : '';
    const skip = Boolean(req.body?.skip);
    const simulateAiError = req.body?.simulateAiError ?? null;

    if (!sessionId) {
      return sendApiError(res, 400, 'INVALID_INPUT', 'sessionId is required.');
    }

    const result = await submitSessionClue({
      sessionId,
      userId: req.user!.id,
      clueText,
      skip,
      simulateAiError,
    });
    return res.json(result);
  } catch (err) {
    if (err instanceof GeminiClientError) {
      return sendApiError(res, 503, err.code, err.message, true);
    }
    return sendApiError(res, 400, 'CLUE_FAILED', err instanceof Error ? err.message : 'Unable to process clue.');
  }
});

sessionRouter.post('/reveal', async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    const useAiExplanation = req.body?.useAiExplanation !== false;
    const simulateAiError = req.body?.simulateAiError ?? null;

    if (!sessionId) {
      return sendApiError(res, 400, 'INVALID_INPUT', 'sessionId is required.');
    }

    const result = await revealSession({
      sessionId,
      userId: req.user!.id,
      useAiExplanation,
      simulateAiError,
    });
    return res.json(result);
  } catch (err) {
    if (err instanceof GeminiClientError) {
      return sendApiError(res, 503, err.code, err.message, true);
    }
    return sendApiError(res, 400, 'REVEAL_FAILED', err instanceof Error ? err.message : 'Unable to reveal result.');
  }
});

sessionRouter.post('/bonus', async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    const useAiWording = req.body?.useAiWording !== false;
    if (!sessionId) {
      return sendApiError(res, 400, 'INVALID_INPUT', 'sessionId is required.');
    }
    const result = await startBonusRound({
      sessionId,
      userId: req.user!.id,
      useAiWording,
    });
    return res.json(result);
  } catch (err) {
    return sendApiError(res, 400, 'BONUS_FAILED', err instanceof Error ? err.message : 'Unable to start bonus round.');
  }
});

sessionRouter.post('/feedback', (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || '').trim();
    const wasCorrect = Boolean(req.body?.wasCorrect);
    const correctAnswerName =
      typeof req.body?.correctAnswerName === 'string' ? req.body.correctAnswerName : undefined;
    const selectedRunnerUpId =
      typeof req.body?.selectedRunnerUpId === 'string' ? req.body.selectedRunnerUpId : undefined;
    const notes = typeof req.body?.notes === 'string' ? req.body.notes : undefined;

    if (!sessionId || typeof req.body?.wasCorrect !== 'boolean') {
      return sendApiError(res, 400, 'INVALID_INPUT', 'sessionId and boolean wasCorrect are required.');
    }

    // Notice: any client-supplied points/score fields are strictly ignored.
    const result = submitSessionFeedback({
      sessionId,
      userId: req.user!.id,
      wasCorrect,
      correctAnswerName,
      selectedRunnerUpId,
      notes,
    });
    return res.json(result);
  } catch (err) {
    return sendApiError(res, 400, 'FEEDBACK_FAILED', err instanceof Error ? err.message : 'Unable to record feedback.');
  }
});
