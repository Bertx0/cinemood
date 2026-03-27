export interface DetailedFilmInfo {
  title: string;
  type: 'film' | 'tv';
  summary: string;
  cast: string[];
  director?: string;
  releaseYear?: number;
  rating?: string;
  duration?: string;
  genres: string[];
  availability: {
    platform: string;
    isAvailable: boolean;
  }[];
  posterUrl?: string;
  sourceUrl?: string;
  tmdbId: number;
}

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const API_KEY = (import.meta as any).env.VITE_TMDB_API_KEY;

async function fetchFromTMDB(endpoint: string, params: Record<string, string> = {}) {
  const queryParams = new URLSearchParams({
    api_key: API_KEY,
    ...params,
  });
  
  const response = await fetch(`${TMDB_BASE_URL}${endpoint}?${queryParams.toString()}`);
  if (!response.ok) {
    throw new Error(`TMDB error: ${response.statusText}`);
  }
  return response.json();
}

const getTmdbLanguage = (lang?: string) => {
  const map: Record<string, string> = {
    en: 'en-US',
    fr: 'fr-FR',
    it: 'it-IT',
    de: 'de-DE',
    es: 'es-ES',
    ja: 'ja-JP'
  };
  return map[lang || 'en'] || 'en-US';
};

export async function getFilmDetailsById(id: number, mediaType: 'movie' | 'tv', language: string = 'en'): Promise<DetailedFilmInfo | null> {
  try {
    const isTv = mediaType === 'tv';
    // 2. Fetch specific details with providers & credits attached
    const details = await fetchFromTMDB(`/${mediaType}/${id}`, {
      append_to_response: 'credits,watch/providers,release_dates,content_ratings',
      language: getTmdbLanguage(language)
    });

    // Extract basic info
    const title = details.title || details.name;
    const summary = details.overview;
    const releaseYear = details.release_date
      ? new Date(details.release_date).getFullYear()
      : details.first_air_date
      ? new Date(details.first_air_date).getFullYear()
      : undefined;
      
    // high quality poster url
    const posterUrl = details.poster_path 
      ? `https://image.tmdb.org/t/p/w780${details.poster_path}` 
      : undefined;
    
    // Extract cast members
    const cast = details.credits?.cast?.slice(0, 5).map((c: any) => c.name) || [];
    
    // Extract director
    const directorObj = details.credits?.crew?.find((c: any) => c.job === 'Director');
    const director = directorObj ? directorObj.name : undefined;

    // Genres map
    const genres = details.genres?.map((g: any) => g.name) || [];

    // Formatted Duration
    const durationMins = details.runtime || (details.episode_run_time && details.episode_run_time[0]);
    const duration = durationMins ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m` : undefined;

    // Try to get US or IT rating
    let rating = '13+';
    if (isTv && details.content_ratings?.results) {
      const usRating = details.content_ratings.results.find((r: any) => r.iso_3166_1 === 'US' || r.iso_3166_1 === 'IT');
      if (usRating) rating = usRating.rating;
    } else if (!isTv && details.release_dates?.results) {
      const usRelease = details.release_dates.results.find((r: any) => r.iso_3166_1 === 'US' || r.iso_3166_1 === 'IT');
      if (usRelease && usRelease.release_dates[0]) {
        rating = usRelease.release_dates[0].certification || '13+';
      }
    }
    if (!rating) rating = 'NR';

    // 3. Extract availability (Assuming Italian region 'IT' given earlier user context)
    const itProviders = details['watch/providers']?.results?.IT;
    const flatrateProviders = itProviders?.flatrate?.map((p: any) => p.provider_name) || [];

    const checkPlatform = (tmdbNames: string[]) => {
      return tmdbNames.some(name => flatrateProviders.includes(name));
    };

    const availability = [
      {
        platform: 'Netflix',
        isAvailable: checkPlatform(['Netflix', 'Netflix basic with Ads'])
      },
      {
        platform: 'Prime Video',
        isAvailable: checkPlatform(['Amazon Prime Video'])
      },
      {
        platform: 'Now',
        isAvailable: checkPlatform(['Now TV'])
      },
      {
        platform: 'Disney+',
        isAvailable: checkPlatform(['Disney Plus'])
      }
    ];

    return {
      title,
      type: isTv ? 'tv' : 'film',
      summary,
      cast,
      director,
      releaseYear,
      rating: rating.toString(),
      duration,
      genres,
      availability,
      posterUrl,
      sourceUrl: `https://www.themoviedb.org/${mediaType}/${id}`,
      tmdbId: id
    };

  } catch (error) {
    console.error("TMDB fetch details error:", error);
    return null;
  }
}

export async function searchFilm(query: string, language: string = 'en'): Promise<DetailedFilmInfo | null> {
  if (!API_KEY) {
    console.error("TMDB API Key missing! Add VITE_TMDB_API_KEY to your .env file.");
    return null;
  }
  try {
    // 1. Search multi endpoint for movies and TV
    const searchResult = await fetchFromTMDB('/search/multi', {
      query,
      language: getTmdbLanguage(language),
      page: '1',
      include_adult: 'false'
    });

    if (!searchResult.results || searchResult.results.length === 0) {
      return null;
    }

    // Grab the first movie or tv result
    const firstResult = searchResult.results.find(
      (r: any) => r.media_type === 'movie' || r.media_type === 'tv'
    );
    if (!firstResult) return null;

    const isTv = firstResult.media_type === 'tv';
    const id = firstResult.id;

    return await getFilmDetailsById(id, firstResult.media_type, language);

  } catch (error) {
    console.error("TMDB fetch error:", error);
    return null;
  }
}

export interface SearchSuggestion {
  id: number;
  title: string;
  type: 'film' | 'tv';
  year?: number;
}

export async function getSearchSuggestions(query: string, language: string = 'en'): Promise<SearchSuggestion[]> {
  if (!API_KEY || !query.trim()) return [];
  try {
    const searchResult = await fetchFromTMDB('/search/multi', {
      query,
      language: getTmdbLanguage(language),
      page: '1',
      include_adult: 'false'
    });

    if (!searchResult.results) return [];

    return searchResult.results
      .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
      .slice(0, 5)
      .map((r: any) => ({
        id: r.id,
        title: r.title || r.name,
        type: r.media_type === 'tv' ? 'tv' : 'film',
        year: r.release_date
          ? new Date(r.release_date).getFullYear()
          : r.first_air_date
          ? new Date(r.first_air_date).getFullYear()
          : undefined
      }));
  } catch (error) {
    console.error("TMDB suggestion fetch error:", error);
    return [];
  }
}

export interface SearchResultItem extends SearchSuggestion {
  posterUrl?: string;
  summary?: string;
}

export async function searchAll(query: string, language: string = 'en'): Promise<SearchResultItem[]> {
  if (!API_KEY || !query.trim()) return [];
  try {
    const searchResult = await fetchFromTMDB('/search/multi', {
      query,
      language: getTmdbLanguage(language),
      page: '1',
      include_adult: 'false'
    });

    if (!searchResult.results) return [];

    return searchResult.results
      .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
      .slice(0, 20)
      .map((r: any) => ({
        id: r.id,
        title: r.title || r.name,
        type: r.media_type === 'tv' ? 'tv' : 'film',
        year: r.release_date
          ? new Date(r.release_date).getFullYear()
          : r.first_air_date
          ? new Date(r.first_air_date).getFullYear()
          : undefined,
        posterUrl: r.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : undefined,
        summary: r.overview
      }));
  } catch (error) {
    console.error("TMDB searchAll fetch error:", error);
    return [];
  }
}
