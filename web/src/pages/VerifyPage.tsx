import { useState } from 'react';
import { apiVerifyNFT, apiVerifyNfc } from '../api';
import { useAuth } from '../auth';
import { fmtAgo } from '../format';
import { Icon } from '../icons';
import type { PageId } from '../Shell';
import { passportNo } from './MyNftsPage';

type Result = {
  tag: string;
  title: string;
  ownerId: string;
  ownerName: string;
  issuerName?: string;
  issuerVerified?: boolean;
  image?: string;
  description?: string;
  autoConfirmedReceipt: boolean;
  nftId: string;
  checkedAt: string;
};

type HistoryItem = { tag: string; title: string; image?: string; ok: boolean; at: string };

const HISTORY_KEY = 'marki.verifyHistory';

/** Recent checks on this device: a per-viewer convenience, not synced anywhere. */
function readHistory(): HistoryItem[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
}
function pushHistory(item: HistoryItem): HistoryItem[] {
  const next = [item, ...readHistory().filter(h => h.tag !== item.tag)].slice(0, 8);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
  return next;
}

/** Check a product by its NFC tag and show whose passport it is. */
export default function VerifyPage({ onJumpTo }: { onJumpTo: (p: PageId) => void }) {
  const { user } = useAuth();
  const [uid, setUid] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(readHistory);
  const [manual, setManual] = useState(false);
  const canScan = typeof window !== 'undefined' && 'NDEFReader' in window;

  const verify = async (tag: string) => {
    tag = tag.trim();
    if (!tag) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setNotFound(null);
    try {
      const v = await apiVerifyNfc(tag);
      const details = await apiVerifyNFT({ nftId: v.nftId, ownerId: v.ownerId }).catch(() => null);
      const r: Result = {
        tag,
        title: v.nftTitle,
        ownerId: v.ownerId,
        ownerName: v.ownerName,
        issuerName: details?.issuerName,
        issuerVerified: details?.issuerVerified,
        image: details?.nft?.imageUrl || details?.nft?.image,
        description: details?.nft?.description,
        autoConfirmedReceipt: v.autoConfirmedReceipt,
        nftId: v.nftId,
        checkedAt: new Date().toISOString(),
      };
      setResult(r);
      setHistory(pushHistory({ tag, title: r.title, image: r.image, ok: true, at: r.checkedAt }));
    } catch (e: any) {
      if (e?.status === 404) {
        setNotFound(tag);
        setHistory(pushHistory({ tag, title: 'Мітку не знайдено', ok: false, at: new Date().toISOString() }));
      } else {
        setError(e?.message ?? 'Не вдалося перевірити товар');
      }
    } finally {
      setBusy(false);
    }
  };

  const scan = async () => {
    const Reader = (window as any).NDEFReader;
    if (!Reader) return;
    setScanning(true);
    setError(null);
    try {
      const reader = new Reader();
      await reader.scan();
      reader.onreading = async (event: any) => {
        setScanning(false);
        const tag = event.serialNumber || '';
        if (!tag) { setError('Не вдалося зчитати мітку. Спробуй ще раз.'); return; }
        setUid(tag);
        await verify(tag);
      };
      reader.onreadingerror = () => {
        setScanning(false);
        setError('Мітку не зчитано. Тримай телефон ближче до товару.');
      };
    } catch (e: any) {
      setScanning(false);
      setError(e?.name === 'NotAllowedError' ? 'Дозволь доступ до NFC у браузері.' : e?.message ?? 'NFC недоступний');
    }
  };

  const reset = () => { setResult(null); setNotFound(null); setUid(''); setError(null); };
  const mine = result && user && result.ownerId === user.uid;

  // Result screens take the whole page: that is what the user came for.
  if (result) {
    return (
      <div className="verify-page">
        <div className="verdict good">
          <div className="v-seal">✓</div>
          <h2>{mine ? 'Це твій товар' : 'Оригінальний товар'}</h2>
          <p>{mine ? 'Паспорт записаний на тебе в Marki.' : `Паспорт знайдено в Marki${result.issuerVerified ? ', бренд перевірено' : ''}.`}</p>

          <div className="card v-card">
            {result.image && <img src={result.image} alt={result.title} className="vr-image" />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h3 style={{ margin: '0 0 4px' }}>{result.title}</h3>
              {result.description && <p className="sub" style={{ margin: '0 0 8px' }}>{result.description}</p>}
              {result.issuerName && (
                <div className="md-row">
                  <span className="muted">Бренд</span>
                  <strong>{result.issuerName} {result.issuerVerified && <span className="badge badge-success">перевірений</span>}</strong>
                </div>
              )}
              <div className="md-row"><span className="muted">Власник</span><strong>{mine ? 'Ти' : result.ownerName}</strong></div>
              <div className="md-row"><span className="muted">Паспорт</span><code style={{ fontSize: 12 }}>{passportNo(result.nftId)}</code></div>
            </div>
          </div>

          {result.autoConfirmedReceipt && (
            <div className="success-banner" style={{ marginTop: 12 }}>
              <Icon.Check /> Це твоє замовлення — отримання підтверджено автоматично.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
            {mine && <button className="btn btn-primary" onClick={() => onJumpTo('nfts')}>Відкрити мій паспорт</button>}
            <button className="btn" onClick={reset}>Перевірити інший товар</button>
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="verify-page">
        <div className="verdict bad">
          <div className="v-seal">!</div>
          <h2>Не вдалося підтвердити</h2>
          <p>Мітка <code>{notFound}</code> не прив’язана до жодного товару Marki.</p>
          <ul>
            <li>Перевір, чи правильно введено код.</li>
            <li>Проскануй ще раз, тримаючи телефон ближче.</li>
            <li>Якщо знову не вийшло — не купуй товар і напиши продавцю.</li>
          </ul>
          <button className="btn" onClick={reset}>Спробувати ще раз</button>
        </div>
      </div>
    );
  }

  return (
    <div className="verify-page">
      <div className="scan-stage">
        <button
          className={`scan-orb ${scanning ? 'scanning' : ''}`}
          onClick={canScan ? scan : () => setManual(true)}
          disabled={busy}
          aria-label="Сканувати NFC-мітку"
        >
          <span className="orb-ring" />
          <span className="orb-ring r2" />
          <span className="orb-core">{busy ? '…' : '📲'}</span>
        </button>
        <h2>{scanning ? 'Прикладіть телефон до мітки' : busy ? 'Перевіряємо…' : 'Перевір, чи товар справжній'}</h2>
        <p className="muted">
          {canScan
            ? 'Натисни кнопку й приклади телефон до NFC-мітки на товарі чи бирці.'
            : 'На цьому пристрої NFC недоступний (працює в Chrome на Android). Введи код мітки вручну.'}
        </p>

        {(manual || !canScan) ? (
          <div className="manual-code">
            <input
              value={uid}
              onChange={e => setUid(e.target.value)}
              placeholder="Код мітки, напр. 04:A2:3B:1C"
              onKeyDown={e => e.key === 'Enter' && verify(uid)}
              autoFocus={manual}
            />
            <button className="btn btn-primary" onClick={() => verify(uid)} disabled={busy || !uid.trim()}>Перевірити</button>
          </div>
        ) : (
          <button className="btn" style={{ border: 'none' }} onClick={() => setManual(true)}>Ввести код вручну</button>
        )}
        {error && <div className="error-banner" style={{ marginTop: 12 }}>{error}</div>}
      </div>

      {history.length > 0 && (
        <>
          <div className="section-title">Мої перевірки</div>
          <div className="check-history">
            {history.map(h => (
              <button key={h.tag} className="ch-item" onClick={() => verify(h.tag)} title="Перевірити ще раз">
                {h.image ? <img src={h.image} alt="" /> : <span className="ch-ph">{h.ok ? '✓' : '!'}</span>}
                <span className="ch-body">
                  <span className="ch-title">{h.title}</span>
                  <span className="muted" style={{ fontSize: 11 }}>{fmtAgo(h.at)}</span>
                </span>
                <span className={`badge ${h.ok ? 'badge-success' : 'badge-pending'}`}>{h.ok ? 'оригінал' : 'не знайдено'}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <details className="soft">
        <summary>Де шукати NFC-мітку?</summary>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
          Зазвичай мітка вшита в бирку, етикетку чи коробку й позначена значком 📲 або написом «Marki».
          Код мітки надрукований поруч — його можна ввести вручну, якщо телефон не підтримує NFC.
        </div>
      </details>
    </div>
  );
}
