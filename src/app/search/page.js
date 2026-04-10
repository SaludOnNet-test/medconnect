import { redirect } from 'next/navigation';

// /search has been replaced by /search-v2.
// Redirect permanently, preserving all query params.
export default function SearchPage({ searchParams }) {
  const params = new URLSearchParams(searchParams).toString();
  redirect(`/search-v2${params ? `?${params}` : ''}`);
}
