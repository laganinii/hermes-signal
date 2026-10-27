import { NextRequest, NextResponse } from 'next/server';
import { generateNeutralSynthesis } from '@/lib/synthesizer/neutral-synthesizer';
import { StoryCluster } from '@/types/news';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cluster: StoryCluster = body?.cluster;
    if (!cluster || !Array.isArray(cluster.articles)) {
      return NextResponse.json({ error: 'Invalid cluster payload' }, { status: 400 });
    }
    const synthesis = await generateNeutralSynthesis(cluster, {
      useLlm: true,
      timeoutMs: 3200,
    });
    return NextResponse.json({ synthesis });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Synthesis failed' },
      { status: 500 }
    );
  }
}
