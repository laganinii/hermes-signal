import { NextRequest, NextResponse } from 'next/server';
import { fetchSingleSource } from '@/lib/ingest/rss-fetcher';
import { normalizeCustomFeedUrl } from '@/data/default-sources';
import { NewsSource } from '@/types/news';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const feedUrl = normalizeCustomFeedUrl(body?.feedUrl || '', body?.type);
    if (!feedUrl) {
      return NextResponse.json({ ok: false, count: 0, error: 'Missing feed URL' }, { status: 400 });
    }
    const tempSource: NewsSource = {
      id: 'preview-source',
      name: body?.name || 'Custom Source',
      url: feedUrl,
      feedUrl,
      type: body?.type || 'rss',
      bias: body?.bias || 'center',
      factuality: body?.factuality || 'mixed',
      ownership: body?.ownership || 'independent',
      ownerName: body?.ownerName || 'Custom',
      country: body?.country || 'IE',
      enabled: true,
      userAdded: true,
    };
    const articles = await fetchSingleSource(tempSource, {
      timeoutMs: 6000,
      maxItems: 5,
      bypassCache: true,
    });
    return NextResponse.json({
      ok: articles.length > 0,
      count: articles.length,
      normalizedFeedUrl: feedUrl,
      sampleHeadlines: articles.slice(0, 3).map((a) => a.title),
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      count: 0,
      error: err?.message || 'Could not reach feed',
    });
  }
}
