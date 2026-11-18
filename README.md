# Beeper Web — iPadOS Split-View Client

Eine moderne **Express + Vercel** Web-App für die **Beeper Desktop API** (`http://localhost:23373`) mit einer nativ inspirierten **iPadOS Split-View UI** (3-Spalten-Layout, Frosted Glass, Light/Dark Mode, PWA-Support für *„Zum Home-Bildschirm“* & integriertem Demo-Modus).

## Features

- **Express-Backend & Proxy (`src/app.js`)**:
  - Proxied alle wichtigen Beeper Desktop API v1 Endpunkte (`/v1/accounts`, `/v1/chats`, `/v1/chats/search`, `/v1/chats/:id/messages`, `/v1/messages/search`, `/v1/assets/serve`, Read/Unread/Archive).
  - **Vercel-Ready (`api/index.js` + `vercel.json`)**: Exportiert die Express-App als Vercel Serverless Function und liefert `public/` direkt aus.
  - **Zustandsbehafteter Demo-Modus**: Wenn kein lokaler Beeper Desktop erreichbar ist, kann die komplette UI inklusive Senden, Antworten, Löschen, Archivieren und Filtern sofort getestet werden.
- **iPad-UI (`public/`)**:
  - **3-Spalten iPadOS Split-View**: Netzwerk-Sidebar, Chat-Liste mit Live-Suche (`⌘K`) und Konversations-Stage + optionalem Detail-Inspector.
  - **Responsive**: Passt sich nahtlos an iPad Landscape, iPad Portrait (Slide-Over Sidebar) und iPhone/Mobile an.
  - **In-App API Setup**: URL und Bearer Token lassen sich direkt im Einstellungs-Modal hinterlegen (z. B. für Remote-Zugriff über Tailscale Funnel oder Cloudflare Tunnel).

## Lokales Setup

1. **Beeper Desktop API aktivieren**:
   - Beeper Desktop öffnen → **Einstellungen → Developers**
   - **Beeper Desktop API** aktivieren (Standardport `23373`)
   - Optional: **Create Access Token** für einen Bearer Token

2. **Abhängigkeiten installieren & starten**:
   ```bash
   npm install
   cp .env.example .env
   npm run dev
   ```
   Die App läuft dann unter `http://localhost:3000`.

## Vercel Deployment

1. Repository auf Vercel importieren (`beeper-web`).
2. Da die Beeper Desktop API standardmäßig nur lokal auf deinem Rechner (`localhost:23373`) läuft, kannst du für den Remote-Zugriff vom iPad aus z. B. **Tailscale Funnel** oder einen **Cloudflare Tunnel** nutzen und die Tunnel-URL sowie deinen Bearer Token entweder als Vercel Environment Variables (`BEEPER_API_URL`, `BEEPER_ACCESS_TOKEN`) oder direkt im **API Setup**-Modal in der Web-App eintragen.
3. Alternativ funktioniert der **Demo-Modus** auf Vercel sofort ohne weitere Konfiguration.

## Projektstruktur

```text
beeper-web/
├── api/
│   └── index.js         # Vercel Serverless Function Entrypoint
├── public/
│   ├── index.html       # iPadOS Split-View UI + PWA Meta Tags
│   ├── styles.css       # Vanilla CSS (Light/Dark Mode, Glassmorphism)
│   ├── app.js           # Frontend State & API Client
│   └── icon.svg         # App Icon
├── src/
│   ├── app.js           # Express App + Beeper Desktop API Proxy
│   └── mockData.js      # Demo-Modus Beispieldaten
├── server.js            # Lokaler Express Server
├── vercel.json          # Vercel Routing & Header Config
└── package.json
```
