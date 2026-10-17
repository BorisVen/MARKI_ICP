import { auth } from './firebase';

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string) ||
  (import.meta.env.VITE_API_URL as string) ||
  'https://idenity.onrender.com';

// console.log('[API] API_BASE_URL:', BASE_URL);

async function token(): Promise<string | null> {
  try {
    return (await auth.currentUser?.getIdToken()) ?? null;
  } catch {
    return null;
  }
}

/**
 * fetch against the API with readable errors: a network failure names the API
 * host, and a JSON error body (`{"error": "..."}`) becomes its message.
 */
async function send(path: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, init);
  } catch {
    throw new Error(`Сервер ${BASE_URL} недоступний. Перевір VITE_API_BASE_URL і чи запущено API.`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j?.error ?? j?.message ?? text;
    } catch { /* plain text body */ }
    if (res.status === 401) msg = `Сесія недійсна, увійди знову. ${msg}`.trim();
    if (res.status === 404 && !msg) msg = `Метод API не знайдено: ${path}`;
    throw Object.assign(new Error(msg || `HTTP ${res.status}`), { status: res.status });
  }
  return res;
}

async function req<T>(method: string, path: string, body?: unknown, asForm = false): Promise<T> {
  const t = await token();
  const headers: Record<string, string> = {};
  if (t) headers['Authorization'] = `Bearer ${t}`;
  if (body && !asForm) headers['Content-Type'] = 'application/json';

  const res = await send(path, {
    method,
    headers,
    body: asForm ? (body as BodyInit) : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const get  = <T>(p: string)                 => req<T>('GET',    p);
const post = <T>(p: string, b?: unknown)    => req<T>('POST',   p, b);
const put  = <T>(p: string, b?: unknown)    => req<T>('PUT',    p, b);
const del  = <T>(p: string)                 => req<T>('DELETE', p);

// ── Types ────────────────────────────────────────────────────────────────────

export type User = {
  uid: string;
  name: string;
  username: string;
  email: string;
  phone?: string;
  avatar?: string;
  location?: string;
  bio?: string;
  createdAt: string;
  companyApproved: boolean;
  pendingApproval: boolean;
  banned?: boolean;
  deliveryAddress?: string;
  roles?: string[];
  companyId?: string;
  companyName?: string;
  registrationNumber?: string;
  contactEmail?: string;
  businessDescription?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected' | 'banned';
  rejectionReason?: string;
  banReason?: string;
  // Social (idenity/api feat/social-api); absent on older backends.
  followersCount?: number;
  followingCount?: number;
  likesCount?: number;
  savedPosts?: string[];
  repostedPosts?: string[];
  /** Linked wallet: where gifted tokens are sent on-chain. */
  icpPrincipal?: string;
  /** "ii" — the user's own Internet Identity wallet; "plug" — Plug. */
  icpWalletKind?: 'ii' | 'plug';
};

export type PublicProfile = {
  uid: string;
  name: string;
  username: string;
  avatar?: string;
  bio?: string;
  companyApproved: boolean;
  followersCount: number;
  followingCount: number;
  likesCount: number;
  isFollowing: boolean;
};

export type PublicUser = {
  uid: string;
  name: string;
  username: string;
  avatar?: string;
  bio?: string;
  companyApproved: boolean;
};

export type NFT = {
  id: string;
  walletNftId?: string;
  title: string;
  description?: string;
  image?: string;
  imageUrl?: string;
  attributes?: { trait_type: string; value: string }[];
  forSale?: boolean;
  price?: number;
  currency?: string;
  userId?: string;
  tokenId?: string;
  metadataUri?: string;
  nfcUid?: string;
  tags?: string[];
  category?: string;
  blockchain?: string;
  royalty?: number;
  createdAt?: string;
  batchId?: string;
  batchName?: string;
  batchIndex?: number;
  batchSize?: number;
  /** Editions: 0 = master (original), 1..N = copies. */
  editionNumber?: number;
  editionCount?: number;
  masterNftId?: string;
  qrImageUrl?: string;
  /** Passport page views (HANDOFF-public-analytics-api.md). */
  views?: number;
  /** Set when the NFT was received as a gift. */
  giftFrom?: string;
  giftId?: string;
  /** Minted as a gift collection: visitors may ask the owner for it. */
  giftCollection?: boolean;
  /** When and where the owner bought the product (from a granted gift request). */
  purchase?: { date: string; place?: string };
  /** Wallet owner's uid (set by the API). */
  ownerId?: string;
  /** Ownership chain, oldest first: issuer, then every gift or sale. */
  owners?: OwnershipRecord[];
  /** `icp:<canister>:<token>` after an on-chain mint. */
  mintAddress?: string;
};

export type Post = {
  id: string;
  userId: string;
  /** What the API sends: the author's name and avatar. */
  userName?: string;
  userAvatar?: string;
  reposts?: number;
  authorName?: string;
  authorAvatar?: string;
  text?: string;
  title?: string;
  description?: string;
  nftId?: string;
  walletNftId?: string;
  walletNftIds?: string[];
  nftTitle?: string;
  nftImage?: string;
  nftImages?: string[];
  forSale?: boolean;
  price?: number | null;
  currency?: string;
  blockchain?: string;
  tags?: string[];
  likes?: number;
  likedBy?: string[];
  comments?: { id: string; userId: string; text: string; createdAt: string }[];
  createdAt: string;
};

export type CodOrder = {
  id: string;
  postId: string;
  nftId: string;
  nftTitle: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  price: number;
  nftCurrency: string;
  paymentCurrency: string;
  deliveryAddress: string;
  fullName: string;
  phone: string;
  status: 'pending' | 'in_delivery' | 'completed' | 'cancelled';
  createdAt: string;
  deliveryId?: string;
};

export type DeliveryCheckpoint = {
  id: string;
  status: string;
  location: string;
  timestamp: string;
  recordedBy: string;
  recordedByName?: string;
  note?: string;
};

export type Delivery = {
  id: string;
  orderId?: string;
  nftId: string;
  nftTitle: string;
  sellerId: string;
  buyerId: string;
  buyerName: string;
  deliveryAddress: string;
  carrierType: 'self' | 'nova_poshta';
  courierId?: string;
  courierName?: string;
  controllerId?: string;
  controllerName?: string;
  npTrackingNumber?: string;
  npLastSyncedAt?: string;
  status: string;
  checkpoints: DeliveryCheckpoint[];
  customerReceived: boolean;
  receivedAt?: string;
  nfcUid?: string;
  nfcVerified: boolean;
  nfcVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateDeliveryInput = {
  orderId?: string;
  nftId: string;
  buyerId: string;
  deliveryAddress: string;
  carrierType: 'self' | 'nova_poshta';
  npTrackingNumber?: string;
  courierId?: string;
  controllerId?: string;
  nfcUid?: string;
  createdAt?: string;
  status?: string;
  initialLocation?: string;
  initialNote?: string;
};

export type MarkiWallet = {
  uid: string;
  email: string;
  balance: Record<string, number>;
  fingerprintEnabled: boolean;
};

export type CryptoWallet = {
  id: string;
  address: string;
  label?: string;
  balance?: number;
  lastBalanceAt?: string;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
};

// ── Auth + profile ───────────────────────────────────────────────────────────

/** Creates the Marki profile after Firebase sign-up. */
export const apiRegister = (d: { uid: string; name: string; username: string; email: string; phone?: string }) =>
  post<User>('/api/auth/register', d);

export const apiMe = () => get<User>('/api/auth/me');

export const apiGetProfile = (uid: string) => get<User>(`/api/profile/${uid}`);

export const apiUpdateProfile = (uid: string, d: Partial<User>) =>
  put<User>(`/api/profile/${uid}`, d);

export const apiUploadAvatar = async (uid: string, file: File): Promise<{ avatar: string }> => {
  const t = await token();
  const res = await send(`/api/profile/${uid}/avatar`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${t}`,
      'Content-Type': file.type || 'image/jpeg',
    },
    body: file,
  });
  return res.json();
};

export const apiChangePassword = (uid: string, newPassword: string) =>
  put<void>(`/api/profile/${uid}/password`, { newPassword });

export const apiRequestApproval = (uid: string, d: {
  companyName: string;
  registrationNumber: string;
  contactEmail: string;
  description: string;
}) => post<void>(`/api/profile/${uid}/request-approval`, d);

export const apiSearchUsers = (q: string) =>
  get<PublicUser[]>(`/api/users/search?q=${encodeURIComponent(q)}`);

// ── NFTs ─────────────────────────────────────────────────────────────────────

export const apiGetNFTs = () => get<NFT[]>('/api/nfts');
export const apiGetNFT  = (id: string) => get<NFT>(`/api/nfts/${id}`);
export const apiUpdateNFT = (id: string, d: Partial<NFT>) => put<NFT>(`/api/nfts/${id}`, d);
export const apiDeleteNFT = (id: string) => del<void>(`/api/nfts/${id}`);

export const apiGetMintInfo = () => get<{
  mintCount: number;
  isFree: boolean;
  /** Estimated cycles cost per mint (display only; backend pays reverse gas). */
  estimatedCyclesPerMint?: number;
}>('/api/nfts/mint-info');

export const apiCreateNFT = async (form: FormData) => {
  const t = await token();
  const res = await send(`/api/nfts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}` },
    body: form,
  });
  return res.json() as Promise<NFT & { metadataUri?: string }>;
};

export const apiBatchCreateNFTs = async (form: FormData) => {
  const t = await token();
  const res = await send(`/api/nfts/batch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}` },
    body: form,
  });
  return res.json();
};

export const apiCreateEditionNFTs = async (form: FormData) => {
  const t = await token();
  const res = await send(`/api/nfts/editions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}` },
    body: form,
  });
  return res.json();
};

export const apiGenerateNFTQr = async (nftId: string) => {
  const t = await token();
  const res = await send(`/api/nfts/${encodeURIComponent(nftId)}/qr`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}` },
  });
  return res.json() as Promise<NFT>;
};

