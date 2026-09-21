/**
 * Unified playback abstraction.
 *
 * Wraps three native vendor APIs (YouTube IFrame API, Vimeo Player SDK,
 * Dailymotion SDK) behind a single event-driven controller. Adapters are
 * swapped only when the upstream platform changes; transitions within the
 * same platform rely on internal player APIs (loadVideoById / loadVideo /
 * load) so cross-origin iframes are never torn down needlessly.
 */

import type { NormalizedMediaItem, VideoSource } from '@/lib/tv/types';

export interface LoadOptions {
  autoplay: boolean;
  seekOffset?: number;
  muted: boolean;
  volume: number;
}

export interface AdapterHandlers {
  onReady: () => void;
  onEnded: () => void;
  onError: (code: string | number) => void;
  onTime: (playedSeconds: number, durationSeconds: number) => void;
}

export interface PlayerAdapter {
  readonly source: VideoSource;
  load(item: NormalizedMediaItem, opts: LoadOptions): void;
  play(): void;
  pause(): void;
  seekTo(seconds: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Script loading utilities
// ---------------------------------------------------------------------------

const loadedScripts = new Map<string, Promise<void>>();

function loadScriptOnce(key: string, src: string): Promise<void> {
  let p = loadedScripts.get(key);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[data-tv-sdk="${key}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error(`Failed to load ${key}`)));
        if (existing.dataset.loaded === 'true') resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.dataset.tvSdk = key;
      script.onload = () => {
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = () => reject(new Error(`Failed to load ${key} SDK`));
      document.head.appendChild(script);
    });
    loadedScripts.set(key, p);
  }
  return p;
}

function waitFor(cond: () => boolean, timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (cond()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('SDK global not found'));
      setTimeout(tick, 50);
    };
    tick();
  });
}

function hostDiv(container: HTMLElement): HTMLElement {
  const div = document.createElement('div');
  div.style.width = '100%';
  div.style.height = '100%';
  container.appendChild(div);
  return div;
}

// ---------------------------------------------------------------------------
// Minimal vendor typings
// ---------------------------------------------------------------------------

 
type AnyPlayer = any;

interface YTGlobal {
  Player: new (
    el: HTMLElement,
    config: Record<string, unknown>
  ) => AnyPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
}

interface VimeoGlobal {
  Player: new (el: HTMLElement, options: Record<string, unknown>) => AnyPlayer;
}

interface DMGlobal {
  player: (
    el: HTMLElement | string,
    options: Record<string, unknown>
  ) => AnyPlayer;
  events: Record<string, string>;
}

function globals() {
  return window as unknown as {
    YT?: YTGlobal;
    Vimeo?: VimeoGlobal;
    DM?: DMGlobal;
  };
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

export class YouTubeAdapter implements PlayerAdapter {
  readonly source = 'youtube' as const;
  private player: AnyPlayer | null = null;
  private ready = false;
  private pending: (() => void) | null = null;
  private currentTime = 0;
  private duration = 0;
  private destroyed = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    container: HTMLElement,
    firstItem: NormalizedMediaItem,
    opts: LoadOptions,
    private handlers: AdapterHandlers
  ) {
    void this.init(container, firstItem, opts);
  }

  private async init(container: HTMLElement, item: NormalizedMediaItem, opts: LoadOptions) {
    try {
      await loadScriptOnce('youtube', 'https://www.youtube.com/iframe_api');
      await waitFor(() => !!globals().YT?.Player);
      if (this.destroyed) return;
      const YT = globals().YT!;
      const el = hostDiv(container);
      this.player = new YT.Player(el, {
        videoId: item.sourceId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1,
          mute: opts.muted ? 1 : 0,
        },
        events: {
          onReady: () => {
            if (this.destroyed || !this.player) return;
            this.ready = true;
            this.player.setVolume(Math.round(opts.volume * 100));
            if (opts.muted) this.player.mute();
            else this.player.unMute();
            if (opts.seekOffset && opts.seekOffset > 1) {
              this.player.seekTo(opts.seekOffset, true);
            }
            if (opts.autoplay) this.player.playVideo();
            this.handlers.onReady();
            if (this.pending) {
              this.pending();
              this.pending = null;
            }
            this.startPolling();
          },
          onStateChange: (e: { data: number }) => {
            if (e.data === YT.PlayerState.ENDED) this.handlers.onEnded();
          },
          onError: (e: { data: number }) => {
            this.handlers.onError(e.data);
          },
        },
      });
    } catch {
      if (!this.destroyed) this.handlers.onError('yt-init');
    }
  }

  private startPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      if (!this.player || !this.ready || this.destroyed) return;
      try {
        this.currentTime = this.player.getCurrentTime?.() ?? 0;
        this.duration = this.player.getDuration?.() ?? 0;
        this.handlers.onTime(this.currentTime, this.duration);
      } catch {
        /* iframe not ready */
      }
    }, 1000);
  }

  load(item: NormalizedMediaItem, opts: LoadOptions): void {
    const run = () => {
      if (!this.player || this.destroyed) return;
      this.player.loadVideoById({
        videoId: item.sourceId,
        startSeconds: opts.seekOffset && opts.seekOffset > 1 ? opts.seekOffset : 0,
      });
      this.player.setVolume(Math.round(opts.volume * 100));
      if (opts.muted) this.player.mute();
      else this.player.unMute();
      if (!opts.autoplay) this.player.pauseVideo();
    };
    if (this.ready) run();
    else this.pending = run;
  }

  play() {
    if (this.ready) this.player?.playVideo?.();
  }
  pause() {
    if (this.ready) this.player?.pauseVideo?.();
  }
  seekTo(seconds: number) {
    if (this.ready) this.player?.seekTo?.(seconds, true);
  }
  setVolume(volume: number) {
    if (this.ready) this.player?.setVolume?.(Math.round(volume * 100));
  }
  setMuted(muted: boolean) {
    if (!this.ready || !this.player) return;
    if (muted) this.player.mute?.();
    else this.player.unMute?.();
  }
  getCurrentTime() {
    return this.currentTime;
  }
  getDuration() {
    return this.duration;
  }
  destroy() {
    this.destroyed = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    try {
      this.player?.destroy?.();
    } catch {
      /* noop */
    }
    this.player = null;
  }
}

