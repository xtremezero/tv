import { NextResponse } from 'next/server';
import { ingestPlaylist } from '@/lib/tv/ingest';

export const dynamic = 'force-static';

export async function POST(request: Request) {
  let body: { url?: unknown; youTubeApiKey?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }

  const url = typeof body.url === 'string' ? body.url : '';
  const youTubeApiKey = typeof body.youTubeApiKey === 'string' ? body.youTubeApiKey : undefined;

  if (!url) {
    return NextResponse.json({ error: 'A playlist URL is required.' }, { status: 400 });
  }

  try {
    const playlist = await ingestPlaylist(url, youTubeApiKey);
    return NextResponse.json({ playlist });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ingestion failed unexpectedly.';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
