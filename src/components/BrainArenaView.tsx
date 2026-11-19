import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Clock,
  Cpu,
  ExternalLink,
  FlaskConical,
  Globe,
  Landmark,
  Lightbulb,
  RefreshCw,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  RIDDLE_CATEGORIES,
  RIDDLE_DIFFICULTIES,
  type RiddleCategory,
  type RiddleDifficulty,
  type RiddleItem,
} from '../../shared/types.ts';
import { api, ApiError, type SubmitRiddleResponse } from '../lib/api.ts';
import { soundEngine } from '../lib/sound.ts';

interface BrainArenaViewProps {
  initialCategory?: RiddleCategory;
  onStatsChanged: () => void;
}

const CAT_ICONS: Record<RiddleCategory, typeof Brain> = {
  'Politics and Governance': Landmark,
  Society: Users,
  Technology: Cpu,
  'Innovation and Science': FlaskConical,
  'General Knowledge': Globe,
};

export function BrainArenaView({ initialCategory = 'Technology', onStatsChanged }: BrainArenaViewProps) {
  const [category, setCategory] = useState<RiddleCategory>(initialCategory);
  const [difficulty, setDifficulty] = useState<RiddleDifficulty>('Easy');
  const [preferFreshAi, setPreferFreshAi] = useState(false);

  const [riddle, setRiddle] = useState<RiddleItem | null>(null);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hintText, setHintText] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(30);
  const [result, setResult] = useState<SubmitRiddleResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);

  async function loadRiddle(cat = category, diff = difficulty, fresh = preferFreshAi) {
    setLoading(true);
    setErrorMsg(null);
    setResult(null);
    setSelectedIdx(null);
    setHintText(null);
    submittedRef.current = false;

    try {
      const res = await api.getNextRiddle(cat, diff, fresh);
      setRiddle(res.riddle);
      setAiGenerated(res.aiGenerated);
      setTimeLeft(res.riddle.timeLimitSec);
      soundEngine.playTap();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Unable to load riddle. Please retry.');
    } finally {
      setLoading(false);
    }
  }

  // Countdown timer synced to current active riddle
  useEffect(() => {
    if (!riddle || result || loading) return;
    if (timeLeft <= 0) {
      if (!submittedRef.current) {
        void handleSubmit(null);
      }
      return;
    }

    const timer = setTimeout(() => {
      const next = timeLeft - 1;
      setTimeLeft(next);
      if (next > 0 && next <= 5) {
        soundEngine.playTick();
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [riddle, result, loading, timeLeft]);

  async function handleRequestHint() {
    if (!riddle || hintText || result) return;
    try {
      const res = await api.requestRiddleHint(riddle.attemptToken);
      setHintText(res.hint);
      soundEngine.playTap();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Unable to reveal hint.');
    }
  }

  async function handleSubmit(overrideIndex?: number | null) {
    if (!riddle || result || submitting || submittedRef.current) return;
    const finalIdx = overrideIndex !== undefined ? overrideIndex : selectedIdx;
    if (overrideIndex === undefined && finalIdx === null) return;

    submittedRef.current = true;
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await api.submitRiddle(riddle.attemptToken, finalIdx);
      setResult(res);
      if (res.isCorrect) {
        soundEngine.playSuccess();
      } else {
        soundEngine.playMiss();
      }
      onStatsChanged();
    } catch (err) {
      submittedRef.current = false;
      setErrorMsg(err instanceof ApiError ? err.message : 'Unable to submit your answer. Please retry.');
    } finally {
      setSubmitting(false);
    }
  }

  const timerPct = riddle ? Math.max(0, Math.min(100, (timeLeft / riddle.timeLimitSec) * 100)) : 100;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header & Controls */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl dark:text-white">
              Brain Arena
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Dual-verified riddles and factual quizzes with server-timed scoring and streak multipliers.
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={preferFreshAi}
              onChange={(e) => setPreferFreshAi(e.target.checked)}
              className="h-4 w-4 rounded accent-[#7C3AED]"
            />
            <span>Generate fresh Gemini dual-verified riddle</span>
          </label>
        </div>

        {/* 5 Category Selector Buttons */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {RIDDLE_CATEGORIES.map((cat) => {
            const Icon = CAT_ICONS[cat];
            const active = category === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setCategory(cat);
                  if (riddle) void loadRiddle(cat, difficulty, preferFreshAi);
                }}
                className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-xs font-semibold transition-all ${
                  active
                    ? 'border-[#7C3AED] bg-[#7C3AED]/12 text-[#7C3AED] dark:border-[#38BDF8] dark:bg-[#38BDF8]/12 dark:text-[#38BDF8]'
                    : 'border-slate-200 bg-white/70 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:bg-[#0F1630]/70 dark:text-slate-200 dark:hover:bg-white/5'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="line-clamp-2 leading-tight">{cat}</span>
              </button>
            );
          })}
        </div>

        {/* Difficulty Selector + Launch */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/75 p-1 dark:border-white/10 dark:bg-[#0F1630]/80">
            {RIDDLE_DIFFICULTIES.map((d) => {
              const active = difficulty === d.level;
              return (
                <button
                  key={d.level}
                  type="button"
                  onClick={() => {
                    setDifficulty(d.level);
                    if (riddle) void loadRiddle(category, d.level, preferFreshAi);
                  }}
                  className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-[#7C3AED] text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  {d.level} · {d.timeLimitSec}s
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={() => void loadRiddle(category, difficulty, preferFreshAi)}
            className="mm-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            <span>{loading ? 'Verifying Riddle...' : riddle ? 'New Riddle' : 'Start Challenge'}</span>
          </button>
        </div>
      </div>

      {/* Error State with Retry */}
      {errorMsg && (
        <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-[#F43F5E]/40 bg-[#F43F5E]/10 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-sm text-[#BE123C] dark:text-[#FDA4AF]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadRiddle(category, difficulty, preferFreshAi)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#F43F5E] px-3.5 py-2 text-xs font-semibold text-white whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Active Riddle Stage */}
      {!riddle && !loading && (
        <div className="mm-glass flex min-h-[280px] flex-col items-center justify-center rounded-3xl p-8 text-center">
          <Brain className="h-10 w-10 text-[#7C3AED] dark:text-[#38BDF8]" />
          <h3 className="mt-4 font-display text-xl font-bold text-slate-900 dark:text-white">
            Ready for {category} ({difficulty})?
          </h3>
          <p className="mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
            Every question is verified for a single unambiguous answer. Answer fast for up to +50% speed bonus and build a streak.
          </p>
          <button
            type="button"
            onClick={() => void loadRiddle(category, difficulty, preferFreshAi)}
            className="mm-btn-primary mt-6 rounded-xl px-6 py-3 text-sm font-bold"
          >
            Launch First Question
          </button>
        </div>
      )}

      {riddle && (
        <div className="mm-glass rounded-3xl p-5 sm:p-8">
          {/* Metadata + Countdown Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-[#7C3AED] dark:text-[#38BDF8]">{riddle.category}</span>
              <span aria-hidden="true">·</span>
              <span>{riddle.difficulty}</span>
              <span aria-hidden="true">·</span>
              <span>{riddle.basePoints} base pts</span>
              {riddle.asOfDate && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">As of {riddle.asOfDate}</span>
                </>
              )}
              {aiGenerated && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Fresh Dual-Verified</span>
                </>
              )}
            </div>

            <div
              className={`inline-flex items-center gap-1.5 font-mono text-sm font-bold tabular-nums ${
                timeLeft <= 5 && !result
                  ? 'text-[#F43F5E]'
                  : 'text-slate-800 dark:text-slate-100'
              }`}
            >
              <Clock className="h-4 w-4" />
              <span>{result ? `${result.elapsedSec}s` : `${timeLeft}s`}</span>
            </div>
          </div>

          {/* Timer Bar */}
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-1000 ease-linear"
              style={{
                width: `${result ? 100 : timerPct}%`,
                background:
                  timeLeft <= 5 && !result
                    ? '#F43F5E'
                    : 'linear-gradient(90deg, #7C3AED 0%, #38BDF8 100%)',
              }}
            />
          </div>

          {/* Question Text */}
          <h3 className="mt-6 font-display text-lg font-bold leading-relaxed text-slate-900 sm:text-2xl dark:text-white">
            {riddle.question}
          </h3>

          {/* Hint Box */}
          {hintText && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:text-amber-200">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <span className="font-semibold">Hint (-30% score): </span>
                <span>{hintText}</span>
              </div>
            </div>
          )}

          {/* 4 Options */}
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {riddle.options.map((opt, idx) => {
              const isSelected = selectedIdx === idx;
              const isCorrectOption = result && result.correctIndex === idx;
              const isWrongSelected = result && isSelected && !result.isCorrect;

              let styleClass =
                'border-slate-200 bg-white/80 text-slate-900 hover:border-[#7C3AED] dark:border-white/12 dark:bg-white/[0.04] dark:text-white dark:hover:border-[#38BDF8]';
              if (result) {
                if (isCorrectOption) {
                  styleClass =
                    'border-[#22C55E] bg-[#22C55E]/15 text-[#15803D] dark:text-[#86EFAC]';
                } else if (isWrongSelected) {
                  styleClass =
                    'border-[#F43F5E] bg-[#F43F5E]/15 text-[#BE123C] dark:text-[#FDA4AF]';
                } else {
                  styleClass = 'border-slate-200/60 bg-transparent text-slate-400 dark:border-white/5 dark:text-slate-500';
                }
              } else if (isSelected) {
                styleClass =
                  'border-[#7C3AED] bg-[#7C3AED]/15 text-slate-950 ring-2 ring-[#7C3AED]/30 dark:border-[#38BDF8] dark:bg-[#38BDF8]/15 dark:text-white dark:ring-[#38BDF8]/25';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={Boolean(result) || submitting}
                  onClick={() => {
                    soundEngine.playTap();
                    setSelectedIdx(idx);
                  }}
                  className={`flex min-h-[54px] items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all ${styleClass}`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-200/80 font-mono text-xs font-bold text-slate-700 dark:bg-white/10 dark:text-slate-200">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="flex-1">{opt}</span>
                </button>
              );
            })}
          </div>

          {/* Action Row Before Submission */}
          {!result && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={Boolean(hintText) || submitting}
                onClick={handleRequestHint}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-45 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5"
              >
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <span>{hintText ? 'Hint Revealed' : 'Use Hint (-30%)'}</span>
              </button>

              <button
                type="button"
                disabled={selectedIdx === null || submitting}
                onClick={() => void handleSubmit()}
                className="mm-btn-primary rounded-xl px-6 py-2.5 text-sm font-bold disabled:opacity-50"
              >
                {submitting ? 'Checking...' : 'Submit Answer'}
              </button>
            </div>
          )}

          {/* Server-Verified Result & Explanation */}
          {result && (
            <div className="mt-6 space-y-4 border-t border-slate-200/80 pt-5 dark:border-white/10">
              <div
                className={`flex flex-col items-start justify-between gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center ${
                  result.isCorrect
                    ? 'border-[#22C55E]/35 bg-[#22C55E]/10'
                    : 'border-[#F43F5E]/35 bg-[#F43F5E]/10'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {result.isCorrect ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#22C55E]" />
                  ) : (
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#F43F5E]" />
                  )}
                  <div>
                    <p
                      className={`font-display text-sm font-bold ${
                        result.isCorrect
                          ? 'text-[#15803D] dark:text-[#4ADE80]'
                          : 'text-[#BE123C] dark:text-[#FDA4AF]'
                      }`}
                    >
                      {result.timedOut
                        ? 'Time expired — 0 points'
                        : result.isCorrect
                        ? `Correct! +${result.pointsAwarded} points · Streak ${result.riddleStreak}`
                        : 'Incorrect — Streak reset'}
                    </p>
                    {result.isCorrect && (
                      <p className="mt-0.5 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-300">
                        Base {result.breakdown.basePoints} + Speed {result.breakdown.timeBonus}
                        {result.breakdown.hintPenalty > 0 ? ` − Hint ${result.breakdown.hintPenalty}` : ''} + Streak{' '}
                        {result.breakdown.streakBonus}
                      </p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void loadRiddle(category, difficulty, preferFreshAi)}
                  className="mm-btn-primary inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-bold whitespace-nowrap shrink-0"
                >
                  <span>Next Riddle</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">{result.explanation}</p>

              {/* Grounded Sources (for Politics & Governance / Current Affairs) */}
              {riddle.sources && riddle.sources.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium">Sources:</span>
                  {riddle.sources.map((src, i) => (
                    <a
                      key={i}
                      href={src.uri}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[#7C3AED] hover:underline dark:text-[#38BDF8]"
                    >
                      <span>{src.title}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
