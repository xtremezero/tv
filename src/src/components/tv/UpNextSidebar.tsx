'use client';

import { ListVideo, Play } from 'lucide-react';
import { formatDuration } from '@/lib/tv/scheduler';
import type { NormalizedMediaItem } from '@/lib/tv/types';

interface UpNextSidebarProps {
  schedule: NormalizedMediaItem[];
  currentIndex: number;
  channelNumber: number;
  channelName: string;
  onSelectProgram: (index: number) => void;
  onOpenEPG: () => void;
}

export function UpNextSidebar({
  schedule,
  currentIndex,
  channelNumber,
  channelName,
  onSelectProgram,
  onOpenEPG,
}: UpNextSidebarProps) {
  if (schedule.length === 0) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-center text-card-foreground">
        <p className="text-xs text-muted-foreground">No scheduled items in queue</p>
        <button
          onClick={onOpenEPG}
          className="mx-auto rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground hover:bg-muted"
        >
          Open Program Guide
        </button>
      </div>
    );
  }

  // Display current item + next 20 items in queue
  const displayItems = schedule.map((item, idx) => ({
    item,
    idx,
    isCurrent: idx === currentIndex,
  }));

  return (
    <aside className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h3 className="font-sans text-base font-bold text-foreground">Up Next</h3>
        <button
          onClick={onOpenEPG}
          className="flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ListVideo className="h-3.5 w-3.5 text-primary" />
          Full Guide
        </button>
      </div>

      {/* Program List */}
      <div className="flex flex-col gap-2.5">
        {displayItems.map(({ item, idx, isCurrent }) => (
          <div
            key={`${item.id}-${idx}`}
            onClick={() => onSelectProgram(idx)}
            className={`group flex cursor-pointer gap-2.5 rounded-xl p-1.5 transition-colors border border-transparent ${
              isCurrent
                ? 'bg-secondary ring-1 ring-primary/40 border-primary/20'
                : 'hover:bg-secondary/60'
            }`}
          >
            {/* Thumbnail */}
            <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-lg bg-muted border border-border">
              {item.thumbnailUrl ? (
                <img
                  src={item.thumbnailUrl}
                  alt={item.title}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted">
                  <Play className="h-4 w-4 text-muted-foreground" />
                </div>
              )}

              {/* Hover play icon */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <Play className="h-5 w-5 fill-white text-white" />
              </div>

              {/* Duration badge */}
              <div className="absolute bottom-1 right-1 rounded bg-black/80 px-1 py-0.2 font-mono text-[10px] text-white">
                {formatDuration(item.duration)}
              </div>
            </div>

            {/* Info */}
            <div className="flex flex-col justify-between min-w-0 py-0.5">
              <div>
                <h4
                  className={`line-clamp-2 font-sans text-xs font-semibold leading-tight ${
                    isCurrent ? 'text-primary' : 'text-foreground group-hover:text-primary'
                  }`}
                >
                  {item.title}
                </h4>
                <p className="mt-1 font-sans text-[11px] text-muted-foreground">
                  CH {String(channelNumber).padStart(3, '0')} · {channelName}
                </p>
              </div>

              {isCurrent ? (
                <span className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
                  NOW PLAYING
                </span>
              ) : (
                <span className="font-mono text-[10px] text-muted-foreground">
                  Track #{idx + 1}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
