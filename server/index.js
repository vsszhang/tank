import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { customAlphabet } from 'nanoid';
import { DEFAULT_SETTINGS, initialGame, setPlayerConnected, stepGame } from '../src/gameEngine.js';

const PORT = Number(process.env.PORT ?? 8787);
const TICK_MS = 50;
const EMPTY_ROOM_TTL = 5 * 60 * 1000;
const DISCONNECT_TTL = 2 * 60 * 1000;
const makeRoomCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

const rooms = new Map();

function send(client, payload) {
  if (client.socket.readyState !== 1) return;
  client.socket.send(JSON.stringify(payload));
}

function broadcast(room, payload) {
  room.clients.forEach((client) => send(client, payload));
}

function serializePlayers(room) {
  return room.players.map((player, slot) => ({
    slot,
    label: slot === 0 ? 'P1' : 'P2',
    connected: Boolean(player?.client),
    disconnectedAt: player?.disconnectedAt ?? null
  }));
}

function roomSnapshot(room, client) {
  return {
    type: 'snapshot',
    roomCode: room.code,
    slot: client.slot,
    players: serializePlayers(room),
    statusText: room.game.status === 'waiting' ? '等待好友加入' : room.game.status === 'paused' ? '队友断线，已暂停' : '联机中',
    game: room.game
  };
}

function broadcastSnapshot(room) {
  room.clients.forEach((client) => send(client, roomSnapshot(room, client)));
}

function makeRoom(settings) {
  let code = makeRoomCode();
  while (rooms.has(code)) code = makeRoomCode();
  const room = {
    code,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    game: initialGame({ ...DEFAULT_SETTINGS, ...settings }, {
      mode: 'online',
      playerCount: 2,
      connectedSlots: [0],
      status: 'waiting',
      message: '等待好友加入'
    }),
    players: [null, null],
    clients: new Set(),
    inputs: [{ keys: [], fire: false }, { keys: [], fire: false }],
    createdAt: Date.now(),
    emptySince: null,
    timer: null
  };
  rooms.set(code, room);
  room.timer = setInterval(() => tickRoom(room), TICK_MS);
  return room;
}

function attachClient(room, client, slot, playerToken) {
  const previous = room.players[slot]?.client;
  if (previous && previous !== client) {
    previous.room = null;
    previous.socket.close(4001, 'Replaced by reconnect');
    room.clients.delete(previous);
  }

  client.room = room;
  client.slot = slot;
  client.playerToken = playerToken;
  room.players[slot] = { token: playerToken, client, disconnectedAt: null };
  room.clients.add(client);
  room.emptySince = null;
  room.game = setPlayerConnected(room.game, slot, true);

  if (room.players[0]?.client && room.players[1]?.client && room.game.status === 'waiting') {
    room.game = { ...room.game, status: 'playing', message: '' };
  }
}

function findSlot(room, playerToken) {
  const existing = room.players.findIndex((player) => player?.token === playerToken);
  if (existing !== -1) return existing;
  return room.players.findIndex((player) => !player?.client && !player?.token);
}

function createRoom(client, message) {
  const room = makeRoom(message.settings);
  attachClient(room, client, 0, message.playerToken);
  send(client, {
    type: 'roomCreated',
    roomCode: room.code,
    slot: 0,
    players: serializePlayers(room),
    statusText: '等待好友加入'
  });
  broadcastSnapshot(room);
}

function joinRoom(client, message) {
  const roomCode = String(message.roomCode ?? '').trim().toUpperCase();
  const room = rooms.get(roomCode);
  if (!room) {
    send(client, { type: 'error', message: '房间不存在' });
    return;
  }

  const slot = findSlot(room, message.playerToken);
  if (slot === -1) {
    send(client, { type: 'error', message: '房间已满' });
    return;
  }

  attachClient(room, client, slot, message.playerToken);
  send(client, {
    type: 'joined',
    roomCode: room.code,
    slot,
    players: serializePlayers(room),
    statusText: room.game.status === 'waiting' ? '等待好友加入' : '联机中'
  });
  broadcastSnapshot(room);
}

