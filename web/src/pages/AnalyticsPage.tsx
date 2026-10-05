import { useEffect, useMemo, useState } from 'react';
import { apiGetNFTs, apiMyAnalytics, type Analytics } from '../api';
import { useAuth } from '../auth';
import { Icon } from '../icons';
import type { PageId } from '../Shell';
import { ListSkeleton } from '../Skeleton';
import { fmtCount } from './ProfilePage';

/** Views of the profile and passports: totals, a 30-day chart, top passports. */
export default function AnalyticsPage({ onJumpTo }: { onJumpTo: (p: PageId) => void }) {
  const { user } = useAuth();
  const [data, setData] = useState<Analytics | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    apiMyAnalytics().then(setData).catch(async () => {
      // Server without analytics yet: show what we can from the passports.
      setPending(true);
      const nfts = await apiGetNFTs().catch(() => []);
      setData({
        profileViews: 0,
        passportViews: nfts.reduce((a, n) => a + (n.views ?? 0), 0),
        followersCount: user?.followersCount ?? 0,
        likesCount: user?.likesCount ?? 0,
        days: [],
        topPassports: [...nfts].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)).slice(0, 5)
          .map(n => ({ id: n.id, title: n.title, image: n.imageUrl || n.image, views: n.views ?? 0 })),
      });
    });
  }, [user]);

  const max = useMemo(() => Math.max(1, ...(data?.days ?? []).map(d => d.profileViews + d.passportViews)), [data]);
  const week = useMemo(() => (data?.days ?? []).slice(-7).reduce((a, d) => a + d.profileViews + d.passportViews, 0), [data]);

  return (
    <div className="analytics">
      <div className="page-head">
        <div>
          <button className="btn" style={{ marginBottom: 10 }} onClick={() => onJumpTo('profile')}>← Профіль</button>
          <h2>Аналітика</h2>
          <p>Скільки людей бачили твій профіль і паспорти товарів.</p>
        </div>
      </div>

      {!data ? <ListSkeleton count={2} /> : (
        <>
          {pending && <div className="notice notice-info">Детальна статистика з’явиться після оновлення сервера. Поки показуємо перегляди паспортів.</div>}

          <div className="stat-row analytics-stats">
            <div className="stat-tile"><div className="st-value">{fmtCount(data.profileViews)}</div><div className="st-label">переглядів профілю</div></div>
            <div className="stat-tile"><div className="st-value">{fmtCount(data.passportViews)}</div><div className="st-label">переглядів паспортів</div></div>
            <div className="stat-tile"><div className="st-value">{fmtCount(data.followersCount)}</div><div className="st-label">підписників</div></div>
            <div className="stat-tile"><div className="st-value">{fmtCount(data.likesCount)}</div><div className="st-label">вподобайок</div></div>
          </div>

          {data.days.length > 0 && (
            <div className="card" style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                <h3 style={{ margin: 0 }}>Перегляди за 30 днів</h3>
                <span className="muted" style={{ fontSize: 12 }}>{fmtCount(week)} за тиждень</span>
              </div>
              <div className="bar-chart" role="img" aria-label="Перегляди за 30 днів">
                {data.days.map(d => {
                  const total = d.profileViews + d.passportViews;
                  return (
                    <div key={d.date} className="bc-col" title={`${new Date(d.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}: профіль ${d.profileViews}, паспорти ${d.passportViews}`}>
                      <div className="bc-bar" style={{ height: `${(total / max) * 100}%` }}>
                        <div className="bc-part" style={{ height: total ? `${(d.passportViews / total) * 100}%` : 0 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="bc-legend">
                <span><i className="lg-profile" /> профіль</span>
                <span><i className="lg-passport" /> паспорти</span>
              </div>
            </div>
          )}

          <div className="section-title">Найпопулярніші паспорти</div>
          {data.topPassports.length === 0 ? (
            <div className="empty">Поки немає переглядів. Поділись профілем — <button className="btn" style={{ padding: '2px 8px' }} onClick={() => onJumpTo('profile')}><Icon.QrCode /> QR-код</button></div>
          ) : (
            <div className="check-history">
              {data.topPassports.map((p, i) => (
                <div key={p.id} className="ch-item" style={{ cursor: 'default' }}>
                  <span className="top-rank">{i + 1}</span>
                  {p.image ? <img src={p.image} alt="" /> : <span className="ch-ph">🪪</span>}
                  <span className="ch-body"><span className="ch-title">{p.title}</span></span>
                  <strong>▷ {fmtCount(p.views)}</strong>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
