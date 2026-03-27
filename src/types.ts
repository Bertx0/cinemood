export type ContentType = 'film' | 'tv';
export type Platform = 'Netflix' | 'Prime Video' | 'Now' | 'Disney+';
export type WatchStatus = 'to-watch' | 'watching' | 'watched';

export interface WatchlistItem {
  id?: string;
  title: string;
  type: ContentType;
  platform?: Platform;
  duration?: string;
  releaseYear?: number;
  genres?: string[];
  tmdbId?: number;
  status: WatchStatus;
  rating?: number;
  moodTags?: string[];
  userUid: string;
  createdAt: any; // Firestore Timestamp
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  role: 'user';
}
