import {
  Award,
  Check,
  Edit3,
  Flame,
  Lock,
  Moon,
  Sun,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { UserProfile } from '../../shared/types.ts';
import { api, ApiError } from '../lib/api.ts';
import { soundEngine } from '../lib/sound.ts';

interface ProfileViewProps {
  profile: UserProfile | null;
  isDark: boolean;
  isMuted: boolean;
  onToggleTheme: () => void;
  onToggleMute: () => void;
  onProfileUpdated: () => void;
}

const ALL_RANKS = [
  { name: 'Curious', min: 0 },
  { name: 'Thinker', min: 150 },
  { name: 'Analyst', min: 400 },
  { name: 'Mind Reader', min: 800 },
  { name: 'Oracle', min: 1500 },
];

export function ProfileView({
  profile,
  isDark,
  isMuted,
  onToggleTheme,
  onToggleMute,
  onProfileUpdated,
}: ProfileViewProps) {
  const [editing, setEditing] = useState(false);
  const [nickname, setNickname] = useState(profile?.nickname || '');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.nickname && !editing) {
      setNickname(profile.nickname);
    }
  }, [profile?.nickname, editing]);

  async function handleSaveNickname(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = nickname.trim();
    if (cleaned.length < 2) {
      setErrorMsg('Nickname must be at least 2 characters.');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    setSaveMessage(null);
    try {
      await api.updateNickname(cleaned);
      soundEngine.playSuccess();
      setEditing(false);
      setSaveMessage('Nickname updated');
      onProfileUpdated();
      setTimeout(() => setSaveMessage(null), 2500);
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Unable to save nickname.');
    } finally {
      setSaving(false);
    }
  }

  if (!profile) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-slate-500 dark:text-slate-400">
        Loading your MINDMYSTERY profile...
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Identity & Preferences */}
      <section className="rounded-3xl mm-glass p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-300">
              Player Profile
            </p>
            {editing ? (
              <form onSubmit={handleSaveNickname} className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={24}
                  aria-label="Player nickname"
                  className="rounded-xl border border-violet-400/70 bg-white dark:bg-[#070B1A] px-3.5 py-2 text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="mm-btn-primary rounded-xl px-4 py-2 text-xs font-bold text-white cursor-pointer disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setNickname(profile.nickname);
                    setErrorMsg(null);
                  }}
                  className="rounded-xl border border-slate-300 dark:border-white/15 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-3">
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                  {profile.nickname}
                </h1>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/15 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-violet-400 transition cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Edit
                </button>
              </div>
            )}
            {saveMessage && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> {saveMessage}
              </p>
            )}
            {errorMsg && <p className="text-xs text-rose-500">{errorMsg}</p>}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleTheme}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/15 bg-white/75 dark:bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-violet-400 transition cursor-pointer"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-violet-600" />}
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/15 bg-white/75 dark:bg-white/[0.04] px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-violet-400 transition cursor-pointer"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-sky-400" />
              )}
              {isMuted ? 'Sound Off' : 'Sound On'}
            </button>
          </div>
        </div>

        {/* Rank Progress */}
        <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.03] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-sky-500 flex items-center justify-center text-white">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Current Rank</p>
                <p className="font-display text-lg font-bold text-slate-900 dark:text-white">{profile.rank.name}</p>
              </div>
            </div>
            <div className="text-right tabular-nums">
              <p className="font-mono text-xl font-bold text-violet-600 dark:text-violet-300">
                {profile.totalPoints.toLocaleString()} pts
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {profile.rank.nextRankName && profile.rank.nextRankPoints !== null
                  ? `Next: ${profile.rank.nextRankName} at ${profile.rank.nextRankPoints} pts`
                  : 'Peak Oracle status unlocked'}
              </p>
            </div>
          </div>

          <div className="h-2.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-sky-400 transition-all duration-500"
              style={{ width: `${profile.rank.progressPct}%` }}
            />
          </div>

          <div className="grid grid-cols-5 gap-1 text-center text-[11px]">
            {ALL_RANKS.map((r) => {
              const reached = profile.totalPoints >= r.min;
              return (
                <div
                  key={r.name}
                  className={
                    reached
                      ? 'font-semibold text-violet-600 dark:text-violet-300'
                      : 'text-slate-400 dark:text-slate-500'
                  }
                >
                  <div>{r.name}</div>
                  <div className="font-mono text-[10px] tabular-nums">{r.min}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stat Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Games Played', value: String(profile.gamesPlayed) },
            { label: 'Prediction Accuracy', value: `${profile.accuracyPct}%` },
            { label: 'Riddles Solved', value: String(profile.riddlesSolved) },
            { label: 'Best Streak', value: `${profile.bestStreak} · Riddle ${profile.bestRiddleStreak}` },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-white/[0.03] px-4 py-3.5"
            >
              <p className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{item.label}</p>
              <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white tabular-nums">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Badges */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">Achievement Badges</h2>
          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
            {profile.badges.filter((b) => b.unlocked).length} / {profile.badges.length} unlocked
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {profile.badges.map((badge) => (
            <div
              key={badge.key}
              className={`rounded-2xl mm-glass p-4 flex items-start gap-3.5 ${
                badge.unlocked ? 'border-violet-400/40' : 'opacity-65'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  badge.unlocked
                    ? 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white'
                    : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400'
                }`}
              >
                {badge.unlocked ? <Award className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
              </div>
              <div className="min-w-0">
                <p className="font-display text-sm font-bold text-slate-900 dark:text-white">{badge.name}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                  {badge.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Mind Reader Sessions */}
      <section className="space-y-4">
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">Recent Mind Reads</h2>
        {profile.recentSessions.length === 0 ? (
          <div className="rounded-2xl mm-glass p-6 text-sm text-slate-500 dark:text-slate-400">
            No completed sessions yet. Start a Mind Reader round to build your history.
          </div>
        ) : (
          <div className="rounded-2xl mm-glass divide-y divide-slate-200/70 dark:divide-white/[0.06]">
            {profile.recentSessions.map((s) => (
              <div key={s.id} className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {s.topName || 'Session in progress'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {s.category}
                    {s.industry ? ` · ${s.industry}` : ''} · {s.confidencePct}% confidence
                  </p>
                </div>
                <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
                  {s.predictedCorrect === true ? (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold inline-flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5" /> Hit · +{s.pointsAwarded} pts
                    </span>
                  ) : s.predictedCorrect === false ? (
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">Missed · Logged</span>
                  ) : (
                    <span className="text-slate-400">Unconfirmed</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
