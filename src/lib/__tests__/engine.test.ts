import { describe, expect, it } from 'vitest';
import { defaultSources } from '../../data/default-sources';
import { decodeHtmlText, parseRssOrAtomXml } from '../ingest/rss-fetcher';
import {
  calculateBiasSpectrum,
  detectClusterBlindspot,
} from '../blindspot/blindspot-detector';
import { clusterArticles } from '../clustering/story-clusterer';
import { buildDeterministicSynthesis } from '../synthesizer/neutral-synthesizer';
import type { BiasRating, NewsSource, RawArticle, StoryCluster } from '../../types/news';

const BIAS_RATINGS: BiasRating[] = ['left', 'lean-left', 'center', 'lean-right', 'right'];

function sourceFixture(overrides: Partial<NewsSource> = {}): NewsSource {
  return {
    id: 'rte',
    name: 'RTÉ News',
    url: 'https://www.rte.ie/news/',
    feedUrl: 'https://www.rte.ie/news/rss/news-headlines.xml',
    type: 'rss',
    bias: 'center',
    factuality: 'high',
    ownership: 'public-broadcaster',
    ownerName: 'RTÉ (Statutory Public Body)',
    country: 'IE',
    category: 'irish',
    enabled: true,
    userAdded: false,
    ...overrides,
  };
}

function article(
  partial: Partial<RawArticle> & Pick<RawArticle, 'id' | 'sourceId' | 'title'>
): RawArticle {
  return {
    url: `https://example.com/${partial.id}`,
    publishedAt: '2025-10-20T12:00:00.000Z',
    ...partial,
  };
}

function clusterFrom(articles: RawArticle[], id = 'cluster-test'): StoryCluster {
  const headline = articles[0]?.title || 'Headline';
  return {
    id,
    headline,
    summary: articles[0]?.summary || headline,
    topicTags: ['World News'],
    updatedAt: '2025-10-20T12:00:00.000Z',
    articles,
    biasSpectrum: calculateBiasSpectrum(articles),
  };
}

describe('defaultSources', () => {
  it('ships exactly 20 sources and keeps every one enabled', () => {
    expect(defaultSources).toHaveLength(20);
    expect(defaultSources.every((source) => source.enabled)).toBe(true);
    expect(defaultSources.every((source) => source.userAdded === false)).toBe(true);
    expect(new Set(defaultSources.map((source) => source.id)).size).toBe(20);
  });

  it('gives every source a real feed and a valid bias label', () => {
    for (const source of defaultSources) {
      expect(source.feedUrl.startsWith('http')).toBe(true);
      expect(source.name.length).toBeGreaterThan(0);
      expect(BIAS_RATINGS).toContain(source.bias);
      expect(['high', 'mixed', 'low']).toContain(source.factuality);
      expect(source.ownership.length).toBeGreaterThan(0);
    }
  });

  it('keeps the ownership and bias labels used by the bias bar', () => {
    const byId = new Map(defaultSources.map((source) => [source.id, source]));

    expect(byId.get('ars-technica')).toMatchObject({
      bias: 'center',
      ownership: 'corporate',
    });
    expect(byId.get('irish-examiner')).toMatchObject({
      bias: 'center',
      ownership: 'trust',
    });
    expect(byId.get('rte')).toMatchObject({
      bias: 'center',
      ownership: 'public-broadcaster',
    });
    expect(byId.get('bbc')?.ownership).toBe('public-broadcaster');
    expect(byId.get('fox-news')).toMatchObject({ bias: 'right', ownership: 'corporate' });
    expect(byId.get('gript')).toMatchObject({ bias: 'right', ownership: 'independent' });
    expect(byId.get('the-ditch')).toMatchObject({ bias: 'left', ownership: 'independent' });
    expect(byId.get('guardian')).toMatchObject({ bias: 'lean-left', ownership: 'trust' });
    expect(byId.get('aljazeera')).toMatchObject({ bias: 'lean-left', ownership: 'state' });
    expect(byId.get('independent')).toMatchObject({
      bias: 'lean-right',
      ownership: 'corporate',
    });
  });
});

