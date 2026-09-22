/**
 * Server-side multi-source ingestion and normalization engine.
 *
 * Acts as an isolated ingestion proxy: authenticates with platform APIs where
 * required, extracts metadata, converts disparate duration formats into
 * uniform integer seconds, and returns a sanitized schema to the client.
 *
 * Strategies per platform:
 *  - YouTube:     Data API v3 when an API key is supplied; otherwise HTML
 *                 scraping of the playlist page (ytInitialData) with no key.
 *  - Vimeo:       legacy public JSON API v2 for channels/albums/groups/users;
 *                 oEmbed fallback for single videos.
 *  - Dailymotion: public REST Graph API (no auth required).
 */

import type {
  NormalizedMediaItem,
  PlaylistDefinition,
  VideoSource,
} from './types';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 15_000;
const MAX_ITEMS = 150;

// ---------------------------------------------------------------------------
// TTL cache — aggressive caching prevents quota exhaustion (YouTube 10k units)
// ---------------------------------------------------------------------------

const cacheTtlMs = 24 * 60 * 60 * 1000;
const ingestionCache = new Map<string, { at: number; data: PlaylistDefinition }>();

function cacheGet(key: string): PlaylistDefinition | null {
  const hit = ingestionCache.get(key);
  if (hit && Date.now() - hit.at < cacheTtlMs) return hit.data;
  if (hit) ingestionCache.delete(key);
  return null;
}

