import { useCallback, useEffect, useState } from 'react';
import { apiConfirmReceipt, apiListCodOrders, apiListDeliveries, type CodOrder, type Delivery } from '../api';
import { useAuth } from '../auth';
import EmptyState from '../EmptyState';
import { fmtAgo, fmtDateTime, fmtPrice } from '../format';
import { Icon } from '../icons';
import type { PageId } from '../Shell';
import { statusLabel, statusTone } from '../status';
import { ListSkeleton } from '../Skeleton';

/** Delivery statuses in the buyer's words. */
const BUYER_STATUS: Record<string, string> = {
  pending: 'Готується до відправки',
  assigned: 'Кур’єра призначено',
  picked_up: 'Забрано зі складу',
  in_transit: 'В дорозі',
  out_for_delivery: 'Кур’єр везе до тебе',
  delivered: 'Доставлено',
  verified: 'Отримано й перевірено',
  failed: 'Проблема з доставкою',
};
const buyerStatus = (s: string) => BUYER_STATUS[s] ?? statusLabel(s);

const FINISHED = new Set(['delivered', 'verified', 'completed', 'cancelled']);
/** A buyer can confirm receipt once the parcel is on its way or handed over. */
const CAN_CONFIRM = new Set(['in_transit', 'out_for_delivery', 'delivered']);

/** Only the buyer confirms receipt; a seller never sees the button on own shipments. */
export function needsConfirm(d: Delivery, uid?: string) {
  return !!uid && d.buyerId === uid && d.sellerId !== uid && CAN_CONFIRM.has(d.status) && !d.customerReceived;
}

