import { useEffect, useState } from 'react';
import { apiMyGoods, type GoodsVerifyView } from '../api';
import EmptyState from '../EmptyState';
import { fmtDateTime } from '../format';
import { ListSkeleton } from '../Skeleton';
import { CATEGORY } from './labels';

/** Goods the user registered with a receipt. */
export default function MyGoodsPage({ onOpen }: { onOpen: (code: string) => void }) {
  const [items, setItems] = useState<GoodsVerifyView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiMyGoods().then(setItems).catch(e => {
      setError(e?.status === 404 ? 'Товари запрацюють після оновлення сервера.' : e?.message ?? 'Не вдалося завантажити');
      setItems([]);
    });
  }, []);

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Мої товари</h2>
          <p>Справжні товари, які ти купив(ла) й зареєстрував(ла) за чеком.</p>
        </div>
      </div>
      {error && <div className="notice notice-info">{error}</div>}
      {!items ? <ListSkeleton /> : items.length === 0 ? (
        <EmptyState
          icon="🍷"
          title="Поки порожньо"
          text="Відскануй QR на пляшці чи упаковці камерою телефону, а після покупки зареєструй товар за чеком."
        />
      ) : (
        <div className="order-list">
          {items.map(v => (
            <button key={v.code} className="card order-card gp-batch" style={{ padding: 12 }} onClick={() => onOpen(v.code)}>
              {v.product.image
                ? <img src={v.product.image} alt="" className="gift-thumb" />
                : <span style={{ fontSize: 30 }}>{CATEGORY[v.product.category]?.icon ?? '📦'}</span>}
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <strong>{v.product.name}</strong>
                <span className="muted" style={{ fontSize: 12 }}>
                  {v.product.brandName} · партія {v.lot}{v.unit && ` · № ${v.unit.serial}`}
                </span>
                <span className="muted" style={{ fontSize: 11 }}>Зареєстровано {fmtDateTime(v.unit?.claimedAt)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