export const apiGenerateMissingQr = async () => {
  const t = await token();
  const res = await send(`/api/nfts/qr-missing`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}` },
  });
  return res.json() as Promise<{ generated: number }>;
};

export const apiRegenerateAllQr = async () => {
  const t = await token();
  const res = await send(`/api/nfts/regenerate-qr`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}` },
  });
  return res.json() as Promise<{ regenerated: number }>;
};

// ── Posts (marketplace + feed) ───────────────────────────────────────────────

export const apiGetPosts   = () => get<Post[]>('/api/posts');
export const apiCreatePost = (d: Partial<Post>) => post<Post>('/api/posts', d);
export const apiDeletePost = (id: string) => del<void>(`/api/posts/${id}`);
export const apiLikePost   = (id: string) => post<Post>(`/api/posts/${id}/like`);
export const apiSavePost   = (id: string) => post<{ saved: boolean }>(`/api/posts/${id}/save`);
export const apiRepostPost = (id: string) => post<{ reposted: boolean; reposts: number }>(`/api/posts/${id}/repost`);

// ── Social (contract: HANDOFF-social-api.md) ─────────────────────────────────

export const apiMySaved   = () => get<Post[]>('/api/users/me/saved');
export const apiMyReposts = () => get<Post[]>('/api/users/me/reposts');
export const apiMyLikes   = () => get<Post[]>('/api/users/me/likes');
export const apiPublicProfile = (uid: string) => get<PublicProfile>(`/api/users/${uid}`);
// ── Public (no sign-in) and analytics (HANDOFF-public-analytics-api.md) ─────

