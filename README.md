# Snake Battle Arena — Coin Rush

A ready-to-run real-time multiplayer browser game for up to 8 players.

## Requirements
- Node.js 18 or newer
- Internet connection for the first install (`npm install`)
- A modern browser

## Run locally
1. Extract the ZIP.
2. Open a terminal in the extracted `snake-battle-arena` folder.
3. Run `npm install`.
4. Run `npm start`.
5. Open **http://localhost:3000**.
6. Create a room in one browser and join from another device using the displayed six-character room code. For local testing on the same Wi-Fi, use the host computer's LAN IP (for example `http://192.168.1.20:3000`) on the other device. Allow port 3000 through the computer firewall if prompted.

## Play
- Enter a nickname, create a room, and share the room code.
- At least two players are required.
- Everyone clicks **I'm Ready**; the host clicks **Start Match**.
- Collect normal coins (+10) and golden coins (+50).
- Avoid arena edges and other snakes. A collision costs 20 points and respawns you.
- ⚡ gives a temporary speed boost.
- Highest score after 3 minutes wins.
- Desktop: WASD or arrow keys. Mobile: on-screen direction pad.

## Deploy publicly
This app requires a persistent Node.js process and WebSocket support. Do not deploy it as a static-only site.

### Render (simple option)
1. Create a GitHub repository and upload the extracted project files.
2. Sign in to Render and create a **New Web Service** connected to that repository.
3. Set **Build Command** to `npm install`.
4. Set **Start Command** to `npm start`.
5. Choose a Node runtime and deploy.
6. Open the HTTPS URL Render provides. Share that URL with players.
7. Test by opening the URL in multiple private/incognito browser windows or on separate devices.

Any Node host that supports WebSockets and a persistent web service can be used. Use its assigned `PORT` environment variable; the app already supports it.

## Important notes
- This is a playable starter implementation, not a load-tested production service.
- The room host is not persisted; rooms are held in server memory and disappear when the server restarts.
- For a production competition, add reconnection tokens, rate limiting, server-side input throttling, stronger collision rules, automated tests, and monitoring.
- The game uses server-authoritative scoring and game state. The server sends snapshots to every room member.
