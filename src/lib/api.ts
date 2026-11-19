import type {
  ActiveQuestion,
  AnswerLogEntry,
  CategoryId,
  CategoryMeta,
  ConfidenceLabel,
  GameMode,
  LeaderboardEntry,
  RevealPayload,
  RiddleCategory,
  RiddleDifficulty,
  RiddleItem,
  UserProfile,
} from '../../shared/types.ts';

const TOKEN_STORAGE_KEY = 'mm_device_token_v1';

export function getDeviceToken(): string {
  try {
    let token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token || token.length < 8) {
      const rand =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `mm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
      token = rand;
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }
    return token;
  } catch {
    return 'mm_ephemeral_token_fallback';
  }
}

export class ApiError extends Error {
  code: string;
  retryable: boolean;
  status: number;
  constructor(message: string, code: string, status: number, retryable = false) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('X-Device-Token', getDeviceToken());
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(path, { ...options, headers });
  } catch {
    throw new ApiError(
      'Unable to reach the MINDMYSTERY server. Check your connection and retry.',
      'NETWORK_ERROR',
      0,
      true
    );
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    throw new ApiError('Unexpected response from server. Please retry.', 'INVALID_RESPONSE', res.status, true);
  }

  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(
      err?.message || 'Request failed. Please try again.',
      err?.code || 'API_ERROR',
      res.status,
      Boolean(err?.retryable || res.status >= 500)
    );
  }

  return data as T;
}

export interface MetaResponse {
  categories: Array<CategoryMeta & { poolCount: number }>;
  totalVerifiedCandidates: number;
  dailyChallenge: {
    date: string;
    category: CategoryId;
    categoryName: string;
    industry: string | null;
    title: string;
    prompt: string;
    bonusPoints: number;
  };
}

export interface StartSessionResponse {
  sessionId: string;
  mode: GameMode;
  category: CategoryId;
  categoryName: string;
  industry: string | null;
  poolSize: number;
  isDeterministic: boolean;
  readyToReveal: boolean;
  question: ActiveQuestion | null;
}

export interface AnswerSessionResponse {
  sessionId: string;
  readyToReveal: boolean;
  question: ActiveQuestion | null;
  history: AnswerLogEntry[];
  candidatesRemaining: number;
  topScorePct: number;
  confidencePct: number;
  confidenceLabel: ConfidenceLabel;
  rangeMin?: number;
  rangeMax?: number;
}

export interface ClueResponse {
  sessionId: string;
  readyToReveal: boolean;
  appliedFilters: Array<{ attributeKey: string; value: string }>;
  candidatesRemaining?: number;
  topScorePct?: number;
  confidencePct?: number;
  aiFallback?: boolean;
  aiError?: string;
}

export interface FeedbackResponse {
  alreadyRecorded: boolean;
  pointsAwarded: number;
  newBadges: string[];
  savedCorrection: boolean;
}

export interface NextRiddleResponse {
  riddle: RiddleItem;
  aiGenerated: boolean;
  aiFallback?: boolean;
  aiError?: string;
}

export interface SubmitRiddleResponse {
  isCorrect: boolean;
  timedOut: boolean;
  elapsedSec: number;
  correctIndex: number;
  explanation: string;
  pointsAwarded: number;
  breakdown: {
    basePoints: number;
    timeBonus: number;
    hintPenalty: number;
    streakBonus: number;
  };
  riddleStreak: number;
  totalPoints: number;
  newBadges: string[];
}

export const api = {
  getMeta: () => apiFetch<MetaResponse>('/api/meta'),
  getProfile: () => apiFetch<UserProfile>('/api/profile'),
  updateNickname: (nickname: string) =>
    apiFetch<{ nickname: string }>('/api/profile/nickname', {
      method: 'POST',
      body: JSON.stringify({ nickname }),
    }),
  getLeaderboard: (range: 'daily' | 'weekly' | 'all') =>
    apiFetch<{ range: string; entries: LeaderboardEntry[] }>(`/api/leaderboard?range=${range}`),

  startSession: (payload: { mode: GameMode; category?: CategoryId; industry?: string | null }) =>
    apiFetch<StartSessionResponse>('/api/session/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  answerSession: (payload: { sessionId: string; answerValue: string }) =>
    apiFetch<AnswerSessionResponse>('/api/session/answer', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  submitClue: (payload: { sessionId: string; clueText: string; skip?: boolean }) =>
    apiFetch<ClueResponse>('/api/session/clue', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  revealSession: (payload: { sessionId: string }) =>
    apiFetch<RevealPayload>('/api/session/reveal', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  startBonus: (payload: { sessionId: string }) =>
    apiFetch<{ sessionId: string; readyToReveal: boolean; question: ActiveQuestion | null }>('/api/session/bonus', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  submitFeedback: (payload: {
    sessionId: string;
    wasCorrect: boolean;
    correctAnswerName?: string;
    selectedRunnerUpId?: string;
    notes?: string;
  }) =>
    apiFetch<FeedbackResponse>('/api/session/feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getNextRiddle: (category: RiddleCategory, difficulty: RiddleDifficulty, fresh = false) =>
    apiFetch<NextRiddleResponse>(
      `/api/riddle/next?category=${encodeURIComponent(category)}&difficulty=${encodeURIComponent(difficulty)}&fresh=${
        fresh ? 'true' : 'false'
      }`
    ),

  requestRiddleHint: (attemptToken: string) =>
    apiFetch<{ hint: string; penaltyPct: number }>('/api/riddle/hint', {
      method: 'POST',
      body: JSON.stringify({ attemptToken }),
    }),

  submitRiddle: (attemptToken: string, selectedIndex: number | null) =>
    apiFetch<SubmitRiddleResponse>('/api/riddle/submit', {
      method: 'POST',
      body: JSON.stringify({ attemptToken, selectedIndex }),
    }),
};
