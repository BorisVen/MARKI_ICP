import { useSyncExternalStore } from 'react';
import { apiMarkiWalletSeed } from '../api';
import { connectDevWallet, connectMarkiWallet, connectPlug, type Wallet, type WalletKind } from './wallet';

// One wallet connection shared by every page (Тарифи, NFT).
let current: Wallet | null = null;
const listeners = new Set<() => void>();

function set(w: Wallet | null) {
  current = w;
  listeners.forEach(l => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

const LAST_PRINCIPAL_KEY = 'markicp.lastPrincipal';
const LAST_KIND_KEY = 'markicp.lastWalletKind';

/** Principal of the last connected wallet: lets pages show the plan before reconnecting. */
export function lastPrincipal(): string | null {
  try { return localStorage.getItem(LAST_PRINCIPAL_KEY); } catch { return null; }
}

export async function connectWallet(kind: WalletKind): Promise<Wallet> {
  const w = kind === 'plug' ? await connectPlug()
    : kind === 'marki' ? await connectMarkiWallet((await apiMarkiWalletSeed()).seed)
    : await connectDevWallet();
  try {
    localStorage.setItem(LAST_PRINCIPAL_KEY, w.principal);
    localStorage.setItem(LAST_KIND_KEY, w.kind);
  } catch { /* noop */ }
  set(w);
  return w;
}

export async function disconnectWallet() {
  if (current?.kind === 'plug') {
    try { await (window as any).ic?.plug?.disconnect?.(); } catch { /* noop */ }
  }
  set(null);
}

/**
 * After sign-in: reconnect the built-in Marki wallet, unless this device last
 * chose Plug (then the user reconnects Plug by hand, as before).
 */
export async function autoConnectWallet() {
  if (current) return;
  let last: string | null = null;
  try { last = localStorage.getItem(LAST_KIND_KEY); } catch { /* noop */ }
  if (last === 'plug' || last === 'dev') return;
  try { await connectWallet('marki'); } catch { /* offline or signed out: pages offer the button */ }
}

/** Forget the wallet on sign-out, so the next account gets its own. */
export function resetWallet() {
  try { localStorage.removeItem(LAST_PRINCIPAL_KEY); localStorage.removeItem(LAST_KIND_KEY); } catch { /* noop */ }
  set(null);
}

export function useWallet(): Wallet | null {
  return useSyncExternalStore(subscribe, () => current);
}
