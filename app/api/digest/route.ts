import { NextResponse } from "next/server";
import { aggregateFeed } from "@/lib/sources/fetchers";

export const revalidate = 21600;

type Digest = { bullets: string[]; source: "heuristic" | "grok"; generatedAt: number };

function heuristic(items: Awaited<ReturnType<typeof aggregateFeed>>["items"]): string[] {
  const top = [...items].sort((a, b) => b.value - a.value).slice(0, 3);
  const bugs = items.filter((i) => i.type === "report" || i.kind === "bug").slice(0, 2);
  const bullets = [
    ...top.map((t) => `Try: ${t.title}`),
    ...bugs.map((b) => `Watch: ${b.title}`),
  ];
  if (!bullets.length) bullets.push("Sync the feed and star anything you want to retry later.");
  return bullets.slice(0, 5);
}

async function grokDigest(items: Awaited<ReturnType<typeof aggregateFeed>>["items"]): Promise<string[] | null> {
  const key = process.env.XAI_API_KEY;
  if (!key) return null;
  const compact = items.slice(0, 25).map((i) => `- [${i.type}/${i.kind}] ${i.title}: ${i.summary.slice(0, 160)}`);
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You help someone using Hermes Agent. Return exactly 5 short bullets: what to try this week, pitfalls from reports, what to skip. No preamble.",
          },
          { role: "user", content: compact.join("\n") },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content || "";
    const lines = text
      .split("\n")
      .map((l) => l.replace(/^[-*•\d.\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 5);
    return lines.length ? lines : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const feed = await aggregateFeed();
  const grok = await grokDigest(feed.items);
  const body: Digest = {
    bullets: grok || heuristic(feed.items),
    source: grok ? "grok" : "heuristic",
    generatedAt: Date.now(),
  };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "s-maxage=21600, stale-while-revalidate=86400" },
  });
}
