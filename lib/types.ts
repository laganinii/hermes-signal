export type SourceGroup = "hn" | "gh" | "dev" | "cur";
export type ItemType = "post" | "report" | "article" | "repo" | "guide";
export type Kind = "setup" | "skill" | "bug" | "use-case" | "model" | "official" | "community";

export type FeedItem = {
  id: string;
  sourceGroup: SourceGroup;
  type: ItemType;
  title: string;
  url: string;
  discussUrl?: string;
  author: string;
  createdAt: number;
  summary: string;
  tags: string[];
  kind: Kind;
  why: string;
  value: number;
  isNew?: boolean;
  meta: {
    points?: number;
    comments?: number;
    stars?: number;
    forks?: number;
    reactions?: number;
    value?: number;
  };
};

export type SourceHealth = { ok: boolean; limited?: boolean; count: number };

export type FeedResponse = {
  items: FeedItem[];
  sources: {
    hn: SourceHealth;
    gh: SourceHealth;
    dev: SourceHealth;
    cur: SourceHealth;
  };
  generatedAt: number;
};
