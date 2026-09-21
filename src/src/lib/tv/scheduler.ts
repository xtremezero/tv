/**
 * Algorithmic scheduling core.
 *
 * Two operational paradigms:
 *  1. Sequential Interleaved Queue — round-robin merge A1,B1,C1,A2,B2,C2,...
 *  2. Virtual Linear Broadcast — wall-clock epoch anchored timeline.
 *
 * Additionally supports a proportional scheduling matrix W = [w0..wM-1] where
 * a playlist with weight 2 emits two sequential assets per round versus one.
 */

import type { ChannelConfig, NormalizedMediaItem, PlaylistDefinition } from './types';

/** Fisher-Yates permutation over a defensive copy. */
export function shuffleArray<T>(array: readonly T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function playableItems(
  playlists: PlaylistDefinition[],
  quarantineSet: Set<string>
): NormalizedMediaItem[][] {
  return playlists.map((pl) =>
    pl.items.filter((item) => item.isEmbeddable && !quarantineSet.has(item.id))
  );
}

/**
 * Cyclic round-robin across unequal playlist lengths.
 * Shorter pools wrap via modulo so the interleave pattern persists.
 */
export function buildInterleavedQueue(
  playlists: PlaylistDefinition[],
  quarantineSet: Set<string>
): NormalizedMediaItem[] {
  if (playlists.length === 0) return [];

  const sanitizedPools = playableItems(playlists, quarantineSet);
  const maxPoolLength = Math.max(...sanitizedPools.map((pool) => pool.length), 0);
  const compositeQueue: NormalizedMediaItem[] = [];

  for (let step = 0; step < maxPoolLength; step++) {
    for (let pIndex = 0; pIndex < sanitizedPools.length; pIndex++) {
      const currentPool = sanitizedPools[pIndex];
      if (currentPool.length > 0) {
        compositeQueue.push(currentPool[step % currentPool.length]);
      }
    }
  }

  return compositeQueue;
}

/**
 * Proportional Scheduling Matrix.
 * With weights A=2, B=1 the draw is (A1, A2, B1, A3, A4, B2, ...).
 */
export function buildWeightedQueue(
  playlists: PlaylistDefinition[],
  quarantineSet: Set<string>
): NormalizedMediaItem[] {
  if (playlists.length === 0) return [];

  const pools = playableItems(playlists, quarantineSet).map((pool) => [...pool]);
  if (pools.every((p) => p.length === 0)) return [];

  const weights = playlists.map((pl) => Math.max(1, Math.round(pl.weight ?? 1)));

  // Full proportional cycle length: enough rounds for the slowest playlist
  // to be traversed at least once at its own draw rate.
  const rounds = Math.max(
    ...pools.map((pool, i) => Math.ceil(pool.length / weights[i])),
    1
  );

  const cursors = pools.map(() => 0);
  const compositeQueue: NormalizedMediaItem[] = [];

  for (let round = 0; round < rounds; round++) {
    for (let pIndex = 0; pIndex < pools.length; pIndex++) {
      const pool = pools[pIndex];
      if (pool.length === 0) continue;
      for (let k = 0; k < weights[pIndex]; k++) {
        compositeQueue.push(pool[cursors[pIndex] % pool.length]);
        cursors[pIndex]++;
      }
    }
  }

  return compositeQueue;
}

/** Dispatches to the weighted matrix only when a non-default weight exists. */
export function buildChannelQueue(
  channel: ChannelConfig,
  quarantineSet: Set<string>
): NormalizedMediaItem[] {
  const hasWeights = channel.playlists.some((pl) => (pl.weight ?? 1) !== 1);
  return hasWeights
    ? buildWeightedQueue(channel.playlists, quarantineSet)
    : buildInterleavedQueue(channel.playlists, quarantineSet);
}

/** Resolves persisted queue ids into playable items, dropping broken assets. */
export function resolveQueueFromIds(
  channel: ChannelConfig,
  quarantineSet: Set<string>
): NormalizedMediaItem[] {
  const itemIndex = new Map<string, NormalizedMediaItem>();
  for (const pl of channel.playlists) {
    for (const item of pl.items) {
      if (item.isEmbeddable && !quarantineSet.has(item.id)) {
        itemIndex.set(item.id, item);
      }
    }
  }
  const resolved: NormalizedMediaItem[] = [];
  const seen = new Set<string>();
  for (const id of channel.queue) {
    const item = itemIndex.get(id);
    if (item && !seen.has(id)) {
      resolved.push(item);
      seen.add(id);
    }
  }
  // Ids may be stale after playlist edits — append any new playable items.
  for (const pl of channel.playlists) {
    for (const item of pl.items) {
      if (!seen.has(item.id) && item.isEmbeddable && !quarantineSet.has(item.id)) {
        resolved.push(item);
        seen.add(item.id);
      }
    }
  }
  return resolved;
}

export interface LivePlaybackCoordinates {
  activeItem: NormalizedMediaItem;
  scheduleIndex: number;
  seekOffsetSeconds: number;
}

/**
 * Joins an ongoing broadcast: computes which asset should be on air *right now*
 * and the exact internal seek offset, anchored to the immutable epoch origin.
 */
export function resolveLiveTimelineCoordinates(
  schedule: NormalizedMediaItem[],
  epochStartTimeMs: number
): LivePlaybackCoordinates | null {
  if (schedule.length === 0) return null;

  const totalCycleDuration = schedule.reduce((sum, item) => sum + item.duration, 0);
  if (totalCycleDuration <= 0) return null;

  const nowSeconds = Date.now() / 1000;
  const epochSeconds = epochStartTimeMs / 1000;
  const elapsed = Math.max(0, nowSeconds - epochSeconds);
  const relativeTimelinePosition = elapsed % totalCycleDuration;

  let accumulatedDuration = 0;
  for (let i = 0; i < schedule.length; i++) {
    const itemDuration = Math.max(1, schedule[i].duration);
    if (accumulatedDuration + itemDuration > relativeTimelinePosition) {
      return {
        activeItem: schedule[i],
        scheduleIndex: i,
        seekOffsetSeconds: Math.max(
          0,
          Math.floor(relativeTimelinePosition - accumulatedDuration)
        ),
      };
    }
    accumulatedDuration += itemDuration;
  }

  return { activeItem: schedule[0], scheduleIndex: 0, seekOffsetSeconds: 0 };
}

export interface EpgEntry {
  item: NormalizedMediaItem;
  /** Absolute clock time (ms) the program starts */
  startMs: number;
  index: number;
  isLive: boolean;
}

/**
 * Electronic Program Guide matrix.
 * Queue mode → timeline projected forward from the current position.
 * Linear mode → timeline anchored to the channel epoch (true broadcast grid).
 */
export function computeEpgSchedule(
  schedule: NormalizedMediaItem[],
  opts: { mode: 'queue' | 'linear'; queueIndex: number; epochStartTimeMs: number; count?: number }
): EpgEntry[] {
  const count = opts.count ?? 40;
  if (schedule.length === 0) return [];
  const nowMs = Date.now();

  if (opts.mode === 'linear') {
    const totalCycle = schedule.reduce((s, i) => s + Math.max(1, i.duration), 0);
    const coords = resolveLiveTimelineCoordinates(schedule, opts.epochStartTimeMs);
    if (!coords) return [];
    const epochSecs = opts.epochStartTimeMs / 1000;
    const entries: EpgEntry[] = [];
    let acc = 0;
    for (let k = 0; k < coords.scheduleIndex; k++) {
      acc += Math.max(1, schedule[k].duration);
    }
    const liveStartMs = (epochSecs + Math.floor((nowMs / 1000 - epochSecs) / totalCycle) * totalCycle + acc) * 1000;
    for (let i = 0; i < count; i++) {
      const idx = (coords.scheduleIndex + i) % schedule.length;
      const prev = entries[entries.length - 1];
      const startMs = prev ? prev.startMs + Math.max(1, prev.item.duration) * 1000 : liveStartMs;
      entries.push({ item: schedule[idx], startMs, index: idx, isLive: i === 0 });
    }
    return entries;
  }

  const startMs = nowMs;
  const entries: EpgEntry[] = [];
  for (let i = 0; i < count; i++) {
    const idx = (opts.queueIndex + i) % schedule.length;
    const prev = entries[entries.length - 1];
    const itemStart = prev
      ? prev.startMs + Math.max(1, prev.item.duration) * 1000
      : startMs;
    entries.push({ item: schedule[idx], startMs: itemStart, index: idx, isLive: i === 0 });
  }
  return entries;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
