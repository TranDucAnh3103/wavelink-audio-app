import { AudioItem, Episode } from './audio';

export interface ListeningHistoryItem {
  id?: number;
  audioId: number;
  episodeId: number;
  title?: string;
  currentEpisodeId?: number;
  currentEpisodeNumber?: number;
  currentEpisodeTitle?: string;
  episodeTitle?: string;
  thumbnailUrl?: string;
  lastPositionSeconds?: number;
  formattedPosition?: string;
  progressPercent?: number;
  durationListened?: number;
  totalDurationListened?: number;
  createdAt?: string;
}

export interface RecordHistoryPayload {
  audioId: number;
  episodeId: number;
  durationListened: number;
  totalDurationListened?: number;
  audio?: AudioItem | null;
  episode?: Episode | null;
  positionSeconds?: number;
  progressPercent?: number;
}
