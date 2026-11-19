import { CATEGORIES, type CategoryId, type LeaderboardEntry } from '../shared/types.ts';
import { getLeaderboard as fetchLeaderboard } from './scoreService.ts';

export function getLeaderboardByRange(
  range: 'daily' | 'weekly' | 'all',
  currentUserId: number
): LeaderboardEntry[] {
  return fetchLeaderboard(range, currentUserId);
}

export interface DailyChallengeInfo {
  date: string;
  category: CategoryId;
  categoryName: string;
  industry: string | null;
  title: string;
  prompt: string;
  bonusPoints: number;
}

export function getDailyChallenge(): DailyChallengeInfo {
  const today = new Date().toISOString().slice(0, 10);
  // Deterministic daily rotation based on date hash
  let hash = 0;
  for (let i = 0; i < today.length; i++) {
    hash = (hash * 31 + today.charCodeAt(i)) >>> 0;
  }

  const dailyPool: Array<{ category: CategoryId; industry: string | null; title: string; prompt: string }> = [
    { category: 'movie', industry: 'Hollywood', title: 'Hollywood Sci-Fi & Classics', prompt: 'Think of any iconic Hollywood film — test if our engine reads it in 8 questions.' },
    { category: 'movie', industry: 'Bollywood', title: 'Bollywood Blockbuster Read', prompt: 'Pick a memorable Bollywood movie from any era from Sholay to 2024.' },
    { category: 'movie', industry: 'Anime', title: 'Anime Mastermind Challenge', prompt: 'Think of a beloved anime series or Studio Ghibli film.' },
    { category: 'sports_person', industry: 'Cricket', title: 'Cricket Legends Showdown', prompt: 'Think of a famous international cricketer — active or retired.' },
    { category: 'song', industry: 'Bollywood (Hindi)', title: 'Hindi Chartbuster Scan', prompt: 'Pick an unforgettable Hindi song from the 60s to today.' },
    { category: 'place', industry: null, title: 'World Wanderer Challenge', prompt: 'Picture any famous city, island, or landmark around the globe.' },
    { category: 'animal', industry: null, title: 'Wild Kingdom Deduction', prompt: 'Think of any creature on land, in the ocean, or in the sky.' },
    { category: 'movie', industry: 'Web Series', title: 'Binge-Watch Mind Read', prompt: 'Think of a hit global or Indian web series.' },
  ];

  const picked = dailyPool[hash % dailyPool.length];
  const meta = CATEGORIES.find((c) => c.id === picked.category)!;

  return {
    date: today,
    category: picked.category,
    categoryName: meta.name,
    industry: picked.industry,
    title: picked.title,
    prompt: picked.prompt,
    bonusPoints: 25,
  };
}
