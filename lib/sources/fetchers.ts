import curated from "@/data/curated.json";
import type { FeedItem, SourceHealth } from "@/lib/types";
import { cleanText, computeValue, inferKind, whyLine } from "@/lib/score";

const FRESH_DAYS = 90;

async function getJSON<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; limited?: boolean; data: T | null }> {
  try {
    const headers = new Headers(init?.headers);
    if (!headers.has("User-Agent")) headers.set("User-Agent", "hermes-signal/1.0");
    const res = await fetch(url, { ...init, headers, next: { revalidate: 300 } });
    if (res.status === 403) return { ok: false, limited: true, data: null };
    if (!res.ok) return { ok: false, data: null };
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, data: null };
  }
}

function finish(partial: Omit<FeedItem, "value" | "kind" | "why">): FeedItem {
  const item = { ...partial, kind: inferKind(partial.title, partial.summary, partial.tags, partial.type), why: "", value: 0 };
  item.value = computeValue(item);
  item.why = whyLine(item);
  return item;
}

export function curatedItems(): FeedItem[] {
  return curated.items.map((raw) =>
    finish({
      id: raw.id,
      sourceGroup: raw.sourceGroup as FeedItem["sourceGroup"],
      type: raw.type as FeedItem["type"],
      title: raw.title,
      url: raw.url,
      author: raw.author,
      createdAt: Date.parse(raw.createdAt),
      summary: raw.summary,
      tags: raw.tags,
      meta: raw.meta,
    })
  );
}

export async function fetchHN(): Promise<{ health: SourceHealth; items: FeedItem[] }> {
  const minTs = Math.floor((Date.now() - FRESH_DAYS * 86400 * 1000) / 1000);
  const queries = ["hermes agent", "hermes-agent", "nous research hermes"];
  const hits: Array<{
    title?: string;
    objectID?: string;
    url?: string;
    author?: string;
    created_at_i?: number;
    story_text?: string;
    points?: number;
    num_comments?: number;
  }> = [];
  let ok = false;
  await Promise.all(
    queries.map(async (q) => {
      const r = await getJSON<{ hits: typeof hits }>(
        `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=25&numericFilters=created_at_i>${minTs}`
      );
      if (r.ok && r.data) {
        ok = true;
        hits.push(...(r.data.hits || []));
      }
    })
  );
  const seen = new Set<string>();
  const items: FeedItem[] = [];
  for (const h of hits) {
    if (!h?.title || !h.objectID || seen.has(h.objectID)) continue;
    const blob = `${h.title} ${h.story_text || ""}`;
    if (!/hermes/i.test(blob)) continue;
    seen.add(h.objectID);
    items.push(
      finish({
        id: `hn:${h.objectID}`,
        sourceGroup: "hn",
        type: "post",
        title: h.title,
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        discussUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
        author: h.author || "",
        createdAt: (h.created_at_i || Math.floor(Date.now() / 1000)) * 1000,
        summary: cleanText(h.story_text || "").slice(0, 400),
        tags: [],
        meta: { points: h.points || 0, comments: h.num_comments || 0 },
      })
    );
  }
  return { health: { ok, count: items.length }, items };
}

