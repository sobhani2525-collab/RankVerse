import { NextResponse } from "next/server";

// Temporary diagnostic route: isolates whether the home page's "backend
// unreachable" failures come from Next's fetch-cache interception (the
// `next: { revalidate }` + AbortSignal.timeout combo in lib/api.ts) or from
// something about the Worker/zone environment itself. Calls the backend
// three ways and reports each outcome. Delete once the cause is found.
export async function GET() {
  const url = `${process.env.NEXT_PUBLIC_API_BASE_URL}/rankings/movies?page_size=1`;
  const results: Record<string, unknown> = { url };

  try {
    const res = await fetch(url);
    results.plain = { status: res.status, ok: res.ok };
  } catch (e) {
    results.plain = { error: String(e) };
  }

  try {
    const res = await fetch(url, { next: { revalidate: 1800 } });
    results.withRevalidate = { status: res.status, ok: res.ok };
  } catch (e) {
    results.withRevalidate = { error: String(e) };
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    results.withAbortSignal = { status: res.status, ok: res.ok };
  } catch (e) {
    results.withAbortSignal = { error: String(e) };
  }

  try {
    const res = await fetch(url, { next: { revalidate: 1800 }, signal: AbortSignal.timeout(8000) });
    results.withBoth = { status: res.status, ok: res.ok };
  } catch (e) {
    results.withBoth = { error: String(e) };
  }

  return NextResponse.json(results);
}
