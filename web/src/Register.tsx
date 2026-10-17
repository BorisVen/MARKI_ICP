import { useEffect, useRef, useState } from 'react';
import { apiRegister } from './api';
import { useAuth } from './auth';

/**
 * Second sign-up step: the Marki profile. Google already gave us a name and an
 * email, so Google sign-ups get their profile created right away; the form only
 * shows for email sign-ups (or if that fails). The phone is asked at checkout.
 */
export default function Register() {
  const { fbUser, reload, logout } = useAuth();
  const [name, setName] = useState(fbUser?.displayName ?? '');
  const [username, setUsername] = useState(
    (fbUser?.email ?? '').split('@')[0].replace(/[^a-z0-9_]/gi, '').toLowerCase(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromGoogle = !!fbUser?.providerData.some(p => p.providerId === 'google.com') && !!fbUser?.displayName;
  const [auto, setAuto] = useState(fromGoogle);
  const started = useRef(false);

  const create = async (n: string, u: string) => {
    await apiRegister({ uid: fbUser!.uid, email: fbUser!.email ?? '', name: n.trim(), username: u.trim().replace(/^@/, '') });
    await reload();
  };

  useEffect(() => {
    if (!fromGoogle || started.current) return;
    started.current = true;
    create(name || 'Marki', username || `user${fbUser!.uid.slice(0, 6).toLowerCase()}`)
      .catch(() => setAuto(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim()) {
      setError('Вкажи ім’я та нікнейм.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await create(name, username);
    } catch (err: any) {
      setError(err?.message ?? 'Не вдалося створити профіль');
    } finally {
      setBusy(false);
    }
  };

  if (auto) return <div className="spinner">Створюємо профіль…</div>;

  return (
    <div className="login-shell">
      <div className="login-card">
        <h2>Ласкаво просимо! 👋</h2>
        <p className="sub">Ще один крок: як тебе звати? Це побачать продавці, коли ти оформиш замовлення.</p>
        <form onSubmit={submit}>
          <div className="field">
            <label>Ім’я</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Олена Коваль" autoComplete="name" />
          </div>
          <div className="field">
            <label>Нікнейм</label>
            <input value={username} onChange={e => setUsername(e.target.value)} placeholder="olena" />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Створюємо профіль…' : 'Почати'}
          </button>
          {error && <div className="error-banner" style={{ marginTop: 14 }}>{error}</div>}
          <button type="button" className="btn btn-block" style={{ marginTop: 8 }} onClick={logout}>Вийти</button>
        </form>
      </div>
    </div>
  );
}
