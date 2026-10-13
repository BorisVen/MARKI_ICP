import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import {
  apiGoodsAcceptTransfer, apiGoodsCancelTransfer, apiGoodsClaim, apiGoodsCreateTransfer, apiGoodsPublic, apiGoodsVerify,
  type GoodsVerifyView,
} from '../api';
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

const COUNTRY: Record<string, string> = {
  UA: 'Україна', ES: 'Іспанія', PL: 'Польща', DE: 'Німеччина', FR: 'Франція', IT: 'Італія', PT: 'Португалія',
  GB: 'Велика Британія', CZ: 'Чехія', SK: 'Словаччина', HU: 'Угорщина', RO: 'Румунія', MD: 'Молдова', AT: 'Австрія',
  NL: 'Нідерланди', BE: 'Бельгія', CH: 'Швейцарія', TR: 'Туреччина', LT: 'Литва', LV: 'Латвія', EE: 'Естонія',
  GE: 'Грузія', GR: 'Греція', BG: 'Болгарія', IE: 'Ірландія', SE: 'Швеція', NO: 'Норвегія', DK: 'Данія', FI: 'Фінляндія', AE: 'ОАЕ',
};
const country = (r: string) => COUNTRY[r] ?? r.split('/').pop()?.replace(/_/g, ' ') ?? r;

/** Link that hands an item over to someone else (gift). */
const transferUrl = (code: string, token: string) =>
  `${window.location.origin}${import.meta.env.BASE_URL}?v=${encodeURIComponent(code)}&t=${encodeURIComponent(token)}`;

