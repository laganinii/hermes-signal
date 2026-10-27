'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Newspaper,
  EyeOff,
  Scale,
  SlidersHorizontal,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Plus,
  Search,
  ChevronRight,
  ArrowLeft,
  ShieldCheck,
  Building2,
  Globe,
  Radio,
  Trash2,
} from 'lucide-react';
import {
  BiasRating,
  Factuality,
  NewsSource,
  OwnershipType,
  StoryCluster,
} from '@/types/news';
import { defaultSources } from '@/data/default-sources';
import { sourceCatalog, CatalogSource } from '@/data/source-catalog';
import {
  getInitialSources,
  toggleSourceById,
  createAndSaveCustomSource,
  removeCustomSource,
  toggleOrAddCatalogSource,
} from '@/lib/registry/source-registry';

type ActiveTab = 'feed' | 'blindspots' | 'story' | 'sources';

const BIAS_META: Record<
  BiasRating,
  { label: string; short: string; badgeClass: string; dotClass: string }
> = {
  left: {
    label: 'Left',
    short: 'L',
    badgeClass: 'bg-blue-600/25 text-blue-300 border-blue-500/40',
    dotClass: 'bg-blue-500',
  },
  'lean-left': {
    label: 'Lean Left',
    short: 'LL',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-400/40',
    dotClass: 'bg-sky-400',
  },
  center: {
    label: 'Center',
    short: 'C',
    badgeClass: 'bg-slate-400/20 text-slate-200 border-slate-400/40',
    dotClass: 'bg-slate-300',
  },
  'lean-right': {
    label: 'Lean Right',
    short: 'LR',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-400/40',
    dotClass: 'bg-rose-400',
  },
  right: {
    label: 'Right',
    short: 'R',
    badgeClass: 'bg-red-600/25 text-red-300 border-red-500/40',
    dotClass: 'bg-red-500',
  },
};

const FACTUALITY_META: Record<
  Factuality,
  { label: string; badgeClass: string }
> = {
  high: {
    label: 'High Factuality',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  },
  mixed: {
    label: 'Mixed Factuality',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  },
  low: {
    label: 'Low Factuality',
    badgeClass: 'bg-red-500/20 text-red-300 border-red-500/40',
  },
};

const OWNERSHIP_LABELS: Record<OwnershipType, string> = {
  'public-broadcaster': 'Public Broadcaster',
  public: 'Public',
  trust: 'Editorial Trust',
  independent: 'Independent',
  corporate: 'Corporate Media',
  private: 'Private Media',
  state: 'State-Funded',
  cooperative: 'Cooperative',
};

function BiasSpectrumBar({
  leftPct,
  centerPct,
  rightPct,
  heightClass = 'h-3',
  showLabels = true,
}: {
  leftPct: number;
  centerPct: number;
  rightPct: number;
  heightClass?: string;
  showLabels?: boolean;
}) {
  return (
    <div className="w-full">
      <div
        className={`w-full ${heightClass} rounded-full overflow-hidden flex bg-slate-800 border border-slate-700/80`}
        role="img"
        aria-label={`Bias spectrum: Left ${leftPct}%, Center ${centerPct}%, Right ${rightPct}%`}
      >
        {leftPct > 0 && (
          <div
            style={{ width: `${leftPct}%` }}
            className="bg-gradient-to-r from-blue-600 to-sky-400 transition-all duration-300"
          />
        )}
        {centerPct > 0 && (
          <div
            style={{ width: `${centerPct}%` }}
            className="bg-slate-300 transition-all duration-300"
          />
        )}
        {rightPct > 0 && (
          <div
            style={{ width: `${rightPct}%` }}
            className="bg-gradient-to-r from-rose-400 to-red-600 transition-all duration-300"
          />
        )}
      </div>
      {showLabels && (
        <div className="flex items-center justify-between text-[11px] font-semibold mt-1.5 tracking-wide">
          <span className="text-sky-400">Left {leftPct}%</span>
          <span className="text-slate-300">Center {centerPct}%</span>
          <span className="text-rose-400">Right {rightPct}%</span>
        </div>
      )}
    </div>
  );
}

