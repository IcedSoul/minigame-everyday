# Day 6 · 《快乐拼拼豆》核心玩法复刻 · 实现规划

> 系列 Day 6 · 2026-06-05 · 仅设计，不动代码
> 基于用户提供的玩法需求文档 + 截图分析

---

## 〇 为什么是这一款（顺序说明）

按 [01-game-shortlist-and-toolkit](./01-game-shortlist-and-toolkit.md) 的排程，Day 6 原本应是《弹弓物理对战》。但用户根据实际热度调整，将 **《快乐拼拼豆》** 提前到 Day 6。

《快乐拼拼豆》是一款**图案拼图 + 颜色排序**的休闲解谜游戏，核心循环与前几天的"物理/动作"类型完全不同——它考验的是**观察力 + 策略规划**：
- 玩家需要识别二维网格中的**连续同色区域**（Flood Fill）
- 在**暂存槽容量限制**（16 个，分两排）下规划取豆/放豆顺序
- 最终目标是将所有豆的颜色与豆槽目标颜色完全匹配

本作可以**适当引入少量物理引擎逻辑**（Matter.js），用于豆的取出/放入动画中的弹跳、滚动感，但不影响核心逻辑。

---

## 一 玩法定调（基于用户描述与截图分析）

### 1.1 一句话规则

> **图案区域是一个 6×8 的二维网格，每个格子是一个「豆槽」（坑位），有固定的目标颜色。初始时所有豆槽都填满了随机颜色的豆。玩家点击一个豆，会选中该豆所在的连续同色区域（上下左右相邻），将这些豆取出放入底部暂存槽（16 格，分两排，FIFO）。然后点击空位豆槽，从暂存槽头部取出豆放入（仅当颜色匹配时）。目标是将所有豆槽都用正确颜色的豆填满。**

### 1.2 核心规则（必须做对）

#### 规则 1：豆槽与豆

- 每个**豆槽**有固定的 `targetColor`（目标颜色），不可更改
- 每个**豆**有 `beanColor`（当前颜色），可以被移动
- 当 `beanColor === targetColor` 时，该位置"匹配成功"（视觉上可以加高亮/锁死效果）
- 所有位置匹配成功 → 游戏胜利

#### 规则 2：连续同色区域（Flood Fill）

- 在二维网格中，通过**上下左右**相邻连接、且颜色相同的豆组成一个"连续同色区域"
- **点击操作粒度**：每次点击选中的是整个连续同色区域，不是单个豆
- 示例（假设 6×8 网格中的局部）：

```
0 0 0  1 1 1  0 0
0 0 0  1 1 1  0 0
```

- 点击左侧 `0` → 选中整个左侧连通块（6 个豆）
- 点击中间 `1` → 选中中间连通块（6 个豆）

#### 规则 3：取出豆（图案区域 → 暂存槽）

- 取豆**无颜色限制**，任何颜色的豆都可以取出
- 如果选中的豆数量 ≤ 暂存槽剩余容量 → **全部取出**
- 如果选中的豆数量 > 暂存槽剩余容量 → **只取出能容纳的数量**（从连通块边缘开始取），其余不做操作
- 取出后：被取出的豆所在豆槽变为**空位**（`beanColor = null`）
- 暂存槽**满时（16 个）** → 无法取出，提示"暂存槽已满"

#### 规则 4：放置豆（暂存槽 → 图案区域）

- 只能点击**空位豆槽**（`beanColor === null`）来触发放置
- 放置限制：**豆颜色必须与豆槽目标颜色匹配**，否则不能放入（抖动提示）
- 放置数量：从暂存槽**FIFO 头部**取一个豆，尝试放入
- 放置后：豆槽被填充，若颜色匹配则该位置完成

#### 规则 5：暂存槽管理（FIFO，16 格两排）

- 暂存槽**不区分颜色**，所有颜色混存
- 严格按**先进先出（FIFO）**顺序管理
- 最大容量 **16 个豆**，分**两排**显示：
  - 上排：位置 0~7（FIFO 头部在前）
  - 下排：位置 8~15
- 满时无法再取出豆

#### 规则 6：步数统计

- **取豆**算一步
- **放豆**算一步
- 胜利后显示总步数和用时

#### 规则 7：颜色分布规则（可解性保证）

