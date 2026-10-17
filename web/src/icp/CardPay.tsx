import { useEffect, useState } from 'react';
import { apiBillingCheckout, apiBillingOrders, type BillingOrder } from '../api';

const PENDING_KEY = 'marki.pendingCardOrder';
/** Inside the phone app the payment page opens in the browser: come back to the website. */
const IN_APP = window.location.hostname === 'localhost' && window.location.protocol === 'https:';

/** Sends the browser to WayForPay's payment page with the signed form. */
export async function payByCard(planId: string, principal: string) {
  const back = IN_APP ? new URL((import.meta.env.VITE_QR_BASE_URL as string) || 'https://borisven.github.io/MARKI_ICP/') : new URL(window.location.href);
  back.searchParams.delete('paid');
  const c = await apiBillingCheckout({ planId, principal, returnUrl: back.toString() });
  // The app checks this order when the buyer comes back from the browser.
  try { localStorage.setItem(PENDING_KEY, c.orderId); } catch { /* noop */ }
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
  const [waiting, setWaiting] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('paid');
    if (fromUrl) return fromUrl;
    try { return localStorage.getItem(PENDING_KEY); } catch { return null; }
  });

  useEffect(() => {
    let stop = false;
    let tries = 0;
    // Back from the browser's payment page: look again.
    const onShow = () => { if (document.visibilityState === 'visible') { tries = 0; load(); } };
    document.addEventListener('visibilitychange', onShow);
    const load = async () => {
      const list = await apiBillingOrders().catch(() => null);
      if (stop || !list) return;
      setOrders(list);
      const o = waiting ? list.find(x => x.id === waiting) : null;
      if (waiting && (!o || o.status === 'pending' || o.status === 'inprocessing')) {
        // Still paying (maybe in the browser): keep asking for a minute, then on return.
        if (tries++ < 20) setTimeout(load, 3000);
        return;
      }
      if (waiting) {
        setWaiting(null);
        try { localStorage.removeItem(PENDING_KEY); } catch { /* noop */ }
        const url = new URL(window.location.href);
        url.searchParams.delete('paid');
        window.history.replaceState({}, '', url);
        if (o?.credited) onPaid();
      }
    };
    load();
    return () => { stop = true; document.removeEventListener('visibilitychange', onShow); };
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
