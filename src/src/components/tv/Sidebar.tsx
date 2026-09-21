'use client';

import {
  Home,
  PlaySquare,
  ListVideo,
  Settings,
  Tv,
  Volume2,
  VolumeX,
  Radio,
  Plus,
  Zap,
} from 'lucide-react';
import type { ChannelConfig } from '@/lib/tv/types';

interface SidebarProps {
  open: boolean;
  activeView: 'feed' | 'watch' | 'epg' | 'settings';
  onSelectView: (view: 'feed' | 'watch' | 'epg' | 'settings') => void;
  channels: ChannelConfig[];
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
  onOpenSettings: () => void;
  crtEnabled: boolean;
  onToggleCRT: () => void;
  staticSoundEnabled: boolean;
  onToggleStaticSound: () => void;
  volume: number;
  onVolumeChange: (vol: number) => void;
  muted: boolean;
  onToggleMute: () => void;
}

export function Sidebar({
  open,
  activeView,
  onSelectView,
  channels,
  activeChannelId,
  onSelectChannel,
  onOpenSettings,
  crtEnabled,
  onToggleCRT,
  staticSoundEnabled,
  onToggleStaticSound,
  volume,
  onVolumeChange,
  muted,
  onToggleMute,
}: SidebarProps) {
  // Collapsed Mini Sidebar
  if (!open) {
    return (
      <aside className="flex h-full w-18 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-3 text-sidebar-foreground">
        <div className="flex flex-col gap-6">
          <button
            onClick={() => onSelectView('feed')}
            className={`flex flex-col items-center gap-1.5 rounded-xl px-3 py-2 transition-colors hover:bg-sidebar-accent ${
              activeView === 'feed' ? 'font-semibold text-sidebar-accent-foreground' : 'text-muted-foreground'
            }`}
            title="Home Feed"
          >
            <Home className={`h-5 w-5 ${activeView === 'feed' ? 'text-primary' : ''}`} />
            <span className="text-[10px]">Home</span>
          </button>

          <button
            onClick={() => onSelectView('watch')}
            className={`flex flex-col items-center gap-1.5 rounded-xl px-3 py-2 transition-colors hover:bg-sidebar-accent ${
              activeView === 'watch' ? 'font-semibold text-sidebar-accent-foreground' : 'text-muted-foreground'
            }`}
            title="Live Player Watch View"
          >
            <PlaySquare className={`h-5 w-5 ${activeView === 'watch' ? 'text-primary' : ''}`} />
            <span className="text-[10px]">Watch</span>
          </button>

          <button
            onClick={() => onSelectView('epg')}
            className={`flex flex-col items-center gap-1.5 rounded-xl px-3 py-2 transition-colors hover:bg-sidebar-accent ${
              activeView === 'epg' ? 'font-semibold text-sidebar-accent-foreground' : 'text-muted-foreground'
            }`}
            title="EPG Schedule Guide"
          >
            <ListVideo className="h-5 w-5" />
            <span className="text-[10px]">Guide</span>
          </button>
        </div>
      </aside>
    );
  }

  // Expanded Sidebar
  return (
    <aside className="tv-scroll flex h-full w-64 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar px-3 py-3 text-sidebar-foreground">
      {/* Main Navigation Section */}
      <div className="flex flex-col gap-1 pb-3 border-b border-sidebar-border">
        <button
          onClick={() => onSelectView('feed')}
          className={`flex w-full items-center gap-4 rounded-xl px-3 py-2.5 font-sans text-sm transition-colors ${
            activeView === 'feed'
              ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
              : 'hover:bg-sidebar-accent/70 text-sidebar-foreground'
          }`}
        >
          <Home className={`h-5 w-5 ${activeView === 'feed' ? 'text-primary' : ''}`} />
          <span>Home Feed</span>
        </button>

        <button
          onClick={() => onSelectView('watch')}
          className={`flex w-full items-center gap-4 rounded-xl px-3 py-2.5 font-sans text-sm transition-colors ${
            activeView === 'watch'
              ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
              : 'hover:bg-sidebar-accent/70 text-sidebar-foreground'
          }`}
        >
          <PlaySquare className={`h-5 w-5 ${activeView === 'watch' ? 'text-primary' : ''}`} />
          <span>Live Player View</span>
        </button>

        <button
          onClick={() => onSelectView('epg')}
          className={`flex w-full items-center gap-4 rounded-xl px-3 py-2.5 font-sans text-sm transition-colors ${
            activeView === 'epg'
              ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground'
              : 'hover:bg-sidebar-accent/70 text-sidebar-foreground'
          }`}
        >
          <ListVideo className="h-5 w-5" />
          <span>EPG Program Guide</span>
        </button>
      </div>

      {/* Subscriptions / Channels Section */}
      <div className="flex flex-col gap-1 py-3">
        <div className="flex items-center justify-between px-3 pb-1">
          <span className="font-sans text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            TV Channels
          </span>
          <button
            onClick={onOpenSettings}
            className="rounded p-1 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            title="Manage or Add Channels"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {channels.length === 0 ? (
          <p className="px-3 py-2 font-mono text-xs text-muted-foreground">No channels created</p>
        ) : (
          channels.map((ch) => {
            const isActive = ch.id === activeChannelId;
            return (
              <button
                key={ch.id}
                onClick={() => {
                  onSelectChannel(ch.id);
                  onSelectView('watch');
                }}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 transition-colors ${
                  isActive
                    ? 'bg-sidebar-accent font-semibold text-sidebar-accent-foreground ring-1 ring-primary/40'
                    : 'hover:bg-sidebar-accent/60 text-sidebar-foreground'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {ch.channelNumber}
                  </div>
                  <div className="flex flex-col text-left truncate">
                    <span className="truncate text-xs font-medium">{ch.name}</span>
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                      {ch.playbackMode}
                    </span>
                  </div>
                </div>

                {isActive && (
                  <span className="flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider text-primary">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
                    LIVE
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
