import {
  ArrowRight,
  Brain,
  Cpu,
  Dice5,
  Flame,
  FlaskConical,
  Globe,
  Hash,
  Landmark,
  Layers,
  Sparkles,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import {
  CATEGORIES,
  RIDDLE_CATEGORIES,
  type CategoryId,
  type GameMode,
  type RiddleCategory,
  type UserProfile,
} from '../../shared/types.ts';
import type { MetaResponse } from '../lib/api.ts';
import { soundEngine } from '../lib/sound.ts';
import { CategoryIcon } from './CategoryIcon.tsx';
import { ThinkingOrb } from './ThinkingOrb.tsx';

interface HomeViewProps {
  meta: MetaResponse | null;
  profile: UserProfile | null;
  onStartMindReader: (opts: { mode: GameMode; category?: CategoryId | null; industry?: string | null }) => void;
  onStartBrainArena: (category: RiddleCategory) => void;
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const start = display;
    const diff = value - start;
    if (diff === 0) return;
    const duration = 520;
    const startTime = performance.now();
    let rafId = 0;

    const step = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(start + diff * eased));
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      }
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [value]);

  return <span className="tabular-nums">{display.toLocaleString()}</span>;
}

const ARENA_DESCRIPTIONS: Record<RiddleCategory, { desc: string; icon: typeof Brain; accent: string }> = {
  'Politics and Governance': {
    desc: 'Grounded current affairs, constitutions, and civic systems with verified dates.',
    icon: Landmark,
    accent: '#7C3AED',
  },
  Society: {
    desc: 'Culture, economics, demographics, and social history challenges.',
    icon: Users,
    accent: '#E879F9',
  },
  Technology: {
    desc: 'Computing architecture, networks, cybersecurity, and modern software.',
    icon: Cpu,
    accent: '#38BDF8',
  },
  'Innovation and Science': {
    desc: 'Physics, space, medicine, and breakthroughs verified for precision.',
    icon: FlaskConical,
    accent: '#22C55E',
  },
  'General Knowledge': {
    desc: 'World geography, literature, history, and high-signal trivia.',
    icon: Globe,
    accent: '#F59E0B',
  },
};