export type PublicUserCard = {
  uid: string;
  name: string;
  username: string;
  avatar?: string;
  bio?: string;
  location?: string;
  companyApproved: boolean;
  followersCount: number;
  followingCount: number;
  likesCount: number;
  isFollowing?: boolean;
};
export type PublicNft = { id: string; title: string; image?: string; batchName?: string; createdAt?: string; views?: number; nfcUid?: string | null; hasNfc?: boolean };
export type PublicPassport = {
  issuedByIdenity: boolean; issuerVerified: boolean; issuerName: string; ownerName?: string; nft: NFT;
  /** The QR's NFT was given or sold since: where it is now. */
  movedTo?: { ownerId: string; nftId: string };
};
export type Analytics = {
  profileViews: number;
  passportViews: number;
  followersCount: number;
  likesCount: number;
  days: { date: string; profileViews: number; passportViews: number }[];
  topPassports: { id: string; title: string; image?: string; views: number }[];
};

const enc = encodeURIComponent;
export const apiPublicUser     = (username: string) => get<PublicUserCard>(`/api/public/users/${enc(username)}`);
export const apiPublicUserNfts = (username: string) => get<PublicNft[]>(`/api/public/users/${enc(username)}/nfts`);
export const apiPublicPassport = (ownerId: string, nftId: string) => get<PublicPassport>(`/api/public/nfts/${enc(ownerId)}/${enc(nftId)}`);
/** View pings never surface errors: counting must not break the page. */
export const apiViewProfile  = (username: string) => post<void>(`/api/public/users/${enc(username)}/view`).catch(() => {});
export const apiViewPassport = (ownerId: string, nftId: string) => post<void>(`/api/public/nfts/${enc(ownerId)}/${enc(nftId)}/view`).catch(() => {});
export const apiMyAnalytics  = () => get<Analytics>('/api/users/me/analytics');

