import { NewsSource, RawArticle } from '../../types/news';
import { normalizeCustomFeedUrl } from '../../data/default-sources';

interface CacheEntry {
  timestamp: number;
  articles: RawArticle[];
}

const feedCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&#039;': "'",
  '&#8216;': "'",
  '&#8217;': "'",
  '&#8220;': '"',
  '&#8221;': '"',
  '&#8211;': '–',
  '&#8212;': '—',
  '&#8230;': '…',
  '&nbsp;': ' ',
  '&euro;': '€',
  '&pound;': '£', '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í', '&oacute;': 'ó', '&uacute;': 'ú', '&Aacute;': 'Á', '&Eacute;': 'É', '&Iacute;': 'Í', '&Oacute;': 'Ó', '&Uacute;': 'Ú', '&ndash;': '–', '&mdash;': '—', '&lsquo;': "'", '&rsquo;': "'", '&ldquo;': '"', '&rdquo;': '"',
};

export function decodeHtmlText(raw: string): string {
  if (!raw) return '';
  let text = raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');

  text = text.replace(/&[a-zA-Z0-9#]+;/g, (entity) => {
    if (HTML_ENTITIES[entity]) return HTML_ENTITIES[entity];
    const decMatch = entity.match(/^&#(\d+);$/);
    if (decMatch) {
      const code = parseInt(decMatch[1], 10);
      return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    const hexMatch = entity.match(/^&#x([0-9a-fA-F]+);$/);
    if (hexMatch) {
      const code = parseInt(hexMatch[1], 16);
      return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return entity;
  });

  return text.replace(/\s+/g, ' ').trim();
}

function extractTagValue(block: string, tagNames: string[]): string {
  for (const tag of tagNames) {
    const regex = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
    const match = block.match(regex);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return '';
}

function extractLinkFromBlock(block: string, fallbackUrl: string): string {
  // Atom <link href="..." rel="alternate" /> or <link href="..." />
  const atomAlternate = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (atomAlternate?.[1]) return decodeHtmlText(atomAlternate[1]);

  const atomHref = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (atomHref?.[1]) return decodeHtmlText(atomHref[1]);

  const rssLink = extractTagValue(block, ['link', 'guid']);
  if (rssLink) {
    const cleaned = decodeHtmlText(rssLink);
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
      return cleaned;
    }
  }
  return fallbackUrl;
}

function normalizeDate(rawDate: string): string {
  if (!rawDate) return new Date().toISOString();
  const cleaned = decodeHtmlText(rawDate);
  const parsed = Date.parse(cleaned);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }
  return new Date().toISOString();
}

export function parseRssOrAtomXml(xml: string, source: NewsSource, maxItems = 15): RawArticle[] {
  if (!xml) return [];

  // Match RSS <item> or Atom <entry> blocks
  const itemMatches = [
    ...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi),
    ...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi),
  ];

  const articles: RawArticle[] = [];
  const seenTitles = new Set<string>();

  for (let i = 0; i < itemMatches.length && articles.length < maxItems; i++) {
    const block = itemMatches[i][1];
    const rawTitle = extractTagValue(block, ['title']);
    const title = decodeHtmlText(rawTitle);
    if (!title || title.length < 8) continue;

    const titleKey = title.toLowerCase();
    if (seenTitles.has(titleKey)) continue;
    seenTitles.add(titleKey);

    const url = extractLinkFromBlock(block, source.url);
    const rawSummary = extractTagValue(block, [
      'description',
      'summary',
      'content:encoded',
      'content',
      'media:description',
    ]);
    const summary = decodeHtmlText(rawSummary).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 360);
    const rawDate = extractTagValue(block, [
      'pubDate',
      'published',
      'updated',
      'dc:date',
      'a10:updated',
    ]);
    const publishedAt = normalizeDate(rawDate);

    articles.push({
      id: `${source.id}-${i}-${Buffer.from(titleKey.slice(0, 32)).toString('base64url').slice(0, 10)}`,
      sourceId: source.id,
      sourceName: source.name,
      sourceBias: source.bias,
      sourceFactuality: source.factuality,
      sourceOwnership: source.ownership,
      sourceOwnerName: source.ownerName,
      sourceCountry: source.country,
      title,
      url,
      publishedAt,
      summary: summary || title,
    });
  }

  return articles;
}

export async function fetchSingleSource(
  source: NewsSource,
  options: { timeoutMs?: number; maxItems?: number; bypassCache?: boolean } = {}
): Promise<RawArticle[]> {
  const { timeoutMs = 6500, maxItems = 15, bypassCache = false } = options;
  const feedUrl = normalizeCustomFeedUrl(source.feedUrl || source.url, source.type);
  if (!feedUrl) return [];

  const cached = feedCache.get(feedUrl);
  if (!bypassCache && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.articles;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GroundNewsReader/1.0',
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timer);

    if (!response.ok) {
      return cached ? cached.articles : [];
    }

    const xml = await response.text();
    const articles = parseRssOrAtomXml(xml, source, maxItems);
    if (articles.length > 0) {
      feedCache.set(feedUrl, { timestamp: Date.now(), articles });
    }
    return articles;
  } catch {
    return cached ? cached.articles : [];
  }
}

export async function fetchAllSources(
  sources: NewsSource[],
  options: { timeoutMs?: number; maxItemsPerSource?: number; bypassCache?: boolean } = {}
): Promise<{
  articles: RawArticle[];
  sourceStats: { id: string; name: string; status: 'ok' | 'empty'; count: number }[];
}> {
  const enabledSources = sources.filter((s) => s.enabled);

  const results = await Promise.all(
    enabledSources.map(async (source) => {
      const articles = await fetchSingleSource(source, {
        timeoutMs: options.timeoutMs ?? 6500,
        maxItems: options.maxItemsPerSource ?? 15,
        bypassCache: options.bypassCache ?? false,
      });
      return {
        source,
        articles,
      };
    })
  );

  const allArticles: RawArticle[] = [];
  const sourceStats: { id: string; name: string; status: 'ok' | 'empty'; count: number }[] = [];

  for (const { source, articles } of results) {
    allArticles.push(...articles);
    sourceStats.push({
      id: source.id,
      name: source.name,
      status: articles.length > 0 ? 'ok' : 'empty',
      count: articles.length,
    });
  }

  // Sort newest first
  allArticles.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  return { articles: allArticles, sourceStats };
}
