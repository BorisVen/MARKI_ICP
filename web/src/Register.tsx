import { useEffect, useRef, useState } from 'react';
import { apiRegister } from './api';
import { useAuth } from './auth';

/** Nickname rules (same as the server): 3–24 of a–z, 0–9, «_», «.». */
const NICK = /^[a-z0-9_.]{3,24}$/;
const toNick = (s: string) => s.toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_.]/g, '').slice(0, 24);

/**
 * Second sign-up step: the Marki profile. Google already gave us a name and an
 * email, so Google sign-ups get their profile right away (a taken nickname gets
 * a number); the form shows for email sign-ups, or if that fails.
 */
export default function Register() {
  const { fbUser, reload, logout } = useAuth();
  const [name, setName] = useState(fbUser?.displayName ?? '');
  const base = toNick((fbUser?.email ?? '').split('@')[0]);
  const [username, setUsername] = useState(base.length >= 3 ? base : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromGoogle = !!fbUser?.providerData.some(p => p.providerId === 'google.com');
  const [auto, setAuto] = useState(fromGoogle);
  const started = useRef(false);

  const create = async (n: string, u: string) => {
    await apiRegister({ uid: fbUser!.uid, email: fbUser!.email ?? '', name: n.trim(), username: u });
    await reload();
  };

  // Google: create the profile straight away, trying a few free nicknames.
  useEffect(() => {
    if (!fromGoogle || started.current) return;
    started.current = true;
    (async () => {
      const first = base.length >= 3 ? base : `user${fbUser!.uid.slice(0, 6).toLowerCase()}`;
      const tries = [first, ...Array.from({ length: 4 }, () => `${first.slice(0, 19)}${Math.floor(100 + Math.random() * 9900)}`)];
      for (const u of tries) {
        try { await create(name || 'Marki', u); return; } catch (e: any) {
          if (e?.status !== 409) break;
        }
      }
      setAuto(false);
      setError('Не вдалося підібрати нікнейм — оберіть свій.');
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const nickOk = NICK.test(username);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Вкажіть ім’я.'); return; }
    if (!nickOk) { setError('Нікнейм: 3–24 латинські літери, цифри, «_» або «.».'); return; }
    setBusy(true);
    setError(null);
    try {
      await create(name, username);
    } catch (err: any) {
      setError(err?.status === 409 ? `Нікнейм @${username} уже зайнятий — спробуйте інший.` : err?.message ?? 'Не вдалося створити профіль');
    } finally {
      setBusy(false);
    }
  };

  if (auto) return <div className="spinner">Створюємо профіль…</div>;

  return (
    <div className="login-shell">
      <div className="login-card">
        {fbUser?.photoURL
          ? <img className="reg-avatar" src={fbUser.photoURL} alt="" />
          : <div className="reg-avatar reg-letter">{(name || fbUser?.email || 'M').slice(0, 1).toUpperCase()}</div>}
        <h2>Ще один крок 👋</h2>
        <p className="sub">Як вас звати і який нікнейм? Нікнейм — це ваша адреса в Marki: друзі знайдуть вас за ним.</p>
        <form onSubmit={submit}>
          <div className="field">
            <label>Ім’я</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Олена Коваль" autoComplete="name" maxLength={60} />
          </div>
          <div className="field">
            <label>Нікнейм</label>
            <div className="nick-field">
              <span>@</span>
              <input
                value={username}
                onChange={e => setUsername(toNick(e.target.value))}
                placeholder="olena"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <small className={username && !nickOk ? 'nick-bad' : 'muted'}>
              {username && !nickOk ? 'Мінімум 3 символи' : 'Латиниця, цифри, «_» і «.»'}
            </small>
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !name.trim() || !nickOk}>
            {busy ? 'Створюємо профіль…' : 'Почати'}
          </button>
          {error && <div className="error-banner" style={{ marginTop: 14 }}>{error}</div>}
          <button type="button" className="btn btn-block link-btn" onClick={logout}>Увійти іншим акаунтом</button>
        </form>
      </div>
    </div>
  );
}
