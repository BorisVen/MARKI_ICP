import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL, apiBillingCheckout, apiBillingOrders, type BillingOrder } from '../api';
import { IS_NATIVE, openInTab } from '../native/links';

const PENDING_KEY = 'marki.pendingCardOrder';

/**
 * Pays a plan on WayForPay's page. In the phone app it opens in a browser tab
 * over the app, which hands back to the app when done; on the web the page
 * itself goes to WayForPay and comes back with `?paid=`.
 */
export async function payByCard(planId: string, principal: string) {
  const back = IS_NATIVE ? new URL((import.meta.env.VITE_QR_BASE_URL as string) || 'https://borisven.github.io/MARKI_ICP/') : new URL(window.location.href);
  back.searchParams.delete('paid');
  const c = await apiBillingCheckout({ planId, principal, returnUrl: back.toString(), app: IS_NATIVE });
  // The app checks this order when the buyer comes back from the browser.
  try { localStorage.setItem(PENDING_KEY, c.orderId); } catch { /* noop */ }
  if (await openInTab(`${API_BASE_URL}/api/public/billing/pay/${encodeURIComponent(c.orderId)}`)) {
    window.dispatchEvent(new Event('marki:card-order'));
    return;
  }
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = c.url;
  form.acceptCharset = 'utf-8';
  for (const [name, value] of c.fields) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

const STATUS: Record<string, string> = {
  pending: 'очікує оплату',
  approved: 'оплачено',
  declined: 'відхилено',
  expired: 'прострочено',
  refunded: 'повернуто',
  inprocessing: 'обробляється',
};
const fmtTime = (iso: string) => new Date(iso).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Card orders with their step-by-step log. After returning from WayForPay
 * (`?paid=<order>`) it polls until the payment settles, then calls `onPaid`.
 */
export function CardOrders({ onPaid }: { onPaid: () => void }) {
  const [orders, setOrders] = useState<BillingOrder[]>([]);
  const pending = () => {
    const fromUrl = new URLSearchParams(window.location.search).get('paid');
    if (fromUrl) return fromUrl;
    try { return localStorage.getItem(PENDING_KEY); } catch { return null; }
  };
  const [waiting, setWaitingState] = useState(pending);
  const waitingRef = useRef(waiting);
  const setWaiting = (id: string | null) => { waitingRef.current = id; setWaitingState(id); };

  useEffect(() => {
    let stop = false;
    let tries = 0;
    let timer = 0;
    const load = async () => {
      window.clearTimeout(timer);
      const list = await apiBillingOrders().catch(() => null);
      if (stop || !list) return;
      setOrders(list);
      const id = waitingRef.current;
      const o = id ? list.find(x => x.id === id) : null;
      if (id && (!o || o.status === 'pending' || o.status === 'inprocessing')) {
        // Still paying (maybe in the browser tab): keep asking for a while, and again on return.
        if (tries++ < 40) timer = window.setTimeout(load, 3000);
        return;
      }
      if (id) {
        setWaiting(null);
        try { localStorage.removeItem(PENDING_KEY); } catch { /* noop */ }
        const url = new URL(window.location.href);
        url.searchParams.delete('paid');
        window.history.replaceState({}, '', url);
        if (o?.credited) onPaid();
      }
    };
    const again = () => { tries = 0; load(); };
    // Back from the payment tab, or a new payment started on this page.
    const onShow = () => { if (document.visibilityState === 'visible') again(); };
    const onNew = () => { setWaiting(pending()); again(); };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('marki:card-order', onNew);
    load();
    return () => {
      stop = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('marki:card-order', onNew);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = waiting ? orders.find(o => o.id === waiting) : null;
  return (
    <>
      {waiting && (
        <div className="progress-banner" style={{ marginBottom: 12 }}>
          <div className="mini-spin" />
          <div style={{ fontSize: 13, flex: 1 }}>Чекаємо підтвердження оплати від WayForPay… {current && `(${STATUS[current.status] ?? current.status})`}</div>
          <button className="btn" onClick={() => { setWaiting(null); try { localStorage.removeItem(PENDING_KEY); } catch { /* noop */ } }}>Сховати</button>
        </div>
      )}
      {orders.length > 0 && (
        <details className="soft" open={!!waiting}>
          <summary>Оплати карткою ({orders.length})</summary>
          {orders.map(o => (
            <div key={o.id} className="card" style={{ marginBottom: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong>{o.id}</strong>
                <span className={`badge ${o.credited ? 'badge-success' : ''}`}>
                  {o.credited ? 'тариф активовано' : STATUS[o.status] ?? o.status}{o.testMode ? ' · тест' : ''}
                </span>
              </div>
              <ul className="muted" style={{ fontSize: 12, margin: '8px 0 0', paddingLeft: 16, lineHeight: 1.6 }}>
                {o.log.map((l, i) => <li key={i}>{fmtTime(l.at)} — {l.text}</li>)}
              </ul>
            </div>
          ))}
        </details>
      )}
    </>
  );
}
