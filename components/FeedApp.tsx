"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import curated from "@/data/curated.json";
import type { FeedItem, FeedResponse, Kind, SourceGroup } from "@/lib/types";

const STORE = "hermes-signal-v1";
const SYNC_MS = 8 * 60 * 1000;
const TYPE_LABEL: Record<string, string> = {
  post: "Post",
  report: "Report",
  article: "Article",
  repo: "Repo",
  guide: "Guide",
};

type Filters = {
  q: string;
  source: "all" | SourceGroup;
  type: "all" | FeedItem["type"];
  kind: "all" | Kind;
  tab: "all" | "unread" | "saved";
  sort: "new" | "value" | "discuss";
  minValue: number;
  top: boolean;
};

type Note = { id: string; title: string; url: string; text: string; savedAt: number; kind?: Kind };

type Persist = {
  seen: string[];
  read: string[];
  starred: string[];
  savedNotes: Note[];
  auto: boolean;
  filters: Filters;
  banner: boolean;
  exp: boolean;
  path: string[];
  lastSync: number | null;
};

const defaultFilters = (): Filters => ({
  q: "",
  source: "all",
  type: "all",
  kind: "all",
  tab: "all",
  sort: "new",
  minValue: 0,
  top: false,
});

function sourceName(it: FeedItem) {
  if (it.sourceGroup === "hn") return "Hacker News";
  if (it.sourceGroup === "gh") return "GitHub";
  if (it.sourceGroup === "dev") return "DEV Community";
  return "Curated";
}