// ---------------------------------------------------------------------------
// Vimeo
// ---------------------------------------------------------------------------

export class VimeoAdapter implements PlayerAdapter {
  readonly source = 'vimeo' as const;
  private player: AnyPlayer | null = null;
  private ready = false;
  private currentTime = 0;
  private duration = 0;
  private destroyed = false;
  private pending: ((p: AnyPlayer) => void) | null = null;

  constructor(
    container: HTMLElement,
    firstItem: NormalizedMediaItem,
    opts: LoadOptions,
    private handlers: AdapterHandlers
  ) {
    void this.init(container, firstItem, opts);
  }

  private async init(container: HTMLElement, item: NormalizedMediaItem, opts: LoadOptions) {
    try {
      await loadScriptOnce('vimeo', 'https://player.vimeo.com/api/player.js');
      await waitFor(() => !!globals().Vimeo?.Player);
      if (this.destroyed) return;
      const Vimeo = globals().Vimeo!;
      const el = hostDiv(container);
      const player = new Vimeo.Player(el, {
        id: Number(item.sourceId),
        controls: false,
        autoplay: true,
        muted: opts.muted,
        byline: false,
        portrait: false,
        title: false,
        responsive: false,
        width: '100%',
        height: '100%',
        transparent: false,
      });
      this.player = player;
      player.on('timeupdate', (data: { seconds: number; duration: number }) => {
        this.currentTime = data.seconds;
        this.duration = data.duration;
        this.handlers.onTime(data.seconds, data.duration);
      });
      player.on('ended', () => this.handlers.onEnded());
      player.on('error', (data: { name?: string; message?: string }) => {
        this.handlers.onError(data?.name ?? 'vimeo-error');
      });
      player.ready().then(() => {
        if (this.destroyed) return;
        this.ready = true;
        void player.setVolume(opts.volume);
        if (opts.muted) void player.setMuted(true);
        if (opts.seekOffset && opts.seekOffset > 1) void player.setCurrentTime(opts.seekOffset);
        if (!opts.autoplay) void player.pause();
        this.handlers.onReady();
        if (this.pending) {
          this.pending(player);
          this.pending = null;
        }
      });
    } catch {
      if (!this.destroyed) this.handlers.onError('vimeo-init');
    }
  }

  load(item: NormalizedMediaItem, opts: LoadOptions): void {
    const run = (player: AnyPlayer) => {
      if (this.destroyed) return;
      void player
        .loadVideo(Number(item.sourceId))
        .then(() => {
          void player.setVolume(opts.volume);
          void player.setMuted(opts.muted);
          if (opts.seekOffset && opts.seekOffset > 1) {
            return player.setCurrentTime(opts.seekOffset);
          }
        })
        .then(() => {
          if (opts.autoplay) return player.play();
          return player.pause();
        })
        .catch(() => this.handlers.onError('vimeo-load'));
    };
    if (this.ready && this.player) run(this.player);
    else this.pending = run;
  }

  play() {
    if (this.ready) void this.player?.play?.().catch(() => undefined);
  }
  pause() {
    if (this.ready) void this.player?.pause?.().catch(() => undefined);
  }
  seekTo(seconds: number) {
    if (this.ready) void this.player?.setCurrentTime?.(seconds).catch(() => undefined);
  }
  setVolume(volume: number) {
    if (this.ready) void this.player?.setVolume?.(volume).catch(() => undefined);
  }
  setMuted(muted: boolean) {
    if (this.ready) void this.player?.setMuted?.(muted).catch(() => undefined);
  }
  getCurrentTime() {
    return this.currentTime;
  }
  getDuration() {
    return this.duration;
  }
  destroy() {
    this.destroyed = true;
    try {
      this.player?.destroy?.();
    } catch {
      /* noop */
    }
    this.player = null;
  }
}

