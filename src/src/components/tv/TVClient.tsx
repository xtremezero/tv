'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ListVideo,
  Power,
  Settings,
  SignalHigh,
  Play,
  ChevronLeft,
  ChevronRight,
  Radio,
  Tv,
  Eye,
  Info,
  Sparkles,
  Maximize,
  Minimize,
} from 'lucide-react';
import UnifiedPlayer from './UnifiedPlayer';
import { PowerCurtain } from './PowerCurtain';
import { EPGGuide } from './EPGGuide';
import { SettingsPanel } from './SettingsPanel';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { VideoCard } from './VideoCard';
import { UpNextSidebar } from './UpNextSidebar';
import { ThemeCustomizer } from './ThemeCustomizer';
import { OSDBanner, OSDDigits, OSDNow, OSDTop, OSDVolume } from './OSD';
import { createDemoChannels } from './demo-data';
import { staticSynth } from '@/lib/tv/static-synth';
import { useTVStore } from '@/lib/tv/store';
import {
  buildChannelQueue,
  formatClock,
  formatDuration,
  resolveLiveTimelineCoordinates,
  resolveQueueFromIds,
} from '@/lib/tv/scheduler';
import type { NormalizedMediaItem, PlaybackProgress } from '@/lib/tv/types';

interface LivePoint {
  scheduleIndex: number;
  seekOffsetSeconds: number;
}

