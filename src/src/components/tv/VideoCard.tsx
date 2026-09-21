'use client';

import { Play, Radio, Youtube, Video } from 'lucide-react';
import { formatDuration } from '@/lib/tv/scheduler';
import type { NormalizedMediaItem } from '@/lib/tv/types';

interface VideoCardProps {
  item: NormalizedMediaItem;
  channelNumber: number;
  channelName: string;
  playlistTitle?: string;
  isLiveNow?: boolean;
  onTuneIn: () => void;
}

export function VideoCard({
  item,
  channelNumber,
  channelName,
  playlistTitle,
  isLiveNow,
  onTuneIn,
}: VideoCardProps) {
  const platformLabel =
    item.source === 'youtube'
      ? 'YouTube'
      : item.source === 'vimeo'
      ? 'Vimeo'
      : item.source === 'dailymotion'
      ? 'Dailymotion'
      : item.source;

  return (
    <div
      onClick={onTuneIn}
      className="group flex cursor-pointer flex-col gap-3 transition-all duration-200"
    >
      {/* Thumbnail Surface */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-card border border-border ring-1 ring-border/50 transition-all group-hover:rounded-none group-hover:shadow-xl group-hover:ring-1 group-hover:ring-primary/40">
        {item.thumbnailUrl ? (
          <img
            src={item.thumbnailUrl}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <Radio className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        {/* Play Overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-200 group-hover:scale-110">
            <Play className="ml-1 h-6 w-6 fill-primary-foreground" />
          </div>
        </div>

        {/* Source Platform Badge */}
        <div className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 font-sans text-[10px] font-medium text-white backdrop-blur-sm">
          {item.source === 'youtube' ? (
            <Youtube className="h-3 w-3 text-red-500" />
          ) : (
            <Video className="h-3 w-3 text-blue-400" />
          )}
          <span>{platformLabel}</span>
        </div>

        {/* Duration / LIVE Badge */}
        <div className="absolute bottom-2 right-2">
          {isLiveNow ? (
            <span className="flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-primary-foreground shadow">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse" />
              ON AIR
            </span>
          ) : (
            <span className="rounded bg-black/80 px-1.5 py-0.5 font-mono text-[11px] font-medium text-white backdrop-blur-sm">
              {formatDuration(item.duration)}
            </span>
          )}
        </div>
      </div>

      {/* Info Content */}
      <div className="flex gap-3">
        {/* Channel Avatar */}
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-xs font-bold shadow-sm ${
            isLiveNow
              ? 'bg-gradient-to-br from-primary to-primary/80 text-primary-foreground ring-2 ring-primary/50'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {String(channelNumber).padStart(2, '0')}
        </div>

        <div className="flex flex-col min-w-0">
          {/* Title */}
          <h3 className="line-clamp-2 font-sans text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
            {item.title}
          </h3>

          {/* Channel Name */}
          <p className="mt-1 font-sans text-xs text-muted-foreground transition-colors group-hover:text-foreground">
            CH {String(channelNumber).padStart(3, '0')} · {channelName}
          </p>

          {/* Playlist & Meta */}
          <p className="font-sans text-[11px] text-muted-foreground truncate opacity-80">
            {playlistTitle ? playlistTitle : 'TV Broadcast Item'}
          </p>
        </div>
      </div>
    </div>
  );
}
