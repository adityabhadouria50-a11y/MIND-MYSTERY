/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Brain,
  Home,
  Moon,
  Sparkles,
  Sun,
  Trophy,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { CategoryId, GameMode, RiddleCategory, UserProfile } from '../shared/types.ts';
import { AuroraBackdrop } from './components/AuroraBackdrop.tsx';
import { BrainArenaView } from './components/BrainArenaView.tsx';
import { HomeView } from './components/HomeView.tsx';
import { LeaderboardView } from './components/LeaderboardView.tsx';
import { MindReaderView } from './components/MindReaderView.tsx';
import { ProfileView } from './components/ProfileView.tsx';
import { api, type MetaResponse } from './lib/api.ts';
import { soundEngine } from './lib/sound.ts';

type TabId = 'home' | 'mind_reader' | 'brain_arena' | 'leaderboard' | 'profile';

const THEME_STORAGE_KEY = 'mm_theme_v1';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home');
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light') return false;
      return true;
    } catch {
      return true;
    }
  });
  const [isMuted, setIsMuted] = useState<boolean>(() => soundEngine.isMuted());

  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Launch parameters passed into MindReaderView or BrainArenaView
  const [mindLaunchKey, setMindLaunchKey] = useState(0);
  const [mindLaunchOpts, setMindLaunchOpts] = useState<{
    mode: GameMode;
    category: CategoryId | null;
    industry: string | null;
  }>({
    mode: 'mind_reader',
    category: null,
    industry: null,
  });
  const [arenaCategory, setArenaCategory] = useState<RiddleCategory>('Technology');

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  }, [isDark]);

  const refreshProfile = useCallback(async () => {
    try {
      const p = await api.getProfile();
      setProfile(p);
    } catch {
      // silently retry on next user action
    }
  }, []);

  useEffect(() => {
    api.getMeta().then(setMeta).catch(() => {});
    refreshProfile();
  }, [refreshProfile]);

  function handleToggleTheme() {
    soundEngine.playTap();
    setIsDark((prev) => !prev);
  }

  function handleToggleMute() {
    const nextMuted = soundEngine.toggleMute();
    setIsMuted(nextMuted);
    if (!nextMuted) {
      soundEngine.playTap();
    }
  }

  function handleStartMindReader(opts: {
    mode: GameMode;
    category?: CategoryId | null;
    industry?: string | null;
  }) {
    setMindLaunchOpts({
      mode: opts.mode,
      category: opts.category ?? null,
      industry: opts.industry ?? null,
    });
    setMindLaunchKey((k) => k + 1);
    setActiveTab('mind_reader');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleStartBrainArena(category: RiddleCategory) {
    setArenaCategory(category);
    setActiveTab('brain_arena');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const navItems: Array<{ id: TabId; label: string; icon: typeof Home }> = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'mind_reader', label: 'Mind Reader', icon: Sparkles },
    { id: 'brain_arena', label: 'Brain Arena', icon: Brain },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="min-h-screen relative text-slate-900 dark:text-[#F8FAFC] transition-colors duration-200">
      <AuroraBackdrop isDark={isDark} />

      {/* Top Desktop & Mobile Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-white/[0.08] bg-white/80 dark:bg-[#070B1A]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => {
              soundEngine.playTap();
              setActiveTab('home');
            }}
            className="flex items-center gap-2.5 shrink-0 cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 via-fuchsia-500 to-sky-400 flex items-center justify-center text-white shadow-md shadow-violet-500/25">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="font-display text-base sm:text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
              MIND<span className="text-violet-600 dark:text-violet-400">MYSTERY</span>
            </span>
          </button>

          {/* Desktop Navigation */}
          <nav aria-label="Primary" className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playTap();
                    setActiveTab(item.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition cursor-pointer ${
                    active
                      ? 'bg-violet-600/12 dark:bg-violet-500/20 text-violet-700 dark:text-violet-200'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {profile && (
              <button
                type="button"
                onClick={() => setActiveTab('profile')}
                className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-white/[0.04] px-3 py-1.5 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span className="text-violet-600 dark:text-violet-300">{profile.rank.name}</span>
                <span aria-hidden="true" className="text-slate-300 dark:text-white/20">·</span>
                <span className="font-mono tabular-nums text-slate-800 dark:text-slate-100">
                  {profile.totalPoints} pts
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleToggleMute}
              aria-label={isMuted ? 'Unmute sounds' : 'Mute sounds'}
              title={isMuted ? 'Unmute sounds' : 'Mute sounds'}
              className="w-9 h-9 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-white/[0.04] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:border-violet-400 transition cursor-pointer"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="w-9 h-9 rounded-xl border border-slate-200/80 dark:border-white/10 bg-white/70 dark:bg-white/[0.04] flex items-center justify-center text-slate-600 dark:text-slate-300 hover:border-violet-400 transition cursor-pointer"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-violet-600" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-24 md:pb-12">
        {activeTab === 'home' && (
          <HomeView
            meta={meta}
            profile={profile}
            onStartMindReader={handleStartMindReader}
            onStartBrainArena={handleStartBrainArena}
          />
        )}

        {activeTab === 'mind_reader' && (
          <MindReaderView
            key={mindLaunchKey}
            initialMode={mindLaunchOpts.mode}
            initialCategory={mindLaunchOpts.category}
            initialIndustry={mindLaunchOpts.industry}
            onStatsChanged={refreshProfile}
          />
        )}

        {activeTab === 'brain_arena' && (
          <BrainArenaView initialCategory={arenaCategory} onStatsChanged={refreshProfile} />
        )}

        {activeTab === 'leaderboard' && <LeaderboardView />}

        {activeTab === 'profile' && (
          <ProfileView
            profile={profile}
            isDark={isDark}
            isMuted={isMuted}
            onToggleTheme={handleToggleTheme}
            onToggleMute={handleToggleMute}
            onProfileUpdated={refreshProfile}
          />
        )}
      </main>

      {/* Compact Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-200/90 dark:border-white/10 bg-white/95 dark:bg-[#070B1A]/95 backdrop-blur-xl"
      >
        <div className="grid grid-cols-5 h-15 px-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  soundEngine.playTap();
                  setActiveTab(item.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition cursor-pointer ${
                  active
                    ? 'text-violet-600 dark:text-violet-300'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="truncate max-w-full px-0.5">{item.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