/** Orders and deliveries where the current user is the buyer. */
export function useMyOrders() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<CodOrder[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, d] = await Promise.all([apiListCodOrders().catch(() => []), apiListDeliveries().catch(() => [])]);
      setOrders(o.filter(x => x.buyerId === user?.uid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setDeliveries(d.filter(x => x.buyerId === user?.uid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch (e: any) {
      setError(e?.message ?? 'Не вдалося завантажити замовлення');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { reload(); }, [reload]);
  return { orders, deliveries, loading, error, reload };
}

export default function OrdersPage({ onJumpTo }: { onJumpTo: (p: PageId) => void }) {
  const { orders, deliveries, loading, error, reload } = useMyOrders();
  const uid = useAuth().user?.uid;
  const [tab, setTab] = useState<'active' | 'done'>('active');

  // Orders waiting for the seller have no delivery yet.
  const waiting = orders.filter(o => o.status === 'pending');
  // Parcels to confirm first, then those on the way.
  const active = deliveries
    .filter(d => !FINISHED.has(d.status) || needsConfirm(d, uid))
    .sort((a, b) => Number(needsConfirm(b, uid)) - Number(needsConfirm(a, uid)));
  const done = deliveries.filter(d => FINISHED.has(d.status) && !needsConfirm(d, uid));
  const cancelled = orders.filter(o => o.status === 'cancelled');

  const empty = tab === 'active' ? waiting.length + active.length === 0 : done.length + cancelled.length === 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Мої замовлення</h2>
          <p>Статуси доставок і підтвердження отримання.</p>
        </div>
        <button className="btn" onClick={reload} title="Оновити"><Icon.Refresh /></button>
      </div>

      <div className="mode-tabs" role="tablist">
        <button className={`mode-tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
          Активні {waiting.length + active.length > 0 && <span className="pill">{waiting.length + active.length}</span>}
        </button>
        <button className={`mode-tab ${tab === 'done' ? 'active' : ''}`} onClick={() => setTab('done')}>Завершені</button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <ListSkeleton />
      ) : empty ? (
        <EmptyState
          icon="📦"
          title={tab === 'active' ? 'Активних замовлень немає' : 'Завершених замовлень ще немає'}
          text="Обери товар у каталозі — оплата при отриманні."
          action={<button className="btn btn-primary" onClick={() => onJumpTo('home')}>До маркетплейсу</button>}
        />
      ) : tab === 'active' ? (
        <div className="order-list">
          {active.map(d => <DeliveryCard key={d.id} delivery={d} onChanged={reload} />)}
          {waiting.map(o => <WaitingOrder key={o.id} order={o} />)}
        </div>
      ) : (
        <div className="order-list">
          {done.map(d => <DeliveryCard key={d.id} delivery={d} onChanged={reload} />)}
          {cancelled.map(o => <WaitingOrder key={o.id} order={o} />)}
        </div>
      )}
    </div>
  );
}

function WaitingOrder({ order }: { order: CodOrder }) {
  const cancelled = order.status === 'cancelled';
  return (
    <div className="card order-card">
      <div className="oc-head">
        <div>
          <div className="oc-title">{order.nftTitle}</div>
          <div className="muted" style={{ fontSize: 12 }}>Оформлено {fmtAgo(order.createdAt)} · {fmtPrice(order.price, order.nftCurrency)}</div>
        </div>
        <span className={`badge ${cancelled ? 'badge-muted' : 'badge-pending'}`}>{cancelled ? 'Скасовано' : 'Чекає продавця'}</span>
      </div>
      {!cancelled && (
        <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          Продавець ще не підтвердив замовлення. Щойно він відправить товар, тут з’явиться статус доставки.
        </div>
      )}
    </div>
  );
}

const STEPS = ['Оформлено', 'Відправлено', 'В дорозі', 'Отримано'];

function progressStep(d: Delivery): number {
  if (d.customerReceived || ['delivered', 'verified', 'completed'].includes(d.status)) return 3;
  if (['in_transit', 'out_for_delivery'].includes(d.status)) return 2;
  if (d.status === 'picked_up') return 1;
  return 0;
}

/** Four-step shipment bar, like parcel tracking in delivery apps. */
function DeliveryProgress({ delivery: d }: { delivery: Delivery }) {
  const step = progressStep(d);
  const failed = d.status === 'failed';
  return (
    <div className={`ship-progress ${failed ? 'failed' : ''}`}>
      {STEPS.map((label, i) => (
        <div key={label} className={`sp-step ${i <= step ? 'done' : ''} ${i === step ? 'current' : ''}`}>
          <span className="sp-dot">{i < step ? '✓' : i + 1}</span>
          <span className="sp-label">{label}</span>
        </div>
      ))}
    </div>
  );
}

function DeliveryCard({ delivery: d, onChanged }: { delivery: Delivery; onChanged: () => Promise<void> }) {
  const uid = useAuth().user?.uid;
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const confirm = async () => {
    if (!window.confirm('Підтвердити, що ти отримав(ла) товар? Після цього продавець отримає оплату.')) return;
    setBusy(true);
    try {
      await apiConfirmReceipt(d.id);
      await onChanged();
    } catch (e: any) {
      alert(e?.message ?? 'Не вдалося підтвердити отримання');
    } finally {
      setBusy(false);
    }
  };

  const checkpoints = [...(d.checkpoints ?? [])].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return (
    <div className={`card order-card ${needsConfirm(d, uid) ? 'attention' : ''}`}>
      <div className="oc-head">
        <div>
          <div className="oc-title">{d.nftTitle}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {d.carrierType === 'nova_poshta' ? 'Нова пошта' : 'Кур’єр продавця'}
            {d.npTrackingNumber && <> · ТТН {d.npTrackingNumber}</>}
            {' · '}оновлено {fmtAgo(d.updatedAt)}
          </div>
        </div>
        <span className={`badge ${d.customerReceived ? 'badge-success' : statusTone(d.status)}`}>
          {d.customerReceived ? 'Отримано' : buyerStatus(d.status)}
        </span>
      </div>

      <DeliveryProgress delivery={d} />

      {d.deliveryAddress && <div style={{ fontSize: 13, marginTop: 8 }}>📍 {d.deliveryAddress}</div>}

      {needsConfirm(d, uid) && (
        <div className="notice notice-info" style={{ marginTop: 12, marginBottom: 0 }}>
          Отримав(ла) товар? Підтверди отримання — так продавець знатиме, що замовлення закрито. Можна й просто перевірити NFC-мітку товару в розділі «Перевірити товар».
        </div>
      )}

      <div className="card-actions">
        {needsConfirm(d, uid) && (
          <button className="btn btn-primary" onClick={confirm} disabled={busy}>
            <Icon.Check /> {busy ? 'Підтверджуємо…' : 'Я отримав(ла) товар'}
          </button>
        )}
        {checkpoints.length > 0 && (
          <button className="btn" onClick={() => setOpen(o => !o)}>{open ? 'Сховати історію' : `Історія (${checkpoints.length})`}</button>
        )}
      </div>

      {open && (
        <div className="crm-timeline" style={{ marginTop: 12 }}>
          {checkpoints.map(c => (
            <div key={c.id} className="crm-timeline-item">
              <strong>{buyerStatus(c.status)}</strong>
              <span className="muted" style={{ fontSize: 12 }}> · {c.location} · {fmtDateTime(c.timestamp)}</span>
              {c.note && <div className="muted" style={{ fontSize: 12 }}>{c.note}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