function cacheSet(key: string, data: PlaylistDefinition): void {
  ingestionCache.set(key, { at: Date.now(), data });
}

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`Upstream responded HTTP ${res.status} for ${new URL(url).host}`);
    }
    return await res.text();
  } catch (err) {
    if (typeof window !== 'undefined' && url.includes('youtube.com')) {
      const proxies = [
        `https://corsproxy.io/?${encodeURIComponent(url)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      ];
      for (const proxyUrl of proxies) {
        try {
          const proxyRes = await fetch(proxyUrl, { signal: controller.signal });
          if (proxyRes.ok) {
            const text = await proxyRes.text();
            if (text && text.includes('ytInitialData')) return text;
          }
        } catch {
          /* try next proxy */
        }
      }
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const text = await fetchText(url, init);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error('Upstream returned malformed JSON.');
  }
}

function scopedId(source: VideoSource, sourceId: string): string {
  return `${source}:${sourceId}`;
}

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

export interface ParsedTarget {
  source: VideoSource;
  kind: 'playlist' | 'video';
  id: string;
  canonicalUrl: string;
}

export function parseTargetUrl(rawUrl: string): ParsedTarget | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const host = url.hostname.replace(/^www\./, '');
  const path = url.pathname;

  // ---- YouTube ----
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtu.be') {
    if (host === 'youtu.be') {
      const id = path.slice(1).split('/')[0];
      if (id) return { source: 'youtube', kind: 'video', id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` };
    }

    let listParam = url.searchParams.get('list');
    if (!listParam) {
      const showOrCourseMatch = path.match(/^\/(?:show|course|playlist)\/([\w-]+)/i);
      if (showOrCourseMatch) {
        listParam = showOrCourseMatch[1];
      }
    }

    if (listParam) {
      const cleanListId = listParam.startsWith('VL') && /^VL(PL|EC|OL|FL|LL|UU|RD)/i.test(listParam)
        ? listParam.slice(2)
        : listParam;

      return {
        source: 'youtube',
        kind: 'playlist',
        id: cleanListId,
        canonicalUrl: `https://www.youtube.com/playlist?list=${cleanListId}`,
      };
    }

    const shorts = path.match(/^\/shorts\/([\w-]{6,})/);
    if (shorts) return { source: 'youtube', kind: 'video', id: shorts[1], canonicalUrl: `https://www.youtube.com/watch?v=${shorts[1]}` };
    const embed = path.match(/^\/embed\/([\w-]{6,})/);
    if (embed) return { source: 'youtube', kind: 'video', id: embed[1], canonicalUrl: `https://www.youtube.com/watch?v=${embed[1]}` };
    const videoParam = url.searchParams.get('v');
    if (videoParam) return { source: 'youtube', kind: 'video', id: videoParam, canonicalUrl: `https://www.youtube.com/watch?v=${videoParam}` };
    return null;
  }

  // ---- Vimeo ----
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const album = path.match(/^\/(?:album|showcase)\/(\d+)/);
    if (album) return { source: 'vimeo', kind: 'playlist', id: album[1], canonicalUrl: `https://vimeo.com/album/${album[1]}` };
    const channel = path.match(/^\/channels\/([\w-]+)/);
    if (channel) return { source: 'vimeo', kind: 'playlist', id: channel[1], canonicalUrl: `https://vimeo.com/channels/${channel[1]}` };
    const group = path.match(/^\/groups\/([\w-]+)/);
    if (group) return { source: 'vimeo', kind: 'playlist', id: group[1], canonicalUrl: `https://vimeo.com/groups/${group[1]}` };
    const numeric = path.match(/^\/(?:video\/)?(\d{6,})/);
    if (numeric) return { source: 'vimeo', kind: 'video', id: numeric[1], canonicalUrl: `https://vimeo.com/${numeric[1]}` };
    const userOrName = path.match(/^\/([\w-]+)/);
    if (userOrName && path.endsWith('/videos')) {
      return { source: 'vimeo', kind: 'playlist', id: userOrName[1], canonicalUrl: `https://vimeo.com/${userOrName[1]}/videos` };
    }
    if (userOrName) {
      return { source: 'vimeo', kind: 'playlist', id: userOrName[1], canonicalUrl: `https://vimeo.com/${userOrName[1]}/videos` };
    }
    return null;
  }

  // ---- Dailymotion ----
  if (host === 'dailymotion.com' || host === 'www.dailymotion.com' || host === 'dai.ly') {
    if (host === 'dai.ly') {
      const id = path.slice(1).split('/')[0];
      if (id) return { source: 'dailymotion', kind: 'video', id, canonicalUrl: `https://www.dailymotion.com/video/${id}` };
    }
    const playlist = path.match(/^\/playlist\/([\w]+)/);
    if (playlist) return { source: 'dailymotion', kind: 'playlist', id: playlist[1], canonicalUrl: `https://www.dailymotion.com/playlist/${playlist[1]}` };
    const video = path.match(/^\/video\/([\w]+)/);
    if (video) return { source: 'dailymotion', kind: 'video', id: video[1], canonicalUrl: `https://www.dailymotion.com/video/${video[1]}` };
    const userVideos = path.match(/^\/([\w-]+)(?:\/videos)?\/?$/);
    if (userVideos && userVideos[1] !== 'video') {
      return { source: 'dailymotion', kind: 'playlist', id: userVideos[1], canonicalUrl: `https://www.dailymotion.com/${userVideos[1]}/videos` };
    }
    return null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Duration normalization — ISO 8601 (YouTube) → integer seconds
// ---------------------------------------------------------------------------

export function parseIso8601Duration(iso: string): number {
  const m = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return 0;
  const [, d, h, min, s] = m;
  return (
    (d ? parseInt(d, 10) * 86400 : 0) +
    (h ? parseInt(h, 10) * 3600 : 0) +
    (min ? parseInt(min, 10) * 60 : 0) +
    (s ? parseInt(s, 10) : 0)
  );
}

/** "3:45" / "1:02:03" → seconds */
function parseClockDuration(text: string): number {
  const parts = text.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return 0;
  let secs = 0;
  for (const p of parts) secs = secs * 60 + p;
  return secs;
}

// ---------------------------------------------------------------------------
// YouTube ingestion
// ---------------------------------------------------------------------------

interface YtThumb { url: string; width: number; height: number }
interface YtVideoRenderer {
  videoId?: string;
  title?: { simpleText?: string; runs?: { text: string }[] };
  lengthText?: { simpleText?: string };
  thumbnail?: { thumbnails?: YtThumb[] };
  unplayableText?: { simpleText?: string };
  liveStreamBadges?: unknown[];
}

/**
 * New YouTube playlist page format (2025 migration): videos are emitted as
 * lockupViewModel objects instead of playlistVideoRenderer.
 */
interface YtLockup {
  contentId?: string;
  contentType?: string;
  contentImage?: {
    thumbnailViewModel?: {
      image?: { sources?: YtThumb[] };
      overlays?: {
        thumbnailBottomOverlayViewModel?: {
          badges?: {
            thumbnailBadgeViewModel?: {
              text?: string;
              animationActivationTargetId?: string;
            };
          }[];
        };
      }[];
    };
  };
  metadata?: {
    lockupMetadataViewModel?: {
      title?: { content?: string };
    };
  };
}

function mapYtLockup(l: YtLockup): NormalizedMediaItem | null {
  const videoId = l.contentId;
  if (!videoId || l.contentType !== 'LOCKUP_CONTENT_TYPE_VIDEO') return null;
  const vm = l.contentImage?.thumbnailViewModel;
  let duration = 0;
  for (const overlay of vm?.overlays ?? []) {
    for (const badge of overlay.thumbnailBottomOverlayViewModel?.badges ?? []) {
      const text = badge.thumbnailBadgeViewModel?.text ?? '';
      if (/^\d+(:\d+)+$/.test(text)) {
        duration = parseClockDuration(text);
      }
    }
  }
  if (duration <= 0) return null; // live, upcoming or malformed entries
  const thumbs = vm?.image?.sources ?? [];
  const best = thumbs.length ? thumbs[thumbs.length - 1] : null;
  return {
    id: scopedId('youtube', videoId),
    sourceId: videoId,
    source: 'youtube',
    title: l.metadata?.lockupMetadataViewModel?.title?.content ?? 'Untitled',
    duration,
    thumbnailUrl: best?.url ?? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
    playbackUrl: `https://www.youtube.com/watch?v=${videoId}`,
    isEmbeddable: true,
  };
}

/** Extracts a balanced JSON object starting at the first `{` from `from`. */
function extractBalancedJson(html: string, marker: string): unknown {
  const idx = html.indexOf(marker);
  if (idx === -1) return null;
  const start = html.indexOf('{', idx + marker.length);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

 
function collectRenderers(node: any, key: string, out: any[]): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) collectRenderers(child, key, out);
    return;
  }
  for (const k of Object.keys(node)) {
    if (k === key) out.push(node[k]);
    collectRenderers(node[k], key, out);
  }
}

