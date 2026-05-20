# 联机功能技术说明

本文从技术角度说明本项目的双人联机功能设计，以及本地、局域网和互联网部署时需要如何配置。

## 架构设计

联机功能采用“服务端权威”的 WebSocket 架构。

- React/Vite 前端负责菜单、房间 UI、键盘输入采集和 Canvas 渲染。
- Node.js WebSocket 服务端负责房间状态、游戏模拟、碰撞、AI、子弹、计分和胜负判断。
- 游戏核心规则抽离在 `src/gameEngine.js`，前端和服务端复用同一套地图生成、移动、碰撞、敌军和状态模型。
- 前端仍然是静态站点，可部署到 Netlify；实时 WebSocket 服务必须单独部署到 Render、VPS 或本机。

核心流程：

```text
浏览器 A -> createRoom -> WebSocket 服务端
服务端 -> roomCreated + snapshot -> 浏览器 A
浏览器 B -> joinRoom(roomCode) -> WebSocket 服务端
服务端 -> joined + snapshot -> 两个浏览器
两个浏览器 -> input 消息 -> 服务端
服务端 -> 20Hz 权威快照 -> 两个浏览器
```

## 运行组件

### 前端

入口文件：`src/main.jsx`

职责：

- 展示菜单、设置、联机房间弹窗和游戏画布。
- 创建房间或加入房间。
- 在 `localStorage` 中保存 `playerToken`，用于短时间重连。
- 联机时只向服务端发送输入，不在本地推进权威游戏状态。
- 接收服务端 `snapshot` 后绘制最新游戏画面。

前端按以下优先级选择 WebSocket 地址：

1. 构建环境变量 `VITE_WS_URL`。
2. 如果没有配置，则回退到 `ws://<当前主机>:8787`，用于本地或局域网开发。

### 共享游戏引擎

文件：`src/gameEngine.js`

职责：

- 地图尺寸、瓦片尺寸、坦克尺寸、基地位置和默认设置等常量。
- 随机地图生成。
- 基地固定防护和玩家/敌军出生点保护。
- 坦克移动、墙体碰撞和坦克碰撞。
- 炮弹移动和命中检测。
- 敌军生成、移动、开火和追踪目标。
- 得分、生命、关卡、胜负状态和特效。
- 前端 Canvas 绘制所需的数据结构和绘制函数。

联机模式固定为两名玩家：

- `P1` 出生在基地左侧安全位置。
- `P2` 出生在基地右侧安全位置。
- 两名玩家共享得分、生命、关卡和敌军波次。

### WebSocket 服务端

文件：`server/index.js`

职责：

- 默认监听 `0.0.0.0:8787`。
- 提供 `/health` 健康检查接口，方便 Render 判断服务是否启动成功。
- 使用 `nanoid` 创建 6 位房间码。
- 将活跃房间保存在内存中。
- 每 50ms 推进一次游戏状态，即 20Hz。
- 将权威 `snapshot` 广播给房间内玩家。
- 玩家断线时暂停房间。
- 通过浏览器本地 `playerToken` 支持短时间重连。
- 玩家断线 2 分钟后释放该玩家位置。
- 房间无人连接 5 分钟后自动清理。

注意：房间数据只保存在内存里，服务端重启会清空所有房间。

## WebSocket 协议

所有消息均为 JSON。

### 客户端发送给服务端

创建房间：

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

加入房间：

```json
{
  "type": "joinRoom",
  "roomCode": "ABC123",
  "playerToken": "local-browser-token"
}
```

发送输入：

```json
{
  "type": "input",
  "keys": ["up", "left"],
  "fire": true
}
```

重开房间：

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

离开房间：

```json
{
  "type": "leaveRoom"
}
```

### 服务端发送给客户端

房间创建成功：

```json
{
  "type": "roomCreated",
  "roomCode": "ABC123",
  "slot": 0,
  "players": []
}
```

加入成功：

```json
{
  "type": "joined",
  "roomCode": "ABC123",
  "slot": 1,
  "players": []
}
```

游戏快照：

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

错误：

```json
{
  "type": "error",
  "message": "房间不存在"
}
```

`snapshot.game` 是完整权威游戏状态，包含地图块、玩家、敌军、炮弹、特效、得分、生命、关卡、波次进度和当前状态。

## 本地开发

安装依赖：

```bash
npm install
```

启动前端：

```bash
npm run dev
```

另开一个终端启动 WebSocket 服务端：

```bash
npm run server
```

打开：

```text
http://localhost:5173/
```

单机双窗口测试方式：

1. 在第一个浏览器窗口创建房间。
2. 在第二个浏览器窗口输入房间码加入。
3. 两人满员后房间会自动开始。

## 局域网联机

同一 Wi-Fi 或局域网内的设备可以直接连接本机服务。

1. 主机运行 `npm run dev`。
2. 主机运行 `npm run server`。
3. 其他设备打开 Vite 显示的 Network 地址，例如：

```text
http://192.168.100.23:5173/
```

此时前端会自动连接：

```text
ws://192.168.100.23:8787
```

如果其他设备无法加入，检查：

- 主机防火墙是否允许端口 `5173` 和 `8787` 的入站连接。
- 两台设备是否在同一网络。
- 访问地址是否使用局域网 IP，而不是 `localhost`。

## 互联网部署

Netlify 只能托管静态前端，不能承载这个长期运行的 WebSocket 服务。因此互联网联机需要前后端分开部署。

推荐部署方式：

- 前端：Netlify
- 实时服务端：Render Web Service

当前线上配置：

```text
前端：https://vsszhang-tank.netlify.app
WebSocket：wss://tank-battle-realtime.onrender.com
健康检查：https://tank-battle-realtime.onrender.com/health
```

### 部署 WebSocket 服务到 Render

仓库内已包含 `render.yaml`：

```yaml
services:
  - type: web
    name: tank-battle-realtime
    runtime: node
    plan: free
    buildCommand: npm install
    startCommand: npm run server
```

Render 创建服务后会提供一个 HTTPS 地址，例如：

```text
https://tank-battle-realtime.onrender.com
```

前端 WebSocket 地址应写成：

```text
wss://tank-battle-realtime.onrender.com
```

### 配置 Netlify

在 Netlify 站点环境变量中配置：

```text
VITE_WS_URL=wss://tank-battle-realtime.onrender.com
```

然后重新部署 Netlify 前端。

注意：`VITE_WS_URL` 会在 Vite 构建时写入前端包，所以修改环境变量后必须重新构建/部署。

如果没有配置 `VITE_WS_URL`，生产环境会回退到：

```text
wss://vsszhang-tank.netlify.app:8787
```

这个地址在 Netlify 静态托管下不可用，因为 Netlify 并没有在该端口运行 WebSocket 服务。

## 运行与维护说明

- 服务端只在内存中保存活跃房间。
- 服务端重启会让所有当前房间失效。
- 当前没有账号系统。
- 重连依赖浏览器本地保存的 `playerToken`，不是用户身份认证。
- 房间码用于轻量好友联机，不是安全私密房间凭证。
- 同一玩家位只允许一个活跃连接；重连会替换旧 socket。
- 服务端以 20Hz 广播快照，优先保证状态一致性，暂未做客户端预测。

## 常用命令

```bash
npm run dev
```

启动 Vite 前端。

```bash
npm run server
```

启动实时 WebSocket 服务。

```bash
npm run dev:server
```

以 watch 模式启动实时服务。

```bash
npm run build
```

构建前端生产版本。

```bash
VITE_WS_URL=wss://tank-battle-realtime.onrender.com npm run build
```

使用生产 WebSocket 地址构建前端。
