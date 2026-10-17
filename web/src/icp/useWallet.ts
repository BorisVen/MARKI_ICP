import { useSyncExternalStore } from 'react';
import { Principal } from '@dfinity/principal';
import { apiLinkIcpPrincipal, apiMarkiWalletSeed, apiWithdrawOnchain } from '../api';
import { iiLogout } from './ii';
import { paymentsIdl, type PaymentsService } from './idl';
import {
  anonymousActor,
  connectDevWallet,
  connectInternetIdentity,
  connectMarkiWallet,
  connectPlug,
  PAYMENTS_CANISTER_ID,
  type Wallet,
  type WalletKind,
} from './wallet';

// One wallet connection shared by every page (Тарифи, NFT, Гаманець).
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

function lastKind(): string | null {
  try { return localStorage.getItem(LAST_KIND_KEY); } catch { return null; }
}

function remember(w: Wallet) {
  try {
    localStorage.setItem(LAST_PRINCIPAL_KEY, w.principal);
    localStorage.setItem(LAST_KIND_KEY, w.kind);
  } catch { /* noop */ }
  set(w);
}

const markiWallet = async () => connectMarkiWallet((await apiMarkiWalletSeed()).seed);

export async function connectWallet(kind: WalletKind): Promise<Wallet> {
  const w = kind === 'plug' ? await connectPlug()
    : kind === 'marki' ? await markiWallet()
    : kind === 'ii' ? await connectInternetIdentity(true)
    : await connectDevWallet();
  if (!w) throw new Error('Вхід скасовано');
  remember(w);
  return w;
}

/** What the profile says about the user's own wallet. */
export type LinkedWallet = { icpPrincipal?: string; icpWalletKind?: string } | null | undefined;

/**
 * After sign-in. Someone with their own wallet (Internet Identity) gets it back
 * while its session lasts — and never silently another wallet, so their NFTs
 * and plan stay in one place. Everyone else gets the built-in Marki wallet,
 * unless this device last chose Plug (reconnected by hand, as before).
 */
export async function autoConnectWallet(user: LinkedWallet) {
  if (current) return;
  const last = lastKind();
  if (last === 'plug' || last === 'dev') return;
  if (user?.icpWalletKind === 'ii' || last === 'ii') {
    const w = await connectInternetIdentity(false).catch(() => null);
    if (w) remember(w);
    return;
  }
  try { await connectWallet('marki'); } catch { /* offline: pages offer the button */ }
}

export type OwnWalletResult = {
  principal: string;
  planMoved: boolean;
  /** NFTs moved from Marki custody to the new wallet. */
  moved: number;
  total: number;
  warning?: string;
};

/**
 * «Створити гаманець»: Internet Identity (it creates the wallet on first use),
 * then link it to the profile and bring over the plan of the built-in Marki
 * wallet and the NFTs Marki keeps — so from now on everything is the user's own.
 */
export async function createOwnWallet(onStep: (text: string) => void): Promise<OwnWalletResult> {
  onStep('Підтвердіть у вікні Internet Identity…');
  const own = await connectInternetIdentity(true);
  if (!own) throw new Error('Вхід скасовано');
  remember(own);

  onStep('Прив’язуємо гаманець до профілю…');
  await apiLinkIcpPrincipal(own.principal, 'ii');
  const to = Principal.fromText(own.principal);
  const warnings: string[] = [];

  let planMoved = false;
  try {
    onStep('Переносимо тариф…');
    const marki = await markiWallet();
    if (marki.principal !== own.principal) {
      const payments = await anonymousActor<PaymentsService>(PAYMENTS_CANISTER_ID, paymentsIdl);
      const sub = (await payments.subscription_of(Principal.fromText(marki.principal)))[0];
      if (sub && sub.expires_at_ns > BigInt(Date.now()) * 1_000_000n) {
        const r = await (await marki.actor<PaymentsService>(PAYMENTS_CANISTER_ID, paymentsIdl)).move_plan(to);
        if ('Err' in r) throw new Error(r.Err);
        planMoved = true;
      }
    }
  } catch (e: any) {
    warnings.push(`Тариф не перенісся (${e?.message ?? e}).`);
  }

  let moved = 0;
  let total = 0;
  try {
    onStep('Переносимо ваші NFT зі сховища Marki…');
    ({ moved, total } = await apiWithdrawOnchain(own.principal));
  } catch (e: any) {
    warnings.push(`NFT поки лишились у сховищі Marki — їх можна забрати пізніше (${e?.message ?? e}).`);
  }
  return { principal: own.principal, planMoved, moved, total, warning: warnings.join(' ') || undefined };
}

/** Sign in to the own wallet again (its session expired). */
export const reconnectOwnWallet = () => connectWallet('ii');

/** «Відключити»: ends this session; an own wallet stays linked to the profile. */
export async function disconnectWallet() {
  if (current?.kind === 'plug') {
    try { await (window as any).ic?.plug?.disconnect?.(); } catch { /* noop */ }
  }
  if (current?.kind === 'ii') await iiLogout();
  set(null);
}

/** «Відв’язати гаманець»: back to the built-in Marki wallet. */
export async function unlinkOwnWallet() {
  await apiLinkIcpPrincipal(null);
  await iiLogout();
  try { localStorage.removeItem(LAST_KIND_KEY); localStorage.removeItem(LAST_PRINCIPAL_KEY); } catch { /* noop */ }
  set(null);
  await connectWallet('marki').catch(() => {});
}

/** Forget the wallet on sign-out, so the next account gets its own. */
export function resetWallet() {
  try { localStorage.removeItem(LAST_PRINCIPAL_KEY); localStorage.removeItem(LAST_KIND_KEY); } catch { /* noop */ }
  iiLogout().catch(() => {});
  set(null);
}

export function useWallet(): Wallet | null {
  return useSyncExternalStore(subscribe, () => current);
}
