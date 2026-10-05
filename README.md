# MARKI ICP — MVP для користувачів (Internet Computer)

Веб-застосунок Marki для покупців: маркет, замовлення з оплатою при отриманні, перевірка товару за NFC, цифрові паспорти, профіль (підписки, колекції, QR-візитка, аналітика), тарифи й створення NFT з мінтом у ICP.

- `web/` — Vite + React + TypeScript, Firebase Auth, ICP (@dfinity/agent, Plug).
- `icp-local/` — канiстра `payments` (тарифи в ICP через ICRC-2, мінт ICRC-7) і локальна мережа.
- `api/` — спільний Rust-бекенд.

## Локальний запуск усього

```bash
cd icp-local && icp network start -d && icp deploy   # потрібен icp-cli
cd ../api && cargo run                               # :8090
cd ../web && cp .env.example .env.local && npm ci && npm run dev:icp   # :3002
```

`.env.icplocal` у `web/` вказує на локальну мережу ICP і локальний API. Деталі — `icp-local/README.md`.

## Бекенд (`api/`)

Rust + Axum, дані у Firebase (Firestore, Storage, Auth).

```bash
cp api/.env.example api/.env   # FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_PROJECT_ID, ...
cd api && cargo run            # http://localhost:8090
```

Docker: `docker build -t marki-api .` (Dockerfile у корені). `render.yaml` — приклад деплою на Render.
