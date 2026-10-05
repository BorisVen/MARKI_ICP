import { useState } from 'react';
import { apiRegister } from './api';
import { useAuth } from './auth';

/** Second sign-up step: the Marki profile (name, nickname, phone). */
export default function Register() {
  const { fbUser, reload, logout } = useAuth();
  const [name, setName] = useState(fbUser?.displayName ?? '');
  const [username, setUsername] = useState(
    (fbUser?.email ?? '').split('@')[0].replace(/[^a-z0-9_]/gi, '').toLowerCase(),
  );
  const [phone, setPhone] = useState(fbUser?.phoneNumber ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim()) {
      setError('Вкажи ім’я та нікнейм.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiRegister({
        uid: fbUser!.uid,
        email: fbUser!.email ?? '',
        name: name.trim(),
        username: username.trim().replace(/^@/, ''),
        phone: phone.trim() || undefined,
      });
      await reload();
    } catch (err: any) {
      setError(err?.message ?? 'Не вдалося створити профіль');
    } finally {
      setBusy(false);
    }
  };

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
          <div className="field">
            <label>Телефон <span className="muted">(для доставки, необов’язково)</span></label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+380 67 123 45 67" autoComplete="tel" inputMode="tel" />
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