export interface OwnershipRecord {
  uid: string;
  name: string;
  username?: string;
  at: string;
  via: 'issued' | 'gift' | 'sale';
}

// ── Gifts ────────────────────────────────────────────────────────────────────

export type GiftClaim = { nftId: string; sourceNftId: string; uid: string; name: string; username: string; claimedAt: string };
export type Gift = {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerUsername: string;
  fromCompany: boolean;
  title: string;
  message: string;
  image: string;
  total: number;
  remainingNftIds: string[];
  claims: GiftClaim[];
  status: 'active' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
  /** Sub-collections of one gift collection share a group id; one QR each. */
  groupId?: string;
  part?: number;
  parts?: number;
  /** One person may take the whole sub-collection. */
  allowAll?: boolean;
};
export type GiftPreview = {
  id: string; title: string; message: string; image: string; ownerName: string; ownerUsername: string;
  fromCompany: boolean; total: number; remaining: number; status: Gift['status'];
  part?: number; parts?: number; allowAll?: boolean;
};
export const apiCreateGift = (d: { nftIds: string[]; title?: string; message?: string }) => post<Gift>('/api/gifts', d);
/** A gift collection split into `parts` sub-collections (one link/QR each; parts = 1 gives one). */
export const apiCreateGiftGroup = (d: { nftIds: string[]; title?: string; message?: string; parts: number; allowAll: boolean }) =>
  post<Gift[]>('/api/gifts/split', d);
export const apiMyGifts    = () => get<{ sent: Gift[]; received: Gift[] }>('/api/gifts');
export const apiCancelGift = (code: string) => del<Gift>(`/api/gifts/${enc(code)}`);
/** `all`: take the whole sub-collection (when the sender allows it). */
export const apiClaimGift  = (code: string, all = false) =>
  post<{ gift: Gift; nft: NFT; nfts?: NFT[] }>(`/api/gifts/${enc(code)}/claim`, { all });
export const apiGiftPreview = (code: string) => get<GiftPreview>(`/api/public/gifts/${enc(code)}`);

type FollowResult = { following: boolean; followersCount: number; followingCount: number };
export const apiFollow   = (uid: string) => post<FollowResult>(`/api/users/${uid}/follow`);
export const apiUnfollow = (uid: string) => del<FollowResult>(`/api/users/${uid}/follow`);
export const apiAddComment = (id: string, text: string) =>
  post<Post>(`/api/posts/${id}/comments`, { text });

// ── COD orders ───────────────────────────────────────────────────────────────

export const apiListCodOrders = () => get<CodOrder[]>('/api/cod-orders');
export const apiAcceptCodOrder = (id: string, d: {
  carrierType: 'self' | 'nova_poshta';
  npTrackingNumber?: string;
  courierId?: string;
  controllerId?: string;
  nfcUid?: string;
}) => post<Delivery>(`/api/cod-orders/${id}/accept`, d);

// ── Deliveries ───────────────────────────────────────────────────────────────

