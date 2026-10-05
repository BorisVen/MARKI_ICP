import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  apiChangePassword,
  apiGetNFTs,
  apiGetPosts,
  apiMyLikes,
  apiMyReposts,
  apiMySaved,
  apiUpdateProfile,
  apiUploadAvatar,
  type NFT,
  type Post,
  type User,
} from '../api';
import { useAuth } from '../auth';
import EmptyState from '../EmptyState';
import { plural } from '../format';
import { Icon } from '../icons';
import ShareProfile, { profileUrl } from '../ShareProfile';
import type { PageId } from '../Shell';
import { GridSkeleton } from '../Skeleton';
import { getTheme, setTheme, type ThemeChoice } from '../theme';
import { postImage, postTitle } from './market';

type Tab = 'collections' | 'saved' | 'likes' | 'reposts';

export const fmtCount = (n?: number) => {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.0', '')} млн`;
  if (v >= 10_000) return `${(v / 1000).toFixed(1).replace('.0', '')} тис.`;
  return v.toLocaleString('uk-UA');
};

type NftLike = { id: string; title: string; image?: string; imageUrl?: string; batchName?: string; views?: number };

/** «Партії»: passports grouped by collection, with total views. */
export function groupNfts<T extends NftLike>(nfts: T[]) {
  const map = new Map<string, T[]>();
  nfts.forEach(n => {
    const key = n.batchName || n.title;
    map.set(key, [...(map.get(key) ?? []), n]);
  });
  return [...map.entries()]
    .map(([name, items]) => ({
      name,
      items,
      cover: items[0].imageUrl || items[0].image,
      views: items.reduce((a, n) => a + (n.views ?? 0), 0),
    }))
    .sort((a, b) => b.items.length - a.items.length);
}

