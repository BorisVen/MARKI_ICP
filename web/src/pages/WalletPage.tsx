import { lazy, Suspense, useState } from 'react';
import { useAuth } from '../auth';
import { Icon } from '../icons';
import PlanMeter from '../icp/PlanMeter';
import { useSubscription } from '../icp/useSubscription';
import {
  connectWallet,
  createOwnWallet,
  disconnectWallet,
  reconnectOwnWallet,
  unlinkOwnWallet,
  useWallet,
  type OwnWalletResult,
} from '../icp/useWallet';
import type { PageId } from '../Shell';

const OnChainHandover = lazy(() => import('../icp/OnChainHandover'));
const short = (p: string) => `${p.slice(0, 5)}…${p.slice(-3)}`;

/**
 * «Гаманець» in the profile: create your own ICP wallet (Internet Identity) so
 * the NFTs you make are yours, see where your NFTs and plan are, sign in again
 * when the 30-day session ends.
 */
export default function WalletPage({ onJumpTo }: { onJumpTo: (p: PageId) => void }) {
  const { user, reload } = useAuth();
  const wallet = useWallet();
  const plan = useSubscription();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<OwnWalletResult | null>(null);
  const [copied, setCopied] = useState(false);

  const hasOwn = user?.icpWalletKind === 'ii';
  const ownPrincipal = hasOwn ? user!.icpPrincipal! : null;
  const signedIn = wallet?.kind === 'ii';

  const run = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try { await fn(); } catch (e: any) { setError(e?.message ?? 'Не вдалося'); } finally { setBusy(null); }
  };

  const create = () => run('Підтвердіть у вікні Internet Identity…', async () => {
    const r = await createOwnWallet(t => setBusy(t));
    setResult(r);
    await reload();
    plan.refresh();
  });

  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });

  return (
    <div className="wallet-page">
      <div className="page-head">
        <div>
          <h2>Гаманець</h2>
          <p>Де живуть ваші NFT і тариф у блокчейні ICP.</p>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {busy && <div className="progress-banner" style={{ marginBottom: 12 }}><div className="mini-spin" /><div style={{ fontSize: 13 }}>{busy}</div></div>}

      {result && (
        <div className="success-banner" style={{ marginBottom: 14 }}>
          <strong>Гаманець готовий 🎉</strong>
          <div style={{ fontSize: 13, marginTop: 4 }}>
            {result.total > 0 ? `NFT перенесено: ${result.moved} з ${result.total}. ` : ''}
            {result.planMoved ? 'Тариф тепер на вашому гаманці. ' : ''}
            Нові NFT створюватимуться одразу на ньому.
          </div>
          {result.warning && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{result.warning}</div>}
        </div>
      )}

      {!hasOwn ? (
        <>
          <div className="card wallet-hero">
            <div className="wh-icon"><Icon.Lock size={28} /></div>
            <h3>Власний гаманець ICP</h3>
            <p className="muted">NFT, які ви створюєте й отримуєте, належатимуть тільки вам — не Marki і не застосунку.</p>
            <ul className="wh-list">
              <li><Icon.Check size={16} /> Вхід відбитком, Face ID або ключем доступу</li>
              <li><Icon.Check size={16} /> Без розширень, паролів і seed-фраз</li>
              <li><Icon.Check size={16} /> Безкоштовно — Internet Identity від творців ICP</li>
              <li><Icon.Check size={16} /> Тариф і NFT зі сховища Marki перенесемо самі</li>
            </ul>
            <button className="btn btn-primary btn-block" onClick={create} disabled={!!busy}>
              <Icon.Wallet /> Створити гаманець
            </button>
            <div className="muted" style={{ fontSize: 12, marginTop: 8, textAlign: 'center' }}>
              Уже є Internet Identity? Натисніть ту саму кнопку й увійдіть.
            </div>
          </div>

          <div className="card wallet-now">
            <div className="wn-title">Зараз</div>
            <div className="wn-row">
              <span>Гаманець Marki{wallet?.kind === 'marki' ? ` · ${short(wallet.principal)}` : ''}</span>
              {!wallet && <button className="btn" onClick={() => run('Підключення…', () => connectWallet('marki'))} disabled={!!busy}>Підключити</button>}
            </div>
            <div className="muted" style={{ fontSize: 12 }}>
              Ваші NFT зберігає Marki: їх можна дарувати й продавати, але ключ від них у Marki.
            </div>
          </div>
        </>
      ) : (
        <div className="card wallet-own">
          <div className="wo-head">
            <div className="wh-icon"><Icon.Wallet size={24} /></div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="wo-name">Мій гаманець</div>
              <div className="muted" style={{ fontSize: 12 }}>Internet Identity · {signedIn ? 'підключено' : 'потрібен вхід'}</div>
            </div>
            <span className={`badge ${signedIn ? 'badge-success' : ''}`}>{signedIn ? 'активний' : 'вийшли'}</span>
          </div>
          <button className="wo-address" onClick={() => copy(ownPrincipal!)} title="Скопіювати адресу">
            <code>{ownPrincipal}</code>
            <span>{copied ? 'Скопійовано' : 'Копіювати'}</span>
          </button>
          {!signedIn && (
            <>
              <button className="btn btn-primary btn-block" style={{ marginTop: 12 }} onClick={() => run('Підтвердіть вхід…', reconnectOwnWallet)} disabled={!!busy}>
                Увійти в гаманець
              </button>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Вхід діє 30 днів, потім ще раз відбиток — і все.</div>
            </>
          )}
          {signedIn && wallet.principal !== ownPrincipal && (
            <div className="notice notice-warn" style={{ marginTop: 10, marginBottom: 0 }}>
              Ви увійшли в інший Internet Identity ({short(wallet.principal)}). Вийдіть і увійдіть у той, що прив’язаний до профілю.
            </div>
          )}
        </div>
      )}

      {plan.active ? (
        <div className="card" style={{ marginBottom: 14 }}>
          <PlanMeter state={plan} />
        </div>
      ) : (
        <button className="card wallet-plan-cta" onClick={() => onJumpTo('plans')}>
          <span><strong>Тариф</strong><br /><small className="muted">Немає активного тарифу — оберіть пакет мінтів</small></span>
          <span>›</span>
        </button>
      )}

      <Suspense fallback={null}><OnChainHandover /></Suspense>

      {hasOwn && (
        <div className="wallet-actions">
          {signedIn && <button className="btn" onClick={() => run('Виходимо…', disconnectWallet)} disabled={!!busy}>Вийти на цьому пристрої</button>}
          <button
            className="btn btn-danger-ghost"
            disabled={!!busy}
            onClick={() => {
              if (!confirm('Відв’язати гаманець від профілю? NFT і тариф залишаться в ньому, а нові NFT знову зберігатиме Marki.')) return;
              run('Відв’язуємо…', async () => { await unlinkOwnWallet(); await reload(); });
            }}
          >
            Відв’язати гаманець
          </button>
        </div>
      )}

      <details className="soft">
        <summary>Як це працює</summary>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
          <p><strong>Internet Identity</strong> — безкоштовний вхід у блокчейн ICP від DFINITY. Ключ створюється на вашому пристрої й захищений відбитком чи Face ID; ні Marki, ні хтось інший його не має.</p>
          <p><strong>На телефоні й на сайті</strong> — один і той самий гаманець: у застосунку вхід відкривається в браузері й повертає вас назад.</p>
          <p><strong>Якщо загубите телефон</strong> — додайте другий пристрій або ключ відновлення на <a href="https://identity.ic0.app" target="_blank" rel="noreferrer">identity.ic0.app</a>. Без них доступ до гаманця не відновити.</p>
          <p><strong>Подарунки</strong> — NFT з вашого гаманця переходять отримувачу після вашого підтвердження тут, у блоці «NFT у блокчейні»; подаровані вам — приходять одразу на ваш гаманець.</p>
        </div>
      </details>
    </div>
  );
}
