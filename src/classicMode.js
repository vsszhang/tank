import {
  BASE,
  DEFAULT_SETTINGS,
  HEIGHT,
  TILE,
  WIDTH,
  initialGame,
  stepGame
} from './gameEngine.js';

const classicSettings = {
  ...DEFAULT_SETTINGS,
  enemyCount: 12,
  tankSpeed: 1.45,
  bulletSpeed: 4
};
const CLASSIC_TILE = TILE * 2;
const CLASSIC_TANK_SIZE = CLASSIC_TILE - 4;
const CLASSIC_EFFECT_LIFE = 18;
const CLASSIC_PLAYER_SPAWNS = [
  { x: 6, y: 10 },
  { x: 4, y: 10 },
  { x: 8, y: 10 },
  { x: 6, y: 9 }
];
const CLASSIC_ENEMY_SPAWNS = [
  { x: 0, y: 0 },
  { x: 6, y: 0 },
  { x: 12, y: 0 },
  { x: 0, y: 2 },
  { x: 12, y: 2 },
  { x: 6, y: 2 }
];

const ASSETS = {
  logo: new URL('../image/branding/logo.png', import.meta.url).href,
  player: new URL('../image/tanks/player/tank_T1_0.png', import.meta.url).href,
  enemies: [
    new URL('../image/tanks/enemies/enemy_1_0.png', import.meta.url).href,
    new URL('../image/tanks/enemies/enemy_2_0.png', import.meta.url).href,
    new URL('../image/tanks/enemies/enemy_3_0.png', import.meta.url).href,
    new URL('../image/tanks/enemies/enemy_4_0.png', import.meta.url).href
  ],
  bullets: {
    up: new URL('../image/projectiles/bullet_up.png', import.meta.url).href,
    down: new URL('../image/projectiles/bullet_down.png', import.meta.url).href,
    left: new URL('../image/projectiles/bullet_left.png', import.meta.url).href,
    right: new URL('../image/projectiles/bullet_right.png', import.meta.url).href
  },
  terrain: {
    brick: new URL('../image/terrain/brick.png', import.meta.url).href,
    steel: new URL('../image/terrain/iron.png', import.meta.url).href,
    ice: new URL('../image/terrain/ice.png', import.meta.url).href,
    river1: new URL('../image/terrain/river1.png', import.meta.url).href,
    river2: new URL('../image/terrain/river2.png', import.meta.url).href,
    tree: new URL('../image/terrain/tree.png', import.meta.url).href
  },
  base: {
    home: new URL('../image/base/home.png', import.meta.url).href,
    destroyed: new URL('../image/base/home_destroyed.png', import.meta.url).href
  },
  effects: {
    boom: new URL('../image/effects/boom_static.png', import.meta.url).href,
    boomDynamic: new URL('../image/effects/boom_dynamic.png', import.meta.url).href
  },
  ui: {
    gameover: new URL('../image/ui/gameover.png', import.meta.url).href,
    tip: new URL('../image/ui/tip.png', import.meta.url).href
  },
  audio: {
    start: new URL('../audio/sfx/ui/start.mp3', import.meta.url).href,
    attack: new URL('../audio/sfx/gameplay/attack.mp3', import.meta.url).href,
    move: new URL('../audio/sfx/gameplay/move.mp3', import.meta.url).href,
    bulletCrack: new URL('../audio/sfx/impacts/bulletCrack.mp3', import.meta.url).href,
    playerCrack: new URL('../audio/sfx/impacts/playerCrack.mp3', import.meta.url).href,
    tankCrack: new URL('../audio/sfx/impacts/tankCrack.mp3', import.meta.url).href
  }
};

function makeImage(src) {
  if (typeof Image === 'undefined') return { complete: false, src };
  const image = new Image();
  image.src = src;
  return image;
}

const classicImages = Object.fromEntries(
  Object.entries({
    logo: ASSETS.logo,
    player: ASSETS.player,
    home: ASSETS.base.home,
    destroyed: ASSETS.base.destroyed,
    brick: ASSETS.terrain.brick,
    steel: ASSETS.terrain.steel,
    ice: ASSETS.terrain.ice,
    river1: ASSETS.terrain.river1,
    river2: ASSETS.terrain.river2,
    tree: ASSETS.terrain.tree,
    boom: ASSETS.effects.boom,
    boomDynamic: ASSETS.effects.boomDynamic,
    gameover: ASSETS.ui.gameover,
    bulletUp: ASSETS.bullets.up,
    bulletDown: ASSETS.bullets.down,
    bulletLeft: ASSETS.bullets.left,
    bulletRight: ASSETS.bullets.right,
    enemy1: ASSETS.enemies[0],
    enemy2: ASSETS.enemies[1],
    enemy3: ASSETS.enemies[2],
    enemy4: ASSETS.enemies[3]
  }).map(([key, src]) => {
    return [key, makeImage(src)];
  })
);

