import { useEffect, useMemo, useRef, useState } from 'react';
import { apiLikePost, type Post } from '../api';
import { useAuth } from '../auth';
import EmptyState from '../EmptyState';
import { fmtAgo, fmtPrice, plural } from '../format';
import { Icon } from '../icons';
import type { PageId } from '../Shell';
import { GridSkeleton } from '../Skeleton';
import { postAuthor, postAvatar, postImage, postNftId, postTitle, ProductModal } from './market';
import { needsConfirm, useMyOrders } from './OrdersPage';
import { publicUrl } from '../publicUrl';
import { openProfile, PeopleRow } from '../People';
import { askPushPermission } from '../native/push';
import { cachedPosts, loadPosts, rank, rememberPost, useProgressive } from '../feed';
import { CommentsSheet, readHistory, remember } from './ReelsPage';

const DONE = ['delivered', 'verified', 'completed', 'cancelled'];
const FILTERS = [
  { id: 'all', label: 'Рекомендації' },
  { id: 'sale', label: 'На продаж' },
  { id: 'viewed', label: 'Переглянуті' },
  { id: 'mine', label: 'Мої' },
] as const;
type Filter = typeof FILTERS[number]['id'];

const openRoute = (search: string) => {
  window.history.pushState({}, '', search);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

/**
 * Marketplace (as in the Solana app): search, filters, product cards with the
 * price and «Купити». «Стрічка» — the same items as a TikTok-style feed;
 * tapping a picture opens the feed on that item.
 */
export default function HomePage({ onJumpTo, onOpenFeed }: { onJumpTo: (p: PageId) => void; onOpenFeed: (startId?: string) => void }) {
  const uid = useAuth().user?.uid;
  const my = useMyOrders();
  // Shared with the feed: shows at once when coming back, refreshes quietly.
  const [posts, setPosts] = useState<Post[] | null>(() => cachedPosts());
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [buying, setBuying] = useState<Post | null>(null);
  const [comments, setComments] = useState<Post | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const load = async () => {
    setError(null);
    try {
      setPosts(await loadPosts());
    } catch (e: any) {
      setError(e?.message ?? 'Не вдалося завантажити маркет');
      setPosts(p => p ?? []);
    }
  };
  useEffect(() => { load(); }, []);

  // A card counts as viewed once most of it was on screen (shared with the feed).
  useEffect(() => {
    const root = list.current;
    if (!root || !posts?.length) return;
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) remember((e.target as HTMLElement).dataset.id!); }),
      { threshold: 0.7 },
    );
    root.querySelectorAll('.mk-card[data-id]').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [posts, filter, query]);

  const update = (p: Post) => { rememberPost(p); setPosts(l => l?.map(x => (x.id === p.id ? p : x)) ?? null); };

  // Only the single most important thing about the user's orders.
  const toConfirm = my.deliveries.filter(d => needsConfirm(d, uid));
  const onTheWay = my.deliveries.filter(d => d.buyerId === uid && !d.customerReceived && !DONE.includes(d.status) && !needsConfirm(d, uid));
  const status = toConfirm.length
    ? { icon: '📦', text: toConfirm.length === 1 ? `«${toConfirm[0].nftTitle}» вже поруч — підтверди отримання` : `${toConfirm.length} ${plural(toConfirm.length, 'посилка поруч', 'посилки поруч', 'посилок поруч')} — підтверди отримання`, tone: 'warn' }
    : onTheWay.length
      ? { icon: '🚚', text: `${onTheWay.length} ${plural(onTheWay.length, 'замовлення', 'замовлення', 'замовлень')} в дорозі`, tone: 'info' }
      : null;

  const shown = useMemo(() => {
    if (!posts) return [];
    const q = query.trim().toLowerCase();
    const viewed = filter === 'viewed' ? readHistory() : [];
    const base = filter === 'viewed'
      ? viewed.map(id => posts.find(p => p.id === id)).filter((p): p is Post => !!p)
      : filter === 'all' ? rank(posts, uid, readHistory())
      : [...posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).filter(p => (filter === 'sale' ? p.forSale && p.price != null : p.userId === uid));
    return base.filter(p => !q || [postTitle(p), p.text, p.description, postAuthor(p), ...(p.tags ?? [])].some(v => v?.toLowerCase().includes(q)));
  }, [posts, query, filter, uid]);
  const { count, sentinel } = useProgressive(shown.length);

  return (
    <div className="mk">
      <div className="mk-head">
        <h1>Маркет<span>place</span></h1>
        <button className="mk-feed-btn" onClick={() => onOpenFeed()} aria-label="Відкрити стрічку">
          <Icon.Play size={16} /> Стрічка
        </button>
      </div>

      <div className="mk-search">
        <Icon.Search size={17} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Шукати NFT, товари, людей…" />
      </div>

      <PeopleRow query={query} />

      {status && (
        <button className={`status-strip ${status.tone}`} onClick={() => onJumpTo('orders')}>
          <span>{status.icon}</span>
          <span className="ss-text">{status.text}</span>
          <span className="ss-cta">→</span>
        </button>
      )}

      <div className="chip-row mk-chips">
        {FILTERS.map(f => (
          <button key={f.id} className={`chip ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!posts ? (
        <GridSkeleton count={6} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="🎨"
          title="Нічого не знайдено"
          text={filter === 'viewed' ? 'Тут з’являться NFT, які ви переглядали.' : filter === 'mine' ? 'Ваші пости з NFT з’являться тут.' : 'Спробуйте інший запит або фільтр.'}
        />
      ) : (
        <div className="mk-list" ref={list}>
          {shown.slice(0, count).map(p => (
            <MarketCard
              key={p.id}
              post={p}
              uid={uid}
              onChange={update}
              onFeed={() => onOpenFeed(p.id)}
              onBuy={() => setBuying(p)}
              onComments={() => setComments(p)}
            />
          ))}
        </div>
      )}

      {/* More cards load as you scroll (3 at a time). */}
      {shown.length > count && <div ref={sentinel} className="mk-more"><span className="mini-spin" /></div>}

      {buying && <ProductModal post={buying} onClose={() => setBuying(null)} onOrdered={() => { setBuying(null); onJumpTo('orders'); }} />}
      {comments && <CommentsSheet post={comments} onClose={() => setComments(null)} onChange={p => { update(p); setComments(p); }} />}
    </div>
  );
}

function MarketCard({ post, uid, onChange, onFeed, onBuy, onComments }: {
  post: Post;
  uid?: string;
  onChange: (p: Post) => void;
  onFeed: () => void;
  onBuy: () => void;
  onComments: () => void;
}) {
  const liked = !!uid && !!post.likedBy?.includes(uid);
  const forSale = !!post.forSale && post.price != null;
  const mine = post.userId === uid;
  const nftId = postNftId(post);
  const passport = nftId ? `?nft=${encodeURIComponent(nftId)}&owner=${encodeURIComponent(post.userId)}` : '';
  const images = post.nftImages?.length ? post.nftImages : [postImage(post)];

  const like = async () => {
    if (!uid) return;
    askPushPermission().catch(() => {});
    onChange({ ...post, likes: (post.likes ?? 0) + (liked ? -1 : 1), likedBy: liked ? post.likedBy?.filter(x => x !== uid) : [...(post.likedBy ?? []), uid] });
    try { onChange(await apiLikePost(post.id)); } catch { onChange(post); }
  };
  const share = async () => {
    const url = publicUrl(passport);
    if (navigator.share) { try { await navigator.share({ title: postTitle(post), url }); return; } catch { /* cancelled */ } }
    await navigator.clipboard?.writeText(url);
  };

  return (
    <article className="card mk-card" data-id={post.id}>
      <button className="mk-media" onClick={onFeed} aria-label="Відкрити у стрічці">
        {images.length > 1 ? (
          <div className={`mk-gallery n${Math.min(images.length, 4)}`}>
            {images.slice(0, 4).map((src, i) => <img key={i} src={src} alt="" loading="lazy" />)}
          </div>
        ) : (
          <img src={images[0]} alt={postTitle(post)} loading="lazy" />
        )}
        {images.length > 1 && <span className="mk-pill left">{images.length} NFT</span>}
        {forSale && <span className="mk-pill">{fmtPrice(post.price, post.currency)}</span>}
        <span className="mk-play"><Icon.Play size={14} /></span>
      </button>

      <div className="mk-body">
        <div className="mk-title">{postTitle(post)}</div>
        <button className="mk-author mk-author-btn" onClick={() => openProfile({ uid: post.userId })}>
          <span className="mk-avatar">{postAvatar(post) ? <img src={postAvatar(post)} alt="" /> : postAuthor(post).slice(0, 1).toUpperCase()}</span>
          <span>{postAuthor(post)}</span>
        </button>

        <div className="mk-price-row">
          <div>
            <div className="mk-caption">{forSale ? 'Ціна' : 'Статус'}</div>
            <div className={forSale ? 'mk-price' : 'mk-status'}>{forSale ? fmtPrice(post.price, post.currency) : 'Не продається'}</div>
          </div>
          {forSale && !mine
            ? <button className="btn btn-primary" onClick={onBuy}>Купити</button>
            : passport && <button className="btn btn-primary" onClick={() => openRoute(passport)}>Паспорт</button>}
        </div>

        <div className="mk-actions">
          <button className={liked ? 'on' : ''} onClick={like}><Icon.Heart size={16} /> {post.likes ?? 0}</button>
          <button onClick={onComments}><Icon.Comment size={16} /> {post.comments?.length ?? 0}</button>
          <button onClick={share} aria-label="Поділитися"><Icon.Share size={16} /></button>
          <span>{fmtAgo(post.createdAt)}</span>
        </div>
      </div>
    </article>
  );
}
