# Project Instructions

## Dev/Prod Testing Rules

Production and development must always stay separate.

- Do not run development servers on the same ports as production.
- Do not write dev-generated files, uploads, stories, images, game state, or test data into production data directories.
- Do not restart or modify production services unless the user explicitly asks.

Production ports and paths observed on this Raspberry Pi:

- Production public web port: `80` through nginx for `mortgage.abdlh.com`.
- Production backend/API port: `3010` on `127.0.0.1`, proxied by nginx for `/api/` and `/socket.io/`.
- Production nginx root: `/mnt/ssd/projects/mortgage-backed`.
- Treat these as stable production resources; do not reuse them for development.

When testing from the user's phone while they are on the go:

- Assume the phone reaches the Raspberry Pi through Tailscale.
- Use the dedicated mortgage-backed phone-facing dev port: `3011`.
- Bind the phone-facing dev server to `0.0.0.0` when needed so it is reachable over Tailscale.
- Provide the phone-test URL as `http://100.110.102.49:3011` or `http://pi.taildb6607.ts.net:3011`.
- Tailscale Serve currently has no HTTPS config on this Pi; use raw Tailscale HTTP unless a future `tailscale serve status` shows HTTPS is configured.

Dev server commands:

- Inspect `package.json` before choosing commands. The root package currently only defines Playwright test scripts; the backend package in `backend/package.json` defines `npm run start`.
- Do not use production port `80` or backend port `3010` for development.
- If backend testing is needed, run it on a separate dev-only port, for example: `PORT=3111 npm --prefix backend run start`.
- Serve the web UI on the dedicated phone-facing dev port `3011`. If no project script has been added for static serving, use a simple dev-only static server bound to `0.0.0.0` and keep backend/API proxying pointed at the dev backend port, not `3010`.
- Keep dev game state and test data out of production paths; use a dev-only location such as `/mnt/ssd/dev-data/mortgage-backed`.

When finishing any web change, tell the user:

- Which dev server command is running.
- Which port it is using.
- The exact phone-test URL.
- Whether production was untouched.
