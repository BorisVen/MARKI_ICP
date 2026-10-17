import { useEffect, useState } from 'react';
import { apiPublicProfile, apiSearchUsers, type PublicUser } from './api';

/** Opens someone's profile (by username, or looks it up by uid). */
export async function openProfile(who: { username?: string; uid?: string }) {
  let username = who.username;
  if (!username && who.uid) username = (await apiPublicProfile(who.uid).catch(() => null))?.username;
  if (!username) return;
  window.history.pushState({}, '', `?u=${encodeURIComponent(username)}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** People matching a search, as a row of avatars: tap to open the profile. */
export function PeopleRow({ query }: { query: string }) {
  const [people, setPeople] = useState<PublicUser[]>([]);
  const q = query.trim().replace(/^@/, '');

  useEffect(() => {
    if (q.length < 2) { setPeople([]); return; }
    const t = window.setTimeout(() => {
      apiSearchUsers(q).then(list => setPeople(list.slice(0, 20))).catch(() => setPeople([]));
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  if (!people.length) return null;
  return (
    <div className="people">
      <div className="people-title">Люди</div>
      <div className="people-row">
        {people.map(u => (
          <button key={u.uid} className="person" onClick={() => openProfile({ username: u.username })}>
            <span className="person-avatar">{u.avatar ? <img src={u.avatar} alt="" /> : (u.name || u.username).slice(0, 1).toUpperCase()}</span>
            <strong>{u.name || u.username}{u.companyApproved && <span className="person-check">✓</span>}</strong>
            <small>@{u.username}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
