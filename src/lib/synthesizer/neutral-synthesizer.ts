import { NeutralSynthesis, RawArticle, StoryCluster } from '../../types/news';

const FREE_PROXY_BASE_URL =
  process.env.OPENROUTER_BASE_URL || 'http://127.0.0.1:4099/v1';
const FREE_MODEL_ID =
  process.env.MODEL || 'thinkingmachines/inkling:free';

const LOADED_FRAMING_WORDS = [
  'slams',
  'blasts',
  'crisis',
  'chaos',
  'furious',
  'shock',
  'outrage',
  'backlash',
  'disastrous',
  'triumph',
  'bombshell',
  'scandal',
  'regime',
  'radical',
  'far-right',
  'far-left',
  'woke',
  'elite',
  'warns',
  'accuses',
  'demands',
  'collapses',
  'soars',
  'plunges',
];

function extractFramingNotes(articles: RawArticle[], sideLabel: string): string {
  if (articles.length === 0) {
    return `No ${sideLabel} outlets in your active feed have published an article on this story yet.`;
  }

  const sources = Array.from(
    new Set(articles.map((a) => a.sourceName || a.sourceId))
  ).join(', ');

  const headlines = articles.map((a) => a.title);
  const usedLoadedWords = LOADED_FRAMING_WORDS.filter((w) =>
    articles.some((a) =>
      `${a.title} ${a.summary || ''}`.toLowerCase().includes(w)
    )
  );

  const leadHeadline = headlines[0];
  const toneNote =
    usedLoadedWords.length > 0
      ? `Uses high-urgency framing (${usedLoadedWords.slice(0, 3).join(', ')})`
      : `Focuses on direct policy/event reporting`;

  return `${sources} (${articles.length} ${
    articles.length === 1 ? 'report' : 'reports'
  }): "${leadHeadline}" — ${toneNote}.`;
}

export function buildDeterministicSynthesis(
  cluster: StoryCluster
): NeutralSynthesis {
  const articles = cluster.articles;
  const leftArticles = articles.filter(
    (a) => a.sourceBias === 'left' || a.sourceBias === 'lean-left'
  );
  const centerArticles = articles.filter(
    (a) => !a.sourceBias || a.sourceBias === 'center'
  );
  const rightArticles = articles.filter(
    (a) => a.sourceBias === 'lean-right' || a.sourceBias === 'right'
  );

  // Extract agreed neutral facts from overlapping titles & summaries stripped of spin
  const neutralFacts: string[] = [];
  const uniqueOutlets = Array.from(
    new Set(articles.map((a) => a.sourceName || a.sourceId))
  );

  neutralFacts.push(
    `Reported across ${uniqueOutlets.length} ${
      uniqueOutlets.length === 1 ? 'outlet' : 'independent outlets'
    } (${uniqueOutlets.slice(0, 5).join(', ')}): ${cluster.headline}.`
  );

  // Pull distinct factual sentences from summaries/titles
  const seenSnippets = new Set<string>();
  for (const article of articles) {
    const raw = (article.summary || article.title || '').trim();
    if (!raw || raw.length < 25) continue;
    const firstSentence = raw.split(/(?<=[.!?])\s+/)[0]?.trim() || raw;
    const normalized = firstSentence.toLowerCase().slice(0, 50);
    if (
      !seenSnippets.has(normalized) &&
      firstSentence.toLowerCase() !== cluster.headline.toLowerCase()
    ) {
      seenSnippets.add(normalized);
      neutralFacts.push(
        `${firstSentence.replace(/^[•\-–—\s]+/, '')} (${
          article.sourceName || article.sourceId
        })`
      );
    }
    if (neutralFacts.length >= 4) break;
  }

  if (neutralFacts.length === 1 && articles[0]?.summary) {
    neutralFacts.push(articles[0].summary.slice(0, 220));
  }

  const leftFrame = extractFramingNotes(leftArticles, 'Left-leaning');
  const centerFrame = extractFramingNotes(centerArticles, 'Center');
  const rightFrame = extractFramingNotes(rightArticles, 'Right-leaning');

  const whatsMissing: string[] = [];
  const { bucketCounts, totalSources } = cluster.biasSpectrum;

  if (bucketCounts.left === 0) {
    whatsMissing.push(
      'Blindspot alert: Zero Left-leaning outlets in your current feed have covered this story yet.'
    );
  }
  if (bucketCounts.right === 0) {
    whatsMissing.push(
      'Blindspot alert: Zero Right-leaning outlets in your current feed have covered this story yet.'
    );
  }
  if (bucketCounts.center === 0) {
    whatsMissing.push(
      'No Center / public-broadcaster wire report is attached to this story cluster yet.'
    );
  }

  const lowFactualityCount = articles.filter(
    (a) => a.sourceFactuality === 'mixed' || a.sourceFactuality === 'low'
  ).length;
  if (lowFactualityCount > 0 && lowFactualityCount === articles.length) {
    whatsMissing.push(
      'All current reports come from Mixed-factuality outlets; verify primary documents or wait for high-factuality wire confirmation.'
    );
  } else if (totalSources >= 2) {
    whatsMissing.push(
      'Primary source documents, full legislative/court text, or long-term fiscal/human impact data are rarely quoted in full across headline summaries.'
    );
  } else {
    whatsMissing.push(
      'Single-outlet report so far; cross-check with additional outlets before treating framing as consensus.'
    );
  }

  return {
    clusterId: cluster.id,
    neutralFacts,
    howEachSideFramed: {
      left: leftFrame,
      center: centerFrame,
      right: rightFrame,
    },
    howEachSideFramedList: [
      `Left (${bucketCounts.left}): ${leftFrame}`,
      `Center (${bucketCounts.center}): ${centerFrame}`,
      `Right (${bucketCounts.right}): ${rightFrame}`,
    ],
    whatsMissing,
    generatedBy: 'deterministic-fallback',
    generatedAt: new Date().toISOString(),
  };
}

