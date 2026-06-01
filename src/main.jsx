import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DEFAULT_SETTINGS,
  HEIGHT,
  WIDTH,
  drawGame,
  initialGame,
  predictLocalPlayer,
  stepGame
} from './gameEngine.js';
import {
  createClassicAudio,
  drawClassicGame,
  getClassicLogo,
  getClassicTip,
  initialClassicGame,
  playClassicStepSounds,
  stepClassicGame
} from './classicMode.js';
import './styles.css';

const KEY_MAP = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right'
};
const ONLINE_INPUT_MS = 1000 / 30;
const LOCAL_STEP_MS = 1000 / 60;
const MAX_LOCAL_STEPS = 5;

function getWsUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.hostname}:8787`;
}

function getPlayerToken() {
  const key = 'tankBattlePlayerToken';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const token = crypto.randomUUID ? crypto.randomUUID() : `player-${Date.now()}-${Math.random()}`;
  window.localStorage.setItem(key, token);
  return token;
}

function formatRoomCode(value) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function blendEntity(previous, next, ratio = 0.45) {
  if (!previous) return next;
  return {
    ...next,
    x: previous.x + (next.x - previous.x) * ratio,
    y: previous.y + (next.y - previous.y) * ratio
  };
}

function smoothOnlineGame(current, next, localSlot) {
  if (!current || current.status !== 'playing' || next.status !== 'playing') return next;
  const findById = (items, id) => items?.find((item) => item.id === id);
  return {
    ...next,
    players: next.players.map((player) => (
      player.slot === localSlot ? player : blendEntity(findById(current.players, player.id), player)
    )),
    enemies: next.enemies.map((enemy) => blendEntity(findById(current.enemies, enemy.id), enemy)),
    bullets: next.bullets.map((bullet) => blendEntity(findById(current.bullets, bullet.id), bullet, 0.7))
  };
}

function mergeSnapshotGame(current, incoming) {
  if (!current || incoming.blocks) return { ...incoming, player: incoming.players?.[0] };
  return {
    ...current,
    ...incoming,
    blocks: current.blocks,
    player: incoming.players?.[0] ?? current.player
  };
}

function totalEnemies(game) {
  return game.waveLeft + game.enemies.length;
}

function shouldPublishSnapshot(previous, next) {
  return previous.score !== next.score ||
    previous.lives !== next.lives ||
    previous.level !== next.level ||
    previous.status !== next.status ||
    previous.message !== next.message ||
    totalEnemies(previous) !== totalEnemies(next);
}

function TankBattle() {
  const canvasRef = useRef(null);
  const settingsRef = useRef(DEFAULT_SETTINGS);
  const gameRef = useRef(initialGame(settingsRef.current));
  const screenRef = useRef('menu');
  const modeRef = useRef('solo');
  const keysRef = useRef(new Set());
  const fireQueueRef = useRef(0);
  const animationRef = useRef(null);
  const socketRef = useRef(null);
  const onlineRef = useRef({ roomCode: '', slot: 0, playerToken: '' });
  const classicAudioRef = useRef(null);
  const inputSeqRef = useRef(0);
  const pendingInputsRef = useRef([]);
  const lastOnlineInputAtRef = useRef(0);
  const lastStatusAtRef = useRef(0);
  const snapshotRef = useRef(gameRef.current);
  const [snapshot, setSnapshot] = useState(gameRef.current);
  const [screen, setScreen] = useState('menu');
  const [showDetails, setShowDetails] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showOnline, setShowOnline] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [onlineStatus, setOnlineStatus] = useState('未连接');
  const [onlineError, setOnlineError] = useState('');
  const [roomInfo, setRoomInfo] = useState(null);
  const [copiedInvite, setCopiedInvite] = useState('');

  const publishSnapshot = useCallback((next, force = false) => {
    if (!force && !shouldPublishSnapshot(snapshotRef.current, next)) return;
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const sendSocket = useCallback((payload) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  }, []);

  const disconnectOnline = useCallback((notifyServer = true) => {
    if (notifyServer) sendSocket({ type: 'leaveRoom' });
    socketRef.current?.close();
    socketRef.current = null;
    onlineRef.current = { roomCode: '', slot: 0, playerToken: '' };
    pendingInputsRef.current = [];
    inputSeqRef.current = 0;
    lastOnlineInputAtRef.current = 0;
    lastStatusAtRef.current = 0;
    setRoomInfo(null);
    setOnlineStatus('未连接');
  }, [sendSocket]);

  const startGame = useCallback(() => {
    disconnectOnline(false);
    modeRef.current = 'solo';
    keysRef.current.clear();
    fireQueueRef.current = 0;
    screenRef.current = 'game';
    setScreen('game');
    gameRef.current = { ...initialGame(settingsRef.current), status: 'playing', message: '' };
    publishSnapshot(gameRef.current, true);
  }, [disconnectOnline]);

  const startClassicGame = useCallback(() => {
    disconnectOnline(false);
    modeRef.current = 'classic';
    keysRef.current.clear();
    fireQueueRef.current = 0;
    screenRef.current = 'game';
    setScreen('game');
    gameRef.current = initialClassicGame();
    publishSnapshot(gameRef.current, true);
    if (!classicAudioRef.current) classicAudioRef.current = createClassicAudio();
    classicAudioRef.current.play('start', { volume: 0.8 });
  }, [disconnectOnline, publishSnapshot]);

  const backToMenu = useCallback(() => {
    disconnectOnline(true);
    keysRef.current.clear();
    fireQueueRef.current = 0;
    modeRef.current = 'solo';
    screenRef.current = 'menu';
    setScreen('menu');
    gameRef.current = initialGame(settingsRef.current);
    publishSnapshot(gameRef.current, true);
  }, [disconnectOnline]);

  const updateSetting = (key, value) => {
    const next = { ...settingsRef.current, [key]: Number(value) };
    settingsRef.current = next;
    setSettings(next);
  };

  const pauseGame = useCallback(() => {
    if (modeRef.current === 'online') return;
    const game = gameRef.current;
    if (screenRef.current !== 'game') return;
    if (game.status === 'playing') gameRef.current = { ...game, status: 'paused', message: '已暂停，按 Enter 继续' };
    else if (game.status === 'paused') gameRef.current = { ...game, status: 'playing', message: '' };
    publishSnapshot(gameRef.current, true);
  }, []);

  const restartGame = useCallback(() => {
    if (modeRef.current === 'online') {
      pendingInputsRef.current = [];
      inputSeqRef.current = 0;
      fireQueueRef.current = 0;
      sendSocket({ type: 'restart', settings: settingsRef.current });
      return;
    }
    if (modeRef.current === 'classic') {
      startClassicGame();
      return;
    }
    startGame();
  }, [sendSocket, startClassicGame, startGame]);

  const connectOnline = useCallback((action, roomCode = '') => {
    disconnectOnline(false);
    setOnlineError('');
    setOnlineStatus('连接中...');
    const playerToken = getPlayerToken();
    const socket = new WebSocket(getWsUrl());
    socketRef.current = socket;
    onlineRef.current = { roomCode, slot: 0, playerToken };

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({
        type: action,
        roomCode,
        playerToken,
        settings: settingsRef.current
      }));
    });

    socket.addEventListener('message', (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message.type === 'roomCreated' || message.type === 'joined' || message.type === 'waiting') {
        onlineRef.current = {
          roomCode: message.roomCode,
          slot: message.slot ?? onlineRef.current.slot,
          playerToken
        };
        setRoomInfo({
          roomCode: message.roomCode,
          slot: message.slot,
          players: message.players ?? [],
          shareUrl: `${window.location.origin}${window.location.pathname}?room=${message.roomCode}`
        });
        setOnlineStatus(message.statusText ?? (message.type === 'waiting' ? '等待好友加入' : '已连接'));
        setShowOnline(false);
        modeRef.current = 'online';
        screenRef.current = 'game';
        setScreen('game');
      }

      if (message.type === 'snapshot') {
        modeRef.current = 'online';
        screenRef.current = 'game';
        setScreen('game');
        onlineRef.current = {
          ...onlineRef.current,
          roomCode: message.roomCode,
          slot: message.slot ?? onlineRef.current.slot
        };
        setRoomInfo((current) => {
          const next = {
            ...(current ?? {}),
            roomCode: message.roomCode,
            players: message.players ?? [],
            slot: message.slot ?? current?.slot ?? onlineRef.current.slot,
            shareUrl: `${window.location.origin}${window.location.pathname}?room=${message.roomCode}`
          };
          const samePlayers = JSON.stringify(current?.players ?? []) === JSON.stringify(next.players);
          if (current?.roomCode === next.roomCode && current?.slot === next.slot && current?.shareUrl === next.shareUrl && samePlayers) return current;
          return next;
        });
        const now = Date.now();
        const serverAckLatency = message.ackClientTime ? Math.max(0, now - message.ackClientTime) : null;
        const snapshotAge = message.serverTime ? Math.max(0, now - message.serverTime) : null;
        const ackText = serverAckLatency !== null ? ` · 确认 ${serverAckLatency}ms` : '';
        const ageText = snapshotAge !== null ? ` · 快照 ${snapshotAge}ms` : '';
        const queueWarning = snapshotAge !== null && snapshotAge > 1200 ? ' · 同步积压' : '';
        const networkWarning = serverAckLatency !== null && serverAckLatency > 300 && !queueWarning ? ' · 网络延迟较高' : '';
        if (now - lastStatusAtRef.current > 1000) {
          lastStatusAtRef.current = now;
          setOnlineStatus((current) => {
            const next = `${message.statusText ?? '联机中'}${ackText}${ageText}${queueWarning}${networkWarning}`;
            return current === next ? current : next;
          });
        }
        pendingInputsRef.current = pendingInputsRef.current.filter((item) => item.seq > (message.lastProcessedSeq ?? 0));
        const slot = message.slot ?? onlineRef.current.slot;
        const mergedGame = mergeSnapshotGame(gameRef.current, message.game);
        const smoothedGame = smoothOnlineGame(gameRef.current, mergedGame, slot);
        const predicted = pendingInputsRef.current.reduce(
          (game, item) => predictLocalPlayer(game, slot, item),
          smoothedGame
        );
        gameRef.current = predicted;
        publishSnapshot(predicted, Boolean(message.full));
      }

      if (message.type === 'gameOver') {
        setOnlineStatus(message.statusText ?? '游戏结束');
      }

      if (message.type === 'error') {
        setOnlineError(message.message ?? '联机失败');
        setOnlineStatus('连接失败');
      }
    });

    socket.addEventListener('close', () => {
      if (modeRef.current === 'online') {
        setOnlineStatus('连接已断开');
        gameRef.current = { ...gameRef.current, status: 'paused', message: '联机断开，请返回菜单重连' };
        publishSnapshot(gameRef.current, true);
      }
    });

    socket.addEventListener('error', () => {
      setOnlineError('无法连接联机服务，请确认服务端已启动');
      setOnlineStatus('连接失败');
    });
  }, [disconnectOnline]);

  const createOnlineRoom = () => connectOnline('createRoom');
  const joinOnlineRoom = () => {
    const roomCode = formatRoomCode(roomCodeInput);
    if (!roomCode) {
      setOnlineError('请输入房间码');
      return;
    }
    connectOnline('joinRoom', roomCode);
  };

  const copyInvite = async () => {
    if (!roomInfo?.shareUrl) return;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(roomInfo.shareUrl);
        copied = true;
      }
    } catch {
      copied = false;
    }
    if (!copied) {
      try {
        const field = document.createElement('textarea');
        field.value = roomInfo.shareUrl;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.left = '-9999px';
        document.body.appendChild(field);
        field.select();
        copied = document.execCommand('copy');
        document.body.removeChild(field);
      } catch {
        copied = false;
      }
    }
    setCopiedInvite(roomInfo.shareUrl);
    setOnlineStatus(copied ? '邀请链接已复制' : '复制受限，请手动复制下方链接');
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = formatRoomCode(params.get('room') ?? '');
    if (room) {
      setShowOnline(true);
      setRoomCodeInput(room);
    }
  }, []);

  useEffect(() => {
    const down = (event) => {
      if (screenRef.current === 'game' && KEY_MAP[event.code]) {
        event.preventDefault();
        keysRef.current.add(KEY_MAP[event.code]);
      }
      if (screenRef.current === 'game' && event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) fireQueueRef.current += 1;
      }
      if (event.code === 'Enter') {
        event.preventDefault();
        const game = gameRef.current;
        if (screenRef.current === 'menu') startGame();
        else if (modeRef.current === 'solo' && game.status === 'paused') pauseGame();
        else if (game.status === 'over' || game.status === 'won') restartGame();
      }
      if (event.code === 'KeyP') pauseGame();
    };
    const up = (event) => {
      if (KEY_MAP[event.code]) keysRef.current.delete(KEY_MAP[event.code]);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [pauseGame, restartGame, startGame]);

  useEffect(() => {
    let lastFrameAt = 0;
    let localStepRemainder = 0;

    const tick = (frameAt) => {
      const ctx = canvasRef.current?.getContext('2d');
      if (screenRef.current === 'game') {
        if (modeRef.current === 'solo' || modeRef.current === 'classic') {
          const step = modeRef.current === 'classic' ? stepClassicGame : stepGame;
          const delta = lastFrameAt ? Math.min(100, frameAt - lastFrameAt) : LOCAL_STEP_MS;
          localStepRemainder += delta;
          let steps = 0;
          let stepped = false;

          while (localStepRemainder >= LOCAL_STEP_MS && steps < MAX_LOCAL_STEPS) {
            const firePressed = fireQueueRef.current > 0;
            if (firePressed) fireQueueRef.current -= 1;
            const before = gameRef.current;
            const after = step(before, {
              p1: {
                keys: keysRef.current,
                firePressed
              }
            });
            gameRef.current = after;
            if (modeRef.current === 'classic') playClassicStepSounds(classicAudioRef.current, before, after);
            localStepRemainder -= LOCAL_STEP_MS;
            steps += 1;
            stepped = true;
          }

          if (steps === MAX_LOCAL_STEPS) localStepRemainder = 0;
          if (stepped) publishSnapshot(gameRef.current);
        } else {
          const now = performance.now();
          const firePressed = fireQueueRef.current > 0;
          const shouldSendInput = firePressed || now - lastOnlineInputAtRef.current >= ONLINE_INPUT_MS;
          if (shouldSendInput) {
            if (firePressed) fireQueueRef.current -= 1;
            lastOnlineInputAtRef.current = now;
            const inputPacket = {
              seq: inputSeqRef.current + 1,
              keys: Array.from(keysRef.current),
              firePressed,
              clientTime: Date.now()
            };
            inputSeqRef.current = inputPacket.seq;
            const sent = sendSocket({
              type: 'input',
              ...inputPacket
            });
            if (sent) {
              pendingInputsRef.current = [...pendingInputsRef.current, inputPacket].slice(-120);
              gameRef.current = predictLocalPlayer(gameRef.current, onlineRef.current.slot, inputPacket);
              publishSnapshot(gameRef.current);
            }
          }
        }
        if (ctx) {
          if (modeRef.current === 'classic') drawClassicGame(ctx, gameRef.current);
          else drawGame(ctx, gameRef.current);
        }
      } else {
        localStepRemainder = 0;
      }
      lastFrameAt = frameAt;
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationRef.current);
  }, [sendSocket]);

  useEffect(() => () => disconnectOnline(true), [disconnectOnline]);

  const totalEnemyCount = totalEnemies(snapshot);
  const isOnline = modeRef.current === 'online';
  const isClassic = modeRef.current === 'classic';

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
              <button type="button" className="primary-action classic-action" onClick={startClassicGame}>经典 1990</button>
              <button type="button" className="primary-action" onClick={startGame}>普通游戏</button>
              <button type="button" className="secondary-action" onClick={() => setShowOnline(true)}>联机对战</button>
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

        {showOnline && (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowOnline(false)}>
            <section className="details-modal online-modal" role="dialog" aria-modal="true" aria-labelledby="online-title" onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-head">
                <h2 id="online-title">联机对战</h2>
                <button type="button" className="icon-close" aria-label="关闭联机" onClick={() => setShowOnline(false)}>×</button>
              </div>
              <p className="modal-copy">创建房间后，把房间码或邀请链接发给好友。第二名玩家加入后会自动开始。</p>
              <button type="button" className="primary-action full-action" onClick={createOnlineRoom}>创建房间</button>
              <div className="join-row">
                <input value={roomCodeInput} placeholder="输入房间码" onChange={(event) => setRoomCodeInput(formatRoomCode(event.target.value))} />
                <button type="button" className="secondary-action" onClick={joinOnlineRoom}>加入</button>
              </div>
              <p className="online-status">{onlineStatus}</p>
              {onlineError && <p className="online-error">{onlineError}</p>}
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
    <main className={`game-shell game-page${isClassic ? ' classic-page' : ''}`}>
      <section className="game-topbar">
        <div>
          {isClassic ? (
            <img className="classic-logo" src={getClassicLogo()} alt="Tank War" />
          ) : (
            <>
              <p className="eyebrow">{isOnline ? `Room ${roomInfo?.roomCode ?? onlineRef.current.roomCode}` : 'React Canvas Game'}</p>
              <h1>坦克大战</h1>
            </>
          )}
        </div>
        {isClassic ? (
          <div className="classic-stats" style={{ backgroundImage: `url(${getClassicTip()})` }} aria-label="游戏状态">
            <span className="classic-score"><strong>{snapshot.score}</strong></span>
            <span className="classic-enemies"><strong>{totalEnemyCount}</strong></span>
            <span className="classic-lives"><strong>{snapshot.lives}</strong></span>
            <span className="classic-level">关卡 <strong>{snapshot.level}</strong></span>
          </div>
        ) : (
          <div className="stats compact-stats" aria-label="游戏状态">
            <span>得分 <strong>{snapshot.score}</strong></span>
            <span>生命 <strong>{snapshot.lives}</strong></span>
            <span>关卡 <strong>{snapshot.level}</strong></span>
            <span>敌军 <strong>{totalEnemyCount}</strong></span>
          </div>
        )}
        <div className="actions">
          <button type="button" onClick={backToMenu}>菜单</button>
          <button type="button" onClick={restartGame}>重开</button>
          <button type="button" onClick={pauseGame} disabled={isOnline || snapshot.status === 'ready' || snapshot.status === 'over' || snapshot.status === 'won'}>
            {snapshot.status === 'paused' ? '继续' : '暂停'}
          </button>
        </div>
      </section>

      {isOnline && (
        <section className="room-strip" aria-label="联机房间状态">
          <span>房间 <strong>{roomInfo?.roomCode ?? onlineRef.current.roomCode}</strong></span>
          <span>{onlineStatus}</span>
          {(roomInfo?.players ?? []).map((player) => (
            <span key={player.slot}>{player.label}: <strong>{player.connected ? '在线' : '离线'}</strong></span>
          ))}
          <button type="button" onClick={copyInvite}>复制邀请链接</button>
          {copiedInvite && <input className="invite-link" value={copiedInvite} readOnly onFocus={(event) => event.target.select()} aria-label="邀请链接" />}
        </section>
      )}

      <section className="play-area">
        <div className="canvas-wrap">
          <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} aria-label="坦克大战游戏画布" />
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<TankBattle />);
