import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const TILE = 24;
const COLS = 26;
const ROWS = 26;
const WIDTH = COLS * TILE;
const HEIGHT = ROWS * TILE;
const PLAYER_SIZE = 22;
const ENEMY_SIZE = 22;
const BULLET_SIZE = 5;
const DEFAULT_SETTINGS = {
  enemyCount: 10,
  tankSpeed: 1.6,
  bulletSpeed: 4.2
};
const ENEMY_FIRE_RATE = 0.012;
const MAX_ENEMIES = 5;

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 }
};

const ENEMY_SPAWNS = [
  { x: 1 * TILE + 1, y: 1 * TILE + 1 },
  { x: 12 * TILE + 1, y: 1 * TILE + 1 },
  { x: 23 * TILE + 1, y: 1 * TILE + 1 }
];

const PLAYER_START = { x: 10 * TILE + 1, y: 23 * TILE + 1 };
const BASE = { x: 12 * TILE, y: 24 * TILE, w: TILE * 2, h: TILE * 2 };

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

function generateMap() {
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
  reserveRect(10, 21, 15, 25);
  reserveTankStart(PLAYER_START);
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

function initialGame(settings = DEFAULT_SETTINGS) {
  return {
    status: 'ready',
    level: 1,
    score: 0,
    lives: 3,
    settings,
    waveLeft: settings.enemyCount,
    nextEnemyId: 0,
    spawnCooldown: 0,
    message: '按 Enter 开始',
    blocks: generateMap(),
    player: {
      x: PLAYER_START.x,
      y: PLAYER_START.y,
      size: PLAYER_SIZE,
      dir: 'up',
      hp: 1,
      cooldown: 0,
      invincible: 120
    },
    enemies: [],
    bullets: [],
    effects: []
  };
}

function resetForNextLevel(game) {
  return {
    ...initialGame(game.settings),
    status: 'playing',
    level: game.level + 1,
    score: game.score + 500,
    lives: game.lives,
    waveLeft: game.settings.enemyCount + game.level * 2,
    message: ''
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

function fireBullet(tank, owner) {
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
    dir: tank.dir
  };
}

function addBurst(effects, x, y, color = '#f97316') {
  return [
    ...effects,
    { id: `fx-${Date.now()}-${Math.random()}`, x, y, r: 4, life: 20, color }
  ];
}

function drawTank(ctx, tank, isPlayer) {
  const cx = tank.x + tank.size / 2;
  const cy = tank.y + tank.size / 2;
  const vector = DIRS[tank.dir];
  const body = isPlayer ? '#22c55e' : tank.color;
  const tread = isPlayer ? '#14532d' : '#7f1d1d';

  ctx.save();
  ctx.translate(cx, cy);
  if (tank.dir === 'right') ctx.rotate(Math.PI / 2);
  if (tank.dir === 'down') ctx.rotate(Math.PI);
  if (tank.dir === 'left') ctx.rotate(-Math.PI / 2);

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

  if (isPlayer && tank.invincible > 0) {
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx + vector.x, cy + vector.y, 17, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawGame(ctx, game) {
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

  drawTank(ctx, game.player, true);
  game.enemies.forEach((enemy) => drawTank(ctx, enemy, false));

  game.bullets.forEach((bullet) => {
    ctx.fillStyle = bullet.owner === 'player' ? '#fef08a' : '#fb7185';
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
    ctx.fillText(game.status === 'won' ? '胜利' : game.status === 'over' ? '基地失守' : '坦克大战', WIDTH / 2, HEIGHT / 2 - 18);
    ctx.font = '18px system-ui';
    ctx.fillText(game.message, WIDTH / 2, HEIGHT / 2 + 22);
  }
}

function stepGame(game, input) {
  if (game.status !== 'playing') return game;

  let next = {
    ...game,
    player: {
      ...game.player,
      cooldown: Math.max(0, game.player.cooldown - 1),
      invincible: Math.max(0, game.player.invincible - 1)
    },
    spawnCooldown: Math.max(0, game.spawnCooldown - 1),
    effects: game.effects
      .map((effect) => ({ ...effect, life: effect.life - 1, r: effect.r + 1.8 }))
      .filter((effect) => effect.life > 0)
  };

  const allTanks = [next.player, ...next.enemies];
  const activeDir = input.dirs.find((dir) => input.keys.has(dir));
  if (activeDir) {
    next.player = moveTank(next.player, activeDir, next.settings.tankSpeed, next.blocks, allTanks);
  }

  if (input.fire && next.player.cooldown === 0) {
    next.bullets = [...next.bullets, fireBullet(next.player, 'player')];
    next.player = { ...next.player, cooldown: 22 };
  }

  if (next.spawnCooldown === 0 && next.waveLeft > 0 && next.enemies.length < MAX_ENEMIES) {
    const enemy = makeEnemy(next.nextEnemyId, next.level);
    const spawnBlocked = [next.player, ...next.enemies].some((tank) => rectsOverlap(tankRect(enemy), tankRect(tank)));
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
      const dx = next.player.x - enemy.x;
      const dy = next.player.y - enemy.y;
      const chaseDir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      changed.dir = Math.random() < 0.62 ? chaseDir : Object.keys(DIRS)[Math.floor(Math.random() * 4)];
      changed.moveTimer = 35 + Math.random() * 85;
    }
    const moved = moveTank(changed, changed.dir, next.settings.tankSpeed * 0.48 + next.level * 0.05, next.blocks, [next.player, ...next.enemies]);
    return moved.x === enemy.x && moved.y === enemy.y && Math.random() < 0.1
      ? { ...moved, dir: Object.keys(DIRS)[Math.floor(Math.random() * 4)], moveTimer: 20 }
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
  let player = next.player;
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

    if (bullet.owner === 'player') {
      const enemy = enemies.find((item) => rectsOverlap(moved, tankRect(item)));
      if (enemy) {
        effects = addBurst(effects, enemy.x + enemy.size / 2, enemy.y + enemy.size / 2);
        enemies = enemies
          .map((item) => (item.id === enemy.id ? { ...item, hp: item.hp - 1 } : item))
          .filter((item) => item.hp > 0);
        if (enemy.hp <= 1) score += 100;
        return;
      }
    } else if (player.invincible === 0 && rectsOverlap(moved, tankRect(player))) {
      effects = addBurst(effects, player.x + player.size / 2, player.y + player.size / 2, '#38bdf8');
      lives -= 1;
      if (lives <= 0) {
        status = 'over';
        message = '按 Enter 重新开始';
      } else {
        player = { ...player, x: PLAYER_START.x, y: PLAYER_START.y, dir: 'up', invincible: 130 };
      }
      return;
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
      return resetForNextLevel({ ...next, score, lives });
    }
  }

  return {
    ...next,
    blocks,
    enemies,
    player,
    bullets: remainingBullets,
    effects,
    score,
    lives,
    status,
    message
  };
}

function TankBattle() {
  const canvasRef = useRef(null);
  const settingsRef = useRef(DEFAULT_SETTINGS);
  const gameRef = useRef(initialGame(settingsRef.current));
  const screenRef = useRef('menu');
  const keysRef = useRef(new Set());
  const fireRef = useRef(false);
  const animationRef = useRef(null);
  const [snapshot, setSnapshot] = useState(gameRef.current);
  const [screen, setScreen] = useState('menu');
  const [showDetails, setShowDetails] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const input = useMemo(() => ({
    keys: keysRef.current,
    dirs: ['up', 'down', 'left', 'right'],
    get fire() {
      return fireRef.current;
    }
  }), []);

  const startGame = useCallback(() => {
    keysRef.current.clear();
    fireRef.current = false;
    screenRef.current = 'game';
    setScreen('game');
    gameRef.current = { ...initialGame(settingsRef.current), status: 'playing', message: '' };
    setSnapshot(gameRef.current);
  }, []);

  const backToMenu = useCallback(() => {
    keysRef.current.clear();
    fireRef.current = false;
    screenRef.current = 'menu';
    setScreen('menu');
    gameRef.current = initialGame(settingsRef.current);
    setSnapshot(gameRef.current);
  }, []);

  const updateSetting = (key, value) => {
    const next = { ...settingsRef.current, [key]: Number(value) };
    settingsRef.current = next;
    setSettings(next);
  };

  const pauseGame = useCallback(() => {
    const game = gameRef.current;
    if (screenRef.current !== 'game') return;
    if (game.status === 'playing') gameRef.current = { ...game, status: 'paused', message: '已暂停，按 Enter 继续' };
    else if (game.status === 'paused') gameRef.current = { ...game, status: 'playing', message: '' };
    setSnapshot(gameRef.current);
  }, []);

  useEffect(() => {
    const down = (event) => {
      const map = {
        ArrowUp: 'up',
        KeyW: 'up',
        ArrowDown: 'down',
        KeyS: 'down',
        ArrowLeft: 'left',
        KeyA: 'left',
        ArrowRight: 'right',
        KeyD: 'right'
      };
      if (screenRef.current === 'game' && map[event.code]) {
        event.preventDefault();
        keysRef.current.add(map[event.code]);
      }
      if (screenRef.current === 'game' && event.code === 'Space') {
        event.preventDefault();
        fireRef.current = true;
      }
      if (event.code === 'Enter') {
        event.preventDefault();
        const game = gameRef.current;
        if (screenRef.current === 'menu') startGame();
        else if (game.status === 'paused') pauseGame();
        else if (game.status === 'over' || game.status === 'won') startGame();
      }
      if (event.code === 'KeyP') pauseGame();
    };
    const up = (event) => {
      const map = {
        ArrowUp: 'up',
        KeyW: 'up',
        ArrowDown: 'down',
        KeyS: 'down',
        ArrowLeft: 'left',
        KeyA: 'left',
        ArrowRight: 'right',
        KeyD: 'right'
      };
      if (map[event.code]) keysRef.current.delete(map[event.code]);
      if (event.code === 'Space') fireRef.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [pauseGame, startGame]);

  useEffect(() => {
    const tick = () => {
      const ctx = canvasRef.current?.getContext('2d');
      if (screenRef.current === 'game') {
        gameRef.current = stepGame(gameRef.current, input);
        if (ctx) drawGame(ctx, gameRef.current);
        setSnapshot(gameRef.current);
      }
      fireRef.current = false;
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationRef.current);
  }, [input]);

  const pressControl = (key, active) => {
    if (screenRef.current !== 'game') return;
    if (key === 'fire') {
      fireRef.current = active;
      return;
    }
    if (active) keysRef.current.add(key);
    else keysRef.current.delete(key);
  };

  if (screen === 'menu') {
    return (
      <main className="game-shell menu-page">
        <div className="menu-battle-bg" aria-hidden="true">
          <div className="pixel-grid" />
          <div className="bg-wall bg-wall-a" />
          <div className="bg-wall bg-wall-b" />
          <div className="bg-wall bg-wall-c" />
          <div className="bg-tank bg-tank-green" />
          <div className="bg-tank bg-tank-red bg-red-one" />
          <div className="bg-tank bg-tank-red bg-red-two" />
          <div className="bg-tank bg-tank-yellow" />
          <div className="bg-tank bg-tank-blue" />
          <div className="bg-tank bg-tank-purple" />
          <div className="bg-bullet bullet-one" />
          <div className="bg-bullet bullet-two" />
          <div className="bg-bullet bullet-three" />
          <div className="bg-bullet bullet-four" />
          <div className="bg-boom boom-one" />
          <div className="bg-boom boom-two" />
          <div className="bg-boom boom-three" />
        </div>
        <section className="menu-hero" aria-label="游戏菜单">
          <div className="menu-copy">
            <p className="eyebrow">React Canvas Game</p>
            <h1>坦克大战</h1>
            <p className="menu-subtitle">守住基地，击毁敌军，穿过三轮进攻。</p>
            <div className="menu-actions">
              <button type="button" className="primary-action" onClick={startGame}>开始游戏</button>
              <button type="button" className="secondary-action" onClick={() => setShowDetails(true)}>游戏详情</button>
              <button type="button" className="secondary-action" onClick={() => setShowSettings(true)}>设置</button>
            </div>
          </div>
        </section>

        {showDetails && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowDetails(false)}>
            <section className="details-modal" role="dialog" aria-modal="true" aria-labelledby="details-title" onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-head">
                <h2 id="details-title">游戏详情</h2>
                <button type="button" className="icon-close" aria-label="关闭详情" onClick={() => setShowDetails(false)}>×</button>
              </div>
              <div className="keys">
                <kbd>WASD</kbd>
                <span>或方向键移动</span>
                <kbd>Space</kbd>
                <span>开火</span>
                <kbd>Enter</kbd>
                <span>菜单开始，结束后重开</span>
                <kbd>P</kbd>
                <span>暂停/继续</span>
              </div>
              <div className="legend">
                <span><i className="brick" />砖墙可击毁</span>
                <span><i className="steel" />钢墙不可击毁</span>
                <span><i className="base" />保护基地</span>
              </div>
            </section>
          </div>
        )}

        {showSettings && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowSettings(false)}>
            <section className="details-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-head">
                <h2 id="settings-title">游戏设置</h2>
                <button type="button" className="icon-close" aria-label="关闭设置" onClick={() => setShowSettings(false)}>×</button>
              </div>
              <div className="settings-list">
                <label>
                  <span>敌军数量 <strong>{settings.enemyCount}</strong></span>
                  <input type="range" min="4" max="24" step="1" value={settings.enemyCount} onChange={(event) => updateSetting('enemyCount', event.target.value)} />
                </label>
                <label>
                  <span>坦克速度 <strong>{settings.tankSpeed.toFixed(1)}</strong></span>
                  <input type="range" min="0.8" max="3" step="0.1" value={settings.tankSpeed} onChange={(event) => updateSetting('tankSpeed', event.target.value)} />
                </label>
                <label>
                  <span>炮弹速度 <strong>{settings.bulletSpeed.toFixed(1)}</strong></span>
                  <input type="range" min="2.4" max="7" step="0.1" value={settings.bulletSpeed} onChange={(event) => updateSetting('bulletSpeed', event.target.value)} />
                </label>
              </div>
              <button type="button" className="primary-action full-action" onClick={() => setShowSettings(false)}>保存设置</button>
            </section>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="game-shell game-page">
      <section className="game-topbar">
        <div>
          <p className="eyebrow">React Canvas Game</p>
          <h1>坦克大战</h1>
        </div>
        <div className="stats compact-stats" aria-label="游戏状态">
          <span>得分 <strong>{snapshot.score}</strong></span>
          <span>生命 <strong>{snapshot.lives}</strong></span>
          <span>关卡 <strong>{snapshot.level}</strong></span>
          <span>敌军 <strong>{snapshot.waveLeft + snapshot.enemies.length}</strong></span>
        </div>
        <div className="actions">
          <button type="button" onClick={backToMenu}>菜单</button>
          <button type="button" onClick={startGame}>重开</button>
          <button type="button" onClick={pauseGame} disabled={snapshot.status === 'ready' || snapshot.status === 'over' || snapshot.status === 'won'}>
            {snapshot.status === 'paused' ? '继续' : '暂停'}
          </button>
        </div>
      </section>

      <section className="play-area">
        <div className="canvas-wrap">
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} aria-label="坦克大战游戏画布" />
        </div>
      </section>

    </main>
  );
}

createRoot(document.getElementById('root')).render(<TankBattle />);
