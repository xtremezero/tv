'use client';

import { formatDuration } from '@/lib/tv/scheduler';
import type { PlaybackMode } from '@/lib/tv/types';

/** Glowing phosphor on-screen display elements. Auto-hide is orchestrated by TVClient. */

export function OSDTop({ channelNumber, name, mode }: { channelNumber: number; name: string; mode: PlaybackMode }) {
  return (
    <div className="flex items-start gap-3" data-testid="osd-top">
      <span className="osd-glow rounded border border-emerald-400/40 bg-black/60 px-2 py-1 font-mono text-lg font-bold tracking-widest text-emerald-400">
        CH {String(channelNumber).padStart(3, '0')}
      </span>
      <div className="flex flex-col">
        <span className="osd-glow font-mono text-sm font-semibold tracking-wider text-emerald-300">{name}</span>
        <span className="font-mono text-[10px] tracking-[0.25em] text-emerald-200/60">
          {mode === 'linear' ? 'VIRTUAL LINEAR BROADCAST · LIVE' : 'SEQUENTIAL INTERLEAVED QUEUE'}
        </span>
      </div>
    </div>
  );
}

export function OSDNow({
  title,
  playlistTitle,
  playedSeconds,
  durationSeconds,
}: {
  title: string;
  playlistTitle?: string;
  playedSeconds: number;
  durationSeconds: number;
}) {
  const pct = durationSeconds > 0 ? Math.min(100, (playedSeconds / durationSeconds) * 100) : 0;
  return (
    <div className="max-w-md" data-testid="osd-now">
      <p className="osd-glow truncate font-mono text-sm font-medium text-emerald-300">{title}</p>
      {playlistTitle ? (
        <p className="truncate font-mono text-[10px] tracking-[0.2em] text-emerald-200/50">{playlistTitle}</p>
      ) : null}
      <div className="mt-1.5 flex items-center gap-2">
        <div className="h-1 w-40 overflow-hidden rounded-full bg-emerald-950/80">
          <div className="h-full bg-emerald-400/90 shadow-[0_0_6px_rgba(52,211,153,0.8)]" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono text-[10px] text-emerald-200/70">
          {formatDuration(playedSeconds)} / {formatDuration(durationSeconds)}
        </span>
      </div>
    </div>
  );
}

export function OSDVolume({ volume, muted }: { volume: number; muted: boolean }) {
  const blocks = Math.round(volume * 10);
  return (
    <div className="rounded border border-emerald-400/40 bg-black/70 px-3 py-1.5" data-testid="osd-volume">
      <p className="font-mono text-xs tracking-widest text-emerald-300">
        {muted ? (
          <span className="osd-glow text-red-400">MUTE</span>
        ) : (
          <>
            VOL{' '}
            <span className="text-emerald-400">
              {'▮'.repeat(blocks)}
              <span className="text-emerald-900">{'▮'.repeat(10 - blocks)}</span>
            </span>{' '}
            {Math.round(volume * 100)}
          </>
        )}
      </p>
    </div>
  );
}

export function OSDDigits({ buffer }: { buffer: string }) {
  return (
    <div className="pointer-events-none absolute right-6 top-1/3 z-40" data-testid="osd-digits">
      <span className="osd-glow font-mono text-5xl font-bold tracking-widest text-emerald-400">
        {buffer}
        <span className="animate-pulse">_</span>
      </span>
    </div>
  );
}

export function OSDBanner({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warn' }) {
  return (
    <div
      className={`pointer-events-none absolute left-1/2 top-20 z-40 -translate-x-1/2 rounded border px-4 py-2 font-mono text-xs tracking-[0.25em] backdrop-blur-sm ${
        tone === 'warn'
          ? 'border-red-400/50 bg-black/70 text-red-300 shadow-[0_0_18px_rgba(248,113,113,0.35)]'
          : 'border-emerald-400/50 bg-black/70 text-emerald-300 shadow-[0_0_18px_rgba(52,211,153,0.35)]'
      }`}
      data-testid="osd-banner"
    >
      {text}
    </div>
  );
}