export async function generateNeutralSynthesis(
  cluster: StoryCluster,
  options: { useLlm?: boolean; timeoutMs?: number } = {}
): Promise<NeutralSynthesis> {
  const fallback = buildDeterministicSynthesis(cluster);
  if (!options.useLlm) {
    return fallback;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 2800
    );

    const prompt = [
      'You are an objective, spin-free news analyst.',
      'Given the following headlines covering the same story across outlets with political bias ratings, return ONLY valid JSON with keys:',
      '{"neutralFacts": ["fact 1", "fact 2"], "howEachSideFramed": {"left": "...", "center": "...", "right": "..."}, "whatsMissing": ["missing context 1"]}',
      'Articles:',
      ...cluster.articles.slice(0, 8).map(
        (a) =>
          `- [${(a.sourceBias || 'center').toUpperCase()}] ${
            a.sourceName || a.sourceId
          }: ${a.title} — ${(a.summary || '').slice(0, 140)}`
      ),
    ].join('\n');

    const res = await fetch(`${FREE_PROXY_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer local-free-proxy',
      },
      body: JSON.stringify({
        model: FREE_MODEL_ID,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 350,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return fallback;
    const data = await res.json();
    const rawContent: string =
      data?.choices?.[0]?.message?.content || '';
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback;

    const parsed = JSON.parse(jsonMatch[0]);
    const neutralFacts =
      Array.isArray(parsed.neutralFacts) && parsed.neutralFacts.length > 0
        ? parsed.neutralFacts.map(String)
        : fallback.neutralFacts;
    const howEachSideFramed = {
      left:
        parsed.howEachSideFramed?.left || fallback.howEachSideFramed.left,
      center:
        parsed.howEachSideFramed?.center || fallback.howEachSideFramed.center,
      right:
        parsed.howEachSideFramed?.right || fallback.howEachSideFramed.right,
    };
    const whatsMissing =
      Array.isArray(parsed.whatsMissing) && parsed.whatsMissing.length > 0
        ? parsed.whatsMissing.map(String)
        : fallback.whatsMissing;

    return {
      clusterId: cluster.id,
      neutralFacts,
      howEachSideFramed,
      howEachSideFramedList: [
        `Left: ${howEachSideFramed.left}`,
        `Center: ${howEachSideFramed.center}`,
        `Right: ${howEachSideFramed.right}`,
      ],
      whatsMissing,
      generatedBy: 'llm-free-proxy',
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return fallback;
  }
}