export const apiListDeliveries = () => get<Delivery[]>('/api/deliveries');
export const apiGetDelivery    = (id: string) => get<Delivery>(`/api/deliveries/${id}`);
export const apiCreateDelivery = (d: CreateDeliveryInput) =>
  post<Delivery>('/api/deliveries', d);
export const apiUpdateCarrier  = (id: string, d: {
  carrierType: 'self' | 'nova_poshta';
  npTrackingNumber?: string;
  courierId?: string;
  controllerId?: string;
}) => put<Delivery>(`/api/deliveries/${id}/carrier`, d);
export const apiUpdateDeliveryStatus = (id: string, status: string) =>
  put<Delivery>(`/api/deliveries/${id}/status`, { status });
export const apiAddCheckpoint = (id: string, d: { status: string; location: string; timestamp?: string; note?: string }) =>
  post<Delivery>(`/api/deliveries/${id}/checkpoints`, d);
export const apiSyncNovaPoshta = (id: string) =>
  post<Delivery>(`/api/deliveries/${id}/sync-novaposhta`);
export const apiConfirmReceipt = (id: string) =>
  post<Delivery>(`/api/deliveries/${id}/confirm-receipt`);

// ── Buying ───────────────────────────────────────────────────────────────────

/** Order with cash on delivery: the seller accepts it and ships. */
export const apiCashOnDelivery = (d: {
  postId: string;
  nftId: string;
  deliveryAddress: string;
  currency: string;
  fullName: string;
  phone: string;
}) => post<CodOrder>('/api/marketplace/cod', d);

/** Checks that an NFT really sits in its owner's Marki wallet and who issued it. */
export const apiVerifyNFT = (d: { nftId: string; ownerId: string }) =>
  post<{ issuedByIdenity: boolean; issuerVerified: boolean; issuerName: string; nft: NFT }>('/api/nfts/verify', d);

// ── NFC ──────────────────────────────────────────────────────────────────────

export const apiBindNfc   = (d: { nftId: string; nfcUid: string }) =>
  post<{ success: boolean; nfcUid: string; nftId: string }>('/api/nfc/bind', d);

export const apiVerifyNfc = (nfcUid: string) =>
  post<{
    nftId: string;
    nftTitle: string;
    ownerId: string;
    ownerName: string;
    tokenId?: string;
    deliveryId?: string;
    autoConfirmedReceipt: boolean;
  }>('/api/nfc/verify', { nfcUid });

// ── Wallets ──────────────────────────────────────────────────────────────────

export const apiGetMarkiWallet    = () => get<MarkiWallet>('/api/wallets/marki');
export const apiUpdateMarkiEmail  = (newEmail: string) =>
  put<void>('/api/wallets/marki/email', { newEmail });
export const apiUpdateFingerprint = (enabled: boolean) =>
  put<void>('/api/wallets/marki/fingerprint', { enabled });

export const apiGetCryptoWallets = () => get<CryptoWallet[]>('/api/wallets/crypto');
export const apiAddCryptoWallet  = (d: { address: string; label?: string }) =>
  post<CryptoWallet>('/api/wallets/crypto', d);
export const apiRemoveCryptoWallet = (id: string) => del<void>(`/api/wallets/crypto/${id}`);
export const apiRefreshWalletBalance = (id: string) =>
  put<CryptoWallet>(`/api/wallets/crypto/${id}/balance`);

// ── Notifications ────────────────────────────────────────────────────────────

export const apiGetNotifications   = () => get<Notification[]>('/api/notifications');
export const apiMarkRead           = (id: string) => put<void>(`/api/notifications/${id}/read`);
export const apiMarkAllRead        = () => put<void>('/api/notifications/read-all');
export const apiDeleteNotification = (id: string) => del<void>(`/api/notifications/${id}`);

// ── AI image generation ──────────────────────────────────────────────────────

