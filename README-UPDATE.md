# Multiplayer Update Technical Notes

This document explains the technical design of the multiplayer update and how to configure it for local, LAN, and internet play.

## Architecture

The multiplayer feature uses a server-authoritative WebSocket model.

- The React/Vite frontend renders the game with Canvas and sends player input only.
- The Node.js WebSocket server owns room state, game simulation, collision, AI, bullets, scoring, and win/loss state.
- Shared game rules live in `src/gameEngine.js`, so the browser and server use the same map generation, movement, collision, enemy, and rendering data model.
- The frontend remains a static Netlify site. The realtime WebSocket server must run separately on Render, a VPS, or a local machine.

The main flow is:

```text
Browser A -> createRoom -> WebSocket server
Server -> roomCreated + snapshot -> Browser A
Browser B -> joinRoom(roomCode) -> WebSocket server
Server -> joined + snapshot -> both browsers
Both browsers -> input messages -> server
Server -> 20Hz authoritative snapshots -> both browsers
```

## Runtime Components

### Frontend

Entry point: `src/main.jsx`

Responsibilities:

- Menu, settings, room UI, and Canvas rendering.
- Creating or joining a room.
- Storing a local `playerToken` in `localStorage` for short reconnects.
- Sending keyboard input to the server during online play.
- Drawing the latest authoritative `snapshot` from the server.

The frontend chooses the WebSocket URL in this order:

1. `VITE_WS_URL` from the build environment.
2. Fallback to `ws://<current-host>:8787` for local/LAN development.

### Shared Game Engine

File: `src/gameEngine.js`

Responsibilities:

- Constants such as map size, tile size, tank size, base position, and default settings.
- Random map generation.
- Base protection and spawn-safe areas.
- Tank movement and wall/tank collision.
- Bullet movement and hit detection.
- Enemy spawning, movement, firing, and targeting.
- Score, lives, levels, win/loss state, and visual effects.
- Canvas drawing helpers used by the browser.

Online mode uses two players:

- `P1` starts near the base on the left side.
- `P2` starts near the base on the right side.
- Both players share score, lives, level, and enemy wave progress.

### WebSocket Server

File: `server/index.js`

Responsibilities:

- Listens on `0.0.0.0:8787` by default.
- Creates 6-character room codes with `nanoid`.
- Holds all active rooms in memory.
- Runs the game simulation at `20Hz` using a 50ms tick.
- Broadcasts authoritative snapshots to connected clients.
- Pauses active rooms when a player disconnects.
- Allows reconnect by matching the browser's `playerToken`.
- Releases disconnected slots after 2 minutes.
- Deletes empty rooms after 5 minutes.

Because rooms are in memory, restarting the server clears all active rooms.

## WebSocket Protocol

Messages are JSON.

### Client to Server

```json
{
  "type": "createRoom",
  "playerToken": "local-browser-token",
  "settings": {
    "enemyCount": 10,
    "tankSpeed": 1.6,
    "bulletSpeed": 4.2
  }
}
```

```json
{
  "type": "joinRoom",
  "roomCode": "ABC123",
  "playerToken": "local-browser-token"
}
```

```json
{
  "type": "input",
  "keys": ["up", "left"],
  "fire": true
}
```

```json
{
  "type": "restart",
  "settings": {
    "enemyCount": 10,
    "tankSpeed": 1.6,
    "bulletSpeed": 4.2
  }
}
```

```json
{
  "type": "leaveRoom"
}
```

### Server to Client

```json
{
  "type": "roomCreated",
  "roomCode": "ABC123",
  "slot": 0,
  "players": []
}
```

```json
{
  "type": "joined",
  "roomCode": "ABC123",
  "slot": 1,
  "players": []
}
```

```json
{
  "type": "snapshot",
  "roomCode": "ABC123",
  "slot": 0,
  "players": [],
  "statusText": "联机中",
  "game": {}
}
```

```json
{
  "type": "error",
  "message": "房间不存在"
}
```

The `snapshot.game` object is the full authoritative game state: map blocks, players, enemies, bullets, effects, score, lives, level, wave progress, and status.

## Local Development

Install dependencies:

```bash
npm install
```

Start the frontend:

```bash
npm run dev
```

Start the WebSocket server in a second terminal:

```bash
npm run server
```

Open:

```text
http://localhost:5173/
```

For two-player testing on one machine, open two browser windows. Create a room in the first window and join the room code in the second window.

## LAN Play

For devices on the same Wi-Fi or local network:

1. Start the frontend with `npm run dev`.
2. Start the server with `npm run server`.
3. Open the Vite network URL from another device, for example:

```text
http://192.168.100.23:5173/
```

The frontend fallback will connect to:

```text
ws://192.168.100.23:8787
```

If another device cannot join, check:

- The host machine firewall allows inbound TCP traffic on ports `5173` and `8787`.
- Both devices are on the same network.
- The browser is using the LAN IP URL, not `localhost`.

## Internet Deployment

Netlify can host the frontend, but it cannot host this long-running WebSocket server as a static site. Deploy the WebSocket server separately.

Recommended split:

- Frontend: Netlify
- Realtime server: Render Web Service, Railway, Fly.io, or a VPS

### Deploy the WebSocket Server to Render

The repo includes `render.yaml`:

```yaml
services:
  - type: web
    name: tank-battle-realtime
    runtime: node
    plan: free
    buildCommand: npm install
    startCommand: npm run server
```

Render will provide a public HTTPS URL. Convert it to a WebSocket URL:

```text
https://tank-battle-realtime.onrender.com
```

becomes:

```text
wss://tank-battle-realtime.onrender.com
```

### Configure Netlify

Set this environment variable in Netlify:

```text
VITE_WS_URL=wss://your-render-service.onrender.com
```

Then redeploy the Netlify frontend. Vite embeds `VITE_WS_URL` at build time, so changing the variable requires a new frontend build/deploy.

Without `VITE_WS_URL`, the production site falls back to:

```text
wss://vsszhang-tank.netlify.app:8787
```

That fallback will not work unless a WebSocket service is actually listening there, which Netlify static hosting does not provide.

## Operational Notes

- The server is intentionally stateless except for in-memory active rooms.
- A server restart drops all active rooms.
- No account system is used.
- Reconnects are based on the browser's local `playerToken`, not user identity.
- Room codes are short and intended for casual play, not secure private sessions.
- The server accepts one active connection per player slot; a reconnect replaces the previous socket for that slot.
- Snapshots are sent at 20Hz. This favors stability and consistency over client-side prediction.

## Useful Commands

```bash
npm run dev
```

Run the Vite frontend.

```bash
npm run server
```

Run the realtime WebSocket server.

```bash
npm run dev:server
```

Run the realtime server in Node watch mode.

```bash
npm run build
```

Build the frontend for production.

```bash
VITE_WS_URL=wss://your-render-service.onrender.com npm run build
```

Build the frontend with a production WebSocket endpoint.
