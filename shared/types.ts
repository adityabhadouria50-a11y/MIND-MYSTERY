export type CategoryId =
  | 'movie'
  | 'song'
  | 'actor'
  | 'singer'
  | 'sports_person'
  | 'number'
  | 'dob'
  | 'food'
  | 'place'
  | 'colour'
  | 'animal'
  | 'weather'
  | 'alphabet'
  | 'word';

export type GameMode =
  | 'mind_reader'
  | 'surprise_me'
  | 'number_reader'
  | 'double_challenge'
  | 'ultimate_challenge'
  | 'daily_challenge';

export type MediaEra = 'classic' | '90s' | '2000s' | '2010s' | '2020s';

export type ConfidenceLabel = 'Wild guess' | 'Educated guess' | 'Strong match';

export type RiddleCategory =
  | 'Politics and Governance'
  | 'Society'
  | 'Technology'
  | 'Innovation and Science'
  | 'General Knowledge';

export type RiddleDifficulty = 'Easy' | 'Medium' | 'Hard';

export interface CategoryMeta {
  id: CategoryId;
  name: string;
  description: string;
  icon: string;
  hasTimeline: boolean;
  isDeterministic: boolean;
  subSelectorLabel?: string;
  subOptions?: string[];
  accentColor: string;
}

export interface CandidateRecord {
  id: string;
  category: CategoryId;
  industry: string | null;
  name: string;
  subtitle: string;
  releaseYear: number | null;
  endYear: number | null;
  decade: string | null;
  era: MediaEra | null;
  popularityPrior: number;
  verified: boolean;
  attributes: Record<string, string | boolean | number>;
  posterUrl?: string | null;
}

export interface QuestionOption {
  value: string;
  label: string;
}

export interface ActiveQuestion {
  questionIndex: number;
  maxQuestions: number;
  isBonus: boolean;
  isFinalClue: boolean;
  attributeKey: string;
  question: string;
  options: QuestionOption[];
  candidatesRemaining: number;
  topScorePct: number;
  confidencePct: number;
  confidenceLabel: ConfidenceLabel;
  rangeMin?: number;
  rangeMax?: number;
  aiFallback?: boolean;
  aiError?: string;
}

export interface AnswerLogEntry {
  questionIndex: number;
  attributeKey: string;
  questionText: string;
  userAnswer: string;
  userAnswerLabel: string;
  candidatesRemaining: number;
  topScorePct: number;
}

export interface RankedCandidate {
  id: string;
  name: string;
  subtitle: string;
  category: CategoryId;
  industry: string | null;
  releaseYear: number | null;
  endYear: number | null;
  decade: string | null;
  era: MediaEra | null;
  scorePct: number;
  posterUrl?: string | null;
  attributes: Record<string, string | boolean | number>;
}

export interface RevealPayload {
  sessionId: string;
  category: CategoryId;
  industry: string | null;
  isDeterministic: boolean;
  topCandidate: RankedCandidate;
  runnersUp: RankedCandidate[];
  confidencePct: number;
  confidenceLabel: ConfidenceLabel;
  questionsAsked: number;
  explanation: string;
  timelineChip: string | null;
  canOfferBonus: boolean;
  bonusRemaining: number;
  answersHistory: AnswerLogEntry[];
  aiFallback?: boolean;
  aiError?: string;
}

export interface BadgeInfo {
  key: string;
  name: string;
  description: string;
  unlocked: boolean;
  unlockedAt?: string;
}

export interface RankInfo {
  name: 'Curious' | 'Thinker' | 'Analyst' | 'Mind Reader' | 'Oracle';
  minPoints: number;
  nextRankName: string | null;
  nextRankPoints: number | null;
  progressPct: number;
}

export interface UserProfile {
  id: number;
  nickname: string;
  totalPoints: number;
  gamesPlayed: number;
  successfulGuesses: number;
  riddlesSolved: number;
  riddleStreak: number;
  bestRiddleStreak: number;
  currentStreak: number;
  bestStreak: number;
  accuracyPct: number;
  rank: RankInfo;
  badges: BadgeInfo[];
  recentSessions: Array<{
    id: string;
    category: CategoryId;
    industry: string | null;
    topName: string | null;
    confidencePct: number;
    predictedCorrect: boolean | null;
    pointsAwarded: number;
    createdAt: string;
  }>;
}

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  nickname: string;
  points: number;
  correctPredictions: number;
  riddleScore: number;
  riddlesSolved: number;
  isCurrentUser: boolean;
}

export interface RiddleItem {
  id: number;
  attemptToken: string;
  category: RiddleCategory;
  difficulty: RiddleDifficulty;
  question: string;
  options: string[];
  timeLimitSec: number;
  asOfDate: string | null;
  sources: Array<{ title: string; uri: string }>;
  verified: boolean;
  basePoints: number;
}

