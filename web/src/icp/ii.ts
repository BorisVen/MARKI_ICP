import type { Identity } from '@dfinity/agent';
import { AuthClient } from '@dfinity/auth-client';
import { Delegation, DelegationChain, type JsonnableDelegationChain } from '@dfinity/identity';
import { iiIdentityNative, iiLogoutNative } from '../native/ii';

/**
 * Internet Identity: the user's own ICP wallet, unlocked with a fingerprint,
 * Face ID or a passkey. Nobody else (Marki included) holds its key. The
 * principal depends on the site's origin, so the app signs in through the
 * website (see IiBridge) and gets the same wallet as the web.
 */
export const II_URL = 'https://identity.ic0.app';
/** Origins the II window may answer from. */
const II_ORIGINS = ['https://identity.ic0.app', 'https://identity.internetcomputer.org', 'https://id.ai'];
/** Sessions last 30 days (II's maximum); then a fingerprint again. */
export const II_TTL_NS = BigInt(30 * 24 * 3600) * 1_000_000_000n;

let client: Promise<AuthClient> | null = null;
const authClient = () => (client ??= AuthClient.create({ idleOptions: { disableIdle: true } }));

/** The signed-in II identity; asks for the fingerprint only when `interactive`. */
export async function iiIdentity(interactive: boolean): Promise<Identity | null> {
  const native = await iiIdentityNative(interactive);
  if (native !== undefined) return native;
  const c = await authClient();
  if (await c.isAuthenticated()) return c.getIdentity();
  if (!interactive) return null;
  await new Promise<void>((resolve, reject) => c.login({
    identityProvider: II_URL,
    maxTimeToLive: II_TTL_NS,
    onSuccess: () => resolve(),
    onError: e => reject(new Error(e && e !== 'UserInterrupt' ? e : 'Вхід скасовано')),
  }));
  return c.getIdentity();
}

export async function iiLogout() {
  await iiLogoutNative();
  try { await (await authClient()).logout(); } catch { /* noop */ }
}

const fromHex = (hex: string) => new Uint8Array(hex.match(/../g)?.map(h => parseInt(h, 16)) ?? []);

/**
 * Website half of the app's sign-in: asks II to delegate to the app's session
 * key (`sessionKeyHex`, DER) and returns the delegation chain as JSON. Runs the
 * II window protocol directly, since the app — not this page — holds the key.
 */
export function iiDelegateTo(sessionKeyHex: string): Promise<JsonnableDelegationChain> {
  return new Promise((resolve, reject) => {
    const win = window.open(`${II_URL}/#authorize`, 'marki-ii', 'width=520,height=720');
    if (!win) { reject(new Error('Браузер заблокував вікно входу. Дозвольте спливні вікна й спробуйте ще раз.')); return; }
    let done = false;
    const finish = (fn: () => void) => { done = true; window.removeEventListener('message', onMessage); clearInterval(watch); fn(); };
    const watch = window.setInterval(() => { if (win.closed && !done) finish(() => reject(new Error('Вхід скасовано'))); }, 700);
    const onMessage = (e: MessageEvent) => {
      if (!II_ORIGINS.includes(e.origin) || e.source !== win) return;
      const m = e.data;
      if (m?.kind === 'authorize-ready') {
        win.postMessage({ kind: 'authorize-client', sessionPublicKey: fromHex(sessionKeyHex), maxTimeToLive: II_TTL_NS }, e.origin);
      } else if (m?.kind === 'authorize-client-success') {
        const chain = DelegationChain.fromDelegations(
          m.delegations.map((d: any) => ({
            delegation: new Delegation(d.delegation.pubkey, d.delegation.expiration, d.delegation.targets),
            signature: d.signature,
          })),
          m.userPublicKey,
        );
        finish(() => { win.close(); resolve(chain.toJSON()); });
      } else if (m?.kind === 'authorize-client-failure') {
        finish(() => { win.close(); reject(new Error(m.text || 'Internet Identity відмовив')); });
      }
    };
    window.addEventListener('message', onMessage);
  });
}
