# Ground News — Project Structure

Short sentences. Big headings. Bullet lists.

## 4 Steps (What This App Does)

1. Your Sources
2. Story Grouping
3. Bias Bar & Blindspots
4. Spin-Free Summary

## Folder Map

- src/lib/ingest — fetch articles
- src/lib/clustering — group stories
- src/lib/blindspot — find blindspots
- src/lib/synthesizer — make summaries
- src/lib/registry — source list
- src/app/screens — feed, story, sources, blindspots, settings
- src/data — default sources + JSON registry
- src/types — TypeScript types
- public — PWA assets
- ios — Capacitor placeholder
- docs — this file and ARCHITECTURE.md
- scripts — build / test helpers

## 4 Phases

### Phase 1 — Structure (now)
Folders, docs, types, data, config. No logic yet.

### Phase 2 — Ingest + Registry + Clustering
- RSS fetch.
- TF-IDF cosine grouping.
- Free LLM verify.
- Registry manages sources.

### Phase 3 — Bias Bar + Blindspot + Synthesizer
- Bias Bar: >70% one side = blindspot.
- Blindspot alert shown to Gaj.
- Synthesizer: Neutral Facts / How Each Side Framed It / What's Missing.
- OpenRouter :free via local free proxy (LOCAL_FREE_PROXY_URL).
- Rule-based fallback if proxy is down.

### Phase 4 — Mobile PWA + Capacitor iOS + Offline Cache
- Mobile-first PWA.
- Capacitor iOS build.
- Offline cache for stories.