const DIR_ROW = {
  up: 0,
  down: 1,
  left: 2,
  right: 3
};

function blockFromCell(x, y, type) {
  return {
    id: `classic-${x}-${y}`,
    x: x * CLASSIC_TILE,
    y: y * CLASSIC_TILE,
    w: CLASSIC_TILE,
    h: CLASSIC_TILE,
    type,
    hp: type === 'brick' ? 1 : Infinity
  };
}

function addRect(blocks, x, y, w, h, type = 'brick') {
  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) {
      blocks.push(blockFromCell(col, row, type));
    }
  }
}

function createClassicBlocks() {
  const blocks = [];
  addRect(blocks, 1, 1, 1, 4);
  addRect(blocks, 3, 1, 1, 4);
  addRect(blocks, 5, 1, 1, 3);
  addRect(blocks, 9, 1, 1, 4);
  addRect(blocks, 11, 1, 1, 4);
  addRect(blocks, 4, 5, 1, 2);
  addRect(blocks, 6, 5, 1, 1);
  addRect(blocks, 8, 5, 1, 2);
  addRect(blocks, 2, 7, 2, 1);
  addRect(blocks, 9, 7, 1, 3);
  addRect(blocks, 11, 7, 1, 3);
  addRect(blocks, 1, 9, 1, 2);
  addRect(blocks, 3, 9, 1, 2);
  addRect(blocks, 5, 8, 1, 2);
  addRect(blocks, 7, 9, 1, 1);
  addRect(blocks, 10, 10, 2, 1);
  addRect(blocks, 5, 11, 3, 1, 'steel');
  addRect(blocks, 5, 12, 1, 1, 'steel');
  addRect(blocks, 7, 12, 1, 1, 'steel');
  addRect(blocks, 6, 4, 1, 1, 'steel');
  addRect(blocks, 0, 6, 1, 1, 'steel');
  addRect(blocks, 12, 6, 1, 1, 'steel');
  return blocks;
}

function placeClassicPlayer(player) {
  const spawn = tankPointFromCell(CLASSIC_PLAYER_SPAWNS[0]);
  return {
    ...player,
    x: spawn.x,
    y: spawn.y,
    size: CLASSIC_TANK_SIZE,
    dir: 'up',
    invincible: Math.max(player.invincible ?? 0, 90)
  };
}

function normalizeClassicEnemy(enemy) {
  return { ...enemy, size: CLASSIC_TANK_SIZE };
}

function withClassicMap(game) {
  const players = game.players.map((player, index) => (index === 0 ? placeClassicPlayer(player) : player));
  return {
    ...game,
    blocks: createClassicBlocks(),
    enemies: game.enemies.map(normalizeClassicEnemy),
    players,
    player: players[0]
  };
}

export function initialClassicGame() {
  const game = initialGame(classicSettings, {
    mode: 'classic',
    playerCount: 1,
    status: 'playing',
    message: ''
  });
  return withClassicMap(game);
}

export function stepClassicGame(game, input) {
  const singleShotInput = blockExtraPlayerShot(game, input);
  const stepped = stepGame(game, singleShotInput);
  const sanitized = sanitizeClassicState(stepped, game);
  const singleShotEnemies = limitEnemyBullets(sanitized);
  const next = resolveBulletCollisions(singleShotEnemies);
  if (game.status === 'playing' && next.status === 'playing' && next.level !== game.level) return withClassicMap(next);
  return next;
}

function blockExtraPlayerShot(game, input = {}) {
  const playerBulletActive = game.bullets.some((bullet) => bullet.owner !== 'enemy');
  const playerInput = input.p1 ?? input[0] ?? input;
  if (!playerBulletActive || !playerInput?.firePressed) return input;
  return {
    ...input,
    p1: { ...playerInput, firePressed: false, fire: false }
  };
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function tankRect(tank) {
  return { x: tank.x, y: tank.y, w: tank.size, h: tank.size };
}

function tankPointFromCell(cell) {
  return {
    x: cell.x * CLASSIC_TILE + 2,
    y: cell.y * CLASSIC_TILE + 2
  };
}

function isSafeTankPosition(point, tank, blocks, tanks = [], includeBase = true) {
  const rect = { x: point.x, y: point.y, w: tank.size, h: tank.size };
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > WIDTH || rect.y + rect.h > HEIGHT) return false;
  if (includeBase && rectsOverlap(rect, BASE)) return false;
  if (blocks.some((block) => rectsOverlap(rect, block))) return false;
  return !tanks.some((item) => item.id !== tank.id && rectsOverlap(rect, tankRect(item)));
}

