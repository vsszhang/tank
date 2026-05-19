import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  DEFAULT_SETTINGS,
  HEIGHT,
  WIDTH,
  drawGame,
  initialGame,
  stepGame
} from './gameEngine.js';
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

function TankBattle() {
  const canvasRef = useRef(null);
  const settingsRef = useRef(DEFAULT_SETTINGS);
  const gameRef = useRef(initialGame(settingsRef.current));
  const screenRef = useRef('menu');
  const modeRef = useRef('solo');
  const keysRef = useRef(new Set());
  const fireRef = useRef(false);
  const animationRef = useRef(null);
  const socketRef = useRef(null);
  const onlineRef = useRef({ roomCode: '', slot: 0, playerToken: '' });
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

  const input = useMemo(() => ({
    p1: {
      keys: keysRef.current,
      get fire() {
        return fireRef.current;
      }
    }
  }), []);

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
    setRoomInfo(null);
    setOnlineStatus('未连接');
  }, [sendSocket]);

  const startGame = useCallback(() => {
    disconnectOnline(false);
    modeRef.current = 'solo';
    keysRef.current.clear();
    fireRef.current = false;
    screenRef.current = 'game';
    setScreen('game');
    gameRef.current = { ...initialGame(settingsRef.current), status: 'playing', message: '' };
    setSnapshot(gameRef.current);
  }, [disconnectOnline]);

  const backToMenu = useCallback(() => {
    disconnectOnline(true);
    keysRef.current.clear();
    fireRef.current = false;
    modeRef.current = 'solo';
    screenRef.current = 'menu';
    setScreen('menu');
    gameRef.current = initialGame(settingsRef.current);
    setSnapshot(gameRef.current);
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
    setSnapshot(gameRef.current);
  }, []);

  const restartGame = useCallback(() => {
    if (modeRef.current === 'online') {
      sendSocket({ type: 'restart', settings: settingsRef.current });
      return;
    }
    startGame();
  }, [sendSocket, startGame]);

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
        setRoomInfo((current) => ({
          ...(current ?? {}),
          roomCode: message.roomCode,
          players: message.players ?? [],
          slot: message.slot ?? current?.slot ?? onlineRef.current.slot,
          shareUrl: `${window.location.origin}${window.location.pathname}?room=${message.roomCode}`
        }));
        setOnlineStatus(message.statusText ?? '联机中');
        gameRef.current = message.game;
        setSnapshot(message.game);
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
        setSnapshot(gameRef.current);
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
        fireRef.current = true;
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
      if (event.code === 'Space') fireRef.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [pauseGame, restartGame, startGame]);

  useEffect(() => {
    const tick = () => {
      const ctx = canvasRef.current?.getContext('2d');
      if (screenRef.current === 'game') {
        if (modeRef.current === 'solo') {
          gameRef.current = stepGame(gameRef.current, input);
          setSnapshot(gameRef.current);
        } else {
          sendSocket({
            type: 'input',
            keys: Array.from(keysRef.current),
            fire: fireRef.current
          });
        }
        if (ctx) drawGame(ctx, gameRef.current);
      }
      fireRef.current = false;
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationRef.current);
  }, [input, sendSocket]);

  useEffect(() => () => disconnectOnline(true), [disconnectOnline]);

  const totalEnemies = snapshot.waveLeft + snapshot.enemies.length;
  const isOnline = modeRef.current === 'online';

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
    <main className="game-shell game-page">
      <section className="game-topbar">
        <div>
          <p className="eyebrow">{isOnline ? `Room ${roomInfo?.roomCode ?? onlineRef.current.roomCode}` : 'React Canvas Game'}</p>
          <h1>坦克大战</h1>
        </div>
        <div className="stats compact-stats" aria-label="游戏状态">
          <span>得分 <strong>{snapshot.score}</strong></span>
          <span>生命 <strong>{snapshot.lives}</strong></span>
          <span>关卡 <strong>{snapshot.level}</strong></span>
          <span>敌军 <strong>{totalEnemies}</strong></span>
        </div>
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
