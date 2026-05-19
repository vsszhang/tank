# Tank Battle 🕹️

A pixel-style browser tank battle game built with React and Canvas. Defend your base, destroy enemy tanks, and survive multiple waves on a randomly generated battlefield. 🎮

![Tank Battle screenshot](docs/game-screenshot.png)

## Features ✨

- Pixel-art menu with an animated tank battle background
- Canvas-based gameplay loop ⚙️
- Player movement and shooting 💥
- Two-player co-op rooms over WebSocket 🤝
- Internet or LAN room joining with room codes and invite links 🌐
- Enemy tank spawning, movement, and firing
- Randomly generated maps for each new game 🧱
- Protected base area with guaranteed outer defenses 🛡️
- Configurable enemy count, tank speed, and bullet speed
- Brick walls, steel walls, score, lives, levels, pause, and restart

## Tech Stack 🧰

- React
- Vite
- HTML Canvas
- CSS animations
- Node.js WebSocket server

## Getting Started 🚀

Install dependencies:

```bash
npm install
```

Start the local development server:

```bash
npm run dev
```

Then open:

```text
http://localhost:5173/
```

Start the realtime room server in another terminal:

```bash
npm run server
```

The browser connects to `ws://<your-host>:8787` by default, so friends on the same LAN can join with your local IP address and the room code.

## Available Scripts 📜

```bash
npm run dev
```

Runs the game locally with Vite.

```bash
npm run build
```

Builds the project for production into the `dist/` directory.

```bash
npm run server
```

Runs the WebSocket room server on `0.0.0.0:8787`.

```bash
npm run dev:server
```

Runs the room server in watch mode for local development.

```bash
npm run preview
```

Serves the production build locally for preview.

## Controls 🎯

- `WASD` or arrow keys: Move
- `Space`: Fire 🔥
- `Enter`: Start or restart after a game ends
- `P`: Pause or resume

## Game Settings ⚙️

Use the **Settings** button on the menu screen to adjust:

- Enemy count
- Tank speed
- Bullet speed

Settings apply when a new game starts.

## Multiplayer Rooms 🌐

Use **Online Battle** from the menu to create a room or join with a room code. Rooms support two-player co-op: both players defend the same base, share score and lives, and fight the same enemy wave.

For internet play, deploy the frontend to Netlify and the realtime server to Render or another WebSocket-capable host. Set this Netlify environment variable to your deployed WebSocket URL:

```text
VITE_WS_URL=wss://your-render-service.onrender.com
```

The included `render.yaml` can be used as a starting point for a Render Web Service. 🚀
