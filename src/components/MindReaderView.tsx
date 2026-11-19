import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Dice5,
  Hash,
  Layers,
  RefreshCw,
  Send,
  Sparkles,
  Target,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import {
  CATEGORIES,
  type ActiveQuestion,
  type AnswerLogEntry,
  type CategoryId,
  type GameMode,
  type RevealPayload,
} from '../../shared/types.ts';
import { api, ApiError, type FeedbackResponse } from '../lib/api.ts';
import { soundEngine } from '../lib/sound.ts';
import { CategoryIcon } from './CategoryIcon.tsx';
import { RevealCard } from './RevealCard.tsx';
import { ThinkingOrb } from './ThinkingOrb.tsx';

interface MindReaderViewProps {
  initialMode?: GameMode;
  initialCategory?: CategoryId | null;
  initialIndustry?: string | null;
  onStatsChanged: () => void;
}

interface RoundSummary {
  roundNumber: number;
  categoryName: string;
  industry: string | null;
  predictedName: string;
  confidencePct: number;
  wasCorrect: boolean;
  pointsAwarded: number;
}

const ULTIMATE_PRESETS: Array<{ category: CategoryId; industry: string | null }> = [
  { category: 'movie', industry: 'Hollywood' },
  { category: 'animal', industry: null },
  { category: 'place', industry: null },
];

