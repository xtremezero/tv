/**
 * Persistent application state store.
 * Zustand + persist middleware with deferred (skipHydration) rehydration so
 * server-side pre-rendering never touches localStorage — preventing
 * hydration mismatch errors across SSR boundaries.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ChannelConfig, PlaylistDefinition } from './types';

interface TVState {
  channels: ChannelConfig[];
  activeChannelId: string | null;
  quarantinedIds: string[];
  volume: number;
  muted: boolean;
  crtEnabled: boolean;
  staticSoundEnabled: boolean;
  youTubeApiKey: string;
  themeMode: 'dark' | 'light';
  accentColor: 'red' | 'emerald' | 'cyan' | 'amber' | 'purple';

  addChannel: (channel: ChannelConfig) => void;
  updateChannel: (id: string, updates: Partial<ChannelConfig>) => void;
  removeChannel: (id: string) => void;
  setActiveChannel: (id: string) => void;
  moveChannel: (id: string, direction: -1 | 1) => void;

  addPlaylist: (channelId: string, playlist: PlaylistDefinition) => void;
  updatePlaylist: (
    channelId: string,
    playlistId: string,
    updates: Partial<PlaylistDefinition>
  ) => void;
  removePlaylist: (channelId: string, playlistId: string) => void;
  movePlaylist: (channelId: string, playlistId: string, direction: -1 | 1) => void;

  setQueue: (channelId: string, queue: string[]) => void;
  setQueueIndex: (channelId: string, index: number) => void;

  quarantineMedia: (id: string) => void;
  clearQuarantine: () => void;

  setVolume: (volume: number) => void;
  setMuted: (muted: boolean) => void;
  toggleCrt: () => void;
  toggleStaticSound: () => void;
  setYouTubeApiKey: (key: string) => void;
  setThemeMode: (mode: 'dark' | 'light') => void;
  setAccentColor: (color: 'red' | 'emerald' | 'cyan' | 'amber' | 'purple') => void;

  restoreState: (data: Partial<TVState>) => boolean;
  resetAll: () => void;
}

export const useTVStore = create<TVState>()(
  persist(
    (set) => ({
      channels: [],
      activeChannelId: null,
      quarantinedIds: [],
      volume: 0.8,
      muted: false,
      crtEnabled: false,
      staticSoundEnabled: false,
      youTubeApiKey: '',
      themeMode: 'dark',
      accentColor: 'red',

      addChannel: (channel) =>
        set((state) => ({ channels: [...state.channels, channel] })),

      updateChannel: (id, updates) =>
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === id ? { ...ch, ...updates } : ch
          ),
        })),

      removeChannel: (id) =>
        set((state) => ({
          channels: state.channels.filter((ch) => ch.id !== id),
          activeChannelId:
            state.activeChannelId === id
              ? state.channels.find((ch) => ch.id !== id)?.id ?? null
              : state.activeChannelId,
        })),

      setActiveChannel: (id) => set({ activeChannelId: id }),

      moveChannel: (id, direction) =>
        set((state) => {
          const index = state.channels.findIndex((ch) => ch.id === id);
          const target = index + direction;
          if (index < 0 || target < 0 || target >= state.channels.length) return state;
          const channels = [...state.channels];
          [channels[index], channels[target]] = [channels[target], channels[index]];
          return { channels };
        }),

      addPlaylist: (channelId, playlist) =>
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === channelId
              ? { ...ch, playlists: [...ch.playlists, playlist], queue: [], queueIndex: 0 }
              : ch
          ),
        })),

      updatePlaylist: (channelId, playlistId, updates) =>
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === channelId
              ? {
                  ...ch,
                  playlists: ch.playlists.map((pl) =>
                    pl.id === playlistId ? { ...pl, ...updates } : pl
                  ),
                  queue: [],
                  queueIndex: 0,
                }
              : ch
          ),
        })),

      removePlaylist: (channelId, playlistId) =>
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === channelId
              ? {
                  ...ch,
                  playlists: ch.playlists.filter((pl) => pl.id !== playlistId),
                  queue: [],
                  queueIndex: 0,
                }
              : ch
          ),
        })),

      movePlaylist: (channelId, playlistId, direction) =>
        set((state) => ({
          channels: state.channels.map((ch) => {
            if (ch.id !== channelId) return ch;
            const index = ch.playlists.findIndex((pl) => pl.id === playlistId);
            const target = index + direction;
            if (index < 0 || target < 0 || target >= ch.playlists.length) return ch;
            const playlists = [...ch.playlists];
            [playlists[index], playlists[target]] = [
              playlists[target],
              playlists[index],
            ];
            return { ...ch, playlists, queue: [], queueIndex: 0 };
          }),
        })),

      setQueue: (channelId, queue) =>
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === channelId ? { ...ch, queue: queue.map((i) => i), queueIndex: 0 } : ch
          ),
        })),

      setQueueIndex: (channelId, index) =>
        set((state) => ({
          channels: state.channels.map((ch) =>
            ch.id === channelId ? { ...ch, queueIndex: index } : ch
          ),
        })),

      quarantineMedia: (id) =>
        set((state) => ({
          quarantinedIds: Array.from(new Set([...state.quarantinedIds, id])),
        })),

      clearQuarantine: () => set({ quarantinedIds: [] }),

      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
      setMuted: (muted) => set({ muted }),
      toggleCrt: () => set((state) => ({ crtEnabled: !state.crtEnabled })),
      toggleStaticSound: () =>
        set((state) => ({ staticSoundEnabled: !state.staticSoundEnabled })),
      setYouTubeApiKey: (key) => set({ youTubeApiKey: key.trim() }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setAccentColor: (accentColor) => set({ accentColor }),

      restoreState: (data) => {
        if (!data.channels || !Array.isArray(data.channels)) return false;
        set({
          channels: data.channels,
          activeChannelId: data.channels[0]?.id ?? null,
          quarantinedIds: data.quarantinedIds ?? [],
          volume: typeof data.volume === 'number' ? data.volume : 0.8,
          muted: typeof data.muted === 'boolean' ? data.muted : true,
          crtEnabled: typeof data.crtEnabled === 'boolean' ? data.crtEnabled : true,
          staticSoundEnabled:
            typeof data.staticSoundEnabled === 'boolean' ? data.staticSoundEnabled : false,
          youTubeApiKey: typeof data.youTubeApiKey === 'string' ? data.youTubeApiKey : '',
        });
        return true;
      },

      resetAll: () =>
        set({
          channels: [],
          activeChannelId: null,
          quarantinedIds: [],
        }),
    }),
    {
      name: 'pseudo-tv-state-registry',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      version: 1,
    }
  )
);
