import { useState } from 'react';
import { useAuth } from '../auth';
import { Icon } from '../icons';
import { connectWallet, createOwnWallet, useWallet } from './useWallet';
import { IS_LOCAL_NETWORK, type WalletKind } from './wallet';

/** Plug is a desktop browser extension: inside the phone app there is none. */
const HAS_PLUG = typeof window !== 'undefined' && !!(window as any).ic?.plug;

const LABEL: Record<WalletKind, string> = { ii: 'Мій гаманець', marki: 'Marki', plug: 'Plug', dev: 'Dev' };

/**
 * The connected wallet, or the way to get one: sign in to your own wallet
 * (Internet Identity) if you have it, otherwise create it — or use the
 * built-in Marki wallet / Plug.
 */
export default function WalletConnect({ onError }: { onError?: (msg: string) => void }) {
  const wallet = useWallet();
  const { user, reload } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  if (wallet) {
    const p = wallet.principal;
    return (
      <span className="wallet-pill connected" title={p}>
        <span className="dot-ind" />
        {LABEL[wallet.kind]} · {p.slice(0, 5)}…{p.slice(-3)}
      </span>
    );
  }

  const fail = (e: any) => {
    const msg = e?.message ?? 'Не вдалося підключити гаманець';
    if (onError) onError(msg); else alert(msg);
  };
  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try { await fn(); } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const hasOwn = user?.icpWalletKind === 'ii';

  return (
    <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
      {hasOwn ? (
        <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => run('ii', () => connectWallet('ii'))}>
          <Icon.Wallet /> {busy === 'ii' ? 'Підтвердіть вхід…' : 'Увійти в мій гаманець'}
        </button>
      ) : (
        <>
          <button type="button" className="btn btn-primary" disabled={!!busy} onClick={() => run('create', async () => { await createOwnWallet(t => setBusy(t)); await reload(); })}>
            <Icon.Wallet /> {busy && busy !== 'marki' && busy !== 'plug' ? busy : 'Створити свій гаманець'}
          </button>
          <button type="button" className="btn" disabled={!!busy} onClick={() => run('marki', () => connectWallet('marki'))}>
            {busy === 'marki' ? 'Підключення…' : 'Гаманець Marki'}
          </button>
        </>
      )}
      {HAS_PLUG && (
        <button type="button" className="btn" disabled={!!busy} onClick={() => run('plug', () => connectWallet('plug'))}>Plug</button>
      )}
      {IS_LOCAL_NETWORK && (
        <button type="button" className="btn" disabled={!!busy} onClick={() => run('dev', () => connectWallet('dev'))}>Dev-гаманець</button>
      )}
    </span>
  );
}
