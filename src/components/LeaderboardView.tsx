import { Crown, RefreshCw, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { LeaderboardEntry } from '../../shared/types.ts';
import { api, ApiError } from '../lib/api.ts';
import { soundEngine } from '../lib/sound.ts';

type RangeKey = 'daily' | 'weekly' | 'all';

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'all', label: 'All-Time' },
];

export function LeaderboardView() {
  const [range, setRange] = useState<RangeKey>('all');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchBoard(selectedRange = range) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getLeaderboard(selectedRange);
      setEntries(res.entries);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load leaderboard right now.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBoard(range);
  }, [range]);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600 dark:text-violet-300">
            Server-Verified Rankings
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
            Leaderboard
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Every point is computed server-side from completed Mind Reader games and Brain Arena riddles.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/[0.04] p-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => {
                  soundEngine.playTap();
                  setRange(r.key);
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  range === r.key
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => fetchBoard(range)}
            aria-label="Refresh leaderboard"
            className="p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/[0.04] text-slate-600 dark:text-slate-300 hover:border-violet-400 transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl mm-glass p-4 flex items-center justify-between gap-4 border border-amber-400/40">
          <p className="text-sm text-amber-700 dark:text-amber-300">{error}</p>
          <button
            type="button"
            onClick={() => fetchBoard(range)}
            className="px-3.5 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      <div className="rounded-3xl mm-glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-white/10 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-3.5 pl-5 pr-3 font-semibold">Rank</th>
                <th className="py-3.5 px-3 font-semibold">Player</th>
                <th className="py-3.5 px-3 font-semibold text-right">Points</th>
                <th className="py-3.5 px-3 font-semibold text-right">Correct Predictions</th>
                <th className="py-3.5 pl-3 pr-5 font-semibold text-right">Riddle Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 dark:divide-white/[0.06] text-sm">
              {loading && entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    Loading rankings...
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    No scores recorded in this period yet. Play a Mind Reader round or Brain Arena riddle to claim #1.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr
                    key={`${entry.userId}-${entry.rank}`}
                    className={
                      entry.isCurrentUser
                        ? 'bg-violet-500/10 dark:bg-violet-500/15'
                        : 'hover:bg-slate-100/60 dark:hover:bg-white/[0.03] transition'
                    }
                  >
                    <td className="py-3.5 pl-5 pr-3 font-mono font-bold tabular-nums text-slate-800 dark:text-slate-200">
                      <span className="inline-flex items-center gap-1.5">
                        {entry.rank === 1 ? (
                          <Crown className="w-4 h-4 text-amber-400" />
                        ) : entry.rank <= 3 ? (
                          <Trophy className="w-3.5 h-3.5 text-violet-400" />
                        ) : null}
                        #{entry.rank}
                      </span>
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">{entry.nickname}</span>
                        {entry.isCurrentUser && (
                          <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-300">
                            (You)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-bold tabular-nums text-violet-600 dark:text-violet-300">
                      {entry.points.toLocaleString()}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {entry.correctPredictions}
                    </td>
                    <td className="py-3.5 pl-3 pr-5 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {entry.riddleScore.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
