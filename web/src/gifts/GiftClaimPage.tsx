import { useEffect, useState } from 'react';
import { apiClaimGift, apiGiftPreview, type GiftPreview } from '../api';
import { useAuth } from '../auth';
import Logo from '../Logo';

/** Claim page opened from a gift link or QR. Guests see the gift and sign in to take it. */
export default function GiftClaimPage({ code, onClose, onSignIn, onOpenPassports }: {
  code: string;
  onClose: () => void;
  /** Present for guests: asks the app to show the sign-in screen. */
  onSignIn?: (mode: 'login' | 'signup') => void;
  onOpenPassports: () => void;
}) {
  const { user } = useAuth();
  const [gift, setGift] = useState<GiftPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(0);

  useEffect(() => {
    apiGiftPreview(code)
      .then(setGift)
      .catch(e => setError(e?.status === 404 ? 'Подарунок не знайдено. Перевір посилання.' : 'Подарунок тимчасово недоступний. Спробуй пізніше.'));
  }, [code]);

  const claim = async (all = false) => {
    if (!user) { onSignIn?.('signup'); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await apiClaimGift(code, all);
      setClaimed(r.nfts?.length ?? 1);
    } catch (e: any) {
      setError(e?.message ?? 'Не вдалося забрати подарунок');
    } finally {
      setBusy(false);
    }
  };

  const own = !!user && gift?.ownerUsername === user.username;
  const gone = gift && (gift.status !== 'active' || gift.remaining === 0);

  return (
    <div className="public-page gift-page">
      <header className="viewer-topbar">
        <button className="btn" onClick={onClose}>← {user ? 'До застосунку' : 'Marki'}</button>
        <Logo size={24} />
        {onSignIn ? <button className="btn" onClick={() => onSignIn('login')}>Увійти</button> : <span />}
      </header>

      <div className="gift-stage">
        {!gift && !error && <div className="spinner">Відкриваємо подарунок…</div>}
        {error && !gift && <div className="verdict bad"><div className="v-seal">!</div><h2>Упс</h2><p>{error}</p></div>}

        {gift && (
          <div className="gift-box">
            <div className="gift-ribbon">🎁 Подарунок від {gift.ownerName}{gift.fromCompany && ' ✓'}</div>
            {gift.image && <img src={gift.image} alt={gift.title} className="gift-image" />}
            <h1>{gift.title}</h1>
            {gift.parts && <div className="muted" style={{ fontSize: 13, marginTop: -2, marginBottom: 6 }}>Частина {gift.part} з {gift.parts}</div>}
            {gift.message && <p className="gift-message">«{gift.message}»</p>}

            {claimed ? (
              <>
                <div className="success-banner">Готово! {claimed > 1 ? `${claimed} NFT уже` : 'NFT уже'} у твоїх паспортах.</div>
                <button className="btn btn-primary btn-block" onClick={onOpenPassports}>Відкрити мої паспорти</button>
              </>
            ) : gone ? (
              <div className="notice notice-warn">
                {gift.status === 'cancelled' ? 'Відправник скасував цей подарунок.' : 'Усі подарунки вже забрали.'}
              </div>
            ) : own ? (
              <div className="notice notice-info">
                Ти увійшов як <strong>@{user?.username}</strong> — це твій подарунок, тож забрати його не можна.
                Щоб перевірити, відкрий посилання в приватному вікні й увійди іншим акаунтом.
              </div>
            ) : (
              <>
                <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>Залишилось {gift.remaining} з {gift.total}</div>
                {error && <div className="error-banner">{error}</div>}
                <button className="btn btn-primary btn-block gift-claim-btn" onClick={() => claim(false)} disabled={busy}>
                  {busy ? 'Забираємо…' : user ? (gift.remaining > 1 ? 'Забрати 1 NFT' : 'Забрати подарунок') : 'Увійти й забрати'}
                </button>
                {user && gift.allowAll && gift.remaining > 1 && (
                  <button className="btn btn-block" style={{ marginTop: 8 }} onClick={() => claim(true)} disabled={busy}>
                    🎁 Забрати всю підколекцію ({gift.remaining})
                  </button>
                )}
                {!user && <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Реєстрація займе хвилину — NFT одразу з’явиться в паспортах.</div>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
