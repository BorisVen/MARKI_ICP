import { useEffect, useMemo, useState } from 'react';
import {
  apiFollow,
  apiPublicProfile,
  apiPublicUser,
  apiPublicUserNfts,
  apiUnfollow,
  apiViewProfile,
  type PublicNft,
  type PublicUserCard,
} from '../api';
import { useAuth } from '../auth';
import EmptyState from '../EmptyState';
import GuestPrompt from '../GuestPrompt';
import Logo from '../Logo';
import ShareProfile from '../ShareProfile';
import { GridSkeleton } from '../Skeleton';
import { fmtCount, groupNfts } from './ProfilePage';

/** Someone's profile opened from a QR code or link. Works for guests. */
export default function PublicProfilePage({ username, onClose, onSignIn }: {
  username: string;
  onClose: () => void;
  /** Present for guests: asks the app to show the sign-in screen. */
  onSignIn?: (mode: 'login' | 'signup') => void;
}) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<PublicUserCard | null>(null);
  const [nfts, setNfts] = useState<PublicNft[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    apiPublicUser(username)
      .then(async p => {
        if (cancelled) return;
        setProfile(p);
        if (p.isFollowing !== undefined) setFollowing(p.isFollowing);
        else if (user && user.uid !== p.uid) {
          apiPublicProfile(p.uid).then(x => !cancelled && setFollowing(x.isFollowing)).catch(() => {});
        }
        if (user?.uid !== p.uid) apiViewProfile(username);
      })
      .catch(e => !cancelled && setError(e?.status === 404 ? 'Такого профілю немає.' : 'Профіль тимчасово недоступний. Спробуй пізніше.'));
    apiPublicUserNfts(username).then(n => !cancelled && setNfts(n)).catch(() => !cancelled && setNfts([]));
    return () => { cancelled = true; };
  }, [username, user]);

  const groups = useMemo(() => groupNfts(nfts ?? []), [nfts]);
  const own = !!user && profile?.uid === user.uid;

  const toggleFollow = async () => {
    if (!profile) return;
    if (!user) { onSignIn?.('signup'); return; }
    setBusy(true);
    try {
      const r = following ? await apiUnfollow(profile.uid) : await apiFollow(profile.uid);
      setFollowing(r.following);
      setProfile({ ...profile, followersCount: r.followersCount });
    } catch (e: any) {
      alert(e?.message ?? 'Не вдалося виконати дію');
    } finally {
      setBusy(false);
    }
  };

  const openPassport = (nftId: string) => {
    if (!profile) return;
    window.location.search = `?nft=${encodeURIComponent(nftId)}&owner=${encodeURIComponent(profile.uid)}`;
  };

  return (
    <div className="public-page">
      <header className="viewer-topbar">
        <button className="btn" onClick={onClose}>← {user ? 'До застосунку' : 'Marki'}</button>
        <Logo size={24} />
        {onSignIn ? <button className="btn" onClick={() => onSignIn('login')}>Увійти</button> : <span />}
      </header>

      <div className="viewer-content">
        {error ? (
          <EmptyState icon="🔍" title="Профіль не знайдено" text={error} />
        ) : !profile ? (
          <GridSkeleton count={6} />
        ) : (
          <div className="profile">
            <div className="profile-head" style={{ marginTop: 8 }}>
              <div className="ph-main">
                <h1 className="ph-name">
                  {profile.name || profile.username}
                  {profile.companyApproved && <span className="verified" title="Перевірений акаунт">✓</span>}
                </h1>
                <div className="ph-user">@{profile.username}</div>
                <div className="ph-stats">
                  <div><strong>{fmtCount(profile.followingCount)}</strong><span>Стежить</span></div>
                  <div><strong>{fmtCount(profile.followersCount)}</strong><span>Підписники</span></div>
                  <div><strong>{fmtCount(profile.likesCount)}</strong><span>Вподобайки</span></div>
                </div>
              </div>
              <div className="ph-avatar" style={{ cursor: 'default' }}>
                {profile.avatar ? <img src={profile.avatar} alt="" /> : <span>{(profile.name || 'M').slice(0, 1).toUpperCase()}</span>}
              </div>
            </div>

            {profile.bio && <p className="ph-bio">{profile.bio}</p>}
            {profile.location && <div className="muted" style={{ fontSize: 13, marginTop: -6, marginBottom: 12 }}>📍 {profile.location}</div>}

            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              {!own && (
                <button className={`btn ${following ? '' : 'btn-primary'}`} style={{ minWidth: 140, justifyContent: 'center' }} onClick={toggleFollow} disabled={busy}>
                  {following ? 'Ти стежиш' : 'Стежити'}
                </button>
              )}
              <button className="btn" onClick={() => setSharing(true)}>Поділитися профілем</button>
            </div>

            <div className="profile-tabs"><button className="active" style={{ cursor: 'default' }}>Колекції · {groups.length}</button></div>
            {!nfts ? <GridSkeleton count={6} /> : groups.length === 0 ? (
              <EmptyState icon="🪪" title="Колекцій поки немає" text={`У @${profile.username} ще немає паспортів товарів.`} />
            ) : (
              <div className="profile-grid">
                {groups.map(g => (
                  <button key={g.name} className="pg-tile" onClick={() => openPassport(g.items[0].id)} title={g.name}>
                    {g.cover ? <img src={g.cover} alt="" /> : <span className="pg-ph">🪪</span>}
                    {g.items.length > 1 && <span className="pg-badge">{g.items.length} шт</span>}
                    <span className="pg-views">▷ {fmtCount(g.views)}</span>
                    <span className="pg-title">{g.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {sharing && profile && (
        <ShareProfile name={profile.name || profile.username} username={profile.username} avatar={profile.avatar} onClose={() => setSharing(false)} />
      )}
      {onSignIn && profile && <GuestPrompt text={`Увійди, щоб стежити за @${profile.username} і перевіряти товари.`} onSignIn={onSignIn} />}
    </div>
  );
}