export function HomeView({ meta, profile, onStartMindReader, onStartBrainArena }: HomeViewProps) {
  const poolCounts = new Map<CategoryId, number>();
  if (meta?.categories) {
    for (const c of meta.categories) {
      poolCounts.set(c.id, c.poolCount);
    }
  }

  return (
    <div className="space-y-12 pb-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl mm-glass p-6 sm:p-10 lg:p-12">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7 space-y-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-600 dark:text-violet-300">
              Your Thoughts · Our Intelligence · One Mysterious Game
            </p>
            <h1 className="font-display text-3xl sm:text-5xl lg:text-[3.25rem] font-extrabold tracking-tight leading-[1.08] text-slate-900 dark:text-white">
              THINK OF SOMETHING.{' '}
              <span className="bg-gradient-to-r from-violet-500 via-fuchsia-500 to-sky-400 bg-clip-text text-transparent">
                LET AI GUESS IT.
              </span>
            </h1>
            <p className="max-w-xl text-sm sm:text-base leading-relaxed text-slate-600 dark:text-slate-300">
              Pick a movie, song, legend, number, or mystery from 14 verified pools. Our information-gain engine narrows
              possibilities live in 7–10 adaptive questions — with honest confidence and zero guesswork fakery.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playTap();
                  onStartMindReader({ mode: 'mind_reader' });
                }}
                className="mm-btn-primary inline-flex items-center gap-2.5 rounded-2xl px-6 py-3.5 text-sm sm:text-base font-bold text-white cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                Start Mind Reading
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playTap();
                  onStartMindReader({ mode: 'surprise_me' });
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-300/80 dark:border-white/15 bg-white/70 dark:bg-white/5 px-5 py-3.5 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-violet-400 dark:hover:border-violet-400/60 transition cursor-pointer"
              >
                <Dice5 className="w-4 h-4 text-fuchsia-500 dark:text-fuchsia-300" />
                Surprise Me
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playTap();
                  onStartBrainArena('Technology');
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-300/80 dark:border-white/15 bg-white/70 dark:bg-white/5 px-5 py-3.5 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-sky-400 dark:hover:border-sky-400/60 transition cursor-pointer"
              >
                <Brain className="w-4 h-4 text-sky-500 dark:text-sky-300" />
                Brain Arena
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="tabular-nums">
                <strong className="text-slate-800 dark:text-slate-200">
                  {meta ? meta.totalVerifiedCandidates.toLocaleString() : '950+'}
                </strong>{' '}
                verified database entries
              </span>
              <span aria-hidden="true">·</span>
              <span>14 categories across 8 media industries</span>
              <span aria-hidden="true">·</span>
              <span>Server-verified timers &amp; scores</span>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col items-center justify-center">
            <ThinkingOrb confidencePct={profile?.accuracyPct || 68} size="lg" />
            <div className="mt-5 grid grid-cols-3 gap-2 w-full max-w-sm">
              {[
                {
                  label: 'Number',
                  sub: 'Live halving',
                  icon: Hash,
                  mode: 'number_reader' as GameMode,
                  category: 'number' as CategoryId,
                },
                {
                  label: 'Double',
                  sub: '2 rounds',
                  icon: Layers,
                  mode: 'double_challenge' as GameMode,
                  category: null,
                },
                {
                  label: 'Ultimate',
                  sub: '3-stage run',
                  icon: Target,
                  mode: 'ultimate_challenge' as GameMode,
                  category: null,
                },
              ].map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.label}
                    type="button"
                    onClick={() => {
                      soundEngine.playTap();
                      onStartMindReader({ mode: m.mode, category: m.category });
                    }}
                    className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/75 dark:bg-white/[0.04] px-3 py-2.5 text-left hover:border-violet-400/70 transition cursor-pointer"
                  >
                    <Icon className="w-4 h-4 text-violet-500 dark:text-violet-300 mb-1" />
                    <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">{m.label}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">{m.sub}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Daily Challenge Banner */}
      {meta?.dailyChallenge && (
        <section className="rounded-2xl mm-glass p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-violet-500/25">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-300">
              <Flame className="w-4 h-4 text-amber-500 dark:text-amber-400" />
              <span>Daily Challenge</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono text-slate-500 dark:text-slate-400">{meta.dailyChallenge.date}</span>
              <span aria-hidden="true">·</span>
              <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">
                +{meta.dailyChallenge.bonusPoints} Bonus Pts
              </span>
            </div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              {meta.dailyChallenge.title}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300">{meta.dailyChallenge.prompt}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              soundEngine.playTap();
              onStartMindReader({
                mode: 'daily_challenge',
                category: meta.dailyChallenge.category,
                industry: meta.dailyChallenge.industry,
              });
            }}
            className="mm-btn-primary shrink-0 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white cursor-pointer"
          >
            Play Daily Challenge
            <ArrowRight className="w-4 h-4" />
          </button>
        </section>
      )}

      {/* Live Gameplay Stats */}
      <section aria-label="Live Gameplay Stats" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {[
          { label: 'Games Played', value: profile?.gamesPlayed ?? 0 },
          { label: 'Successful Guesses', value: profile?.successfulGuesses ?? 0 },
          { label: 'Riddles Solved', value: profile?.riddlesSolved ?? 0 },
          { label: 'Total Points', value: profile?.totalPoints ?? 0 },
          { label: 'Current Streak', value: profile?.currentStreak ?? 0 },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl mm-glass px-4 py-4 flex flex-col justify-between"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {stat.label}
            </span>
            <p className="mt-2 font-display text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              <AnimatedNumber value={stat.value} />
            </p>
          </div>
        ))}
      </section>

      {/* All 14 Mind Reader Categories */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-300">
              Mind Reader Pools
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-1">
              Choose What&apos;s On Your Mind
            </h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            14 curated categories · Industry &amp; era filtering built in
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {CATEGORIES.map((cat, idx) => {
            const count = poolCounts.get(cat.id);
            return (
              <motion.div
                key={cat.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(idx * 0.025, 0.3) }}
                className="group rounded-2xl mm-glass p-5 flex flex-col justify-between gap-4 hover:border-violet-400/60 dark:hover:border-violet-400/50 transition"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${cat.accentColor}26, ${cat.accentColor}10)`,
                        border: `1px solid ${cat.accentColor}44`,
                        color: cat.accentColor,
                      }}
                    >
                      <CategoryIcon category={cat.id} className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {cat.isDeterministic
                        ? 'Exact Engine'
                        : count
                          ? `${count} verified`
                          : 'Verified Pool'}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-display text-base font-bold text-slate-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-300 transition">
                      {cat.name}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {cat.description}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playTap();
                    onStartMindReader({
                      mode: cat.id === 'number' ? 'number_reader' : 'mind_reader',
                      category: cat.id,
                    });
                  }}
                  className="w-full inline-flex items-center justify-between rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/80 dark:bg-white/[0.04] px-3.5 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-100 group-hover:border-violet-400/60 group-hover:text-violet-700 dark:group-hover:text-violet-200 transition cursor-pointer"
                >
                  <span>Start {cat.name}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Brain Arena Section */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600 dark:text-sky-300">
              Brain Arena · Verified Riddles
            </p>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mt-1">
              Test Your Speed &amp; Signal
            </h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Dual-pass verified questions · Live server timer · Streak multipliers
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {RIDDLE_CATEGORIES.map((rc) => {
            const info = ARENA_DESCRIPTIONS[rc];
            const Icon = info.icon;
            return (
              <button
                key={rc}
                type="button"
                onClick={() => {
                  soundEngine.playTap();
                  onStartBrainArena(rc);
                }}
                className="group text-left rounded-2xl mm-glass p-5 flex flex-col justify-between gap-4 hover:border-sky-400/60 transition cursor-pointer"
              >
                <div className="space-y-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${info.accent}28, ${info.accent}10)`,
                      border: `1px solid ${info.accent}44`,
                    }}
                  >
                    <Icon className="w-5 h-5" style={{ color: info.accent }} />
                  </div>
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white leading-snug">
                    {rc}
                  </h3>
                  <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">{info.desc}</p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-300 group-hover:translate-x-0.5 transition">
                  Enter Arena <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Rank Preview Strip */}
      {profile && (
        <section className="rounded-2xl mm-glass p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-sky-500 flex items-center justify-center text-white shadow-lg shrink-0">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Playing as <strong className="text-slate-800 dark:text-slate-200">{profile.nickname}</strong> · Rank{' '}
                <strong className="text-violet-600 dark:text-violet-300">{profile.rank.name}</strong>
              </p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5 tabular-nums">
                {profile.totalPoints.toLocaleString()} pts
                {profile.rank.nextRankName && profile.rank.nextRankPoints !== null
                  ? ` · ${Math.max(0, profile.rank.nextRankPoints - profile.totalPoints)} pts to ${profile.rank.nextRankName}`
                  : ' · Highest rank achieved'}
              </p>
            </div>
          </div>
          <div className="w-full sm:w-56">
            <div className="h-2 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-sky-400 transition-all duration-500"
                style={{ width: `${profile.rank.progressPct}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-right text-slate-500 dark:text-slate-400 tabular-nums">
              {profile.badges.filter((b) => b.unlocked).length} / {profile.badges.length} badges unlocked
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