export const CATEGORIES: CategoryMeta[] = [
  {
    id: 'movie',
    name: 'Movie & Series',
    description: 'Cinema, web series, and anime narrowed by industry, era, and theme.',
    icon: 'Film',
    hasTimeline: true,
    isDeterministic: false,
    subSelectorLabel: 'Choose Industry',
    subOptions: [
      'Bollywood',
      'Hollywood',
      'Tollywood',
      'Kollywood',
      'Mollywood/Sandalwood',
      'Korean',
      'Web Series',
      'Anime',
    ],
    accentColor: '#7C3AED',
  },
  {
    id: 'song',
    name: 'Song',
    description: 'Tracks identified by industry, language, mood, tempo, and decade.',
    icon: 'Music',
    hasTimeline: true,
    isDeterministic: false,
    subSelectorLabel: 'Choose Industry & Language',
    subOptions: [
      'Bollywood (Hindi)',
      'Hollywood (English)',
      'Tollywood (Telugu)',
      'Kollywood (Tamil)',
      'Mollywood/Sandalwood',
      'Korean (K-Pop)',
      'Web Series OST',
      'Anime OST',
    ],
    accentColor: '#E879F9',
  },
  {
    id: 'actor',
    name: 'Actor',
    description: 'Screen icons deduced through industry, signature genres, and debut era.',
    icon: 'Clapperboard',
    hasTimeline: true,
    isDeterministic: false,
    subSelectorLabel: 'Choose Industry',
    subOptions: [
      'Bollywood',
      'Hollywood',
      'Tollywood',
      'Kollywood',
      'Mollywood/Sandalwood',
      'Korean',
      'Web Series',
      'Anime',
    ],
    accentColor: '#38BDF8',
  },
  {
    id: 'singer',
    name: 'Singer',
    description: 'Vocalists and bands traced via language, voice style, and debut decade.',
    icon: 'Mic2',
    hasTimeline: true,
    isDeterministic: false,
    subSelectorLabel: 'Choose Industry & Language',
    subOptions: [
      'Bollywood (Hindi)',
      'Hollywood (English)',
      'Tollywood (Telugu)',
      'Kollywood (Tamil)',
      'Mollywood/Sandalwood',
      'Korean (K-Pop)',
      'Independent / Global',
      'Anime / J-Pop',
    ],
    accentColor: '#F472B6',
  },
  {
    id: 'sports_person',
    name: 'Sports Person',
    description: 'Athletes and legends split by sport, country, role, and trophy era.',
    icon: 'Trophy',
    hasTimeline: true,
    isDeterministic: false,
    subSelectorLabel: 'Choose Sport',
    subOptions: [
      'Cricket',
      'Football',
      'Tennis',
      'Basketball',
      'Athletics & Olympics',
      'Combat & Motorsport',
    ],
    accentColor: '#22C55E',
  },
  {
    id: 'number',
    name: 'Number',
    description: 'Exact mathematical search using live range halving and number properties.',
    icon: 'Hash',
    hasTimeline: false,
    isDeterministic: true,
    subSelectorLabel: 'Choose Number Range',
    subOptions: ['1–100', '1–1000'],
    accentColor: '#38BDF8',
  },
  {
    id: 'dob',
    name: 'Date of Birth',
    description: 'Exact calendar deduction narrowing month, season, and day in ~9 steps.',
    icon: 'Calendar',
    hasTimeline: false,
    isDeterministic: true,
    subSelectorLabel: 'Optional Birth-Year Range',
    subOptions: ['Any / Skip Birth Year', '1960–1989', '1990–2004', '2005–2020'],
    accentColor: '#A78BFA',
  },
  {
    id: 'food',
    name: 'Food',
    description: 'Dishes narrowed by cuisine, flavour profile, meal type, and street vs dine-in.',
    icon: 'Utensils',
    hasTimeline: false,
    isDeterministic: false,
    accentColor: '#F59E0B',
  },
  {
    id: 'place',
    name: 'Place',
    description: 'Cities, islands, and landmarks deduced via continent, terrain, and climate.',
    icon: 'Globe2',
    hasTimeline: false,
    isDeterministic: false,
    accentColor: '#06B6D4',
  },
  {
    id: 'colour',
    name: 'Colour',
    description: 'Exact search across spectrum family, temperature, brightness, and rainbow order.',
    icon: 'Palette',
    hasTimeline: false,
    isDeterministic: true,
    accentColor: '#EC4899',
  },
  {
    id: 'animal',
    name: 'Animal',
    description: 'Creatures narrowed by habitat, diet, size, movement, and domestication.',
    icon: 'PawPrint',
    hasTimeline: false,
    isDeterministic: false,
    accentColor: '#10B981',
  },
  {
    id: 'weather',
    name: 'Weather',
    description: 'Atmospheric conditions identified by sky, season, temperature, and intensity.',
    icon: 'CloudSun',
    hasTimeline: false,
    isDeterministic: false,
    accentColor: '#60A5FA',
  },
  {
    id: 'alphabet',
    name: 'Alphabet',
    description: 'Exact search across A–Z using half, vowel type, geometry, and stroke shape.',
    icon: 'CaseSensitive',
    hasTimeline: false,
    isDeterministic: true,
    accentColor: '#8B5CF6',
  },
  {
    id: 'word',
    name: 'Word',
    description: 'Everyday vocabulary deduced via length, starting letter, category, and tone.',
    icon: 'BookOpen',
    hasTimeline: false,
    isDeterministic: false,
    accentColor: '#C084FC',
  },
];

export const RIDDLE_CATEGORIES: RiddleCategory[] = [
  'Politics and Governance',
  'Society',
  'Technology',
  'Innovation and Science',
  'General Knowledge',
];

export const RIDDLE_DIFFICULTIES: Array<{
  level: RiddleDifficulty;
  timeLimitSec: number;
  basePoints: number;
  description: string;
}> = [
  { level: 'Easy', timeLimitSec: 30, basePoints: 10, description: '30s timer · 10 base pts' },
  { level: 'Medium', timeLimitSec: 25, basePoints: 20, description: '25s timer · 20 base pts' },
  { level: 'Hard', timeLimitSec: 20, basePoints: 30, description: '20s timer · 30 base pts' },
];
