export const TILE = 24;
export const COLS = 26;
export const ROWS = 26;
export const WIDTH = COLS * TILE;
export const HEIGHT = ROWS * TILE;
export const PLAYER_SIZE = 22;
export const ENEMY_SIZE = 22;
export const BULLET_SIZE = 5;
export const DEFAULT_SETTINGS = {
  enemyCount: 10,
  tankSpeed: 1.6,
  bulletSpeed: 4.2
};
export const ENEMY_FIRE_RATE = 0.012;
export const MAX_ENEMIES = 5;

export const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

const DIR_ORDER = ['up', 'down', 'left', 'right'];

export const ENEMY_SPAWNS = [
  { x: 1 * TILE + 1, y: 1 * TILE + 1 },
  { x: 12 * TILE + 1, y: 1 * TILE + 1 },
  { x: 23 * TILE + 1, y: 1 * TILE + 1 }
];

export const PLAYER_STARTS = [
  { x: 10 * TILE + 1, y: 23 * TILE + 1, color: '#22c55e', tread: '#14532d', label: 'P1' },
  { x: 15 * TILE + 1, y: 23 * TILE + 1, color: '#38bdf8', tread: '#075985', label: 'P2' }
];
export const PLAYER_START = PLAYER_STARTS[0];
export const BASE = { x: 12 * TILE, y: 24 * TILE, w: TILE * 2, h: TILE * 2 };

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function tankRect(tank) {
  return { x: tank.x, y: tank.y, w: tank.size, h: tank.size };
}

function blockFromCell(x, y, type) {
  return {
    id: `${x}-${y}`,
    x: x * TILE,
    y: y * TILE,
    w: TILE,
    h: TILE,
    type,
    hp: type === 'brick' ? 1 : Infinity
  };
}

export function generateMap() {
  const blocks = [];
  const occupied = new Set();
  const reserved = new Set();
  const reserveRect = (x1, y1, x2, y2) => {
    for (let y = y1; y <= y2; y += 1) {
      for (let x = x1; x <= x2; x += 1) reserved.add(`${x}-${y}`);
    }
  };
  const reserveTankStart = (point) => {
    const tileX = Math.floor(point.x / TILE);
    const tileY = Math.floor(point.y / TILE);
    reserveRect(tileX - 1, tileY - 1, tileX + 1, tileY + 1);
  };
  const addBlock = (x, y, type = 'brick', force = false) => {
    const key = `${x}-${y}`;
    if (x < 0 || x > COLS - 1 || y < 0 || y > ROWS - 1 || occupied.has(key)) return false;
    if (!force && (x < 1 || x > COLS - 2 || y < 1 || y > ROWS - 2 || reserved.has(key))) return false;
    occupied.add(key);
    blocks.push(blockFromCell(x, y, type));
    return true;
  };

  reserveRect(0, 0, 3, 3);
  reserveRect(10, 0, 15, 3);
  reserveRect(22, 0, 25, 3);
  reserveRect(9, 21, 16, 25);
  PLAYER_STARTS.forEach(reserveTankStart);
  ENEMY_SPAWNS.forEach(reserveTankStart);

  [
    [11, 23], [12, 23], [13, 23], [14, 23],
    [11, 24], [14, 24],
    [11, 25], [14, 25]
  ].forEach(([x, y]) => addBlock(x, y, 'brick', true));

  const patterns = [
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [2, 0]],
    [[0, 0], [0, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1]],
    [[0, 0], [1, 0]]
  ];

  let attempts = 0;
  while (blocks.length < 92 && attempts < 900) {
    attempts += 1;
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    const x = 1 + Math.floor(Math.random() * (COLS - 4));
    const y = 4 + Math.floor(Math.random() * (ROWS - 8));
    const type = Math.random() < 0.14 ? 'steel' : 'brick';
    const canPlace = pattern.every(([dx, dy]) => {
      const key = `${x + dx}-${y + dy}`;
      return x + dx > 0 && x + dx < COLS - 1 && y + dy > 0 && y + dy < ROWS - 1 && !reserved.has(key) && !occupied.has(key);
    });
    if (canPlace) pattern.forEach(([dx, dy]) => addBlock(x + dx, y + dy, type));
  }

  return blocks;
}

