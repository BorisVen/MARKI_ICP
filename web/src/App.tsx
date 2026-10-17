import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuth, isBanned } from './auth';
import Login from './Login';
import Register from './Register';
import Shell, { PageId } from './Shell';
import HomePage from './pages/HomePage';
import ReelsPage from './pages/ReelsPage';
import ScanPage from './pages/ScanPage';
import MyNftsPage from './pages/MyNftsPage';
import OrdersPage from './pages/OrdersPage';
import VerifyPage from './pages/VerifyPage';
import FeedPage from './pages/FeedPage';
import NotificationsPage from './pages/NotificationsPage';
import ProfilePage from './pages/ProfilePage';
import AnalyticsPage from './pages/AnalyticsPage';
// ICP wallet code is heavy and only these pages need it: load them on demand.
const CreateNftPage = lazy(() => import('./pages/CreateNftPage'));
const PlansPage = lazy(() => import('./pages/PlansPage'));
const WalletPage = lazy(() => import('./pages/WalletPage'));
const IiBridge = lazy(() => import('./IiBridge'));
import NftViewerPage from './pages/NftViewerPage';
import GoodsCheckPage from './goods/GoodsCheckPage';
import MyGoodsPage from './goods/MyGoodsPage';
import PublicProfilePage from './pages/PublicProfilePage';
import GiftsPage from './gifts/GiftsPage';
import GiftClaimPage from './gifts/GiftClaimPage';
import { autoConnectWallet } from './icp/useWallet';
import { registerPush } from './native/push';
import { listenAppLinks } from './native/links';
import OpenInApp from './OpenInApp';
import { openNotification, type NotificationLink } from './openNotification';
import { initTheme } from './theme';

const PAGE_TITLES: Record<PageId, string> = {
  reels:         'Стрічка',
  scan:          'Сканер',
  home:          'Маркет',
  nfts:          'Мої паспорти',
  orders:        'Мої замовлення',
  verify:        'Перевірити товар',
  feed:          'Стрічка',
  notifications: 'Сповіщення',
  profile:       'Профіль',
  analytics:     'Аналітика',
  create:        'Створити NFT',
  plans:         'Тарифи',
  wallet: 'Гаманець',
  gifts:         'Подарунки',
  goods:         'Мої товари',
};

/** Pages opened from a QR code or a shared link; they work without signing in. */
export type PublicRoute =
  | { kind: 'profile'; username: string }
  | { kind: 'gift'; code: string }
  | { kind: 'goods'; code: string; transfer?: string }
  | { kind: 'id'; id: string; owner?: string }
  | { kind: 'nfc'; uid: string };

function readPublicRoute(): PublicRoute | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const u = params.get('u');
  const gift = params.get('gift');
  if (gift) return { kind: 'gift', code: gift };
  const goods = params.get('v');
  if (goods) return { kind: 'goods', code: goods, transfer: params.get('t') ?? undefined };
  const id = params.get('nft');
  const nfc = params.get('nfc');
  if (u) return { kind: 'profile', username: u.replace(/^@/, '') };
  if (id) return { kind: 'id', id, owner: params.get('owner') ?? undefined };
  if (nfc) return { kind: 'nfc', uid: nfc };
  return null;
}

initTheme();

// The app's wallet sign-in page (see IiBridge): no account needed, nothing else on it.
const II_LOGIN = new URLSearchParams(window.location.search).get('ii-login');

export default function App() {
  return II_LOGIN ? <Suspense fallback={null}><IiBridge sessionKey={II_LOGIN} /></Suspense> : <><OpenInApp /><MarkiApp /></>;
}

