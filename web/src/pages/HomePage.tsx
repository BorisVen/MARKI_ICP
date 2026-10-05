import { useMemo, useState } from 'react';
import type { Post } from '../api';
import { useAuth } from '../auth';
import EmptyState from '../EmptyState';
import { plural } from '../format';
import { Icon } from '../icons';
import type { PageId } from '../Shell';
import { GridSkeleton } from '../Skeleton';
import { postTitle, ProductCard, ProductModal, useCatalog } from './market';
import { needsConfirm, useMyOrders } from './OrdersPage';

const DONE = ['delivered', 'verified', 'completed', 'cancelled'];

/** Home is the marketplace: search, one status line, products. */
export default function HomePage({ onJumpTo }: { onJumpTo: (p: PageId) => void }) {
  const uid = useAuth().user?.uid;
  const { posts, loading, error, reload } = useCatalog();
  const my = useMyOrders();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [open, setOpen] = useState<Post | null>(null);

  // Only the single most important thing about the user's orders.
  const toConfirm = my.deliveries.filter(d => needsConfirm(d, uid));
  const onTheWay = my.deliveries.filter(d => d.buyerId === uid && !d.customerReceived && !DONE.includes(d.status) && !needsConfirm(d, uid));
  const status = toConfirm.length
    ? { icon: '📦', text: toConfirm.length === 1 ? `«${toConfirm[0].nftTitle}» вже поруч — підтверди отримання` : `${toConfirm.length} ${plural(toConfirm.length, 'посилка поруч', 'посилки поруч', 'посилок поруч')} — підтверди отримання`, tone: 'warn' }
    : onTheWay.length
      ? { icon: '🚚', text: `${onTheWay.length} ${plural(onTheWay.length, 'замовлення', 'замовлення', 'замовлень')} в дорозі`, tone: 'info' }
      : null;

  const tags = useMemo(() => {
    const count = new Map<string, number>();
    posts.forEach(p => p.tags?.forEach(t => count.set(t, (count.get(t) ?? 0) + 1)));
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  }, [posts]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter(p =>
      (!tag || p.tags?.includes(tag)) &&
      (!q || [postTitle(p), p.text, p.description, p.authorName, ...(p.tags ?? [])].some(v => v?.toLowerCase().includes(q))),
    );
  }, [posts, query, tag]);

  return (
    <div>
      <div className="market-head">
        <h2>Маркет</h2>
        <button className="btn" onClick={reload} title="Оновити"><Icon.Refresh /></button>
      </div>

      <div className="crm-search market-search">
        <Icon.Search />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Шукати товари й бренди" />
      </div>

      {status && (
        <button className={`status-strip ${status.tone}`} onClick={() => onJumpTo('orders')}>
          <span>{status.icon}</span>
          <span className="ss-text">{status.text}</span>
          <span className="ss-cta">→</span>
        </button>
      )}

      {tags.length > 0 && (
        <div className="chip-row market-chips">
          <button className={`chip ${!tag ? 'active' : ''}`} onClick={() => setTag(null)}>Усі</button>
          {tags.map(t => (
            <button key={t} className={`chip ${tag === t ? 'active' : ''}`} onClick={() => setTag(tag === t ? null : t)}>#{t}</button>
          ))}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <GridSkeleton count={12} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon="🛍️"
          title={query || tag ? 'Нічого не знайдено' : 'Товарів поки немає'}
          text={query || tag ? 'Спробуй інший запит або тег.' : 'Бренди скоро додадуть товари. Загляни пізніше.'}
        />
      ) : (
        <div className="product-grid">
          {shown.map(p => <ProductCard key={p.id} post={p} onOpen={() => setOpen(p)} />)}
        </div>
      )}

      {open && (
        <ProductModal
          post={open}
          onClose={() => setOpen(null)}
          onOrdered={() => { setOpen(null); onJumpTo('orders'); }}
        />
      )}
    </div>
  );
}
