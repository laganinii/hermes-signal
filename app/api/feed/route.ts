import { NextResponse } from "next/server";
import { aggregateFeed } from "@/lib/sources/fetchers";

export const revalidate = 300;

export async function GET() {
  const feed = await aggregateFeed();
  return NextResponse.json(feed, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=600" },
  });
}
