export type BiasRating = 'left' | 'lean-left' | 'center' | 'lean-right' | 'right';

export type BiasBucket = 'left' | 'center' | 'right';

export type SourceCategory = 'irish' | 'world' | 'tech' | 'independent' | 'custom';

export type Factuality = 'high' | 'mixed' | 'low';

export type OwnershipType =
  | 'independent'
  | 'public'
  | 'public-broadcaster'
  | 'private'
  | 'corporate'
  | 'trust'
  | 'state'
  | 'cooperative';

export interface NewsSource {
  id: string;
  name: string;
  url: string;
  feedUrl: string;
  type: 'rss' | 'website' | 'x' | 'reddit' | 'custom';
  bias: BiasRating;
  factuality: Factuality;
  ownership: OwnershipType;
  ownerName?: string;
  country: string;
  category?: SourceCategory;
  enabled: boolean;
  userAdded: boolean;
}

export interface RawArticle {
  id: string;
  sourceId: string;
  sourceName?: string;
  sourceBias?: BiasRating;
  sourceFactuality?: Factuality;
  sourceOwnership?: OwnershipType;
  sourceOwnerName?: string;
  sourceCountry?: string;
  title: string;
  url: string;
  publishedAt: string;
  summary?: string;
  content?: string;
}

export interface BiasSpectrum {
  counts: Record<BiasRating, number>;
  percentages: Record<BiasRating, number>;
  bucketCounts: {
    left: number;
    center: number;
    right: number;
  };
  bucketPercentages: {
    left: number;
    center: number;
    right: number;
  };
  totalArticles: number;
  totalSources: number;
}

export interface BlindspotAlert {
  clusterId: string;
  isBlindspot: boolean;
  dominantSide: BiasBucket | BiasRating;
  missingSide?: BiasBucket;
  sharePercent: number;
  severity: 'high' | 'moderate' | 'none';
  message: string;
}

export interface NeutralSynthesis {
  clusterId: string;
  neutralFacts: string[];
  howEachSideFramed: {
    left: string;
    center: string;
    right: string;
  };
  howEachSideFramedList: string[];
  whatsMissing: string[];
  generatedBy: 'llm-free-proxy' | 'deterministic-fallback';
  generatedAt: string;
}

export interface StoryCluster {
  id: string;
  headline: string;
  summary: string;
  topicTags: string[];
  updatedAt: string;
  articles: RawArticle[];
  biasSpectrum: BiasSpectrum;
  blindspot?: BlindspotAlert;
  synthesis?: NeutralSynthesis;
}
