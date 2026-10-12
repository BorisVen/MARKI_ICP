/** Public claim link for a gift code (works on GitHub Pages sub-paths too). */
export const giftUrl = (code: string) => `${window.location.origin}${import.meta.env.BASE_URL}?gift=${encodeURIComponent(code)}`;
