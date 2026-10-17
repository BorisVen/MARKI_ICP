import { publicUrl } from '../publicUrl';

/** Public claim link for a gift code (works on GitHub Pages sub-paths too). */
export const giftUrl = (code: string) => publicUrl(`?gift=${encodeURIComponent(code)}`);
