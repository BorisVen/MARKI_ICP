import type { NFT, OwnershipRecord } from './api';
import { fmtDateTime } from './format';

const VIA: Record<OwnershipRecord['via'], string> = { issued: 'випустив', gift: 'подарунок', sale: 'купівля' };

/**
 * Ownership chain, oldest first. Gifts claimed before the chain was stored only
 * kept `giftFrom`, so those are rebuilt as giver → current owner.
 */
export function ownershipChain(nft: NFT, currentOwner?: string): OwnershipRecord[] {
  if (nft.owners?.length) return nft.owners;
  if (nft.giftFrom) {
    return [
      { uid: '', name: nft.giftFrom, at: nft.createdAt ?? '', via: 'issued' },
      { uid: '', name: currentOwner || 'Власник', at: '', via: 'gift' },
    ];
  }
  return [];
}

/** «Water → Алан» with how and when each owner got the item. */
export function OwnerChain({ owners }: { owners: OwnershipRecord[] }) {
  return (
    <ol className="owner-chain">
      {owners.map((o, i) => (
        <li key={`${o.uid}-${i}`} className={i === owners.length - 1 ? 'current' : ''}>
          <strong>{o.name}</strong>
          {o.username && <span className="muted"> @{o.username}</span>}
          <div className="muted oc-sub">
            {VIA[o.via] ?? o.via}{o.at && ` · ${fmtDateTime(o.at)}`}{i === owners.length - 1 && ' · зараз'}
          </div>
        </li>
      ))}
    </ol>
  );
}
