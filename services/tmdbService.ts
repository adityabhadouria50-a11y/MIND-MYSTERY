import { getDb } from '../db/database.ts';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

export async function fetchAndCacheTmdbPoster(params: {
  candidateId: string;
  name: string;
  category: string;
  industry: string | null;
  releaseYear: number | null;
  existingPosterUrl?: string | null;
}): Promise<string | null> {
  if (params.existingPosterUrl) {
    return params.existingPosterUrl;
  }

  const apiKey = process.env.TMDB_API_KEY?.trim();
  if (!apiKey || params.category !== 'movie') {
    return null;
  }

  try {
    const isSeries = params.industry === 'Web Series' || params.industry === 'Anime';
    const endpoint = isSeries ? 'tv' : 'movie';
    const query = encodeURIComponent(params.name);
    const yearParam = params.releaseYear
      ? isSeries
        ? `&first_air_date_year=${params.releaseYear}`
        : `&year=${params.releaseYear}`
      : '';
    const url = `https://api.themoviedb.org/3/search/${endpoint}?api_key=${encodeURIComponent(
      apiKey
    )}&query=${query}${yearParam}&include_adult=false`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      const data = (await res.json()) as { results?: Array<{ poster_path?: string }> };
      const posterPath = data.results?.find((r) => r.poster_path)?.poster_path;
      if (!posterPath) return null;
      const fullUrl = `${TMDB_IMAGE_BASE}${posterPath}`;

      const db = getDb();
      db.prepare('UPDATE candidates SET poster_url = ? WHERE id = ?').run(fullUrl, params.candidateId);
      return fullUrl;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}
