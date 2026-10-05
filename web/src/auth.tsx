import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { onAuthStateChanged, signOut, type User as FbUser } from 'firebase/auth';
import { auth } from './firebase';
import { apiMe, type User } from './api';

type AuthState = {
  fbUser: FbUser | null;
  user: User | null;
  loading: boolean;
  error: string | null;
  /** Signed in with Firebase but no Marki profile yet: show the sign-up form. */
  needsRegistration: boolean;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
};

// Keep one context object across Vite hot updates. When api.ts or firebase.ts
// changes, this module re-runs; a new context would no longer match the
// AuthProvider already mounted by main.tsx, and useAuth would throw.
const Ctx: React.Context<AuthState | null> =
  import.meta.hot?.data.authCtx ?? createContext<AuthState | null>(null);
if (import.meta.hot) import.meta.hot.data.authCtx = Ctx;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [fbUser, setFbUser] = useState<FbUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsRegistration, setNeedsRegistration] = useState(false);

  const fetchProfile = useCallback(async () => {
    setProfileLoading(true);
    setError(null);
    setNeedsRegistration(false);
    try {
      const me = await apiMe();
      setUser(me);
    } catch (err: any) {
      setUser(null);
      if (err?.status === 404) setNeedsRegistration(true);
      else setError(err?.message ?? 'Не вдалося завантажити профіль');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    return onAuthStateChanged(auth, u => {
      setFbUser(u);
      setAuthReady(true);
      if (!u) {
        setUser(null);
        setError(null);
        setProfileLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (fbUser) fetchProfile();
  }, [fbUser, fetchProfile]);

  const value: AuthState = {
    fbUser,
    user,
    loading: !authReady || profileLoading,
    error,
    needsRegistration,
    reload: fetchProfile,
    logout: () => signOut(auth),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Banned accounts cannot use the app. */
export function isBanned(u: User | null): boolean {
  return !!u?.banned;
}