- 使用 **5 种颜色**
- 6×8 = 48 个格子，48/5 = 9.6 → 每种颜色 **9 或 10 个**
- 生成图案时确保**每种颜色的格子数量相近**（最多相差 1）
- **同色格子不要过于聚集**——避免某个颜色的豆槽单独出现（否则无法通过连续区域取出）
- 初始豆的颜色是**随机分配**的，与豆槽目标颜色无关（这样才需要玩家去排序）

### 1.3 与同类游戏的对比

| 游戏 | 与本作的区别 |
|---|---|
| 《羊了个羊》（Day 4） | 三消 + 堆叠遮挡 + 7 槽；本作是颜色排序 + 16 槽 + 连通区域 |
| 《抓大鹅》（Day 5） | 3D 物理 + 陀螺仪；本作是 2D 逻辑解谜，可加少量物理特效 |
| 《Water Sort Puzzle》 | 试管倒颜色，同色聚合；本作是网格 + 连通区域 + FIFO 槽 |
| 《Nonogram/数织》 | 按数字填格子；本作是颜色匹配 + 移动排序 |

---

## 二 MVP 范围与非目标

### 2.1 MVP 必做（Day 6 当天）

- ✅ 6×8 网格图案区域（48 个豆槽）
- ✅ 5 种颜色，每种颜色 9~10 个豆槽（数量相近）
- ✅ 颜色分布算法：确保同色分散、可解
- ✅ 连续同色区域检测（Flood Fill）
- ✅ 点击选中区域 → 高亮显示 → 取出到暂存槽
- ✅ 暂存槽 FIFO 管理（最多 16 个，分两排）
- ✅ 点击空位 → 从暂存槽头部取豆 → 颜色匹配检查 → 放入
- ✅ 所有豆槽匹配完成 → 胜利弹层
- ✅ 步数统计 + 用时统计
- ✅ 重开按钮（重新生成关卡）
- ✅ HUD：关卡名、计时器、暂存槽状态
- ✅ **轻量物理效果**（Matter.js）：豆取出/放入时的弹跳、滚动感

### 2.2 MVP 不做（明确砍掉）

- ❌ 多关卡/难度分级（先做单关，网格固定 6×8）
- ❌ 复杂图案（截图中的心形/动物图案，MVP 用矩形网格）
- ❌ 道具系统（截图中的磁铁/刷子/沙漏）
- ❌ 倒计时限制（截图有 3 分钟倒计时，MVP 只做正计时）
- ❌ 音效
- ❌ 分享/排行榜
- ❌ 撤销操作
- ❌ 动画特效（只做基础 tween + 物理效果，不做粒子）

### 2.3 第二轮（核心循环 OK 后再做）

- 多关卡：不同网格尺寸（8×10 等）
- 复杂图案：非矩形网格（心形、动物轮廓等）
- 道具系统：增加暂存槽容量、自动匹配、提示等
- 倒计时模式：限时挑战
- 步数评级：根据步数给星级评价

---

## 三 技术方案

### 3.1 引擎选型

| 选项 | 评估 | 结论 |
|---|---|---|
| **Phaser 3（CANVAS）+ Matter.js** | 纯 2D 逻辑 + 网格渲染 + Tween 动画 + **轻量物理效果**（弹跳/滚动） | ✅ **本次首选** |
| Babylon.js | 3D 引擎，本作完全不需要 3D | ❌ |
| Cocos Creator | 编辑器形式，本作逻辑简单不需要 | ❌ |
| 原生 Canvas 2D | 可以跑，但缺少 Tween/场景管理，开发效率低 | ❌ |

> **结论：Phaser 3（CANVAS 模式）+ Matter.js（轻量物理）。**
> 
> **物理引擎用途说明**（用户要求"适当引入少量物理引擎逻辑"）：
> 1. 豆的取出动画：豆从网格中"弹跳"出来，有轻微的物理感
> 2. 豆的放入动画：豆"落袋"时有弹跳效果
> 3. **不影响核心逻辑**：Flood Fill、FIFO、颜色匹配等逻辑完全不依赖物理引擎
> 4. Matter.js 是 Phaser 内置的物理引擎，无需额外引入，体积增量可忽略

### 3.2 Phaser 配置（继承 Day 4 脚手架）