function mapYtRenderer(r: YtVideoRenderer): NormalizedMediaItem | null {
  if (!r.videoId) return null;
  if (r.unplayableText || !r.lengthText?.simpleText) return null; // private / live / pending
  const duration = parseClockDuration(r.lengthText.simpleText);
  if (duration <= 0) return null;
  const thumbs = r.thumbnail?.thumbnails ?? [];
  const best = thumbs.length ? thumbs[thumbs.length - 1] : null;
  return {
    id: scopedId('youtube', r.videoId),
    sourceId: r.videoId,
    source: 'youtube',
    title: r.title?.simpleText ?? r.title?.runs?.[0]?.text ?? 'Untitled',
    duration,
    thumbnailUrl: best?.url ?? `https://i.ytimg.com/vi/${r.videoId}/mqdefault.jpg`,
    playbackUrl: `https://www.youtube.com/watch?v=${r.videoId}`,
    isEmbeddable: true,
  };
}

async function fetchYouTubeHtml(playlistId: string): Promise<string> {
  const targetUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(playlistId)}&hl=en`;

  // 1) Direct fetch (works server-side or if CORS permits)
  try {
    const text = await fetchText(targetUrl, { headers: { Accept: 'text/html' } });
    if (text.includes('ytInitialData')) return text;
  } catch {
    /* proceed */
  }

  // 2) JSON-wrapped proxy (allorigins.win) — returns CORS-friendly JSON wrapping the HTML!
  try {
    const jsonUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(jsonUrl);
    if (res.ok) {
      const data = (await res.json()) as { contents?: string };
      if (data.contents && data.contents.includes('ytInitialData')) {
        return data.contents;
      }
    }
  } catch {
    /* proceed */
  }

  // 3) Additional CORS proxies
  const proxies = [
    `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
  ];

  for (const proxyUrl of proxies) {
    try {
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const text = await res.text();
        if (text && text.includes('ytInitialData')) {
          return text;
        }
      }
    } catch {
      /* try next */
    }
  }

  throw new Error('Could not fetch YouTube playlist HTML.');
}

