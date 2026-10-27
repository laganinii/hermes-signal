# Roadmap

To do / Doing / Done

## Phase 1 — Structure
- [x] Folders and READMEs
- [x] PROJECT-STRUCTURE.md
- [x] ARCHITECTURE.md
- [x] Types (`src/types/news.ts`)
- [x] Default sources + registry JSON (20/20 live RSS feeds verified)
- [x] package.json
- [x] tsconfig.json

## Phase 2 — Ingest + Registry + Clustering
- [x] Parallel RSS/Atom fetch (`src/lib/ingest/rss-fetcher.ts`)
- [x] TF-IDF cosine + named-entity grouping (`src/lib/clustering/story-clusterer.ts`)
- [x] Source registry + localStorage persistence (`src/lib/registry/source-registry.ts`)

## Phase 3 — Bias Bar + Blindspot + Synthesizer
- [x] Bias spectrum (`src/lib/blindspot/blindspot-detector.ts`)
- [x] Blindspot detector (`>=67%` one side or `0%` on opposite side)
- [x] Synthesizer with `LOCAL_FREE_PROXY_URL` (`http://127.0.0.1:4099/v1` / `thinkingmachines/inkling:free`)
- [x] Deterministic rule-based fallback (`<1ms` offline guarantee)

## Phase 4 — Mobile PWA + Capacitor iOS + Offline
- [x] Mobile-first PWA (`390x844` iPhone viewport, 4 bottom tabs: Top Stories, Blindspots, Story Drawer, My Sources)
- [x] Side-by-side Bias Comparison + Ownership & Factuality badges
- [x] Custom RSS / Reddit / Website source manager (`+ Add Source`)
