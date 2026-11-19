import confetti from 'canvas-confetti';
import { Check, Download, HelpCircle, PlusCircle, RotateCcw, Share2, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { RevealPayload } from '../../shared/types.ts';
import { api, type FeedbackResponse } from '../lib/api.ts';
import { downloadShareResultCard } from '../lib/shareCard.ts';
import { soundEngine } from '../lib/sound.ts';
import { CategoryIcon } from './CategoryIcon.tsx';
import { ThinkingOrb } from './ThinkingOrb.tsx';

interface RevealCardProps {
  reveal: RevealPayload;
  remainingBeforeReveal: number;
  onRequestBonus: () => void;
  onPlayAgain: () => void;
  onFeedbackRecorded: (wasCorrect: boolean, res: FeedbackResponse) => void;
  nextRoundLabel?: string;
}

const TIMELINE_ERAS = ['classic', '90s', '2000s', '2010s', '2020s'] as const;
const ERA_LABELS: Record<string, string> = {
  classic: 'Pre-90s',
  '90s': '1990s',
  '2000s': '2000s',
  '2010s': '2010s',
  '2020s': '2020s',
};

export function RevealCard({
  reveal,
  remainingBeforeReveal,
  onRequestBonus,
  onPlayAgain,
  onFeedbackRecorded,
  nextRoundLabel,
}: RevealCardProps) {
  const prefersReduced =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [stage, setStage] = useState<'suspense' | 'revealed'>(prefersReduced ? 'revealed' : 'suspense');
  const [suspenseLineIdx, setSuspenseLineIdx] = useState(0);
  const [posterFailed, setPosterFailed] = useState(false);

  const [feedbackState, setFeedbackState] = useState<'idle' | 'yes_done' | 'no_form' | 'no_done'>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackResult, setFeedbackResult] = useState<FeedbackResponse | null>(null);
  const [selectedRunnerId, setSelectedRunnerId] = useState<string>('');
  const [customAnswer, setCustomAnswer] = useState('');
  const [shareDone, setShareDone] = useState(false);

  const suspenseLines = [
    `Cross-checking ${remainingBeforeReveal} remaining ${remainingBeforeReveal === 1 ? 'possibility' : 'possibilities'}...`,
    `Weighting ${reveal.questionsAsked} Bayesian evidence signals...`,
    'WAIT... I THINK I KNOW WHAT YOU ARE THINKING!',
  ];

  useEffect(() => {
    if (stage !== 'suspense') return;
    soundEngine.playSuspenseRise();

    const t1 = setTimeout(() => setSuspenseLineIdx(1), 950);
    const t2 = setTimeout(() => setSuspenseLineIdx(2), 1850);
    const t3 = setTimeout(() => {
      setStage('revealed');
      soundEngine.playRevealChord();
    }, 3000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [stage]);

  const handleYes = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await api.submitFeedback({
        sessionId: reveal.sessionId,
        wasCorrect: true,
      });
      setFeedbackResult(res);
      setFeedbackState('yes_done');
      soundEngine.playSuccess();
      if (!prefersReduced) {
        confetti({
          particleCount: 85,
          spread: 70,
          origin: { y: 0.62 },
          colors: ['#7C3AED', '#38BDF8', '#E879F9', '#22C55E'],
        });
      }
      onFeedbackRecorded(true, res);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNoSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const chosenRunner = reveal.runnersUp.find((r) => r.id === selectedRunnerId);
      const res = await api.submitFeedback({
        sessionId: reveal.sessionId,
        wasCorrect: false,
        selectedRunnerUpId: selectedRunnerId || undefined,
        correctAnswerName: customAnswer.trim() || chosenRunner?.name || undefined,
      });
      setFeedbackResult(res);
      setFeedbackState('no_done');
      soundEngine.playMiss();
      onFeedbackRecorded(false, res);
    } finally {
      setSubmitting(false);
    }
  };

  const handleShare = async () => {
    const ok = await downloadShareResultCard(reveal);
    if (ok) {
      setShareDone(true);
      setTimeout(() => setShareDone(false), 2600);
    }
  };

  const top = reveal.topCandidate;
  const colourHex = typeof top.attributes?.hex === 'string' ? top.attributes.hex : null;
  const isLowConfidence = reveal.confidencePct < 60;

  if (stage === 'suspense') {
    return (
      <div className="mm-glass relative mx-auto flex min-h-[420px] max-w-2xl flex-col items-center justify-center rounded-3xl px-6 py-12 text-center">
        <ThinkingOrb state="suspense" confidencePct={reveal.confidencePct} size="lg" />
        <motion.p
          key={suspenseLineIdx}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mt-8 max-w-lg font-display text-lg font-bold tracking-tight sm:text-2xl ${
            suspenseLineIdx === 2
              ? 'reveal-glitch text-[#7C3AED] dark:text-[#E879F9]'
              : 'text-slate-800 dark:text-slate-200'
          }`}
        >
          {suspenseLines[suspenseLineIdx]}
        </motion.p>
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          {reveal.isDeterministic ? 'Verifying exact logical deduction' : 'Calculating final probability gap'}
        </p>
        <button
          type="button"
          onClick={() => setStage('revealed')}
          className="mt-6 text-xs font-medium text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
        >
          Skip animation
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, rotateY: prefersReduced ? 0 : -14, scale: 0.97 }}
      animate={{ opacity: 1, rotateY: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="mm-glass mx-auto max-w-3xl overflow-hidden rounded-3xl p-5 sm:p-8"
    >
      {/* Top kicker — unboxed metadata */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-4 dark:border-white/10">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-[#7C3AED] dark:text-[#38BDF8]">
            {reveal.isDeterministic
              ? 'Deduced From Your Answers'
              : isLowConfidence
              ? 'My Best Guess (Close Call)'
              : 'Your Mind Has Been Read'}
          </span>
          <span aria-hidden="true">·</span>
          <span>{reveal.industry || reveal.category.replace('_', ' ')}</span>
          {reveal.timelineChip && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-700 dark:text-slate-200">{reveal.timelineChip}</span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={handleShare}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
        >
          {shareDone ? <Download className="h-3.5 w-3.5 text-[#22C55E]" /> : <Share2 className="h-3.5 w-3.5" />}
          <span>{shareDone ? 'Card Saved' : 'Share Card'}</span>
        </button>
      </div>

      {/* Main Reveal Grid: Poster/Visual + Details */}
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-[172px_1fr] sm:items-start">
        {/* Visual / Poster Frame with Zero-Broken-Image fallback */}
        <div className="mx-auto w-40 shrink-0 sm:mx-0 sm:w-full">
          {top.posterUrl && !posterFailed ? (
            <div className="aspect-[2/3] overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
              <img
                src={top.posterUrl}
                alt={`Poster for ${top.name}`}
                referrerPolicy="no-referrer"
                onError={() => setPosterFailed(true)}
                className="h-full w-full object-cover"
              />
            </div>
          ) : (
            <div
              className="flex aspect-[2/3] flex-col items-center justify-between rounded-2xl border border-white/15 p-4 text-center text-white shadow-lg"
              style={{
                background: colourHex
                  ? `linear-gradient(155deg, ${colourHex} 0%, #0F1630 130%)`
                  : 'linear-gradient(155deg, #4C1D95 0%, #1E1B4B 55%, #0F172A 100%)',
              }}
            >
              <span className="text-[11px] font-medium tracking-wide text-white/75">
                {reveal.industry || reveal.category.replace('_', ' ')}
              </span>
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/12 backdrop-blur-md">
                  <CategoryIcon category={reveal.category} className="h-6 w-6 text-white" />
                </div>
                <span className="line-clamp-3 font-display text-sm font-bold leading-snug">{top.name}</span>
              </div>
              <span className="font-mono text-xs text-white/75">
                {top.releaseYear ? (top.endYear ? `${top.releaseYear}–${top.endYear}` : top.releaseYear) : `${reveal.confidencePct}%`}
              </span>
            </div>
          )}
        </div>

        {/* Prediction Details */}
        <div className="min-w-0 space-y-5">
          <div>
            <h2 className="font-display text-2xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
              {top.name}
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{top.subtitle}</p>
          </div>

          {/* Mini Media Timeline */}
          {top.releaseYear && top.era && (
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
                <span>Timeline</span>
                <span className="font-mono font-semibold text-[#7C3AED] dark:text-[#38BDF8]">
                  {top.endYear ? `${top.releaseYear}–${top.endYear}` : top.releaseYear}
                </span>
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-1">
                {TIMELINE_ERAS.map((eraKey, i) => {
                  const active = top.era === eraKey;
                  return (
                    <div key={eraKey} className="flex flex-1 items-center">
                      <div className="flex flex-col items-center">
                        <span
                          className={`h-2.5 w-2.5 rotate-45 transition-transform ${
                            active
                              ? 'scale-125 bg-[#7C3AED] ring-4 ring-[#7C3AED]/25 dark:bg-[#38BDF8] dark:ring-[#38BDF8]/25'
                              : 'bg-slate-300 dark:bg-slate-600'
                          }`}
                        />
                        <span
                          className={`mt-1.5 text-[10px] font-medium whitespace-nowrap ${
                            active ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {ERA_LABELS[eraKey]}
                        </span>
                      </div>
                      {i < TIMELINE_ERAS.length - 1 && (
                        <div className="mx-1 mb-4 h-px flex-1 bg-slate-200 dark:bg-white/10" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Honest Two-Sentence Explanation */}
          <p className="text-sm leading-relaxed text-slate-700 sm:text-[15px] dark:text-slate-200">
            “{reveal.explanation}”
          </p>

          {/* Confidence Meter + Honest Label */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                  {reveal.confidencePct}%
                </span>
                <span aria-hidden="true" className="text-slate-400">·</span>
                <span
                  className={`font-semibold ${
                    reveal.confidencePct >= 70
                      ? 'text-[#16A34A] dark:text-[#22C55E]'
                      : reveal.confidencePct >= 40
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-[#E11D48] dark:text-[#F43F5E]'
                  }`}
                >
                  {reveal.confidenceLabel}
                </span>
              </div>
              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {reveal.questionsAsked} questions asked
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.max(4, reveal.confidencePct)}%`,
                  background:
                    reveal.confidencePct >= 70
                      ? 'linear-gradient(90deg, #7C3AED 0%, #38BDF8 65%, #22C55E 100%)'
                      : reveal.confidencePct >= 40
                      ? 'linear-gradient(90deg, #7C3AED 0%, #F59E0B 100%)'
                      : 'linear-gradient(90deg, #F43F5E 0%, #E879F9 100%)',
                }}
              />
            </div>
          </div>

          {/* Top 3 Runners-up */}
          {reveal.runnersUp.length > 0 && (
            <div className="pt-1">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Closest runners-up</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                {reveal.runnersUp.map((r) => (
                  <span key={r.id} className="inline-flex items-center gap-1.5">
                    <span className="font-medium text-slate-900 dark:text-slate-100">{r.name}</span>
                    {r.releaseYear && <span className="text-xs text-slate-500">({r.releaseYear})</span>}
                    <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {r.scorePct}%
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bonus Round Offer (only when confidence < 60% and bonus questions remain) */}
      {reveal.canOfferBonus && feedbackState === 'idle' && (
        <div className="mt-6 flex flex-col items-start justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 p-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-2.5 text-sm">
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-slate-800 dark:text-slate-200">
              Confidence is under 60%. Want up to <strong>{reveal.bonusRemaining} bonus questions</strong> to narrow it down further?
            </p>
          </div>
          <button
            type="button"
            onClick={onRequestBonus}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-amber-400 whitespace-nowrap shrink-0"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Ask {reveal.bonusRemaining} Bonus Questions</span>
          </button>
        </div>
      )}

      {/* Action Buttons / Feedback Flow */}
      <div className="mt-7 border-t border-slate-200/80 pt-6 dark:border-white/10">
        {feedbackState === 'idle' && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={submitting}
              onClick={handleYes}
              className="mm-btn-primary flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold whitespace-nowrap"
            >
              <Check className="h-4 w-4" />
              <span>YES! YOU READ MY MIND!</span>
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setFeedbackState('no_form')}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white/60 px-5 py-3 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 whitespace-nowrap dark:border-white/15 dark:bg-white/5 dark:text-slate-100 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
              <span>NO! TRY AGAIN!</span>
            </button>
          </div>
        )}

        {feedbackState === 'yes_done' && feedbackResult && (
          <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-[#22C55E]/35 bg-[#22C55E]/10 p-4 sm:flex-row sm:items-center">
            <div>
              <p className="font-display text-base font-bold text-[#15803D] dark:text-[#4ADE80]">
                Match confirmed · +{feedbackResult.pointsAwarded} points awarded
              </p>
              <p className="mt-0.5 text-xs text-slate-700 dark:text-slate-300">
                Your streak and live dashboard statistics have been updated on the server.
                {feedbackResult.newBadges.length > 0 && ` New badge unlocked: ${feedbackResult.newBadges.join(', ').replace(/_/g, ' ')}!`}
              </p>
            </div>
            <button
              type="button"
              onClick={onPlayAgain}
              className="mm-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-4 w-4" />
              <span>{nextRoundLabel || 'Play Again'}</span>
            </button>
          </div>
        )}

        {feedbackState === 'no_form' && (
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5 dark:border-white/10 dark:bg-white/[0.03]">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Was it one of these runners-up, or something else?
              </h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Your correction trains our database attributes for future sessions.
              </p>
            </div>

            {reveal.runnersUp.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {reveal.runnersUp.map((r) => {
                  const active = selectedRunnerId === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setSelectedRunnerId(active ? '' : r.id);
                        if (!active) setCustomAnswer('');
                      }}
                      className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                        active
                          ? 'border-[#7C3AED] bg-[#7C3AED]/15 text-[#7C3AED] dark:border-[#38BDF8] dark:bg-[#38BDF8]/15 dark:text-[#38BDF8]'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-white/15 dark:bg-white/5 dark:text-slate-200'
                      }`}
                    >
                      {r.name} {r.releaseYear ? `(${r.releaseYear})` : ''}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={customAnswer}
                onChange={(e) => {
                  setCustomAnswer(e.target.value);
                  if (e.target.value) setSelectedRunnerId('');
                }}
                placeholder="Or type what you were thinking of (optional)"
                maxLength={100}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#7C3AED] focus:outline-none dark:border-white/15 dark:bg-[#070B1A]/70 dark:text-white dark:focus:border-[#38BDF8]"
              />
              <button
                type="button"
                disabled={submitting}
                onClick={handleNoSubmit}
                className="mm-btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold whitespace-nowrap shrink-0"
              >
                {submitting ? 'Saving...' : 'Save Correction'}
              </button>
            </div>
          </div>
        )}

        {feedbackState === 'no_done' && (
          <div className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-[#7C3AED]/30 bg-[#7C3AED]/10 p-4 sm:flex-row sm:items-center">
            <div>
              <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Thanks — correction recorded (+{feedbackResult?.pointsAwarded ?? 5} pts)
              </p>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                We saved your feedback to improve candidate scoring and attribute accuracy.
              </p>
            </div>
            <button
              type="button"
              onClick={onPlayAgain}
              className="mm-btn-primary inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-4 w-4" />
              <span>{nextRoundLabel || 'Try Another'}</span>
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
