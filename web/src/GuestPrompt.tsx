import { useEffect, useState } from 'react';

const DISMISS_KEY = 'marki.guestPromptDismissed';

/**
 * Small, dismissible sign-in suggestion for guests on public pages.
 * It never blocks the page; once closed it stays hidden for this browser session.
 */
export default function GuestPrompt({ text, onSignIn }: { text: string; onSignIn: (mode: 'login' | 'signup') => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { /* storage blocked */ }
    if (dismissed) return;
    // Let the page show first, then offer.
    const t = window.setTimeout(() => setVisible(true), 1200);
    return () => window.clearTimeout(t);
  }, []);

  if (!visible) return null;
  const close = () => {
    setVisible(false);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* storage blocked */ }
  };

  return (
    <div className="guest-prompt" role="dialog" aria-label="Вхід у Marki">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={32} height={32} />
      <div className="gp-text">
        <strong>Ти в Marki?</strong>
        <span>{text}</span>
      </div>
      <button className="btn btn-primary" onClick={() => onSignIn('signup')}>Приєднатися</button>
      <button className="gp-close" onClick={close} aria-label="Закрити">✕</button>
    </div>
  );
}