function findSafeTankPoint(tank, cells, blocks, tanks = []) {
  const direct = { x: tank.x, y: tank.y };
  if (isSafeTankPosition(direct, tank, blocks, tanks)) return direct;
  const safeCell = cells.find((cell) => isSafeTankPosition(tankPointFromCell(cell), tank, blocks, tanks));
  return safeCell ? tankPointFromCell(safeCell) : tankPointFromCell(cells[0]);
}

function sanitizeClassicPlayers(game) {
  const enemies = game.enemies.map(normalizeClassicEnemy);
  const players = game.players.map((player, index) => {
    const sized = index === 0 ? { ...player, size: CLASSIC_TANK_SIZE } : player;
    if (index !== 0) return sized;
    const point = findSafeTankPoint(sized, CLASSIC_PLAYER_SPAWNS, game.blocks, enemies);
    return point.x === sized.x && point.y === sized.y ? sized : { ...sized, ...point, dir: 'up' };
  });
  return { ...game, players, player: players[0], enemies };
}

function sanitizeClassicEnemies(game) {
  const placed = [];
  const players = game.players ?? [];
  game.enemies.forEach((enemy) => {
    const sized = normalizeClassicEnemy(enemy);
    const candidates = [
      CLASSIC_ENEMY_SPAWNS[sized.id % CLASSIC_ENEMY_SPAWNS.length],
      ...CLASSIC_ENEMY_SPAWNS
    ];
    const point = findSafeTankPoint(sized, candidates, game.blocks, [...players, ...placed]);
    placed.push(point.x === sized.x && point.y === sized.y ? sized : { ...sized, ...point });
  });
  return { ...game, enemies: placed };
}

function sanitizeClassicState(game) {
  const withPlayers = sanitizeClassicPlayers({
    ...game,
    classicEvents: []
  });
  return sanitizeClassicEnemies(withPlayers);
}

