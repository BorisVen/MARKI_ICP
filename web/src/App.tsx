import { useEffect, useState } from 'react';
import { useAuth, isBanned } from './auth';
import Login from './Login';
import Register from './Register';
import Shell, { PageId } from './Shell';
import HomePage from './pages/HomePage';
import MyNftsPage from './pages/MyNftsPage';
import OrdersPage from './pages/OrdersPage';
import VerifyPage from './pages/VerifyPage';
import FeedPage from './pages/FeedPage';
import NotificationsPage from './pages/NotificationsPage';
import ProfilePage from './pages/ProfilePage';
import AnalyticsPage from './pages/AnalyticsPage';
import CreateNftPage from './pages/CreateNftPage';
import PlansPage from './pages/PlansPage';
import NftViewerPage from './pages/NftViewerPage';
import PublicProfilePage from './pages/PublicProfilePage';
import { initTheme } from './theme';

const PAGE_TITLES: Record<PageId, string> = {
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
};

/** Pages opened from a QR code or a shared link; they work without signing in. */
export type PublicRoute =
  | { kind: 'profile'; username: string }
  | { kind: 'id'; id: string; owner?: string }
  | { kind: 'nfc'; uid: string };

function readPublicRoute(): PublicRoute | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const u = params.get('u');
  const id = params.get('nft');
  const nfc = params.get('nfc');
  if (u) return { kind: 'profile', username: u.replace(/^@/, '') };
  if (id) return { kind: 'id', id, owner: params.get('owner') ?? undefined };
  if (nfc) return { kind: 'nfc', uid: nfc };
  return null;
}

initTheme();

export default function App() {
  const { fbUser, user, loading, error, needsRegistration, reload, logout } = useAuth();
  const [page, setPage] = useState<PageId>('home');
  const [route, setRoute] = useState<PublicRoute | null>(() => readPublicRoute());
  // A guest on a public page asked to sign in (or sign up).
  const [authMode, setAuthMode] = useState<'login' | 'signup' | null>(null);

  useEffect(() => {
    const onPop = () => setRoute(readPublicRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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
    return route.kind === 'profile'
      ? <PublicProfilePage username={route.username} onClose={closeRoute} onSignIn={askSignIn} />
      : <NftViewerPage source={route} onClose={closeRoute} onSignIn={askSignIn} />;
  }

  return (
    <Shell page={page} setPage={setPage} title={PAGE_TITLES[page]}>
      {page === 'home'          && <HomePage onJumpTo={setPage} />}
      {page === 'nfts'          && <MyNftsPage onJumpTo={setPage} />}
      {page === 'orders'        && <OrdersPage onJumpTo={setPage} />}
      {page === 'verify'        && <VerifyPage onJumpTo={setPage} />}
      {page === 'feed'          && <FeedPage />}
      {page === 'notifications' && <NotificationsPage />}
      {page === 'profile'       && <ProfilePage onJumpTo={setPage} />}
      {page === 'analytics'     && <AnalyticsPage onJumpTo={setPage} />}
      {page === 'create'        && <CreateNftPage onJumpTo={setPage} />}
      {page === 'plans'         && <PlansPage />}
    </Shell>
  );
}
