import { useEffect, useState } from 'react';
import { IS_NATIVE } from './native/links';

/** Links that show something specific (a QR or a shared link): these open the app by themselves. */
const ROUTE_KEYS = ['nft', 'v', 'gift', 'u', 'nfc'];
const ANDROID = /Android/i.test(navigator.userAgent);

/** `intent:` link: Chrome opens the Marki app if it is installed, the website otherwise. */
function appIntent(): string {
  const here = new URL(window.location.href);
  here.searchParams.set('web', '1');
  return `intent://open${window.location.search}#Intent;scheme=marki;package=com.identity.app;S.browser_fallback_url=${encodeURIComponent(here.toString())};end`;
}

/**
 * The website on an Android phone: a scanned QR or a shared link goes straight
 * into the Marki app when it is installed; otherwise it stays on the web.
 * A bar at the top offers the app too (for when the browser holds the jump back).
 */
export default function OpenInApp() {
  const params = new URLSearchParams(window.location.search);
  const route = ROUTE_KEYS.some(k => params.has(k));
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem('marki.openInApp') === 'hidden'; } catch { return false; }
  });
  const show = ANDROID && !IS_NATIVE && !params.has('ii-login');

  useEffect(() => {
    if (!show || !route || params.has('web')) return;
    const key = `marki.openedInApp:${window.location.search}`;
    try { if (sessionStorage.getItem(key)) return; sessionStorage.setItem(key, '1'); } catch { /* noop */ }
    window.location.href = appIntent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!show || hidden) return null;
  return (
    <div className="open-in-app">
      <span>Відкрити в застосунку Marki</span>
      <a className="btn btn-primary" href={appIntent()}>Відкрити</a>
      <button className="icon-btn" aria-label="Закрити" onClick={() => { setHidden(true); try { sessionStorage.setItem('marki.openInApp', 'hidden'); } catch { /* noop */ } }}>✕</button>
    </div>
  );
}
