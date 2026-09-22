'use client';

import { useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  ListMusic,
  Loader2,
  Plus,
  RotateCcw,
  ShieldAlert,
  Shuffle,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useTVStore } from '@/lib/tv/store';
import { DisasterRecoveryService } from '@/lib/tv/backup';
import type { ChannelConfig, PlaylistDefinition, VideoSource } from '@/lib/tv/types';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateChannel: () => void;
  onLoadDemo: () => void;
  onSelectChannel: (id: string) => void;
}

const SOURCE_BADGE: Record<VideoSource, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  dailymotion: 'Dailymotion',
};

export function SettingsPanel({
  open,
  onOpenChange,
  onCreateChannel,
  onLoadDemo,
  onSelectChannel,
}: SettingsPanelProps) {
  const { toast } = useToast();
  const channels = useTVStore((s) => s.channels);
  const volume = useTVStore((s) => s.volume);
  const muted = useTVStore((s) => s.muted);
  const crtEnabled = useTVStore((s) => s.crtEnabled);
  const staticSoundEnabled = useTVStore((s) => s.staticSoundEnabled);
  const youTubeApiKey = useTVStore((s) => s.youTubeApiKey);
  const quarantinedIds = useTVStore((s) => s.quarantinedIds);

  const [fetchingUrl, setFetchingUrl] = useState<string | null>(null);
  const [fetchErrors, setFetchErrors] = useState<Record<string, string>>({});
  const [importText, setImportText] = useState('');
  const [showKey, setShowKey] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const store = useTVStore;

  const handleFetchPlaylist = async (channelId: string, url: string) => {
    if (!url.trim()) return;
    setFetchingUrl(channelId);
    setFetchErrors((prev) => ({ ...prev, [channelId]: '' }));
    try {
      let playlist: PlaylistDefinition | undefined;
      let errorMsg: string | undefined;

      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/tv';
      const apiEndpoint = `${basePath}/api/ingest`;

      try {
        const res = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url.trim(), youTubeApiKey: youTubeApiKey || undefined }),
        });
        if (res.ok) {
          const data = (await res.json()) as { playlist?: PlaylistDefinition; error?: string };
          if (data.playlist) playlist = data.playlist;
          else errorMsg = data.error;
        }
      } catch {
        // API endpoint unavailable or not supported in static build
      }

      if (!playlist) {
        // Fall back to client-side ingestion engine
        const { ingestPlaylist, isCorsError } = await import('@/lib/tv/ingest');
        try {
          playlist = await ingestPlaylist(url.trim(), youTubeApiKey || undefined);
        } catch (err) {
          if (isCorsError(err)) {
            useTVStore.getState().triggerCorsModal(url.trim());
          }
          errorMsg = err instanceof Error ? err.message : 'Client-side ingestion failed.';
        }
      }

      if (playlist && playlist.items.length > 0) {
        store.getState().addPlaylist(channelId, playlist);
        toast({
          title: 'Playlist added to channel',
          description: `${playlist.title} — ${playlist.items.length} videos scheduled.`,
        });
      } else {
        setFetchErrors((prev) => ({ ...prev, [channelId]: errorMsg ?? 'Ingestion failed.' }));
      }
    } catch (err) {
      if (err instanceof Error && (err.message.includes('CORS') || err.message.includes('fetch'))) {
        useTVStore.getState().triggerCorsModal(url.trim());
      }
      setFetchErrors((prev) => ({ ...prev, [channelId]: 'Network or CORS error while fetching playlist.' }));
    } finally {
      setFetchingUrl(null);
    }
  };

  const handleExportJson = async () => {
    const jsonStr = await DisasterRecoveryService.generateBackupBlob(store.getState());
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tv-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Backup envelope exported', description: `SHA-256 signature attached.` });
  };

  const handleImportText = async (serialized: string) => {
    if (!serialized.trim()) return;
    const state = store.getState();
    const result = await DisasterRecoveryService.executeRecovery(serialized, state);
    if (result.success) {
      toast({ title: 'Recovery complete', description: 'Configuration restored and integrity-verified.' });
      setImportText('');
    } else {
      toast({ title: 'Recovery failed', description: result.errorReason, variant: 'destructive' });
    }
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    await handleImportText(text);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="tv-scroll w-full overflow-y-auto border-l border-border bg-popover text-popover-foreground sm:max-w-md shadow-2xl backdrop-blur-md"
        data-testid="settings-panel"
      >
        <SheetHeader className="pb-2">
          <SheetTitle className="font-sans font-bold text-lg tracking-tight text-popover-foreground flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-primary shadow" /> Control Room
          </SheetTitle>
          <SheetDescription className="font-sans text-xs text-muted-foreground">
            Channel Matrix · Playback Engine · Data Backup
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="channels" className="mt-2 px-1 pb-8">
          <TabsList className="grid w-full grid-cols-3 border border-border bg-muted/60 rounded-xl p-1">
            <TabsTrigger
              value="channels"
              className="font-sans text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground rounded-lg transition-colors py-1.5"
            >
              Channels
            </TabsTrigger>
            <TabsTrigger
              value="playback"
              className="font-sans text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground rounded-lg transition-colors py-1.5"
            >
              Playback
            </TabsTrigger>
            <TabsTrigger
              value="data"
              className="font-sans text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground text-muted-foreground rounded-lg transition-colors py-1.5"
            >
              Data
            </TabsTrigger>
          </TabsList>

          {/* ------------------------------ CHANNELS ------------------------------ */}
          <TabsContent value="channels" className="mt-4 space-y-4">
            <div className="flex gap-2">
              <Button
                onClick={onCreateChannel}
                className="flex-1 bg-primary font-sans text-xs font-bold text-primary-foreground hover:bg-primary/90 rounded-xl shadow-md transition-transform hover:scale-102"
                data-testid="new-channel-btn"
              >
                <Plus className="mr-1.5 h-4 w-4" /> New Channel
              </Button>
              <Button
                onClick={onLoadDemo}
                variant="outline"
                className="bg-secondary border border-border font-sans text-xs font-semibold text-secondary-foreground hover:bg-muted rounded-xl"
                data-testid="demo-load-btn"
              >
                <Zap className="mr-1.5 h-3.5 w-3.5 text-amber-500" /> Demo Channels
              </Button>
            </div>

            {channels.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border p-6 text-center font-sans text-xs leading-relaxed text-muted-foreground bg-muted/30">
                No channels active.
                <br />
                Click <strong className="text-foreground">New Channel</strong> above and paste playlist URLs from YouTube, Vimeo, or Dailymotion.
              </p>
            )}

            {channels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                isActive={false}
                onSelect={() => onSelectChannel(channel.id)}
                fetching={fetchingUrl === channel.id}
                fetchError={fetchErrors[channel.id] ?? ''}
                onFetch={(url) => handleFetchPlaylist(channel.id, url)}
                onMove={(dir) => store.getState().moveChannel(channel.id, dir)}
                onDelete={() => store.getState().removeChannel(channel.id)}
                onUpdate={(updates) => store.getState().updateChannel(channel.id, updates)}
                onMovePlaylist={(pid, dir) => store.getState().movePlaylist(channel.id, pid, dir)}
                onRemovePlaylist={(pid) => store.getState().removePlaylist(channel.id, pid)}
                onUpdatePlaylist={(pid, updates) => store.getState().updatePlaylist(channel.id, pid, updates)}
              />
            ))}
          </TabsContent>

          {/* ------------------------------ PLAYBACK ------------------------------ */}
          <TabsContent value="playback" className="mt-4 space-y-6">
            <section className="space-y-3 rounded-2xl bg-card border border-border p-4">
              <h3 className="font-sans text-xs font-bold uppercase tracking-wider text-muted-foreground">Master Audio</h3>
              <div className="flex items-center gap-4">
                <Slider
                  value={[Math.round(volume * 100)]}
                  max={100}
                  step={1}
                  onValueChange={([v]) => store.getState().setVolume(v / 100)}
                  className="flex-1 [&_[data-slot=slider-range]]:bg-primary [&_[data-slot=slider-thumb]]:border-primary"
                />
                <span className="w-10 text-right font-mono text-xs text-foreground font-bold">{Math.round(volume * 100)}%</span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="font-sans text-xs text-foreground">Mute Audio</span>
                <Switch
                  checked={muted}
                  onCheckedChange={(v) => store.getState().setMuted(v)}
                  className="data-[state=checked]:bg-primary"
                />
              </div>
            </section>

            <section className="space-y-3 rounded-2xl bg-card border border-border p-4">
              <h3 className="font-sans text-xs font-bold uppercase tracking-wider text-muted-foreground">YouTube API Integration</h3>
              <p className="font-sans text-xs leading-relaxed text-muted-foreground">
                Optional Data API v3 key for high-quota metadata extraction and private playlist resolution.
              </p>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={youTubeApiKey}
                  onChange={(e) => store.getState().setYouTubeApiKey(e.target.value)}
                  placeholder="Paste YouTube API key (AIzaSy…)"
                  className="pr-10 rounded-xl border-border bg-muted font-sans text-xs text-foreground placeholder:text-muted-foreground"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </section>
          </TabsContent>

          {/* ------------------------------ DATA ------------------------------ */}
          <TabsContent value="data" className="mt-4 space-y-6">
            <section className="space-y-3 rounded-2xl bg-card border border-border p-4">
              <h3 className="font-sans text-xs font-bold uppercase tracking-wider text-muted-foreground">Backup & Restore</h3>
              <div className="flex gap-2">
                <Button
                  onClick={handleExportJson}
                  className="flex-1 bg-secondary border border-border font-sans text-xs font-semibold text-secondary-foreground hover:bg-muted rounded-xl"
                >
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Export Backup
                </Button>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 bg-secondary border border-border font-sans text-xs font-semibold text-secondary-foreground hover:bg-muted rounded-xl"
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> Import File
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportFile(f);
                  e.target.value = '';
                }}
              />
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="…or paste a backup JSON envelope here"
                rows={4}
                className="tv-scroll w-full rounded-xl border border-border bg-muted p-3 font-mono text-xs text-foreground placeholder:text-muted-foreground"
              />
              <Button
                onClick={() => handleImportText(importText)}
                disabled={!importText.trim()}
                className="w-full bg-primary font-sans text-xs font-bold text-primary-foreground hover:bg-primary/90 rounded-xl disabled:opacity-40"
              >
                Restore Config
              </Button>
            </section>

            <section className="space-y-3 rounded-2xl bg-card border border-border p-4">
              <h3 className="font-sans text-xs font-bold uppercase tracking-wider text-muted-foreground">Quarantine Registry</h3>
              <p className="font-sans text-xs leading-relaxed text-muted-foreground">
                {quarantinedIds.length} broken or embedding-restricted video asset(s) currently quarantined from rotation.
              </p>
              <Button
                onClick={() => {
                  store.getState().clearQuarantine();
                  toast({ title: 'Quarantine cleared', description: 'Quarantined videos restored to scheduling.' });
                }}
                className="w-full bg-secondary border border-border font-sans text-xs font-semibold text-secondary-foreground hover:bg-muted rounded-xl"
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset Quarantine Registry
              </Button>
            </section>

            <section className="space-y-3 rounded-2xl bg-destructive/10 border border-destructive/30 p-4">
              <h3 className="font-sans text-xs font-bold uppercase tracking-wider text-destructive">Danger Zone</h3>
              <Button
                onClick={() => {
                  if (window.confirm('Wipe all channels, playlists and settings? This cannot be undone.')) {
                    store.getState().resetAll();
                    toast({ title: 'Registry wiped', description: 'All channels removed.' });
                  }
                }}
                className="w-full bg-destructive font-sans text-xs font-bold text-white hover:bg-destructive/90 rounded-xl"
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Wipe All Data
              </Button>
            </section>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------

