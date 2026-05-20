# 坦克大战 🕹️

这是一个使用 React + Canvas 构建的像素风网页版坦克大战。玩家需要守住基地、击毁敌军，并在随机生成的战场中通过多轮进攻。🎮

![坦克大战截图](docs/game-screenshot.png)

## 功能特性 ✨

- 像素风游戏菜单和坦克交战背景动画
- 基于 HTML Canvas 的游戏循环 ⚙️
- 玩家移动、瞄准和开火 💥
- 基于 WebSocket 的双人合作房间 🤝
- 支持通过互联网或局域网使用房间码/邀请链接加入 🌐
- 敌军坦克生成、移动、追击和射击
- 每局随机生成地图 🧱
- 基地外围固定防护 🛡️
- 可配置敌军数量、坦克速度和炮弹速度
- 支持砖墙、钢墙、得分、生命、关卡、暂停和重开

## 技术栈 🧰

- React
- Vite
- HTML Canvas
- CSS 动画
- Node.js WebSocket 服务端

## 快速开始 🚀

安装依赖：

```bash
npm install
```

启动前端开发服务器：

```bash
npm run dev
```

然后打开：

```text
http://localhost:5173/
```

如果要使用联机房间，请在另一个终端启动实时房间服务：

```bash
npm run server
```

本地开发时，浏览器默认会连接 `ws://<当前主机>:8787`。同一局域网内的好友可以通过你的局域网 IP 和房间码加入。

## 可用脚本 📜

```bash
npm run dev
```

启动 Vite 前端开发服务器。

```bash
npm run build
```

构建生产版本，输出到 `dist/` 目录。

```bash
npm run server
```

启动 WebSocket 房间服务，默认监听 `0.0.0.0:8787`。

```bash
npm run dev:server
```

以 watch 模式启动 WebSocket 房间服务，适合服务端开发调试。

```bash
npm run preview
```

本地预览生产构建结果。

## 操作方式 🎯

- `WASD` 或方向键：移动
- `Space`：开火 🔥
- `Enter`：开始游戏，或在结束后重新开始
- `P`：暂停/继续

## 游戏设置 ⚙️

在菜单页点击 **设置** 可以调整：

- 敌军数量
- 坦克速度
- 炮弹速度

设置会在新一局游戏开始时生效。

## 联机房间 🌐

在菜单页点击 **联机对战** 可以创建房间或输入房间码加入。当前联机模式为双人合作：

- 两名玩家共同守护同一个基地
- 共享得分、生命、关卡和敌军波次
- 满 2 人后自动开始游戏
- 玩家断线时房间会暂停，短时间内可重连

互联网联机需要同时部署：

- 前端：Netlify
- 实时服务端：Render 或其他支持 WebSocket 的平台

Netlify 需要配置以下环境变量：

```text
VITE_WS_URL=wss://tank-battle-realtime.onrender.com
```

本项目已包含 `render.yaml`，可作为 Render Web Service 的部署配置。🚀

## 线上服务

- 前端站点：https://vsszhang-tank.netlify.app
- WebSocket 服务：`wss://tank-battle-realtime.onrender.com`
- 服务健康检查：https://tank-battle-realtime.onrender.com/health
