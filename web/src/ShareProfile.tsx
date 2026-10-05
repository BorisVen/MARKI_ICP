import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Icon } from './icons';

/** Public profile link that the QR code encodes. */
export const profileUrl = (username: string) => `${window.location.origin}${import.meta.env.BASE_URL}?u=${encodeURIComponent(username)}`;

const BACKGROUNDS = [
  'linear-gradient(160deg, #1f4fd1 0%, #4f8cff 45%, #22c55e 100%)',
  'linear-gradient(160deg, #b45309 0%, #f59e0b 50%, #7c2d12 100%)',
  'linear-gradient(160deg, #6d28d9 0%, #db2777 55%, #f97316 100%)',
  'linear-gradient(160deg, #0f172a 0%, #334155 60%, #0ea5e9 100%)',
];

/** TikTok-style profile card: avatar, name, QR, copy and share. Tap the background to change style. */
export default function ShareProfile({ name, username, avatar, onClose }: {
  name: string;
  username: string;
  avatar?: string;
  onClose: () => void;
}) {
  const [qr, setQr] = useState('');
  const [bg, setBg] = useState(0);
  const [copied, setCopied] = useState(false);
  const url = profileUrl(username);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 520, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0b0f14', light: '#ffffff' } })
      .then(setQr).catch(() => {});
  }, [url]);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const share = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator.share) {
      try { await navigator.share({ title: `${name} у Marki`, text: `Мій профіль у Marki: @${username}`, url }); return; } catch { /* cancelled */ }
    }
    await copy(e);
  };

  return (
    <div className="share-screen" style={{ background: BACKGROUNDS[bg] }} onClick={() => setBg((bg + 1) % BACKGROUNDS.length)}>
      <button className="share-back" onClick={e => { e.stopPropagation(); onClose(); }} aria-label="Закрити">←</button>

      <div className="share-card" onClick={e => e.stopPropagation()}>
        <div className="share-avatar">
          {avatar ? <img src={avatar} alt="" /> : <span>{(name || 'M').slice(0, 1).toUpperCase()}</span>}
        </div>
        <div className="share-name">{name}</div>
        <div className="share-user">@{username}</div>
        {qr ? <img className="share-qr" src={qr} alt="QR-код профілю" /> : <div className="share-qr sk" />}
        <div className="share-brand"><img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={20} height={20} /> Marki</div>
      </div>

      <div className="share-actions">
        <button onClick={copy}><Icon.Link /> {copied ? 'Скопійовано' : 'Копіювати посилання'}</button>
        <button onClick={share}><Icon.Upload /> Поділитися</button>
      </div>
      <div className="share-hint">Натисни на фон, щоб змінити стиль</div>
    </div>
  );
}
