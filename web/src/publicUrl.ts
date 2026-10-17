import { IS_NATIVE } from './native/links';

/**
 * The public address of a Marki page (`?nft=…`, `?gift=…`, `?u=…`, `?v=…`) for
 * links and QR codes. The website uses its own address; the phone app runs
 * at https://localhost, which means nothing to anyone else — it links to the
 * public site instead (that page then opens the app where it is installed).
 */
const SITE = IS_NATIVE
  ? ((import.meta.env.VITE_QR_BASE_URL as string) || 'https://borisven.github.io/MARKI_ICP/')
  : `${window.location.origin}${import.meta.env.BASE_URL}`;

export const publicUrl = (search: string) => `${SITE}${search.startsWith('?') ? search : `?${search}`}`;
