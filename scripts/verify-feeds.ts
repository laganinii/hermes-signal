/**
 * Fetch every default source in parallel, cluster stories, and print a summary.
 * Usage: npx tsx scripts/verify-feeds.ts
 */
import { defaultSources } from '../src/data/default-sources';
import { fetchAllSources } from '../src/lib/ingest/rss-fetcher';
import { clusterArticles } from '../src/lib/clustering/story-clusterer';
import { detectBlindspots } from '../src/lib/blindspot/blindspot-detector';
import type { BlindspotAlert, StoryCluster } from '../src/types/news';

const COLUMNS = [
  { title: 'Source', width: 22, align: 'left' as const },
  { title: 'Bias', width: 12, align: 'left' as const },
  { title: 'Ownership', width: 20, align: 'left' as const },
  { title: 'Status', width: 6, align: 'left' as const },
  { title: 'Items', width: 5, align: 'right' as const },
];

function cell(value: string | number, width: number, align: 'left' | 'right'): string {
  const text = String(value);
  const clipped = text.length > width ? `${text.slice(0, Math.max(0, width - 1))}…` : text;
  return align === 'right' ? clipped.padStart(width) : clipped.padEnd(width);
}

function row(values: Array<string | number>): string {
  return values
    .map((value, index) => cell(value, COLUMNS[index].width, COLUMNS[index].align))
    .join('  ');
}

function rule(): string {
  return COLUMNS.map((column) => '-'.repeat(column.width)).join('  ');
}

function clip(value: string, width: number): string {
  return value.length > width ? `${value.slice(0, width - 1)}…` : value;
}

function spectrumLabel(cluster: StoryCluster): string {
  const buckets = cluster.biasSpectrum.bucketPercentages;
  return `${buckets.left}/${buckets.center}/${buckets.right}`;
}

function blindspotLabel(alert: BlindspotAlert | undefined): string {
  if (!alert || !alert.isBlindspot) return 'none';
  return alert.missingSide || alert.dominantSide;
}

async function main(): Promise<number> {
  const started = Date.now();
  const byId = new Map(defaultSources.map((source) => [source.id, source]));

  console.log('Ground News — feed verify');
  console.log(
    `Fetching ${defaultSources.length} sources in parallel via fetchAllSources`
  );
  console.log('');

  const { articles, sourceStats } = await fetchAllSources(defaultSources, {
    timeoutMs: 6500,
    maxItemsPerSource: 15,
    bypassCache: true,
  });
  const clusters = clusterArticles(articles, defaultSources);
  const blindspots = detectBlindspots(clusters);

  console.log(row(COLUMNS.map((column) => column.title)));
  console.log(rule());
  for (const stat of sourceStats) {
    const source = byId.get(stat.id);
    console.log(
      row([
        stat.name,
        source?.bias || '-',
        source?.ownership || '-',
        stat.status,
        stat.count,
      ])
    );
  }
  console.log(rule());

  const okCount = sourceStats.filter((stat) => stat.status === 'ok').length;
  const emptyCount = sourceStats.length - okCount;
  const multiSource = clusters.filter((cluster) => cluster.biasSpectrum.totalSources >= 2);
  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);

  console.log('');
  console.log(
    [
      `ok ${okCount}`,
      `empty ${emptyCount}`,
      `articles ${articles.length}`,
      `clusters ${clusters.length}`,
      `multi-source ${multiSource.length}`,
      `blindspots ${blindspots.length}`,
      `${elapsedSec}s`,
    ].join('   ')
  );

  const emptyNames = sourceStats
    .filter((stat) => stat.status === 'empty')
    .map((stat) => stat.id);
  if (emptyNames.length > 0) {
    console.log(`Empty feeds: ${emptyNames.join(', ')}`);
  }

  console.log('');
  console.log(`Multi-source stories (${multiSource.length})`);
  if (multiSource.length === 0) {
    console.log('None. Outlets did not share a story in this fetch.');
  } else {
    const shown = multiSource.slice(0, 8);
    console.log(
      `${cell('Sources', 7, 'right')}  ${cell('L/C/R', 12, 'left')}  ${cell('Blindspot', 10, 'left')}  Headline`
    );
    for (const cluster of shown) {
      console.log(
        `${cell(cluster.biasSpectrum.totalSources, 7, 'right')}  ${cell(spectrumLabel(cluster), 12, 'left')}  ${cell(blindspotLabel(cluster.blindspot), 10, 'left')}  ${clip(cluster.headline, 72)}`
      );
    }
    if (multiSource.length > shown.length) {
      console.log(`... and ${multiSource.length - shown.length} more`);
    }
  }

  console.log('');
  console.log(`Blindspots (${blindspots.length})`);
  if (blindspots.length === 0) {
    console.log('None.');
  } else {
    const byCluster = new Map(clusters.map((cluster) => [cluster.id, cluster]));
    for (const alert of blindspots.slice(0, 8)) {
      const headline = byCluster.get(alert.clusterId)?.headline || alert.clusterId;
      console.log(
        `${cell(alert.severity, 8, 'left')}  ${cell(alert.missingSide || '-', 6, 'left')}  ${cell(`${alert.sharePercent}%`, 5, 'right')}  ${clip(headline, 72)}`
      );
    }
    if (blindspots.length > 8) {
      console.log(`... and ${blindspots.length - 8} more`);
    }
  }

  console.log('');
  if (articles.length === 0) {
    console.log('No articles fetched. Check network or feed URLs.');
    return 1;
  }

  console.log(`Done. ${okCount}/${sourceStats.length} feeds returned articles.`);
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Feed verify failed: ${message}`);
    process.exitCode = 1;
  });
