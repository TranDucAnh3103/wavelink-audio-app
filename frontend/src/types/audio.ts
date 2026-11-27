export interface Episode {
  id: number;
  audioId?: number;
  episodeNumber: number;
  title: string;
  startSeconds: number;
  endSeconds: number;
  duration?: number;
  completed?: boolean;
  progressPercent?: number;
  positionSeconds?: number;
  isLocked?: boolean;
  isVip?: boolean;
}

export interface AudioItem {
  id: number;
  youtubeVideoId: string;
  youtubeUrl: string;
  title: string;
  author: string;
  channel?: string;
  description?: string;
  categoryId: number;
  categoryName?: string;
  tags?: string[];
  thumbnailUrl: string;
  totalDurationSeconds: number;
  formattedDuration?: string;
  totalEpisodes: number;
  status?: string; // 'ACTIVE' | 'PLAYING' | 'HIDDEN'
  streamStatus?: 'UNKNOWN' | 'OK' | 'FAILED';
  audioMime?: string;
  currentEpisodeId?: number;
  currentEpisodeNumber?: number;
  currentEpisodeTitle?: string;
  lastPositionSeconds?: number;
  formattedPosition?: string;
  progressPercent?: number;
  isFavorite?: boolean;
  isVIPOnly?: boolean;
  isVipOnly?: boolean;
  freeEpisodesCount?: number;
  createdBy?: number;
  createdAt?: string;
  updatedAt?: string;
  episodes?: Episode[];
  viewCount?: number;
}

export interface AudioFilter {
  search?: string;
  categoryId?: number | null;
  status?: string | null; // 'all' | 'my' | 'listening' | 'completed' | 'favorite'
  tag?: string;
  page?: number;
  limit?: number;
  pageSize?: number;
  my?: boolean;
  userId?: number | string;
  createdBy?: number | string;
  sort?: string;
  fields?: 'lite' | 'catalog';
  all?: boolean;
}

export interface YouTubePreviewData {
  videoId: string;
  title: string;
  author: string;
  durationSeconds: number;
  formattedDuration: string;
  thumbnailUrl: string;
  description?: string;
}

export interface ImportYouTubePayload {
  url: string;
  categoryId: number;
  tags: string[];
  blockSizeSeconds?: number;
  durationSeconds?: number;
  isVipOnly?: boolean;
  freeEpisodesCount?: number;
}

export interface ImportResult {
  duplicate?: boolean;
  audio: AudioItem;
}

export interface ImportQuota {
  isGuest: boolean;
  isVipOrAdmin: boolean;
  todayImportCount: number;
  maxImportsPerDay: number;
  remaining: number;
  canImport: boolean;
  reason?: string;
}

export interface StreamTokenResponse {
  streamToken: string;
  videoId: string;
  streamPath: string;
  streamUrl: string;
  expiresAt: string;
  streamStatus?: 'UNKNOWN' | 'OK' | 'FAILED';
  audioMime?: string;
}
