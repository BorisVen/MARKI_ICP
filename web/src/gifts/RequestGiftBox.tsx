import { useEffect, useState } from 'react';
import { apiCreateGiftRequest, apiGiftRequests, type GiftRequest } from '../api';

const STATUS: Record<GiftRequest['status'], string> = {
  pending: '⏳ Запит надіслано — власник розгляне й видасть подарунок.',
  approved: '🎁 Подарунок видано — він у ваших паспортах.',
  declined: 'Власник відхилив запит.',
};

/** Under a gift-collection passport: ask the owner for this NFT, saying when and where you bought it. */
export default function RequestGiftBox({ ownerId, nftId, signedIn, onSignIn }: {
  ownerId: string;
  nftId: string;
  signedIn: boolean;
  onSignIn?: (mode: 'login' | 'signup') => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [sent, setSent] = useState<GiftRequest | null>(null);
  const [open, setOpen] = useState(false);
  const [boughtOn, setBoughtOn] = useState(today);
  const [boughtAt, setBoughtAt] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A request made earlier shows its status instead of the form.
  useEffect(() => {
    if (!signedIn) return;
    apiGiftRequests()
      .then(r => setSent(r.outgoing.find(x => x.nftId === nftId) ?? null))
      .catch(() => {});
  }, [signedIn, nftId]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      setSent(await apiCreateGiftRequest({ ownerId, nftId, boughtOn, boughtAt: boughtAt.trim(), comment: comment.trim() }));
    } catch (e: any) {
      setError(e?.message ?? 'Не вдалося надіслати запит');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card gift-request">
      <div className="gr-head">🎁 Подарунковий NFT</div>
      {sent && sent.status !== 'declined' ? (
        <div className={sent.status === 'approved' ? 'success-banner' : 'notice notice-info'} style={{ margin: 0 }}>{STATUS[sent.status]}</div>
      ) : !signedIn ? (
        <>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 10px' }}>Купили цей товар? Запросіть його цифровий паспорт у подарунок.</p>
          <button className="btn btn-primary btn-block" onClick={() => onSignIn?.('signup')}>Увійти й запросити подарунок</button>
        </>
      ) : !open ? (
        <>
          {sent?.status === 'declined' && <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{STATUS.declined}</div>}
          <p className="muted" style={{ fontSize: 13, margin: '0 0 10px' }}>Купили цей товар? Запросіть його цифровий паспорт — власник перевірить і видасть.</p>
          <button className="btn btn-primary btn-block" onClick={() => setOpen(true)}>Запросити отримання подарунка</button>
        </>
      ) : (
        <>
          <div className="field">
            <label>Коли купили *</label>
            <input type="date" max={today} value={boughtOn} onChange={e => setBoughtOn(e.target.value)} />
          </div>
          <div className="field">
            <label>Де купили</label>
            <input value={boughtAt} maxLength={300} onChange={e => setBoughtAt(e.target.value)} placeholder="Магазин або місто" />
          </div>
          <div className="field">
            <label>Коментар <span className="muted">(необов’язково)</span></label>
            <textarea value={comment} maxLength={300} onChange={e => setComment(e.target.value)} placeholder="Наприклад, номер чека" />
          </div>
          {error && <div className="error-banner">{error}</div>}
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="btn" onClick={() => setOpen(false)} disabled={busy}>Скасувати</button>
            <button className="btn btn-primary" onClick={send} disabled={busy || !boughtOn}>{busy ? 'Надсилаємо…' : 'Надіслати запит'}</button>
          </div>
        </>
      )}
    </div>
  );
}
