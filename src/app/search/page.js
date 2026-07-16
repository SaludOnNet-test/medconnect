import { redirect } from 'next/navigation';

// /search has been replaced by /search-v2.
// Redirect permanently, preserving all query params.
//
// 2026-07-16 — searchParams is a Promise in Next 16 and must be awaited.
// Passing it straight into URLSearchParams silently produced an empty
// string on Node 24 (params were DROPPED on redirect) and crashed the
// prerender on Node 20 in CI ("Cannot convert a Symbol value to a string").
export default async function SearchPage({ searchParams }) {
  const resolved = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(resolved || {})) {
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else if (value != null) {
      params.append(key, value);
    }
  }
  const qs = params.toString();
  redirect(`/search-v2${qs ? `?${qs}` : ''}`);
}