```js
{
  type: Phaser.CANVAS,
  parent: 'phaser-example',
  scene: [BootScene, GameScene],
  physics: {
    default: 'matter',
    matter: {
      debug: false,  // MVP 关闭调试视图
      gravity: { y: 0 },  // 2D 游戏，不需要重力
    },
  },
  scale: {
    mode: Phaser.Scale.NONE,
    width: WIDTH,
    height: HEIGHT,
    zoom: 1 / DPR,
  },
  render: {
    pixelArt: false,
    roundPixels: false,
    antialias: true,
  },
  backgroundColor: '#e8e0f0',    // 淡紫灰色（与截图背景接近）
  fps: { target: 60, forceSetTimeOut: true },
}
```

> **注意**：`physics.matter.gravity.y = 0` 是因为本作是 2D 网格游戏，不需要重力。物理引擎只用于**视觉特效**（弹跳、缓动），不用于真实物理模拟。

### 3.3 目录结构（沿用三段式）

```
day-06-beads/
├── game.js                       # 微信小游戏入口
├── game.json                     # 简化配置
├── project.config.json
├── project.private.config.json
├── index.html                    # 网页入口
├── js/
│   ├── main.js                   # Phaser 初始化（拷自 day-04，加 physics 配置）
│   ├── libs/
│   │   ├── phaser.min.js        # 完整版（含 Matter.js）
│   │   ├── weapp-phaser3-adapter.min.js
│   │   └── symbol.js
│   ├── core/
│   │   ├── config.js             # 颜色、网格尺寸、容量常量
│   │   ├── BoardGenerator.js     # 颜色分布算法 + 可解性保证
│   │   └── FloodFill.js          # 连通区域检测
│   └── scene/
│       ├── BootScene.js          # 预加载（本游戏无外部资源，空实现）
│       └── GameScene.js          # 主玩法场景
└── README.md
```

### 3.4 关键数据结构

```js
// ===== 配置常量 =====
const ROWS = 6;                   // 图案区域行数（6 行）
const COLS = 8;                   // 图案区域列数（8 列）
const COLOR_COUNT = 5;            // 颜色种类数
const MAX_HOLDING = 16;          // 暂存槽最大容量（分两排）
const HOLDING_ROWS = 2;         // 暂存槽排数
const HOLDING_COLS = 8;         // 每排列数

// 5 种颜色（柔和配色，与截图风格接近）
const COLORS = [
  { id: 0, hex: 0xff6b6b, name: 'red' },      // 珊瑚红
  { id: 1, hex: 0xffd93d, name: 'yellow' },   // 明黄
  { id: 2, hex: 0x6bcb77, name: 'green' },    // 草绿
  { id: 3, hex: 0x4d96ff, name: 'blue' },     // 天蓝
  { id: 4, hex: 0xff9f45, name: 'orange' },   // 橘橙
];

// ===== 单个豆槽 =====
{
  row: number,
  col: number,
  targetColor: number,      // 豆槽目标颜色（固定）
  beanColor: number | null, // 当前豆的颜色（null = 空位）
  matched: boolean,         // 是否已匹配成功（beanColor === targetColor）
}

// ===== 单个豆（在暂存槽中）=====
{
  color: number,            // 颜色编号
  sourceSlot: { row, col }, // 来源豆槽位置（记录来源）
  body: Matter.Body | null, // Matter.js 物理体（用于轻量物理效果）
}

// ===== 游戏状态 =====
{
  board: Slot[][],          // ROWS × COLS 二维数组
  holding: Bean[],          // 暂存槽 FIFO 队列（最多 16 个）
  holdingBodies: Matter.Body[], // 暂存槽中豆的物理体
  status: 'playing' | 'win',
  steps: number,            // 步数统计
  startTime: number,        // 开始时间戳（毫秒）
  selectedCells: Set,       // 当前选中的连通区域（高亮用）
  isAnimating: boolean,     // 动画锁
}
```

### 3.5 屏幕布局（以 720×1280 逻辑分辨率为参考）