// ---------------------------------------------------------------------------
// Dailymotion
// ---------------------------------------------------------------------------

export class DailymotionAdapter implements PlayerAdapter {
  readonly source = 'dailymotion' as const;
  private player: AnyPlayer | null = null;
  private ready = false;
  private currentTime = 0;
  private duration = 0;
  private destroyed = false;
  private pending: ((p: AnyPlayer) => void) | null = null;

  constructor(
    container: HTMLElement,
    firstItem: NormalizedMediaItem,
    opts: LoadOptions,
    private handlers: AdapterHandlers
  ) {
    void this.init(container, firstItem, opts);
  }

  private async init(container: HTMLElement, item: NormalizedMediaItem, opts: LoadOptions) {
    try {
      await loadScriptOnce('dailymotion', 'https://api.dmcdn.net/player.js');
      await waitFor(() => !!globals().DM?.player);
      if (this.destroyed) return;
      const DM = globals().DM!;
      const el = hostDiv(container);
      const player = DM.player(el, {
        video: item.sourceId,
        width: '100%',
        height: '100%',
        params: {
          controls: false,
          autoplay: true,
          mute: opts.muted ? '1' : '0',
          'ui-logo': false,
          'sharing-enable': false,
          'ui-start-screen-loading': false,
        },
      });
      this.player = player;
      player.addEventListener(DM.events.apiready ?? 'apiready', () => {
        if (this.destroyed) return;
        this.ready = true;
        try {
          player.setVolume(opts.volume);
          player.setMuted(opts.muted);
          if (opts.seekOffset && opts.seekOffset > 1) player.seek(opts.seekOffset);
          if (!opts.autoplay) player.pause();
        } catch {
          /* noop */
        }
        this.handlers.onReady();
        if (this.pending) {
          this.pending(player);
          this.pending = null;
        }
      });
      player.addEventListener(DM.events.timeupdate ?? 'timeupdate', () => {
        try {
          this.currentTime = player.currentTime ?? 0;
          this.duration = player.duration ?? 0;
          this.handlers.onTime(this.currentTime, this.duration);
        } catch {
          /* noop */
        }
      });
      player.addEventListener(DM.events.ended ?? 'ended', () => this.handlers.onEnded());
      player.addEventListener(DM.events.error ?? 'error', (e: { code?: string }) => {
        this.handlers.onError(e?.code ?? 'dm-error');
      });
    } catch {
      if (!this.destroyed) this.handlers.onError('dm-init');
    }
  }

  load(item: NormalizedMediaItem, opts: LoadOptions): void {
    const run = (player: AnyPlayer) => {
      if (this.destroyed) return;
      try {
        player.load({ video: item.sourceId });
        player.setVolume(opts.volume);
        player.setMuted(opts.muted);
        if (opts.seekOffset && opts.seekOffset > 1) {
          setTimeout(() => {
            try {
              player.seek(opts.seekOffset);
            } catch {
              /* noop */
            }
          }, 600);
        }
        if (!opts.autoplay) player.pause();
      } catch {
        this.handlers.onError('dm-load');
      }
    };
    if (this.ready && this.player) run(this.player);
    else this.pending = run;
  }

  play() {
    try {
      if (this.ready) this.player?.play?.();
    } catch {
      /* noop */
    }
  }
  pause() {
    try {
      if (this.ready) this.player?.pause?.();
    } catch {
      /* noop */
    }
  }
  seekTo(seconds: number) {
    try {
      if (this.ready) this.player?.seek?.(seconds);
    } catch {
      /* noop */
    }
  }
  setVolume(volume: number) {
    try {
      if (this.ready) this.player?.setVolume?.(volume);
    } catch {
      /* noop */
    }
  }
  setMuted(muted: boolean) {
    try {
      if (this.ready) this.player?.setMuted?.(muted);
    } catch {
      /* noop */
    }
  }
  getCurrentTime() {
    return this.currentTime;
  }
  getDuration() {
    return this.duration;
  }
  destroy() {
    this.destroyed = true;
    try {
      this.player?.destroy?.();
    } catch {
      /* noop */
    }
    this.player = null;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAdapter(
  source: VideoSource,
  container: HTMLElement,
  item: NormalizedMediaItem,
  opts: LoadOptions,
  handlers: AdapterHandlers
): PlayerAdapter {
  switch (source) {
    case 'youtube':
      return new YouTubeAdapter(container, item, opts, handlers);
    case 'vimeo':
      return new VimeoAdapter(container, item, opts, handlers);
    case 'dailymotion':
      return new DailymotionAdapter(container, item, opts, handlers);
  }
}