export default function TVClient() {
  const channels = useTVStore((s) => s.channels);
  const activeChannelId = useTVStore((s) => s.activeChannelId);
  const quarantinedIds = useTVStore((s) => s.quarantinedIds);
  const volume = useTVStore((s) => s.volume);
  const muted = useTVStore((s) => s.muted);
  const crtEnabled = useTVStore((s) => s.crtEnabled);
  const staticSoundEnabled = useTVStore((s) => s.staticSoundEnabled);

  const [hydrated, setHydrated] = useState(false);
  const [powered, setPowered] = useState(true);
  const [showSnow, setShowSnow] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [showVolumeOsd, setShowVolumeOsd] = useState(false);
  const [banner, setBanner] = useState<{ text: string; tone: 'info' | 'warn' } | null>(null);
  const [digitBuffer, setDigitBuffer] = useState('');
  const [epgOpen, setEpgOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [progress, setProgress] = useState<PlaybackProgress>({ playedSeconds: 0, durationSeconds: 0 });
  const [livePoint, setLivePoint] = useState<LivePoint | null>(null);
  const [loadToken, setLoadToken] = useState(0);
  const [seekRequest, setSeekRequest] = useState<{ token: number; seconds: number } | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  // YouTube Layout UI States
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState<'feed' | 'watch' | 'epg' | 'settings'>('watch');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryPill, setActiveCategoryPill] = useState('All');
  const [descExpanded, setDescExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const playerBoxRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = useCallback(() => {
    if (!playerBoxRef.current) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void playerBoxRef.current.requestFullscreen();
    }
  }, []);

  useEffect(() => {
    const onFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFSChange);
    return () => document.removeEventListener('fullscreenchange', onFSChange);
  }, []);

  const chromeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeOsdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const digitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutiveErrors = useRef(0);
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const store = useTVStore;

  // ------------------------------------------------------------------
  // Deferred rehydration — never touches localStorage during SSR render
  // ------------------------------------------------------------------
  useEffect(() => {
    void store.persist.rehydrate();
    const t = setTimeout(() => setHydrated(true), 0);
    return () => clearTimeout(t);
  }, [store]);

  const channel = useMemo(
    () => channels.find((c) => c.id === activeChannelId) ?? null,
    [channels, activeChannelId]
  );

  // Keep the pointer on a valid channel after hydration / deletions
  useEffect(() => {
    if (!hydrated) return;
    if (channels.length === 0) return;
    if (!channel) {
      const sorted = sortedChannels(channels);
      store.getState().setActiveChannel(sorted[0].id);
    }
  }, [hydrated, channels, channel, store]);

  const quarantineSet = useMemo(() => new Set(quarantinedIds), [quarantinedIds]);

  // ------------------------------------------------------------------
  // Broadcast schedule resolution
  // ------------------------------------------------------------------
  const schedule: NormalizedMediaItem[] = useMemo(() => {
    if (!channel) return [];
    if (channel.queue.length > 0) {
      return resolveQueueFromIds(channel, quarantineSet);
    }
    return buildChannelQueue(channel, quarantineSet);
  }, [channel, quarantineSet]);

  // Persist the composite queue once built so reloads resume the broadcast
  useEffect(() => {
    if (!channel || channel.playlists.length === 0) return;
    if (channel.queue.length > 0) return;
    const built = buildChannelQueue(channel, quarantineSet);
    if (built.length > 0) {
      store.getState().setQueue(channel.id, built.map((i) => i.id));
    }
  }, [channel, quarantineSet, store]);

  const currentIndex = channel
    ? Math.min(Math.max(0, channel.queueIndex), Math.max(0, schedule.length - 1))
    : 0;

  const currentItem: NormalizedMediaItem | null = useMemo(() => {
    if (!channel || schedule.length === 0) return null;
    if (channel.playbackMode === 'linear') {
      return livePoint ? schedule[livePoint.scheduleIndex] ?? null : null;
    }
    return schedule[currentIndex] ?? null;
  }, [channel, schedule, currentIndex, livePoint]);

  const seekOffset = channel?.playbackMode === 'linear' && livePoint ? livePoint.seekOffsetSeconds : 0;

  // ------------------------------------------------------------------
  // Sensory helpers
  // ------------------------------------------------------------------
  const burst = useCallback(
    (_duration = 0.35, _gain = 0.12) => {
      // Static channel sound disabled per user preference
      return;
    },
    []
  );

  const flickSnow = useCallback((ms = 300) => {
    setShowSnow(true);
    if (snowTimer.current) clearTimeout(snowTimer.current);
    snowTimer.current = setTimeout(() => setShowSnow(false), ms);
  }, []);

  const showBanner = useCallback((text: string, tone: 'info' | 'warn' = 'info', ms = 2600) => {
    setBanner({ text, tone });
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), ms);
  }, []);

  const bumpChrome = useCallback(() => {
    setChromeVisible(true);
    if (chromeTimer.current) clearTimeout(chromeTimer.current);
    chromeTimer.current = setTimeout(() => {
      setChromeVisible(false);
      setShowVolumeOsd(false);
    }, 4000);
  }, []);

  const flashVolumeOsd = useCallback(() => {
    setShowVolumeOsd(true);
    bumpChrome();
    if (volumeOsdTimer.current) clearTimeout(volumeOsdTimer.current);
    volumeOsdTimer.current = setTimeout(() => setShowVolumeOsd(false), 2200);
  }, [bumpChrome]);

  // ------------------------------------------------------------------
  // Program transitions
  // ------------------------------------------------------------------
  const nextProgram = useCallback(
    (opts: { silent?: boolean } = {}) => {
      if (!channel || schedule.length === 0) return;
      if (channel.playbackMode === 'linear') {
        const coords = resolveLiveTimelineCoordinates(schedule, channel.epochStartTime);
        if (coords) {
          setLivePoint({ scheduleIndex: coords.scheduleIndex, seekOffsetSeconds: coords.seekOffsetSeconds });
          setLoadToken((t) => t + 1);
        }
      } else {
        const nextIndex = (currentIndex + 1) % schedule.length;
        if (nextIndex === 0 && channel.playlists.some((pl) => pl.shuffle)) {
          const rebuilt = buildChannelQueue(channel, quarantineSet);
          if (rebuilt.length > 0) {
            store.getState().setQueue(channel.id, rebuilt.map((i) => i.id));
          } else {
            store.getState().setQueueIndex(channel.id, 0);
          }
        } else {
          store.getState().setQueueIndex(channel.id, nextIndex);
        }
        setLoadToken((t) => t + 1);
      }
      consecutiveErrors.current = 0;
      if (!opts.silent) {
        flickSnow(260);
        burst(0.14, 0.045);
      }
      bumpChrome();
    },
    [channel, schedule, currentIndex, quarantineSet, store, flickSnow, burst, bumpChrome]
  );

  const prevProgram = useCallback(() => {
    if (!channel || schedule.length === 0) return;
    if (channel.playbackMode === 'linear') {
      const coords = resolveLiveTimelineCoordinates(schedule, channel.epochStartTime);
      if (coords) {
        setLivePoint({ scheduleIndex: coords.scheduleIndex, seekOffsetSeconds: Math.max(0, coords.seekOffsetSeconds - 30) });
        setLoadToken((t) => t + 1);
      }
      return;
    }
    if (progressRef.current.playedSeconds > 3) {
      setSeekRequest({ token: Date.now(), seconds: 0 });
      setProgress((p) => ({ ...p, playedSeconds: 0 }));
    } else {
      const prevIndex = (currentIndex - 1 + schedule.length) % schedule.length;
      store.getState().setQueueIndex(channel.id, prevIndex);
      setLoadToken((t) => t + 1);
    }
    flickSnow(220);
    bumpChrome();
  }, [channel, schedule, currentIndex, store, flickSnow, bumpChrome]);

  // ------------------------------------------------------------------
  // Channel hopping
  // ------------------------------------------------------------------
  const switchChannelById = useCallback(
    (id: string) => {
      if (id === activeChannelId) return;
      store.getState().setActiveChannel(id);
      setLivePoint(null);
      setProgress({ playedSeconds: 0, durationSeconds: 0 });
      setEpgOpen(false);
      setLoadToken((t) => t + 1);
      flickSnow(650);
      burst(0.5, 0.15);
      bumpChrome();
    },
    [activeChannelId, store, flickSnow, burst, bumpChrome]
  );

  const hopChannel = useCallback(
    (dir: -1 | 1) => {
      if (channels.length === 0) return;
      const sorted = sortedChannels(channels);
      const idx = sorted.findIndex((c) => c.id === activeChannelId);
      const next = sorted[(idx + dir + sorted.length) % sorted.length] ?? sorted[0];
      switchChannelById(next.id);
    },
    [channels, activeChannelId, switchChannelById]
  );

  const commitDigits = useCallback(
    (digits: string) => {
      const num = parseInt(digits, 10);
      const target = channels.find((c) => c.channelNumber === num);
      if (target) {
        switchChannelById(target.id);
      } else {
        showBanner(`CH ${String(num).padStart(3, '0')} — NO SIGNAL`, 'warn');
      }
    },
    [channels, switchChannelById, showBanner]
  );

  // ------------------------------------------------------------------
  // Error quarantine — silent skip, masked by static
  // ------------------------------------------------------------------
  const handlePlayerError = useCallback(
    (item: NormalizedMediaItem, code: string | number) => {
      if (!channel) return;
      const current = currentItem;
      if (!current || current.id !== item.id) return;

      store.getState().quarantineMedia(item.id);
      consecutiveErrors.current += 1;

      if (consecutiveErrors.current >= Math.min(schedule.length || 1, 5)) {
        showBanner('HEAVY SIGNAL LOSS — CHECK YOUR PLAYLISTS', 'warn', 5000);
        return;
      }
      showBanner(`SIGNAL LOST · SKIPPING (${code})`, 'warn');
      flickSnow(500);
      burst(0.4, 0.13);
      nextProgram({ silent: true });
    },
    [channel, currentItem, store, schedule.length, showBanner, flickSnow, burst, nextProgram]
  );

  const handleProgress = useCallback((p: PlaybackProgress) => {
    setProgress(p);
  }, []);

  // Drift correction & initial join
  useEffect(() => {
    if (!channel || channel.playbackMode !== 'linear' || !powered || schedule.length === 0) return;
    const interval = setInterval(() => {
      const coords = resolveLiveTimelineCoordinates(schedule, channel.epochStartTime);
      if (!coords) return;
      if (!livePoint || coords.scheduleIndex !== livePoint.scheduleIndex) {
        setLivePoint({ scheduleIndex: coords.scheduleIndex, seekOffsetSeconds: coords.seekOffsetSeconds });
        setLoadToken((t) => t + 1);
        return;
      }
      const drift = Math.abs(progressRef.current.playedSeconds - coords.seekOffsetSeconds);
      if (drift > 12) {
        setSeekRequest({ token: Date.now(), seconds: coords.seekOffsetSeconds });
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [channel, powered, schedule, livePoint]);

  useEffect(() => {
    if (!powered || !channel || channel.playbackMode !== 'linear' || schedule.length === 0) return;
    if (livePoint) return;
    const coords = resolveLiveTimelineCoordinates(schedule, channel.epochStartTime);
    if (coords) {
      const t = setTimeout(() => {
        setLivePoint({ scheduleIndex: coords.scheduleIndex, seekOffsetSeconds: coords.seekOffsetSeconds });
        setLoadToken((token) => token + 1);
      }, 0);
      return () => clearTimeout(t);
    }
  }, [powered, channel, schedule, livePoint]);

  // Keybinding matrix
  useEffect(() => {
    if (!powered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (settingsOpen) return;

      const volStep = 0.08;

      switch (e.code) {
        case 'ArrowUp':
          e.preventDefault();
          hopChannel(1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          hopChannel(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          nextProgram();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          prevProgram();
          break;
        case 'KeyG':
          e.preventDefault();
          setEpgOpen((o) => !o);
          bumpChrome();
          break;
        case 'KeyM':
          e.preventDefault();
          store.getState().setMuted(!store.getState().muted);
          flashVolumeOsd();
          break;
        case 'Equal':
        case 'NumpadAdd':
          e.preventDefault();
          store.getState().setVolume(store.getState().volume + volStep);
          flashVolumeOsd();
          break;
        case 'Minus':
        case 'NumpadSubtract':
          e.preventDefault();
          store.getState().setVolume(store.getState().volume - volStep);
          flashVolumeOsd();
          break;
        case 'Space':
        case 'Enter':
          e.preventDefault();
          if (epgOpen) setEpgOpen(false);
          else bumpChrome();
          break;
        case 'Escape':
          setEpgOpen(false);
          break;
        default:
          if (/^Digit[0-9]$/.test(e.code) || /^Numpad[0-9]$/.test(e.code)) {
            e.preventDefault();
            const d = e.code.slice(-1);
            setDigitBuffer((buf) => {
              const next = (buf + d).slice(0, 3);
              if (digitTimer.current) clearTimeout(digitTimer.current);
              digitTimer.current = setTimeout(() => {
                setDigitBuffer((final) => {
                  if (final) commitDigits(final);
                  return '';
                });
              }, 1500);
              return next;
            });
            bumpChrome();
          }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    powered,
    settingsOpen,
    epgOpen,
    hopChannel,
    nextProgram,
    prevProgram,
    bumpChrome,
    flashVolumeOsd,
    commitDigits,
    store,
  ]);

  // Power on
  const handlePowerOn = useCallback(() => {
    staticSynth.unlock();
    setPowered(true);
    burst(0.6, 0.18);
    flickSnow(700);
    bumpChrome();
    const target = Math.max(0.05, store.getState().volume);
    store.getState().setVolume(0.01);
    store.getState().setMuted(false);
    let step = 0;
    const fade = setInterval(() => {
      step += 1;
      const v = Math.min(target, 0.01 + step * (target / 14));
      store.getState().setVolume(v);
      if (v >= target) clearInterval(fade);
    }, 70);
  }, [store, burst, flickSnow, bumpChrome]);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 10000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (powered) {
      const t = setTimeout(() => bumpChrome(), 0);
      return () => clearTimeout(t);
    }
  }, [powered, bumpChrome]);

  // Channel Creation & Demo Load
  const handleCreateChannel = useCallback(() => {
    const nextNumber = channels.reduce((max, c) => Math.max(max, c.channelNumber), 0) + 1;
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `ch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    store.getState().addChannel({
      id,
      channelNumber: nextNumber,
      name: `Channel ${nextNumber}`,
      playlists: [],
      playbackMode: 'queue',
      epochStartTime: Date.now(),
      queue: [],
      queueIndex: 0,
      createdAt: Date.now(),
    });
    store.getState().setActiveChannel(id);
  }, [channels, store]);

  const handleLoadDemo = useCallback(() => {
    const existing = new Set(channels.map((c) => c.id));
    const nextNumber = channels.reduce((max, c) => Math.max(max, c.channelNumber), 0);
    const demos = createDemoChannels().filter((c) => !existing.has(c.id));
    if (demos.length === 0) {
      showBanner('DEMO PACKAGE ALREADY LOADED', 'info');
      return;
    }
    demos.forEach((demo, i) => {
      store.getState().addChannel({ ...demo, channelNumber: nextNumber + i + 1 });
    });
    store.getState().setActiveChannel(demos[0].id);
    setLivePoint(null);
    setLoadToken((t) => t + 1);
    showBanner(`${demos.length} DEMO CHANNEL(S) ON AIR`, 'info');
  }, [channels, store, showBanner]);

  const playlistTitleForCurrent = useMemo(() => {
    if (!channel || !currentItem) return undefined;
    const owner = channel.playlists.find((pl) => pl.items.some((i) => i.id === currentItem.id));
    return owner?.title;
  }, [channel, currentItem]);

  // Collect all media items across channels for YouTube Feed view
  const allFeedItems = useMemo(() => {
    const items: Array<{
      item: NormalizedMediaItem;
      channelNumber: number;
      channelName: string;
      channelId: string;
      playlistTitle?: string;
      isLiveNow: boolean;
    }> = [];

    channels.forEach((ch) => {
      const chSchedule =
        ch.queue.length > 0
          ? resolveQueueFromIds(ch, quarantineSet)
          : buildChannelQueue(ch, quarantineSet);

      chSchedule.forEach((item, idx) => {
        const isLive = ch.id === activeChannelId && item.id === currentItem?.id;
        items.push({
          item,
          channelNumber: ch.channelNumber,
          channelName: ch.name,
          channelId: ch.id,
          playlistTitle: ch.playlists.find((pl) => pl.items.some((i) => i.id === item.id))?.title,
          isLiveNow: isLive,
        });
      });
    });

    return items;
  }, [channels, quarantineSet, activeChannelId, currentItem]);

  // Filter feed items by search query & category pill
  const filteredFeedItems = useMemo(() => {
    return allFeedItems.filter((entry) => {
      const matchSearch =
        !searchQuery ||
        entry.item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        entry.channelName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(entry.channelNumber).includes(searchQuery);

      let matchCategory = true;
      if (activeCategoryPill === 'On Air Live') {
        matchCategory = entry.isLiveNow;
      } else if (activeCategoryPill === 'Linear') {
        const targetCh = channels.find((c) => c.id === entry.channelId);
        matchCategory = targetCh?.playbackMode === 'linear';
      } else if (activeCategoryPill === 'Queue') {
        const targetCh = channels.find((c) => c.id === entry.channelId);
        matchCategory = targetCh?.playbackMode === 'queue';
      } else if (activeCategoryPill !== 'All') {
        matchCategory = entry.channelName === activeCategoryPill;
      }

      return matchSearch && matchCategory;
    });
  }, [allFeedItems, searchQuery, activeCategoryPill, channels]);

  if (!hydrated) {
    return <BootScreen />;
  }

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground font-sans select-none"
      onMouseMove={bumpChrome}
      onClick={bumpChrome}
      data-testid="tv-root"
    >
      {/* YouTube Top Navigation Header */}
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((s) => !s)}
        searchQuery={searchQuery}
        onSearchChange={(q) => {
          setSearchQuery(q);
          if (q) setActiveView('feed');
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenEPG={() => setEpgOpen(true)}
        crtEnabled={crtEnabled}
        onToggleCRT={() => store.getState().toggleCrt()}
        muted={muted}
        onToggleMute={() => {
          store.getState().setMuted(!muted);
          flashVolumeOsd();
        }}
        onLoadDemo={handleLoadDemo}
        hasChannels={channels.length > 0}
      />

      <div className="relative flex flex-1 overflow-hidden">
        {/* YouTube Collapsible Sidebar */}
        <Sidebar
          open={sidebarOpen}
          activeView={activeView}
          onSelectView={(v) => {
            if (v === 'epg') setEpgOpen(true);
            else if (v === 'settings') setSettingsOpen(true);
            else setActiveView(v);
          }}
          channels={channels}
          activeChannelId={activeChannelId}
          onSelectChannel={(id) => switchChannelById(id)}
          onOpenSettings={() => setSettingsOpen(true)}
          crtEnabled={crtEnabled}
          onToggleCRT={() => store.getState().toggleCrt()}
          staticSoundEnabled={staticSoundEnabled}
          onToggleStaticSound={() => store.getState().toggleStaticSound()}
          volume={volume}
          onVolumeChange={(v) => store.getState().setVolume(v)}
          muted={muted}
          onToggleMute={() => store.getState().setMuted(!muted)}
        />

        {/* Main Content Area */}
        <main className="tv-scroll flex-1 overflow-y-auto bg-background p-4 lg:p-6 text-foreground">
          {activeView === 'watch' ? (
            /* ====================================================================
               YouTube WATCH PAGE LAYOUT
               ==================================================================== */
            <div className="mx-auto flex w-full max-w-[1850px] flex-col gap-6 lg:flex-row">
              {/* Left Column: Player + Video Information Box */}
              <div className="flex flex-1 flex-col gap-3 min-w-0">
                {/* Information ABOVE Video Player */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-xs">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-xs font-bold text-primary-foreground shadow">
                      {channel ? String(channel.channelNumber).padStart(2, '0') : '01'}
                    </span>
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-sans text-sm font-bold text-foreground truncate">
                        {channel?.name ?? 'TV Channel'}
                      </span>
                      <span className="shrink-0 rounded bg-secondary px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground uppercase">
                        {channel?.playbackMode ?? 'QUEUE'} BROADCAST
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-xs font-medium text-muted-foreground">
                      {formatClock(clock)}
                    </span>
                    <button
                      onClick={() => setEpgOpen(true)}
                      className="flex items-center gap-1.5 rounded-full bg-secondary px-3.5 py-1 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-muted hover:text-foreground"
                      title="Open EPG Program Guide (G)"
                      data-testid="epg-open-btn"
                    >
                      <ListVideo className="h-3.5 w-3.5 text-primary" />
                      <span>Guide</span>
                    </button>
                  </div>
                </div>

                {/* 16:9 Video Player Container (100% Clean) */}
                <div
                  ref={playerBoxRef}
                  className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-border"
                >
                  {currentItem && powered ? (
                    <UnifiedPlayer
                      item={currentItem}
                      loadToken={loadToken}
                      playing={powered}
                      muted={powered ? muted : true}
                      volume={volume}
                      seekOffset={seekOffset}
                      seekRequest={seekRequest}
                      onEnded={() => nextProgram({ silent: true })}
                      onError={handlePlayerError}
                      onProgress={handleProgress}
                    />
                  ) : (
                    <NoSignalScreen
                      hasChannels={channels.length > 0}
                      onOpenSettings={() => setSettingsOpen(true)}
                      onLoadDemo={handleLoadDemo}
                    />
                  )}

                  {/* Procedural transition snow */}
                  {showSnow && <div className="channel-change-snow" aria-hidden data-testid="static-snow" />}
                </div>

                {/* Information & Controls BELOW Video Player */}
                {currentItem && (
                  <div className="flex flex-col gap-3 mt-1">
                    {/* Video Title */}
                    <h1 className="font-sans text-xl font-bold leading-tight text-foreground md:text-2xl">
                      {currentItem.title}
                    </h1>

                    {/* Channel Metadata & Control Action Buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
                      {/* Metadata */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-primary/15 border border-primary/30 px-2 py-0.5 font-mono text-[10px] font-bold text-primary uppercase">
                            {currentItem.source}
                          </span>
                          {playlistTitleForCurrent && (
                            <span className="font-sans text-xs text-foreground">
                              · {playlistTitleForCurrent}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 font-mono text-xs text-foreground">
                          <span>
                            {formatDuration(progress.playedSeconds)} / {formatDuration(progress.durationSeconds || currentItem.duration)}
                          </span>
                        </div>
                      </div>

                      {/* Controls: Prev, Next, Fullscreen */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={prevProgram}
                          className="flex items-center gap-1 rounded-full bg-secondary px-4 py-2 font-sans text-xs font-semibold text-secondary-foreground hover:bg-muted transition-colors"
                          title="Previous Program (Left Arrow)"
                        >
                          <ChevronLeft className="h-4 w-4" /> Prev
                        </button>
                        <button
                          onClick={() => nextProgram()}
                          className="flex items-center gap-1 rounded-full bg-secondary px-4 py-2 font-sans text-xs font-semibold text-secondary-foreground hover:bg-muted transition-colors"
                          title="Next Program (Right Arrow)"
                        >
                          Next <ChevronRight className="h-4 w-4" />
                        </button>
                        <button
                          onClick={toggleFullscreen}
                          className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 font-sans text-xs font-bold text-primary-foreground shadow hover:bg-primary/90 transition-transform hover:scale-105"
                          title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Player'}
                        >
                          {isFullscreen ? (
                            <>
                              <Minimize className="h-4 w-4" /> Exit
                            </>
                          ) : (
                            <>
                              <Maximize className="h-4 w-4" /> Fullscreen
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: YouTube "Up Next" Queue Sidebar */}
              <div className="w-full lg:w-[380px] xl:w-[420px] shrink-0">
                <UpNextSidebar
                  schedule={schedule}
                  currentIndex={currentIndex}
                  channelNumber={channel?.channelNumber ?? 1}
                  channelName={channel?.name ?? 'TV'}
                  onSelectProgram={(idx) => {
                    store.getState().setQueueIndex(channel!.id, idx);
                    setLoadToken((t) => t + 1);
                    flickSnow(220);
                  }}
                  onOpenEPG={() => setEpgOpen(true)}
                />
              </div>
            </div>
          ) : (
            /* ====================================================================
               YouTube HOME BROWSE FEED LAYOUT
               ==================================================================== */
            <div className="flex flex-col gap-6">
              {/* YouTube Category Chips Filter Bar */}
              <div className="tv-scroll flex items-center gap-2 overflow-x-auto pb-2">
                {[
                  'All',
                  'On Air Live',
                  'Linear',
                  'Queue',
                  ...channels.map((c) => c.name),
                ].map((pill) => (
                  <button
                    key={pill}
                    onClick={() => setActiveCategoryPill(pill)}
                    className={`shrink-0 rounded-xl px-3.5 py-1.5 font-sans text-xs font-semibold transition-colors ${
                      activeCategoryPill === pill
                        ? 'bg-primary text-primary-foreground font-bold shadow'
                        : 'bg-secondary text-secondary-foreground hover:bg-muted'
                    }`}
                  >
                    {pill}
                  </button>
                ))}
              </div>

              {/* Featured Broadcast Hero Box */}
              {currentItem && (
                <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-xl">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-col gap-2 max-w-2xl">
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 rounded bg-primary px-2 py-0.5 font-mono text-[10px] font-bold text-primary-foreground">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-ping" />
                          FEATURED BROADCAST
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          CH {String(channel?.channelNumber).padStart(3, '0')} · {channel?.name}
                        </span>
                      </div>
                      <h2 className="font-sans text-xl font-bold text-foreground md:text-2xl line-clamp-1">
                        {currentItem.title}
                      </h2>
                      <p className="font-sans text-xs text-muted-foreground">
                        Currently playing live on the main linear channel queue. Tune in now to join the stream.
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        if (!powered) handlePowerOn();
                        setActiveView('watch');
                      }}
                      className="flex shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 font-bold text-primary-foreground shadow-lg transition-transform hover:bg-primary/90 hover:scale-105"
                    >
                      <Play className="h-5 w-5 fill-primary-foreground" /> Tune In Live Player
                    </button>
                  </div>
                </div>
              )}

              {/* Video Cards Grid */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-sans text-lg font-bold text-foreground">
                    {searchQuery
                      ? `Search Results for "${searchQuery}"`
                      : activeCategoryPill !== 'All'
                      ? `${activeCategoryPill} Programs`
                      : 'Recommended Broadcast Grid'}
                  </h2>
                  <span className="font-mono text-xs text-muted-foreground">
                    {filteredFeedItems.length} videos available
                  </span>
                </div>

                {filteredFeedItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Radio className="h-12 w-12 text-muted-foreground mb-3" />
                    <p className="font-sans text-base font-semibold text-foreground">No videos found</p>
                    <p className="font-sans text-xs text-muted-foreground mt-1 max-w-sm">
                      Try searching for another query, or load demo broadcast channels in the Control Room.
                    </p>
                    <button
                      onClick={handleLoadDemo}
                      className="mt-4 flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90"
                    >
                      <Sparkles className="h-4 w-4" /> Load Demo Channels
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {filteredFeedItems.map((entry, idx) => (
                      <VideoCard
                        key={`${entry.item.id}-${idx}`}
                        item={entry.item}
                        channelNumber={entry.channelNumber}
                        channelName={entry.channelName}
                        playlistTitle={entry.playlistTitle}
                        isLiveNow={entry.isLiveNow}
                        onTuneIn={() => {
                          switchChannelById(entry.channelId);
                          if (!powered) handlePowerOn();
                          setActiveView('watch');
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* EPG Overlay Modal */}
      {epgOpen && channel && (
        <EPGGuide
          channel={channel}
          schedule={schedule}
          queueIndex={currentIndex}
          onClose={() => setEpgOpen(false)}
        />
      )}

      {/* Control Room Settings Modal */}
      <SettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onCreateChannel={handleCreateChannel}
        onLoadDemo={handleLoadDemo}
        onSelectChannel={(id) => {
          switchChannelById(id);
          setSettingsOpen(false);
        }}
      />

      {/* Floating Theme & Mode Button (Bottom-Left Corner) */}
      <ThemeCustomizer />
    </div>
  );
}

// ---------------------------------------------------------------------------

function sortedChannels(channels: { channelNumber: number; createdAt: number; id: string }[]) {
  return [...channels].sort((a, b) =>
    a.channelNumber !== b.channelNumber ? a.channelNumber - b.channelNumber : a.createdAt - b.createdAt
  );
}

function NoSignalScreen({
  hasChannels,
  onOpenSettings,
  onLoadDemo,
}: {
  hasChannels: boolean;
  onOpenSettings: () => void;
  onLoadDemo: () => void;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-card text-card-foreground">
      <div className="relative z-10 flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-primary">
          <Radio className="h-8 w-8" />
        </div>
        <p className="font-sans text-xl font-bold tracking-tight text-foreground">
          No Scheduled Programming
        </p>
        <p className="max-w-md font-sans text-xs text-muted-foreground">
          {hasChannels
            ? 'This channel currently has no scheduled media items.'
            : 'No TV channels are configured yet. Add playlists or load demo channels to get started.'}
        </p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={onOpenSettings}
            className="pointer-events-auto rounded-full bg-primary px-6 py-2.5 font-sans text-xs font-bold text-primary-foreground transition-transform hover:scale-105 shadow-md"
          >
            Open Control Room
          </button>
          {!hasChannels && (
            <button
              onClick={onLoadDemo}
              className="pointer-events-auto rounded-full border border-amber-500/40 bg-amber-500/10 px-6 py-2.5 font-sans text-xs font-bold text-amber-500 transition-transform hover:scale-105"
            >
              Load Demo Broadcast
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BootScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="font-sans text-xs font-semibold text-muted-foreground">
          Loading TV Broadcast…
        </p>
      </div>
    </div>
  );
}
