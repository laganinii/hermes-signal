import { NextRequest, NextResponse } from 'next/server';
import { defaultSources } from '@/data/default-sources';
import { fetchAllSources } from '@/lib/ingest/rss-fetcher';
import { clusterArticles } from '@/lib/clustering/story-clusterer';
import { detectBlindspots } from '@/lib/blindspot/blindspot-detector';
import { NewsSource } from '@/types/news';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startedAt = Date.now();
  const { articles, sourceStats } = await fetchAllSources(defaultSources, {
    maxItemsPerSource: 15,
    timeoutMs: 6500,
  });

  const clusters = clusterArticles(articles, defaultSources);
  const blindspots = detectBlindspots(clusters);

  return NextResponse.json({
    clusters,
    blindspots,
    sourceStats,
    totalArticles: articles.length,
    totalClusters: clusters.length,
    multiSourceClusters: clusters.filter((c) => c.biasSpectrum.totalSources >= 2).length,
    blindspotCount: blindspots.length,
    elapsedMs: Date.now() - startedAt,
    fetchedAt: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const body = await req.json();
    const sources: NewsSource[] =
      Array.isArray(body?.sources) && body.sources.length > 0
        ? body.sources
        : defaultSources;
    const bypassCache = Boolean(body?.refresh);

    const { articles, sourceStats } = await fetchAllSources(sources, {
      maxItemsPerSource: 15,
      timeoutMs: 6500,
      bypassCache,
    });

    const clusters = clusterArticles(articles, sources);
    const blindspots = detectBlindspots(clusters);

    return NextResponse.json({
      clusters,
      blindspots,
      sourceStats,
      totalArticles: articles.length,
      totalClusters: clusters.length,
      multiSourceClusters: clusters.filter((c) => c.biasSpectrum.totalSources >= 2).length,
      blindspotCount: blindspots.length,
      elapsedMs: Date.now() - startedAt,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to load feed' },
      { status: 500 }
    );
  }
}