function makePlayer(slot = 0, connected = true) {
  const start = PLAYER_STARTS[slot] ?? PLAYER_STARTS[0];
  return {
    id: slot === 0 ? 'p1' : 'p2',
    slot,
    label: start.label,
    x: start.x,
    y: start.y,
    size: PLAYER_SIZE,
    dir: 'up',
    hp: 1,
    cooldown: 0,
    invincible: 120,
    color: start.color,
    tread: start.tread,
    connected
  };
}

function makeEnemy(id, level) {
  const spawn = ENEMY_SPAWNS[id % ENEMY_SPAWNS.length];
  return {
    id,
    x: spawn.x,
    y: spawn.y,
    size: ENEMY_SIZE,
    dir: 'down',
    hp: level > 2 ? 2 : 1,
    color: level > 2 ? '#fbbf24' : '#ef4444',
    moveTimer: 0,
    fireCooldown: 45 + Math.random() * 70
  };
}

export function initialGame(settings = DEFAULT_SETTINGS, options = {}) {
  const playerCount = options.playerCount ?? 1;
  return {
    status: options.status ?? 'ready',
    mode: options.mode ?? 'solo',
    level: 1,
    score: 0,
    lives: 3,
    settings,
    waveLeft: settings.enemyCount,
    nextEnemyId: 0,
    spawnCooldown: 0,
    message: options.message ?? '按 Enter 开始',
    blocks: generateMap(),
    players: Array.from({ length: playerCount }, (_, slot) => makePlayer(slot, options.connectedSlots?.includes(slot) ?? true)),
    enemies: [],
    bullets: [],
    effects: []
  };
}

export function setPlayerConnected(game, slot, connected) {
  const players = [...game.players];
  players[slot] = players[slot] ? { ...players[slot], connected } : makePlayer(slot, connected);
  return { ...game, players };
}

function resetForNextLevel(game) {
  return {
    ...initialGame(game.settings, {
      mode: game.mode,
      playerCount: game.players.length,
      status: 'playing',
      message: ''
    }),
    level: game.level + 1,
    score: game.score + 500,
    lives: game.lives,
    waveLeft: game.settings.enemyCount + game.level * 2
  };
}

function canMove(rect, blocks, tanks, ignoreId) {
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > WIDTH || rect.y + rect.h > HEIGHT) return false;
  if (blocks.some((block) => rectsOverlap(rect, block))) return false;
  if (tanks.some((tank) => tank.id !== ignoreId && rectsOverlap(rect, tankRect(tank)))) return false;
  return true;
}

function moveTank(tank, dir, speed, blocks, tanks) {
  const vector = DIRS[dir];
  const next = {
    ...tank,
    dir,
    x: clamp(tank.x + vector.x * speed, 0, WIDTH - tank.size),
    y: clamp(tank.y + vector.y * speed, 0, HEIGHT - tank.size)
  };
  return canMove(tankRect(next), blocks, tanks, tank.id) ? next : { ...tank, dir };
}

function fireBullet(tank, owner, options = {}) {
  const vector = DIRS[tank.dir];
  const center = {
    x: tank.x + tank.size / 2 - BULLET_SIZE / 2,
    y: tank.y + tank.size / 2 - BULLET_SIZE / 2
  };
  return {
    id: `${owner}-${Date.now()}-${Math.random()}`,
    owner,
    x: center.x + vector.x * 14,
    y: center.y + vector.y * 14,
    w: BULLET_SIZE,
    h: BULLET_SIZE,
    dir: tank.dir,
    predicted: Boolean(options.predicted)
  };
}

function addBurst(effects, x, y, color = '#f97316') {
  return [
    ...effects,
    { id: `fx-${Date.now()}-${Math.random()}`, x, y, r: 4, life: 20, color }
  ];
}

function hasInputKey(input, dir) {
  if (!input) return false;
  if (input.keys?.has) return input.keys.has(dir);
  if (Array.isArray(input.keys)) return input.keys.includes(dir);
  if (Array.isArray(input.dirs)) return input.dirs.includes(dir);
  return Boolean(input[dir]);
}

