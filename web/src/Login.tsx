import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from './firebase';
import Logo from './Logo';

/** Map raw Firebase error codes to friendly Ukrainian messages. */
function authErrorMessage(err: any): string {
  const code: string = err?.code ?? '';
  console.warn('[Login] Firebase auth error:', code, err?.message);
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      // Firebase returns the same code for a wrong password, an unknown email and
      // an account that only has Google sign-in, so show the code for support.
      return `Невірний email або пароль (${code}). Якщо акаунт створено через Google — увійди кнопкою Google.`;
    case 'auth/email-already-in-use':
      return 'Акаунт з таким email уже є. Увійди або віднови пароль.';
    case 'auth/weak-password':
      return 'Пароль закороткий: потрібно щонайменше 6 символів.';
    case 'auth/invalid-email':
      return 'Некоректний email.';
    case 'auth/user-disabled':
      return 'Обліковий запис вимкнено.';
    case 'auth/too-many-requests':
      return 'Забагато спроб. Спробуй пізніше.';
    case 'auth/network-request-failed':
      return 'Проблема з мережею. Перевір з’єднання.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Вікно входу було закрито.';
    case 'auth/popup-blocked':
      return 'Браузер заблокував вікно входу. Дозволь спливаючі вікна для цього сайту.';
    case 'auth/unauthorized-domain':
      return `Домен ${window.location.hostname} не доданий у Firebase Console → Authentication → Settings → Authorized domains.`;
    case 'auth/operation-not-allowed':
      return 'Цей спосіб входу вимкнено у Firebase Console.';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return 'Неправильний VITE_FIREBASE_API_KEY у .env.local.';
    default:
      return code ? `Не вдалося увійти (${code}).` : err?.message ?? 'Не вдалося увійти.';
  }
}

export default function Login({ initialMode = 'login', onBack }: {
  initialMode?: 'login' | 'signup';
  /** Set when a guest came from a public page: lets them go back without signing in. */
  onBack?: () => void;
}) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const onGoogle = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, email.trim(), password.trim());
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password.trim());
      }
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onReset = async () => {
    if (!email.trim()) { setError('Введи email, і ми надішлемо посилання для відновлення пароля.'); return; }
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo(`Лист для відновлення пароля надіслано на ${email.trim()}.`);
    } catch (err: any) {
      setError(authErrorMessage(err));
    }
  };

  const signup = mode === 'signup';

  return (
    <div className="login-shell">
      <div className="login-card">
        {onBack && (
          <button className="btn" style={{ marginBottom: 14 }} onClick={onBack}>← Назад</button>
        )}
        <Logo size={36} />
        <h2>{signup ? 'Створи акаунт' : 'З поверненням!'}</h2>
        <p className="sub">Справжні товари з цифровим паспортом.</p>
        <div className="login-points">
          <span>📲 Перевіряй оригінальність за NFC-міткою</span>
          <span>🪪 Зберігай цифрові паспорти своїх речей</span>
          <span>💵 Купуй з оплатою при отриманні</span>
        </div>

        <div className="segmented" style={{ width: '100%', marginBottom: 16 }}>
          <button type="button" className={!signup ? 'active' : ''} onClick={() => { setMode('login'); setError(null); }}>Вхід</button>
          <button type="button" className={signup ? 'active' : ''} onClick={() => { setMode('signup'); setError(null); }}>Реєстрація</button>
        </div>

        <button className="btn btn-block" type="button" onClick={onGoogle} disabled={busy}>
          {busy ? 'Зачекай…' : 'Продовжити з Google'}
        </button>

        <div className="divider">АБО EMAIL</div>

        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="field">
            <label>Пароль</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={signup ? 'new-password' : 'current-password'}
              placeholder={signup ? 'Щонайменше 6 символів' : undefined}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !email || !password}>
            {busy ? 'Зачекай…' : signup ? 'Створити акаунт' : 'Увійти'}
          </button>
          {!signup && (
            <button type="button" className="btn btn-block" style={{ marginTop: 8, border: 'none' }} onClick={onReset}>
              Забули пароль?
            </button>
          )}
          {info && <div className="success-banner" style={{ marginTop: 14 }}>{info}</div>}
          {error && <div className="error-banner" style={{ marginTop: 14 }}>{error}</div>}
        </form>
      </div>
    </div>
  );
}
