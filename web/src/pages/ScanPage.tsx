import { useEffect, useRef, useState } from 'react';
import type { PageId } from '../Shell';

/** Marki QR codes carry one of these: a passport, a product, a gift or a profile. */
const ROUTE_KEYS = ['nft', 'v', 'gift', 'u', 'nfc'];

/** The app page a scanned text opens (`?nft=…&owner=…`), or null if it isn't a Marki code. */
export function marki(text: string): string | null {
  try {
    const url = new URL(text.trim());
    return ROUTE_KEYS.some(k => url.searchParams.has(k)) ? url.search : null;
  } catch {
    return null;
  }
}

/**
 * «Перевірка»: the camera opens right away and reads Marki QR codes — product
 * passports, goods, gifts, profiles — then opens them. NFC check stays below.
 */
export default function ScanPage({ onJumpTo }: { onJumpTo: (p: PageId) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'starting' | 'scanning' | 'denied' | 'none'>('starting');
  const [foreign, setForeign] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setState('none'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch {
        setState('denied');
        return;
      }
      if (stopped || !video.current) { stream.getTracks().forEach(t => t.stop()); return; }
      video.current.srcObject = stream;
      await video.current.play().catch(() => {});
      setState('scanning');
      const { default: jsQR } = await import('jsqr');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const tick = () => {
        const v = video.current;
        if (stopped || !v) return;
        if (v.videoWidth) {
          // Scan a centred square, downscaled: fast enough on any phone.
          const side = Math.min(v.videoWidth, v.videoHeight);
          canvas.width = canvas.height = 480;
          ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, 480, 480);
          const code = jsQR(ctx.getImageData(0, 0, 480, 480).data, 480, 480, { inversionAttempts: 'dontInvert' });
          if (code?.data) {
            const route = marki(code.data);
            if (route) {
              navigator.vibrate?.(40);
              window.history.pushState({}, '', route);
              window.dispatchEvent(new PopStateEvent('popstate'));
              return;
            }
            setForeign(code.data);
          }
        }
        timer = window.setTimeout(tick, 200);
      };
      tick();
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach(t => t.stop());
    };
  }, []);

  return (
    <div className="scan-page">
      <div className="scan-view">
        <video ref={video} playsInline muted />
        <div className="scan-frame"><span /><span /><span /><span /></div>
        <div className="scan-hint">
          {state === 'starting' && 'Вмикаємо камеру…'}
          {state === 'scanning' && 'Наведіть камеру на QR-код товару, паспорта чи подарунка'}
          {state === 'denied' && 'Дозвольте доступ до камери в налаштуваннях, щоб сканувати QR'}
          {state === 'none' && 'Камера недоступна на цьому пристрої'}
        </div>
        {foreign && (
          <div className="scan-foreign">
            Це не QR Marki — можливо, підробка або чужий код.
            <small>{foreign.slice(0, 80)}</small>
          </div>
        )}
      </div>
      <button className="btn btn-block" style={{ marginTop: 12 }} onClick={() => onJumpTo('verify')}>
        📲 Перевірити за NFC-міткою
      </button>
    </div>
  );
}
