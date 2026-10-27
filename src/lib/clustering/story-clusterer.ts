import { NewsSource, RawArticle, StoryCluster } from '../../types/news';
import {
  calculateBiasSpectrum,
  detectClusterBlindspot,
} from '../blindspot/blindspot-detector';
import { buildDeterministicSynthesis } from '../synthesizer/neutral-synthesizer';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'has', 'had',
  'not', 'are', 'was', 'were', 'will', 'would', 'could', 'should', 'into',
  'after', 'before', 'over', 'under', 'about', 'against', 'between', 'through',
  'during', 'without', 'within', 'along', 'following', 'across', 'behind',
  'beyond', 'plus', 'except', 'but', 'out', 'around', 'down', 'off', 'above',
  'near', 'new', 'says', 'said', 'say', 'amid', 'more', 'most', 'some', 'such',
  'than', 'too', 'very', 'can', 'just', 'now', 'also', 'how', 'why', 'what',
  'when', 'where', 'who', 'whom', 'which', 'their', 'there', 'they', 'them',
  'his', 'her', 'its', 'our', 'your', 'been', 'being', 'does', 'did', 'doing',
  'news', 'report', 'reports', 'live', 'update', 'updates', 'latest', 'watch',
  'video', 'analysis', 'opinion', 'review', 'today', 'year', 'years', 'week',
  'day', 'days', 'time', 'first', 'two', 'three', 'one', 'people', 'make',
  'made', 'get', 'gets', 'got', 'back', 'take', 'takes', 'took', 'see', 'seen',
  'man', 'woman', 'men', 'women', 'told', 'tells', 'call', 'calls', 'called',
  'world', 'country', 'state', 'government', 'minister', 'public', 'group',
  'part', 'plan', 'plans', 'show', 'shows', 'need', 'needs', 'want', 'wants',
  'work', 'working', 'left', 'right', 'high', 'low', 'big', 'small', 'old',
  'young', 'good', 'bad', 'best', 'worst', 'way', 'ways', 'life', 'home',
  'wrap', 'inside', 'push', 'poll', 'polls', 'party', 'parties',
]);

// Broad country/location words should still be normal tokens, NOT high-weight specific entities
const BROAD_GEO_WORDS = new Set([
  'ireland', 'irish', 'dublin', 'cork', 'uk', 'britain', 'british', 'london',
  'england', 'us', 'usa', 'america', 'american', 'washington', 'eu', 'europe',
  'european', 'russia', 'russian', 'china', 'chinese', 'israel', 'israeli', 'united', 'trump', 'eastern', 'western', 'northern', 'southern',
]);

