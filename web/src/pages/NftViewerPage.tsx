import { useEffect, useState } from 'react';
import { apiGetNFT, apiPublicPassport, apiVerifyNFT, apiVerifyNfc, apiViewPassport, type NFT } from '../api';
import { useAuth } from '../auth';
import GuestPrompt from '../GuestPrompt';
import { fmtDateTime } from '../format';
import Logo from '../Logo';
import { passportNo } from './MyNftsPage';

type Source =
  | { kind: 'id'; id: string; owner?: string }
  | { kind: 'nfc'; uid: string };

type Props = {
  source: Source;
  onClose: () => void;
  /** Present for guests: asks the app to show the sign-in screen. */
  onSignIn?: (mode: 'login' | 'signup') => void;
};

type Loaded = {
  nft: NFT;
  ownerName?: string;
  issuerName?: string;
  issuerVerified?: boolean;
  /** True when the backend confirmed the NFT sits in the owner's Marki wallet. */
  verified: boolean;
};

/** Public passport page opened from a QR code, an NFC tag or a shared link. */
export default function NftViewerPage({ source, onClose, onSignIn }: Props) {
  const { user } = useAuth();
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        let ownerId: string | undefined;
        let nftId: string;
        let ownerName: string | undefined;
        if (source.kind === 'nfc') {
          if (onSignIn) throw Object.assign(new Error('guest-nfc'), { status: 401 });
          const v = await apiVerifyNfc(source.uid);
          nftId = v.nftId;
          ownerId = v.ownerId;
          ownerName = v.ownerName;
        } else {
          nftId = source.id;
          ownerId = source.owner;
        }
        if (ownerId) {
          // Public endpoint works for guests; signed-in users fall back to the protected one on older servers.
          const v = await apiPublicPassport(ownerId, nftId)
            .catch(e => (user ? apiVerifyNFT({ nftId, ownerId: ownerId! }) : Promise.reject(e)));
          if (!cancelled) setData({ nft: v.nft, ownerName: ownerName ?? (v as { ownerName?: string }).ownerName, issuerName: v.issuerName, issuerVerified: v.issuerVerified, verified: v.issuedByIdenity });
          if (user?.uid !== ownerId) apiViewPassport(ownerId, nftId);
        } else {
          // Old links without an owner open only the viewer's own NFTs.
          const nft = await apiGetNFT(nftId);
          if (!cancelled) setData({ nft, verified: true });
        }
      } catch (e: any) {
        if (!cancelled) setErr(
          e?.message === 'guest-nfc' ? 'Щоб перевірити товар за NFC-міткою, увійди в Marki — це займе хвилину.'
            : e?.status === 404 ? 'Паспорт не знайдено. Можливо, посилання застаріло або товар передано іншому власнику.'
              : e?.status === 401 ? 'Цей паспорт поки відкривається тільки після входу в Marki.'
                : e?.message ?? 'Не вдалося відкрити паспорт');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [source, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const nft = data?.nft;
  const image = nft ? nft.imageUrl || nft.image : '';

  return (
    <div className="viewer-wrap">
      <header className="viewer-topbar">
        <button className="btn" onClick={onClose}>← {onSignIn ? 'Marki' : 'До застосунку'}</button>
        <Logo size={24} />
        {onSignIn ? <button className="btn" onClick={() => onSignIn('login')}>Увійти</button> : <span />}
      </header>

      <div className="viewer-content">
        {loading && <div className="spinner">Перевіряємо паспорт…</div>}

        {!loading && err && (
          <div className="verdict bad" style={{ margin: '40px auto' }}>
            <div className="v-seal">!</div>
            <h2>Не вдалося підтвердити</h2>
            <p>{err}</p>
            {onSignIn
              ? <button className="btn btn-primary" onClick={() => onSignIn('signup')}>Увійти або зареєструватися</button>
              : <button className="btn" onClick={onClose}>До застосунку</button>}
          </div>
        )}

        {!loading && !err && nft && data && (
          <div className="viewer-grid">
            <div className="viewer-art">
              {image ? <img src={image} alt={nft.title} /> : <div className="viewer-art-empty">Немає зображення</div>}
            </div>

            <div>
              {data.verified && <div className="viewer-verdict">✓ Оригінал · паспорт перевірено Marki</div>}
              <div className="ph-label" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--muted)' }}>Цифровий паспорт товару</div>
              <h1 className="viewer-title">{nft.title}</h1>
              {nft.description && <p style={{ margin: '0 0 16px', fontSize: 15, lineHeight: 1.6, color: 'var(--muted)' }}>{nft.description}</p>}

              <div className="card">
                {data.issuerName && (
                  <div className="md-row">
                    <span className="muted">Бренд</span>
                    <strong>{data.issuerName} {data.issuerVerified && <span className="badge badge-success">перевірений</span>}</strong>
                  </div>
                )}
                {data.ownerName && <div className="md-row"><span className="muted">Власник</span><strong>{data.ownerName}</strong></div>}
                <div className="md-row"><span className="muted">Номер паспорта</span><code style={{ fontSize: 12 }}>{passportNo(nft.id)}</code></div>
                {nft.category && <div className="md-row"><span className="muted">Категорія</span><span>{nft.category}</span></div>}
                {nft.createdAt && <div className="md-row"><span className="muted">Випущено</span><span>{fmtDateTime(nft.createdAt)}</span></div>}
                {nft.nfcUid && <div className="md-row"><span className="muted">NFC-мітка</span><span>✓ прив’язана</span></div>}
                {nft.mintAddress?.startsWith('icp:') && (
                  <div className="md-row"><span className="muted">Блокчейн</span><span>Internet Computer · № {nft.mintAddress.split(':')[2]}</span></div>
                )}
                {nft.forSale && nft.price !== undefined && (
                  <div className="md-row"><span className="muted">Ціна</span><strong style={{ color: 'var(--primary)' }}>{nft.price} {nft.currency ?? ''}</strong></div>
                )}
              </div>

              {nft.attributes && nft.attributes.length > 0 && (
                <div className="viewer-section">
                  <div className="viewer-section-label">Характеристики</div>
                  <div className="attr-grid">
                    {nft.attributes.map((a, i) => (
                      <div key={i} className="attr-cell">
                        <div className="attr-key">{a.trait_type}</div>
                        <div className="attr-val">{a.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {onSignIn && data && <GuestPrompt text="Зберігай паспорти своїх речей і перевіряй товари за NFC." onSignIn={onSignIn} />}
    </div>
  );
}
