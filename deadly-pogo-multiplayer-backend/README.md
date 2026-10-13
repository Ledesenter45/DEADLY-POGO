# DEADLY POGO multiplayer backend

## Run locally

1. Install Node.js 20+.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Run `npm start`.
5. The health check is available at `http://localhost:3000`.

## Deploy to Render

1. Push these files to a GitHub repository.
2. In Render, create **New + → Web Service** and select that repository.
3. Use **Build Command** `npm install` and **Start Command** `npm start`.
4. Deploy, then copy the service's HTTPS URL (for example `https://your-service.onrender.com`).
5. In `DEADLY_POGO_multiplayer_menu.html`, change `MP_SERVER_URL` from `http://localhost:3000` to your Render URL, using `https://`.
6. Serve the HTML from a website/host (or test locally over localhost). The Socket.IO client is loaded from a CDN, so internet access is required.

Optional Render environment variable:

- `ALLOWED_ORIGINS`: comma-separated exact origins for your game site, e.g. `https://your-game-site.example,https://www.your-game-site.example`. Leave unset only while testing; configure it for production.

## What this starter supports

- Create/join six-character invite-code rooms.
- Up to 8 players per room.
- Host starts all players on the same level.
- Clients broadcast character position/rotation; other players are drawn in each player's game.
- Room cleanup and host transfer when someone disconnects.

This is a co-op presence prototype, not fully authoritative synchronized physics. Each browser still simulates its own pogo physics, hazards, deaths, checkpoints, and wins locally. To make the level itself authoritative/shared, move gameplay simulation and important collision/progression decisions to the server. Don't trust client-sent rewards or cash.
