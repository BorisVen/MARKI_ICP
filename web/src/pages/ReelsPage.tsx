import { useCallback, useEffect, useRef, useState } from 'react';
import { apiAddComment, apiFollow, apiGetPosts, apiLikePost, apiRepostPost, type Post } from '../api';
import { useAuth } from '../auth';
import { fmtAgo, fmtPrice } from '../format';
import { Icon } from '../icons';
import type { PageId } from '../Shell';
import { postAuthor, postAvatar, postImage, postNftId, postTitle, ProductModal } from './market';

/** Opens a public page of the app (passport, profile) the way a QR link would. */
const openRoute = (search: string) => {
  window.history.pushState({}, '', search);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

const short = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n));

/**
 * The home feed, TikTok-style: one NFT per screen, swipe up for the next. Actions
 * sit on the right (follow, like, comments, repost, share); title, price, «Купити»
 * and «Паспорт» at the bottom.
 */
export default function ReelsPage({ onJumpTo }: { onJumpTo: (p: PageId) => void }) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<Post | null>(null);
  const [comments, setComments] = useState<Post | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const all = await apiGetPosts();
      setPosts(all.filter(p => postImage(p)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    } catch (e: any) {
      setError(e?.message ?? 'Не вдалося завантажити стрічку');
      setPosts([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const update = (p: Post) => setPosts(list => list?.map(x => (x.id === p.id ? p : x)) ?? null);

  if (!posts) return <div className="reels"><div className="reel reel-loading"><div className="spinner">Завантажуємо стрічку…</div></div></div>;
  if (posts.length === 0) {
    return (
      <div className="reels">
        <div className="reel reel-loading">
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 40 }}>🛍️</div>
            <p>{error ?? 'Поки що тут порожньо.'}</p>
            <button className="btn btn-primary" onClick={() => onJumpTo('home')}>До маркету</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="reels">
        {posts.map(p => (
          <Reel key={p.id} post={p} uid={user?.uid} onChange={update} onBuy={() => setBuying(p)} onComments={() => setComments(p)} />
        ))}
      </div>
      {buying && <ProductModal post={buying} onClose={() => setBuying(null)} onOrdered={() => { setBuying(null); onJumpTo('orders'); }} />}
      {comments && <CommentsSheet post={comments} onClose={() => setComments(null)} onChange={p => { update(p); setComments(p); }} />}
    </>
  );
}

function Reel({ post, uid, onChange, onBuy, onComments }: {
  post: Post;
  uid?: string;
  onChange: (p: Post) => void;
  onBuy: () => void;
  onComments: () => void;
}) {
  const liked = !!uid && !!post.likedBy?.includes(uid);
  const mine = post.userId === uid;
  const [following, setFollowing] = useState(false);
  const [pop, setPop] = useState(false);
  const lastTap = useRef(0);
  const image = postImage(post);
  const nftId = postNftId(post);
  const forSale = !!post.forSale && !mine && post.price != null;

  const like = async () => {
    if (!uid) return;
    // Optimistic: the heart reacts at once, the server confirms.
    onChange({ ...post, likes: (post.likes ?? 0) + (liked ? -1 : 1), likedBy: liked ? post.likedBy?.filter(x => x !== uid) : [...(post.likedBy ?? []), uid] });
    try { onChange(await apiLikePost(post.id)); } catch { onChange(post); }
  };
  // Double tap on the picture likes it, like on TikTok / Instagram.
  const tap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300 && !liked) { like(); setPop(true); setTimeout(() => setPop(false), 600); }
    lastTap.current = now;
  };
  const repost = async () => {
    try { const r = await apiRepostPost(post.id); onChange({ ...post, reposts: r.reposts }); } catch { /* signed out */ }
  };
  const follow = async () => {
    setFollowing(true);
    try { await apiFollow(post.userId); } catch { setFollowing(false); }
  };
  const passportSearch = nftId ? `?nft=${encodeURIComponent(nftId)}&owner=${encodeURIComponent(post.userId)}` : '';
  const share = async () => {
    const url = `${window.location.origin}${import.meta.env.BASE_URL}${passportSearch}`;
    const title = postTitle(post);
    if (navigator.share) { try { await navigator.share({ title, text: `${title} — у Marki`, url }); return; } catch { /* cancelled */ } }
    await navigator.clipboard?.writeText(url);
  };

  return (
    <section className="reel">
      <div className="reel-media" onClick={tap}>
        <img className="reel-bg" src={image} alt="" aria-hidden />
        <img className="reel-img" src={image} alt={postTitle(post)} loading="lazy" />
        {pop && <div className="reel-pop">❤️</div>}
      </div>

      <div className="reel-side">
        <div className="reel-avatar">
          {postAvatar(post) ? <img src={postAvatar(post)} alt="" /> : <span>{postAuthor(post).slice(0, 1).toUpperCase()}</span>}
          {!mine && !following && <button className="reel-follow" onClick={follow} aria-label="Підписатися">+</button>}
        </div>
        <button className={`reel-act ${liked ? 'on' : ''}`} onClick={like} aria-label="Подобається">
          <Icon.Heart size={30} /><span>{short(post.likes ?? 0)}</span>
        </button>
        <button className="reel-act" onClick={onComments} aria-label="Коментарі">
          <Icon.Comment size={30} /><span>{short(post.comments?.length ?? 0)}</span>
        </button>
        <button className="reel-act" onClick={repost} aria-label="Репост">
          <Icon.Repost size={28} /><span>{short(post.reposts ?? 0)}</span>
        </button>
        <button className="reel-act" onClick={share} aria-label="Поділитися">
          <Icon.Share size={28} /><span>Надіслати</span>
        </button>
      </div>

      <div className="reel-info">
        <div className="reel-author">@{postAuthor(post)} · <span>{fmtAgo(post.createdAt)}</span></div>
        <div className="reel-title">{postTitle(post)}</div>
        {(post.description || post.text) && <div className="reel-desc">{post.description || post.text}</div>}
        <div className="reel-buttons">
          {forSale && <button className="btn btn-primary" onClick={onBuy}>Купити · {fmtPrice(post.price, post.currency)}</button>}
          {passportSearch && <button className="btn reel-ghost" onClick={() => openRoute(passportSearch)}>Паспорт NFT</button>}
        </div>
      </div>
    </section>
  );
}

function CommentsSheet({ post, onClose, onChange }: { post: Post; onClose: () => void; onChange: (p: Post) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { onChange(await apiAddComment(post.id, text.trim())); setText(''); } catch (e: any) { alert(e?.message ?? 'Не вдалося'); } finally { setBusy(false); }
  };
  const list = [...(post.comments ?? [])].reverse();
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet reel-comments" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <h3 style={{ margin: '4px 0 10px', textAlign: 'center', fontSize: 15 }}>Коментарі · {list.length}</h3>
        <div className="rc-list">
          {list.length === 0 ? <p className="muted" style={{ textAlign: 'center' }}>Будьте першим 👋</p> : list.map(c => (
            <div key={c.id} className="rc-item"><span>{c.text}</span><small className="muted">{fmtAgo(c.createdAt)}</small></div>
          ))}
        </div>
        <div className="rc-input">
          <input value={text} onChange={e => setText(e.target.value)} placeholder="Додати коментар…" maxLength={500} onKeyDown={e => e.key === 'Enter' && send()} />
          <button className="btn btn-primary" onClick={send} disabled={busy || !text.trim()}>Надіслати</button>
        </div>
      </div>
    </div>
  );
}