export function MindReaderView({
  initialMode = 'mind_reader',
  initialCategory = null,
  initialIndustry = null,
  onStatsChanged,
}: MindReaderViewProps) {
  const [mode, setMode] = useState<GameMode>(initialMode);
  const [phase, setPhase] = useState<
    'select_category' | 'select_sub' | 'surprise_spin' | 'playing' | 'reveal' | 'multi_summary'
  >('select_category');

  const [selectedCategory, setSelectedCategory] = useState<CategoryId | null>(initialCategory);
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(initialIndustry);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [poolSize, setPoolSize] = useState<number>(0);
  const [activeQuestion, setActiveQuestion] = useState<ActiveQuestion | null>(null);
  const [history, setHistory] = useState<AnswerLogEntry[]>([]);
  const [reveal, setReveal] = useState<RevealPayload | null>(null);
  const [clueInput, setClueInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [orbPulse, setOrbPulse] = useState(false);
  const [errorBanner, setErrorBanner] = useState<{ message: string; retryAction: () => void } | null>(null);
  const [spinLabel, setSpinLabel] = useState('Scanning neural pools...');

  // Multi-round state (Double = 2 rounds, Ultimate = 3 rounds)
  const totalRounds = mode === 'double_challenge' ? 2 : mode === 'ultimate_challenge' ? 3 : 1;
  const [currentRound, setCurrentRound] = useState(1);
  const [roundResults, setRoundResults] = useState<RoundSummary[]>([]);

  const categoryMeta = useMemo(
    () => CATEGORIES.find((c) => c.id === selectedCategory) ?? null,
    [selectedCategory]
  );

  // Sync external navigation triggers (e.g. clicking a category card or Daily Challenge on Home)
  useEffect(() => {
    setMode(initialMode);
    setRoundResults([]);
    setCurrentRound(1);
    setErrorBanner(null);

    if (initialMode === 'surprise_me') {
      launchSurpriseFlow();
      return;
    }
    if (initialMode === 'number_reader') {
      setSelectedCategory('number');
      setSelectedIndustry(null);
      setPhase('select_sub');
      return;
    }
    if (initialMode === 'ultimate_challenge') {
      const first = ULTIMATE_PRESETS[0];
      void startNewSession('ultimate_challenge', first.category, first.industry);
      return;
    }
    if (initialCategory) {
      const meta = CATEGORIES.find((c) => c.id === initialCategory);
      setSelectedCategory(initialCategory);
      if (initialIndustry || !meta?.subOptions?.length) {
        void startNewSession(initialMode, initialCategory, initialIndustry ?? null);
      } else {
        setPhase('select_sub');
      }
    } else {
      setSelectedCategory(null);
      setSelectedIndustry(null);
      setPhase('select_category');
    }
  }, [initialMode, initialCategory, initialIndustry]);

  function launchSurpriseFlow() {
    setPhase('surprise_spin');
    const labels = [
      'Scanning Cinema & Series...',
      'Checking World Destinations...',
      'Probing Music Archives...',
      'Locking Secret Category...',
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % labels.length;
      setSpinLabel(labels[i]);
    }, 340);

    setTimeout(() => {
      clearInterval(interval);
      void startNewSession('surprise_me', undefined, null);
    }, 1500);
  }

  async function startNewSession(targetMode: GameMode, cat?: CategoryId, ind?: string | null) {
    setLoading(true);
    setErrorBanner(null);
    setReveal(null);
    setHistory([]);
    setClueInput('');

    try {
      const res = await api.startSession({
        mode: targetMode,
        category: cat,
        industry: ind ?? null,
      });
      setSessionId(res.sessionId);
      setSelectedCategory(res.category);
      setSelectedIndustry(res.industry);
      setPoolSize(res.poolSize);
      setActiveQuestion(res.question);
      setPhase('playing');
      soundEngine.playTap();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Unable to start session. Please retry.';
      setErrorBanner({
        message: msg,
        retryAction: () => void startNewSession(targetMode, cat, ind),
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectAnswer(answerValue: string) {
    if (!sessionId || loading) return;
    setLoading(true);
    setErrorBanner(null);
    setOrbPulse(true);
    soundEngine.playTap();
    setTimeout(() => setOrbPulse(false), 500);

    try {
      const res = await api.answerSession({ sessionId, answerValue });
      setHistory(res.history);
      if (res.readyToReveal || !res.question) {
        await triggerReveal(sessionId);
      } else {
        setActiveQuestion(res.question);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Connection hiccup. Your progress is safe — tap Retry.';
      setErrorBanner({
        message: msg,
        retryAction: () => void handleSelectAnswer(answerValue),
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitClue(skip = false) {
    if (!sessionId || loading) return;
    setLoading(true);
    setErrorBanner(null);
    soundEngine.playTap();

    try {
      await api.submitClue({
        sessionId,
        clueText: skip ? '' : clueInput.trim(),
        skip,
      });
      await triggerReveal(sessionId);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'AI could not process your hint. Retry or skip straight to reveal.';
      setErrorBanner({
        message: msg,
        retryAction: () => void handleSubmitClue(skip),
      });
    } finally {
      setLoading(false);
    }
  }

  async function triggerReveal(sid: string) {
    setLoading(true);
    setErrorBanner(null);
    try {
      const rev = await api.revealSession({ sessionId: sid });
      setReveal(rev);
      setPhase('reveal');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to build reveal card. Your answers are saved — retry now.';
      setErrorBanner({
        message: msg,
        retryAction: () => void triggerReveal(sid),
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleBonusRound() {
    if (!sessionId || loading) return;
    setLoading(true);
    setErrorBanner(null);
    try {
      const res = await api.startBonus({ sessionId });
      if (res.readyToReveal || !res.question) {
        await triggerReveal(sessionId);
      } else {
        setActiveQuestion(res.question);
        setReveal(null);
        setPhase('playing');
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Unable to start bonus questions.';
      setErrorBanner({
        message: msg,
        retryAction: () => void handleBonusRound(),
      });
    } finally {
      setLoading(false);
    }
  }

  function handleFeedbackRecorded(wasCorrect: boolean, res: FeedbackResponse) {
    onStatsChanged();
    if (totalRounds > 1 && reveal) {
      setRoundResults((prev) => [
        ...prev,
        {
          roundNumber: currentRound,
          categoryName: categoryMeta?.name || reveal.category,
          industry: reveal.industry,
          predictedName: reveal.topCandidate.name,
          confidencePct: reveal.confidencePct,
          wasCorrect,
          pointsAwarded: res.pointsAwarded,
        },
      ]);
    }
  }

  function handleNextOrReplay() {
    if (totalRounds > 1 && currentRound < totalRounds) {
      const nextRound = currentRound + 1;
      setCurrentRound(nextRound);
      if (mode === 'ultimate_challenge') {
        const preset = ULTIMATE_PRESETS[nextRound - 1];
        void startNewSession('ultimate_challenge', preset.category, preset.industry);
      } else {
        // Double Mind Challenge lets user pick Round 2 category!
        setSelectedCategory(null);
        setSelectedIndustry(null);
        setPhase('select_category');
      }
      return;
    }

    if (totalRounds > 1 && roundResults.length >= totalRounds) {
      setPhase('multi_summary');
      return;
    }

    if (mode === 'surprise_me') {
      launchSurpriseFlow();
      return;
    }
    if (mode === 'number_reader') {
      setSelectedCategory('number');
      setPhase('select_sub');
      return;
    }
    setPhase('select_category');
    setSelectedCategory(null);
    setSelectedIndustry(null);
    setReveal(null);
  }

  function switchMode(nextMode: GameMode) {
    setMode(nextMode);
    setRoundResults([]);
    setCurrentRound(1);
    setReveal(null);
    setErrorBanner(null);

    if (nextMode === 'surprise_me') {
      launchSurpriseFlow();
    } else if (nextMode === 'number_reader') {
      setSelectedCategory('number');
      setSelectedIndustry(null);
      setPhase('select_sub');
    } else if (nextMode === 'ultimate_challenge') {
      const first = ULTIMATE_PRESETS[0];
      void startNewSession('ultimate_challenge', first.category, first.industry);
    } else {
      setSelectedCategory(null);
      setSelectedIndustry(null);
      setPhase('select_category');
    }
  }

  const modeTabs: Array<{ id: GameMode; label: string; icon: typeof Sparkles }> = [
    { id: 'mind_reader', label: 'Mind Reader', icon: Sparkles },
    { id: 'surprise_me', label: 'Surprise Me', icon: Dice5 },
    { id: 'number_reader', label: 'Number Reader', icon: Hash },
    { id: 'double_challenge', label: 'Double Challenge', icon: Layers },
    { id: 'ultimate_challenge', label: 'Ultimate 3x', icon: Target },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Mode Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/70 p-1.5 backdrop-blur-md dark:border-white/10 dark:bg-[#0F1630]/80">
          {modeTabs.map((t) => {
            const Icon = t.icon;
            const active = mode === t.id || (mode === 'daily_challenge' && t.id === 'mind_reader');
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => switchMode(t.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap shrink-0 ${
                  active
                    ? 'bg-[#7C3AED] text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Multi-round progress indicator (Double / Ultimate) */}
        {totalRounds > 1 && (
          <div className="flex items-center gap-3 text-xs font-medium text-slate-600 dark:text-slate-300">
            <span>
              {mode === 'double_challenge' ? 'Double Split Scoreboard' : 'Ultimate 3-Stage Ring'}
            </span>
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalRounds }, (_, idx) => {
                const done = roundResults[idx];
                const isCur = idx + 1 === currentRound;
                return (
                  <span
                    key={idx}
                    className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-bold ${
                      done
                        ? done.wasCorrect
                          ? 'bg-[#22C55E] text-slate-950'
                          : 'bg-[#F43F5E] text-white'
                        : isCur
                        ? 'bg-[#7C3AED] text-white ring-2 ring-[#38BDF8]/60'
                        : 'bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-400'
                    }`}
                  >
                    {idx + 1}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Friendly Error Banner with Retry (never loses state) */}
      {errorBanner && (
        <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-[#F43F5E]/40 bg-[#F43F5E]/10 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5 text-sm text-[#BE123C] dark:text-[#FDA4AF]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{errorBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={errorBanner.retryAction}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#F43F5E] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#E11D48] whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* PHASE 1: Select Category */}
      {phase === 'select_category' && (
        <div className="space-y-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              {mode === 'double_challenge'
                ? `Round ${currentRound} of 2 — Pick a Category`
                : 'Choose What You Are Thinking Of'}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Pick one of 14 categories. Media categories narrow by industry first for sharp accuracy.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  soundEngine.playTap();
                  setSelectedCategory(cat.id);
                  if (cat.subOptions && cat.subOptions.length > 0) {
                    setPhase('select_sub');
                  } else {
                    void startNewSession(mode, cat.id, null);
                  }
                }}
                className="mm-glass group flex items-start gap-4 rounded-2xl p-4 text-left transition-transform duration-200 hover:-translate-y-0.5"
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                  style={{ background: `linear-gradient(135deg, ${cat.accentColor}, #0F1630)` }}
                >
                  <CategoryIcon category={cat.id} className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">{cat.name}</h3>
                    <span className="text-xs font-semibold text-[#7C3AED] opacity-0 transition-opacity group-hover:opacity-100 dark:text-[#38BDF8]">
                      Start →
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                    {cat.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* PHASE 2: Industry / Sport / Range Selector */}
      {phase === 'select_sub' && categoryMeta && (
        <div className="mm-glass mx-auto max-w-3xl rounded-3xl p-6 sm:p-8">
          <button
            type="button"
            onClick={() => setPhase('select_category')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>All categories</span>
          </button>

          <div className="mt-4 flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl text-white"
              style={{ background: `linear-gradient(135deg, ${categoryMeta.accentColor}, #0F1630)` }}
            >
              <CategoryIcon category={categoryMeta.id} className="h-6 w-6" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-slate-900 sm:text-2xl dark:text-white">
                {categoryMeta.subSelectorLabel || 'Select Pool'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {categoryMeta.name} · Think of one specific item before we begin
              </p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(categoryMeta.subOptions ?? []).map((opt) => (
              <button
                key={opt}
                type="button"
                disabled={loading}
                onClick={() => void startNewSession(mode, categoryMeta.id, opt)}
                className="flex min-h-[52px] items-center justify-between rounded-xl border border-slate-200 bg-white/75 px-4 py-3.5 text-left text-sm font-semibold text-slate-900 transition-all hover:border-[#7C3AED] hover:bg-[#7C3AED]/8 dark:border-white/10 dark:bg-white/[0.04] dark:text-white dark:hover:border-[#38BDF8] dark:hover:bg-[#38BDF8]/10"
              >
                <span>{opt}</span>
                <span className="text-xs text-slate-400">Begin →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* PHASE 2B: Surprise Me Slot-Machine Intro */}
      {phase === 'surprise_spin' && (
        <div className="mm-glass mx-auto flex min-h-[380px] max-w-2xl flex-col items-center justify-center rounded-3xl p-8 text-center">
          <ThinkingOrb state="thinking" confidencePct={55} size="lg" />
          <p className="mt-6 font-display text-xl font-bold text-slate-900 dark:text-white">
            Surprise Me — Scanning Your Mind
          </p>
          <motion.p
            key={spinLabel}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-2 font-mono text-sm text-[#7C3AED] dark:text-[#38BDF8]"
          >
            {spinLabel}
          </motion.p>
        </div>
      )}

      {/* PHASE 3: Active Question Loop */}
      {phase === 'playing' && activeQuestion && (
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="mm-glass rounded-3xl p-5 sm:p-8">
            {/* Session Progress Header */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-900 dark:text-white">
                  {categoryMeta?.name || selectedCategory}
                </span>
                {selectedIndustry && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{selectedIndustry}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {activeQuestion.isBonus
                    ? `Bonus Q${activeQuestion.questionIndex}`
                    : `Question ${activeQuestion.questionIndex} of ${activeQuestion.maxQuestions}`}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                <span className="text-slate-600 dark:text-slate-300">
                  {activeQuestion.candidatesRemaining} left
                </span>
                <span aria-hidden="true" className="text-slate-400">/</span>
                <span className="font-semibold text-[#7C3AED] dark:text-[#38BDF8]">
                  {activeQuestion.confidencePct}% · {activeQuestion.confidenceLabel}
                </span>
              </div>
            </div>

            {/* Animated Progress & Confidence Bar */}
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, Math.round((activeQuestion.questionIndex / activeQuestion.maxQuestions) * 100))}%`,
                  background: 'linear-gradient(90deg, #7C3AED 0%, #38BDF8 100%)',
                }}
              />
            </div>

            {/* Special Number Mind Reader Live Shrinking Range Dial */}
            {selectedCategory === 'number' &&
              activeQuestion.rangeMin !== undefined &&
              activeQuestion.rangeMax !== undefined && (
                <div className="mt-5 rounded-2xl border border-[#38BDF8]/25 bg-[#38BDF8]/8 p-4">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-200">
                    <span>Live Narrowing Window</span>
                    <span className="font-mono font-bold tabular-nums text-[#0284C7] dark:text-[#38BDF8]">
                      {activeQuestion.rangeMin} — {activeQuestion.rangeMax}
                    </span>
                  </div>
                  <div className="mt-2.5 h-3 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
                    {(() => {
                      const totalSpan = selectedIndustry?.includes('1000') ? 1000 : 100;
                      const leftPct = ((activeQuestion.rangeMin - 1) / totalSpan) * 100;
                      const widthPct = Math.max(
                        3,
                        ((activeQuestion.rangeMax - activeQuestion.rangeMin + 1) / totalSpan) * 100
                      );
                      return (
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            marginLeft: `${leftPct}%`,
                            width: `${Math.min(100 - leftPct, widthPct)}%`,
                            background: 'linear-gradient(90deg, #7C3AED, #38BDF8)',
                          }}
                        />
                      );
                    })()}
                  </div>
                </div>
              )}

            {/* Living Orb + Question Card */}
            <div className="mt-6 flex flex-col items-center text-center">
              <ThinkingOrb
                state={loading ? 'thinking' : orbPulse ? 'pulse' : 'idle'}
                confidencePct={activeQuestion.confidencePct}
                size="sm"
              />

              <motion.h3
                key={activeQuestion.question}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="mt-5 max-w-xl font-display text-xl font-bold leading-snug text-slate-900 sm:text-2xl dark:text-white"
              >
                {activeQuestion.question}
              </motion.h3>
            </div>

            {/* Options OR Final Free-Text Clue */}
            {activeQuestion.isFinalClue ? (
              <div className="mx-auto mt-7 max-w-lg space-y-3">
                <input
                  type="text"
                  value={clueInput}
                  onChange={(e) => setClueInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && clueInput.trim()) void handleSubmitClue(false);
                  }}
                  placeholder='e.g. "time and a daughter", "red sandalwood", "yellow hair"...'
                  maxLength={140}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#7C3AED] focus:outline-none dark:border-white/15 dark:bg-[#070B1A]/80 dark:text-white dark:focus:border-[#38BDF8]"
                />
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={loading || !clueInput.trim()}
                    onClick={() => void handleSubmitClue(false)}
                    className="mm-btn-primary flex min-h-[46px] items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    <span>{loading ? 'Analyzing Clue...' : 'Apply Clue & Reveal'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void handleSubmitClue(true)}
                    className="flex min-h-[46px] items-center justify-center rounded-xl border border-slate-300 bg-white/70 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10"
                  >
                    Skip & Reveal Now
                  </button>
                </div>
              </div>
            ) : (
              <div className="mx-auto mt-7 max-w-xl space-y-3">
                <div
                  className={`grid gap-2.5 ${
                    activeQuestion.options.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'
                  }`}
                >
                  {activeQuestion.options.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={loading}
                      onClick={() => void handleSelectAnswer(opt.value)}
                      className="flex min-h-[50px] items-center justify-center rounded-xl border border-slate-200 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 transition-all hover:border-[#7C3AED] hover:bg-[#7C3AED]/10 active:scale-[0.99] disabled:opacity-55 dark:border-white/12 dark:bg-white/[0.05] dark:text-white dark:hover:border-[#38BDF8] dark:hover:bg-[#38BDF8]/12"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Mandatory "Not sure" option — never deletes candidates */}
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleSelectAnswer('__not_sure__')}
                  className="flex min-h-[42px] w-full items-center justify-center rounded-xl border border-dashed border-slate-300 px-4 py-2 text-xs font-medium text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-800 dark:border-white/15 dark:text-slate-400 dark:hover:border-white/30 dark:hover:text-slate-200"
                >
                  Not sure / Skip this clue
                </button>
              </div>
            )}

            {/* Answer Trail Summary */}
            {history.length > 0 && (
              <div className="mt-7 border-t border-slate-200/80 pt-4 dark:border-white/10">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Deduction trail ({poolSize} starting candidates)
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                  {history.slice(-4).map((h) => (
                    <span key={h.questionIndex} className="inline-flex items-center gap-1">
                      <span className="font-mono text-[11px] text-slate-400">Q{h.questionIndex}:</span>
                      <span className="font-medium text-slate-800 dark:text-slate-100">{h.userAnswerLabel}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PHASE 4: Reveal */}
      {phase === 'reveal' && reveal && (
        <RevealCard
          reveal={reveal}
          remainingBeforeReveal={history[history.length - 1]?.candidatesRemaining ?? poolSize}
          onRequestBonus={handleBonusRound}
          onPlayAgain={handleNextOrReplay}
          onFeedbackRecorded={handleFeedbackRecorded}
          nextRoundLabel={
            totalRounds > 1
              ? currentRound < totalRounds
                ? `Continue to Round ${currentRound + 1} of ${totalRounds}`
                : 'View Final Mind Report'
              : 'Play Again'
          }
        />
      )}

      {/* PHASE 5: Double / Ultimate Multi-Round Mind Report */}
      {phase === 'multi_summary' && (
        <div className="mm-glass mx-auto max-w-2xl rounded-3xl p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-7 w-7 text-[#22C55E]" />
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                {mode === 'double_challenge' ? 'Double Mind Challenge Complete' : 'Ultimate Mind Report'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {roundResults.filter((r) => r.wasCorrect).length} of {roundResults.length} minds accurately read ·{' '}
                {roundResults.reduce((acc, r) => acc + r.pointsAwarded, 0)} total points
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {roundResults.map((r) => (
              <div
                key={r.roundNumber}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-3.5 dark:border-white/10 dark:bg-white/[0.03]"
              >
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Round {r.roundNumber} · {r.categoryName} {r.industry ? `(${r.industry})` : ''}
                  </p>
                  <p className="font-display text-base font-bold text-slate-900 dark:text-white">{r.predictedName}</p>
                </div>
                <div className="text-right font-mono text-xs tabular-nums">
                  <p className={r.wasCorrect ? 'font-bold text-[#22C55E]' : 'font-semibold text-[#F43F5E]'}>
                    {r.wasCorrect ? 'Exact Read' : 'Missed'} · {r.confidencePct}%
                  </p>
                  <p className="text-slate-500">+{r.pointsAwarded} pts</p>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => switchMode(mode)}
            className="mm-btn-primary mt-6 w-full rounded-xl py-3 text-sm font-bold"
          >
            Start Another Challenge
          </button>
        </div>
      )}
    </div>
  );
}
