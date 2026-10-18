import { useCallback, useEffect, useRef, useState } from 'react';
import { apiDiscover, apiGetPosts, type Post } from './api';
import { postImage } from './pages/market';

/**
 * Posts shared by the marketplace and the feed: loaded once, kept for a minute,
 * so switching between them is instant (a fresh copy loads in the background).
 */
let cache: { at: number; posts: Post[] } | null = null;
let inflight: Promise<Post[]> | null = null;
const FRESH_MS = 60_000;

export function cachedPosts(): Post[] | null {
  return cache?.posts ?? null;
}

export function loadPosts(force = false): Promise<Post[]> {
  if (!force && cache && Date.now() - cache.at < FRESH_MS) return Promise.resolve(cache.posts);
  // Posts plus everyone's minted collections, so the market is never just a couple of cards.
  inflight ??= Promise.all([apiGetPosts(), apiDiscover().catch(() => [] as Post[])])
    .then(([own, found]) => {
      const posts = [...own, ...found].filter(p => postImage(p));
      cache = { at: Date.now(), posts };
      return posts;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Keeps the shared copy in step after a like or a comment. */
export function rememberPost(p: Post) {
  if (cache) cache = { ...cache, posts: cache.posts.map(x => (x.id === p.id ? p : x)) };
}

/**
 * «Рекомендації»: fresh posts first, lifted by likes and comments, things on
 * sale a bit higher, already seen ones and your own lower — instead of only
 * the newest first.
 */
export function rank(posts: Post[], uid: string | undefined, viewed: string[]): Post[] {
  const seen = new Set(viewed);
  const now = Date.now();
  const score = (p: Post) => {
    const hours = Math.max(0, (now - Date.parse(p.createdAt)) / 3_600_000);
    return 10 * Math.exp(-hours / 72)
      + 2 * Math.log1p(p.likes ?? 0)
      + 1.5 * Math.log1p(p.comments?.length ?? 0)
      + (p.forSale && p.price != null ? 1.5 : 0)
      + (p.discover ? Math.min(2, Math.log1p(p.count ?? 1) / 2) : 0)
      - (seen.has(p.id) ? 3 : 0)
      - (p.userId === uid ? 4 : 0);
  };
  return posts.map(p => [p, score(p)] as const).sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

/**
 * Renders a long list a few at a time: `count` items now, 3 more whenever the
 * `sentinel` (placed after them) comes near the screen.
 */
export function useProgressive(total: number, { step = 3, atLeast = 0, root }: { step?: number; atLeast?: number; root?: () => Element | null } = {}) {
  const [count, setCount] = useState(() => Math.max(step, atLeast));
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (atLeast > count) setCount(atLeast); }, [atLeast]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = sentinel.current;
    if (!el || count >= total) return;
    const io = new IntersectionObserver(
      entries => { if (entries.some(e => e.isIntersecting)) setCount(c => Math.min(total, c + step)); },
      { root: root?.() ?? null, rootMargin: '150% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [count, total, step, root]);
  const showMore = useCallback((n: number) => setCount(c => Math.max(c, Math.min(total, n))), [total]);
  return { count: Math.min(count, total), sentinel, showMore };
}
