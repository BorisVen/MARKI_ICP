import { useCallback, useEffect, useRef, useState } from 'react';
import { apiAddComment, apiFollow, apiLikePost, apiPublicProfile, apiRepostPost, type Post, type PublicProfile } from '../api';
import { useAuth } from '../auth';
import { fmtAgo, fmtPrice, plural } from '../format';
import { Icon } from '../icons';
import type { PageId } from '../Shell';
import { publicUrl } from '../publicUrl';
import { openProfile, PeopleRow } from '../People';
import { askPushPermission } from '../native/push';
import { cachedPosts, loadPosts, rank, rememberPost, useProgressive } from '../feed';
import { postAuthor, postAvatar, postImage, postNftId, postTitle, ProductModal } from './market';

/** Opens a public page of the app (passport, profile) the way a QR link would. */
const openRoute = (search: string) => {
  window.history.pushState({}, '', search);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

const HISTORY_KEY = 'marki.viewed';
/** Posts this device viewed, newest first: a personal convenience, kept locally. */
export function readHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
}
export function remember(id: string) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify([id, ...readHistory().filter(x => x !== id)].slice(0, 60))); } catch { /* storage blocked */ }
}

const short = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n));

/**
 * The home feed, TikTok-style: one NFT per screen, swipe up for the next. Actions
 * sit on the right (follow, like, comments, repost, share); title, price, «Купити»
 * and «Паспорт» at the bottom.
 */
