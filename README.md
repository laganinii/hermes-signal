# Hermes Signal

Public live feed of **Hermes Agent** posts, GitHub activity, Hacker News, DEV Community, and curated guides — plus a personal learning loop on the device.

## Use it in 60 seconds

1. Open the site.
2. Check off **First 15 minutes** (docs → install → one story → one tip).
3. Filter **Reports** when you are testing; **Copy repro** on bug cards.
4. **Save to Notes** (iPhone share sheet / Mac clipboard). Export a playbook when the pile is useful.

Keyboard: `/` search · `r` refresh · `s` saved drawer · Esc close.

RSS: `/feed.xml`

## Local

```bash
npm install
npm run dev
```

Optional env (never commit values):

```
GITHUB_TOKEN=        # better GitHub search rate limits
XAI_API_KEY=         # Grok weekly digest at /api/digest
```

Copy `.env.example` → `.env.local`.

## Add a curated item

Edit `data/curated.json` (`items` or `links` / `path`). Redeploy.

## Deploy

Vercel (recommended — needs `/api/feed`):

```bash
npx vercel --prod
```

Set `GITHUB_TOKEN` and optionally `XAI_API_KEY` in the project env.

## What stays local

Read/unread, stars, saved notes, checklist, filters: `localStorage` only. No accounts.