function timeAgo(ts: number) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function mmss(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function noteText(it: FeedItem) {
  return [
    `Hermes Agent — ${TYPE_LABEL[it.type] || "Item"}`,
    `Title: ${it.title}`,
    "",
    it.summary,
    "",
    `Why: ${it.why}`,
    `Source: ${sourceName(it)}`,
    `Kind: ${it.kind}`,
    `URL: ${it.url}`,
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}

function reproText(it: FeedItem) {
  return [`## Repro / report`, `**${it.title}**`, it.url, "", it.summary, "", `Labels: ${(it.tags || []).join(", ")}`].join("\n");
}

async function copyText(text: string) {
  try {
    if (navigator.share && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      await navigator.share({ text });
      return true;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function FeedApp() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [sources, setSources] = useState<FeedResponse["sources"] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [auto, setAuto] = useState(true);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [nextSync, setNextSync] = useState(Date.now() + SYNC_MS);
  const [now, setNow] = useState(Date.now());
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [savedNotes, setSavedNotes] = useState<Note[]>([]);
  const [drawer, setDrawer] = useState(false);
  const [banner, setBanner] = useState(true);
  const [expOpen, setExpOpen] = useState(true);
  const [pathDone, setPathDone] = useState<Set<string>>(new Set());
  const [digest, setDigest] = useState<string[]>([]);
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const seeded = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const toast = useCallback((msg: string) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE);
      if (!raw) return;
      const d = JSON.parse(raw) as Persist;
      setRead(new Set(d.read || []));
      setStarred(new Set(d.starred || []));
      setSeen(new Set(d.seen || []));
      setSavedNotes(d.savedNotes || []);
      setAuto(d.auto !== false);
      if (d.filters) setFilters({ ...defaultFilters(), ...d.filters });
      setBanner(!d.banner);
      setExpOpen(d.exp !== false);
      setPathDone(new Set(d.path || []));
      setLastSync(d.lastSync);
      seeded.current = (d.seen || []).length > 0;
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const payload: Persist = {
      seen: Array.from(seen),
      read: Array.from(read),
      starred: Array.from(starred),
      savedNotes: savedNotes.slice(0, 200),
      auto,
      filters,
      banner: !banner,
      exp: expOpen,
      path: Array.from(pathDone),
      lastSync,
    };
    try {
      localStorage.setItem(STORE, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [seen, read, starred, savedNotes, auto, filters, banner, expOpen, pathDone, lastSync]);

  const sync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/feed");
      const data = (await res.json()) as FeedResponse;
      setSources(data.sources);
      setItems((prev) => {
        const map = new Map(prev.map((i) => [i.id, i]));
        for (const it of data.items) {
          const ex = map.get(it.id);
          if (!ex) {
            map.set(it.id, { ...it, isNew: seeded.current && !seen.has(it.id) });
          } else {
            map.set(it.id, { ...ex, ...it, isNew: ex.isNew });
          }
        }
        return Array.from(map.values());
      });
      setSeen((s) => {
        const n = new Set(s);
        data.items.forEach((i) => n.add(i.id));
        return n;
      });
      seeded.current = true;
      setLastSync(Date.now());
      setNextSync(Date.now() + SYNC_MS);
    } catch {
      toast("Sync failed — retrying automatically");
      setNextSync(Date.now() + 60_000);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [seen, syncing, toast]);

  useEffect(() => {
    sync();
    fetch("/api/digest")
      .then((r) => r.json())
      .then((d) => setDigest(d.bullets || []))
      .catch(() => {});
    // initial only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!auto || document.hidden || syncing) return;
    if (now >= nextSync) sync();
  }, [now, auto, nextSync, syncing, sync]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "r") sync();
      if (e.key === "s") setDrawer(true);
      if (e.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sync]);

  const savedIds = useMemo(() => new Set(savedNotes.map((n) => n.id)), [savedNotes]);

  const list = useMemo(() => {
    let l = [...items];
    if (filters.tab === "unread") l = l.filter((i) => !read.has(i.id));
    if (filters.tab === "saved") l = l.filter((i) => savedIds.has(i.id));
    if (filters.source !== "all") l = l.filter((i) => i.sourceGroup === filters.source);
    if (filters.type !== "all") l = l.filter((i) => i.type === filters.type);
    if (filters.kind !== "all") l = l.filter((i) => i.kind === filters.kind);
    if (filters.q) {
      const q = filters.q.toLowerCase();
      l = l.filter((i) => `${i.title} ${i.summary} ${i.tags.join(" ")} ${sourceName(i)}`.toLowerCase().includes(q));
    }
    if (filters.top && l.length >= 4) {
      const th = [...l].map((i) => i.value).sort((a, b) => b - a)[Math.floor(l.length * 0.25)] || 0;
      l = l.filter((i) => i.value >= th);
    }
    if (filters.minValue > 0) l = l.filter((i) => i.value >= filters.minValue);
    if (filters.sort === "new") l.sort((a, b) => b.createdAt - a.createdAt);
    else if (filters.sort === "value") l.sort((a, b) => b.value - a.value || b.createdAt - a.createdAt);
    else l.sort((a, b) => (b.meta.comments || 0) - (a.meta.comments || 0));
    return l;
  }, [items, filters, read, savedIds]);

  function saveNote(it: FeedItem) {
    const text = noteText(it);
    copyText(text).then((ok) => toast(ok ? "Copied / shared to Notes" : "Copy failed"));
    setSavedNotes((n) => (n.some((x) => x.id === it.id) ? n : [{ id: it.id, title: it.title, url: it.url, text, savedAt: Date.now(), kind: it.kind }, ...n]));
  }

  function exportMd() {
    if (!savedNotes.length) return toast("Nothing saved yet");
    const md = `# Hermes Agent — Saved Notes\n\n${savedNotes.map((n) => `## ${n.title}\n\n${n.text}\n`).join("\n---\n\n")}`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = "hermes-agent-notes.md";
    a.click();
    toast("Markdown exported");
  }

  function exportPlaybook() {
    if (!savedNotes.length) return toast("Nothing saved yet");
    const groups: Record<string, Note[]> = {};
    for (const n of savedNotes) {
      const k = n.kind || "community";
      (groups[k] ||= []).push(n);
    }
    const md = `# Hermes playbook\n\n${Object.entries(groups)
      .map(([k, arr]) => `## ${k}\n\n${arr.map((n) => `- [${n.title}](${n.url})`).join("\n")}`)
      .join("\n\n")}\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = "hermes-playbook.md";
    a.click();
    toast("Playbook exported");
  }

  function importJson(file: File) {
    file.text().then((t) => {
      try {
        const arr = JSON.parse(t) as Note[];
        if (!Array.isArray(arr)) throw new Error("bad");
        setSavedNotes((n) => {
          const map = new Map(n.map((x) => [x.id, x]));
          arr.forEach((x) => {
            if (x?.id && x.title) map.set(x.id, x);
          });
          return Array.from(map.values());
        });
        toast("Notes imported");
      } catch {
        toast("Import failed");
      }
    });
  }

  const unread = items.filter((i) => !read.has(i.id)).length;
  const health = (k: keyof NonNullable<typeof sources>) => {
    if (syncing) return "busy";
    if (!sources) return "";
    return sources[k].ok ? "ok" : "err";
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <div className="logo" aria-hidden>
            H
          </div>
          <div>
            <h1>
              Hermes <em>Signal</em>
            </h1>
            <p>Live Hermes Agent feed · learning loop on this device</p>
          </div>
        </div>
        <div className="syncbar">
          <div className="srcs">
            <span className="src">
              <i className={`dot ${health("hn")}`} /> HN
            </span>
            <span className="src">
              <i className={`dot ${health("gh")}`} /> GH
            </span>
            <span className="src">
              <i className={`dot ${health("dev")}`} /> DEV
            </span>
          </div>
          <span className="lastsync">{lastSync ? `synced ${new Date(lastSync).toLocaleTimeString()}` : "never synced"}</span>
          <span className="countdown">{auto ? `sync ${mmss(nextSync - now)}` : "auto-sync off"}</span>
          <label className="switch" title="Auto-sync">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            <span className="knob" />
          </label>
          <button className={`iconbtn ${syncing ? "spinning" : ""}`} onClick={() => sync()} aria-label="Refresh">
            ↻
          </button>
          <button className="savedbtn" onClick={() => setDrawer(true)}>
            Saved <b>{savedNotes.length}</b>
          </button>
        </div>
      </header>

      <section className={`explainer ${expOpen ? "" : "closed"}`}>
        <button className="exp-head" onClick={() => setExpOpen(!expOpen)} aria-expanded={expOpen}>
          <span>First 15 minutes + why this feed exists</span>
          <span>{expOpen ? "▾" : "▸"}</span>
        </button>
        <div className="exp-body">
          <div className="exp-cols">
            <div className="exp-block">
              <h3>Learn faster</h3>
              <p>
                Follow the checklist once. Official docs first, then <b>one</b> user story, then one tip — not the whole internet.
              </p>
            </div>
            <div className="exp-block">
              <h3>Test less blindly</h3>
              <p>
                Filter <b>Reports</b> or kind <b>bug</b>. Copy a repro template instead of re-deriving the issue from scratch.
              </p>
            </div>
            <div className="exp-block">
              <h3>Keep a loop</h3>
              <p>
                Save to Notes, export a playbook, star what you will retry. Everything stays on this device.
              </p>
            </div>
          </div>
          <h3 className="links-title" style={{ marginBottom: 8 }}>
            First 15 minutes
          </h3>
          <div className="path">
            {curated.path.map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={pathDone.has(p.id)}
                  onChange={() =>
                    setPathDone((s) => {
                      const n = new Set(s);
                      n.has(p.id) ? n.delete(p.id) : n.add(p.id);
                      return n;
                    })
                  }
                />
                <span>
                  <a href={p.url} target="_blank" rel="noopener" style={{ color: "var(--gold)" }}>
                    {p.label}
                  </a>
                </span>
              </label>
            ))}
          </div>
          <div className="links-grid">
            {curated.links.map((l) => (
              <a key={l.url} className="linkcard" href={l.url} target="_blank" rel="noopener">
                <span>{l.emoji}</span>
                <span>
                  <span className="lc-name">
                    {l.name} <span style={{ color: "var(--gold)" }}>↗</span>
                  </span>
                  <span className="lc-desc">{l.desc}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {digest.length > 0 && (
        <div className="digest">
          <h3>This week — try / watch / skip</h3>
          <ul>
            {digest.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}

      {banner && (
        <div className="banner">
          <span>
            Keyboard: <b>/</b> search · <b>r</b> refresh · <b>s</b> saved · RSS at <b>/feed.xml</b>
          </span>
          <button onClick={() => setBanner(false)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <div className="toolbar">
        <div className="searchwrap">
          <input
            ref={searchRef}
            placeholder="Search titles, summaries, tags…"
            value={filters.q}
            onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          />
        </div>
        <div className="chiprow">
          <span className="lbl">Source</span>
          {(["all", "hn", "gh", "dev", "cur"] as const).map((s) => (
            <button key={s} className={`chip ${filters.source === s ? "active" : ""}`} onClick={() => setFilters({ ...filters, source: s })}>
              {s === "all" ? "All" : s.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="chiprow">
          <span className="lbl">Type</span>
          {(["all", "post", "report", "article", "repo", "guide"] as const).map((t) => (
            <button key={t} className={`chip ${filters.type === t ? "active" : ""}`} onClick={() => setFilters({ ...filters, type: t })}>
              {t === "all" ? "All" : TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="chiprow">
          <span className="lbl">Kind</span>
          {(["all", "setup", "skill", "bug", "use-case", "official"] as const).map((k) => (
            <button key={k} className={`chip ${filters.kind === k ? "active" : ""}`} onClick={() => setFilters({ ...filters, kind: k })}>
              {k}
            </button>
          ))}
        </div>
        <div className="controls">
          <div className="seg">
            {(
              [
                ["all", "All", items.length],
                ["unread", "Unread", unread],
                ["saved", "Saved", savedNotes.length],
              ] as const
            ).map(([tab, label, n]) => (
              <button key={tab} className={filters.tab === tab ? "active" : ""} onClick={() => setFilters({ ...filters, tab })}>
                {label} <span>{n}</span>
              </button>
            ))}
          </div>
          <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value as Filters["sort"] })}>
            <option value="new">Newest</option>
            <option value="value">Highest value</option>
            <option value="discuss">Most discussed</option>
          </select>
          <label className="slider">
            min value <input type="range" min={0} max={100} value={filters.minValue} onChange={(e) => setFilters({ ...filters, minValue: +e.target.value })} />
            <b>{filters.minValue}</b>
          </label>
          <button className={`chip ${filters.top ? "active" : ""}`} onClick={() => setFilters({ ...filters, top: !filters.top })}>
            Top quartile
          </button>
          <button className="chip" onClick={() => setFilters(defaultFilters())}>
            Clear
          </button>
        </div>
      </div>

      <div id="feed">
        {loading &&
          Array.from({ length: 5 }).map((_, i) => (
            <div className="card skel" key={i}>
              <div className="sk-line" style={{ width: "40%" }} />
              <div className="sk-line" style={{ width: "90%" }} />
              <div className="sk-line" style={{ width: "70%" }} />
            </div>
          ))}
        {!loading && list.length === 0 && (
          <div className="empty">
            <h3>Nothing here</h3>
            <p>No items match. Clear filters to see everything.</p>
            <button className="btn" onClick={() => setFilters(defaultFilters())} style={{ marginTop: 14 }}>
              Clear filters
            </button>
          </div>
        )}
        {list.map((it) => {
          const isRead = read.has(it.id);
          const isSaved = savedIds.has(it.id);
          const isStar = starred.has(it.id);
          return (
            <article key={it.id} className={`card ${isRead ? "read" : ""} ${it.isNew ? "fresh" : ""}`}>
              <div className="toprow">
                <span className={`badge src-${it.sourceGroup}`}>{sourceName(it)}</span>
                <span className="badge type">{TYPE_LABEL[it.type]}</span>
                <span className="badge kind">{it.kind}</span>
                {it.isNew && <span className="badge new">NEW</span>}
                <span className="time">{timeAgo(it.createdAt)}</span>
              </div>
              <h3 className="ctitle">
                <a
                  href={it.url}
                  target="_blank"
                  rel="noopener"
                  onClick={() =>
                    setRead((s) => {
                      const n = new Set(s);
                      n.add(it.id);
                      return n;
                    })
                  }
                >
                  {it.title}
                </a>
              </h3>
              {it.summary && <p className="csum">{it.summary}</p>}
              <p className="why">{it.why}</p>
              <div className="cmeta">
                <span>◆ value {Math.round(it.value)}</span>
                {it.author && <span>{it.author}</span>}
                {it.meta.points != null && it.sourceGroup === "hn" && <span>▲ {it.meta.points}</span>}
                {it.meta.stars != null && <span>★ {it.meta.stars}</span>}
              </div>
              {!!it.tags.length && (
                <div className="ctags">
                  {it.tags.map((t) => (
                    <span key={t}>#{t}</span>
                  ))}
                </div>
              )}
              <div className="cactions">
                <button className={`btn save ${isSaved ? "saved" : ""}`} onClick={() => saveNote(it)}>
                  {isSaved ? "Saved" : "Save to Notes"}
                </button>
                <button
                  className="btn"
                  onClick={() =>
                    setRead((s) => {
                      const n = new Set(s);
                      n.has(it.id) ? n.delete(it.id) : n.add(it.id);
                      return n;
                    })
                  }
                >
                  {isRead ? "Unread" : "Read"}
                </button>
                <button
                  className={`btn ${isStar ? "gold" : ""}`}
                  onClick={() =>
                    setStarred((s) => {
                      const n = new Set(s);
                      n.has(it.id) ? n.delete(it.id) : n.add(it.id);
                      return n;
                    })
                  }
                >
                  {isStar ? "Starred" : "Star"}
                </button>
                {(it.type === "report" || it.kind === "bug") && (
                  <button
                    className="btn"
                    onClick={() => copyText(reproText(it)).then((ok) => toast(ok ? "Repro copied" : "Copy failed"))}
                  >
                    Copy repro
                  </button>
                )}
                {it.discussUrl && (
                  <a className="btn" href={it.discussUrl} target="_blank" rel="noopener">
                    Discuss
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <footer>
        Hermes Signal · public feed for Hermes Agent · <a href="/feed.xml">RSS</a> · notes stay on this device
      </footer>

      {drawer && (
        <>
          <div id="overlay" onClick={() => setDrawer(false)} />
          <aside id="drawer" role="dialog" aria-modal>
            <div className="drawer-head">
              <h2>
                Saved <em>notes</em>
              </h2>
              <button onClick={() => setDrawer(false)} aria-label="Close">
                ×
              </button>
            </div>
            <p className="hint">
              On iPhone, Save uses the share sheet. On Mac, it copies. Export a playbook grouped by kind.
            </p>
            <div className="drawer-actions">
              <button className="btn" onClick={exportMd}>
                Export MD
              </button>
              <button className="btn" onClick={exportPlaybook}>
                Playbook
              </button>
              <button
                className="btn"
                onClick={() =>
                  copyText(savedNotes.map((n) => n.text).join("\n\n----------\n\n")).then((ok) => toast(ok ? "All copied" : "Copy failed"))
                }
              >
                Copy all
              </button>
              <label className="btn">
                Import JSON
                <input
                  type="file"
                  accept="application/json"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importJson(f);
                  }}
                />
              </label>
              <button
                className="btn del"
                onClick={() => {
                  if (confirm("Clear all saved notes?")) setSavedNotes([]);
                }}
              >
                Clear
              </button>
            </div>
            <div className="notes">
              {!savedNotes.length && (
                <div className="empty" style={{ padding: 34 }}>
                  <h3>No saved notes yet</h3>
                  <p>Tap Save to Notes on any card.</p>
                </div>
              )}
              {savedNotes.map((n) => (
                <div className="note" key={n.id}>
                  <div className="ntitle">
                    <a href={n.url} target="_blank" rel="noopener">
                      {n.title} ↗
                    </a>
                  </div>
                  <div className="nmeta">saved {timeAgo(n.savedAt)}</div>
                  <div className="cactions">
                    <button className="btn" onClick={() => copyText(n.text).then(() => toast("Copied"))}>
                      Copy
                    </button>
                    <button className="btn del" onClick={() => setSavedNotes((arr) => arr.filter((x) => x.id !== n.id))}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </>
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