export default function ReelsPage({ onJumpTo, startId, startPanel, onBack }: {
  onJumpTo: (p: PageId) => void;
  /** Opened from the marketplace (or a notification) on this post. */
  startId?: string | null;
  /** Opened from a notification: who liked it, or its comments. */
  startPanel?: 'likes' | 'comments' | null;
  /** Back to the marketplace (shown when opened from it). */
  onBack?: () => void;
}) {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[] | null>(() => { const c = cachedPosts(); return c ? rank(c, user?.uid, readHistory()) : null; });
  const [error, setError] = useState<string | null>(null);
  const [buying, setBuying] = useState<Post | null>(null);
  const [comments, setComments] = useState<Post | null>(null);
  const [likers, setLikers] = useState<Post | null>(null);
  const [panel, setPanel] = useState<'search' | 'history' | null>(null);
  const feed = useRef<HTMLDivElement>(null);

  // A reel counts as viewed once it fills most of the screen.
  useEffect(() => {
    const root = feed.current;
    if (!root || !posts?.length) return;
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) remember((e.target as HTMLElement).dataset.id!); }),
      { root, threshold: 0.7 },
    );
    root.querySelectorAll('.reel[data-id]').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [posts]);

  // Opened on a post (from the marketplace or a notification): start there.
  const started = useRef(false);
  useEffect(() => {
    if (!startId || !posts?.length || started.current) return;
    started.current = true;
    feed.current?.querySelector(`[data-id="${CSS.escape(startId)}"]`)?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
    const post = posts.find(p => p.id === startId);
    if (post && startPanel === 'comments') setComments(post);
    if (post && startPanel === 'likes') setLikers(post);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts]);

  const jumpTo = (id: string) => {
    setPanel(null);
    // The picked post may not be drawn yet: draw up to it, then scroll there.
    showMore((posts?.findIndex(p => p.id === id) ?? 0) + 3);
    requestAnimationFrame(() => feed.current?.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'instant' as ScrollBehavior }));
  };

  // Same order as «Рекомендації» in the marketplace; loaded once for both.
  const order = useCallback((list: Post[]) => rank(list, user?.uid, readHistory()), [user?.uid]);
  const load = useCallback(async () => {
    setError(null);
    try {
      const fresh = await loadPosts();
      // Keep the order already on screen (re-ranking under the finger would jump).
      setPosts(cur => (cur ? cur.map(p => fresh.find(x => x.id === p.id) ?? p) : order(fresh)));
    } catch (e: any) {
      setError(e?.message ?? 'Не вдалося завантажити стрічку');
      setPosts(p => p ?? []);
    }
  }, [order]);

  useEffect(() => { load(); }, [load]);

  const update = (p: Post) => { rememberPost(p); setPosts(list => list?.map(x => (x.id === p.id ? p : x)) ?? null); };
  const startIndex = startId && posts ? posts.findIndex(p => p.id === startId) : -1;
  const { count, sentinel, showMore } = useProgressive(posts?.length ?? 0, { atLeast: startIndex + 3, root: () => feed.current });

  if (!posts) return <div className="reels"><div className="reel reel-loading"><div className="spinner">Завантажуємо стрічку…</div></div></div>;
  if (posts.length === 0) {
    return (
      <div className="reels">
        <div className="reel reel-loading">
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 40 }}>🛍️</div>
            <p>{error ?? 'Поки що тут порожньо.'}</p>
            <button className="btn btn-primary" onClick={() => (onBack ? onBack() : onJumpTo('home'))}>До маркету</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="reels-wrap">
        <div className="reels-top">
          {onBack
            ? <button className="reels-icon" onClick={onBack} aria-label="До маркету"><Icon.Back size={24} /></button>
            : <button className="reels-icon" onClick={() => setPanel('history')} aria-label="Історія переглядів"><Icon.Clock size={24} /></button>}
          <span className="reels-label">Стрічка</span>
          <button className="reels-icon" onClick={() => setPanel('search')} aria-label="Пошук"><Icon.Search size={24} /></button>
        </div>
      <div className="reels" ref={feed}>
        {posts.slice(0, count).map(p => (
          <Reel key={p.id} post={p} uid={user?.uid} onChange={update} onBuy={() => setBuying(p)} onComments={() => setComments(p)} />
        ))}
        {posts.length > count && <div ref={sentinel} className="reel-more" />}
      </div>
      </div>
      {panel && <FindSheet mode={panel} posts={posts} onPick={jumpTo} onClose={() => setPanel(null)} />}
      {buying && <ProductModal post={buying} onClose={() => setBuying(null)} onOrdered={() => { setBuying(null); onJumpTo('orders'); }} />}
      {likers && <LikesSheet post={likers} onClose={() => setLikers(null)} />}
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
    askPushPermission().catch(() => {});
    // Optimistic: the heart reacts at once, the server confirms.
    onChange({ ...post, likes: (post.likes ?? 0) + (liked ? -1 : 1), likedBy: liked ? post.likedBy?.filter(x => x !== uid) : [...(post.likedBy ?? []), uid] });
    try { onChange(await apiLikePost(post.id)); } catch { onChange(post); }
  };
  // Double tap on the picture likes it, like on TikTok / Instagram.
  const tap = () => {
    if (post.discover) return;
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
    const url = publicUrl(passportSearch);
    const title = postTitle(post);
    if (navigator.share) { try { await navigator.share({ title, text: `${title} — у Marki`, url }); return; } catch { /* cancelled */ } }
    await navigator.clipboard?.writeText(url);
  };

  return (
    <section className="reel" data-id={post.id}>
      <div className="reel-media" onClick={tap}>
        <img className="reel-bg" src={image} alt="" aria-hidden />
        <img className="reel-img" src={image} alt={postTitle(post)} loading="lazy" />
        {pop && <div className="reel-pop">❤️</div>}
      </div>

      <div className="reel-side">
        <div className="reel-avatar" onClick={() => openProfile({ uid: post.userId })} role="button" aria-label="Профіль автора">
          {postAvatar(post) ? <img src={postAvatar(post)} alt="" /> : <span>{postAuthor(post).slice(0, 1).toUpperCase()}</span>}
          {!mine && !following && <button className="reel-follow" onClick={e => { e.stopPropagation(); follow(); }} aria-label="Підписатися">+</button>}
        </div>
        {/* A collection from someone's profile is not a post: no likes or comments on it. */}
        {!post.discover && <>
          <button className={`reel-act ${liked ? 'on' : ''}`} onClick={like} aria-label="Подобається">
            <Icon.Heart size={30} /><span>{short(post.likes ?? 0)}</span>
          </button>
          <button className="reel-act" onClick={onComments} aria-label="Коментарі">
            <Icon.Comment size={30} /><span>{short(post.comments?.length ?? 0)}</span>
          </button>
          <button className="reel-act" onClick={repost} aria-label="Репост">
            <Icon.Repost size={28} /><span>{short(post.reposts ?? 0)}</span>
          </button>
        </>}
        <button className="reel-act" onClick={share} aria-label="Поділитися">
          <Icon.Share size={28} /><span>Надіслати</span>
        </button>
      </div>

      <div className="reel-info">
        <div className="reel-author"><button className="rc-name-btn" onClick={() => openProfile({ uid: post.userId })}>@{postAuthor(post)}</button> · <span>{fmtAgo(post.createdAt)}</span></div>
        <div className="reel-title">{postTitle(post)}{post.discover && (post.count ?? 1) > 1 ? ` · ${post.count} шт` : ""}</div>
        {(post.description || post.text) && <div className="reel-desc">{post.description || post.text}</div>}
        <div className="reel-buttons">
          {forSale && <button className="btn btn-primary" onClick={onBuy}>Купити · {fmtPrice(post.price, post.currency)}</button>}
          {passportSearch && <button className="btn reel-ghost" onClick={() => openRoute(passportSearch)}>Паспорт NFT</button>}
        </div>
      </div>
    </section>
  );
}