async function ingestYouTubePublicApi(
  playlistId: string
): Promise<{ title: string; items: NormalizedMediaItem[] }> {
  // Invidious API instances
  const invidiousInstances = [
    'https://inv.tux.pizza',
    'https://invidious.nerqv.ps',
    'https://vid.puffyan.us',
  ];

  for (const instance of invidiousInstances) {
    try {
      const data = await fetchJson<{
        title?: string;
        videos?: Array<{
          title?: string;
          videoId?: string;
          lengthSeconds?: number;
          videoThumbnails?: Array<{ url: string }>;
        }>;
      }>(`${instance}/api/v1/playlists/${encodeURIComponent(playlistId)}`);

      if (data && Array.isArray(data.videos) && data.videos.length > 0) {
        const items: NormalizedMediaItem[] = [];
        for (const v of data.videos) {
          const videoId = v.videoId;
          const duration = typeof v.lengthSeconds === 'number' ? v.lengthSeconds : 0;
          if (videoId && duration > 0) {
            const thumb = v.videoThumbnails?.[0]?.url ?? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
            items.push({
              id: scopedId('youtube', videoId),
              sourceId: videoId,
              source: 'youtube',
              title: v.title ?? 'Untitled',
              duration,
              thumbnailUrl: thumb,
              playbackUrl: `https://www.youtube.com/watch?v=${videoId}`,
              isEmbeddable: true,
            });
          }
        }
        if (items.length > 0) {
          return {
            title: data.title ?? `YouTube playlist ${playlistId}`,
            items: items.slice(0, MAX_ITEMS),
          };
        }
      }
    } catch {
      /* try next instance */
    }
  }

  throw new Error('Public APIs returned no items for this playlist.');
}

async function ingestYouTubeScrape(
  playlistId: string
): Promise<{ title: string; items: NormalizedMediaItem[] }> {
  // Primary Strategy: HTML extraction via JSON-wrapped CORS proxy (allorigins) & CORS proxies
  try {
    const html = await fetchYouTubeHtml(playlistId);
    const data = extractBalancedJson(html, 'var ytInitialData');
    if (data) {
      const renderers: any[] = [];
      collectRenderers(data, 'playlistVideoRenderer', renderers);
      const lockups: any[] = [];
      collectRenderers(data, 'lockupViewModel', lockups);
      const items: NormalizedMediaItem[] = [];
      const seen = new Set<string>();
      const push = (item: NormalizedMediaItem | null) => {
        if (item && !seen.has(item.id)) {
          seen.add(item.id);
          items.push(item);
        }
      };
      for (const r of renderers as YtVideoRenderer[]) push(mapYtRenderer(r));
      for (const l of lockups as YtLockup[]) push(mapYtLockup(l));
      if (items.length > 0) {
        const capped = items.slice(0, MAX_ITEMS);
        const titleMatch = html.match(/<title>(.*?)<\/title>/);
        const rawTitle = titleMatch
          ? titleMatch[1].replace(/ - YouTube$/, '').replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
          : `YouTube playlist ${playlistId}`;
        return { title: rawTitle || `YouTube playlist ${playlistId}`, items: capped };
      }
    }
  } catch {
    /* proceed to public API fallback */
  }

  // Secondary Strategy: Invidious Public REST API
  try {
    return await ingestYouTubePublicApi(playlistId);
  } catch {
    /* proceed to error */
  }

  throw new Error(
    'Playlist fetch unfulfilled. For guaranteed 100% resolution of YouTube playlists without CORS issues, enter a YouTube API key in Control Room → Playback.'
  );
}