function shouldFire(input) {
  return Boolean(input?.fire || input?.firePressed);
}

function nearestTarget(enemy, players) {
  const connectedPlayers = players.filter((player) => player.connected !== false);
  if (connectedPlayers.length === 0) return { x: BASE.x + BASE.w / 2, y: BASE.y + BASE.h / 2 };
  return connectedPlayers.reduce((best, player) => {
    const score = Math.abs(player.x - enemy.x) + Math.abs(player.y - enemy.y);
    return score < best.score ? { score, x: player.x, y: player.y } : best;
  }, { score: Infinity, x: connectedPlayers[0].x, y: connectedPlayers[0].y });
}

export function stepGame(game, inputs = {}) {
  if (game.status !== 'playing') return game;

  let next = {
    ...game,
    players: game.players.map((player) => ({
      ...player,
      cooldown: Math.max(0, player.cooldown - 1),
      invincible: Math.max(0, player.invincible - 1)
    })),
    spawnCooldown: Math.max(0, game.spawnCooldown - 1),
    effects: game.effects
      .map((effect) => ({ ...effect, life: effect.life - 1, r: effect.r + 1.8 }))
      .filter((effect) => effect.life > 0)
  };

  next.players = next.players.map((player) => {
    if (player.connected === false) return player;
    const input = inputs[player.id] ?? inputs[player.slot] ?? inputs;
    const activeDir = DIR_ORDER.find((dir) => hasInputKey(input, dir));
    const allTanks = [...next.players, ...next.enemies];
    let changed = activeDir ? moveTank(player, activeDir, next.settings.tankSpeed, next.blocks, allTanks) : player;
    if (shouldFire(input) && changed.cooldown === 0) {
      next.bullets = [...next.bullets, fireBullet(changed, changed.id)];
      changed = { ...changed, cooldown: 22 };
    }
    return changed;
  });

  if (next.spawnCooldown === 0 && next.waveLeft > 0 && next.enemies.length < MAX_ENEMIES) {
    const enemy = makeEnemy(next.nextEnemyId, next.level);
    const spawnBlocked = [...next.players, ...next.enemies].some((tank) => rectsOverlap(tankRect(enemy), tankRect(tank)));
    if (!spawnBlocked) {
      next.enemies = [...next.enemies, enemy];
      next.nextEnemyId += 1;
      next.waveLeft -= 1;
      next.spawnCooldown = Math.max(45, 110 - next.level * 7);
    }
  }

  const enemiesAfterMove = next.enemies.map((enemy) => {
    let changed = { ...enemy, fireCooldown: Math.max(0, enemy.fireCooldown - 1), moveTimer: enemy.moveTimer - 1 };
    const shouldTurn = changed.moveTimer <= 0 || Math.random() < 0.012;
    if (shouldTurn) {
      const target = nearestTarget(enemy, next.players);
      const dx = target.x - enemy.x;
      const dy = target.y - enemy.y;
      const chaseDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      changed.dir = Math.random() < 0.62 ? chaseDir : DIR_ORDER[Math.floor(Math.random() * 4)];
      changed.moveTimer = 35 + Math.random() * 85;
    }
    const moved = moveTank(changed, changed.dir, next.settings.tankSpeed * 0.48 + next.level * 0.05, next.blocks, [...next.players, ...next.enemies]);
    return moved.x === enemy.x && moved.y === enemy.y && Math.random() < 0.1
      ? { ...moved, dir: DIR_ORDER[Math.floor(Math.random() * 4)], moveTimer: 20 }
      : moved;
  });
  next.enemies = enemiesAfterMove;

  next.enemies.forEach((enemy) => {
    if (enemy.fireCooldown === 0 || Math.random() < ENEMY_FIRE_RATE + next.level * 0.0015) {
      next.bullets.push(fireBullet(enemy, 'enemy'));
      enemy.fireCooldown = 65 + Math.random() * 90;
    }
  });

  const remainingBullets = [];
  let blocks = [...next.blocks];
  let enemies = [...next.enemies];
  let players = [...next.players];
  let score = next.score;
  let lives = next.lives;
  let status = next.status;
  let message = next.message;
  let effects = next.effects;

  next.bullets.forEach((bullet) => {
    const vector = DIRS[bullet.dir];
    const moved = {
      ...bullet,
      x: bullet.x + vector.x * next.settings.bulletSpeed,
      y: bullet.y + vector.y * next.settings.bulletSpeed
    };

    if (moved.x < -8 || moved.y < -8 || moved.x > WIDTH + 8 || moved.y > HEIGHT + 8) return;

    const hitBlock = blocks.find((block) => rectsOverlap(moved, block));
    if (hitBlock) {
      effects = addBurst(effects, moved.x, moved.y, hitBlock.type === 'brick' ? '#f59e0b' : '#cbd5e1');
      if (hitBlock.type === 'brick') blocks = blocks.filter((block) => block.id !== hitBlock.id);
      return;
    }

    if (rectsOverlap(moved, BASE)) {
      status = 'over';
      message = '按 Enter 重新开始';
      effects = addBurst(effects, BASE.x + BASE.w / 2, BASE.y + BASE.h / 2, '#facc15');
      return;
    }

    if (bullet.owner !== 'enemy') {
      const enemy = enemies.find((item) => rectsOverlap(moved, tankRect(item)));
      if (enemy) {
        effects = addBurst(effects, enemy.x + enemy.size / 2, enemy.y + enemy.size / 2);
        enemies = enemies
          .map((item) => (item.id === enemy.id ? { ...item, hp: item.hp - 1 } : item))
          .filter((item) => item.hp > 0);
        if (enemy.hp <= 1) score += 100;
        return;
      }
    } else {
      const player = players.find((item) => item.connected !== false && item.invincible === 0 && rectsOverlap(moved, tankRect(item)));
      if (player) {
        const start = PLAYER_STARTS[player.slot] ?? PLAYER_STARTS[0];
        effects = addBurst(effects, player.x + player.size / 2, player.y + player.size / 2, '#38bdf8');
        lives -= 1;
        if (lives <= 0) {
          status = 'over';
          message = '按 Enter 重新开始';
        } else {
          players = players.map((item) => (item.id === player.id ? { ...item, x: start.x, y: start.y, dir: 'up', invincible: 130 } : item));
        }
        return;
      }
    }

    remainingBullets.push(moved);
  });

  const finishedWave = status === 'playing' && next.waveLeft === 0 && enemies.length === 0;
  if (finishedWave) {
    if (next.level >= 3) {
      status = 'won';
      message = '按 Enter 再来一局';
      score += 1000;
    } else {
      return resetForNextLevel({ ...next, players, score, lives });
    }
  }

  return {
    ...next,
    blocks,
    enemies,
    players,
    player: players[0],
    bullets: remainingBullets,
    effects,
    score,
    lives,
    status,
    message
  };
}