```
┌─────────────────────────────────┐
│  顶部 HUD                        │  y=0~100
│   快乐拼拼豆 · 第1关 · ⏱ 00:00   │
├─────────────────────────────────┤
│                                 │
│      〔 图案区域 6×8 〕          │  y=120~780
│      ┌─┬─┬─┬─┬─┬─┬─┬─┐          │  每个格子约 70×70
│      │ │ │ │ │ │ │ │          │  间距 6px
│      ├─┼─┼─┼─┼─┼─┼─┼─┤          │
│      │ │ │ │ │ │ │ │          │
│      ├─┼─┼─┼─┼─┼─┼─┼─┤          │
│      │ │ │ │ │ │ │ │          │
│      ├─┼─┼─┼─┼─┼─┼─┼─┤          │
│      │ │ │ │ │ │ │ │          │
│      ├─┼─┼─┼─┼─┼─┼─┼─┤          │
│      │ │ │ │ │ │ │ │          │
│      ├─┼─┼─┼─┼─┼─┼─┼─┤          │
│      │ │ │ │ │ │ │ │          │
│      └─┴─┴─┴─┴─┴─┴─┴─┘          │
│                                 │
├─────────────────────────────────┤
│  暂存槽（16 格，两排）           │  y=820~1020
│  ┌─┬─┬─┬─┬─┬─┬─┬─┐          │  上排 8 格
│  │①│②│③│④│⑤│⑥│⑦│⑧│          │  （①是 FIFO 头部）
│  ├─┼─┼─┼─┼─┼─┼─┼─┤          │
│  │⑨│⑩│⑪│⑫│⑬│⑭│⑮│⑯│          │  下排 8 格
│  └─┴─┴─┴─┴─┴─┴─┴─┴─┘          │
├─────────────────────────────────┤
│  [重开]                         │  y=1060~1160
└─────────────────────────────────┘
```

> **暂存槽 FIFO 顺序**：从左到右、从上到下。最左上的①是 FIFO 头部（下一个要被取出的）。新取出的豆放在最右下（尾部）。

### 3.6 豆槽渲染（代码绘制）

每个豆槽用 `Phaser.GameObjects.Container` 包：

```js
function buildSlotSprite(slot, x, y, size) {
  const container = scene.add.container(x, y);
  
  // 1. 豆槽底色（圆角矩形，颜色 = targetColor 的淡色）
  const slotBg = scene.add.graphics();
  slotBg.fillStyle(COLORS[slot.targetColor].hex, 0.3);  // 淡色底
  slotBg.fillRoundedRect(-size/2, -size/2, size, size, 8);
  slotBg.lineStyle(2, COLORS[slot.targetColor].hex, 0.6);
  slotBg.strokeRoundedRect(-size/2, -size/2, size, size, 8);
  
  // 2. 豆（如果有）
  let bean = null;
  if (slot.beanColor !== null) {
    bean = scene.add.graphics();
    bean.fillStyle(COLORS[slot.beanColor].hex, 1);
    bean.fillCircle(0, 0, size * 0.35);
    // 豆的内阴影/高光效果
    bean.fillStyle(0xffffff, 0.3);
    bean.fillCircle(-size*0.1, -size*0.1, size * 0.15);
  }
  
  // 3. 匹配成功标记（锁死效果）
  let lockIcon = null;
  if (slot.matched) {
    lockIcon = scene.add.text(0, 0, '✓', {
      fontSize: `${size * 0.4}px`,
      fill: '#ffffff',
    }).setOrigin(0.5);
  }
  
  // 4. 选中高亮（默认隐藏）
  const highlight = scene.add.graphics();
  highlight.lineStyle(3, 0xffffff, 0.9);
  highlight.strokeRoundedRect(-size/2-2, -size/2-2, size+4, size+4, 10);
  highlight.setVisible(false);
  
  container.add([slotBg, bean, lockIcon, highlight]);
  container.setSize(size, size);
  container.setInteractive();
  container.on('pointerdown', () => onSlotClick(slot));
  
  return { container, bean, highlight };
}
```

### 3.7 核心算法 A：颜色分布算法（可解性保证）

**目标**：生成豆槽的目标颜色分布，满足：
1. 每种颜色数量相近（最多相差 1）
2. 同色格子尽量分散，避免聚集
3. 每个连通区域大小合理（不能所有同色连在一起）

**算法步骤**：

