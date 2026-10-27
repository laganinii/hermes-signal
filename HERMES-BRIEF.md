# Brief: Ground News clone for Gaj (STRUCTURE FIRST, free models only)
Work ONLY inside /workspace/ground-news. Do NOT write app logic yet - scaffold structure, docs, types, data. Never read or print any tokens/secrets.
Goal: personal objective mobile news reader (mobile-first PWA, Next.js/Vite + Capacitor iOS-ready) where Gaj plugs in own sources (RSS, websites, X, subreddits, custom feeds).
Create:
1. Directory tree: src/lib/{ingest,clustering,blindspot,synthesizer,registry}/, src/data/, src/types/, src/app/ (screens: feed, story, sources, blindspots, settings), public/, ios/ (placeholder README), docs/, scripts/. Put a short README.md in every module folder describing its job and inputs/outputs.
2. PROJECT-STRUCTURE.md - dyslexia-friendly: short sentences, big headings, bullet lists. Explain 4 steps (Your Sources -> Story Grouping -> Bias Bar & Blindspots -> Spin-Free Summary), folder map, 4 phases:
   Phase 1 Structure (this), Phase 2 Ingest+Registry+Clustering (RSS fetch, TF-IDF cosine grouping, free LLM verify), Phase 3 Bias Bar+Blindspot (>70% one side = blindspot) + Synthesizer (Neutral Facts / How Each Side Framed It / What's Missing, OpenRouter :free via the local free proxy (put placeholder LOCAL_FREE_PROXY_URL) with rule-based fallback), Phase 4 Mobile PWA polish + Capacitor iOS + offline cache.
3. ARCHITECTURE.md - data flow diagram (ascii), module contracts, free-model policy.
4. src/types/news.ts - TS types: BiasRating ('left'|'lean-left'|'center'|'lean-right'|'right'), SourceCategory incl 'independent'|'tech'|'irish', Factuality ('high'|'mixed'|'low'), OwnershipType, NewsSource (id,name,url,feedUrl,type 'rss'|'website'|'x'|'reddit'|'custom',bias,factuality,ownership,country,enabled,userAdded), RawArticle, StoryCluster, BiasSpectrum (counts + percentages), BlindspotAlert, NeutralSynthesis.
5. src/data/default-sources.ts - typed array: RTÉ, Irish Times, TheJournal.ie, Irish Examiner, Business Post, Irish Independent, Gript, The Ditch, BBC, Reuters, AP, Guardian, Telegraph, GB News, Al Jazeera, Fox News, CNN, The Verge, Ars Technica, Hacker News, plus helper addCustomSource(). Real RSS URLs where known; mark uncertain ones with // TODO verify.
6. src/data/sources-registry.json same data as JSON.
7. ROADMAP.md with kanban-style checklist (To do / Doing / Done) per phase.
8. package.json (name ground-news, no install), tsconfig.json, .env.example (OPENROUTER_BASE_URL=the local free proxy (put placeholder LOCAL_FREE_PROXY_URL), MODEL=thinkingmachines/inkling:free).
Finish by printing the file tree.
