/**
 * Canonical data model for the pseudo-linear television engine.
 * Platform-specific identifiers are decoupled from the internal player so the
 * scheduling matrix can process media objects interchangeably.
 */

export type VideoSource = 'youtube' | 'vimeo' | 'dailymotion';

/** A single normalized media asset from any supported platform. */
export interface NormalizedMediaItem {
  /** Scoped identifier: `${source}:${sourceId}` */
  id: string;
  /** Native platform video identifier */
  sourceId: string;
  source: VideoSource;
  title: string;
  /** Runtime normalized strictly to integer seconds */
  duration: number;
  thumbnailUrl: string;
  /** Resolvable playback or embed URI */
  playbackUrl: string;
  isEmbeddable: boolean;
}

export interface PlaylistDefinition {
  id: string;
  title: string;
  source: VideoSource;
  /** Original user-supplied URL */
  sourceUrl: string;
  items: NormalizedMediaItem[];
  /** Randomize this pool with Fisher-Yates before the merge step */
  shuffle: boolean;
  /** Proportional scheduling factor (default: 1) */
  weight?: number;
}

export type PlaybackMode = 'queue' | 'linear';

export interface ChannelConfig {
  id: string;
  /** 1..999 virtual channel number used by the numeric keypad */
  channelNumber: number;
  name: string;
  playlists: PlaylistDefinition[];
  /**
   * 'queue'  = Sequential Interleaved Queue (A1,B1,C1,A2,B2,C2,...)
   * 'linear' = Virtual Linear Broadcast anchored to epochStartTime
   */
  playbackMode: PlaybackMode;
  /** Unix epoch in milliseconds — immutable temporal origin for linear mode */
  epochStartTime: number;
  /**
   * Persisted composite broadcast order as media item ids.
   * Survives reloads so the viewer resumes the same broadcast position.
   */
  queue: string[];
  /** Index of the program currently on air (queue mode) */
  queueIndex: number;
  createdAt: number;
}

export interface IngestRequest {
  url: string;
  youTubeApiKey?: string;
}

export interface IngestSuccess {
  playlist: PlaylistDefinition;
}

export interface IngestFailure {
  error: string;
}

export type IngestResponse = IngestSuccess | IngestFailure;

export interface PlaybackProgress {
  playedSeconds: number;
  durationSeconds: number;
}