```js
function generateColorDistribution(rows, cols, colorCount) {
  const total = rows * cols;
  const baseCount = Math.floor(total / colorCount);
  const remainder = total % colorCount;
  
  // 1. 计算每种颜色的目标数量
  const colorCounts = [];
  for (let c = 0; c < colorCount; c++) {
    colorCounts.push(baseCount + (c < remainder ? 1 : 0));
  }
  
  // 2. 使用"蛇形填充法"分散颜色
  const board = Array(rows).fill(null).map(() => Array(cols).fill(-1));
  const colorPool = [];
  for (let c = 0; c < colorCount; c++) {
    for (let i = 0; i < colorCounts[c]; i++) colorPool.push(c);
  }
  shuffle(colorPool);
  
  // 3. 按"蛇形"顺序填充，避免相邻同色
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const colsOrder = r % 2 === 0 
      ? range(0, cols) 
      : range(0, cols).reverse();
    for (const c of colsOrder) {
      board[r][c] = colorPool[idx++];
    }
  }
  
  // 4. 后处理：检查并打散过大的连通块
  for (let attempt = 0; attempt < 50; attempt++) {
    let maxRegion = findLargestRegion(board);
    if (maxRegion.size <= 6) break;
    
    // 打散：将连通块边缘的格子与远处不同色格子交换
    const edgeCell = findEdgeCell(maxRegion);
    const swapCell = findDistantCell(board, edgeCell, maxRegion.color);
    if (swapCell) {
      swap(board, edgeCell, swapCell);
    }
  }
  
  return board;
}
```

### 3.8 核心算法 B：Flood Fill（连通区域检测）

```js
function floodFill(board, startRow, startCol) {
  const rows = board.length;
  const cols = board[0].length;
  const targetColor = board[startRow][startCol].beanColor;
  
  if (targetColor === null) return []; // 空位不能取
  
  const visited = new Set();
  const queue = [{r: startRow, c: startCol}];
  const region = [];
  
  while (queue.length > 0) {
    const {r, c} = queue.shift();
    const key = `${r},${c}`;
    if (visited.has(key)) continue;
    visited.add(key);
    
    const slot = board[r][c];
    if (slot.beanColor !== targetColor) continue;
    
    region.push({r, c});
    
    // 上下左右四方向
    const dirs = [[-1,0], [1,0], [0,-1], [0,1]];
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        if (!visited.has(`${nr},${nc}`)) {
          queue.push({r: nr, c: nc});
        }
      }
    }
  }
  
  return region;
}
```

### 3.9 核心算法 C：取豆逻辑（含物理效果）

```js
function onSlotClick(slot) {
  if (gameState.status !== 'playing') return;
  
  // 情况 1：点击有豆的槽 → 尝试取出
  if (slot.beanColor !== null) {
    const region = floodFill(gameState.board, slot.row, slot.col);
    const availableSpace = MAX_HOLDING - gameState.holding.length;
    
    if (region.length > availableSpace) {
      // 暂存槽不够：抖动提示
      showShakeAnimation(slot);
      showToast('暂存槽已满，请先放置');
      return;
    }
    
    // 取出：按 FIFO 顺序加入暂存槽
    const sortedRegion = sortRegionForFIFO(region);
    for (const cell of sortedRegion) {
      const s = gameState.board[cell.r][cell.c];
      gameState.holding.push({
        color: s.beanColor,
        sourceSlot: { r: cell.r, c: cell.c },
      });
      s.beanColor = null;  // 变空位
    }
    
    gameState.steps++;
    playTakeAnimationWithPhysics(sortedRegion);  // 含物理效果
    updateHoldingUI();
    checkWin();
    return;
  }
  
  // 情况 2：点击空槽 → 尝试放入
  if (slot.beanColor === null) {
    if (gameState.holding.length === 0) return;
    
    const bean = gameState.holding[0]; // FIFO 头部
    if (bean.color !== slot.targetColor) {
      // 颜色不匹配：抖动提示
      showShakeAnimation(slot);
      showToast('颜色不匹配');
      return;
    }
    
    // 放入
    gameState.holding.shift();  // 移除头部
    slot.beanColor = bean.color;
    slot.matched = (slot.beanColor === slot.targetColor);
    gameState.steps++;
    playPlaceAnimationWithPhysics(slot, bean);  // 含物理效果
    updateHoldingUI();
    checkWin();
  }
}

// 含物理效果的取出动画
function playTakeAnimationWithPhysics(region) {
  for (const cell of region) {
    const s = gameState.board[cell.r][cell.c];
    const beanSprite = s.sprite.bean;
    
    // 1. 创建 Matter.js 物理体（轻微弹跳）
    const body = scene.matter.add.circle(
      beanSprite.x, beanSprite.y, beanSprite.width * 0.3,
      { restitution: 0.6, friction: 0.1 }
    );
    
    // 2. 给一个向上的冲击力（弹跳效果）
    scene.matter.applyForce(body, { x: 0, y: -0.02 });
    
    // 3. 200ms 后销毁物理体，将豆移入暂存槽
    scene.time.delayedCall(200, () => {
      scene.matter.world.remove(body);
      // 继续执行正常的飞入暂存槽动画...
    });
  }
}
```