async function ingestYouTubeApi(
  playlistId: string,
  apiKey: string
): Promise<{ title: string; items: NormalizedMediaItem[] }> {
  // 1) playlistItems → ids  (single-digit quota units)
  const ids: string[] = [];
  let pageToken = '';
  let title = `YouTube playlist ${playlistId}`;
  for (let page = 0; page < 4 && ids.length < MAX_ITEMS; page++) {
    const url =
      `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50` +
      `&playlistId=${encodeURIComponent(playlistId)}&key=${encodeURIComponent(apiKey)}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
     
    const data = await fetchJson<any>(url);
    if (data.error) throw new Error(`YouTube API: ${data.error.message ?? 'request rejected'}`);
    const playlistTitle = data.playlistTitle ?? data.snippet?.playlistTitle;
    if (playlistTitle) title = playlistTitle;
     
    for (const it of data.items ?? []) {
      const vid = it.contentDetails?.videoId ?? it.snippet?.resourceId?.videoId;
      if (vid) ids.push(vid);
    }
    pageToken = data.nextPageToken ?? '';
    if (!pageToken) break;
  }
  if (ids.length === 0) throw new Error('YouTube API returned no items for this playlist.');

  // 2) videos.list → durations + embeddability (batched 50)
  const items: NormalizedMediaItem[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const url =
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status` +
      `&id=${chunk.join(',')}&key=${encodeURIComponent(apiKey)}`;
     
    const data = await fetchJson<any>(url);
    if (data.error) throw new Error(`YouTube API: ${data.error.message ?? 'request rejected'}`);
     
    for (const v of data.items ?? []) {
      const duration = parseIso8601Duration(v.contentDetails?.duration ?? '');
      if (duration <= 0) continue;
      items.push({
        id: scopedId('youtube', v.id),
        sourceId: v.id,
        source: 'youtube',
        title: v.snippet?.title ?? 'Untitled',
        duration,
        thumbnailUrl:
          v.snippet?.thumbnails?.medium?.url ??
          `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`,
        playbackUrl: `https://www.youtube.com/watch?v=${v.id}`,
        isEmbeddable: v.status?.embeddable !== false,
      });
    }
  }
  if (items.length === 0) throw new Error('All items in this playlist are unavailable for scheduling.');
  return { title, items };
}