/** Profile in the TikTok layout: identity and stats on top, content tabs below. */
export default function ProfilePage({ onJumpTo }: { onJumpTo: (p: PageId) => void }) {
  const { user, reload } = useAuth();
  const [tab, setTab] = useState<Tab>('collections');
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [likesFallback, setLikesFallback] = useState<number | undefined>(undefined);
  const photoInput = useRef<HTMLInputElement>(null);

  // Until the social API is deployed, count likes on the user's own posts here.
  useEffect(() => {
    if (!user || user.likesCount !== undefined) return;
    apiGetPosts()
      .then(ps => setLikesFallback(ps.filter(p => p.userId === user.uid).reduce((a, p) => a + (p.likes ?? 0), 0)))
      .catch(() => {});
  }, [user]);

  // «+» on the photo: pick and upload right away.
  const quickPhoto = async (file?: File) => {
    if (!file || !user) return;
    setUploading(true);
    try {
      await apiUploadAvatar(user.uid, file);
      await reload();
    } catch (e: any) {
      alert(e?.message ?? 'Не вдалося оновити фото');
    } finally {
      setUploading(false);
      if (photoInput.current) photoInput.current.value = '';
    }
  };

  if (!user) return null;
  // One file input for both the «+» on the avatar and «Змінити фото» in the editor.
  const photoField = <input ref={photoInput} type="file" accept="image/*" hidden onChange={e => quickPhoto(e.target.files?.[0])} />;
  if (editing) {
    return <>{photoField}<EditProfileScreen user={user} uploading={uploading} onClose={() => setEditing(false)} onPhoto={() => photoInput.current?.click()} /></>;
  }

  return (
    <div className="profile">
      {photoField}

      {/* Photo on the left above the name; edit and menu take its old place on the right. */}
      <div className="profile-top">
        <div className="ph-avatar">
          {user.avatar ? <img src={user.avatar} alt="" /> : <span>{(user.name || 'M').slice(0, 1).toUpperCase()}</span>}
          <button className="ph-plus" onClick={() => photoInput.current?.click()} disabled={uploading} title="Змінити фото">
            {uploading ? '…' : '+'}
          </button>
        </div>
        <div className="pt-actions">
          <button className="btn" onClick={() => setEditing(true)}><Icon.Edit /> Редагувати</button>
          <button className="icon-btn" onClick={() => setMenu(true)} title="Меню"><Icon.Menu /></button>
        </div>
      </div>

      <h1 className="ph-name">
        {user.name || 'Без імені'}
        {user.companyApproved && <span className="verified" title="Перевірений акаунт">✓</span>}
      </h1>
      <div className="ph-user">@{user.username}</div>
      <div className="ph-stats">
        <div><strong>{fmtCount(user.followingCount)}</strong><span>Стежу</span></div>
        <div><strong>{fmtCount(user.followersCount)}</strong><span>{plural(user.followersCount ?? 0, 'Підписник', 'Підписники', 'Підписників')}</span></div>
        <div><strong>{fmtCount(user.likesCount ?? likesFallback)}</strong><span>Вподобайки</span></div>
      </div>

      {user.bio
        ? <p className="ph-bio">{user.bio}</p>
        : <button className="ph-bio empty" onClick={() => setEditing(true)}>+ Додати біографію</button>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={() => onJumpTo('create')}><Icon.Plus /> Створити NFT</button>
        <button className="btn" onClick={() => setSharing(true)}><Icon.QrCode /> Поділитися профілем</button>
      </div>

      <div className="profile-tabs" role="tablist">
        <button className={tab === 'collections' ? 'active' : ''} onClick={() => setTab('collections')} title="Колекції"><Icon.Grid /></button>
        <button className={tab === 'saved' ? 'active' : ''} onClick={() => setTab('saved')} title="Збережені"><Icon.Bookmark /></button>
        <button className={tab === 'likes' ? 'active' : ''} onClick={() => setTab('likes')} title="Вподобайки"><Icon.Heart /></button>
        <button className={tab === 'reposts' ? 'active' : ''} onClick={() => setTab('reposts')} title="Репости"><Icon.Repost /></button>
      </div>

      {tab === 'collections' && <Collections onJumpTo={onJumpTo} />}
      {tab === 'saved' && <PostTab load={apiMySaved} icon="🔖" empty="Збережених поки немає" hint="Зберігай товари зі стрічки, щоб повернутися до них пізніше." privateTab />}
      {tab === 'likes' && <PostTab load={() => apiMyLikes().catch(async () => (await apiGetPosts()).filter(p => (p.likedBy ?? []).includes(user.uid)))} icon="❤️" empty="Вподобайок поки немає" hint="Тисни ❤️ у стрічці — вподобане з’явиться тут." privateTab />}
      {tab === 'reposts' && <PostTab load={apiMyReposts} icon="🔁" empty="Репостів поки немає" hint="Ділися товарами зі стрічки — репости побачать твої підписники." />}

      {menu && <MenuSheet onClose={() => setMenu(false)} onJumpTo={p => { setMenu(false); onJumpTo(p); }} />}
      {sharing && <ShareProfile name={user.name || user.username} username={user.username} avatar={user.avatar} onClose={() => setSharing(false)} />}
    </div>
  );
}

function Collections({ onJumpTo }: { onJumpTo: (p: PageId) => void }) {
  const [nfts, setNfts] = useState<NFT[] | null>(null);
  useEffect(() => { apiGetNFTs().then(setNfts).catch(() => setNfts([])); }, []);
  const groups = useMemo(() => groupNfts(nfts ?? []), [nfts]);

  if (!nfts) return <GridSkeleton count={6} />;
  if (groups.length === 0) {
    return <EmptyState icon="🪪" title="Колекцій поки немає" text="Товари, які ти купиш, з’являться тут згруповані за колекціями." action={<button className="btn btn-primary" onClick={() => onJumpTo('home')}>До маркету</button>} />;
  }
  return (
    <div className="profile-grid">
      {groups.map(g => (
        <button key={g.name} className="pg-tile" onClick={() => onJumpTo('nfts')} title={g.name}>
          {g.cover ? <img src={g.cover} alt="" /> : <span className="pg-ph">🪪</span>}
          {g.items.length > 1 && <span className="pg-badge">{g.items.length} шт</span>}
          <span className="pg-views">▷ {fmtCount(g.views)}</span>
          <span className="pg-title">{g.name}</span>
        </button>
      ))}
    </div>
  );
}

function PostTab({ load, icon, empty, hint, privateTab }: {
  load: () => Promise<Post[]>;
  icon: string;
  empty: string;
  hint: string;
  privateTab?: boolean;
}) {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const run = useCallback(() => {
    load().then(setPosts).catch(e => { setPosts([]); if (e?.status === 404) setUnavailable(true); });
  }, [load]);
  useEffect(() => { run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!posts) return <GridSkeleton count={6} />;
  return (
    <>
      {privateTab && <div className="muted private-note"><Icon.Lock /> Бачиш тільки ти</div>}
      {posts.length === 0 ? (
        <EmptyState icon={icon} title={unavailable ? 'Скоро буде' : empty} text={unavailable ? 'Ця вкладка запрацює після оновлення сервера.' : hint} />
      ) : (
        <div className="profile-grid">
          {posts.map(p => (
            <div key={p.id} className="pg-tile">
              {postImage(p) ? <img src={postImage(p)} alt="" /> : <span className="pg-ph">📝</span>}
              <span className="pg-title">{postTitle(p)}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

type Field = 'name' | 'username' | 'bio' | 'location' | 'deliveryAddress';

const FIELDS: Record<Field, { label: string; placeholder: string; max: number; multiline?: boolean; hint?: string }> = {
  name: { label: 'Ім’я', placeholder: 'Олена Коваль', max: 40 },
  username: { label: 'Ім’я користувача', placeholder: 'olena', max: 24, hint: 'Латиниця, цифри й «_». Змінюється посилання на профіль.' },
  bio: { label: 'Біографія', placeholder: 'Кілька слів про себе', max: 80, multiline: true },
  location: { label: 'Місто', placeholder: 'Київ, Україна', max: 40 },
  deliveryAddress: { label: 'Адреса доставки', placeholder: 'Київ, відділення №12', max: 120, multiline: true, hint: 'Підставимо її в замовлення. Бачиш тільки ти.' },
};

/** Full-screen editor in the TikTok layout: a list of fields, each opens its own editor. */
function EditProfileScreen({ user, uploading, onClose, onPhoto }: { user: User; uploading: boolean; onClose: () => void; onPhoto: () => void }) {
  const [field, setField] = useState<Field | null>(null);
  const [copied, setCopied] = useState(false);
  const url = profileUrl(user.username);
  const value = (f: Field) => (user[f] as string | undefined) ?? '';

  if (field) return <EditField field={field} initial={value(field)} onClose={() => setField(null)} />;

  const row = (f: Field) => (
    <button className="edit-row" onClick={() => setField(f)}>
      <span className="er-label">{FIELDS[f].label}</span>
      <span className={`er-value ${value(f) ? '' : 'muted'}`}>{value(f) || `Додати: ${FIELDS[f].label.toLowerCase()}`}</span>
      <span className="er-chev">›</span>
    </button>
  );

  return (
    <div className="edit-screen">
      <div className="edit-head">
        <button className="icon-btn" onClick={onClose} aria-label="Назад">‹</button>
        <h2>Редагувати профіль</h2>
        <span style={{ width: 36 }} />
      </div>

      <button className="edit-photo" onClick={onPhoto}>
        <span className="ep-avatar">
          {user.avatar ? <img src={user.avatar} alt="" /> : <span>{(user.name || 'M').slice(0, 1).toUpperCase()}</span>}
          <span className="ep-cam">📷</span>
        </span>
        <span className="ep-link">{uploading ? 'Завантажуємо…' : 'Змінити фото'}</span>
      </button>

      <div className="edit-group">
        {row('name')}
        {row('username')}
        <button className="edit-row" onClick={() => navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); })}>
          <span className="er-label" />
          <span className="er-value er-link">{copied ? 'Посилання скопійовано ✓' : url.replace(/^https?:\/\//, '')}</span>
          <span className="er-chev">⧉</span>
        </button>
      </div>

      <div className="edit-caption">Основні дані</div>
      <div className="edit-group">
        {row('bio')}
        {row('location')}
      </div>

      <div className="edit-caption">Покупки</div>
      <div className="edit-group">{row('deliveryAddress')}</div>
    </div>
  );
}

function EditField({ field, initial, onClose }: { field: Field; initial: string; onClose: () => void }) {
  const { user, reload } = useAuth();
  const meta = FIELDS[field];
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    let v = value.trim();
    if (field === 'username') {
      v = v.replace(/^@/, '');
      if (!/^[a-z0-9_]{3,24}$/i.test(v)) { setErr('Від 3 до 24 символів: латиниця, цифри, «_».'); return; }
    }
    if (field === 'name' && !v) { setErr('Ім’я не може бути порожнім.'); return; }
    setBusy(true);
    setErr(null);
    try {
      await apiUpdateProfile(user!.uid, { [field]: v });
      await reload();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? 'Не вдалося зберегти');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="edit-screen">
      <div className="edit-head">
        <button className="btn" onClick={onClose} disabled={busy}>Скасувати</button>
        <h2>{meta.label}</h2>
        <button className="btn btn-primary" onClick={save} disabled={busy || value.trim() === initial.trim()}>{busy ? '…' : 'Зберегти'}</button>
      </div>
      <div className="edit-group" style={{ padding: 14 }}>
        {meta.multiline
          ? <textarea className="edit-input" value={value} maxLength={meta.max} onChange={e => setValue(e.target.value)} placeholder={meta.placeholder} autoFocus rows={4} />
          : <input className="edit-input" value={value} maxLength={meta.max} onChange={e => setValue(e.target.value)} placeholder={meta.placeholder} autoFocus onKeyDown={e => e.key === 'Enter' && save()} />}
        <div className="edit-count">{value.length}/{meta.max}</div>
      </div>
      {meta.hint && <div className="edit-caption" style={{ textTransform: 'none', letterSpacing: 0 }}>{meta.hint}</div>}
      {err && <div className="error-banner" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  );
}

/** ☰ menu as a right-side drawer: profile card, shortcuts, settings, sign out. */
function MenuSheet({ onClose, onJumpTo }: { onClose: () => void; onJumpTo: (p: PageId) => void }) {
  const { user, logout } = useAuth();
  const [view, setView] = useState<'menu' | 'settings'>('menu');
  const [theme, setThemeState] = useState<ThemeChoice>(getTheme);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  // Slide out before unmounting.
  const close = () => { setClosing(true); window.setTimeout(onClose, 180); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const chooseTheme = (t: ThemeChoice) => { setTheme(t); setThemeState(t); };
  const changePw = async () => {
    if (pw.length < 8) { setErr('Пароль має містити щонайменше 8 символів.'); return; }
    setBusy(true);
    setErr(null);
    try {
      await apiChangePassword(user!.uid, pw);
      setMsg('Пароль змінено.');
      setPw('');
      setPwOpen(false);
    } catch (e: any) {
      setErr(e?.message ?? 'Не вдалося змінити пароль');
    } finally {
      setBusy(false);
    }
  };

  const item = (icon: React.ReactNode, label: string, sub: string | null, onClick: () => void) => (
    <button className="drawer-item" onClick={onClick}>
      <span className="di-icon">{icon}</span>
      <span className="di-body"><span className="di-label">{label}</span>{sub && <span className="di-sub">{sub}</span>}</span>
      <span className="di-chev">›</span>
    </button>
  );

  return (
    <div className={`drawer-backdrop ${closing ? 'closing' : ''}`} onClick={close}>
      <aside className={`drawer ${closing ? 'closing' : ''}`} onClick={e => e.stopPropagation()} role="dialog" aria-label="Меню">
        <div className="drawer-head">
          {view === 'settings'
            ? <button className="icon-btn" onClick={() => setView('menu')} aria-label="Назад">‹</button>
            : <span />}
          <strong>{view === 'menu' ? 'Меню' : 'Налаштування'}</strong>
          <button className="icon-btn" onClick={close} aria-label="Закрити">✕</button>
        </div>

        {view === 'menu' ? (
          <>
            <div className="drawer-user">
              {user!.avatar ? <img src={user!.avatar} alt="" /> : <span className="du-letter">{(user!.name || 'M').slice(0, 1).toUpperCase()}</span>}
              <div style={{ minWidth: 0 }}>
                <div className="du-name">{user!.name}{user!.companyApproved && <span className="verified" style={{ width: 16, height: 16, fontSize: 10, marginLeft: 6 }}>✓</span>}</div>
                <div className="muted" style={{ fontSize: 13 }}>@{user!.username}</div>
              </div>
            </div>

            <div className="drawer-caption">Створення</div>
            <div className="drawer-group">
              {item(<Icon.Plus />, 'Створити NFT', 'Паспорт для твоєї речі', () => onJumpTo('create'))}
              {item(<Icon.Tag />, 'Тарифи', 'Пакети мінтів у блокчейні ICP', () => onJumpTo('plans'))}
              {item(<Icon.Box />, 'Мої паспорти', null, () => onJumpTo('nfts'))}
            </div>

            <div className="drawer-caption">Статистика</div>
            <div className="drawer-group">
              {item(<Icon.Dashboard />, 'Аналітика', 'Перегляди профілю й паспортів', () => onJumpTo('analytics'))}
            </div>

            <div className="drawer-caption">Акаунт</div>
            <div className="drawer-group">
              {item(<Icon.Menu />, 'Налаштування', 'Тема, пароль', () => setView('settings'))}
            </div>

            <button className="drawer-logout" onClick={logout}>Вийти з акаунту</button>
          </>
        ) : (
          <>
            <div className="drawer-caption">Тема</div>
            <div className="theme-cards">
              {([['dark', '🌙', 'Темна'], ['light', '☀️', 'Світла'], ['system', '⚙️', 'Як у системі']] as [ThemeChoice, string, string][]).map(([t, icon, label]) => (
                <button key={t} className={`theme-card ${theme === t ? 'active' : ''}`} onClick={() => chooseTheme(t)}>
                  <span className={`tc-preview ${t}`}><span>{icon}</span></span>
                  {label}
                </button>
              ))}
            </div>

            <div className="drawer-caption">Акаунт</div>
            <div className="drawer-group" style={{ padding: '4px 14px' }}>
              <div className="md-row"><span className="muted">Email</span><span>{user!.email}</span></div>
              {user!.phone && <div className="md-row"><span className="muted">Телефон</span><span>{user!.phone}</span></div>}
            </div>

            <div className="drawer-caption">Безпека</div>
            {pwOpen ? (
              <div className="drawer-group" style={{ padding: 14 }}>
                <div className="field">
                  <label>Новий пароль</label>
                  <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Щонайменше 8 символів" autoComplete="new-password" autoFocus />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={() => setPwOpen(false)}>Скасувати</button>
                  <button className="btn btn-primary" onClick={changePw} disabled={busy || !pw}>{busy ? 'Змінюємо…' : 'Змінити пароль'}</button>
                </div>
              </div>
            ) : (
              <div className="drawer-group">{item(<Icon.Lock />, 'Змінити пароль', null, () => setPwOpen(true))}</div>
            )}
            {msg && <div className="success-banner" style={{ marginTop: 10 }}>{msg}</div>}
            {err && <div className="error-banner" style={{ marginTop: 10 }}>{err}</div>}
          </>
        )}
      </aside>
    </div>
  );
}
