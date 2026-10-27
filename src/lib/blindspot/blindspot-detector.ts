import {
  BiasRating,
  BiasSpectrum,
  BlindspotAlert,
  NewsSource,
  RawArticle,
  StoryCluster,
} from '../../types/news';

export function calculateBiasSpectrum(
  articles: RawArticle[],
  sourceMap?: Map<string, NewsSource>
): BiasSpectrum {
  const counts: Record<BiasRating, number> = {
    left: 0,
    'lean-left': 0,
    center: 0,
    'lean-right': 0,
    right: 0,
  };

  const uniqueSources = new Set<string>();

  for (const article of articles) {
    uniqueSources.add(article.sourceId);
    const bias: BiasRating =
      article.sourceBias || sourceMap?.get(article.sourceId)?.bias || 'center';
    counts[bias] = (counts[bias] || 0) + 1;
  }

  const total = Math.max(articles.length, 1);

  const percentages: Record<BiasRating, number> = {
    left: Math.round((counts.left / total) * 100),
    'lean-left': Math.round((counts['lean-left'] / total) * 100),
    center: Math.round((counts.center / total) * 100),
    'lean-right': Math.round((counts['lean-right'] / total) * 100),
    right: Math.round((counts.right / total) * 100),
  };

  const leftBucket = counts.left + counts['lean-left'];
  const centerBucket = counts.center;
  const rightBucket = counts['lean-right'] + counts.right;

  let leftPct = Math.round((leftBucket / total) * 100);
  let centerPct = Math.round((centerBucket / total) * 100);
  let rightPct = Math.max(0, 100 - leftPct - centerPct);

  if (rightBucket === 0) {
    rightPct = 0;
    if (leftBucket + centerBucket > 0) {
      leftPct = Math.round((leftBucket / (leftBucket + centerBucket)) * 100);
      centerPct = 100 - leftPct;
    }
  }

  return {
    counts,
    percentages,
    bucketCounts: {
      left: leftBucket,
      center: centerBucket,
      right: rightBucket,
    },
    bucketPercentages: {
      left: leftPct,
      center: centerPct,
      right: rightPct,
    },
    totalArticles: articles.length,
    totalSources: uniqueSources.size,
  };
}

export function detectClusterBlindspot(
  clusterId: string,
  spectrum: BiasSpectrum
): BlindspotAlert {
  const { bucketCounts, bucketPercentages, totalArticles, totalSources } = spectrum;

  if (totalArticles < 2 || totalSources < 2) {
    const dominant =
      bucketPercentages.left >= bucketPercentages.right
        ? bucketPercentages.left >= bucketPercentages.center
          ? 'left'
          : 'center'
        : bucketPercentages.right >= bucketPercentages.center
        ? 'right'
        : 'center';
    return {
      clusterId,
      isBlindspot: false,
      dominantSide: dominant,
      sharePercent: bucketPercentages[dominant],
      severity: 'none',
      message: 'Single-source story (needs 2+ outlets to evaluate coverage blindspots).',
    };
  }

  // Case 1: Left-dominated blindspot (Right has 0 coverage OR Left >= 67%)
  if (bucketPercentages.left >= 67 || (bucketCounts.right === 0 && bucketCounts.left >= 2)) {
    const severity =
      bucketPercentages.left >= 75 || (bucketCounts.right === 0 && totalSources >= 3)
        ? 'high'
        : 'moderate';
    return {
      clusterId,
      isBlindspot: true,
      dominantSide: 'left',
      missingSide: 'right',
      sharePercent: bucketPercentages.left,
      severity,
      message:
        bucketCounts.right === 0
          ? `Right Blindspot: 0% Right-leaning coverage (${bucketPercentages.left}% Left, ${bucketPercentages.center}% Center across ${totalSources} outlets).`
          : `Right Blindspot: ${bucketPercentages.left}% of coverage is from Left-leaning outlets vs ${bucketPercentages.right}% Right.`,
    };
  }

  // Case 2: Right-dominated blindspot (Left has 0 coverage OR Right >= 67%)
  if (bucketPercentages.right >= 67 || (bucketCounts.left === 0 && bucketCounts.right >= 2)) {
    const severity =
      bucketPercentages.right >= 75 || (bucketCounts.left === 0 && totalSources >= 3)
        ? 'high'
        : 'moderate';
    return {
      clusterId,
      isBlindspot: true,
      dominantSide: 'right',
      missingSide: 'left',
      sharePercent: bucketPercentages.right,
      severity,
      message:
        bucketCounts.left === 0
          ? `Left Blindspot: 0% Left-leaning coverage (${bucketPercentages.right}% Right, ${bucketPercentages.center}% Center across ${totalSources} outlets).`
          : `Left Blindspot: ${bucketPercentages.right}% of coverage is from Right-leaning outlets vs ${bucketPercentages.left}% Left.`,
    };
  }

  const dominant =
    bucketPercentages.left >= bucketPercentages.right &&
    bucketPercentages.left >= bucketPercentages.center
      ? 'left'
      : bucketPercentages.right >= bucketPercentages.center
      ? 'right'
      : 'center';

  return {
    clusterId,
    isBlindspot: false,
    dominantSide: dominant,
    sharePercent: bucketPercentages[dominant],
    severity: 'none',
    message: `Balanced coverage across spectrum (${bucketPercentages.left}% L / ${bucketPercentages.center}% C / ${bucketPercentages.right}% R).`,
  };
}

export function detectBlindspots(clusters: StoryCluster[]): BlindspotAlert[] {
  return clusters
    .map((c) => c.blindspot || detectClusterBlindspot(c.id, c.biasSpectrum))
    .filter((alert) => alert.isBlindspot);
}
