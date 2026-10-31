import { useEffect, useState } from 'react';
import { apiBillingMe } from './api';
import { useAuth } from './auth';

const key = (uid: string) => `marki.canCreate.${uid}`;
function remembered(uid?: string) {
  if (!uid) return false;
  try { return localStorage.getItem(key(uid)) === '1'; } catch { return false; }
}

/**
 * May this account create NFTs in the app? The server decides; the last answer
 * is remembered per account, so the bottom bar does not jump at every start.
 */
export function useCanCreate(): boolean {
  const uid = useAuth().user?.uid;
  const [can, setCan] = useState(() => remembered(uid));
  useEffect(() => {
    setCan(remembered(uid));
    if (!uid) return;
    let stale = false;
    apiBillingMe().then(r => {
      if (stale) return;
      // A server from before this rule does not say: nothing changes until it updates.
      const allowed = r.creator ?? true;
      setCan(allowed);
      try { localStorage.setItem(key(uid), allowed ? '1' : '0'); } catch { /* noop */ }
    }).catch(() => {});
    return () => { stale = true; };
  }, [uid]);
  return can;
}