function limitEnemyBullets(game) {
  const seen = new Set();
  const bullets = game.bullets.filter((bullet) => {
    if (bullet.owner !== 'enemy') return true;
    const key = bullet.sourceId ?? 'enemy';
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return bullets.length === game.bullets.length ? game : { ...game, bullets };
}

function addDynamicBoom(effects, x, y) {
  return [
    ...effects,
    {
      id: `classic-bullet-boom-${Date.now()}-${Math.random()}`,
      x,
      y,
      r: 10,
      life: CLASSIC_EFFECT_LIFE,
      classicDynamic: true
    }
  ];
}

function resolveBulletCollisions(game) {
  const removed = new Set();
  let effects = game.effects;
  const playerBullets = game.bullets.filter((bullet) => bullet.owner !== 'enemy');
  const enemyBullets = game.bullets.filter((bullet) => bullet.owner === 'enemy');

  playerBullets.forEach((playerBullet) => {
    enemyBullets.forEach((enemyBullet) => {
      if (removed.has(playerBullet.id) || removed.has(enemyBullet.id)) return;
      if (!rectsOverlap(playerBullet, enemyBullet)) return;
      removed.add(playerBullet.id);
      removed.add(enemyBullet.id);
      effects = addDynamicBoom(
        effects,
        (playerBullet.x + enemyBullet.x) / 2 + playerBullet.w / 2,
        (playerBullet.y + enemyBullet.y) / 2 + playerBullet.h / 2
      );
    });
  });

  if (removed.size === 0) return game;
  return {
    ...game,
    bullets: game.bullets.filter((bullet) => !removed.has(bullet.id)),
    effects,
    classicEvents: [...(game.classicEvents ?? []), 'bulletCrash']
  };
}

function drawRepeatingTile(ctx, image, x, y, w, h) {
  if (!image.complete) return;
  const pattern = ctx.createPattern(image, 'repeat');
  if (!pattern) return;
  ctx.fillStyle = pattern;
  ctx.fillRect(x, y, w, h);
}

function drawClassicTank(ctx, tank, image) {
  if (!image?.complete) return;
  const row = DIR_ROW[tank.dir] ?? 0;
  const frame = Math.floor((tank.x + tank.y) / 6) % 2;
  ctx.save();
  ctx.globalAlpha = tank.connected === false ? 0.45 : 1;
  ctx.drawImage(image, frame * 48, row * 48, 48, 48, tank.x - 1, tank.y - 1, tank.size + 2, tank.size + 2);
  ctx.restore();
}

export function drawClassicGame(ctx, game) {
  const players = game.players ?? [game.player].filter(Boolean);
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  game.blocks.forEach((block) => {
    const image = block.type === 'steel' ? classicImages.steel : classicImages.brick;
    drawRepeatingTile(ctx, image, block.x, block.y, block.w, block.h);
  });

  const baseImage = game.status === 'over' ? classicImages.destroyed : classicImages.home;
  if (baseImage.complete) ctx.drawImage(baseImage, BASE.x, BASE.y, BASE.w, BASE.h);

  players.forEach((player) => drawClassicTank(ctx, player, classicImages.player));
  game.enemies.forEach((enemy) => {
    const image = classicImages[`enemy${(enemy.id % 4) + 1}`];
    drawClassicTank(ctx, enemy, image);
  });

  game.bullets.forEach((bullet) => {
    const image = classicImages[`bullet${bullet.dir[0].toUpperCase()}${bullet.dir.slice(1)}`];
    if (image?.complete) ctx.drawImage(image, bullet.x - 3, bullet.y - 3, 12, 12);
  });

  game.effects.forEach((effect) => {
    if (effect.classicDynamic && classicImages.boomDynamic.complete) {
      const frame = Math.min(5, Math.floor((CLASSIC_EFFECT_LIFE - effect.life) / 3));
      const size = 44;
      ctx.drawImage(classicImages.boomDynamic, frame * 96, 0, 96, 96, effect.x - size / 2, effect.y - size / 2, size, size);
    } else if (classicImages.boom.complete) {
      const size = Math.max(18, effect.r * 2);
      ctx.globalAlpha = Math.max(0.25, effect.life / 20);
      ctx.drawImage(classicImages.boom, effect.x - size / 2, effect.y - size / 2, size, size);
      ctx.globalAlpha = 1;
    }
  });

  if (game.status !== 'playing') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.66)';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.textAlign = 'center';
    if (game.status === 'over' && classicImages.gameover.complete) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(classicImages.gameover, WIDTH / 2 - 128, HEIGHT / 2 - 72, 256, 128);
    } else {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 34px monospace';
      ctx.fillText(game.status === 'won' ? 'VICTORY' : 'TANK 1990', WIDTH / 2, HEIGHT / 2 - 16);
    }
    ctx.fillStyle = '#fff';
    ctx.font = '18px monospace';
    ctx.fillText('PRESS ENTER', WIDTH / 2, HEIGHT / 2 + 76);
  }
}

export function getClassicLogo() {
  return ASSETS.logo;
}

export function getClassicTip() {
  return ASSETS.ui.tip;
}

export function createClassicAudio() {
  if (typeof Audio === 'undefined') {
    return { play: () => {} };
  }
  const sounds = Object.fromEntries(
    Object.entries(ASSETS.audio).map(([key, src]) => {
      const audio = new Audio(src);
      audio.preload = 'auto';
      return [key, audio];
    })
  );
  let lastMoveAt = 0;

  const play = (name, options = {}) => {
    const source = sounds[name];
    if (!source) return;
    if (options.throttle) {
      const now = performance.now();
      if (now - lastMoveAt < options.throttle) return;
      lastMoveAt = now;
    }
    const audio = source.cloneNode();
    audio.volume = options.volume ?? 0.72;
    audio.play().catch(() => {});
  };

  return { play };
}

function enemyHealth(game) {
  return game.enemies.reduce((sum, enemy) => sum + enemy.hp, 0);
}

function playerBulletCount(game) {
  return game.bullets.filter((bullet) => bullet.owner !== 'enemy').length;
}

function playerMoved(before, after) {
  const from = before.players?.[0];
  const to = after.players?.[0];
  return Boolean(from && to && (from.x !== to.x || from.y !== to.y));
}

export function playClassicStepSounds(audio, before, after) {
  if (!audio || before.status !== 'playing') return;
  if (after.lives < before.lives) audio.play('playerCrack', { volume: 0.78 });
  if (after.classicEvents?.includes('bulletCrash')) audio.play('tankCrack', { volume: 0.72 });
  if (after.score > before.score || enemyHealth(after) < enemyHealth(before)) audio.play('tankCrack', { volume: 0.78 });
  if (after.blocks.length < before.blocks.length) audio.play('bulletCrack', { volume: 0.7 });
  if (playerBulletCount(after) > playerBulletCount(before)) audio.play('attack', { volume: 0.64 });
  if (playerMoved(before, after)) audio.play('move', { volume: 0.45, throttle: 180 });
}