export function predictLocalPlayer(game, slot, input = {}) {
  if (game.status !== 'playing') return game;

  const playerIndex = game.players.findIndex((player) => player.slot === slot);
  if (playerIndex === -1 || game.players[playerIndex]?.connected === false) return game;

  const players = game.players.map((player, index) => (
    index === playerIndex
      ? {
          ...player,
          cooldown: Math.max(0, player.cooldown - 1),
          invincible: Math.max(0, player.invincible - 1)
        }
      : player
  ));

  const player = players[playerIndex];
  const activeDir = DIR_ORDER.find((dir) => hasInputKey(input, dir));
  const allTanks = [...players, ...game.enemies];
  let changed = activeDir ? moveTank(player, activeDir, game.settings.tankSpeed, game.blocks, allTanks) : player;
  let bullets = game.bullets;

  if (shouldFire(input) && changed.cooldown === 0) {
    bullets = [...bullets, fireBullet(changed, changed.id, { predicted: true })];
    changed = { ...changed, cooldown: 22 };
  }

  players[playerIndex] = changed;

  const movedBullets = bullets
    .map((bullet) => {
      if (!bullet.predicted || bullet.owner !== changed.id) return bullet;
      const vector = DIRS[bullet.dir];
      return {
        ...bullet,
        x: bullet.x + vector.x * game.settings.bulletSpeed,
        y: bullet.y + vector.y * game.settings.bulletSpeed
      };
    })
    .filter((bullet) => {
      if (!bullet.predicted || bullet.owner !== changed.id) return true;
      if (bullet.x < -8 || bullet.y < -8 || bullet.x > WIDTH + 8 || bullet.y > HEIGHT + 8) return false;
      return !game.blocks.some((block) => rectsOverlap(bullet, block));
    });

  return {
    ...game,
    players,
    player: players[0],
    bullets: movedBullets
  };
}

