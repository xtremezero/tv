/**
 * Built-in demo package — lets the viewer experience the full broadcast engine
 * (interleaving, shuffle, linear mode, bumpers) without any API keys.
 * All assets are famously embeddable, publicly available videos.
 */

import type { ChannelConfig, NormalizedMediaItem, PlaylistDefinition, VideoSource } from '@/lib/tv/types';

function yt(sourceId: string, title: string, duration: number): NormalizedMediaItem {
  return {
    id: `youtube:${sourceId}`,
    sourceId,
    source: 'youtube' as VideoSource,
    title,
    duration,
    thumbnailUrl: `https://i.ytimg.com/vi/${sourceId}/mqdefault.jpg`,
    playbackUrl: `https://www.youtube.com/watch?v=${sourceId}`,
    isEmbeddable: true,
  };
}

function playlist(
  n: string,
  title: string,
  items: NormalizedMediaItem[],
  shuffle: boolean,
  weight = 1
): PlaylistDefinition {
  return {
    id: `demo-${n}`,
    title,
    source: 'youtube',
    sourceUrl: '(demo package)',
    items,
    shuffle,
    weight,
  };
}

const OPEN_MOVIES = playlist('films', 'Open Movie Reel', [
  yt('YE7VzlLtp-4', 'Big Buck Bunny', 596),
  yt('eRsGyueVLvQ', 'Sintel', 888),
  yt('TLkA0RELQ1g', 'Elephants Dream', 653),
  yt('R6MlUcmOul8', 'Tears of Steel', 734),
  yt('aqz-KE-bpKQ', 'Big Buck Bunny 60fps', 635),
  yt('WhWc3b3KhnY', 'Spring', 464),
], true);

const MUSIC = playlist('music', 'Hit Parade', [
  yt('9bZkp7q19f0', 'PSY - Gangnam Style', 253),
  yt('kJQP7kiw5Fk', 'Luis Fonsi - Despacito', 282),
  yt('60ItHLz5WEA', 'Alan Walker - Faded', 242),
  yt('JGwWNGJdvx8', 'Ed Sheeran - Shape of You', 263),
  yt('fJ9rUzIMcZQ', 'Queen - Bohemian Rhapsody', 355),
  yt('hTWKbfoikeg', 'Nirvana - Smells Like Teen Spirit', 278),
  yt('dQw4w9WgXcQ', 'Rick Astley - Never Gonna Give You Up', 212),
  yt('ZbZSe6N_BXs', 'Pharrell Williams - Happy', 234),
], true);

const BUMPERS = playlist('bumpers', 'Station Ident Bumpers', [
  yt('jNQXAC9IVRw', 'Me at the zoo', 19),
  yt('mN0zPOpADL4', 'Agent 327: Operation Barbershop', 52),
  yt('aqz-KE-bpKQ', 'Big Buck Bunny (short cut)', 90),
], true, 1);

export function createDemoChannels(): ChannelConfig[] {
  const now = Date.now();
  return [
    {
      id: 'demo-ch-1',
      channelNumber: 1,
      name: 'Open Movie Vault',
      playlists: [structuredClone(OPEN_MOVIES)],
      playbackMode: 'queue',
      epochStartTime: now,
      queue: [],
      queueIndex: 0,
      createdAt: now,
    },
    {
      id: 'demo-ch-2',
      channelNumber: 2,
      name: 'Hit Music Station',
      playlists: [structuredClone(MUSIC)],
      playbackMode: 'queue',
      epochStartTime: now,
      queue: [],
      queueIndex: 0,
      createdAt: now,
    },
    {
      id: 'demo-ch-3',
      channelNumber: 3,
      name: 'Interleaved Mix',
      playlists: [structuredClone(OPEN_MOVIES), structuredClone(MUSIC), structuredClone(BUMPERS)],
      playbackMode: 'queue',
      epochStartTime: now,
      queue: [],
      queueIndex: 0,
      createdAt: now,
    },
    {
      id: 'demo-ch-4',
      channelNumber: 4,
      name: 'Cinema Live (Linear)',
      playlists: [{ ...structuredClone(OPEN_MOVIES), shuffle: false }],
      playbackMode: 'linear',
      epochStartTime: now,
      queue: [],
      queueIndex: 0,
      createdAt: now,
    },
  ];
}