interface ChannelCardProps {
  channel: ChannelConfig;
  isActive: boolean;
  fetching: boolean;
  fetchError: string;
  onSelect: () => void;
  onFetch: (url: string) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onUpdate: (updates: Partial<ChannelConfig>) => void;
  onMovePlaylist: (playlistId: string, dir: -1 | 1) => void;
  onRemovePlaylist: (playlistId: string) => void;
  onUpdatePlaylist: (playlistId: string, updates: Partial<PlaylistDefinition>) => void;
}

function ChannelCard({
  channel,
  fetching,
  fetchError,
  onFetch,
  onMove,
  onDelete,
  onUpdate,
  onMovePlaylist,
  onRemovePlaylist,
  onUpdatePlaylist,
}: ChannelCardProps) {
  const [open, setOpen] = useState(false);
  const totalItems = channel.playlists.reduce((sum, pl) => sum + pl.items.length, 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-3 space-y-3 shadow-md" data-testid={`channel-card-${channel.channelNumber}`}>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          <span className="font-sans text-[11px] font-bold text-muted-foreground">CH</span>
          <Input
            type="number"
            min={1}
            max={999}
            value={channel.channelNumber}
            onChange={(e) => onUpdate({ channelNumber: Math.max(1, Math.min(999, Number(e.target.value) || 1)) })}
            className="w-14 rounded-lg border-border bg-muted px-2 text-center font-sans text-xs font-bold text-foreground h-9"
            aria-label="Channel number"
          />
        </div>
        <Input
          value={channel.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          className="h-9 flex-1 rounded-lg border-border bg-muted font-sans text-xs font-semibold text-foreground px-3"
          aria-label="Channel name"
        />
        <div className="flex flex-col gap-0.5">
          <button onClick={() => onMove(-1)} className="text-muted-foreground hover:text-foreground" aria-label="Move channel up">
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onMove(1)} className="text-muted-foreground hover:text-foreground" aria-label="Move channel down">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          onClick={onDelete}
          className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          aria-label="Delete channel"
          data-testid="delete-channel-btn"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border">
        <Select
          value={channel.playbackMode}
          onValueChange={(v) => onUpdate({ playbackMode: v as 'queue' | 'linear' })}
        >
          <SelectTrigger className="h-8 w-[190px] rounded-lg border-border bg-muted font-sans text-xs font-medium text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-border bg-popover text-popover-foreground">
            <SelectItem value="queue" className="font-sans text-xs">
              Sequential Interleave Queue
            </SelectItem>
            <SelectItem value="linear" className="font-sans text-xs">
              Virtual Linear Broadcast (Live)
            </SelectItem>
          </SelectContent>
        </Select>

        {channel.playbackMode === 'linear' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onUpdate({ epochStartTime: Date.now() })}
            className="h-8 rounded-lg bg-secondary border-border font-sans text-[11px] font-semibold text-amber-500 hover:bg-muted"
            title="Restart the linear timeline from the current moment"
          >
            RE-EPOCH NOW
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen((o) => !o)}
          className="h-8 rounded-lg font-sans text-xs font-semibold text-foreground hover:bg-muted ml-auto"
          data-testid="manage-playlists-btn"
        >
          <ListMusic className="mr-1.5 h-3.5 w-3.5 text-primary" />
          {channel.playlists.length} Playlists · {totalItems} Videos
        </Button>
      </div>

      {open && (
        <div className="space-y-3 pt-2 border-t border-border">
          {channel.playlists.map((pl, idx) => (
            <div key={pl.id} className="rounded-xl border border-border bg-muted/50 p-3 space-y-2" data-testid="playlist-row">
              <div className="flex items-center gap-2">
                <span className="rounded bg-primary/15 border border-primary/30 px-2 py-0.5 font-sans text-[10px] font-bold text-primary">
                  {SOURCE_BADGE[pl.source]}
                </span>
                <span className="min-w-0 flex-1 truncate font-sans text-xs font-semibold text-foreground">{pl.title}</span>
                <span className="font-sans text-[11px] text-muted-foreground">{pl.items.length} items</span>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <label className="flex items-center gap-1.5 font-sans text-xs text-foreground cursor-pointer">
                  <Shuffle className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px]">Shuffle</span>
                  <Switch
                    checked={pl.shuffle}
                    onCheckedChange={(v) => onUpdatePlaylist(pl.id, { shuffle: v })}
                    className="scale-75 data-[state=checked]:bg-primary"
                    aria-label={`Shuffle ${pl.title}`}
                  />
                </label>
                <label className="flex items-center gap-1.5 font-sans text-xs text-foreground">
                  <span className="text-[11px] font-semibold">Weight</span>
                  <Select
                    value={String(pl.weight ?? 1)}
                    onValueChange={(v) => onUpdatePlaylist(pl.id, { weight: Number(v) })}
                  >
                    <SelectTrigger className="h-6 w-14 rounded-md border-border bg-muted px-1 font-sans text-xs text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-border bg-popover text-popover-foreground">
                      {[1, 2, 3, 4, 5].map((w) => (
                        <SelectItem key={w} value={String(w)} className="font-sans text-xs">
                          ×{w}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() => onMovePlaylist(pl.id, -1)}
                    disabled={idx === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-1"
                    aria-label="Move playlist earlier"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onMovePlaylist(pl.id, 1)}
                    disabled={idx === channel.playlists.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-20 p-1"
                    aria-label="Move playlist later"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onRemovePlaylist(pl.id)}
                    className="text-destructive/70 hover:text-destructive p-1"
                    aria-label="Remove playlist"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          <div className="flex gap-2 pt-1">
            <Input
              data-playlist-input={channel.id}
              placeholder="Paste playlist URL (YouTube / Vimeo / Dailymotion)"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onFetch((e.target as HTMLInputElement).value);
                }
              }}
              className="h-9 flex-1 rounded-xl border-border bg-muted font-sans text-xs text-foreground placeholder:text-muted-foreground px-3"
            />
            <Button
              onClick={() => {
                const input = document.querySelector<HTMLInputElement>(`[data-playlist-input="${channel.id}"]`);
                onFetch(input?.value ?? '');
              }}
              disabled={fetching}
              className="h-9 bg-primary font-sans text-xs font-bold text-primary-foreground hover:bg-primary/90 rounded-xl px-4"
              data-testid="fetch-playlist-btn"
            >
              {fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
            </Button>
          </div>
          {fetchError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 font-sans text-xs text-destructive space-y-2">
              <p>{fetchError}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => useTVStore.getState().triggerCorsModal()}
                className="h-7 text-[11px] font-semibold bg-background/80 hover:bg-background border-destructive/40 text-foreground flex items-center gap-1.5"
              >
                <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
                Fix CORS Error (Install Extension)
              </Button>
            </div>
          )}
          <p className="font-sans text-[11px] text-muted-foreground leading-normal">
            Playlist order sets the interleave rotation (A, B, C → A1·B1·C1…). Weight ×2 plays two consecutive items per cycle.
          </p>
        </div>
      )}
    </div>
  );
}
