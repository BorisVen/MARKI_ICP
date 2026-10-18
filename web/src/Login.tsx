import { nativeGoogleIdToken } from './native/googleSignIn';
import { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithCredential,
  signInWithPopup,
} from 'firebase/auth';
import { auth } from './firebase';

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
      return 'Вхід через Google скасовано.';
    case 'auth/popup-blocked':
      return 'Браузер заблокував вікно входу. Дозволь спливаючі вікна для цього сайту.';
    case 'auth/unauthorized-domain':
      return `Домен ${window.location.hostname} не доданий у Firebase Console → Authentication → Settings → Authorized domains.`;
    case 'auth/operation-not-allowed':
      return 'Цей спосіб входу вимкнено у Firebase Console.';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return 'Неправильний VITE_FIREBASE_API_KEY у .env.local.';
    default: {
      // Native Google sign-in (Android) reports plain messages, not Firebase codes.
      const msg = String(err?.message ?? '');
      if (/cancel/i.test(msg)) return 'Вхід через Google скасовано.';
      if (/no credential|no account|NoCredential/i.test(msg)) {
        return 'На телефоні немає Google-акаунта. Додайте його в Налаштуваннях → Акаунти або зареєструйтесь через email.';
      }
      if (/network/i.test(msg)) return 'Проблема з мережею. Перевір з’єднання.';
      return code ? `Не вдалося увійти (${code}).` : 'Не вдалося увійти через Google. Спробуйте ще раз або увійдіть через email.';
    }
  }
}

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

export default function Login({ initialMode = 'login', onBack }: {
  initialMode?: 'login' | 'signup';
  /** Set when a guest came from a public page: lets them go back without signing in. */
  onBack?: () => void;
}) {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<'google' | 'email' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const onGoogle = async () => {
    setBusy('google');
    setError(null);
    setInfo(null);
    try {
      const idToken = await nativeGoogleIdToken();
      if (idToken) await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
      else await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err: any) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('email');
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
      setBusy(null);
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
  const switchTo = (m: 'login' | 'signup') => { setMode(m); setError(null); setInfo(null); };

  return (
    <div className="login-shell">
      <div className="login-card">
        {onBack && (
          <button className="btn" style={{ marginBottom: 14 }} onClick={onBack}>← Назад</button>
        )}
        <div className="login-brand">
          <img src={`${import.meta.env.BASE_URL}marki-logo.png`} alt="" />
          <div>
            <strong>Marki</strong>
            <span>Mark Identity</span>
          </div>
        </div>
        <h2>{signup ? 'Створи акаунт' : 'З поверненням! 👋'}</h2>
        <p className="sub">{signup ? 'Хвилина — і в тебе цифрові паспорти речей.' : 'Увійди, щоб бачити свої паспорти, подарунки й замовлення.'}</p>
        {signup && (
          <div className="login-points">
            <span>🪪 Цифрові паспорти речей у блокчейні</span>
            <span>🎁 Даруй і продавай NFT друзям</span>
            <span>🔔 Лайки, коментарі й подарунки — одразу на телефон</span>
          </div>
        )}

        <div className="segmented" style={{ width: '100%', marginBottom: 16 }}>
          <button type="button" className={!signup ? 'active' : ''} onClick={() => switchTo('login')}>Вхід</button>
          <button type="button" className={signup ? 'active' : ''} onClick={() => switchTo('signup')}>Реєстрація</button>
        </div>

        <button className="btn btn-block google-btn" type="button" onClick={onGoogle} disabled={!!busy}>
          {busy === 'google' ? <span className="mini-spin" /> : <GoogleIcon />}
          {busy === 'google' ? 'Відкриваємо Google…' : signup ? 'Зареєструватися з Google' : 'Увійти з Google'}
        </button>

        <div className="divider">або email</div>

        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Email</label>
            <input type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" />
          </div>
          <div className="field">
            <label>Пароль</label>
            <div className="pw-field">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={signup ? 'new-password' : 'current-password'}
                placeholder={signup ? 'Щонайменше 6 символів' : 'Ваш пароль'}
              />
              <button type="button" className="pw-toggle" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Сховати пароль' : 'Показати пароль'}>
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
            {signup && password && password.length < 6 && <small className="muted">Ще {6 - password.length} симв.</small>}
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={!!busy || !email || password.length < (signup ? 6 : 1)}>
            {busy === 'email' ? 'Зачекай…' : signup ? 'Створити акаунт' : 'Увійти'}
          </button>
          {!signup && (
            <button type="button" className="btn btn-block link-btn" onClick={onReset}>Забули пароль?</button>
          )}
          {info && <div className="success-banner" style={{ marginTop: 14 }}>{info}</div>}
          {error && <div className="error-banner" style={{ marginTop: 14 }}>{error}</div>}
        </form>
        {signup && <p className="login-terms">Реєструючись, ви погоджуєтесь з правилами Marki. Ключі від вашого гаманця бачите тільки ви.</p>}
      </div>
    </div>
  );
}
