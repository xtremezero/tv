'use client';

import { useEffect, useRef } from 'react';
import type { NormalizedMediaItem, PlaybackProgress } from '@/lib/tv/types';
import { createAdapter, type PlayerAdapter } from './player-adapters';

interface UnifiedPlayerProps {
  item: NormalizedMediaItem | null;
  /** Increments on every fresh program load (also re-applies seekOffset) */
  loadToken: number;
  playing: boolean;
  muted: boolean;
  volume: number;
  seekOffset: number;
  /** Imperative seek requests (e.g. restart current program) */
  seekRequest?: { token: number; seconds: number } | null;
  onEnded: () => void;
  onError: (item: NormalizedMediaItem, code: string | number) => void;
  onProgress: (progress: PlaybackProgress) => void;
}

/**
 * The unified presentation surface. Dynamically attaches the requisite
 * platform adapter only when a media asset from that vendor enters the
 * playback queue; tears the iframe down entirely on platform switches.
 */
export default function UnifiedPlayer({
  item,
  loadToken,
  playing,
  muted,
  volume,
  seekOffset,
  seekRequest,
  onEnded,
  onError,
  onProgress,
}: UnifiedPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<PlayerAdapter | null>(null);
  const lastLoadTokenRef = useRef<number>(-1);
  const lastItemIdRef = useRef<string | null>(null);
  const lastProgressRef = useRef(0);
  const lastTimeRef = useRef(0);
  const stallCountRef = useRef(0);
  const stallTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep latest callbacks in refs to avoid re-binding vendor players
  const cbs = useRef({ onEnded, onError, onProgress, playing });
  useEffect(() => {
    cbs.current = { onEnded, onError, onProgress, playing };
  });

  // --- Adapter lifecycle: swap on platform change, fresh load on new program ---
  useEffect(() => {
    if (!item || !containerRef.current) return;

    // Platform switch → tear down the active iframe entirely, flush for GC
    if (!adapterRef.current || adapterRef.current.source !== item.source) {
      adapterRef.current?.destroy();
      adapterRef.current = null;
      containerRef.current.innerHTML = '';

      adapterRef.current = createAdapter(
        item.source,
        containerRef.current,
        item,
        { autoplay: cbs.current.playing, muted, volume, seekOffset },
        {
          onReady: () => undefined,
          onEnded: () => cbs.current.onEnded(),
          onError: (code) => cbs.current.onError(item, code),
          onTime: (played, duration) => {
            lastTimeRef.current = played;
            stallCountRef.current = 0;
            const now = Date.now();
            if (now - lastProgressRef.current >= 200) {
              lastProgressRef.current = now;
              cbs.current.onProgress({ playedSeconds: played, durationSeconds: duration });
            }
          },
        }
      );
      lastLoadTokenRef.current = loadToken;
      lastItemIdRef.current = item.id;
      lastTimeRef.current = 0;
      lastProgressRef.current = 0;
      stallCountRef.current = 0;
      return;
    }

    // Same platform → hot-swap the program via internal player APIs
    if (lastLoadTokenRef.current !== loadToken || lastItemIdRef.current !== item.id) {
      lastLoadTokenRef.current = loadToken;
      lastItemIdRef.current = item.id;
      lastTimeRef.current = 0;
      lastProgressRef.current = 0;
      stallCountRef.current = 0;
      adapterRef.current.load(item, {
        autoplay: cbs.current.playing,
        muted,
        volume,
        seekOffset,
      });
    }
  }, [item, loadToken, muted, volume, seekOffset]);

  // --- Imperative seek requests ---
  useEffect(() => {
    if (!seekRequest) return;
    adapterRef.current?.seekTo(seekRequest.seconds);
  }, [seekRequest?.token]);

  // --- Play / pause ---
  useEffect(() => {
    if (!adapterRef.current) return;
    if (playing) adapterRef.current.play();
    else adapterRef.current.pause();
  }, [playing]);

  // --- Volume / mute ---
  useEffect(() => {
    adapterRef.current?.setVolume(volume);
  }, [volume]);
  useEffect(() => {
    adapterRef.current?.setMuted(muted);
  }, [muted]);

  // --- Stall watchdog: silent advance if the iframe freezes mid-broadcast ---
  useEffect(() => {
    let neverStartedCount = 0;
    stallTimerRef.current = setInterval(() => {
      if (!cbs.current.playing || !adapterRef.current) return;
      const t = adapterRef.current.getCurrentTime();
      if (t < 1) {
        // Video never actually started (platform interstitial / restricted wall)
        neverStartedCount += 1;
        if (neverStartedCount >= 4) {
          neverStartedCount = 0;
          if (item) cbs.current.onError(item, 'stall-start');
        }
        return;
      }
      neverStartedCount = 0;
      if (t === lastTimeRef.current) {
        stallCountRef.current += 1;
        if (stallCountRef.current >= 9) {
          // 9 x 5s with zero time movement mid-playback: dead air
          stallCountRef.current = 0;
          if (item) cbs.current.onError(item, 'stall');
        }
      } else {
        stallCountRef.current = 0;
        lastTimeRef.current = t;
      }
    }, 5000);
    return () => {
      if (stallTimerRef.current) clearInterval(stallTimerRef.current);
      stallTimerRef.current = null;
    };
  }, [item?.id]);

  // --- Teardown ---
  useEffect(() => {
    return () => {
      adapterRef.current?.destroy();
      adapterRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="absolute inset-0 overflow-hidden bg-black" />;
}