/** Public check page opened from a product QR (`?v=CODE`, `&t=TOKEN` for a handover). */
export default function GoodsCheckPage({ code, transferToken, onClose, onSignIn }: {
  code: string;
  transferToken?: string;
  onClose: () => void;
  /** Present for guests: asks the app to show the sign-in screen. */
  onSignIn?: (mode: 'login' | 'signup') => void;
}) {
  const { user } = useAuth();
  const [view, setView] = useState<GoodsVerifyView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    const load = (peek: boolean) => (user ? apiGoodsVerify(code, peek) : apiGoodsPublic(code, peek));
    load(false)
      .then(setView)
      .catch(e => setError(e?.status === 404 ? 'Такого коду немає в Marki. Можливо, це підробка або код пошкоджено.' : 'Не вдалося перевірити. Спробуй пізніше.'));
    // While the page is open, re-check quietly: a clone found elsewhere shows up here too.
    const timer = window.setInterval(() => { load(true).then(setView).catch(() => {}); }, 20_000);
    return () => window.clearInterval(timer);
  }, [code, user]);

  const ok = view && view.warnings.length === 0;
  const verdict = !view ? null
    : view.suspicious ? { cls: 'fake', seal: '✕', title: 'Ймовірна підробка', text: 'Не купуйте цей товар і повідомте продавця або виробника.' }
      : ok ? { cls: 'good', seal: '✓', title: 'Код зареєстровано виробником', text: view.unit?.claimed ? `${view.product.brandName} · перевірено Marki` : `${view.product.brandName} · перевірено Marki · ще не продано` }
        : { cls: 'bad', seal: '!', title: 'Будьте уважні', text: 'Код справжній, але є застереження:' };

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
            <div className={`verdict ${verdict!.cls}`}>
              <div className="v-seal">{verdict!.seal}</div>
              <h2>{verdict!.title}</h2>
              <p>{verdict!.text}</p>
              {!ok && <ul className="gc-warnings">{view.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
              {view.suspicious && view.suspiciousRegions?.length ? (
                <div className="gc-regions">{view.suspiciousRegions.map(country).join(' · ')}</div>
              ) : null}
            </div>
            {view.protection === 'qr' && !view.suspicious && (
              <div className="muted gc-protection">
                🔎 Захист: QR-код. Його можна скопіювати, тому Marki стежить, де й ким його сканують, і попередить про підробку.
              </div>
            )}

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

            {transferToken && view.unit && !view.unit.mine && (
              <AcceptBox code={view.code} token={transferToken} signedIn={!!user} onSignIn={onSignIn} onAccepted={setView} />
            )}

            {view.unit?.mine && <HandOverBox view={view} onChange={setView} />}

            {view.unit && !view.unit.claimed && !view.suspicious && (
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
              {view.unit?.claimed && view.unit.owners.length === 0 && (
                <div className="pt-item">
                  <span className="pt-icon">🧾</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Продано й зареєстровано покупцем</div>
                    <div className="muted" style={{ fontSize: 11 }}>{fmtDateTime(view.unit.claimedAt)}</div>
                  </div>
                </div>
              )}
              {view.unit?.owners.map((o, i) => (
                <div key={i} className="pt-item">
                  <span className="pt-icon">{o.via === 'gift' ? '🎁' : '🧾'}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {o.via === 'gift' ? `Передано в подарунок → ${o.name || 'новий власник'}` : `Куплено й зареєстровано за чеком${o.name ? ` · ${o.name}` : ''}`}
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>{fmtDateTime(o.at)}</div>
                  </div>
                </div>
              ))}
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

/** The owner hands the item over (gift): a link + QR for the receiver. */
function HandOverBox({ view, onChange }: { view: GoodsVerifyView; onChange: (v: GoodsVerifyView) => void }) {
  const token = view.unit?.transferToken;
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const url = token ? transferUrl(view.code, token) : '';

  useEffect(() => {
    if (url) QRCode.toDataURL(url, { width: 300, margin: 1 }).then(setQr).catch(() => {});
  }, [url]);

  const setToken = (t?: string) => onChange({ ...view, unit: view.unit && { ...view.unit, transferToken: t } });
  const create = async () => {
    setBusy(true);
    try { setToken((await apiGoodsCreateTransfer(view.code)).token); } catch (e: any) { alert(e?.message ?? 'Не вдалося'); } finally { setBusy(false); }
  };
  const cancel = async () => {
    setBusy(true);
    try { await apiGoodsCancelTransfer(view.code); setToken(undefined); } catch (e: any) { alert(e?.message ?? 'Не вдалося'); } finally { setBusy(false); }
  };
  const copy = async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  return (
    <div className="card">
      <h3 style={{ margin: '0 0 4px' }}>🎁 Подарувати або передати</h3>
      {!token ? (
        <>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>
            Створіть посилання для того, кому даруєте. Після прийняття товар стане його, а сканування в іншій країні не вважатимуться підробкою.
          </p>
          <button className="btn btn-primary btn-block" onClick={create} disabled={busy}>Створити посилання</button>
        </>
      ) : (
        <div style={{ textAlign: 'center' }}>
          <p className="muted" style={{ fontSize: 13 }}>Надішліть посилання або покажіть QR отримувачу.</p>
          {qr && <img src={qr} alt="QR передачі" className="gift-qr" />}
          <div className="copy-row" style={{ marginTop: 10 }}>
            <code>{url.replace(/^https?:\/\//, '')}</code>
            <button className="btn" onClick={copy}>{copied ? 'Скопійовано' : 'Копіювати'}</button>
          </div>
          <button className="btn ghost-danger" style={{ marginTop: 8 }} onClick={cancel} disabled={busy}>Скасувати передачу</button>
        </div>
      )}
    </div>
  );
}

/** The receiver of a handover link takes the item. */
function AcceptBox({ code, token, signedIn, onSignIn, onAccepted }: {
  code: string; token: string; signedIn: boolean;
  onSignIn?: (mode: 'login' | 'signup') => void;
  onAccepted: (v: GoodsVerifyView) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = async () => {
    if (!signedIn) { onSignIn?.('signup'); return; }
    setBusy(true);
    setError(null);
    try {
      onAccepted(await apiGoodsAcceptTransfer(code, token));
      window.history.replaceState({}, '', `?v=${encodeURIComponent(code)}`);
    } catch (e: any) {
      setError(e?.message ?? 'Не вдалося прийняти');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card gc-claim">
      <h3 style={{ margin: '0 0 4px' }}>🎁 Вам передають цей товар</h3>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 12px' }}>Прийміть — і товар стане вашим у Marki з усією історією.</p>
      {error && <div className="error-banner">{error}</div>}
      <button className="btn btn-primary btn-block" onClick={accept} disabled={busy}>
        {busy ? 'Приймаємо…' : signedIn ? 'Прийняти' : 'Увійти й прийняти'}
      </button>
    </div>
  );
}
