import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { apiGetNFTs, apiListDeliveries, type Delivery, type NFT } from '../api';
import { useAuth } from '../auth';
import EmptyState from '../EmptyState';
import { fmtDateTime, plural } from '../format';
import { Icon } from '../icons';
import type { PageId } from '../Shell';
import { statusLabel } from '../status';
import { GridSkeleton } from '../Skeleton';

const nftImage = (n: NFT) => n.imageUrl || n.image || '';
/** Public passport link in this app; the owner id lets the viewer verify it. */
const viewerUrl = (n: NFT, ownerId: string) =>
  `${window.location.origin}/?nft=${encodeURIComponent(n.id)}&owner=${encodeURIComponent(ownerId)}`;
/** Short, human passport number: MK-XXXX-XXXX from the NFT id. */
export const passportNo = (id: string) => {
  const clean = id.replace(/[^a-z0-9]/gi, '').toUpperCase().padEnd(8, '0');
  return `MK-${clean.slice(0, 4)}-${clean.slice(-4)}`;
};
const onChain = (n: NFT) => (n.mintAddress?.startsWith('icp:') ? n.mintAddress.split(':')[2] : null);

type Event = { key: string; icon: string; title: string; sub?: string; at?: string };

/** Passport history from real data: issue, blockchain record, NFC tag, delivery. */
function buildHistory(nft: NFT, deliveries: Delivery[]): Event[] {
  const events: Event[] = [
    { key: 'issued', icon: '🏷️', title: 'Паспорт випущено брендом', sub: nft.batchName ? `Колекція «${nft.batchName}»` : undefined, at: nft.createdAt },
  ];
  const token = onChain(nft);
  if (token) events.push({ key: 'chain', icon: '⛓️', title: 'Записано в блокчейн Internet Computer', sub: `Токен № ${token}` });
  if (nft.nfcUid) events.push({ key: 'nfc', icon: '📲', title: 'Прив’язано NFC-мітку', sub: 'Товар можна перевірити дотиком телефону' });
  const d = deliveries.find(x => x.nftId === nft.id || x.nftId === nft.walletNftId);
  if (d) {
    for (const c of [...(d.checkpoints ?? [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
      events.push({ key: c.id, icon: '🚚', title: statusLabel(c.status), sub: c.location, at: c.timestamp });
    }
    if (d.customerReceived) events.push({ key: 'received', icon: '✅', title: 'Отримано власником', at: d.receivedAt });
    if (d.nfcVerified) events.push({ key: 'verified', icon: '🔐', title: 'Перевірено за NFC при отриманні', at: d.nfcVerifiedAt });
  }
  return events;
}

/** NFT passports in the user's Marki wallet. */
export default function MyNftsPage({ onJumpTo }: { onJumpTo: (p: PageId) => void }) {
  const { user } = useAuth();
  const [nfts, setNfts] = useState<NFT[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<NFT | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [n, d] = await Promise.all([apiGetNFTs(), apiListDeliveries().catch(() => [])]);
      setNfts(n);
      setDeliveries(d);
    } catch (e: any) {
      setError(e?.message ?? 'Не вдалося завантажити паспорти');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const withNfc = nfts.filter(n => n.nfcUid).length;

  if (open) {
    return <Passport nft={open} history={buildHistory(open, deliveries)} ownerName={user?.name ?? ''} ownerId={user?.uid ?? ''} onBack={() => setOpen(null)} />;
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Мої паспорти</h2>
          <p>
            {nfts.length > 0
              ? `${nfts.length} ${plural(nfts.length, 'товар', 'товари', 'товарів')} з цифровим паспортом${withNfc ? ` · ${withNfc} з NFC` : ''}`
              : 'Цифрові паспорти твоїх товарів — доказ, що вони справжні й належать тобі.'}
          </p>
        </div>
        <button className="btn" onClick={reload} title="Оновити"><Icon.Refresh /></button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <GridSkeleton count={12} />
      ) : nfts.length === 0 ? (
        <EmptyState
          icon="🪪"
          title="Поки немає жодного паспорта"
          text="Купи товар у каталозі — його цифровий паспорт зберігатиметься тут."
          action={<button className="btn btn-primary" onClick={() => onJumpTo('home')}>До маркету</button>}
        />
      ) : (
        <div className="product-grid">
          {nfts.map(n => (
            <button key={n.id} className="card product-card passport-tile" onClick={() => setOpen(n)}>
              {nftImage(n) ? <img src={nftImage(n)} alt={n.title} /> : <div className="pc-placeholder">🪪</div>}
              <span className="pt-seal" title="Оригінал">✓</span>
              <div className="pc-body">
                <div className="pc-title">{n.title}</div>
                <div className="muted" style={{ fontSize: 11, fontFamily: 'monospace' }}>{passportNo(n.id)}</div>
                <div className="pc-foot">
                  {n.nfcUid ? <span className="badge badge-success">NFC</span> : <span className="badge badge-muted">паспорт</span>}
                  {onChain(n) && <span className="badge badge-info">блокчейн</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Passport({ nft, history, ownerName, ownerId, onBack }: { nft: NFT; history: Event[]; ownerName: string; ownerId: string; onBack: () => void }) {
  const [tab, setTab] = useState<'passport' | 'history' | 'share'>('passport');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const url = viewerUrl(nft, ownerId);
  const token = onChain(nft);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 260, margin: 2, color: { dark: '#0b0f14', light: '#ffffff' } }).then(setQr).catch(() => {});
  }, [url]);

  const facts = useMemo(() => [
    ['Номер паспорта', passportNo(nft.id)],
    ['Власник', ownerName || 'Ти'],
    ['Випущено', fmtDateTime(nft.createdAt)],
    nft.category ? ['Категорія', nft.category] : null,
    nft.batchName ? ['Колекція', nft.batchName] : null,
    ...(nft.attributes ?? []).map(a => [a.trait_type, a.value]),
  ].filter(Boolean) as [string, string][], [nft, ownerName]);

  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: nft.title, text: `Цифровий паспорт «${nft.title}» у Marki`, url }); return; } catch { /* cancelled */ }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="passport">
      <button className="btn" onClick={onBack} style={{ marginBottom: 14 }}>← Мої паспорти</button>

      {/* Certificate-style header: the proof a buyer or resale partner looks at first. */}
      <div className="passport-hero">
        {nftImage(nft) && <img src={nftImage(nft)} alt={nft.title} />}
        <div className="ph-body">
          <div className="ph-label">Цифровий паспорт товару</div>
          <h2>{nft.title}</h2>
          {nft.description && <p>{nft.description}</p>}
          <div className="ph-seals">
            <span className="chain-badge">✓ Оригінал</span>
            {nft.nfcUid && <span className="chain-badge info">📲 NFC-мітка</span>}
            {token && <span className="chain-badge info">⛓️ ICP № {token}</span>}
          </div>
          <div className="ph-no">{passportNo(nft.id)}</div>
        </div>
      </div>

      <div className="mode-tabs" role="tablist" style={{ marginTop: 16 }}>
        <button className={`mode-tab ${tab === 'passport' ? 'active' : ''}`} onClick={() => setTab('passport')}>Паспорт</button>
        <button className={`mode-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>Історія · {history.length}</button>
        <button className={`mode-tab ${tab === 'share' ? 'active' : ''}`} onClick={() => setTab('share')}>Поділитися</button>
      </div>

      {tab === 'passport' && (
        <div className="card">
          {facts.map(([k, v]) => (
            <div key={k} className="md-row"><span className="muted">{k}</span><span style={{ textAlign: 'right' }}>{v}</span></div>
          ))}
          <div className="notice notice-info" style={{ marginTop: 14, marginBottom: 0 }}>
            {nft.nfcUid
              ? 'Щоб довести оригінальність, приклади телефон до NFC-мітки на товарі або покажи QR з вкладки «Поділитися».'
              : 'Покажи QR з вкладки «Поділитися» — за ним будь-хто побачить цей паспорт.'}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="card">
          <div className="passport-timeline">
            {history.map(e => (
              <div key={e.key} className="pt-item">
                <span className="pt-icon">{e.icon}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{e.title}</div>
                  {e.sub && <div className="muted" style={{ fontSize: 12 }}>{e.sub}</div>}
                  {e.at && <div className="muted" style={{ fontSize: 11 }}>{fmtDateTime(e.at)}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'share' && (
        <div className="card" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          {qr && <img src={qr} alt="QR паспорта" style={{ width: 180, height: 180, borderRadius: 12 }} />}
          <div style={{ flex: 1, minWidth: 220 }}>
            <h3>Доказ оригінальності</h3>
            <p className="sub" style={{ fontSize: 13 }}>
              Покажи QR покупцеві або надішли посилання — наприклад, коли перепродаєш товар.
            </p>
            <button className="btn btn-primary" onClick={share}>
              <Icon.Upload /> {copied ? 'Посилання скопійовано' : 'Поділитися посиланням'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
