import { useState } from 'react';
import { iiDelegateTo } from './icp/ii';
import Logo from './Logo';

/**
 * `?ii-login=<key>` — the website page the Android app opens in the browser to
 * sign in to the user's own wallet: Internet Identity delegates to the app's
 * key, and the result goes back to the app through the `marki://ii` link.
 */
export default function IiBridge({ sessionKey }: { sessionKey: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [back, setBack] = useState('');
  const [error, setError] = useState('');
  const valid = /^[0-9a-f]{60,200}$/i.test(sessionKey);

  const signIn = async () => {
    setState('busy');
    try {
      const chain = await iiDelegateTo(sessionKey);
      // Straight to the Marki app on this phone — never through a server: a link
      // with someone else's key would otherwise hand them this wallet.
      const url = `intent://ii?d=${encodeURIComponent(JSON.stringify(chain))}#Intent;scheme=marki;package=com.identity.app;end`;
      setBack(url);
      setState('done');
      window.location.href = url;
    } catch (e: any) {
      setError(e?.message ?? 'Не вдалося');
      setState('error');
    }
  };

  return (
    <div className="ii-bridge">
      <Logo />
      <h2>Вхід у гаманець</h2>
      {!valid ? (
        <p className="muted">Посилання пошкоджене. Відкрийте вхід із застосунку Marki ще раз.</p>
      ) : state === 'done' ? (
        <>
          <p>Готово ✅ Натисніть кнопку — і ви знову в застосунку.</p>
          <a className="btn btn-primary btn-block ii-back" href={back}>Повернутися в Marki</a>
        </>
      ) : (
        <>
          <p className="muted">Для застосунку Marki на цьому телефоні. Підтвердіть відбитком або Face ID — ключ залишиться тільки у вас.</p>
          <p className="muted" style={{ fontSize: 12 }}>Відкрили це посилання не з застосунку Marki? Не входьте — закрийте сторінку.</p>
          <button className="btn btn-primary btn-block" onClick={signIn} disabled={state === 'busy'}>
            {state === 'busy' ? 'Підтвердіть у вікні Internet Identity…' : 'Увійти через Internet Identity'}
          </button>
          {state === 'error' && <div className="error-banner" style={{ marginTop: 12 }}>{error}</div>}
        </>
      )}
    </div>
  );
}
