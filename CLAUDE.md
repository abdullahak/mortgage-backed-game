# mortgage-backed-game — Claude Code Context

## Hosting

This project is hosted on a **Raspberry Pi**, NOT Netlify or any external service.

- Static files served by **nginx** from `/home/abdlh/mortgage-backed-game`
- nginx listens on **port 80**
- Access via `http://mortgage.abdlh.com` (local DNS override via pihole) or `http://192.168.4.57`

**Do NOT suggest Netlify, Vercel, or other external hosting services.**

## After Code Changes

No build step needed — it's a pure static site. Just update the files and they're live.

If the nginx config itself changes:
```bash
sudo systemctl reload nginx
```

## nginx Config Location

`/etc/nginx/sites-available/mortgage-backed-game`

## Backend

**Local Node.js backend** — no external services. Supabase has been removed.

- Backend: `backend/server.js` (Express + Socket.io)
- Database: SQLite via built-in `node:sqlite` at `backend/game.db`
- Auth: JWT in `localStorage` key `auth_token`
- Real-time: Socket.io (no Supabase Realtime)
- Port: **3010** (nginx proxies `/api/` and `/socket.io/` to it)
- Service: `sudo systemctl status mortgage-backend`
- Logs (includes OTP codes if no SMTP): `sudo journalctl -u mortgage-backend -f`

### After backend code changes
```bash
sudo systemctl restart mortgage-backend
```

### API helper pattern
All frontend pages use `apiFetch(path, options)` from `src/js/supabase.js`.
Auth token is attached automatically from `localStorage.getItem('auth_token')`.

### Socket.io CDN
Pages load `/socket.io/socket.io.js` (served by the backend via nginx proxy) — **not** a CDN URL.

## Port Notes

- Port 80: nginx serving this site
- Port 3010: mortgage-backend (Node.js) — internal only, proxied by nginx
- Port 8080: Docker proxy (127.0.0.1 only)
- Port 8081: pihole-FTL web UI (was port 80, moved to allow nginx on 80)
- Ports 3000–3002: occupied by other services on the Pi — do not use

## Local DNS

pihole custom.list has `192.168.4.57 mortgage.abdlh.com` so the domain resolves locally.
Pihole admin: `http://192.168.4.57:8081/admin`

## Firewall (iptables)

The Pi has an iptables firewall with `INPUT policy DROP`. Port 80 must be explicitly allowed.

Current relevant rules (saved to `/etc/iptables/rules.v4`):
- Port 80 (HTTP): ACCEPT from all
- Port 22 (SSH): ACCEPT from 192.168.4.109 only

If the site becomes unreachable from the MacBook, check iptables first:
```bash
sudo iptables -L INPUT -n --line-numbers
```
To re-add the port 80 rule if missing:
```bash
sudo iptables -I INPUT 3 -p tcp --dport 80 -j ACCEPT
sudo sh -c 'iptables-save > /etc/iptables/rules.v4'
```

## Accessing from MacBook

Claude Code runs on the Pi via SSH from the MacBook. The website is viewed in the MacBook's browser.
- Use `http://mortgage.abdlh.com` or `http://192.168.4.57` from the MacBook browser
- Do NOT suggest localhost — that won't work from the MacBook