function ghHeaders(): HeadersInit {
  const h: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

export async function fetchGHRepos(): Promise<{ health: SourceHealth; items: FeedItem[] }> {
  const out: Array<{
    full_name?: string;
    html_url?: string;
    description?: string;
    updated_at?: string;
    stargazers_count?: number;
    forks_count?: number;
    topics?: string[];
    owner?: { login?: string };
  }> = [];
  let ok = false;
  let limited = false;
  for (const q of ["hermes-agent", "nous research hermes"]) {
    const r = await getJSON<{ items: typeof out }>(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=updated&order=desc&per_page=12`,
      { headers: ghHeaders() }
    );
    if (r.limited) limited = true;
    if (r.ok && r.data) {
      ok = true;
      out.push(...(r.data.items || []));
    }
  }
  const seen = new Set<string>();
  const items: FeedItem[] = [];
  for (const repo of out) {
    if (!repo?.full_name || seen.has(repo.full_name)) continue;
    if (!/hermes/i.test(`${repo.full_name} ${repo.description || ""}`)) continue;
    seen.add(repo.full_name);
    items.push(
      finish({
        id: `gh-repo:${repo.full_name}`,
        sourceGroup: "gh",
        type: "repo",
        title: repo.full_name,
        url: repo.html_url || "",
        author: repo.owner?.login || "",
        createdAt: new Date(repo.updated_at || Date.now()).getTime(),
        summary: (repo.description || "").slice(0, 400),
        tags: (repo.topics || []).slice(0, 4),
        meta: { stars: repo.stargazers_count || 0, forks: repo.forks_count || 0 },
      })
    );
  }
  return { health: { ok, limited, count: items.length }, items };
}

export async function fetchGHIssues(): Promise<{ health: SourceHealth; items: FeedItem[] }> {
  const since = new Date(Date.now() - (FRESH_DAYS + 60) * 86400 * 1000).toISOString().slice(0, 10);
  const queries = [`repo:NousResearch/hermes-agent`, `"hermes agent" in:title created:>${since}`];
  const out: Array<{
    id?: number;
    title?: string;
    html_url?: string;
    body?: string;
    created_at?: string;
    comments?: number;
    pull_request?: unknown;
    user?: { login?: string };
    labels?: Array<{ name?: string }>;
  }> = [];
  let ok = false;
  let limited = false;
  for (const q of queries) {
    const r = await getJSON<{ items: typeof out }>(
      `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&sort=created&order=desc&per_page=15`,
      { headers: ghHeaders() }
    );
    if (r.limited) limited = true;
    if (r.ok && r.data) {
      ok = true;
      out.push(...(r.data.items || []));
    }
  }
  const seen = new Set<number>();
  const items: FeedItem[] = [];
  for (const issue of out) {
    if (!issue?.id || issue.pull_request || seen.has(issue.id)) continue;
    seen.add(issue.id);
    const bug = /bug|error|crash|fail|fix|repro/i.test(`${issue.title} ${issue.body || ""}`);
    items.push(
      finish({
        id: `gh-issue:${issue.id}`,
        sourceGroup: "gh",
        type: bug ? "report" : "post",
        title: issue.title || "Untitled",
        url: issue.html_url || "",
        author: issue.user?.login || "",
        createdAt: new Date(issue.created_at || Date.now()).getTime(),
        summary: cleanText(issue.body || "").slice(0, 400),
        tags: (issue.labels || []).map((l) => l.name || "").filter(Boolean).slice(0, 4),
        meta: { comments: issue.comments || 0 },
      })
    );
  }
  return { health: { ok, limited, count: items.length }, items };
}

export async function fetchDev(): Promise<{ health: SourceHealth; items: FeedItem[] }> {
  const r = await getJSON<
    Array<{
      id?: number;
      title?: string;
      url?: string;
      description?: string;
      published_at?: string;
      tag_list?: string | string[];
      positive_reaction_count?: number;
      comments_count?: number;
      user?: { name?: string };
    }>
  >("https://dev.to/api/articles?tag=hermes&per_page=30");
  if (!r.ok || !r.data) return { health: { ok: false, count: 0 }, items: [] };
  const maxAge = (FRESH_DAYS + 80) * 86400 * 1000;
  const items: FeedItem[] = [];
  for (const a of r.data) {
    if (!a?.title || !/hermes/i.test(a.title)) continue;
    const ts = new Date(a.published_at || Date.now()).getTime();
    if (Date.now() - ts > maxAge) continue;
    const tags = Array.isArray(a.tag_list)
      ? a.tag_list
      : String(a.tag_list || "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
    const hay = `${a.title} ${a.description || ""} ${tags.join(" ")}`;
    if (!/\b(agent|nous|autonomous|self-improving|ai|llm)\b/i.test(hay)) continue;
    items.push(
      finish({
        id: `dev:${a.id}`,
        sourceGroup: "dev",
        type: "article",
        title: a.title,
        url: a.url || "",
        author: a.user?.name || "",
        createdAt: ts,
        summary: (a.description || "").slice(0, 400),
        tags: tags.slice(0, 4),
        meta: { reactions: a.positive_reaction_count || 0, comments: a.comments_count || 0 },
      })
    );
  }
  return { health: { ok: true, count: items.length }, items };
}

export async function aggregateFeed() {
  const [hn, repos, issues, dev] = await Promise.all([fetchHN(), fetchGHRepos(), fetchGHIssues(), fetchDev()]);
  const map = new Map<string, FeedItem>();
  for (const it of [...curatedItems(), ...hn.items, ...repos.items, ...issues.items, ...dev.items]) {
    const ex = map.get(it.id);
    if (!ex) map.set(it.id, it);
    else if (it.sourceGroup !== "cur") {
      ex.meta = it.meta;
      if (it.summary) ex.summary = it.summary;
      if (it.tags.length) ex.tags = it.tags;
      if (it.type === "repo" && it.createdAt > ex.createdAt) ex.createdAt = it.createdAt;
      ex.value = computeValue(ex);
    }
  }
  const items = Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt);
  const ghOk = repos.health.ok || issues.health.ok;
  return {
    items,
    sources: {
      hn: hn.health,
      gh: { ok: ghOk, limited: repos.health.limited || issues.health.limited, count: repos.health.count + issues.health.count },
      dev: dev.health,
      cur: { ok: true, count: curatedItems().length },
    },
    generatedAt: Date.now(),
  };
}
