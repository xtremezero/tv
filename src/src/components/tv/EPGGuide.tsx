'use client';

import { useEffect, useRef } from 'react';
import { X, Radio } from 'lucide-react';
import { computeEpgSchedule, formatClock, formatDuration } from '@/lib/tv/scheduler';
import type { ChannelConfig, NormalizedMediaItem } from '@/lib/tv/types';

interface EPGGuideProps {
  channel: ChannelConfig;
  schedule: NormalizedMediaItem[];
  queueIndex: number;
  onClose: () => void;
}

/**
 * Electronic Program Guide — 2D schedule matrix (G key).
 */
export function EPGGuide({ channel, schedule, queueIndex, onClose }: EPGGuideProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const entries = computeEpgSchedule(schedule, {
    mode: channel.playbackMode,
    queueIndex,
    epochStartTimeMs: channel.epochStartTime,
    count: 50,
  });

  useEffect(() => {
    // Scroll the live row into view on open
    const live = scrollRef.current?.querySelector('[data-live="true"]');
    live?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={onClose}>
      <div
        className="flex h-[82%] w-[90%] max-w-3xl flex-col rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="epg-guide"
      >
        <div className="flex items-center justify-between border-b border-border bg-muted/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-mono text-xs font-bold text-primary-foreground shadow">
              {String(channel.channelNumber).padStart(2, '0')}
            </div>
            <div>
              <p className="font-sans text-base font-bold tracking-tight text-popover-foreground">
                CH {String(channel.channelNumber).padStart(3, '0')} · {channel.name}
              </p>
              <p className="font-sans text-xs text-muted-foreground">
                {channel.playbackMode === 'linear'
                  ? 'VIRTUAL LINEAR BROADCAST — GRID ANCHORED TO CHANNEL EPOCH'
                  : 'UPCOMING PROGRAMMING — PROJECTED FROM CURRENT POSITION'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-popover-foreground"
            aria-label="Close guide"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div ref={scrollRef} className="tv-scroll flex-1 overflow-y-auto px-4 py-3">
          {entries.length === 0 ? (
            <p className="py-12 text-center font-sans text-sm text-muted-foreground">
              NO PROGRAMMING SCHEDULED — ADD PLAYLISTS VIA CONTROL ROOM
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((entry) => (
                <li
                  key={`${entry.index}-${entry.startMs}`}
                  data-live={entry.isLive}
                  className={`flex items-center gap-4 rounded-xl px-3 py-2.5 transition-colors ${
                    entry.isLive ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-muted'
                  }`}
                >
                  <span className="w-16 shrink-0 font-mono text-xs font-semibold text-muted-foreground">
                    {formatClock(entry.startMs)}
                  </span>
                  {entry.item.thumbnailUrl ? (
                    <img
                      src={entry.item.thumbnailUrl}
                      alt=""
                      className="h-10 w-18 shrink-0 rounded-lg border border-border object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-10 w-18 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Radio className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                  <span className="min-w-0 flex-1 truncate font-sans text-sm font-medium text-popover-foreground">
                    {entry.item.title}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {formatDuration(entry.item.duration)}
                  </span>
                  {entry.isLive && (
                    <span className="flex items-center gap-1 shrink-0 rounded bg-primary px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-primary-foreground shadow">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-ping" />
                      ON AIR
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-border bg-muted/60 px-6 py-3 flex items-center justify-between">
          <p className="font-sans text-xs text-muted-foreground">
            Press <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-popover-foreground border border-border">G</kbd> or <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-popover-foreground border border-border">ESC</kbd> to close guide
          </p>
          <button
            onClick={onClose}
            className="rounded-full bg-secondary px-4 py-1.5 font-sans text-xs font-semibold text-secondary-foreground hover:bg-muted"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