function MarkiApp() {
  const { fbUser, user, loading, error, needsRegistration, reload, logout } = useAuth();
  // The swipe feed opens first, as in TikTok / Instagram.
  // The feed opened from the marketplace starts on the tapped item.
  const [reelStart, setReelStart] = useState<string | null>(null);
  /** Opened from a notification: show who liked / the comments of the start post. */
  const [reelPanel, setReelPanel] = useState<'likes' | 'comments' | null>(null);
  const [giftsTab, setGiftsTab] = useState<'requests' | undefined>(undefined);

  // A tapped notification (push, banner or inbox) opens what it is about.
  useEffect(() => {
    const on = (e: Event) => {
      const { action, target, type } = (e as CustomEvent<NotificationLink>).detail ?? {};
      if ((action === 'likes' || action === 'comments') && target) {
        setReelStart(target);
        setReelPanel(action);
        setPage('reels');
      } else if (action === 'gift-requests') { setGiftsTab('requests'); setPage('gifts'); }
      else if (action === 'gifts' || type === 'gift') { setGiftsTab(undefined); setPage('gifts'); }
      else if (action === 'nfts' || type === 'nft_created') setPage('nfts');
      else if (action === 'orders' || type === 'purchase' || type === 'sale') setPage('orders');
      else if (action === 'goods') setPage('goods');
      else setPage('notifications');
    };
    window.addEventListener('marki:open-notification', on);
    return () => window.removeEventListener('marki:open-notification', on);
  }, []);
  // Back from a card payment (`?paid=…`): straight to «Тарифи» to see the result.
  const [page, setPage] = useState<PageId>(() => (new URLSearchParams(window.location.search).has('paid') ? 'plans' : 'home'));
  const [route, setRoute] = useState<PublicRoute | null>(() => readPublicRoute());
  // A guest on a public page asked to sign in (or sign up).
  const [authMode, setAuthMode] = useState<'login' | 'signup' | null>(null);

  useEffect(() => {
    const onPop = () => setRoute(readPublicRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Links into the app: a QR or link from the website, the way back from a card payment.
  useEffect(() => {
    listenAppLinks(link => {
      if (link.kind === 'paid') { setPage('plans'); return; }
      window.history.pushState({}, '', `?${link.params.toString()}`);
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
  }, []);

  // Signed in: the built-in wallet and phone notifications come up by themselves.
  useEffect(() => {
    if (!user) return;
    autoConnectWallet(user);
    registerPush(openNotification).catch(() => {});
  }, [user?.uid]);

  // Signing in from a public page brings the user back to it.
  useEffect(() => { if (fbUser) setAuthMode(null); }, [fbUser]);

  const closeRoute = () => {
    setRoute(null);
    if (window.location.search) window.history.replaceState({}, '', window.location.pathname);
  };

  const guest = !fbUser;
  if (loading && !user && !(guest && route)) return <div className="spinner">Завантаження…</div>;

  if (guest && (authMode || !route)) {
    return <Login initialMode={authMode ?? 'login'} onBack={route ? () => setAuthMode(null) : undefined} />;
  }
  if (!guest && needsRegistration) return <Register />;
  if (!guest && error && !user) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h2>Не вдалося завантажити профіль</h2>
          <p className="sub" style={{ wordBreak: 'break-word' }}>{error}</p>
          <button className="btn btn-primary btn-block" style={{ marginBottom: 8 }} onClick={reload}>
            Спробувати ще
          </button>
          <button className="btn btn-block" onClick={logout}>Вийти</button>
        </div>
      </div>
    );
  }
  if (!guest && isBanned(user)) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h2>Акаунт заблоковано</h2>
          <p className="sub">{user?.banReason ? `Причина: ${user.banReason}` : 'Звернися до підтримки Marki.'}</p>
          <button className="btn btn-block" onClick={logout}>Вийти</button>
        </div>
      </div>
    );
  }

  if (route) {
    const askSignIn = guest ? (mode: 'login' | 'signup') => setAuthMode(mode) : undefined;
    if (route.kind === 'goods') {
      return <GoodsCheckPage code={route.code} transferToken={route.transfer} onClose={closeRoute} onSignIn={askSignIn} />;
    }
    if (route.kind === 'gift') {
      return <GiftClaimPage code={route.code} onClose={closeRoute} onSignIn={askSignIn}
        onOpenPassports={() => { closeRoute(); setPage('nfts'); }} />;
    }
    return route.kind === 'profile'
      ? <PublicProfilePage username={route.username} onClose={closeRoute} onSignIn={askSignIn} />
      : <NftViewerPage source={route} onClose={closeRoute} onSignIn={askSignIn} />;
  }

  return (
    <Shell page={page} setPage={setPage} title={PAGE_TITLES[page]}>
      {page === 'reels'         && <ReelsPage key={`${reelStart}-${reelPanel}`} onJumpTo={setPage} startId={reelStart} startPanel={reelPanel} onBack={() => { setReelPanel(null); setPage('home'); }} />}
      {page === 'scan'          && <ScanPage onJumpTo={setPage} />}
      {page === 'home'          && <HomePage onJumpTo={setPage} onOpenFeed={id => { setReelStart(id ?? null); setReelPanel(null); setPage('reels'); }} />}
      {page === 'nfts'          && <MyNftsPage onJumpTo={setPage} />}
      {page === 'orders'        && <OrdersPage onJumpTo={setPage} />}
      {page === 'verify'        && <VerifyPage onJumpTo={setPage} />}
      {page === 'feed'          && <FeedPage />}
      {page === 'notifications' && <NotificationsPage />}
      {page === 'profile'       && <ProfilePage onJumpTo={setPage} />}
      {page === 'analytics'     && <AnalyticsPage onJumpTo={setPage} />}
      {page === 'create'        && <Suspense fallback={<div className="spinner">Завантаження…</div>}><CreateNftPage onJumpTo={setPage} /></Suspense>}
      {page === 'wallet'        && <Suspense fallback={<div className="spinner">Завантаження…</div>}><WalletPage onJumpTo={setPage} /></Suspense>}
      {page === 'plans'         && <Suspense fallback={<div className="spinner">Завантаження…</div>}><PlansPage /></Suspense>}
      {page === 'gifts'         && <GiftsPage key={giftsTab ?? 'all'} initialTab={giftsTab} />}
      {page === 'goods'         && <MyGoodsPage onOpen={code => { window.history.pushState({}, '', `?v=${encodeURIComponent(code)}`); setRoute({ kind: 'goods', code }); }} />}
    </Shell>
  );
}