async function ingestYouTubeVideo(
  videoId: string
): Promise<{ title: string; items: NormalizedMediaItem[] }> {
  const html = await fetchText(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: { Accept: 'text/html' },
  });
  const player = extractBalancedJson(html, 'ytInitialPlayerResponse');
   
  const details = (player as any)?.videoDetails;
  if (!details || details.isLiveContent) {
    throw new Error('This YouTube video is unavailable or is a live stream.');
  }
  const duration = parseInt(details.lengthSeconds ?? '0', 10);
  if (duration <= 0) throw new Error('Could not determine the duration of this video.');
  return {
    title: 'Single video',
    items: [
      {
        id: scopedId('youtube', details.videoId),
        sourceId: details.videoId,
        source: 'youtube',
        title: details.title ?? 'Untitled',
        duration,
        thumbnailUrl: `https://i.ytimg.com/vi/${details.videoId}/mqdefault.jpg`,
        playbackUrl: `https://www.youtube.com/watch?v=${details.videoId}`,
        isEmbeddable: true,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Vimeo ingestion
// ---------------------------------------------------------------------------

 
function mapVimeoV2(v: any): NormalizedMediaItem | null {
  const id = String(v.id ?? '');
  if (!id) return null;
  const duration = Number(v.duration ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return {
    id: scopedId('vimeo', id),
    sourceId: id,
    source: 'vimeo',
    title: v.title ?? 'Untitled',
    duration: Math.round(duration),
    thumbnailUrl: v.thumbnail_large ?? v.thumbnail_medium ?? v.thumbnail_small ?? '',
    playbackUrl: `https://vimeo.com/${id}`,
    isEmbeddable: v.privacy?.embed !== false && v.embed_privacy !== false,
  };
}

async function ingestVimeo(
  target: ParsedTarget
): Promise<{ title: string; items: NormalizedMediaItem[] }> {
  if (target.kind === 'video') {
    // oEmbed is public and includes duration
    const data = await fetchJson<{
      title?: string;
      duration?: number;
      video_id?: number;
      thumbnail_url?: string;
    }>(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(target.canonicalUrl)}&width=640`);
    const duration = Math.round(data.duration ?? 0);
    const id = String(data.video_id ?? target.id);
    if (!id || duration <= 0) throw new Error('Vimeo oEmbed could not resolve this video.');
    return {
      title: 'Single video',
      items: [
        {
          id: scopedId('vimeo', id),
          sourceId: id,
          source: 'vimeo',
          title: data.title ?? 'Untitled',
          duration,
          thumbnailUrl: data.thumbnail_url ?? '',
          playbackUrl: `https://vimeo.com/${id}`,
          isEmbeddable: true,
        },
      ],
    };
  }

  // Collections via legacy public JSON API v2
  // Legacy v2 API uses singular path segments (channel/, album/, group/)
  const m = target.canonicalUrl.match(/^https:\/\/vimeo\.com\/(channels|album|showcase|groups)\/([\w-]+)$/);
  let api: string;
  let label: string;
  if (m) {
    const kind = m[1] === 'showcase' ? 'album' : m[1].replace(/s$/, '');
    const id = m[2];
    api = `https://vimeo.com/api/v2/${kind}/${encodeURIComponent(id)}/videos.json?per_page=100`;
    label = `${kind} · ${id}`;
  } else {
    // user uploads: vimeo.com/{username}/videos
    const user = target.canonicalUrl.replace(/^https:\/\/vimeo\.com\//, '').replace(/\/videos$/, '');
    api = `https://vimeo.com/api/v2/${encodeURIComponent(user)}/videos.json?per_page=100`;
    label = `user · ${user}`;
  }
  const raw = await fetchJson<unknown>(api);
   
  const arr = Array.isArray(raw) ? (raw as any[]) : ((raw as any)?.videos ?? []);
  const items = arr.map(mapVimeoV2).filter((i): i is NormalizedMediaItem => i !== null).slice(0, MAX_ITEMS);
  if (items.length === 0) {
    throw new Error(
      'No playable videos returned for this Vimeo collection. The legacy public API may not cover it — try a channel URL (vimeo.com/channels/…) or a single video link.'
    );
  }
  return { title: `Vimeo · ${label}`, items };
}

// ---------------------------------------------------------------------------
// Dailymotion ingestion
// ---------------------------------------------------------------------------

const DM_FIELDS = 'id,title,duration,thumbnail_720_url';

 
function mapDailymotion(v: any): NormalizedMediaItem | null {
  const id = String(v.id ?? '');
  if (!id) return null;
  const duration = Number(v.duration ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return {
    id: scopedId('dailymotion', id),
    sourceId: id,
    source: 'dailymotion',
    title: v.title ?? 'Untitled',
    duration: Math.round(duration),
    thumbnailUrl: v.thumbnail_720_url ?? '',
    playbackUrl: `https://www.dailymotion.com/video/${id}`,
    isEmbeddable: true,
  };
}

async function ingestDailymotion(
  target: ParsedTarget
): Promise<{ title: string; items: NormalizedMediaItem[] }> {
  if (target.kind === 'video') {
    const data = await fetchJson<Record<string, unknown>>(
      `https://api.dailymotion.com/video/${encodeURIComponent(target.id)}?fields=${DM_FIELDS}`
    );
    if (data.error) throw new Error(`Dailymotion: ${String((data.error as { message?: string }).message ?? 'rejected')}`);
    const item = mapDailymotion(data);
    if (!item) throw new Error('This Dailymotion video is unavailable.');
    return { title: 'Single video', items: [item] };
  }

  // Playlist vs user uploads
  const isPlaylist = /\/playlist\//.test(target.canonicalUrl);
  const base = isPlaylist
    ? `https://api.dailymotion.com/playlist/${encodeURIComponent(target.id)}/videos`
    : `https://api.dailymotion.com/user/${encodeURIComponent(target.id)}/videos`;
  const metaUrl = isPlaylist
    ? `https://api.dailymotion.com/playlist/${encodeURIComponent(target.id)}?fields=name`
    : `https://api.dailymotion.com/user/${encodeURIComponent(target.id)}?fields=screenname`;

  let title = isPlaylist ? `Dailymotion playlist ${target.id}` : `Dailymotion · ${target.id}`;
  try {
    const meta = await fetchJson<{ name?: string; screenname?: string; error?: { message?: string } }>(metaUrl);
    title = meta.name ?? meta.screenname ?? title;
  } catch {
    /* title is cosmetic */
  }

  const items: NormalizedMediaItem[] = [];
  let page = 1;
  while (items.length < MAX_ITEMS && page <= 3) {
    const data = await fetchJson<{
      list?: unknown[];
      has_more?: boolean;
      error?: { message?: string };
    }>(`${base}?fields=${DM_FIELDS}&limit=100&page=${page}`);
    if (data.error) throw new Error(`Dailymotion: ${String(data.error.message ?? 'rejected')}`);
     
    for (const v of data.list ?? []) {
      const item = mapDailymotion(v);
      if (item) items.push(item);
    }
    if (!data.has_more) break;
    page++;
  }
  if (items.length === 0) {
    throw new Error('No playable videos returned for this Dailymotion collection.');
  }
  return { title, items: items.slice(0, MAX_ITEMS) };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function ingestPlaylist(
  rawUrl: string,
  youTubeApiKey?: string
): Promise<PlaylistDefinition> {
  const target = parseTargetUrl(rawUrl);
  if (!target) {
    throw new Error(
      'Unrecognized URL. Supported: YouTube playlists/videos, Vimeo channels/showcases/albums/videos, Dailymotion playlists/users/videos.'
    );
  }

  const cacheKey = `${target.source}:${target.kind}:${target.id}:${youTubeApiKey ? 'key' : 'scrape'}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  let result: { title: string; items: NormalizedMediaItem[] };
  if (target.source === 'youtube') {
    if (target.kind === 'video') {
      result = await ingestYouTubeVideo(target.id);
    } else if (youTubeApiKey && youTubeApiKey.trim()) {
      // Official API path — quota-safe via caching; falls back to scrape on failure
      try {
        result = await ingestYouTubeApi(target.id, youTubeApiKey.trim());
      } catch {
        result = await ingestYouTubeScrape(target.id);
      }
    } else {
      result = await ingestYouTubeScrape(target.id);
    }
  } else if (target.source === 'vimeo') {
    result = await ingestVimeo(target);
  } else {
    result = await ingestDailymotion(target);
  }

  const playlist: PlaylistDefinition = {
    id: `${target.source}-${target.kind}-${target.id}-${Date.now().toString(36)}`,
    title: result.title,
    source: target.source,
    sourceUrl: target.canonicalUrl,
    items: result.items,
    shuffle: false,
    weight: 1,
  };

  cacheSet(cacheKey, playlist);
  return playlist;
}
