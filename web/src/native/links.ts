/** Web build: links into the phone app are handled by the app itself. */
export const IS_NATIVE = false;
export async function openInTab(_url: string): Promise<boolean> { return false; }
export type AppLink = { kind: 'open' | 'paid'; params: URLSearchParams };
export async function listenAppLinks(_onLink: (link: AppLink) => void): Promise<void> {}
