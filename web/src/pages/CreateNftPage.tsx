import { useEffect, useRef, useState } from 'react';
import { apiCreateEditionNFTs, apiCreateNFT, apiCreatePost, apiUpdateNFT } from '../api';
import { useAuth } from '../auth';
import { Icon } from '../icons';
import { friendlyIcpError } from '../icp/errors';
import { cyclesToUsd, ICP_MINT_ENABLED, icpMintAddress, mintPhotoOnChain, type OnChainMint } from '../icp/mint';
import PlanMeter from '../icp/PlanMeter';
import { useSubscription } from '../icp/useSubscription';
import { useWallet } from '../icp/useWallet';
import WalletConnect from '../icp/WalletConnect';
import type { PageId } from '../Shell';

/** Resize to at most 1080 px and re-encode as JPEG: smaller upload, fewer cycles. */
function compressImage(file: File, maxPx = 1080, quality = 0.82): Promise<File> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(b => resolve(b ? new File([b], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }) : file), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/** Create an NFT passport: photo and details, minted on ICP from the user's plan. */
export default function CreateNftPage({ onJumpTo }: { onJumpTo: (p: PageId) => void }) {
  const { user } = useAuth();
  const wallet = useWallet();
  const plan = useSubscription();
  const fileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [collection, setCollection] = useState('');
  const [copies, setCopies] = useState(1);
  const [forSale, setForSale] = useState(false);
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('UAH');
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<OnChainMint | null>(null);
  const [doneOffChain, setDoneOffChain] = useState(false);

  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (f?: File | null) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { setError('Обери зображення (JPG, PNG, WebP).'); return; }
    if (f.size > 15 * 1024 * 1024) { setError('Фото завелике: до 15 МБ.'); return; }
    setError(null);
    setFile(f);
  };

  const left = plan.active ? Number(plan.subscription!.photo_mints_left) : 0;
  const needsPlan = ICP_MINT_ENABLED && (!plan.active || left < copies);
  const ready = !!file && !!title.trim() && (!forSale || Number(price) > 0) && (!ICP_MINT_ENABLED || (!!wallet && !needsPlan));

  const submit = async () => {
    if (!file || !user) return;
    setError(null);
    try {
      setBusy('Готуємо фото…');
      const image = await compressImage(file);
      const metadata = {
        title: title.trim(),
        description: description.trim(),
        tags: [],
        category: 'Other',
        blockchain: 'icp',
        royalty: 0,
        forSale,
        currency,
        ...(forSale ? { price: Number(price) } : {}),
        ...(collection.trim() ? { batchName: collection.trim() } : {}),
      };

      // On-chain first: the canister takes the plan credits, so no plan means no NFT.
      const mint = ICP_MINT_ENABLED && wallet
        ? await mintPhotoOnChain(wallet, image, metadata, copies, t => setBusy(t))
        : null;

      setBusy('Зберігаємо паспорт…');
      const form = new FormData();
      form.append('image', image);
      let nftIds: string[];
      let imageUrl = '';
      if (copies > 1) {
        form.append('metadata', JSON.stringify({ ...metadata, batchName: collection.trim() || title.trim(), editionCount: copies }));
        const r: any = await apiCreateEditionNFTs(form);
        nftIds = r?.editionIds ?? [];
        imageUrl = r?.imageUrl ?? '';
      } else {
        form.append('metadata', JSON.stringify(metadata));
        const r: any = await apiCreateNFT(form);
        nftIds = r?.id ? [r.id] : [];
        imageUrl = r?.image ?? '';
      }
      if (nftIds.length === 0) throw new Error('Сервер не зберіг NFT. Спробуй ще раз.');

      if (mint) {
        setBusy('Прив’язуємо записи блокчейну…');
        for (let i = 0; i < nftIds.length && i < mint.tokenIds.length; i++) {
          await apiUpdateNFT(nftIds[i], { mintAddress: icpMintAddress(mint.tokenIds[i]) });
        }
      }

      if (forSale) {
        setBusy('Виставляємо на продаж…');
        await apiCreatePost({
          nftImage: imageUrl,
          ...(nftIds.length > 1 ? { nftImages: nftIds.map(() => imageUrl), walletNftIds: nftIds } : { walletNftId: nftIds[0] }),
          title: title.trim(),
          nftTitle: title.trim(),
          description: description.trim(),
          forSale: true,
          price: Number(price),
          currency,
          blockchain: 'icp',
        });
      }

      if (mint) { setDone(mint); plan.refresh(); } else setDoneOffChain(true);
    } catch (e: any) {
      setError(friendlyIcpError(e?.message ?? 'Не вдалося створити NFT'));
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setFile(null); setTitle(''); setDescription(''); setCollection(''); setCopies(1);
    setForSale(false); setPrice(''); setDone(null); setDoneOffChain(false); setError(null);
  };

  if (done || doneOffChain) {
    const usd = done ? cyclesToUsd(done.cyclesSpent) : 0;
    return (
      <div className="create-page">
        <div className="verdict good">
          <div className="v-seal">✓</div>
          <h2>{copies > 1 ? `${copies} NFT створено!` : 'NFT створено!'}</h2>
          <p>«{title}» уже у твоїх паспортах{forSale ? ' і виставлений на продаж' : ''}.</p>
          {preview && <img src={preview} alt="" className="create-done-img" />}
          {done && (
            <div className="card v-card" style={{ flexDirection: 'column', gap: 0 }}>
              <div className="md-row"><span className="muted">Записано в блокчейн</span><strong>Internet Computer · № {done.tokenIds.map(String).join(', ')}</strong></div>
              <div className="md-row"><span className="muted">Вартість запису</span><span>{usd < 0.01 ? 'менше 1 цента' : `$${usd.toFixed(2)}`} · оплачує Marki</span></div>
              <div className="md-row"><span className="muted">Залишилось у тарифі</span><strong>{done.subscription.photo_mints_left.toString()} NFT з фото</strong></div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={reset}><Icon.Plus /> Створити ще</button>
            <button className="btn" onClick={() => onJumpTo('profile')}>До профілю</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="create-page">
      <div className="page-head">
        <div>
          <h2>Створити NFT</h2>
          <p>Цифровий паспорт для твоєї речі: фото, назва — і запис у блокчейні ICP.</p>
        </div>
      </div>

      <div className="create-grid-user">
        <div>
          <div
            className={`photo-drop ${dragOver ? 'over' : ''} ${preview ? 'has' : ''}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files?.[0]); }}
          >
            {preview ? <img src={preview} alt="" /> : (
              <div className="pd-empty">
                <span style={{ fontSize: 40 }}>📷</span>
                <strong>Додай фото</strong>
                <span className="muted">Перетягни сюди або натисни · JPG, PNG до 15 МБ</span>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => pick(e.target.files?.[0])} />
          </div>
          {preview && <button className="btn" style={{ marginTop: 8 }} onClick={() => fileRef.current?.click()}>Інше фото</button>}
        </div>

        <div className="card">
          <div className="field"><label>Назва *</label><input value={title} maxLength={60} onChange={e => setTitle(e.target.value)} placeholder="напр. Годинник Aurora" /></div>
          <div className="field"><label>Опис</label><textarea value={description} maxLength={300} onChange={e => setDescription(e.target.value)} placeholder="Що це за річ, звідки, чим особлива" /></div>
          <div className="field">
            <label>Колекція <span className="muted">(необов’язково)</span></label>
            <input value={collection} maxLength={40} onChange={e => setCollection(e.target.value)} placeholder="напр. Aurora Classic" />
          </div>
          <div className="field">
            <label>Кількість копій</label>
            <div className="stepper-input">
              <button type="button" className="btn" onClick={() => setCopies(Math.max(1, copies - 1))}>−</button>
              <input type="number" min={1} max={1000} value={copies} onChange={e => setCopies(Math.min(1000, Math.max(1, Number(e.target.value) || 1)))} />
              <button type="button" className="btn" onClick={() => setCopies(Math.min(1000, copies + 1))}>+</button>
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>1 — унікальна річ. Більше — серія однакових NFT, кожна копія спише 1 NFT з тарифу.</div>
          </div>

          <div className="toggle-row">
            <div><div className="lbl">Виставити на продаж</div><div className="sub">З’явиться в Маркеті, оплата при отриманні</div></div>
            <div className={`switch ${forSale ? 'on' : ''}`} role="switch" aria-checked={forSale} onClick={() => setForSale(!forSale)}><div className="knob" /></div>
          </div>
          {forSale && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 10 }}>
              <div className="field"><label>Ціна</label><input value={price} onChange={e => setPrice(e.target.value.replace(',', '.'))} inputMode="decimal" placeholder="0" /></div>
              <div className="field">
                <label>Валюта</label>
                <select value={currency} onChange={e => setCurrency(e.target.value)}>
                  <option value="UAH">₴ UAH</option><option value="USD">$ USD</option><option value="ICP">ICP</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {ICP_MINT_ENABLED && (
        <div className="card create-plan">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: plan.active ? 12 : 0 }}>
            <div>
              <div style={{ fontWeight: 600 }}>Запис у блокчейн</div>
              <div className="muted" style={{ fontSize: 12 }}>Газ і зберігання оплачує Marki — з твого тарифу спишеться {copies} NFT з фото.</div>
            </div>
            <WalletConnect onError={setError} />
          </div>
          {plan.active ? <PlanMeter state={plan} /> : (
            <div className="notice notice-warn" style={{ marginTop: 12, marginBottom: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span>Щоб створювати NFT, потрібен тариф — від $9 за 100 NFT.</span>
              <button className="btn btn-primary" onClick={() => onJumpTo('plans')}>Обрати тариф</button>
            </div>
          )}
          {plan.active && left < copies && (
            <div className="notice notice-warn" style={{ marginTop: 12, marginBottom: 0 }}>
              У тарифі залишилось {left} NFT з фото, а потрібно {copies}. <button className="btn" style={{ padding: '2px 8px' }} onClick={() => onJumpTo('plans')}>Докупити</button>
            </div>
          )}
        </div>
      )}

      {error && <div className="error-banner" style={{ marginTop: 12 }}>{error}</div>}
      {busy && <div className="progress-banner" style={{ marginTop: 12 }}><div className="mini-spin" /><div style={{ fontSize: 13 }}>{busy}</div></div>}

      <button className="btn btn-primary btn-block create-submit" onClick={submit} disabled={!ready || !!busy}>
        {busy ? 'Створюємо…' : copies > 1 ? `Створити ${copies} NFT` : 'Створити NFT'}
      </button>
      {!ready && !busy && (
        <div className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 6 }}>
          {!file ? 'Додай фото' : !title.trim() ? 'Вкажи назву' : forSale && !(Number(price) > 0) ? 'Вкажи ціну' : ICP_MINT_ENABLED && !wallet ? 'Підключи гаманець для запису в блокчейн' : needsPlan ? 'Потрібен тариф' : ''}
        </div>
      )}
    </div>
  );
}
