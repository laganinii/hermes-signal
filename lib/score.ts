import type { FeedItem, Kind } from "./types";

export function computeValue(it: FeedItem): number {
  const m = it.meta || {};
  if (it.sourceGroup === "hn") return (m.points || 0) + (m.comments || 0) * 1.5;
  if (it.type === "repo") return (m.stars || 0) * 0.2 + (m.forks || 0) * 0.05 + (m.value || 0);
  if (it.sourceGroup === "dev") return (m.reactions || 0) + (m.comments || 0) * 2;
  if (it.sourceGroup === "gh") return 15 + (m.comments || 0) * 8;
  return m.value || 50;
}

export function inferKind(title: string, summary: string, tags: string[], type: FeedItem["type"]): Kind {
  const hay = `${title} ${summary} ${tags.join(" ")}`.toLowerCase();
  if (/\b(bug|error|crash|fail|repro|fix|issue)\b/.test(hay) || type === "report") return "bug";
  if (/\b(skill|usecase|use-case|workflow|prompt)\b/.test(hay)) return "skill";
  if (/\b(install|setup|getting started|vps|docker|self-host)\b/.test(hay)) return "setup";
  if (/\b(model|llm|grok|claude|openai|provider)\b/.test(hay)) return "model";
  if (tags.includes("official") || type === "guide") return "official";
  if (/\b(story|community|use case)\b/.test(hay)) return "use-case";
  return "community";
}

export function whyLine(it: FeedItem): string {
  if (it.sourceGroup === "cur") return "Curated starter — high signal for learning Hermes";
  if (it.type === "report") return "Report / possible repro — useful when you are testing";
  if (it.type === "repo") return `Repo activity${it.meta.stars ? ` · ${it.meta.stars} stars` : ""}`;
  if (it.sourceGroup === "hn") return `Hacker News${it.meta.points ? ` · ${it.meta.points} points` : ""}`;
  if (it.sourceGroup === "dev") return "DEV Community article";
  return "GitHub discussion";
}

export function cleanText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
