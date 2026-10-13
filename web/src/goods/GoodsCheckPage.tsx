import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  apiGoodsAcceptTransfer, apiGoodsCancelTransfer, apiGoodsClaim, apiGoodsCreateTransfer, apiGoodsLocate, apiGoodsPublic, apiGoodsVerify,
  type GoodsVerifyView,
} from '../api';
import { useAuth } from '../auth';
import { fmtDateTime } from '../format';
import Logo from '../Logo';
import { CATEGORY, EVENT, STAGE } from './labels';

/** Reads the first QR code in a photo (the fiscal receipt). */
async function readQrFromPhoto(file: File): Promise<string | null> {
  // Loaded on demand: only buyers registering a receipt need the QR reader.
  const { default: jsQR } = await import('jsqr');
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
  // The API token only needs Firebase sign-in, not the Marki profile: waiting for
  // it (not the profile) avoids a guest fetch followed by a signed-in one.
  const { fbUser, authReady } = useAuth();
  const user = fbUser;
  const [view, setView] = useState<GoodsVerifyView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authReady) return;
    setError(null);
    const load = (peek: boolean) => (user ? apiGoodsVerify(code, peek) : apiGoodsPublic(code, peek));
    load(false)
      .then(setView)
      .catch(e => setError(e?.status === 404 ? 'Такого коду немає в Marki. Можливо, це підробка або код пошкоджено.' : 'Не вдалося перевірити. Спробуй пізніше.'));
    // While the page is open, re-check quietly: a clone found elsewhere shows up here too.
    const timer = window.setInterval(() => { load(true).then(setView).catch(() => {}); }, 20_000);
    return () => window.clearInterval(timer);
  }, [code, user?.uid, authReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Optional location: catches copies sold in two cities of one country.
  const [place, setPlace] = useState<'idle' | 'asking' | 'done' | 'denied'>('idle');
  const shareLocation = () => {
    if (!('geolocation' in navigator)) { setPlace('denied'); return; }
    setPlace('asking');
    navigator.geolocation.getCurrentPosition(
      async pos => {
        try {
          await apiGoodsLocate(code, pos.coords.latitude, pos.coords.longitude);
          setPlace('done');
          (user ? apiGoodsVerify(code, true) : apiGoodsPublic(code, true)).then(setView).catch(() => {});
        } catch { setPlace('idle'); }
      },
      () => setPlace('denied'),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 10 * 60_000 },
    );
  };
  // Someone who allowed location before shares it without another tap.
  useEffect(() => {
    navigator.permissions?.query({ name: 'geolocation' as PermissionName })
      .then(p => { if (p.state === 'granted') shareLocation(); })
      .catch(() => {});
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const verdict = view ? summarize(view) : null;
  const cat = view ? CATEGORY[view.product.category] : null;
  const year = view ? view.product.attributes?.['Рік урожаю'] || view.attributes?.['Рік урожаю'] : '';
  const isDrink = view?.product.category === 'wine' || view?.product.category === 'spirits' || view?.product.category === 'beer';

  return (
    <div className="viewer-wrap gc-wrap">
      <header className="viewer-topbar gc-topbar">
        <nav className="gc-nav">
          <button className="gc-home" onClick={onClose} aria-label="Marki — на головну"><Logo size={26} /></button>
          <button className="gc-navlink" onClick={onClose}>Головна</button>
          <span className="gc-navlink active">Перевірка товару</span>
        </nav>
        {onSignIn ? <button className="btn" onClick={() => onSignIn('login')}>Увійти</button> : <span />}
      </header>

      <div className="viewer-content gc-page">
        {!view && !error && <div className="spinner">Перевіряємо товар…</div>}
        {error && (
          <div className="gc-verdict bad">
            <span className="gc-seal">!</span>
            <div><strong>Не підтверджено</strong><span>{error}</span></div>
          </div>
        )}

        {view && verdict && cat && (
          <>
            <div className={`gc-hero ${view.product.image ? '' : 'no-photo'}`}>
              {view.product.image && (
                <div className="gc-photo"><img src={view.product.image} alt={view.product.name} /></div>
              )}

              <div className="gc-info">
                <div className={`gc-pill ${verdict.cls}`}>
                  <span className="gc-seal">{verdict.seal}</span>
                  <div><strong>{verdict.title}</strong>{verdict.line && <span>{verdict.line}</span>}</div>
                </div>

                <div className="gc-head">
                  <div style={{ minWidth: 0 }}>
                    <div className="gc-kicker">Цифровий паспорт товару</div>
                    <h1 className="gc-title">{view.product.name}</h1>
                    <div className="gc-sub">{[view.product.brandName, cat.label, year].filter(Boolean).join(' · ')}</div>
                  </div>
                  <div className="gc-cat">{cat.icon}</div>
                </div>

                <div className="card gc-table">
                  <div className="md-row">
                    <span className="muted">Бренд</span>
                    <span>{view.product.brandName} {view.brandVerified
                      ? <span className="badge badge-success">перевірений</span>
                      : <span className="badge badge-pending">не перевірений</span>}</span>
                  </div>
                  <div className="md-row"><span className="muted">Статус</span><strong>{view.unit?.mine ? 'Ваш' : view.unit?.claimed ? 'Продано' : STAGE[view.stage]}</strong></div>
                  {Object.entries({ ...(view.product.attributes ?? {}), ...(view.attributes ?? {}) }).map(([k, v]) => (
                    <div key={k} className="md-row"><span className="muted">{k}</span><span>{v}</span></div>
                  ))}
                  {view.producedAt && <div className="md-row"><span className="muted">{isDrink ? 'Розлито' : 'Вироблено'}</span><span>{view.producedAt}</span></div>}
                  {view.expiresAt && <div className="md-row"><span className="muted">Придатний до</span><span>{view.expiresAt}</span></div>}
                  <div className="md-row"><span className="muted">Партія</span><span>{view.lot}</span></div>
                  {view.unit && <div className="md-row"><span className="muted">{isDrink ? 'Пляшка' : 'Одиниця'}</span><span>№ {view.unit.serial} з {view.batchSize}</span></div>}
                  <div className="md-row"><span className="muted">Номер паспорта</span><code>{view.code.toUpperCase()}</code></div>
                </div>
                {view.product.description && <p className="gc-desc">{view.product.description}</p>}

                <div className="gc-actions">
                  {transferToken && view.unit && !view.unit.mine && (
                    <AcceptBox code={view.code} token={transferToken} signedIn={!!user} onSignIn={onSignIn} onAccepted={setView} />
                  )}
                  {view.unit?.mine && <HandOverBox view={view} onChange={setView} />}
                  {view.unit && !view.unit.claimed && !view.suspicious && (
                    <ClaimBox code={view.code} signedIn={!!user} onSignIn={onSignIn} onClaimed={setView} />
                  )}
                  {view.unit && !view.suspicious && !view.unit.mine && place !== 'done' && (
                    <button className="gc-link" onClick={shareLocation} disabled={place === 'asking'}>
                      {place === 'asking' ? 'Визначаємо місце…' : place === 'denied' ? '📍 Доступ до місця вимкнено' : '📍 Перевірити точніше за місцем'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <h2 className="gc-h2">Шлях товару</h2>
            <div className="gc-path">
              {(view.events ?? []).map((ev, i) => (
                <div key={i} className="card gc-step">
                  <span className="gc-step-icon">{EVENT[ev.kind]?.icon ?? '•'}</span>
                  <div>
                    <strong>{EVENT[ev.kind]?.label ?? ev.kind}</strong>
                    <span>{[ev.location, ev.note].filter(Boolean).join(' · ') || ev.actorName}</span>
                    <small>{fmtDateTime(ev.at)}</small>
                  </div>
                </div>
              ))}
              {(view.unit?.owners ?? []).map((o, i) => (
                <div key={`o${i}`} className="card gc-step">
                  <span className="gc-step-icon">{o.via === 'gift' ? '🎁' : '🧾'}</span>
                  <div>
                    <strong>{o.via === 'gift' ? 'Подаровано' : 'Куплено за чеком'}</strong>
                    <span>{o.via === 'gift' ? (o.name || 'новому власнику') : 'Покупець зареєстрував товар'}</span>
                    <small>{fmtDateTime(o.at)}</small>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** One verdict and one short line: the reason that matters most. */
function summarize(v: GoodsVerifyView): { cls: 'good' | 'bad' | 'fake'; seal: string; title: string; line: string } {
  const f = v.flag;
  if (v.suspicious && f?.reason === 'distance') {
    return { cls: 'fake', seal: '✕', title: 'Ймовірна підробка', line: `Код сканували за ~${f.distanceKm} км за ${f.hours} год` };
  }
  if (v.suspicious) {
    return { cls: 'fake', seal: '✕', title: 'Ймовірна підробка', line: `Код сканували одночасно: ${(f?.regions ?? v.suspiciousRegions ?? []).map(country).join(' і ')}` };
  }
  if (v.unit?.mine) {
    return { cls: 'good', seal: '✓', title: 'Ваш товар', line: `Зареєстровано ${fmtDateTime(v.unit.claimedAt)}` };
  }
  if (v.unit?.claimed) {
    return { cls: 'bad', seal: '!', title: 'Уже продано', line: `${(v.unit.claimedAt ?? '').slice(0, 10)} — не купуйте як новий` };
  }
  if (f?.reason === 'devices') {
    return { cls: 'bad', seal: '!', title: 'Будьте уважні', line: `Сканували з ${f.devices} пристроїв, хоча ще не продано` };
  }
  if (v.expiresAt && v.expiresAt < new Date().toISOString().slice(0, 10)) {
    return { cls: 'bad', seal: '!', title: 'Термін минув', line: `Придатний був до ${v.expiresAt}` };
  }
  if (!v.brandVerified) {
    return { cls: 'bad', seal: '!', title: 'Код справжній', line: 'Але виробник ще не перевірений Marki' };
  }
  return { cls: 'good', seal: '✓', title: 'Код справжній · перевірено Marki', line: v.unit ? 'Зареєстровано виробником, ще не продано' : 'Зареєстровано виробником' };
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
      <p className="muted" style={{ fontSize: 13, margin: '0 0 10px' }}>Купили? Сфотографуйте QR на чеку — товар стане вашим.</p>
      {error && <div className="error-banner">{error}</div>}
      {!signedIn ? (
        <button className="btn btn-primary btn-block" onClick={() => onSignIn?.('signup')}>🧾 Увійти й зареєструвати покупку</button>
      ) : (
        <>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={e => onPhoto(e.target.files?.[0])} />
          <button className="btn btn-primary btn-block" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Перевіряємо чек…' : '🧾 Я купив — сфотографувати чек'}
          </button>
          {!manual ? (
            <button className="gc-link" onClick={() => setManual(true)}>або вставити посилання з чека</button>
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
