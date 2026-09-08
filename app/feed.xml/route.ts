import { aggregateFeed } from "@/lib/sources/fetchers";

export const revalidate = 300;

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET() {
  const feed = await aggregateFeed();
  const items = feed.items
    .slice(0, 40)
    .map(
      (it) => `<item>
<title>${esc(it.title)}</title>
<link>${esc(it.url)}</link>
<guid>${esc(it.id)}</guid>
<pubDate>${new Date(it.createdAt).toUTCString()}</pubDate>
<description>${esc(it.summary)}</description>
</item>`
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Hermes Signal</title>
<link>/</link>
<description>Live Hermes Agent feed</description>
${items}
</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
