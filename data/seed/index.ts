import { getDb } from '../../db/database.ts';
import type { CandidateRecord } from '../../shared/types.ts';
import { ACTOR_CANDIDATES } from './actors.ts';
import {
  ALPHABET_CANDIDATES,
  ANIMAL_CANDIDATES,
  COLOUR_CANDIDATES,
  FOOD_CANDIDATES,
  PLACE_CANDIDATES,
  WEATHER_CANDIDATES,
  WORD_CANDIDATES,
} from './general.ts';
import { MOVIE_CANDIDATES } from './movies.ts';
import { VERIFIED_SEED_RIDDLES } from './riddlesSeed.ts';
import { SINGER_CANDIDATES } from './singers.ts';
import { SONG_CANDIDATES } from './songs.ts';
import { SPORTS_CANDIDATES } from './sports.ts';

const VALID_ERAS = new Set(['classic', '90s', '2000s', '2010s', '2020s']);

export function validateCandidate(c: CandidateRecord): boolean {
  if (!c.id || !c.name || !c.category) return false;
  if (c.releaseYear !== null) {
    if (c.releaseYear < 1900 || c.releaseYear > 2027) return false;
    if (!c.era || !VALID_ERAS.has(c.era)) return false;
  }
  if (!c.attributes || Object.keys(c.attributes).length < 4) return false;
  return true;
}

export function getAllSeedCandidates(): CandidateRecord[] {
  return [
    ...MOVIE_CANDIDATES,
    ...SONG_CANDIDATES,
    ...ACTOR_CANDIDATES,
    ...SINGER_CANDIDATES,
    ...SPORTS_CANDIDATES,
    ...FOOD_CANDIDATES,
    ...PLACE_CANDIDATES,
    ...COLOUR_CANDIDATES,
    ...ANIMAL_CANDIDATES,
    ...WEATHER_CANDIDATES,
    ...ALPHABET_CANDIDATES,
    ...WORD_CANDIDATES,
  ].filter(validateCandidate);
}

export function seedDatabaseIfNeeded(): { candidatesCount: number; riddlesCount: number } {
  const db = getDb();
  const candidates = getAllSeedCandidates();

  const insertCandidate = db.prepare(`
    INSERT OR IGNORE INTO candidates (
      id, category, industry, name, subtitle, release_year, end_year,
      decade, era, popularity_prior, verified, attributes_json, poster_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seedTx = db.transaction((items: CandidateRecord[]) => {
    for (const c of items) {
      insertCandidate.run(
        c.id,
        c.category,
        c.industry,
        c.name,
        c.subtitle,
        c.releaseYear,
        c.endYear,
        c.decade,
        c.era,
        c.popularityPrior,
        c.verified ? 1 : 0,
        JSON.stringify(c.attributes),
        c.posterUrl ?? null
      );
    }
  });
  seedTx(candidates);

  const insertRiddle = db.prepare(`
    INSERT OR IGNORE INTO riddles (
      category, difficulty, question, options_json, correct_index,
      hint, explanation, as_of_date, sources_json, verified
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const riddleTx = db.transaction(() => {
    for (const r of VERIFIED_SEED_RIDDLES) {
      insertRiddle.run(
        r.category,
        r.difficulty,
        r.question,
        JSON.stringify(r.options),
        r.correctIndex,
        r.hint,
        r.explanation,
        r.asOfDate,
        JSON.stringify(r.sources)
      );
    }
  });
  riddleTx();

  const cRow = db.prepare('SELECT COUNT(*) as cnt FROM candidates WHERE verified = 1').get() as { cnt: number };
  const rRow = db.prepare('SELECT COUNT(*) as cnt FROM riddles WHERE verified = 1').get() as { cnt: number };
  return { candidatesCount: cRow.cnt, riddlesCount: rRow.cnt };
}
