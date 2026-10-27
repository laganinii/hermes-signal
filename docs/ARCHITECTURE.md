# Architecture

## Data Flow (ASCII)

Your Sources (registry) --> Ingest --> Raw Articles --> Clustering --> Story Clusters --> Blindspot --> Blindspot Alerts --> Synthesizer --> Neutral Summary --> App (PWA / iOS)

## Module Contracts

- ingest: NewsSource[] -> RawArticle[]
- clustering: RawArticle[] -> StoryCluster[]
- blindspot: StoryCluster[] -> BlindspotAlert[]
- synthesizer: StoryCluster[] -> NeutralSynthesis[]
- registry: default + user sources -> NewsSource[]

## Free-Model Policy
- Only free models.
- Proxy: LOCAL_FREE_PROXY_URL placeholder.
- Model: thinkingmachines/inkling:free.
- Fallback: rule-based when LLM unavailable.
- Never spend tokens.