const QUICK = ['❤️', '🔥', '😍', '👏', '😂', '😮', '🙌'];

/** Comments, TikTok-style: who wrote what, quick emoji, a send button that wakes up when there is text. */
export function CommentsSheet({ post, onClose, onChange }: { post: Post; onClose: () => void; onChange: (p: Post) => void }) {
  const { user } = useAuth();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = [...(post.comments ?? [])].reverse();
  const can = !!user && !!text.trim() && !busy;

  const send = async () => {
    if (!can) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await apiAddComment(post.id, text.trim()));
      setText('');
      askPushPermission().catch(() => {});
    } catch (e: any) {
      setError(e?.message ?? 'Не вдалося надіслати');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet rc-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="rc-head">
          <strong>{list.length ? `${list.length} ${plural(list.length, 'коментар', 'коментарі', 'коментарів')}` : 'Коментарі'}</strong>
          <button className="rc-close" onClick={onClose} aria-label="Закрити">✕</button>
        </div>

        <div className="rc-list">
          {list.length === 0 ? (
            <div className="rc-empty">
              <div>💬</div>
              <strong>Ще немає коментарів</strong>
              <span>Будьте першим — напишіть, що думаєте</span>
            </div>
          ) : list.map(c => {
            const name = c.userName || (c.userId === user?.uid ? user?.name : '') || 'Користувач Marki';
            const avatar = c.userAvatar || (c.userId === user?.uid ? user?.avatar : '');
            const author = c.userId === post.userId;
            return (
              <div key={c.id} className="rc-item">
                <button className="rc-avatar-btn" onClick={() => { onClose(); openProfile({ uid: c.userId }); }} aria-label={`Профіль ${name}`}>
                  <span className="rc-avatar">{avatar ? <img src={avatar} alt="" /> : name.slice(0, 1).toUpperCase()}</span>
                </button>
                <div className="rc-body">
                  <div className="rc-meta">
                    <button className="rc-name-btn" onClick={() => { onClose(); openProfile({ uid: c.userId }); }}><strong>{name}</strong></button>
                    {author && <span className="rc-badge">автор</span>}
                    {c.userId === user?.uid && !author && <span className="rc-you">ви</span>}
                  </div>
                  <div className="rc-text">{c.text}</div>
                  <div className="rc-time">{fmtAgo(c.createdAt)}</div>
                </div>
              </div>
            );
          })}
        </div>

        {error && <div className="rc-error">{error}</div>}
        <div className="rc-quick">
          {QUICK.map(e => (
            <button key={e} onClick={() => { setText(t => t + e); input.current?.focus(); }}>{e}</button>
          ))}
        </div>
        <div className="rc-input">
          <span className="rc-avatar">{user?.avatar ? <img src={user.avatar} alt="" /> : (user?.name || 'M').slice(0, 1).toUpperCase()}</span>
          <input
            ref={input}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={user ? 'Додати коментар…' : 'Увійдіть, щоб коментувати'}
            disabled={!user}
            maxLength={500}
            enterKeyHint="send"
            onKeyDown={e => e.key === 'Enter' && send()}
          />
          <button className={`rc-send ${can ? 'on' : ''}`} onClick={send} disabled={!can} aria-label="Надіслати">
            {busy ? <span className="mini-spin" /> : <Icon.Send size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Who liked a post (opened from a like notification). */
function LikesSheet({ post, onClose }: { post: Post; onClose: () => void }) {
  const ids = (post.likedBy ?? []).slice(-50).reverse();
  const [people, setPeople] = useState<PublicProfile[] | null>(null);
  useEffect(() => {
    Promise.all(ids.map(id => apiPublicProfile(id).catch(() => null)))
      .then(list => setPeople(list.filter((p): p is PublicProfile => !!p)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet rc-sheet" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="rc-head">
          <strong>❤️ Вподобали · {post.likes ?? ids.length}</strong>
          <button className="rc-close" onClick={onClose} aria-label="Закрити">✕</button>
        </div>
        <div className="rc-list">
          {!people ? <div className="spinner">Завантаження…</div>
            : people.length === 0 ? <div className="rc-empty"><div>🤍</div><strong>Поки нікого</strong></div>
            : people.map(u => (
              <button key={u.uid} className="lk-item" onClick={() => { onClose(); openRoute(`?u=${encodeURIComponent(u.username)}`); }}>
                <span className="rc-avatar">{u.avatar ? <img src={u.avatar} alt="" /> : (u.name || u.username).slice(0, 1).toUpperCase()}</span>
                <span className="lk-names"><strong>{u.name || u.username}</strong><small>@{u.username}</small></span>
                <span className="lk-heart">❤️</span>
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

/** Search (top right) and view history (top left) over the feed. */
function FindSheet({ mode, posts, onPick, onClose }: { mode: 'search' | 'history'; posts: Post[]; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const list = mode === 'history'
    ? readHistory().map(id => posts.find(p => p.id === id)).filter((p): p is Post => !!p)
    : posts.filter(p => !query || [postTitle(p), postAuthor(p), p.description, p.text, ...(p.tags ?? [])].some(v => v?.toLowerCase().includes(query)));
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet reel-find" onClick={e => e.stopPropagation()}>
        <div className="sheet-handle" />
        {mode === 'search'
          ? <input className="rf-input" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Товари, люди, #теги" />
          : <h3 style={{ margin: '4px 0 10px', textAlign: 'center', fontSize: 15 }}>Ви переглядали</h3>}
        {mode === 'search' && <PeopleRow query={q} />}
        <div className="rf-grid">
          {list.length === 0
            ? <p className="muted" style={{ gridColumn: '1 / -1', textAlign: 'center' }}>{mode === 'history' ? 'Історія порожня — гортайте маркет 🙂' : 'Нічого не знайдено'}</p>
            : list.map(p => (
              <button key={p.id} className="rf-item" onClick={() => onPick(p.id)}>
                <img src={postImage(p)} alt="" loading="lazy" />
                <span>{postTitle(p)}</span>
                {p.forSale && p.price != null && <strong>{fmtPrice(p.price, p.currency)}</strong>}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