function stemToken(word: string): string {
  const lower = word.toLowerCase().replace(/^['’]+|['’]+$/g, '');
  if (lower === 'gardai' || lower === 'gardaí') return 'garda';
  if (lower === 'uk' || lower === 'british') return 'britain';
  if (lower === 'us' || lower === 'american') return 'usa';
  if (lower === 'israeli') return 'israel';
  if (lower === 'palestinian' || lower === 'palestinians') return 'palestine';
  if (lower === 'ukrainian') return 'ukraine';
  if (lower === 'russian') return 'russia';
  if (lower === 'iranian') return 'iran';
  if (lower.length <= 4) return lower;
  return lower
    .replace(/('s|’s)$/i, '')
    .replace(/(ing|ers|ied|ies|ations|ation|ments|ment|ness|ally)$/i, '')
    .replace(/s$/i, '');
}

export function extractTokens(text: string): string[] {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const rawTokens = normalized
    .replace(/[^a-z0-9\s-]/gi, ' ')
    .split(/[\s-]+/)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));

  return rawTokens
    .map(stemToken)
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

export function extractEntities(title: string): Set<string> {
  const entities = new Set<string>();
  const normalizedTitle = title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[“”"']/g, '');
  const words = normalizedTitle.split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const clean = words[i].replace(/[^a-zA-Z0-9-]/g, '');
    if (!clean || clean.length < 3) continue;

    const lower = clean.toLowerCase();
    if (STOP_WORDS.has(lower) || BROAD_GEO_WORDS.has(lower)) continue;

    const isAllCaps =
      clean.length >= 2 && clean === clean.toUpperCase() && /[A-Z]/.test(clean);
    const isCap = /^[A-Z][a-zA-Z0-9-]+$/.test(clean);

    if (isAllCaps || (isCap && i > 0)) {
      const stemmed = stemToken(lower);
      if (!STOP_WORDS.has(stemmed) && !BROAD_GEO_WORDS.has(stemmed)) {
        entities.add(stemmed);
      }
    }
  }
  return entities;
}

interface ArticleVector {
  article: RawArticle;
  titleTokens: Set<string>;
  specificTitleTokens: Set<string>;
  entities: Set<string>;
  tfMap: Map<string, number>;
}

function computeCosineSimilarity(
  a: Map<string, number>,
  b: Map<string, number>,
  idf: Map<string, number>
): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [term, tfA] of a.entries()) {
    const wA = tfA * (idf.get(term) || 1);
    normA += wA * wA;
    const tfB = b.get(term);
    if (tfB) {
      const wB = tfB * (idf.get(term) || 1);
      dot += wA * wB;
    }
  }

  for (const [term, tfB] of b.entries()) {
    const wB = tfB * (idf.get(term) || 1);
    normB += wB * wB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function setIntersection(a: Set<string>, b: Set<string>): string[] {
  const shared: string[] = [];
  for (const item of a) {
    if (b.has(item)) shared.push(item);
  }
  return shared;
}

function inferTopicTags(articles: RawArticle[]): string[] {
  const combined = articles
    .map((a) => `${a.title} ${a.summary || ''}`)
    .join(' ')
    .toLowerCase();

  const tags: string[] = [];
  if (
    /\b(ireland|irish|dublin|cork|galway|limerick|garda|gardai|dail|taoiseach|rte|sinn fein|fianna|fine gael|hse)\b/.test(
      combined
    )
  ) {
    tags.push('Ireland');
  }
  if (
    /\b(housing|rent|tenant|landlord|homeless|mortgage|property|planning)\b/.test(
      combined
    )
  ) {
    tags.push('Housing');
  }
  if (
    /\b(gaza|israel|lebanon|iran|ukraine|russia|un|nato|war|strike|military|ceasefire)\b/.test(
      combined
    )
  ) {
    tags.push('World & Conflict');
  }
  if (
    /\b(trump|biden|harris|white house|congress|senate|republican|democrat|washington|election)\b/.test(
      combined
    )
  ) {
    tags.push('US Politics');
  }
  if (
    /\b(uk|britain|british|starmer|london|nhs|westminster|sunak|tory|labour)\b/.test(
      combined
    )
  ) {
    tags.push('UK');
  }
  if (
    /\b(ai|openai|apple|google|microsoft|meta|tech|software|cyber|chip|iphone|robot|space)\b/.test(
      combined
    )
  ) {
    tags.push('Tech & AI');
  }
  if (
    /\b(court|judge|trial|jailed|prison|police|arrest|murder|assault|crime|law|inquest)\b/.test(
      combined
    )
  ) {
    tags.push('Courts & Law');
  }
  if (
    /\b(economy|inflation|tax|budget|bank|market|trade|tariff|jobs|business|euro)\b/.test(
      combined
    )
  ) {
    tags.push('Economy');
  }

  if (tags.length === 0) tags.push('World News');
  return tags.slice(0, 3);
}

function chooseNeutralHeadline(articles: RawArticle[]): string {
  const centerHigh = articles.find(
    (a) => a.sourceBias === 'center' && a.sourceFactuality === 'high'
  );
  if (centerHigh) return centerHigh.title;

  const anyCenter = articles.find((a) => a.sourceBias === 'center');
  if (anyCenter) return anyCenter.title;

  const anyHigh = articles.find((a) => a.sourceFactuality === 'high');
  if (anyHigh) return anyHigh.title;

  return articles[0]?.title || 'Breaking Story';
}

export function clusterArticles(
  articles: RawArticle[],
  sources?: NewsSource[],
  options: { similarityThreshold?: number } = {}
): StoryCluster[] {
  if (articles.length === 0) return [];

  const sourceMap = new Map<string, NewsSource>();
  if (sources) {
    for (const s of sources) sourceMap.set(s.id, s);
  }

  const enrichedArticles: RawArticle[] = articles.map((a) => {
    const src = sourceMap.get(a.sourceId);
    return {
      ...a,
      sourceName: a.sourceName || src?.name || a.sourceId,
      sourceBias: a.sourceBias || src?.bias || 'center',
      sourceFactuality: a.sourceFactuality || src?.factuality || 'high',
      sourceOwnership: a.sourceOwnership || src?.ownership || 'private',
      sourceOwnerName:
        a.sourceOwnerName || src?.ownerName || src?.ownership || 'Private',
      sourceCountry: a.sourceCountry || src?.country || 'IE',
    };
  });

  const docFreq = new Map<string, number>();
  const rawVectors = enrichedArticles.map((article) => {
    const titleToks = extractTokens(article.title);
    const summaryToks = extractTokens((article.summary || '').slice(0, 180));
    const entities = extractEntities(article.title);

    const tfMap = new Map<string, number>();
    // Title tokens weighted 2.5x, summary tokens 1x, specific entities +2x
    for (const tok of titleToks) {
      tfMap.set(tok, (tfMap.get(tok) || 0) + 2.5);
    }
    for (const tok of summaryToks) {
      tfMap.set(tok, (tfMap.get(tok) || 0) + 1);
    }
    for (const ent of entities) {
      tfMap.set(ent, (tfMap.get(ent) || 0) + 2);
    }

    for (const term of tfMap.keys()) {
      docFreq.set(term, (docFreq.get(term) || 0) + 1);
    }

    return {
      article,
      titleTokens: new Set(titleToks),
      entities,
      tfMap,
    };
  });

  const N = rawVectors.length;
  const idf = new Map<string, number>();
  for (const [term, df] of docFreq.entries()) {
    idf.set(term, Math.log((N + 1) / (df + 1)) + 1);
  }

  const vectors: ArticleVector[] = rawVectors.map((v) => {
    const specificTitleTokens = new Set<string>();
    for (const t of v.titleTokens) {
      if (!BROAD_GEO_WORDS.has(t) && (idf.get(t) || 0) >= 2.2) {
        specificTitleTokens.add(t);
      }
    }
    return {
      ...v,
      specificTitleTokens,
    };
  });

  const threshold = options.similarityThreshold ?? 0.27;
  const assigned = new Set<number>();
  const rawGroups: RawArticle[][] = [];

  for (let i = 0; i < vectors.length; i++) {
    if (assigned.has(i)) continue;
    assigned.add(i);

    const seed = vectors[i];
    const group: RawArticle[] = [seed.article];

    for (let j = i + 1; j < vectors.length; j++) {
      if (assigned.has(j)) continue;
      const cand = vectors[j];

      const cosine = computeCosineSimilarity(seed.tfMap, cand.tfMap, idf);
      const sharedSpecificTitle = setIntersection(
        seed.specificTitleTokens,
        cand.specificTitleTokens
      );
      const sharedEntities = setIntersection(seed.entities, cand.entities);
      const sharedAllTitle = setIntersection(seed.titleTokens, cand.titleTokens);

      // Must share at least 1 specific entity or 2 specific title tokens (preventing generic matches)
      const hasSpecificAnchor =
        sharedEntities.length >= 1 || sharedSpecificTitle.length >= 2;
      if (!hasSpecificAnchor) continue;

      const score =
        cosine +
        sharedSpecificTitle.length * 0.08 +
        sharedEntities.length * 0.11;

      if (
        score >= threshold &&
        (sharedAllTitle.length >= 2 ||
          (sharedEntities.length >= 1 && cosine >= 0.22))
      ) {
        assigned.add(j);
        group.push(cand.article);
      }
    }

    rawGroups.push(group);
  }

  const clusters: StoryCluster[] = rawGroups.map((group, idx) => {
    const headline = chooseNeutralHeadline(group);
    const id = `cluster-${idx + 1}-${Buffer.from(
      headline.replace(/[^a-zA-Z0-9]/g, '').slice(0, 18) || String(idx)
    )
      .toString('base64url')
      .slice(0, 8)}`;
    const biasSpectrum = calculateBiasSpectrum(group, sourceMap);
    const blindspot = detectClusterBlindspot(id, biasSpectrum);
    const topicTags = inferTopicTags(group);
    const latestDate = group
      .map((a) => Date.parse(a.publishedAt) || 0)
      .reduce((max, cur) => Math.max(max, cur), 0);

    const baseCluster: StoryCluster = {
      id,
      headline,
      summary: group[0]?.summary || headline,
      topicTags,
      updatedAt: latestDate
        ? new Date(latestDate).toISOString()
        : new Date().toISOString(),
      articles: group,
      biasSpectrum,
      blindspot,
    };

    baseCluster.synthesis = buildDeterministicSynthesis(baseCluster);
    return baseCluster;
  });

  clusters.sort((a, b) => {
    if (b.biasSpectrum.totalSources !== a.biasSpectrum.totalSources) {
      return b.biasSpectrum.totalSources - a.biasSpectrum.totalSources;
    }
    if (b.articles.length !== a.articles.length) {
      return b.articles.length - a.articles.length;
    }
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });

  return clusters;
}
