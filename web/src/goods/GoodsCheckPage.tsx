import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { apiGoodsClaim, apiGoodsPublic, apiGoodsVerify, type GoodsVerifyView } from '../api';
import { useAuth } from '../auth';
import { fmtDateTime } from '../format';
import Logo from '../Logo';
import { CATEGORY, EVENT, STAGE } from './labels';

/** Reads the first QR code in a photo (the fiscal receipt). */
async function readQrFromPhoto(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file);
  // Large phone photos are scaled down: faster, and jsQR copes better.
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

/** Public check page opened from a product QR (`?v=CODE`). */
export default function GoodsCheckPage({ code, onClose, onSignIn }: {
  code: string;
  onClose: () => void;
  /** Present for guests: asks the app to show the sign-in screen. */
  onSignIn?: (mode: 'login' | 'signup') => void;
}) {
  const { user } = useAuth();
  const [view, setView] = useState<GoodsVerifyView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    (user ? apiGoodsVerify(code) : apiGoodsPublic(code))
      .then(setView)
      .catch(e => setError(e?.status === 404 ? 'Такого коду немає в Marki. Можливо, це підробка або код пошкоджено.' : 'Не вдалося перевірити. Спробуй пізніше.'));
  }, [code, user]);

  const ok = view && view.warnings.length === 0;

  return (
    <div className="viewer-wrap">
      <header className="viewer-topbar">
        <button className="btn" onClick={onClose}>← {onSignIn ? 'Marki' : 'До застосунку'}</button>
        <Logo size={24} />
        {onSignIn ? <button className="btn" onClick={() => onSignIn('login')}>Увійти</button> : <span />}
      </header>

      <div className="viewer-content goods-check">
        {!view && !error && <div className="spinner">Перевіряємо товар…</div>}
        {error && (
          <div className="verdict bad" style={{ margin: '40px auto' }}>
            <div className="v-seal">!</div>
            <h2>Не підтверджено</h2>
            <p>{error}</p>
          </div>
        )}

        {view && (
          <>
            <div className={`verdict ${ok ? 'good' : 'bad'}`}>
              <div className="v-seal">{ok ? '✓' : '!'}</div>
              <h2>{ok ? 'Оригінал' : 'Будьте уважні'}</h2>
              <p>{ok ? `Товар зареєстровано виробником ${view.product.brandName} у Marki.` : 'Код справжній, але є застереження:'}</p>
              {!ok && <ul className="gc-warnings">{view.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
            </div>

            <div className="card gc-product">
              {view.product.image
                ? <img src={view.product.image} alt={view.product.name} />
                : <div className="gc-icon">{CATEGORY[view.product.category]?.icon ?? '📦'}</div>}
              <div>
                <div className="muted" style={{ fontSize: 12 }}>{CATEGORY[view.product.category]?.label}</div>
                <h1 className="viewer-title" style={{ margin: '2px 0 4px' }}>{view.product.name}</h1>
                <div style={{ fontSize: 14 }}>
                  {view.product.brandName} {view.brandVerified && <span className="badge badge-success">перевірений виробник</span>}
                </div>
              </div>
            </div>

            {view.unit?.mine && (
              <div className="success-banner">Це ваш товар · зареєстровано {fmtDateTime(view.unit.claimedAt)}</div>
            )}

            <div className="card">
              {view.unit && <div className="md-row"><span className="muted">Одиниця</span><strong>№ {view.unit.serial} з {view.batchSize}</strong></div>}
              <div className="md-row"><span className="muted">Партія</span><span>{view.lot}</span></div>
              <div className="md-row"><span className="muted">Статус</span><span>{view.unit?.claimed ? 'Продано' : STAGE[view.stage]}</span></div>
              {view.producedAt && <div className="md-row"><span className="muted">{view.product.category === 'wine' || view.product.category === 'spirits' ? 'Розлито' : 'Вироблено'}</span><span>{view.producedAt}</span></div>}
              {view.expiresAt && <div className="md-row"><span className="muted">Придатний до</span><span>{view.expiresAt}</span></div>}
              {Object.entries({ ...view.product.attributes, ...view.attributes }).map(([k, v]) => (
                <div key={k} className="md-row"><span className="muted">{k}</span><span>{v}</span></div>
              ))}
              {view.product.description && <p style={{ fontSize: 14, margin: '10px 0 0' }}>{view.product.description}</p>}
            </div>

            {view.unit && !view.unit.claimed && (
              <ClaimBox code={view.code} signedIn={!!user} onSignIn={onSignIn} onClaimed={setView} />
            )}

            <h3 style={{ margin: '20px 0 8px' }}>Шлях товару</h3>
            <div className="card passport-timeline">
              {[...view.events].reverse().map((ev, i) => (
                <div key={i} className="pt-item">
                  <span className="pt-icon">{EVENT[ev.kind]?.icon ?? '•'}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{EVENT[ev.kind]?.label ?? ev.kind}{ev.location && ` · ${ev.location}`}</div>
                    {ev.note && <div style={{ fontSize: 13 }}>{ev.note}</div>}
                    <div className="muted" style={{ fontSize: 11 }}>{fmtDateTime(ev.at)} · {ev.actorName}</div>
                  </div>
                </div>
              ))}
              {view.unit?.claimed && (
                <div className="pt-item">
                  <span className="pt-icon">🧾</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Продано й зареєстровано покупцем</div>
                    <div className="muted" style={{ fontSize: 11 }}>{fmtDateTime(view.unit.claimedAt)}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="muted" style={{ fontSize: 11, textAlign: 'center', margin: '16px 0' }}>
              Код {view.code} · перевірено {view.scans} {view.scans === 1 ? 'раз' : 'разів'}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** "I bought it": the buyer photographs the fiscal receipt QR to register the item. */
function ClaimBox({ code, signedIn, onSignIn, onClaimed }: {
  code: string;
  signedIn: boolean;
  onSignIn?: (mode: 'login' | 'signup') => void;
  onClaimed: (v: GoodsVerifyView) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [link, setLink] = useState('');

  const claim = async (receipt: string) => {
    setBusy(true);
    setError(null);
    try {
      onClaimed(await apiGoodsClaim(code, receipt));
    } catch (e: any) {
      setError(e?.message ?? 'Не вдалося зареєструвати');
    } finally {
      setBusy(false);
    }
  };

  const onPhoto = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    const text = await readQrFromPhoto(file).catch(() => null);
    setBusy(false);
    if (!text) {
      setError('Не бачу QR-коду на фото. Сфотографуй низ чека ближче, щоб QR був чітким.');
      return;
    }
    await claim(text);
  };

  return (
    <div className="card gc-claim">
      <h3 style={{ margin: '0 0 4px' }}>🧾 Купили? Зареєструйте товар</h3>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
        Сфотографуйте QR-код на касовому чеку. Товар стане вашим у Marki, а всі, хто відсканує цей код пізніше, побачать, що його вже продано.
      </p>
      {error && <div className="error-banner">{error}</div>}
      {!signedIn ? (
        <button className="btn btn-primary btn-block" onClick={() => onSignIn?.('signup')}>Увійти й зареєструвати</button>
      ) : (
        <>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={e => onPhoto(e.target.files?.[0])} />
          <button className="btn btn-primary btn-block" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Перевіряємо чек…' : '📷 Сфотографувати чек'}
          </button>
          {!manual ? (
            <button className="btn btn-block" style={{ marginTop: 8 }} onClick={() => setManual(true)}>Вставити посилання з QR чека</button>
          ) : (
            <div className="field" style={{ marginTop: 10 }}>
              <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://cabinet.tax.gov.ua/cashregs/check?…" />
              <button className="btn btn-block" style={{ marginTop: 8 }} disabled={busy || !link.trim()} onClick={() => claim(link)}>Зареєструвати</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
