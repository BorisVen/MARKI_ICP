import { useCallback, useEffect, useState } from 'react';
import { apiCashOnDelivery, apiGetPosts, type Post } from '../api';
import { useAuth } from '../auth';
import { fmtAgo, fmtPrice } from '../format';
import { Icon } from '../icons';

/** Title without the technical « (3/3 editions)» suffix; the count shows as a badge. */
export const postTitle = (p: Post) =>
  (p.nftTitle || p.title || 'Товар').replace(/\s*\(\d+(?:\/\d+)? editions\)$/i, '');
export const postImage = (p: Post) => p.nftImage || p.nftImages?.[0] || '';
/** NFT id the backend moves to the buyer (first one for a collection). */
const postNftId = (p: Post) => p.walletNftId || p.walletNftIds?.[0] || p.nftId || '';

/** Listings other people put up for sale, newest first. */
export function useCatalog() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await apiGetPosts();
      setPosts(
        all
          .filter(p => p.forSale && p.userId !== user?.uid && postImage(p) && postNftId(p))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
    } catch (e: any) {
      setError(e?.message ?? 'Не вдалося завантажити каталог');
    } finally {
      setLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => { reload(); }, [reload]);
  return { posts, loading, error, reload };
}

export function ProductCard({ post, onOpen }: { post: Post; onOpen: () => void }) {
  return (
    <button className="card product-card" onClick={onOpen}>
      <img src={postImage(post)} alt={postTitle(post)} />
      <div className="pc-body">
        <div className="pc-title">{postTitle(post)}</div>
        <div className="muted" style={{ fontSize: 12 }}>{post.authorName || 'Продавець Marki'}</div>
        <div className="pc-foot">
          <strong>{fmtPrice(post.price, post.currency)}</strong>
          {post.nftImages && post.nftImages.length > 1 && <span className="badge badge-muted">{post.nftImages.length} шт</span>}
        </div>
      </div>
    </button>
  );
}

export function ProductModal({ post, onClose, onOrdered }: { post: Post; onClose: () => void; onOrdered: () => void }) {
  const { user } = useAuth();
  const [step, setStep] = useState<'view' | 'order' | 'done'>('view');
  const [fullName, setFullName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [address, setAddress] = useState(user?.deliveryAddress ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const order = async () => {
    if (!fullName.trim() || !phone.trim() || !address.trim()) {
      setError('Заповни ім’я, телефон і адресу доставки.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiCashOnDelivery({
        postId: post.id,
        nftId: post.walletNftId || post.walletNftIds?.[0] || post.nftId || '',
        deliveryAddress: address.trim(),
        currency: post.currency || 'UAH',
        fullName: fullName.trim(),
        phone: phone.trim(),
      });
      setStep('done');
    } catch (e: any) {
      setError(e?.message ?? 'Не вдалося оформити замовлення');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal product-modal" onClick={e => e.stopPropagation()}>
        {step === 'done' ? (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 44 }}>🎉</div>
            <h3>Замовлення оформлено!</h3>
            <p className="sub" style={{ margin: '6px auto 16px', maxWidth: 360 }}>
              Продавець підтвердить замовлення й відправить товар. Оплата — при отриманні.
              Стежити за доставкою можна в «Мої замовлення».
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={onOrdered}>Мої замовлення</button>
              <button className="btn" onClick={onClose}>До каталогу</button>
            </div>
          </div>
        ) : (
          <>
            <img src={postImage(post)} alt={postTitle(post)} className="pm-image" />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: '0 0 2px' }}>{postTitle(post)}</h3>
                <div className="muted" style={{ fontSize: 12 }}>{post.authorName || 'Продавець Marki'} · {fmtAgo(post.createdAt)}</div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtPrice(post.price, post.currency)}</div>
            </div>
            {(post.text || post.description) && <p style={{ fontSize: 14, lineHeight: 1.5 }}>{post.text || post.description}</p>}
            <div className="pm-perks">
              <div className="pp-title">Що ти отримаєш</div>
              <span>🪪 <b>Цифровий паспорт</b> — доказ, що товар оригінальний і належить тобі</span>
              <span>📲 <b>Перевірка за NFC</b> — приклади телефон до мітки на товарі</span>
              <span>💵 <b>Оплата при отриманні</b> — платиш, коли товар у руках</span>
            </div>

            {step === 'view' ? (
              <div className="actions">
                <button className="btn" onClick={onClose}>Закрити</button>
                <button className="btn btn-primary" onClick={() => setStep('order')}>Замовити</button>
              </div>
            ) : (
              <>
                <div className="section-title" style={{ marginTop: 14 }}>Доставка</div>
                <div className="field">
                  <label>Ім’я та прізвище отримувача</label>
                  <input value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" />
                </div>
                <div className="field">
                  <label>Телефон</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+380 67 123 45 67" autoComplete="tel" inputMode="tel" />
                </div>
                <div className="field">
                  <label>Адреса або відділення Нової пошти</label>
                  <textarea value={address} onChange={e => setAddress(e.target.value)} placeholder="Київ, відділення №12" />
                </div>
                {error && <div className="error-banner">{error}</div>}
                <div className="actions">
                  <button className="btn" onClick={() => setStep('view')} disabled={busy}>Назад</button>
                  <button className="btn btn-primary" onClick={order} disabled={busy}>
                    {busy ? 'Оформлюємо…' : `Замовити за ${fmtPrice(post.price, post.currency)}`}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
