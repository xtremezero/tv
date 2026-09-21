'use client';

import { Menu, Search, Plus, ListVideo, Tv, Volume2, VolumeX, X, Sparkles } from 'lucide-react';

interface HeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenSettings: () => void;
  onOpenEPG: () => void;
  crtEnabled: boolean;
  onToggleCRT: () => void;
  muted: boolean;
  onToggleMute: () => void;
  onLoadDemo: () => void;
  hasChannels: boolean;
}

export function Header({
  onToggleSidebar,
  searchQuery,
  onSearchChange,
  onOpenSettings,
  onOpenEPG,
  crtEnabled,
  onToggleCRT,
  muted,
  onToggleMute,
  onLoadDemo,
  hasChannels,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-md text-foreground">
      {/* Left: Hamburger & YouTube TV Logo */}
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="rounded-full p-2 text-foreground transition-colors hover:bg-secondary"
          aria-label="Toggle navigation drawer"
          title="Toggle Navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div
          className="group flex cursor-pointer items-center gap-2 select-none"
          onClick={() => onSearchChange('')}
        >
          <div className="flex h-8 w-8 items-center justify-center transition-transform group-hover:scale-105">
            <img src={`${process.env.NEXT_PUBLIC_BASE_PATH || '/tv'}/logo.svg`} alt="TV Logo" className="h-8 w-8 object-contain" />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-sans text-xl font-bold tracking-tight text-foreground">
              TV
            </span>
            <span className="rounded bg-primary/15 border border-primary/30 px-1 py-0.5 text-[9px] font-bold tracking-widest text-primary">
              LIVE
            </span>
          </div>
        </div>
      </div>

      {/* Center: Search Bar */}
      <div className="mx-4 flex max-w-xl flex-1 items-center">
        <div className="relative flex w-full items-center">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search channels, programs, playlists..."
            className="w-full rounded-l-full border border-border bg-muted/70 py-1.5 pl-4 pr-10 font-sans text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary focus:bg-background"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          className="flex h-[38px] items-center rounded-r-full border border-l-0 border-border bg-secondary px-5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Search"
          title="Search"
        >
          <Search className="h-4 w-4" />
        </button>
      </div>

      {/* Right: Actions & User Avatar */}
      <div className="flex items-center gap-1 sm:gap-2">
        {!hasChannels && (
          <button
            onClick={onLoadDemo}
            className="hidden items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-500 transition-colors hover:bg-amber-500/20 md:flex"
            title="Load Demo Broadcast Channels"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Demo Broadcast
          </button>
        )}

        <button
          onClick={onOpenEPG}
          className="rounded-full p-2.5 text-foreground transition-colors hover:bg-secondary"
          title="Open EPG Program Guide (G)"
        >
          <ListVideo className="h-5 w-5" />
        </button>

        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-muted"
          title="Open Control Room"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Add / Control</span>
        </button>

        <button
          onClick={onToggleMute}
          className="rounded-full p-2.5 text-foreground transition-colors hover:bg-secondary"
          title={muted ? 'Unmute (M)' : 'Mute (M)'}
        >
          {muted ? <VolumeX className="h-5 w-5 text-destructive" /> : <Volume2 className="h-5 w-5" />}
        </button>
      </div>
    </header>
  );
}
