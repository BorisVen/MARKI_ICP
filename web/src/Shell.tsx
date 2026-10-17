import { ReactNode, useEffect, useRef, useState } from 'react';
import TopToast, { showToast } from './TopToast';
import { Icon } from './icons';
import { useAuth } from './auth';
import { apiGetNotifications } from './api';
import Logo from './Logo';

export type PageId =
  | 'reels'
  | 'scan'
  | 'home'
  | 'nfts'
  | 'orders'
  | 'verify'
  | 'feed'
  | 'notifications'
  | 'analytics'
  | 'create'
  | 'plans'
  | 'wallet'
  | 'gifts'
  | 'goods'
  | 'profile';

type NavItem = {
  id: PageId;
  label: string;
  icon: ReactNode;
  /** Shown directly in the mobile bottom bar; the rest go under «Ще». */
  mobile?: boolean;
  /** Shorter label for the mobile bottom bar. */
  short?: string;
};

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Покупки',
    items: [
      { id: 'home',   label: 'Маркет',           icon: <Icon.Store />,  mobile: true },
      { id: 'reels',  label: 'Стрічка',          icon: <Icon.Play /> },
      { id: 'scan',   label: 'Сканувати QR',     icon: <Icon.QrCode />, mobile: true, short: 'Сканер' },
      { id: 'orders', label: 'Замовлення',       icon: <Icon.Truck /> },
      { id: 'verify', label: 'Перевірити за NFC', icon: <Icon.Scan /> },
    ],
  },
  {
    title: 'Моє',
    items: [
      { id: 'profile', label: 'Профіль',      icon: <Icon.User />, mobile: true },
      { id: 'create',  label: 'Створити NFT', icon: <Icon.Plus /> },
      { id: 'nfts',    label: 'Мої паспорти', icon: <Icon.Box /> },
      { id: 'goods',   label: 'Мої товари',   icon: <Icon.Box /> },
      { id: 'gifts',   label: 'Подарунки',    icon: <Icon.Gift /> },
      { id: 'wallet',  label: 'Гаманець',     icon: <Icon.Wallet /> },
      { id: 'plans',   label: 'Тарифи',       icon: <Icon.Tag /> },
    ],
  },
  {
    title: 'Спільнота',
    items: [
      { id: 'notifications', label: 'Сповіщення', icon: <Icon.Bell /> },
    ],
  },
];

const ALL_NAV = NAV_GROUPS.flatMap(g => g.items);

type Props = {
  page: PageId;
  setPage: (p: PageId) => void;
  title: string;
  children: ReactNode;
};

export default function Shell({ page, setPage, title, children }: Props) {
  const { fbUser, user, logout } = useAuth();
  const [unread, setUnread] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const displayName = user?.companyName || user?.name || fbUser?.email || 'Ви';

  // Each page shows its own heading; the title goes to the browser tab.
  useEffect(() => { document.title = `${title} · Marki`; }, [title]);

  // Unread badge, and a banner for anything new (also on the web, where there is no push).
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => apiGetNotifications()
      .then(n => {
        if (cancelled) return;
        setUnread(n.filter(x => !x.read).length);
        const fresh = known.current ? n.filter(x => !x.read && !known.current!.has(x.id)) : [];
        known.current = new Set(n.map(x => x.id));
        const newest = fresh.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (newest) showToast({ id: newest.id, title: newest.title, text: newest.text ?? newest.body, type: newest.type });
      })
      .catch(() => {});
    load();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') load(); }, 15_000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, [page]);

  const go = (p: PageId) => {
    setPage(p);
    setMoreOpen(false);
    window.scrollTo({ top: 0 });
  };

  const mobileItems = ALL_NAV.filter(n => n.mobile);
  const moreItems = ALL_NAV.filter(n => !n.mobile);
  const moreActive = moreItems.some(n => n.id === page);

  const navButton = (item: NavItem) => (
    <button
      key={item.id}
      className={`nav-item ${page === item.id ? 'active' : ''}`}
      onClick={() => go(item.id)}
    >
      <span className="ic">{item.icon}</span>
      {item.label}
      {item.id === 'notifications' && unread > 0 && <span className="nav-count">{unread}</span>}
    </button>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><Logo /></div>
        {NAV_GROUPS.map(g => (
          <div key={g.title} className="nav-group">
            <div className="nav-group-title">{g.title}</div>
            {g.items.map(navButton)}
          </div>
        ))}
      </aside>

      <main className="main">
        <header className="topbar">
          <h1><Logo size={24} /></h1>
          <div className="who">
            <button className="icon-btn" title="Сповіщення" onClick={() => go('notifications')}>
              <Icon.Bell />
              {unread > 0 && <span className="dot-count">{unread > 9 ? '9+' : unread}</span>}
            </button>
            <button className="user-chip" onClick={() => go('profile')} title="Профіль">
              {user?.avatar
                ? <img src={user.avatar} alt="" />
                : <span className="avatar-letter">{displayName.slice(0, 1).toUpperCase()}</span>}
              <span className="user-name">{displayName}</span>
            </button>
            <button className="logout" onClick={logout}>Вийти</button>
          </div>
        </header>

        <div className="content">{children}</div>
      </main>

      {moreOpen && (
        <div className="sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            {moreItems.map(navButton)}
          </div>
        </div>
      )}

      <TopToast onOpen={() => go('notifications')} />

      <nav className="mobile-nav">
        {/* Scan sits in the middle as a round button: the one action buyers need most. */}
        {/* Market · Scanner · [Create NFT] · Inbox · Profile; the feed opens from the market. */}
        {(['home', 'scan', 'create', 'notifications', 'profile'] as PageId[]).map(id => {
          const item = ALL_NAV.find(i => i.id === id)!;
          const label = id === 'notifications' ? 'Вхідні' : id === 'create' ? 'Створити' : (item.short ?? item.label);
          return (
            <button
              key={id}
              className={`nav-item ${id === 'create' ? 'nav-fab' : ''} ${page === id ? 'active' : ''}`}
              onClick={() => go(id)}
            >
              <span className="ic">{item.icon}</span>
              {label}
              {id === 'notifications' && unread > 0 && <span className="dot-count" style={{ top: 6, right: '28%' }}>{unread > 9 ? '9+' : unread}</span>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