### 3.10 核心算法 D：初始豆颜色随机分配

```js
function generateInitialBeans(board, colorCount) {
  // 统计每种 targetColor 的数量
  const targetCounts = countTargetColors(board);
  
  // 生成豆颜色池：确保每种颜色的豆总数 = 该颜色 target 槽数
  // （这样才能保证游戏可解：每种颜色的豆刚好填满对应颜色的槽）
  const beanPool = [];
  for (let c = 0; c < colorCount; c++) {
    for (let i = 0; i < targetCounts[c]; i++) beanPool.push(c);
  }
  shuffle(beanPool);
  
  // 填充到 board 中
  let idx = 0;
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      board[r][c].beanColor = beanPool[idx++];
    }
  }
}
```

> **可解性保证**：每种颜色的豆数量 = 该颜色豆槽数量，所以理论上总是可解的。玩家需要通过 FIFO 暂存槽来重新排列。

### 3.11 核心交互流程（状态机）

```
┌──────────────────────────────────────┐
│  Boot：Phaser 初始化 + Matter.js 物理     │
│  生成颜色分布 → 生成初始豆            │
│  渲染网格 + 暂存槽 UI                 │
└─────────────┬────────────────────────┘
              ▼
┌──────────────────────────────────────┐
│ Playing 主循环                        │
│                                      │
│  事件 1：点击有豆的槽                 │
│    → floodFill 找连通区域             │
│    → 检查暂存槽容量                   │
│    → 够：取出 → 物理弹跳动画          │
│    → 不够：抖动 + "暂存槽已满"        │
│                                      │
│  事件 2：点击空槽                     │
│    → 检查暂存槽头部颜色               │
│    → 匹配：放入 → 物理落袋动画        │
│    → 不匹配：抖动 + "颜色不匹配"      │
│                                      │
│  事件 3：所有槽匹配完成               │
│    → 胜利弹层 + 步数/用时统计         │
└──────────────────────────────────────┘
```

### 3.12 动画设计

| 动画 | 实现 | 时长 |
|---|---|---|
| 选中高亮 | 白色边框闪烁（tween alpha 0.5→1）| 200ms |
| 取豆物理弹跳 | Matter.js 圆形体 + 向上冲击力 + 0.6 弹性 | 200ms |
| 取豆飞入暂存槽 | 豆从原位置缩放到 0.5，移动到暂存槽目标位置 | 300ms |
| 放豆物理落袋 | Matter.js 圆形体 + 向下冲击力 + 0.5 弹性 | 200ms |
| 放豆匹配 | 豆从暂存槽放大到 1.0，落入槽中 + 槽背景闪烁 | 250ms |
| 错误抖动 | 容器 x 坐标 ±5px 快速摆动 | 200ms |
| 胜利庆祝 | 所有槽依次闪烁 + 文字弹出 | 800ms |

### 3.13 微信小游戏适配（沿用 Day 4 结论）

1. ✅ `Phaser.CANVAS`（不要 WEBGL）
2. ✅ viewport 用 `wx.getSystemInfoSync()`
3. ✅ 不开 `zoom`
4. ✅ `game.json` 去掉 `workers` / `subPackages`
5. ✅ 不用 DOM API
6. ✅ 触控事件：Phaser 内置 `pointerdown` 已适配
7. ⚠️ **新坑**：Matter.js 在微信小游戏环境需要 `phaser.min.js`（完整版，含 Matter.js），不能用精简版

---

## 四 性能预算

| 维度 | 评估 | 风险 |
|---|---|---|
| 网格大小 | 6×8 = 48 个格子 | 低 |
| 每帧渲染对象 | ~100（格子 + 豆 + UI + 物理调试） | 低 |
| Flood Fill 复杂度 | O(N)，N=48 | 极低 |
| 物理体数量 | 最多 16 个（暂存槽中）| 低 |
| 动画并发 | 最多 16 个豆同时飞入暂存槽 | 中 |