function drawTank(ctx, tank, isPlayer) {
  const cx = tank.x + tank.size / 2;
  const cy = tank.y + tank.size / 2;
  const vector = DIRS[tank.dir];
  const body = isPlayer ? tank.color || '#22c55e' : tank.color;
  const tread = isPlayer ? tank.tread || '#14532d' : '#7f1d1d';

  ctx.save();
  ctx.translate(cx, cy);
  if (tank.dir === 'right') ctx.rotate(Math.PI / 2);
  if (tank.dir === 'down') ctx.rotate(Math.PI);
  if (tank.dir === 'left') ctx.rotate(-Math.PI / 2);

  ctx.globalAlpha = tank.connected === false ? 0.38 : 1;
  ctx.fillStyle = tread;
  ctx.fillRect(-10, -11, 6, 22);
  ctx.fillRect(4, -11, 6, 22);
  ctx.fillStyle = body;
  ctx.fillRect(-8, -8, 16, 16);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(-3, -3, 6, 6);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-2, -18, 4, 14);
  ctx.restore();

  if (isPlayer && tank.invincible > 0 && tank.connected !== false) {
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx + vector.x, cy + vector.y, 17, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function drawGame(ctx, game) {
  const players = game.players ?? [game.player].filter(Boolean);
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#111827';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.09)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= WIDTH; x += TILE) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y <= HEIGHT; y += TILE) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }

  game.blocks.forEach((block) => {
    if (block.type === 'brick') {
      ctx.fillStyle = '#b45309';
      ctx.fillRect(block.x + 1, block.y + 1, block.w - 2, block.h - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(block.x + 3, block.y + 5, block.w - 6, 3);
      ctx.fillRect(block.x + 3, block.y + 15, block.w - 6, 3);
    } else {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(block.x + 1, block.y + 1, block.w - 2, block.h - 2);
      ctx.strokeStyle = '#cbd5e1';
      ctx.strokeRect(block.x + 4, block.y + 4, block.w - 8, block.h - 8);
    }
  });

  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(BASE.x + 5, BASE.y + 7, 38, 34);
  ctx.fillStyle = '#7c2d12';
  ctx.fillRect(BASE.x + 16, BASE.y + 16, 16, 18);
  ctx.fillStyle = '#fde68a';
  ctx.fillRect(BASE.x + 20, BASE.y + 9, 8, 10);

  players.forEach((player) => drawTank(ctx, player, true));
  game.enemies.forEach((enemy) => drawTank(ctx, enemy, false));

  game.bullets.forEach((bullet) => {
    ctx.fillStyle = bullet.owner === 'enemy' ? '#fb7185' : '#fef08a';
    ctx.fillRect(bullet.x, bullet.y, bullet.w, bullet.h);
  });

  game.effects.forEach((effect) => {
    ctx.strokeStyle = effect.color;
    ctx.globalAlpha = effect.life / 20;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(effect.x, effect.y, effect.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  if (game.status !== 'playing') {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 34px system-ui';
    ctx.textAlign = 'center';
    const title = game.status === 'won' ? '胜利' : game.status === 'over' ? '基地失守' : game.status === 'waiting' ? '等待队友' : '坦克大战';
    ctx.fillText(title, WIDTH / 2, HEIGHT / 2 - 18);
    ctx.font = '18px system-ui';
    ctx.fillText(game.message, WIDTH / 2, HEIGHT / 2 + 22);
  }
}
