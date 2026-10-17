import { useEffect, useRef, useState } from 'react';

export type Toast = { id: string; title: string; text?: string; type?: string };

/** Shows a TikTok-style banner at the top of the app (likes, comments, gifts…). */
export function showToast(t: Toast) {
  window.dispatchEvent(new CustomEvent<Toast>('marki:toast', { detail: t }));
}

const ICON: Record<string, string> = { like: '❤️', comment: '💬', gift: '🎁', purchase: '🛍️', sale: '💰', system: '🔔' };
/** Banners already shown (a push and the inbox check can bring the same one). */
const seen = new Set<string>();

export default function TopToast({ onOpen }: { onOpen: () => void }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef(0);

  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail;
      if (!t || seen.has(t.id)) return;
      seen.add(t.id);
      navigator.vibrate?.(20);
      setLeaving(false);
      setToast(t);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setLeaving(true), 4500);
    };
    window.addEventListener('marki:toast', on);
    return () => window.removeEventListener('marki:toast', on);
  }, []);

  if (!toast) return null;
  const icon = ICON[toast.type ?? ''] ?? '🔔';
  // The title may already start with the emoji ("❤️ Alan").
  const title = toast.title.startsWith(icon) ? toast.title.slice(icon.length).trim() : toast.title;
  return (
    <button
      className={`top-toast ${leaving ? 'leaving' : ''}`}
      onAnimationEnd={() => { if (leaving) setToast(null); }}
      onClick={() => { setLeaving(true); onOpen(); }}
    >
      <span className="tt-icon">{icon}</span>
      <span className="tt-text">
        <strong>{title}</strong>
        {toast.text && <span>{toast.text}</span>}
      </span>
    </button>
  );
}
