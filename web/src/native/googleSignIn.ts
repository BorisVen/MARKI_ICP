/** Web build: Google sign-in uses the browser popup; there is no native app here. */
export async function nativeGoogleIdToken(): Promise<string | null> {
  return null;
}
