import { NewsSource, BiasRating, Factuality, OwnershipType, SourceCategory } from '../../types/news';
import { defaultSources, addCustomSource, normalizeCustomFeedUrl } from '../../data/default-sources';
import { CatalogSource } from '../../data/source-catalog';

const STORAGE_KEY = 'ground_news_sources_v1';

export function getInitialSources(): NewsSource[] {
  if (typeof window === 'undefined') {
    return defaultSources;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSources;
    const saved: NewsSource[] = JSON.parse(raw);
    if (!Array.isArray(saved) || saved.length === 0) return defaultSources;

    // Merge default sources (with updated feed URLs) + user's enabled toggles + custom userAdded sources
    const savedMap = new Map(saved.map((s) => [s.id, s]));
    const mergedDefaults = defaultSources.map((def) => {
      const prev = savedMap.get(def.id);
      return prev ? { ...def, enabled: prev.enabled } : def;
    });
    const customOnly = saved.filter((s) => s.userAdded && !defaultSources.some((d) => d.id === s.id));
    return [...mergedDefaults, ...customOnly];
  } catch {
    return defaultSources;
  }
}

export function saveSourcesToStorage(sources: NewsSource[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
  } catch {
    // Ignore storage quota errors
  }
}

export function toggleSourceById(sources: NewsSource[], sourceId: string): NewsSource[] {
  const next = sources.map((s) => (s.id === sourceId ? { ...s, enabled: !s.enabled } : s));
  saveSourcesToStorage(next);
  return next;
}

export function toggleOrAddCatalogSource(
  sources: NewsSource[],
  catalogItem: CatalogSource
): NewsSource[] {
  const existing = sources.find(
    (s) => s.id === catalogItem.id || s.feedUrl === catalogItem.feedUrl
  );
  let next: NewsSource[];
  if (existing) {
    next = sources.map((s) =>
      s.id === existing.id ? { ...s, enabled: !s.enabled } : s
    );
  } else {
    const isDefault = defaultSources.some((d) => d.id === catalogItem.id);
    const added: NewsSource = {
      id: catalogItem.id,
      name: catalogItem.name,
      url: catalogItem.url,
      feedUrl: catalogItem.feedUrl,
      type: catalogItem.type,
      bias: catalogItem.bias,
      factuality: catalogItem.factuality,
      ownership: catalogItem.ownership,
      ownerName: catalogItem.ownerName,
      country: catalogItem.country,
      category: catalogItem.category,
      enabled: true,
      userAdded: !isDefault,
    };
    next = [...sources, added];
  }
  saveSourcesToStorage(next);
  return next;
}

export function createAndSaveCustomSource(
  sources: NewsSource[],
  input: {
    name: string;
    feedUrl: string;
    bias?: BiasRating;
    factuality?: Factuality;
    ownership?: OwnershipType;
    ownerName?: string;
    country?: string;
    category?: SourceCategory;
    type?: NewsSource['type'];
  }
): NewsSource[] {
  const cleanName = input.name.trim() || 'Custom Feed';
  const slug = cleanName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `custom-${Date.now()}`;
  const isReddit =
    input.feedUrl.includes('reddit.com/r/') ||
    input.feedUrl.trim().startsWith('r/') ||
    input.feedUrl.trim().startsWith('/r/');
  const detectedType: NewsSource['type'] = input.type || (isReddit ? 'reddit' : 'rss');
  const normalizedFeed = normalizeCustomFeedUrl(input.feedUrl, detectedType);

  let siteUrl = normalizedFeed;
  try {
    const parsed = new URL(normalizedFeed);
    siteUrl = `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    siteUrl = normalizedFeed;
  }

  const next = addCustomSource(
    {
      id: `custom-${slug}-${Date.now().toString(36).slice(-4)}`,
      name: cleanName,
      url: siteUrl,
      feedUrl: normalizedFeed,
      type: detectedType,
      bias: input.bias || 'center',
      factuality: input.factuality || 'mixed',
      ownership: input.ownership || 'independent',
      ownerName: input.ownerName || (isReddit ? 'Reddit Community' : 'User Custom Feed'),
      country: input.country || 'IE',
      category: input.category || 'custom',
      enabled: true,
    },
    sources
  );
  saveSourcesToStorage(next);
  return next;
}

export function removeCustomSource(sources: NewsSource[], sourceId: string): NewsSource[] {
  const next = sources.filter((s) => !(s.id === sourceId && s.userAdded));
  saveSourcesToStorage(next);
  return next;
}