> 本作逻辑轻，性能瓶颈可能在**物理效果**。MVP 阶段物理效果只用于视觉特效，不涉及复杂碰撞，性能可控。

---

## 五 素材清单（Day 6 第一轮 0 外部素材）

| 类型 | 资源 | MVP 处理 |
|---|---|---|
| 豆槽底 | 圆角矩形 + 目标色淡底 | Graphics 代码绘制 |
| 豆 | 圆形 + 颜色 + 高光 | Graphics 代码绘制 |
| 暂存槽 | 圆角矩形网格（两排） | Graphics 代码绘制 |
| HUD 背景 | 半透明条 | Graphics 代码绘制 |
| 按钮 | 圆角矩形 + 文字 | Graphics + Text |
| 失败/胜利弹层 | 半透明遮罩 + 文字 | Graphics + Text |

> **第二轮**：用 AI 生成豆的精美图标（带 3D 质感），替换纯色圆形。

---

## 六 实现步骤（当天执行计划）

| # | 阶段 | 内容 | 预估 |
|---|---|---|---|
| 1 | 脚手架 | 拷贝 day-04 整体结构改名 day-06-beads；改 game.json / project.config.json；替换 phaser.min.js 为完整版（含 Matter.js） | 20 min |
| 2 | 配置常量 | `core/config.js`：颜色、网格尺寸（6×8）、容量（16）| 10 min |
| 3 | 颜色分布算法 | `core/BoardGenerator.js`：分散颜色 + 可解性保证 | 40 min |
| 4 | Flood Fill | `core/FloodFill.js`：四方向连通区域检测 | 20 min |
| 5 | 网格渲染 | `GameScene.js`：豆槽 + 豆 + 空位渲染 | 30 min |
| 6 | 取豆逻辑 + 物理 | 点击 → Flood Fill → 容量检查 → 取出 → 物理弹跳动画 → 飞入暂存槽 | 50 min |
| 7 | 放豆逻辑 + 物理 | 点击空槽 → FIFO 头部颜色检查 → 放入 → 物理落袋动画 | 40 min |
| 8 | 暂存槽 UI | 底部 16 格（两排）+ FIFO 可视化 | 30 min |
| 9 | 胜负判定 | 全匹配检测 + 胜利弹层 + 步数/用时统计 | 20 min |
| 10 | HUD + 重开 | 关卡名、计时器、重开按钮 | 15 min |
| 11 | 微信预览 | run_game / get_logs / 修复兼容问题 | 30 min |
| 12 | 调优 | 动画手感、物理效果强度、颜色搭配、可解性验证 | 30 min |

> **总计**：≈ 6 小时（比 Day 4 多 1 小时，因为加了 Matter.js 物理效果）

---

## 七 验收标准

Day 6 的产出必须同时满足：

- [ ] 微信开发者工具 / weixin-minigame-helper 预览端能跑（无报错日志）
- [ ] 6×8 网格正确渲染，48 个豆槽颜色分布均匀
- [ ] 初始豆颜色随机但**保证可解**（每种颜色豆数 = 该颜色槽数）
- [ ] 点击有豆的槽 → 正确选中整个连通同色区域（高亮显示）
- [ ] 取豆成功 → 豆有物理弹跳动画，然后飞入暂存槽，原位置变空
- [ ] 暂存槽满时（16 个）→ 点击取豆提示"暂存槽已满"
- [ ] 点击空槽 → 从暂存槽 FIFO 头部取豆，颜色匹配则放入（有物理落袋动画）
- [ ] 颜色不匹配 → 提示"颜色不匹配"
- [ ] 所有槽匹配完成 → 胜利弹层，显示步数和用时
- [ ] 重开按钮能重新生成关卡
- [ ] 代码结构与 Day 4 对齐（core/scene/libs 三段式）
- [ ] Matter.js 物理效果正常运行（无报错）

---

## 八 已识别的坑与对策