describe('decodeHtmlText', () => {
  it('returns an empty string for empty input', () => {
    expect(decodeHtmlText('')).toBe('');
  });

  it('decodes named, decimal, and hex entities', () => {
    expect(decodeHtmlText('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(decodeHtmlText('A &lt;b&gt; tag')).toBe('A <b> tag');
    expect(decodeHtmlText('Say &quot;hello&quot;')).toBe('Say "hello"');
    expect(decodeHtmlText('it&#39;s &apos;fine&#8217;')).toBe("it's 'fine'");
    expect(decodeHtmlText('Price &euro; 10 &ndash; sale')).toBe('Price € 10 – sale');
    expect(decodeHtmlText('Hex &#x20AC; sign')).toBe('Hex € sign');
    expect(decodeHtmlText('Unknown &notareal; entity')).toBe('Unknown &notareal; entity');
  });

  it('strips CDATA, tags, scripts, and extra whitespace', () => {
    expect(decodeHtmlText('<![CDATA[Rent rise &amp; chaos]]>')).toBe('Rent rise & chaos');
    expect(decodeHtmlText('Before <script>alert(1)</script> after')).toBe('Before after');
    expect(decodeHtmlText('<style>.x{color:red}</style><p>Hello</p>')).toBe('Hello');
    expect(decodeHtmlText('  spaced   out  ')).toBe('spaced out');
  });
});

describe('parseRssOrAtomXml', () => {
  const source = sourceFixture();

  it('parses RSS items, skips short and duplicate titles, and copies source labels', () => {
    const xml = `<?xml version="1.0"?>
      <rss><channel>
        <item>
          <title><![CDATA[Housing crisis deepens in Dublin]]></title>
          <link>https://www.rte.ie/news/housing-1</link>
          <description><p>Rents &amp; prices rose again this month.</p></description>
          <pubDate>Mon, 20 Oct 2025 12:00:00 GMT</pubDate>
        </item>
        <item>
          <title>Short</title>
          <link>https://www.rte.ie/news/short</link>
        </item>
        <item>
          <title>Housing crisis deepens in Dublin</title>
          <link>https://www.rte.ie/news/dup</link>
        </item>
        <item>
          <title>No link on this longer headline</title>
          <guid>not-a-url</guid>
          <pubDate>not-a-date</pubDate>
        </item>
      </channel></rss>`;

    const articles = parseRssOrAtomXml(xml, source);

    expect(articles).toHaveLength(2);
    expect(articles[0]).toMatchObject({
      id: 'rte-0-aG91c2luZy',
      sourceId: 'rte',
      sourceName: 'RTÉ News',
      sourceBias: 'center',
      sourceFactuality: 'high',
      sourceOwnership: 'public-broadcaster',
      sourceOwnerName: 'RTÉ (Statutory Public Body)',
      sourceCountry: 'IE',
      title: 'Housing crisis deepens in Dublin',
      url: 'https://www.rte.ie/news/housing-1',
      publishedAt: '2025-10-20T12:00:00.000Z',
      summary: 'Rents & prices rose again this month.',
    });
    expect(articles[1].title).toBe('No link on this longer headline');
    expect(articles[1].url).toBe(source.url);
    expect(articles[1].summary).toBe(articles[1].title);
    expect(Number.isNaN(Date.parse(articles[1].publishedAt))).toBe(false);
  });

  it('parses Atom entries and honours maxItems', () => {
    const xml = `<feed>
      <entry>
        <title>Atom story about satellite chip launch</title>
        <link rel="alternate" type="text/html" href="https://example.com/atom-story" />
        <summary>A longer atom summary about the satellite chip launch today.</summary>
        <updated>2025-10-21T08:30:00Z</updated>
      </entry>
      <entry>
        <title>Second atom story about a different launch</title>
        <link href="https://example.com/atom-two" />
        <published>2025-10-21T09:00:00Z</published>
      </entry>
    </feed>`;

    const articles = parseRssOrAtomXml(xml, source);
    expect(articles).toHaveLength(2);
    expect(articles[0]).toMatchObject({
      id: 'rte-0-YXRvbSBzdG',
      title: 'Atom story about satellite chip launch',
      url: 'https://example.com/atom-story',
      publishedAt: '2025-10-21T08:30:00.000Z',
      summary: 'A longer atom summary about the satellite chip launch today.',
    });

    expect(parseRssOrAtomXml(xml, source, 1)).toHaveLength(1);
    expect(parseRssOrAtomXml('', source)).toEqual([]);
  });

  it('caps summaries at 360 characters', () => {
    const long = `${'Word '.repeat(100).trim()}`;
    const xml = `<rss><channel><item>
      <title>Long summary needs a firm cap</title>
      <link>https://example.com/long</link>
      <description>${long}</description>
    </item></channel></rss>`;

    const [parsed] = parseRssOrAtomXml(xml, source);
    expect(parsed.summary).toHaveLength(360);
    expect(long.startsWith(parsed.summary || '')).toBe(true);
  });
});

describe('calculateBiasSpectrum', () => {
  it('counts ratings, buckets, and unique sources', () => {
    const articles = [
      article({ id: '1', sourceId: 'a', title: 'Left one story today', sourceBias: 'left' }),
      article({ id: '2', sourceId: 'b', title: 'Left two story today', sourceBias: 'left' }),
      article({ id: '3', sourceId: 'c', title: 'Lean left story today', sourceBias: 'lean-left' }),
      article({ id: '4', sourceId: 'd', title: 'Center story today now', sourceBias: 'center' }),
      article({ id: '5', sourceId: 'e', title: 'Lean right story today', sourceBias: 'lean-right' }),
      article({ id: '6', sourceId: 'f', title: 'Right story today now', sourceBias: 'right' }),
    ];

    const spectrum = calculateBiasSpectrum(articles);

    expect(spectrum.counts).toEqual({
      left: 2,
      'lean-left': 1,
      center: 1,
      'lean-right': 1,
      right: 1,
    });
    expect(spectrum.percentages).toEqual({
      left: 33,
      'lean-left': 17,
      center: 17,
      'lean-right': 17,
      right: 17,
    });
    expect(spectrum.bucketCounts).toEqual({ left: 3, center: 1, right: 2 });
    expect(spectrum.bucketPercentages).toEqual({ left: 50, center: 17, right: 33 });
    expect(spectrum.totalArticles).toBe(6);
    expect(spectrum.totalSources).toBe(6);
  });

  it('uses the source map when an article has no bias, otherwise center', () => {
    const mapped = calculateBiasSpectrum(
      [article({ id: 'g', sourceId: 'gript', title: 'Gript story without a bias field' })],
      new Map([['gript', sourceFixture({ id: 'gript', bias: 'right', ownership: 'independent' })]])
    );
    expect(mapped.counts.right).toBe(1);
    expect(mapped.bucketPercentages.right).toBe(100);

    const fallback = calculateBiasSpectrum([
      article({ id: 'u', sourceId: 'unknown', title: 'Unknown outlet story today' }),
    ]);
    expect(fallback.counts.center).toBe(1);
    expect(fallback.bucketCounts.center).toBe(1);
  });

  it('forces a missing right bucket to 0% and makes left plus center equal 100', () => {
    const articles = [
      article({ id: 'l', sourceId: 'l', title: 'Only left piece today', sourceBias: 'left' }),
      ...Array.from({ length: 7 }, (_, index) =>
        article({
          id: `c${index}`,
          sourceId: `c${index}`,
          title: `Center piece number ${index} today`,
          sourceBias: 'center',
        })
      ),
    ];

    const spectrum = calculateBiasSpectrum(articles);
    expect(spectrum.bucketCounts).toEqual({ left: 1, center: 7, right: 0 });
    expect(spectrum.bucketPercentages).toEqual({ left: 13, center: 87, right: 0 });
    expect(
      spectrum.bucketPercentages.left +
        spectrum.bucketPercentages.center +
        spectrum.bucketPercentages.right
    ).toBe(100);
  });

  it('returns zeros for an empty article list', () => {
    const spectrum = calculateBiasSpectrum([]);
    expect(spectrum.totalArticles).toBe(0);
    expect(spectrum.totalSources).toBe(0);
    expect(spectrum.bucketCounts).toEqual({ left: 0, center: 0, right: 0 });
    expect(spectrum.bucketPercentages).toEqual({ left: 0, center: 0, right: 0 });
    expect(Object.values(spectrum.counts).every((count) => count === 0)).toBe(true);
  });
});

describe('detectClusterBlindspot', () => {
  it('does not flag a single outlet, even when that outlet is far to one side', () => {
    const one = detectClusterBlindspot(
      'solo',
      calculateBiasSpectrum([
        article({ id: '1', sourceId: 'same', title: 'One outlet only today', sourceBias: 'left' }),
        article({ id: '2', sourceId: 'same', title: 'Same outlet again today', sourceBias: 'left' }),
      ])
    );

    expect(one.isBlindspot).toBe(false);
    expect(one.severity).toBe('none');
    expect(one.missingSide).toBeUndefined();
    expect(one.message).toContain('Single-source story');
  });

  it('flags a high right blindspot when right coverage is missing', () => {
    const spectrum = calculateBiasSpectrum([
      article({ id: '1', sourceId: 'a', title: 'Left outlet one today', sourceBias: 'left' }),
      article({ id: '2', sourceId: 'b', title: 'Left outlet two today', sourceBias: 'lean-left' }),
      article({ id: '3', sourceId: 'c', title: 'Left outlet three today', sourceBias: 'left' }),
    ]);
    const alert = detectClusterBlindspot('left-heavy', spectrum);

    expect(alert).toMatchObject({
      clusterId: 'left-heavy',
      isBlindspot: true,
      dominantSide: 'left',
      missingSide: 'right',
      sharePercent: 100,
      severity: 'high',
    });
    expect(alert.message).toContain('Right Blindspot');
    expect(alert.message).toContain('0% Right-leaning coverage');
    expect(alert.message).toContain('3 outlets');
  });

  it('flags a moderate right blindspot when left is 67% but right is present', () => {
    const alert = detectClusterBlindspot(
      'moderate',
      calculateBiasSpectrum([
        article({ id: '1', sourceId: 'a', title: 'Left framing one today', sourceBias: 'left' }),
        article({ id: '2', sourceId: 'b', title: 'Left framing two today', sourceBias: 'lean-left' }),
        article({ id: '3', sourceId: 'c', title: 'Right framing one today', sourceBias: 'right' }),
      ])
    );

    expect(alert).toMatchObject({
      isBlindspot: true,
      dominantSide: 'left',
      missingSide: 'right',
      sharePercent: 67,
      severity: 'moderate',
    });
    expect(alert.message).toBe(
      'Right Blindspot: 67% of coverage is from Left-leaning outlets vs 33% Right.'
    );
  });

  it('flags a high left blindspot when left coverage is missing', () => {
    const alert = detectClusterBlindspot(
      'right-heavy',
      calculateBiasSpectrum([
        article({ id: '1', sourceId: 'a', title: 'Right outlet one today', sourceBias: 'right' }),
        article({ id: '2', sourceId: 'b', title: 'Right outlet two today', sourceBias: 'lean-right' }),
        article({ id: '3', sourceId: 'c', title: 'Right outlet three today', sourceBias: 'right' }),
      ])
    );

    expect(alert).toMatchObject({
      isBlindspot: true,
      dominantSide: 'right',
      missingSide: 'left',
      sharePercent: 100,
      severity: 'high',
    });
    expect(alert.message).toContain('Left Blindspot');
    expect(alert.message).toContain('0% Left-leaning coverage');
  });

  it('calls mixed coverage balanced', () => {
    const alert = detectClusterBlindspot(
      'mixed',
      calculateBiasSpectrum([
        article({ id: '1', sourceId: 'a', title: 'Left piece one today', sourceBias: 'left' }),
        article({ id: '2', sourceId: 'b', title: 'Left piece two today', sourceBias: 'lean-left' }),
        article({ id: '3', sourceId: 'c', title: 'Center piece one today', sourceBias: 'center' }),
        article({ id: '4', sourceId: 'd', title: 'Center piece two today', sourceBias: 'center' }),
        article({ id: '5', sourceId: 'e', title: 'Right piece one today', sourceBias: 'lean-right' }),
        article({ id: '6', sourceId: 'f', title: 'Right piece two today', sourceBias: 'right' }),
      ])
    );

    expect(alert.isBlindspot).toBe(false);
    expect(alert.severity).toBe('none');
    expect(alert.dominantSide).toBe('right');
    expect(alert.sharePercent).toBe(34);
    expect(alert.message).toBe('Balanced coverage across spectrum (33% L / 33% C / 34% R).');
  });
});

describe('clusterArticles', () => {
  const zelenskyy = [
    article({
      id: 'fox',
      sourceId: 'fox-news',
      sourceName: 'Fox News',
      sourceBias: 'right',
      sourceFactuality: 'mixed',
      title: 'Allies brief Zelenskyy before ceasefire talks resume',
      publishedAt: '2025-10-20T12:05:00.000Z',
      summary: 'Allies briefed Zelenskyy before ceasefire talks resume amid fresh strikes.',
    }),
    article({
      id: 'guardian',
      sourceId: 'guardian',
      sourceName: 'The Guardian',
      sourceBias: 'lean-left',
      sourceFactuality: 'high',
      title: 'Officials brief Zelenskyy before ceasefire talks resume',
      publishedAt: '2025-10-20T12:10:00.000Z',
      summary: 'Officials briefed Zelenskyy before ceasefire talks resume this week.',
    }),
    article({
      id: 'rte',
      sourceId: 'rte',
      sourceName: 'RTÉ News',
      sourceBias: 'center',
      sourceFactuality: 'high',
      title: 'Leaders brief Zelenskyy before ceasefire talks resume',
      publishedAt: '2025-10-20T12:00:00.000Z',
      summary: 'European leaders briefed Zelenskyy before ceasefire talks resume in Geneva.',
    }),
  ];

  const murdoch = [
    article({
      id: 'ditch',
      sourceId: 'the-ditch',
      sourceName: 'The Ditch',
      sourceBias: 'left',
      sourceFactuality: 'mixed',
      title: 'Senate probes Murdoch media merger filing',
      publishedAt: '2025-10-20T09:00:00.000Z',
      summary: 'A senate panel probes the Murdoch media merger filing.',
    }),
    article({
      id: 'nyt',
      sourceId: 'nyt',
      sourceName: 'New York Times',
      sourceBias: 'lean-left',
      sourceFactuality: 'high',
      title: 'Committee probes Murdoch media merger filing',
      publishedAt: '2025-10-20T09:30:00.000Z',
      summary: 'A committee probes the Murdoch media merger filing in detail.',
    }),
  ];

  const apple = article({
    id: 'ars',
    sourceId: 'ars-technica',
    sourceName: 'Ars Technica',
    sourceBias: 'center',
    sourceFactuality: 'high',
    sourceOwnership: 'corporate',
    title: 'Apple unveils iPhone chip for satellite links',
    publishedAt: '2025-10-19T08:00:00.000Z',
    summary: 'Apple showed a new iPhone chip aimed at satellite links.',
  });

  it('returns no clusters for an empty list', () => {
    expect(clusterArticles([])).toEqual([]);
  });

  it('groups the same event across outlets and leaves a different event alone', () => {
    const clusters = clusterArticles([zelenskyy[0], apple, zelenskyy[1], murdoch[0], zelenskyy[2], murdoch[1]]);

    expect(clusters).toHaveLength(3);

    const ceasefire = clusters.find((cluster) => cluster.articles.some((item) => item.sourceId === 'rte'));
    const merger = clusters.find((cluster) => cluster.articles.some((item) => item.sourceId === 'nyt'));
    const chip = clusters.find((cluster) => cluster.articles.some((item) => item.sourceId === 'ars-technica'));

    expect(ceasefire?.articles.map((item) => item.sourceId).sort()).toEqual([
      'fox-news',
      'guardian',
      'rte',
    ]);
    expect(ceasefire?.headline).toBe('Leaders brief Zelenskyy before ceasefire talks resume');
    expect(ceasefire?.biasSpectrum.bucketCounts).toEqual({ left: 1, center: 1, right: 1 });
    expect(ceasefire?.biasSpectrum.totalSources).toBe(3);
    expect(ceasefire?.blindspot?.isBlindspot).toBe(false);
    expect(ceasefire?.blindspot?.severity).toBe('none');

    expect(merger?.articles.map((item) => item.sourceId).sort()).toEqual(['nyt', 'the-ditch']);
    expect(merger?.biasSpectrum.bucketCounts).toEqual({ left: 2, center: 0, right: 0 });
    expect(merger?.biasSpectrum.totalSources).toBe(2);
    expect(merger?.blindspot).toMatchObject({
      isBlindspot: true,
      dominantSide: 'left',
      missingSide: 'right',
      severity: 'high',
    });

    expect(chip?.articles).toHaveLength(1);
    expect(chip?.blindspot?.isBlindspot).toBe(false);
    expect(chip?.blindspot?.message).toContain('Single-source story');

    expect(clusters.map((cluster) => cluster.biasSpectrum.totalSources)).toEqual([3, 2, 1]);
  });

  it('fills missing bias and ownership from the source list', () => {
    const clusters = clusterArticles(
      [
        article({
          id: 'bare-rte',
          sourceId: 'rte',
          title: 'Leaders brief Zelenskyy before ceasefire talks resume',
        }),
        article({
          id: 'bare-fox',
          sourceId: 'fox-news',
          title: 'Allies brief Zelenskyy before ceasefire talks resume',
          publishedAt: '2025-10-20T12:05:00.000Z',
        }),
      ],
      defaultSources
    );

    const grouped = clusters.find((cluster) => cluster.biasSpectrum.totalSources === 2);
    expect(grouped).toBeDefined();
    expect(grouped?.biasSpectrum.bucketCounts).toEqual({ left: 0, center: 1, right: 1 });
    expect(grouped?.articles.find((item) => item.sourceId === 'rte')).toMatchObject({
      sourceBias: 'center',
      sourceOwnership: 'public-broadcaster',
      sourceName: 'RTÉ News',
    });
    expect(grouped?.articles.find((item) => item.sourceId === 'fox-news')?.sourceBias).toBe('right');
    expect(grouped?.blindspot?.isBlindspot).toBe(false);
  });
});

describe('buildDeterministicSynthesis', () => {
  it('returns neutral facts, side framing, and what is missing', () => {
    const synthesis = buildDeterministicSynthesis(
      clusterFrom([
        article({
          id: 'c',
          sourceId: 'rte',
          sourceName: 'RTÉ News',
          sourceBias: 'center',
          sourceFactuality: 'high',
          title: 'Cabinet backs Harris housing reform package',
          summary: 'Ministers agreed a package aimed at renters in Dublin this week.',
        }),
        article({
          id: 'l',
          sourceId: 'the-ditch',
          sourceName: 'The Ditch',
          sourceBias: 'left',
          sourceFactuality: 'mixed',
          title: 'Opposition slams Harris housing reform package',
          summary: 'Critics say the package ignores tenants and landlords alike.',
        }),
        article({
          id: 'r',
          sourceId: 'gript',
          sourceName: 'Gript',
          sourceBias: 'right',
          sourceFactuality: 'mixed',
          title: 'Gript questions Harris housing reform package',
          summary: 'The package adds cost for small landlords across the country.',
        }),
      ])
    );

    expect(synthesis.clusterId).toBe('cluster-test');
    expect(synthesis.generatedBy).toBe('deterministic-fallback');
    expect(Number.isNaN(Date.parse(synthesis.generatedAt))).toBe(false);

    expect(synthesis.neutralFacts.length).toBeGreaterThan(1);
    expect(synthesis.neutralFacts[0]).toContain('3 independent outlets');
    expect(synthesis.neutralFacts[0]).toContain('RTÉ News, The Ditch, Gript');
    expect(synthesis.neutralFacts[0]).toContain('Cabinet backs Harris housing reform package');

    expect(synthesis.howEachSideFramed.left).toContain('The Ditch (1 report)');
    expect(synthesis.howEachSideFramed.left).toContain('Uses high-urgency framing (slams)');
    expect(synthesis.howEachSideFramed.center).toContain('RTÉ News (1 report)');
    expect(synthesis.howEachSideFramed.center).toContain('direct policy/event reporting');
    expect(synthesis.howEachSideFramed.right).toContain('Gript (1 report)');
    expect(synthesis.howEachSideFramedList).toEqual([
      `Left (1): ${synthesis.howEachSideFramed.left}`,
      `Center (1): ${synthesis.howEachSideFramed.center}`,
      `Right (1): ${synthesis.howEachSideFramed.right}`,
    ]);

    expect(synthesis.whatsMissing).toEqual([
      'Primary source documents, full legislative/court text, or long-term fiscal/human impact data are rarely quoted in full across headline summaries.',
    ]);
    expect(synthesis.whatsMissing.join(' ')).not.toContain('Zero Left-leaning');
    expect(synthesis.whatsMissing.join(' ')).not.toContain('Zero Right-leaning');
  });

  it('names a missing side and a single-outlet gap', () => {
    const missingRight = buildDeterministicSynthesis(
      clusterFrom([
        article({
          id: 'c',
          sourceId: 'rte',
          sourceName: 'RTÉ News',
          sourceBias: 'center',
          sourceFactuality: 'high',
          title: 'Cabinet backs Harris housing reform package',
          summary: 'Ministers agreed a package aimed at renters in Dublin this week.',
        }),
        article({
          id: 'l',
          sourceId: 'the-ditch',
          sourceName: 'The Ditch',
          sourceBias: 'left',
          sourceFactuality: 'high',
          title: 'Opposition questions Harris housing reform package',
          summary: 'Critics say the package ignores tenants and landlords alike.',
        }),
      ])
    );

    expect(missingRight.howEachSideFramed.right).toBe(
      'No Right-leaning outlets in your active feed have published an article on this story yet.'
    );
    expect(missingRight.whatsMissing).toContain(
      'Blindspot alert: Zero Right-leaning outlets in your current feed have covered this story yet.'
    );
    expect(missingRight.whatsMissing).not.toContain(
      'Blindspot alert: Zero Left-leaning outlets in your current feed have covered this story yet.'
    );

    const solo = buildDeterministicSynthesis(
      clusterFrom([
        article({
          id: 'only',
          sourceId: 'rte',
          sourceName: 'RTÉ News',
          sourceBias: 'center',
          sourceFactuality: 'high',
          title: 'Cabinet backs Harris housing reform package',
          summary: 'Ministers agreed a package aimed at renters in Dublin this week.',
        }),
      ])
    );

    expect(solo.neutralFacts[0]).toContain('1 outlet (RTÉ News)');
    expect(solo.whatsMissing).toContain(
      'Single-outlet report so far; cross-check with additional outlets before treating framing as consensus.'
    );
    expect(solo.whatsMissing).toContain(
      'Blindspot alert: Zero Left-leaning outlets in your current feed have covered this story yet.'
    );
    expect(solo.whatsMissing).toContain(
      'Blindspot alert: Zero Right-leaning outlets in your current feed have covered this story yet.'
    );
  });

  it('warns when every report is mixed or low factuality', () => {
    const synthesis = buildDeterministicSynthesis(
      clusterFrom([
        article({
          id: 'a',
          sourceId: 'gript',
          sourceName: 'Gript',
          sourceBias: 'right',
          sourceFactuality: 'mixed',
          title: 'Gript questions Harris housing reform package',
          summary: 'The package adds cost for small landlords across the country.',
        }),
        article({
          id: 'b',
          sourceId: 'fox-news',
          sourceName: 'Fox News',
          sourceBias: 'right',
          sourceFactuality: 'low',
          title: 'Fox covers Harris housing reform package',
          summary: 'Landlords say the package raises costs for small owners.',
        }),
      ])
    );

    expect(synthesis.whatsMissing).toContain(
      'All current reports come from Mixed-factuality outlets; verify primary documents or wait for high-factuality wire confirmation.'
    );
    expect(synthesis.whatsMissing.join(' ')).not.toContain('Primary source documents');
  });
});

import { sourceCatalog } from '../../data/source-catalog';
import { toggleOrAddCatalogSource } from '../registry/source-registry';

describe('Extended 60+ Verified Source Discovery Catalog', () => {
  it('contains at least 60 distinct verified feeds across all 6 subcategories', () => {
    expect(sourceCatalog.length).toBeGreaterThanOrEqual(60);
    const ids = new Set(sourceCatalog.map((s) => s.id));
    expect(ids.size).toBe(sourceCatalog.length);

    const subCategories = new Set(sourceCatalog.map((s) => s.subCategory));
    expect(subCategories.has('Irish National & Local')).toBe(true);
    expect(subCategories.has('UK & Europe')).toBe(true);
    expect(subCategories.has('US & Global')).toBe(true);
    expect(subCategories.has('AI, Tech & Coding')).toBe(true);
    expect(subCategories.has('Science & Finance')).toBe(true);
    expect(subCategories.has('Subreddits & Communities')).toBe(true);
  });

  it('adds a new catalog source on one tap and toggles an existing source', () => {
    const newItem = sourceCatalog.find(
      (c) => !defaultSources.some((d) => d.id === c.id)
    )!;
    expect(newItem).toBeDefined();

    const afterAdd = toggleOrAddCatalogSource(defaultSources, newItem);
    expect(afterAdd.length).toBe(defaultSources.length + 1);
    const added = afterAdd.find((s) => s.id === newItem.id)!;
    expect(added.enabled).toBe(true);
    expect(added.userAdded).toBe(true);

    const afterToggleOff = toggleOrAddCatalogSource(afterAdd, newItem);
    expect(afterToggleOff.find((s) => s.id === newItem.id)!.enabled).toBe(false);
  });
});