export default function GroundNewsMobileApp() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('feed');
  const [sources, setSources] = useState<NewsSource[]>(defaultSources);
  const [clusters, setClusters] = useState<StoryCluster[]>([]);
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
  const [totalArticles, setTotalArticles] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(
    null
  );
  const [feedFilter, setFeedFilter] = useState<string>('multi');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [blindspotFilter, setBlindspotFilter] = useState<
    'all' | 'right-missing' | 'left-missing'
  >('all');
  const [storySideFilter, setStorySideFilter] = useState<
    'all' | 'left' | 'center' | 'right'
  >('all');
  const [sourceCategoryFilter, setSourceCategoryFilter] =
    useState<string>('all');
  const [showAddSourceModal, setShowAddSourceModal] = useState<boolean>(false);
  const [showCatalogModal, setShowCatalogModal] = useState<boolean>(false);
  const [catalogSubCategory, setCatalogSubCategory] = useState<string>('All');
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [synthesizingLlm, setSynthesizingLlm] = useState<boolean>(false);

  // Add Source Form State
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceBias, setNewSourceBias] = useState<BiasRating>('center');
  const [newSourceFactuality, setNewSourceFactuality] =
    useState<Factuality>('high');
  const [newSourceOwnership, setNewSourceOwnership] =
    useState<OwnershipType>('independent');
  const [newSourceOwnerName, setNewSourceOwnerName] = useState('');
  const [testingSource, setTestingSource] = useState(false);
  const [testSourceResult, setTestSourceResult] = useState<{
    ok?: boolean;
    count?: number;
    sampleHeadlines?: string[];
    error?: string;
  } | null>(null);

  // Check URL query param `?tab=` on mount
  useEffect(() => {
    const initial = getInitialSources();
    setSources(initial);

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab') as ActiveTab | null;
      if (
        tabParam &&
        ['feed', 'blindspots', 'story', 'sources'].includes(tabParam)
      ) {
        setActiveTab(tabParam);
      }
      if (params.get('addSource') === '1') {
        setActiveTab('sources');
        setShowAddSourceModal(true);
      }
      if (params.get('browseCatalog') === '1') {
        setActiveTab('sources');
        setShowCatalogModal(true);
      }
    }
    loadFeed(initial, false);
  }, []);

  async function loadFeed(currentSources: NewsSource[], forceRefresh = false) {
    try {
      if (forceRefresh) setRefreshing(true);
      else setLoading(true);

      const res = await fetch('/api/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sources: currentSources,
          refresh: forceRefresh,
        }),
      });
      const data = await res.json();
      if (Array.isArray(data?.clusters)) {
        setClusters(data.clusters);
        setTotalArticles(data.totalArticles || 0);
        const countsMap: Record<string, number> = {};
        for (const stat of data.sourceStats || []) {
          countsMap[stat.id] = stat.count;
        }
        setSourceCounts(countsMap);

        if (!selectedClusterId && data.clusters.length > 0) {
          const topMulti =
            data.clusters.find(
              (c: StoryCluster) => c.biasSpectrum.totalSources >= 2
            ) || data.clusters[0];
          setSelectedClusterId(topMulti.id);
        }
      }
    } catch (e) {
      console.error('Failed to load feed:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const selectedCluster = useMemo(() => {
    if (!clusters.length) return null;
    return (
      clusters.find((c) => c.id === selectedClusterId) ||
      clusters.find((c) => c.biasSpectrum.totalSources >= 2) ||
      clusters[0]
    );
  }, [clusters, selectedClusterId]);

  const filteredClusters = useMemo(() => {
    return clusters.filter((c) => {
      if (feedFilter === 'multi' && c.biasSpectrum.totalSources < 2) {
        return false;
      }
      if (feedFilter === 'ireland' && !c.topicTags.includes('Ireland')) {
        return false;
      }
      if (
        feedFilter === 'world' &&
        !c.topicTags.includes('World & Conflict') &&
        !c.topicTags.includes('US Politics') &&
        !c.topicTags.includes('UK')
      ) {
        return false;
      }
      if (feedFilter === 'tech' && !c.topicTags.includes('Tech & AI')) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inHeadline = c.headline.toLowerCase().includes(q);
        const inArticles = c.articles.some(
          (a) =>
            a.title.toLowerCase().includes(q) ||
            (a.sourceName || '').toLowerCase().includes(q)
        );
        if (!inHeadline && !inArticles) return false;
      }
      return true;
    });
  }, [clusters, feedFilter, searchQuery]);

  const blindspotClusters = useMemo(() => {
    return clusters
      .filter((c) => c.blindspot?.isBlindspot)
      .filter((c) => {
        if (blindspotFilter === 'right-missing') {
          return c.blindspot?.missingSide === 'right';
        }
        if (blindspotFilter === 'left-missing') {
          return c.blindspot?.missingSide === 'left';
        }
        return true;
      });
  }, [clusters, blindspotFilter]);

  const filteredSources = useMemo(() => {
    return sources.filter((s) => {
      if (sourceCategoryFilter === 'all') return true;
      if (sourceCategoryFilter === 'custom') return s.userAdded;
      return s.category === sourceCategoryFilter;
    });
  }, [sources, sourceCategoryFilter]);

  function openStoryDetail(cluster: StoryCluster) {
    setSelectedClusterId(cluster.id);
    setStorySideFilter('all');
    setActiveTab('story');
  }

  const filteredCatalog = useMemo(() => {
    return sourceCatalog.filter((item) => {
      if (catalogSubCategory !== 'All' && item.subCategory !== catalogSubCategory) {
        return false;
      }
      if (catalogSearch.trim()) {
        const q = catalogSearch.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          (item.ownerName || '').toLowerCase().includes(q) ||
          item.country.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [catalogSubCategory, catalogSearch]);

  function handleCatalogItemTap(item: CatalogSource) {
    const updated = toggleOrAddCatalogSource(sources, item);
    setSources(updated);
    loadFeed(updated, false);
  }

  function handleToggleSource(sourceId: string) {
    const updated = toggleSourceById(sources, sourceId);
    setSources(updated);
    loadFeed(updated, false);
  }

  async function handleTestCustomSource() {
    if (!newSourceUrl.trim()) return;
    setTestingSource(true);
    setTestSourceResult(null);
    try {
      const res = await fetch('/api/test-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSourceName || 'Custom Feed',
          feedUrl: newSourceUrl,
          bias: newSourceBias,
          factuality: newSourceFactuality,
          ownership: newSourceOwnership,
        }),
      });
      const data = await res.json();
      setTestSourceResult(data);
    } catch {
      setTestSourceResult({ ok: false, error: 'Failed to test URL' });
    } finally {
      setTestingSource(false);
    }
  }

  function handleSaveCustomSource(e: React.FormEvent) {
    e.preventDefault();
    if (!newSourceUrl.trim()) return;
    const updated = createAndSaveCustomSource(sources, {
      name: newSourceName || newSourceUrl.replace(/^https?:\/\//, '').split('/')[0],
      feedUrl: newSourceUrl,
      bias: newSourceBias,
      factuality: newSourceFactuality,
      ownership: newSourceOwnership,
      ownerName: newSourceOwnerName || 'Independent / User Added',
    });
    setSources(updated);
    setNewSourceName('');
    setNewSourceUrl('');
    setNewSourceOwnerName('');
    setTestSourceResult(null);
    setShowAddSourceModal(false);
    loadFeed(updated, true);
  }

  async function handleRunLlmSynthesis(cluster: StoryCluster) {
    setSynthesizingLlm(true);
    try {
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster }),
      });
      const data = await res.json();
      if (data?.synthesis) {
        setClusters((prev) =>
          prev.map((c) =>
            c.id === cluster.id ? { ...c, synthesis: data.synthesis } : c
          )
        );
      }
    } catch (e) {
      console.error('LLM synthesis error:', e);
    } finally {
      setSynthesizingLlm(false);
    }
  }

  const enabledSourceCount = sources.filter((s) => s.enabled).length;
  const multiSourceCount = clusters.filter(
    (c) => c.biasSpectrum.totalSources >= 2
  ).length;
  const totalBlindspotsCount = clusters.filter(
    (c) => c.blindspot?.isBlindspot
  ).length;

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-50 flex flex-col items-center">
      {/* Mobile-First Container (390px optimal iPhone width up to 480px max on desktop) */}
      <div className="w-full max-w-[440px] min-h-screen flex flex-col bg-[#090D16] border-x border-slate-800/80 pb-20">
        {/* Top App Bar */}
        <header className="sticky top-0 z-30 bg-[#090D16]/95 backdrop-blur-md border-b border-slate-800 px-4 pt-3 pb-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 via-slate-200 to-red-500 p-[1.5px] flex items-center justify-center">
                <div className="w-full h-full bg-[#090D16] rounded-[6px] flex items-center justify-center font-black text-xs tracking-tighter text-white">
                  GN
                </div>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-extrabold tracking-tight text-white">
                    GROUND NEWS
                  </h1>
                  <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    LIVE RSS
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium">
                  {enabledSourceCount} Sources • {totalArticles} Articles •{' '}
                  {multiSourceCount} Multi-Outlet Stories
                </p>
              </div>
            </div>

            <button
              onClick={() => loadFeed(sources, true)}
              disabled={refreshing || loading}
              className="p-2 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5 text-xs font-semibold"
              title="Refresh Live RSS Feeds"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  refreshing || loading ? 'animate-spin text-sky-400' : ''
                }`}
              />
              <span>Sync</span>
            </button>
          </div>
        </header>

        {/* TAB 1: TOP STORIES (FEED) */}
        {activeTab === 'feed' && (
          <main className="flex-1 px-3.5 pt-3 space-y-3">
            {/* Search & Filter Strip */}
            <div className="space-y-2.5">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search stories, outlets, or topics..."
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                {[
                  { id: 'multi', label: `Multi-Source (${multiSourceCount})` },
                  { id: 'all', label: `All (${clusters.length})` },
                  { id: 'ireland', label: '🇮🇪 Ireland' },
                  { id: 'world', label: '🌍 World' },
                  { id: 'tech', label: '💻 Tech & AI' },
                ].map((pill) => (
                  <button
                    key={pill.id}
                    onClick={() => setFeedFilter(pill.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition ${
                      feedFilter === pill.id
                        ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-sm'
                        : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Story Cards List */}
            {loading ? (
              <div className="space-y-3 py-6">
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4 animate-pulse space-y-3"
                  >
                    <div className="h-4 bg-slate-800 rounded w-1/3" />
                    <div className="h-6 bg-slate-800 rounded w-11/12" />
                    <div className="h-3 bg-slate-800 rounded w-full" />
                  </div>
                ))}
              </div>
            ) : filteredClusters.length === 0 ? (
              <div className="rounded-2xl bg-slate-900/60 border border-slate-800 p-6 text-center space-y-2 my-4">
                <p className="text-sm font-semibold text-slate-300">
                  No matching stories in this view.
                </p>
                <button
                  onClick={() => {
                    setFeedFilter('all');
                    setSearchQuery('');
                  }}
                  className="text-xs font-bold text-sky-400 underline"
                >
                  Show all {clusters.length} live stories
                </button>
              </div>
            ) : (
              <div className="space-y-3 pb-4">
                {filteredClusters.slice(0, 35).map((cluster) => {
                  const { bucketPercentages, totalSources } =
                    cluster.biasSpectrum;
                  const uniqueOutlets = Array.from(
                    new Map(
                      cluster.articles.map((a) => [
                        a.sourceId,
                        {
                          name: a.sourceName || a.sourceId,
                          bias: a.sourceBias || 'center',
                          factuality: a.sourceFactuality || 'high',
                        },
                      ])
                    ).values()
                  );

                  return (
                    <article
                      key={cluster.id}
                      onClick={() => openStoryDetail(cluster)}
                      className="rounded-2xl bg-[#111827] hover:bg-[#151e30] border border-slate-800/90 p-3.5 space-y-3 transition cursor-pointer shadow-md"
                    >
                      {/* Top Meta Row */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {cluster.topicTags.map((tag) => (
                            <span
                              key={tag}
                              className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700"
                            >
                              {tag}
                            </span>
                          ))}
                          {cluster.blindspot?.isBlindspot && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              <EyeOff className="w-3 h-3" />
                              {cluster.blindspot.missingSide === 'right'
                                ? 'Right Blindspot'
                                : 'Left Blindspot'}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 border border-sky-500/30">
                          {totalSources}{' '}
                          {totalSources === 1 ? 'Outlet' : 'Outlets'}
                        </span>
                      </div>

                      {/* Dyslexia-Friendly High-Contrast Headline */}
                      <h2 className="text-[16.5px] font-bold text-white leading-snug">
                        {cluster.headline}
                      </h2>

                      {/* Reporting Outlets Strip */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {uniqueOutlets.slice(0, 6).map((outlet) => (
                          <span
                            key={outlet.name}
                            className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-900/90 text-slate-200 border border-slate-800"
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                BIAS_META[outlet.bias].dotClass
                              }`}
                            />
                            <span>{outlet.name}</span>
                          </span>
                        ))}
                        {uniqueOutlets.length > 6 && (
                          <span className="text-[11px] font-semibold text-slate-400">
                            +{uniqueOutlets.length - 6} more
                          </span>
                        )}
                      </div>

                      {/* Left / Center / Right % Bias Bar */}
                      <div className="pt-0.5">
                        <BiasSpectrumBar
                          leftPct={bucketPercentages.left}
                          centerPct={bucketPercentages.center}
                          rightPct={bucketPercentages.right}
                        />
                      </div>

                      {/* Action Footer */}
                      <div className="pt-1 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold text-sky-400">
                        <span>Compare Spin-Free Facts & Framing</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </main>
        )}

        {/* TAB 2: BLINDSPOTS */}
        {activeTab === 'blindspots' && (
          <main className="flex-1 px-3.5 pt-3 space-y-3 pb-4">
            <div className="rounded-2xl bg-gradient-to-br from-amber-500/15 via-slate-900 to-slate-900 border border-amber-500/30 p-3.5 space-y-1.5">
              <div className="flex items-center gap-2 text-amber-300 font-extrabold text-sm">
                <EyeOff className="w-4 h-4" />
                <span>Coverage Blindspot Detector</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Stories covered by multiple outlets where either the{' '}
                <strong className="text-sky-300">Left</strong> or the{' '}
                <strong className="text-rose-300">Right</strong> has little or
                zero reporting (≥67% one-sided or 0% on the opposite side).
              </p>
            </div>

            {/* Blindspot Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {[
                {
                  id: 'all',
                  label: `All Blindspots (${totalBlindspotsCount})`,
                },
                { id: 'right-missing', label: 'Missed by Right' },
                { id: 'left-missing', label: 'Missed by Left' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setBlindspotFilter(tab.id as any)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition ${
                    blindspotFilter === tab.id
                      ? 'bg-amber-400 text-slate-950 border-amber-300'
                      : 'bg-slate-900 text-slate-300 border-slate-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {blindspotClusters.map((cluster) => {
                const { bucketPercentages, totalSources } =
                  cluster.biasSpectrum;
                const isRightBlindspot =
                  cluster.blindspot?.missingSide === 'right';

                return (
                  <article
                    key={cluster.id}
                    onClick={() => openStoryDetail(cluster)}
                    className="rounded-2xl bg-[#111827] border border-amber-500/35 p-3.5 space-y-3 cursor-pointer hover:bg-[#151e30] transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-extrabold px-2.5 py-1 rounded-lg border ${
                          isRightBlindspot
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            : 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                        }`}
                      >
                        <EyeOff className="w-3.5 h-3.5" />
                        {isRightBlindspot
                          ? 'Right Blindspot (Little/No Right Coverage)'
                          : 'Left Blindspot (Little/No Left Coverage)'}
                      </span>
                      <span className="text-xs font-bold text-slate-300">
                        {totalSources} Outlets
                      </span>
                    </div>

                    <h2 className="text-base font-bold text-white leading-snug">
                      {cluster.headline}
                    </h2>

                    <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 font-medium">
                      {cluster.blindspot?.message}
                    </p>

                    <BiasSpectrumBar
                      leftPct={bucketPercentages.left}
                      centerPct={bucketPercentages.center}
                      rightPct={bucketPercentages.right}
                    />

                    <div className="pt-1 flex items-center justify-between text-xs font-bold text-amber-300">
                      <span>Inspect Outlets & Missing Context</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </article>
                );
              })}
            </div>
          </main>
        )}

        {/* TAB 3: STORY DETAIL DRAWER / SIDE-BY-SIDE BIAS COMPARISON */}
        {activeTab === 'story' && selectedCluster && (
          <main className="flex-1 px-3.5 pt-3 space-y-3.5 pb-6">
            {/* Back button & Story switcher */}
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setActiveTab('feed')}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Top Stories</span>
              </button>

              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-sky-500/15 text-sky-300 border border-sky-500/30">
                {selectedCluster.biasSpectrum.totalSources} Reporting Outlets •{' '}
                {selectedCluster.articles.length} Articles
              </span>
            </div>

            {/* Headline & Spectrum Card */}
            <section className="rounded-2xl bg-[#111827] border border-slate-800 p-4 space-y-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                {selectedCluster.topicTags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700"
                  >
                    {tag}
                  </span>
                ))}
                {selectedCluster.blindspot?.isBlindspot && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    <EyeOff className="w-3 h-3" />
                    {selectedCluster.blindspot.message.split(':')[0]}
                  </span>
                )}
              </div>

              <h2 className="text-lg font-extrabold text-white leading-snug">
                {selectedCluster.headline}
              </h2>

              <BiasSpectrumBar
                leftPct={selectedCluster.biasSpectrum.bucketPercentages.left}
                centerPct={
                  selectedCluster.biasSpectrum.bucketPercentages.center
                }
                rightPct={selectedCluster.biasSpectrum.bucketPercentages.right}
                heightClass="h-3.5"
              />

              {/* 5-Point Bias Breakdown Pills */}
              <div className="grid grid-cols-5 gap-1 pt-1">
                {(
                  [
                    'left',
                    'lean-left',
                    'center',
                    'lean-right',
                    'right',
                  ] as BiasRating[]
                ).map((b) => (
                  <div
                    key={b}
                    className={`rounded-lg border px-1.5 py-1 text-center ${BIAS_META[b].badgeClass}`}
                  >
                    <div className="text-[10px] font-bold uppercase opacity-80">
                      {BIAS_META[b].short}
                    </div>
                    <div className="text-xs font-extrabold">
                      {selectedCluster.biasSpectrum.counts[b]}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Spin-Free Neutral Synthesis Card */}
            {selectedCluster.synthesis && (
              <section className="rounded-2xl bg-gradient-to-b from-slate-900 via-[#111827] to-[#111827] border border-sky-500/35 p-4 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    <h3 className="text-sm font-extrabold text-white tracking-tight">
                      Spin-Free Objective Synthesis
                    </h3>
                  </div>
                  <button
                    onClick={() => handleRunLlmSynthesis(selectedCluster)}
                    disabled={synthesizingLlm}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 transition"
                  >
                    {synthesizingLlm
                      ? 'Synthesizing...'
                      : selectedCluster.synthesis.generatedBy ===
                        'llm-free-proxy'
                      ? '✓ AI Verified (inkling:free)'
                      : '✨ Verify via Free LLM'}
                  </button>
                </div>

                {/* Part 1: Agreed Facts */}
                <div className="space-y-1.5">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Agreed Spin-Free Facts</span>
                  </h4>
                  <ul className="space-y-1.5 pl-1">
                    {selectedCluster.synthesis.neutralFacts.map((fact, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-slate-200 leading-relaxed flex items-start gap-2"
                      >
                        <span className="text-emerald-400 font-bold mt-0.5">
                          •
                        </span>
                        <span>{fact}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Part 2: How Left / Center / Right Framed It */}
                <div className="space-y-2 pt-1 border-t border-slate-800">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                    <Scale className="w-3.5 h-3.5" />
                    <span>How Each Side Framed It</span>
                  </h4>
                  <div className="space-y-2">
                    <div className="rounded-xl bg-blue-950/35 border border-blue-500/30 p-2.5">
                      <div className="text-[11px] font-extrabold text-sky-300 mb-0.5">
                        LEFT / LEAN-LEFT FRAMING (
                        {selectedCluster.biasSpectrum.bucketCounts.left})
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed">
                        {selectedCluster.synthesis.howEachSideFramed.left}
                      </p>
                    </div>

                    <div className="rounded-xl bg-slate-800/50 border border-slate-700 p-2.5">
                      <div className="text-[11px] font-extrabold text-slate-200 mb-0.5">
                        CENTER FRAMING (
                        {selectedCluster.biasSpectrum.bucketCounts.center})
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed">
                        {selectedCluster.synthesis.howEachSideFramed.center}
                      </p>
                    </div>

                    <div className="rounded-xl bg-rose-950/35 border border-rose-500/30 p-2.5">
                      <div className="text-[11px] font-extrabold text-rose-300 mb-0.5">
                        RIGHT / LEAN-RIGHT FRAMING (
                        {selectedCluster.biasSpectrum.bucketCounts.right})
                      </div>
                      <p className="text-xs text-slate-200 leading-relaxed">
                        {selectedCluster.synthesis.howEachSideFramed.right}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Part 3: What's Missing */}
                <div className="space-y-1.5 pt-1 border-t border-slate-800">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>What&apos;s Missing / Blindspot Notes</span>
                  </h4>
                  <ul className="space-y-1">
                    {selectedCluster.synthesis.whatsMissing.map((item, idx) => (
                      <li
                        key={idx}
                        className="text-xs text-amber-100/90 leading-relaxed flex items-start gap-2"
                      >
                        <span className="text-amber-400 font-bold">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            )}

            {/* Side-by-Side Headlines by Bias */}
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white">
                  Compare Outlet Headlines by Bias
                </h3>
              </div>

              {/* Side Filter Tabs */}
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  {
                    id: 'all',
                    label: `All (${selectedCluster.articles.length})`,
                  },
                  {
                    id: 'left',
                    label: `Left (${selectedCluster.biasSpectrum.bucketCounts.left})`,
                  },
                  {
                    id: 'center',
                    label: `Center (${selectedCluster.biasSpectrum.bucketCounts.center})`,
                  },
                  {
                    id: 'right',
                    label: `Right (${selectedCluster.biasSpectrum.bucketCounts.right})`,
                  },
                ].map((side) => (
                  <button
                    key={side.id}
                    onClick={() => setStorySideFilter(side.id as any)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-bold border transition ${
                      storySideFilter === side.id
                        ? 'bg-slate-100 text-slate-950 border-white'
                        : 'bg-slate-900 text-slate-300 border-slate-800'
                    }`}
                  >
                    {side.label}
                  </button>
                ))}
              </div>

              {/* Outlet Article Cards */}
              <div className="space-y-2.5">
                {selectedCluster.articles
                  .filter((a) => {
                    const b = a.sourceBias || 'center';
                    if (storySideFilter === 'left')
                      return b === 'left' || b === 'lean-left';
                    if (storySideFilter === 'center') return b === 'center';
                    if (storySideFilter === 'right')
                      return b === 'lean-right' || b === 'right';
                    return true;
                  })
                  .map((article) => {
                    const bias = article.sourceBias || 'center';
                    const factuality = article.sourceFactuality || 'high';
                    const ownership = article.sourceOwnership || 'private';

                    return (
                      <div
                        key={article.id}
                        className="rounded-2xl bg-[#111827] border border-slate-800 p-3.5 space-y-2.5"
                      >
                        {/* Source Header + Bias & Factuality Badges */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2.5 h-2.5 rounded-full ${BIAS_META[bias].dotClass}`}
                            />
                            <span className="text-sm font-extrabold text-white">
                              {article.sourceName || article.sourceId}
                            </span>
                            {article.sourceCountry && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                                {article.sourceCountry}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${BIAS_META[bias].badgeClass}`}
                            >
                              {BIAS_META[bias].label}
                            </span>
                            <span
                              className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border ${FACTUALITY_META[factuality].badgeClass}`}
                            >
                              {FACTUALITY_META[factuality].label}
                            </span>
                          </div>
                        </div>

                        {/* Headline */}
                        <h4 className="text-sm font-bold text-slate-100 leading-snug">
                          {article.title}
                        </h4>

                        {/* Ownership & Direct Link Row */}
                        <div className="pt-1.5 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px]">
                          <div className="flex items-center gap-1.5 text-slate-400 font-medium truncate">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">
                              {OWNERSHIP_LABELS[ownership]} •{' '}
                              {article.sourceOwnerName || ownership}
                            </span>
                          </div>

                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-bold text-sky-400 hover:text-sky-300 shrink-0"
                          >
                            <span>Read Original</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
          </main>
        )}

        {/* TAB 4: MY SOURCES MANAGER */}
        {activeTab === 'sources' && (
          <main className="flex-1 px-3.5 pt-3 space-y-3 pb-6">
            {/* Header & Discovery / Custom Feed CTAs */}
            <div className="rounded-2xl bg-[#111827] border border-slate-800 p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-extrabold text-white">
                    My RSS & Feed Sources ({enabledSourceCount}/{sources.length} Active)
                  </h2>
                  <p className="text-xs text-slate-400">
                    One-tap add from {sourceCatalog.length} verified Irish, UK, EU, US, Tech & Reddit feeds or plug in any custom URL.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCatalogModal(!showCatalogModal);
                    if (!showCatalogModal) setShowAddSourceModal(false);
                  }}
                  className={`px-3 py-2 rounded-xl font-extrabold text-xs inline-flex items-center justify-center gap-1.5 border transition shadow ${
                    showCatalogModal
                      ? 'bg-emerald-400 text-slate-950 border-emerald-300'
                      : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  <Globe className="w-4 h-4 shrink-0" />
                  <span>Browse 60+ Verified Feeds ({sourceCatalog.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddSourceModal(!showAddSourceModal);
                    if (!showAddSourceModal) setShowCatalogModal(false);
                  }}
                  className={`px-3 py-2 rounded-xl font-extrabold text-xs inline-flex items-center justify-center gap-1.5 border transition shadow ${
                    showAddSourceModal
                      ? 'bg-sky-400 text-slate-950 border-sky-300'
                      : 'bg-sky-500 hover:bg-sky-400 text-slate-950 border-sky-400'
                  }`}
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>+ Custom RSS / URL</span>
                </button>
              </div>
            </div>

            {/* One-Tap 60+ Verified Feed Discovery Catalog */}
            {showCatalogModal && (
              <section className="rounded-2xl bg-slate-900/95 border border-emerald-500/50 p-3.5 space-y-3 shadow-xl">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-extrabold text-emerald-300 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Verified Feed Discovery Catalog ({sourceCatalog.length} Outlets)</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Every feed tested live (HTTP 200 XML) with verified bias, factuality & ownership metadata.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCatalogModal(false)}
                    className="text-xs font-bold text-slate-400 hover:text-white px-2 py-1 rounded-lg bg-slate-800"
                  >
                    Done
                  </button>
                </div>

                {/* Search Catalog */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    placeholder="Search 86+ Irish, UK, EU, US, AI/Tech or Reddit feeds..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-400"
                  />
                </div>

                {/* Subcategory Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                  {[
                    { id: 'All', label: `All (${sourceCatalog.length})` },
                    { id: 'Irish National & Local', label: '🇮🇪 Irish National & Local' },
                    { id: 'UK & Europe', label: '🇬🇧🇪🇺 UK & Europe' },
                    { id: 'US & Global', label: '🌍 US & Global' },
                    { id: 'AI, Tech & Coding', label: '🤖 AI, Tech & Coding' },
                    { id: 'Science & Finance', label: '🔬 Science & Finance' },
                    { id: 'Subreddits & Communities', label: '💬 Subreddits' },
                  ].map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCatalogSubCategory(cat.id)}
                      className={`px-2.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap border transition ${
                        catalogSubCategory === cat.id
                          ? 'bg-emerald-400 text-slate-950 border-emerald-300'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Catalog Outlet Cards */}
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-0.5">
                  {filteredCatalog.map((item) => {
                    const existing = sources.find(
                      (s) => s.id === item.id || s.feedUrl === item.feedUrl
                    );
                    const isAddedAndActive = Boolean(existing?.enabled);

                    return (
                      <div
                        key={item.id}
                        className={`rounded-xl border p-3 transition ${
                          isAddedAndActive
                            ? 'bg-emerald-950/25 border-emerald-500/40'
                            : 'bg-slate-950/90 border-slate-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-extrabold text-white">
                                {item.name}
                              </span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                                {item.country}
                              </span>
                              <span
                                className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${
                                  BIAS_META[item.bias].badgeClass
                                }`}
                              >
                                {BIAS_META[item.bias].label}
                              </span>
                              <span
                                className={`text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${
                                  FACTUALITY_META[item.factuality].badgeClass
                                }`}
                              >
                                {item.factuality}
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-300 leading-snug">
                              {item.description}
                            </p>

                            <div className="text-[10px] text-slate-400 font-medium">
                              {OWNERSHIP_LABELS[item.ownership]} • {item.ownerName || item.ownership} • {item.subCategory}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleCatalogItemTap(item)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold shrink-0 border transition ${
                              isAddedAndActive
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-rose-500/20 hover:text-rose-300'
                                : 'bg-sky-500 hover:bg-sky-400 text-slate-950 border-sky-400'
                            }`}
                          >
                            {isAddedAndActive ? '✓ Active' : '+ Add Feed'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Add Custom Source Drawer / Form */}
            {showAddSourceModal && (
              <form
                onSubmit={handleSaveCustomSource}
                className="rounded-2xl bg-slate-900 border border-sky-500/50 p-4 space-y-3 shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-sky-300 flex items-center gap-1.5">
                    <Radio className="w-4 h-4" />
                    <span>Plug In Custom RSS / Reddit / Website Feed</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowAddSourceModal(false)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Close
                  </button>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={newSourceName}
                    onChange={(e) => setNewSourceName(e.target.value)}
                    placeholder="Source Name (e.g. r/ireland, Dublin Inquirer, Sky News)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500"
                    required
                  />
                  <input
                    type="text"
                    value={newSourceUrl}
                    onChange={(e) => setNewSourceUrl(e.target.value)}
                    placeholder="Feed URL or Subreddit (e.g. r/ireland or https://feeds.skynews.com/feeds/rss/home.xml)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Bias Rating
                    </label>
                    <select
                      value={newSourceBias}
                      onChange={(e) =>
                        setNewSourceBias(e.target.value as BiasRating)
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white"
                    >
                      <option value="left">Left</option>
                      <option value="lean-left">Lean Left</option>
                      <option value="center">Center</option>
                      <option value="lean-right">Lean Right</option>
                      <option value="right">Right</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Factuality
                    </label>
                    <select
                      value={newSourceFactuality}
                      onChange={(e) =>
                        setNewSourceFactuality(e.target.value as Factuality)
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white"
                    >
                      <option value="high">High</option>
                      <option value="mixed">Mixed</option>
                      <option value="low">Low</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                      Ownership
                    </label>
                    <select
                      value={newSourceOwnership}
                      onChange={(e) =>
                        setNewSourceOwnership(e.target.value as OwnershipType)
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white"
                    >
                      <option value="independent">Independent</option>
                      <option value="public-broadcaster">
                        Public Broadcaster
                      </option>
                      <option value="trust">Editorial Trust</option>
                      <option value="corporate">Corporate</option>
                      <option value="private">Private</option>
                    </select>
                  </div>
                </div>

                {testSourceResult && (
                  <div
                    className={`rounded-xl p-2.5 text-xs border ${
                      testSourceResult.ok
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                        : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                    }`}
                  >
                    {testSourceResult.ok ? (
                      <div className="space-y-1">
                        <div className="font-bold">
                          ✓ Live Feed Verified ({testSourceResult.count} sample
                          items fetched)
                        </div>
                        {testSourceResult.sampleHeadlines?.map((h, i) => (
                          <div key={i} className="text-[11px] truncate">
                            • {h}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>
                        ⚠ Could not verify XML feed ({testSourceResult.error || '0 items'}). You can still save it.
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleTestCustomSource}
                    disabled={testingSource || !newSourceUrl.trim()}
                    className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700"
                  >
                    {testingSource ? 'Testing Feed...' : 'Test Live Feed'}
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs"
                  >
                    Save & Sync Source
                  </button>
                </div>
              </form>
            )}

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {[
                { id: 'all', label: `All (${sources.length})` },
                {
                  id: 'irish',
                  label: `🇮🇪 Irish (${
                    sources.filter((s) => s.category === 'irish').length
                  })`,
                },
                {
                  id: 'world',
                  label: `🌍 World (${
                    sources.filter((s) => s.category === 'world').length
                  })`,
                },
                {
                  id: 'tech',
                  label: `💻 Tech (${
                    sources.filter((s) => s.category === 'tech').length
                  })`,
                },
                {
                  id: 'custom',
                  label: `✨ Custom (${
                    sources.filter((s) => s.userAdded).length
                  })`,
                },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSourceCategoryFilter(cat.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border transition ${
                    sourceCategoryFilter === cat.id
                      ? 'bg-sky-500 text-slate-950 border-sky-400'
                      : 'bg-slate-900 text-slate-300 border-slate-800'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Source List */}
            <div className="space-y-2.5">
              {filteredSources.map((source) => {
                const liveCount = sourceCounts[source.id] ?? 0;
                return (
                  <div
                    key={source.id}
                    className={`rounded-2xl border p-3.5 transition ${
                      source.enabled
                        ? 'bg-[#111827] border-slate-800'
                        : 'bg-slate-950/60 border-slate-900 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-extrabold text-white">
                            {source.name}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                            {source.country}
                          </span>
                          <span
                            className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                              BIAS_META[source.bias].badgeClass
                            }`}
                          >
                            {BIAS_META[source.bias].label}
                          </span>
                          <span
                            className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded border ${
                              FACTUALITY_META[source.factuality].badgeClass
                            }`}
                          >
                            {source.factuality} Factuality
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap">
                          <span>
                            {OWNERSHIP_LABELS[source.ownership]} •{' '}
                            {source.ownerName || source.ownership}
                          </span>
                          <span className="text-emerald-400 font-semibold">
                            • {liveCount} live items
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {source.userAdded && (
                          <button
                            onClick={() => {
                              const next = removeCustomSource(
                                sources,
                                source.id
                              );
                              setSources(next);
                              loadFeed(next, false);
                            }}
                            className="p-1.5 rounded-lg bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                            title="Remove custom source"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={source.enabled}
                          onClick={() => handleToggleSource(source.id)}
                          className={`w-11 h-6 rounded-full transition-colors p-0.5 ${
                            source.enabled ? 'bg-sky-500' : 'bg-slate-700'
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full bg-white transition-transform ${
                              source.enabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </main>
        )}

        {/* Bottom 4-Tab Mobile Navigation Bar */}
        <nav
          aria-label="Primary Mobile Navigation"
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[440px] z-40 bg-[#090D16]/95 backdrop-blur-md border-t border-slate-800 px-2 py-1.5 grid grid-cols-4 gap-1"
        >
          <button
            onClick={() => setActiveTab('feed')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition ${
              activeTab === 'feed'
                ? 'text-sky-400 bg-sky-500/10 font-extrabold'
                : 'text-slate-400 hover:text-slate-200 font-semibold'
            }`}
          >
            <Newspaper className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">Top Stories</span>
          </button>

          <button
            onClick={() => setActiveTab('blindspots')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition relative ${
              activeTab === 'blindspots'
                ? 'text-amber-400 bg-amber-500/10 font-extrabold'
                : 'text-slate-400 hover:text-slate-200 font-semibold'
            }`}
          >
            <EyeOff className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">Blindspots</span>
            {totalBlindspotsCount > 0 && (
              <span className="absolute top-1 right-4 text-[9px] font-black px-1.5 rounded-full bg-amber-400 text-slate-950">
                {totalBlindspotsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('story')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition ${
              activeTab === 'story'
                ? 'text-emerald-400 bg-emerald-500/10 font-extrabold'
                : 'text-slate-400 hover:text-slate-200 font-semibold'
            }`}
          >
            <Scale className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">Story Drawer</span>
          </button>

          <button
            onClick={() => setActiveTab('sources')}
            className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition ${
              activeTab === 'sources'
                ? 'text-purple-400 bg-purple-500/10 font-extrabold'
                : 'text-slate-400 hover:text-slate-200 font-semibold'
            }`}
          >
            <SlidersHorizontal className="w-5 h-5 mb-0.5" />
            <span className="text-[11px]">My Sources</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