export const apiAiGenerateImage = async (prompt: string): Promise<Blob> => {
  const res = await send(`/api/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  return res.blob();
};

// ── Goods authenticity (products → batches → units) ─────────────────────────

export type GoodsCategory = 'wine' | 'spirits' | 'beer' | 'dairy' | 'food' | 'cosmetics' | 'other';
export type GoodsStage = 'produced' | 'warehouse' | 'shipped' | 'in_store';
export type GoodsEventKind = GoodsStage | 'lab' | 'note';

export interface GoodsProduct {
  id: string;
  ownerId: string;
  brandName: string;
  name: string;
  category: GoodsCategory;
  /** 'unit': a QR per item (wine); 'batch': one QR per lot (milk). */
  mode: 'unit' | 'batch';
  description: string;
  image: string;
  attributes: Record<string, string>;
  createdAt: string;
}

export interface GoodsBatchSummary {
  id: string;
  lot: string;
  producedAt: string;
  expiresAt: string;
  size: number;
  claimed: number;
  /** Units flagged as probable copies. */
  flagged: number;
  stage: GoodsStage;
  createdAt: string;
}

export interface GoodsEvent {
  kind: GoodsEventKind;
  location: string;
  note: string;
  actorName: string;
  at: string;
}

export interface GoodsUnit {
  serial: number;
  code: string;
  ownerId?: string;
  ownerName?: string;
  claimedAt?: string;
  /** Set when scans look like a copied label. */
  flag?: {
    at: string;
    /** 'countries' and 'distance' prove a copy; 'devices' only hints at one. */
    reason: 'countries' | 'distance' | 'devices';
    regions: string[];
    distanceKm?: number;
    hours?: number;
    devices?: number;
  };
}

export interface GoodsBatch {
  id: string;
  productId: string;
  ownerId: string;
  mode: 'unit' | 'batch';
  lot: string;
  producedAt: string;
  expiresAt: string;
  attributes: Record<string, string>;
  units: GoodsUnit[];
  events: GoodsEvent[];
  createdAt: string;
}

export interface GoodsVerifyView {
  code: string;
  mode: 'unit' | 'batch';
  product: GoodsProduct;
  brandVerified: boolean;
  batchId: string;
  lot: string;
  producedAt: string;
  expiresAt: string;
  attributes: Record<string, string>;
  batchSize: number;
  unit?: {
    serial: number; claimed: boolean; claimedAt?: string; mine: boolean;
    owners: { name: string; at: string; via: 'receipt' | 'gift' }[];
    /** The owner's pending handover token (only for the owner). */
    transferToken?: string;
  };
  stage: GoodsStage;
  events: GoodsEvent[];
  warnings: string[];
  /** Seen in two countries at once: very likely a copied label. */
  suspicious: boolean;
  suspiciousRegions?: string[];
  /** Why the unit is flagged (short summary in the app). */
  flag?: GoodsUnit['flag'];
  /** 'qr' today; 'nfc' for signed chips later. */
  protection: 'qr' | 'nfc';
}

/** The phone's time zone tells the server which country a scan came from. */
const scanQuery = (peek?: boolean) => {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''; } catch { /* old browser */ }
  return `?tz=${encodeURIComponent(tz)}${peek ? '&peek=1' : ''}`;
};
/** `peek` re-checks without counting a scan (the open page polls). */
export const apiGoodsPublic = (code: string, peek?: boolean) =>
  get<GoodsVerifyView>(`/api/public/goods/${encodeURIComponent(code)}${scanQuery(peek)}`);
export const apiGoodsVerify = (code: string, peek?: boolean) =>
  get<GoodsVerifyView>(`/api/goods/verify/${encodeURIComponent(code)}${scanQuery(peek)}`);
/** Optional: the scan's location (the server rounds it to ~10 km). */
export const apiGoodsLocate = (code: string, lat: number, lng: number) => {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''; } catch { /* old browser */ }
  return post<void>(`/api/public/goods/${encodeURIComponent(code)}/locate`, { lat, lng, tz });
};
export const apiGoodsCreateTransfer = (code: string) =>
  post<{ token: string }>(`/api/goods/verify/${encodeURIComponent(code)}/transfer`);
export const apiGoodsCancelTransfer = (code: string) =>
  del<void>(`/api/goods/verify/${encodeURIComponent(code)}/transfer`);
export const apiGoodsAcceptTransfer = (code: string, token: string) =>
  post<GoodsVerifyView>(`/api/goods/verify/${encodeURIComponent(code)}/accept`, { token });
export const apiGoodsClaim = (code: string, receipt: string) =>
  post<GoodsVerifyView>(`/api/goods/verify/${encodeURIComponent(code)}/claim`, { receipt });
export const apiMyGoods = () => get<GoodsVerifyView[]>('/api/goods/mine');

// ── Gift requests: ask the owner for a gift-collection NFT ──────────────────

export type GiftRequest = {
  id: string;
  ownerId: string;
  nftId: string;
  nftTitle: string;
  nftImage: string;
  requesterId: string;
  requesterName: string;
  requesterUsername: string;
  /** YYYY-MM-DD */
  boughtOn: string;
  boughtAt: string;
  comment: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: string;
  decidedAt?: string;
};
export const apiCreateGiftRequest = (d: { ownerId: string; nftId: string; boughtOn: string; boughtAt?: string; comment?: string }) =>
  post<GiftRequest>('/api/gift-requests', d);
export const apiGiftRequests = () => get<{ incoming: GiftRequest[]; outgoing: GiftRequest[] }>('/api/gift-requests');
export const apiApproveGiftRequest = (id: string) => post<GiftRequest>(`/api/gift-requests/${encodeURIComponent(id)}/approve`);
export const apiDeclineGiftRequest = (id: string) => post<GiftRequest>(`/api/gift-requests/${encodeURIComponent(id)}/decline`);
/** Mark (or unmark) NFTs as a gift collection. */
export const apiSetGiftCollection = (nftIds: string[], value: boolean) =>
  post<{ changed: number }>('/api/nfts/gift-collection', { nftIds, value });

// ── On-chain handover of gifted NFTs ────────────────────────────────────────

/** Link (or with `null` unlink) the Plug principal that receives gifted tokens. */
export const apiLinkIcpPrincipal = (principal: string | null, kind: 'ii' | 'plug' = 'plug') =>
  put<void>('/api/me/icp-principal', { principal, kind });
export type PendingOnchain = {
  /** `icp:<canister>:<token>` */
  mintAddress: string;
  nftTitle: string;
  toUid: string;
  toName: string;
  toPrincipal?: string;
  givenAt: string;
};
/** NFTs I gave away whose tokens may still sit in my wallet. */
export const apiOnchainPending = () => get<PendingOnchain[]>('/api/onchain/pending');
/** Move my tokens from Marki custody to my own wallet (all on-chain NFTs when `nftIds` is empty). */
export const apiWithdrawOnchain = (principal: string, nftIds: string[] = []) =>
  post<{ moved: number; total: number }>('/api/onchain/withdraw', { principal, nftIds });

// ── Card payments for plans (WayForPay; test mode charges 1 UAH) ────────────

export type BillingCheckout = { orderId: string; url: string; fields: [string, string][]; testMode: boolean };
export type BillingOrder = {
  id: string;
  planId: string;
  principal: string;
  amount: string;
  currency: string;
  /** pending · approved · declined · … (WayForPay's status, lowercased) */
  status: string;
  credited: boolean;
  testMode: boolean;
  createdAt: string;
  log: { at: string; text: string }[];
};
export const apiBillingCheckout = (d: { planId: string; principal: string; returnUrl: string }) =>
  post<BillingCheckout>('/api/billing/checkout', d);
export const apiMarkiWalletSeed = () => get<{ seed: string }>('/api/me/icp-wallet');
export const apiRegisterPushToken = (token: string) => put<void>('/api/me/push-token', { token });
export const apiBillingOrders = () => get<BillingOrder[]>('/api/billing/orders');

// ── Wallet sign-in relay (app ⇄ website, Internet Identity) ─────────────────

export const apiIiRelayPut = (key: string, chain: unknown) => post<void>(`/api/public/ii-relay/${enc(key)}`, chain);
/** The app's sign-in, or null while the website has not finished it. */
export const apiIiRelayTake = (key: string) =>
  get<{ chain: string }>(`/api/public/ii-relay/${enc(key)}`).then(r => r.chain).catch((e: any) => {
    if (e?.status === 404) return null;
    throw e;
  });