function restartRoom(client, message) {
  const room = client.room;
  if (!room) return;
  room.settings = { ...room.settings, ...message.settings };
  room.inputs = [{ keys: [], fire: false }, { keys: [], fire: false }];
  room.game = initialGame(room.settings, {
    mode: 'online',
    playerCount: 2,
    connectedSlots: room.players.map((player, slot) => (player?.client ? slot : null)).filter((slot) => slot !== null),
    status: room.players[0]?.client && room.players[1]?.client ? 'playing' : 'waiting',
    message: room.players[0]?.client && room.players[1]?.client ? '' : '等待好友加入'
  });
  broadcastSnapshot(room);
}

function leaveRoom(client) {
  const room = client.room;
  if (!room) return;

  room.inputs[client.slot] = { keys: [], fire: false };
  const player = room.players[client.slot];
  if (player?.client === client) {
    room.players[client.slot] = { ...player, client: null, disconnectedAt: Date.now() };
    room.game = setPlayerConnected(room.game, client.slot, false);
  }
  room.clients.delete(client);
  client.room = null;

  if (room.clients.size === 0) room.emptySince = Date.now();
  if (room.game.status === 'playing') {
    room.game = { ...room.game, status: 'paused', message: '队友断线，等待重连' };
  }
  broadcastSnapshot(room);
}

function tickRoom(room) {
  const now = Date.now();

  room.players.forEach((player, slot) => {
    if (!player?.client && player?.disconnectedAt && now - player.disconnectedAt > DISCONNECT_TTL) {
      room.players[slot] = null;
      room.game = setPlayerConnected(room.game, slot, false);
    }
  });

  if (room.emptySince && now - room.emptySince > EMPTY_ROOM_TTL) {
    clearInterval(room.timer);
    rooms.delete(room.code);
    return;
  }

  if (room.game.status === 'paused' && room.players[0]?.client && room.players[1]?.client) {
    room.game = { ...room.game, status: 'playing', message: '' };
  }

  room.game = stepGame(room.game, {
    p1: room.inputs[0],
    p2: room.inputs[1]
  });

  room.inputs = room.inputs.map((input) => ({ ...input, fire: false }));
  broadcastSnapshot(room);

  if (room.game.status === 'over' || room.game.status === 'won') {
    broadcast(room, {
      type: 'gameOver',
      roomCode: room.code,
      statusText: room.game.status === 'won' ? '胜利' : '基地失守'
    });
  }
}

const server = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', rooms: rooms.size }));
    return;
  }

  response.writeHead(200, { 'content-type': 'text/plain' });
  response.end('Tank Battle realtime server');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (socket) => {
  const client = { socket, room: null, slot: null, playerToken: null };

  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      send(client, { type: 'error', message: '消息格式错误' });
      return;
    }

    if (message.type === 'createRoom') createRoom(client, message);
    if (message.type === 'joinRoom') joinRoom(client, message);
    if (message.type === 'input' && client.room && client.slot !== null) {
      client.room.inputs[client.slot] = {
        keys: Array.isArray(message.keys) ? message.keys : [],
        fire: Boolean(message.fire)
      };
    }
    if (message.type === 'restart') restartRoom(client, message);
    if (message.type === 'leaveRoom') leaveRoom(client);
  });

  socket.on('close', () => leaveRoom(client));
  socket.on('error', () => leaveRoom(client));
});

wss.on('error', (error) => {
  console.error(`Tank Battle WebSocket server failed: ${error.message}`);
  process.exitCode = 1;
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Tank Battle realtime server listening on 0.0.0.0:${PORT}`);
});

server.on('error', (error) => {
  console.error(`Tank Battle realtime server failed: ${error.message}`);
  process.exitCode = 1;
});