| # | 坑 | 对策 |
|---|---|---|
| 1 | 颜色分布过于聚集，导致某个连通块太大 | 用"蛇形填充 + 后处理打散"算法 |
| 2 | 初始豆随机导致无解 | 保证每种颜色豆数 = 该颜色槽数，理论上必可解 |
| 3 | 暂存槽 16 个容量不够完成排序 | 通过颜色分布算法控制连通块大小 ≤ 8，确保单步取出量 ≤ 暂存槽一半 |
| 4 | Flood Fill 选中区域后玩家不知道哪些会被取走 | 高亮选中区域，并在暂存槽上方显示"取出 X 个"提示 |
| 5 | FIFO 顺序玩家不好理解 | 暂存槽 UI 按顺序排列，头部（下一个要出的）用箭头标识 |
| 6 | 动画期间点击导致状态错乱 | 加 `isAnimating` 锁，动画期间忽略点击 |
| 7 | 颜色对色盲玩家不友好 | 5 种颜色选择色相差异大的（红/黄/绿/蓝/橙），且形状略有差异 |
| 8 | 网格在手机上太小不好点 | 适配计算：格子大小 = min(屏幕宽/8, 屏幕高/10) × 0.85 |
| 9 | Matter.js 物理效果在微信小游戏环境报错 | 使用 `phaser.min.js` 完整版（含 Matter.js），不要用精简版 |
| 10 | 物理效果太强/太弱，影响游戏体验 | 提供"物理效果强度"参数（0~1），MVP 阶段设为 0.5 |

---

## 九 关键设计决策（已确认）

| # | 决策点 | 最终方案 | 说明 |
|---|---|---|---|
| 1 | 引擎 | **Phaser 3 + Matter.js（轻量物理）** | 用户要求"适当引入少量物理引擎逻辑"，用于视觉特效 |
| 2 | 网格尺寸 | **6×8 = 48 格** | 用户明确指定 |
| 3 | 颜色数 | **5 种** | 用户文档明确 |
| 4 | 暂存槽容量 | **16 个（分两排，每排 8 个）** | 用户明确指定 |
| 5 | 连通方向 | **四方向（上下左右）** | 用户文档明确，不含对角 |
| 6 | 初始豆分配 | **完全随机（保证可解）** | 每种颜色豆数 = 该颜色槽数 |
| 7 | 计时方式 | **正计时（非倒计时）** | MVP 简化，截图有倒计时但先不做 |
| 8 | 关卡系统 | **单关，固定 6×8** | MVP 不做多关卡 |

---

## 十 与 Day 4 的代码复用清单

### 可以直接复用

- ✅ `js/main.js`（Phaser 初始化、viewport 适配）—— **需加 physics 配置**
- ✅ `js/libs/phaser.min.js` —— **需替换为完整版（含 Matter.js）**
- ✅ `js/libs/weapp-phaser3-adapter.min.js`
- ✅ `js/libs/symbol.js`
- ✅ `index.html`
- ✅ `game.js` / `game.json`（改项目名）
- ✅ `project.config.json` / `project.private.config.json`
- ✅ Day 4 的"逻辑坐标 + uiScale 缩放"模板
- ✅ Day 4 的 `endGame()` 弹层逻辑结构

### 需要重写

- ❌ 关卡生成（颜色分布 + 连通块控制，全新算法）
- ❌ 游戏主循环（取豆/放豆 vs 点击入槽三消）
- ❌ 渲染（豆槽/豆/暂存槽 vs 卡片堆叠）
- ❌ 交互逻辑（Flood Fill + FIFO vs 遮挡判定 + 聚合排序）
- ❌ 物理效果（Matter.js 弹跳/落袋动画，全新）

---

## 十一 实现状态

- ✅ **2026-06-05 设计完成** · 用户确认 6×8 网格 + 16 格暂存槽（两排）+ Matter.js 物理效果
- ⏭ 实现 day-06-beads
- ⏭ 写复盘文章 `articles/06-day-beads.md`

---

## 附录 A：玩法术语对照表

| 中文 | 英文 | 说明 |
|---|---|---|
| 豆槽 | slot / cell | 网格中的固定位置，有目标颜色 |
| 豆 | bean | 可移动的颜色块 |
| 连续同色区域 | connected component / region | 上下左右相邻的同色豆组成的连通块 |
| 暂存槽 | holding tray / buffer | 底部 FIFO 队列，最多 16 个（两排） |
| 目标颜色 | target color | 豆槽固定的期望颜色 |
| 取出 | pick / take | 从图案区域移到暂存槽 |
| 放置 | place / drop | 从暂存槽移到空位豆槽 |
| 物理弹跳 | physics bounce | Matter.js 实现的取出动画效果 |
| 物理落袋 | physics drop | Matter.js 实现的放入动画效果 |
