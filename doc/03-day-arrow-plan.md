
# Day 3 · 《一箭又一箭》核心玩法复刻 · 实现规划

> 系列 Day 3 · 2026-05-27 · 仅设计，不动代码
> 基于用户口述玩法 + 同类游戏调研（Arrow Puzzle / Arrow Escape / Arrows Tap Away）

---

## 一 玩法定调（基于用户描述与调研）

### 1.1 一句话规则

> **在 m×n 的点阵网格上，散布着多条不等长度的线段箭头（由连续网格点连接而成，可直可弯，蛇形排列）。点击任意线段，该线段整体沿箭头方向像贪吃蛇一样逐格前进；若箭头撞到其它线段则变红退回原位（记一次失败），若箭头顺利移出网格边界则消除成功。三次失败或倒计时结束则游戏失败；所有线段消除则胜利。**

### 1.2 六条核心规则

#### 规则 1：点阵网格
- 游戏区域是 m×n 的矩阵式点阵（如 7×9）
- 两个相邻点之间的距离为固定单位 `CELL_SIZE`
- 线段只能沿水平或垂直方向连接相邻点（不走对角线）

#### 规则 2：线段箭头的构成
- 每条线段由 2~5 个连续网格点组成（长度不等）
- 线段可以是直线，也可以拐弯（L 形、S 形等），但必须是连续相邻点的链
- 每条线段有且仅有一个方向（上/下/左/右），用箭头表示
- 箭头方向不一定与线段形状方向一致（箭头指向线段移动的方向）

#### 规则 3：点击移动（贪吃蛇动画）
- 点击一条线段，线段整体沿箭头方向逐格前进
- 移动方式类似贪吃蛇：头部先向前移动一格，然后身体跟随，尾部最后离开原位
- 每移动一格有流畅的补间动画（约 80~120ms/格）
- 线段移动过程中，头部每到达一个新格子就检测碰撞

#### 规则 4：碰撞与退回
- 如果箭头（头部）移动到的下一个格子被其它线段占据 → 碰撞
- 碰撞时：线段变红色，播放退回动画（反向移动回原位），记一次失败
- 移动过程中如果头部到达网格边界外 → 消除成功
- 消除时：线段逐格移出边界，每格离开后该格变为空

#### 规则 5：失败与胜利条件
- 最多允许 3 次碰撞失败，第 3 次失败后游戏结束
- 从第一次点击开始倒计时（如 60 秒），时间耗尽游戏失败
- 所有线段全部消除 → 游戏胜利

#### 规则 6：关卡生成保证有解
- 所有线段每次游戏随机生成
- 必须保证不存在互相锁死的情况（即一定存在某个点击顺序可以消除所有线段）
- 使用"逆向生成 + 贪心验证"算法确保可解性

### 1.3 与同类游戏的对比

| 游戏 | 核心区别 |
|---|---|
| Arrow Puzzle (arrowpuzzle.org) | 箭头是单格的，点击后直接飞出；无蛇形移动动画 |
| Arrows (SERAP-KEREM) | 线段前进时尾部逐渐消失；碰撞扣生命 |
| Arrow Jam Go | 类似但有更多道具和特殊机制 |
| **一箭又一箭** | **蛇形多格线段 + 贪吃蛇式逐格前进动画 + 碰撞退回 + 倒计时** |

---

## 二 MVP 范围与非目标

### 2.1 MVP 必做（Day 3 当天）

- ✅ 7×9 点阵网格（可配置）
- ✅ 随机生成 8~12 条线段（长度 2~5 格，可直可弯）
- ✅ 每条线段有颜色区分 + 箭头方向指示
- ✅ 点击线段 → 贪吃蛇式逐格前进动画
- ✅ 碰撞检测 → 变红 + 退回动画 + 失败计数
- ✅ 成功移出边界 → 逐格消失动画
- ✅ 3 次失败 / 倒计时结束 → 游戏失败
- ✅ 全部消除 → 游戏胜利
- ✅ 关卡随机生成 + 可解性验证
- ✅ 胜利/失败弹层 + 一键重开

### 2.2 MVP 不做（明确砍掉）

- ❌ 多关卡 / 难度递增系统
- ❌ 道具系统（提示、撤销等）
- ❌ 音效
- ❌ 精美素材（用代码绘制即可）
- ❌ 排行榜 / 分享
- ❌ 教学关卡

---

## 三 技术方案

### 3.1 引擎选型

| 选项 | 评估 | 结论 |
|---|---|---|
| Phaser 3 + 无物理 | 纯逻辑网格游戏，不需要物理引擎；用 Tween 做动画即可 | ✅ **本次首选** |
| Phaser 3 + Arcade | 过度设计，网格移动不需要连续物理 | ❌ |
| Phaser 3 + Matter | 完全不需要 | ❌ |

> **结论：纯 Phaser 3 + Tween 动画，不启用任何物理引擎。** 这是一个纯逻辑 + 动画的网格游戏，所有碰撞判定基于网格坐标，不需要连续物理模拟。

### 3.2 Phaser 配置

```js
{
  type: Phaser.CANVAS,           // 微信小游戏兼容
  physics: { default: false },   // 不启用物理引擎
  scale: { mode: Phaser.Scale.NONE, width: WIDTH, height: HEIGHT },
  fps: { target: 60, forceSetTimeOut: true },
  backgroundColor: '#1a1a2e',    // 深色背景
}
```

### 3.3 目录结构

```
day-03-arrow/
├── game.js                       # 微信小游戏入口
├── game.json                     # 简化配置
├── project.config.json
├── project.private.config.json
├── index.html                    # 网页入口
├── js/
│   ├── main.js                   # Phaser 初始化
│   ├── libs/
│   │   ├── phaser.min.js
│   │   ├── weapp-phaser3-adapter.min.js
│   │   └── symbol.js
│   ├── core/
│   │   ├── config.js             # 网格尺寸、颜色、动画时长等常量
│   │   └── LevelGenerator.js    # 关卡随机生成 + 可解性验证
│   └── scene/
│       └── GameScene.js          # 主玩法场景
└── types/
    └── phaser.d.ts
```

### 3.4 关键数据结构

```js
// ===== 配置常量 =====
const GRID_COLS = 7;              // 网格列数
const GRID_ROWS = 9;              // 网格行数
const CELL_SIZE = 44;             // 格子间距（像素）
const DOT_RADIUS = 3;            // 网格点半径
const ARROW_COLORS = [
  '#e63946', '#f4a261', '#2a9d8f',
  '#457b9d', '#9b5de5', '#e76f51',
  '#06d6a0', '#118ab2'
];
const MOVE_DURATION = 100;        // 每格移动时长 ms
const MAX_FAILURES = 3;           // 最大失败次数
const COUNTDOWN_SECONDS = 60;     // 倒计时秒数
const MIN_ARROWS = 8;             // 最少线段数
const MAX_ARROWS = 12;            // 最多线段数
const MIN_LENGTH = 2;             // 线段最短长度
const MAX_LENGTH = 5;             // 线段最长长度

// ===== 方向枚举 =====
const DIR = {
  UP:    { dx: 0, dy: -1, label: '↑' },
  DOWN:  { dx: 0, dy: 1,  label: '↓' },
  LEFT:  { dx: -1, dy: 0, label: '←' },
  RIGHT: { dx: 1, dy: 0,  label: '→' },
};

// ===== 单条线段箭头 =====
{
  id: number,                     // 唯一标识
  segments: [{x, y}],            // 占据的网格坐标数组（有序，[0]=尾部，[last]=头部）
  direction: DIR,                 // 箭头方向（移动方向）
  color: string,                  // 颜色
  state: 'idle' | 'moving' | 'retreating' | 'exiting' | 'removed',
  graphics: Phaser.GameObjects.Graphics,  // 渲染对象
}

// ===== 全局游戏状态 =====
{
  arrows: Arrow[],                // 所有线段
  grid: number[][],               // m×n 网格，值为 arrow.id 或 0（空）
  failures: number,               // 当前失败次数
  countdown: number,              // 剩余秒数
  status: 'playing' | 'win' | 'lose',
  isAnimating: boolean,           // 是否有动画正在播放（锁定输入）
}
```

### 3.5 网格坐标系与渲染

```
屏幕布局（以 390×844 为例）：

  ┌─────────────────────────────────┐
  │  HUD: ❤❤❤  ⏱ 00:45            │  y=0~60
  ├─────────────────────────────────┤
  │                                 │
  │     ·  ·  ·  ·  ·  ·  ·       │
  │     ·  ·  ·  ·  ·  ·  ·       │
  │     ·  ·  ·  ·  ·  ·  ·       │
  │     ·  ·  ·  ·  ·  ·  ·       │  游戏区域
  │     ·  ·  ·  ·  ·  ·  ·       │  7列 × 9行
  │     ·  ·  ·  ·  ·  ·  ·       │
  │     ·  ·  ·  ·  ·  ·  ·       │
  │     ·  ·  ·  ·  ·  ·  ·       │
  │     ·  ·  ·  ·  ·  ·  ·       │
  │                                 │
  ├─────────────────────────────────┤
  │  [重新开始]                     │  y=780~844
  └─────────────────────────────────┘

坐标转换：
  screenX = GRID_OFFSET_X + col * CELL_SIZE
  screenY = GRID_OFFSET_Y + row * CELL_SIZE
  
  GRID_OFFSET_X = (WIDTH - (GRID_COLS - 1) * CELL_SIZE) / 2
  GRID_OFFSET_Y = 80 + (GAME_AREA_HEIGHT - (GRID_ROWS - 1) * CELL_SIZE) / 2
```

### 3.6 线段渲染方案

每条线段用 **1 个 Graphics 对象** 绘制：

```js
function drawArrow(arrow) {
  const g = arrow.graphics;
  g.clear();
  
  // 1. 绘制线段主体（圆角粗线连接各段）
  g.lineStyle(CELL_SIZE * 0.6, arrow.color, 1);
  g.beginPath();
  for (let i = 0; i < arrow.segments.length; i++) {
    const {x, y} = gridToScreen(arrow.segments[i]);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.strokePath();
  
  // 2. 在每个节点画圆形端点（让拐弯处圆滑）
  g.fillStyle(arrow.color, 1);
  for (const seg of arrow.segments) {
    const {x, y} = gridToScreen(seg);
    g.fillCircle(x, y, CELL_SIZE * 0.3);
  }
  
  // 3. 在头部画箭头三角形
  drawArrowHead(g, arrow);
}
```

**性能优化**：
- 线段不动时不重绘（只在状态变化时重绘）
- 使用 `generateTexture` 预生成箭头三角形纹理
- 网格点用 1 个共享 Graphics 一次性绘制所有点

### 3.7 核心算法

#### A. 贪吃蛇式移动算法

```js
// 线段向箭头方向移动一格
function moveOneStep(arrow) {
  const head = arrow.segments[arrow.segments.length - 1];
  const newHead = {
    x: head.x + arrow.direction.dx,
    y: head.y + arrow.direction.dy
  };
  
  // 检测：新头部是否出界？
  if (isOutOfBounds(newHead)) {
    // 头部已出界，进入"退出"模式
    arrow.segments.push(newHead);  // 头部移出
    arrow.segments.shift();         // 尾部缩进
    return 'exiting';
  }
  
  // 检测：新头部是否碰到其它线段？
  if (grid[newHead.y][newHead.x] !== 0 && grid[newHead.y][newHead.x] !== arrow.id) {
    return 'blocked';
  }
  
  // 正常移动：头部前进，尾部跟随
  arrow.segments.push(newHead);
  const oldTail = arrow.segments.shift();
  
  // 更新网格占位
  grid[newHead.y][newHead.x] = arrow.id;
  grid[oldTail.y][oldTail.x] = 0;
  
  return 'moving';
}
```

#### B. 移动动画流程（Tween Chain）

```js
async function animateMove(arrow) {
  arrow.state = 'moving';
  isAnimating = true;
  
  while (true) {
    const result = moveOneStep(arrow);
    
    if (result === 'blocked') {
      // 碰撞：变红 + 退回
      arrow.state = 'retreating';
      await playCollisionEffect(arrow);
      await animateRetreat(arrow);
      arrow.state = 'idle';
      failures++;
      break;
    }
    
    if (result === 'exiting') {
      arrow.state = 'exiting';
      // 继续移动直到所有段都出界
      await tweenOneStep(arrow);
      if (arrow.segments.every(s => isOutOfBounds(s))) {
        arrow.state = 'removed';
        break;
      }
      continue;
    }
    
    // 正常移动一格的动画
    await tweenOneStep(arrow);
  }
  
  isAnimating = false;
  checkWinLose();
}
```

#### C. 碰撞退回动画

```js
async function animateRetreat(arrow) {
  // 将线段从当前位置（碰撞位置）退回到原始位置
  // 使用保存的 originalSegments 做反向 tween
  const originalSegments = arrow.savedSegments; // 移动前保存的
  
  // 先把网格占位恢复
  for (const seg of arrow.segments) {
    if (!isOutOfBounds(seg)) grid[seg.y][seg.x] = 0;
  }
  for (const seg of originalSegments) {
    grid[seg.y][seg.x] = arrow.id;
  }
  
  // 播放退回动画（整体平移回原位）
  arrow.segments = [...originalSegments];
  await tween({ duration: 300, ease: 'Back.easeOut' });
  
  // 恢复颜色
  arrow.color = arrow.originalColor;
  redrawArrow(arrow);
}
```

#### D. 关卡生成算法（逆向构造 + 贪心验证）

这是最核心的算法，必须保证生成的关卡一定有解。

**策略：逆向放置法**

```js
function generateLevel(cols, rows, arrowCount) {
  let attempts = 0;
  
  while (attempts < 100) {
    attempts++;
    const grid = createEmptyGrid(cols, rows);
    const arrows = [];
    
    // 第一步：逐条放置线段
    for (let i = 0; i < arrowCount; i++) {
      const arrow = tryPlaceArrow(grid, cols, rows);
      if (!arrow) break;  // 放不下了
      arrows.push(arrow);
    }
    
    if (arrows.length < arrowCount) continue;
    
    // 第二步：为每条线段分配方向（确保头部朝向边界方向有出路）
    assignDirections(arrows, grid, cols, rows);
    
    // 第三步：验证可解性（贪心模拟）
    if (verifySolvable(arrows, grid, cols, rows)) {
      return arrows;
    }
  }
  
  // 降级：减少线段数量重试
  return generateLevel(cols, rows, arrowCount - 1);
}
```

**放置单条线段：**

```js
function tryPlaceArrow(grid, cols, rows) {
  // 随机选择起点（空格子）
  // 从起点开始随机游走（上下左右），每步检查目标格是否为空
  // 游走 2~5 步形成线段
  
  for (let attempt = 0; attempt < 50; attempt++) {
    const startX = randInt(0, cols - 1);
    const startY = randInt(0, rows - 1);
    if (grid[startY][startX] !== 0) continue;
    
    const length = randInt(MIN_LENGTH, MAX_LENGTH);
    const segments = [{x: startX, y: startY}];
    
    for (let step = 1; step < length; step++) {
      const neighbors = getEmptyNeighbors(segments[segments.length - 1], grid, cols, rows);
      // 排除已在当前线段中的格子
      const valid = neighbors.filter(n => !segments.some(s => s.x === n.x && s.y === n.y));
      if (valid.length === 0) break;
      segments.push(valid[randInt(0, valid.length - 1)]);
    }
    
    if (segments.length >= MIN_LENGTH) {
      // 标记网格
      const id = nextId++;
      for (const seg of segments) grid[seg.y][seg.x] = id;
      return { id, segments };
    }
  }
  return null;
}
```

**方向分配策略：**

```js
function assignDirections(arrows, grid, cols, rows) {
  for (const arrow of arrows) {
    const head = arrow.segments[arrow.segments.length - 1];
    
    // 优先选择：头部朝向最近边界的方向
    const candidates = [];
    if (head.x === 0) candidates.push(DIR.LEFT);
    if (head.x === cols - 1) candidates.push(DIR.RIGHT);
    if (head.y === 0) candidates.push(DIR.UP);
    if (head.y === rows - 1) candidates.push(DIR.DOWN);
    
    // 如果头部不在边界，选择到边界路径上无阻挡的方向
    if (candidates.length === 0) {
      for (const dir of [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT]) {
        // 检查从头部沿此方向到边界是否有其它线段阻挡
        // （注意：这里只是初始分配，后续验证会确认整体可解性）
        candidates.push(dir);
      }
    }
    
    arrow.direction = candidates[randInt(0, candidates.length - 1)];
  }
}
```

**可解性验证（贪心模拟）：**

```js
function verifySolvable(arrows, originalGrid, cols, rows) {
  // 深拷贝状态
  const grid = deepCopy(originalGrid);
  const remaining = arrows.map(a => ({...a, segments: [...a.segments]}));
  
  // 贪心策略：反复扫描，找到"头部沿方向到边界无阻挡"的线段并移除
  let progress = true;
  while (progress && remaining.length > 0) {
    progress = false;
    
    for (let i = remaining.length - 1; i >= 0; i--) {
      const arrow = remaining[i];
      if (canEscape(arrow, grid, cols, rows)) {
        // 模拟移除：清除网格占位
        for (const seg of arrow.segments) {
          grid[seg.y][seg.x] = 0;
        }
        remaining.splice(i, 1);
        progress = true;
      }
    }
  }
  
  return remaining.length === 0;
}

function canEscape(arrow, grid, cols, rows) {
  // 模拟线段逐格前进，检查是否能顺利移出边界
  const segments = [...arrow.segments];
  const dir = arrow.direction;
  
  while (segments.length > 0) {
    const head = segments[segments.length - 1];
    const newHead = { x: head.x + dir.dx, y: head.y + dir.dy };
    
    // 头部出界 → 开始退出
    if (isOutOfBounds(newHead, cols, rows)) {
      segments.pop(); // 逐格退出
      continue;
    }
    
    // 头部碰到其它线段 → 不能逃脱
    if (grid[newHead.y][newHead.x] !== 0 && grid[newHead.y][newHead.x] !== arrow.id) {
      return false;
    }
    
    // 正常移动
    const oldTail = segments.shift();
    segments.push(newHead);
    grid[oldTail.y][oldTail.x] = 0;
    grid[newHead.y][newHead.x] = arrow.id;
  }
  
  return true; // 所有段都移出了
}
```

> **关键洞察**：`verifySolvable` 使用贪心策略——每轮扫描所有剩余线段，找到能直接逃脱的线段并移除。如果某轮没有任何线段能逃脱，则判定为不可解。这个策略不能保证找到所有解（可能存在需要特定顺序才能解的情况），但对于随机生成的关卡，贪心验证通过率很高。如果验证失败则重新生成。

### 3.8 状态机

```
            ┌─────────────────────────────────┐
            │ 玩家点击线段 A (state=idle)       │
            │ 前置：isAnimating === false       │
            └────────────┬────────────────────┘
                         │
                         ▼
            保存 A.savedSegments = [...A.segments]
            A.state = 'moving'
            isAnimating = true
                         │
                         ▼
            ┌────────────────────────────────────┐
            │ 循环：每 MOVE_DURATION ms 移动一格  │
            │                                    │
            │  moveOneStep(A) 返回：             │
            │    'moving'  → 继续下一格          │
            │    'exiting' → 头部已出界，继续     │
            │    'blocked' → 碰撞，进入退回流程   │
            └────────────┬───────────────────────┘
                         │
              ┌──────────┼──────────┐
              ▼          ▼          ▼
         [blocked]   [exiting]  [all out]
              │          │          │
              ▼          │          ▼
         变红色         继续      A.state = 'removed'
         退回动画       移动      从 arrows 中标记移除
         failures++     直到      检查胜利
         A.state='idle' 全部出界
              │                     │
              ▼                     ▼
         检查失败次数           remaining === 0?
         failures >= 3?              │
              │                 ┌────┴────┐
              ▼                 ▼         ▼
           LOSE               WIN      继续游戏
                                      isAnimating = false
```

### 3.9 点击检测

```js
function onPointerDown(pointer) {
  if (isAnimating || status !== 'playing') return;
  
  // 将屏幕坐标转换为网格坐标
  const col = Math.round((pointer.x - GRID_OFFSET_X) / CELL_SIZE);
  const row = Math.round((pointer.y - GRID_OFFSET_Y) / CELL_SIZE);
  
  // 容差检测：点击位置在某个线段附近
  const clickedArrowId = grid[row]?.[col];
  if (!clickedArrowId) return;
  
  const arrow = arrows.find(a => a.id === clickedArrowId && a.state === 'idle');
  if (!arrow) return;
  
  // 开始第一次点击时启动倒计时
  if (!countdownStarted) startCountdown();
  
  animateMove(arrow);
}
```

### 3.10 HUD 与 UI

```
┌─────────────────────────────────────┐
│  ❤️❤️❤️        ⏱ 00:45              │
│  (失败次数)    (倒计时)              │
└─────────────────────────────────────┘

失败时：对应的 ❤️ 变灰
倒计时：从第一次点击开始，每秒 -1
```

- 使用 Phaser `Text` 对象显示
- 心形用 emoji 或 Graphics 绘制
- 倒计时用 `setInterval`（微信小游戏兼容，不用 Phaser time.addEvent）

### 3.11 胜利/失败弹层

```js
// 半透明遮罩 + 居中文字 + 重开按钮
function showGameOver(isWin) {
  // 遮罩
  const overlay = this.add.rectangle(WIDTH/2, HEIGHT/2, WIDTH, HEIGHT, 0x000000, 0.6);
  
  // 文字
  const text = this.add.text(WIDTH/2, HEIGHT/2 - 40, 
    isWin ? '🎉 恭喜通关！' : '💔 游戏结束', 
    { fontSize: '28px', color: '#fff' }
  ).setOrigin(0.5);
  
  // 重开按钮
  const btn = this.add.text(WIDTH/2, HEIGHT/2 + 40, '再来一局', 
    { fontSize: '22px', color: '#4ecdc4', backgroundColor: '#333', padding: {x:20, y:10} }
  ).setOrigin(0.5).setInteractive();
  
  btn.on('pointerdown', () => this.scene.restart());
}
```

### 3.12 微信小游戏适配（沿用 Day 1/2 结论）

1. `Phaser.CANVAS`（不要 WEBGL）
2. viewport 用 `wx.getSystemInfoSync()`
3. 不开 zoom
4. `game.json` 去掉 `workers` / `subPackages`
5. 不用 DOM API
6. 倒计时用 `setInterval`（不用 `this.time.addEvent`）
7. CANVAS 模式：合并 Graphics 绘制，避免大量独立对象

---

## 四 素材清单（Day 3 一律 0 外部素材）

| 类型 | 处理方式 |
|---|---|
| 网格点 | Graphics 小圆点（灰色） |
| 线段主体 | Graphics 粗线 + 圆角端点 |
| 箭头 | Graphics 三角形 |
| 背景 | 纯色深蓝渐变 |
| HUD | 系统字体 Text |
| 音效 | 不做 |

---

## 五 实现步骤（当天执行计划）

| # | 阶段 | 内容 | 预估 |
|---|---|---|---|
| 1 | 脚手架 | 从 day-01 拷贝目录结构改名 day-03-arrow；去掉物理引擎配置 | 20 min |
| 2 | 网格渲染 | 绘制 7×9 点阵 + 坐标转换函数 | 20 min |
| 3 | 关卡生成 | LevelGenerator：随机放置线段 + 方向分配 + 可解性验证 | 60 min |
| 4 | 线段渲染 | Graphics 绘制线段主体 + 箭头 + 颜色 | 30 min |
| 5 | 点击交互 | 点击检测 + 线段选中反馈 | 20 min |
| 6 | 移动动画 | 贪吃蛇式逐格前进 Tween + 碰撞检测 | 60 min |
| 7 | 碰撞退回 | 变红 + 退回动画 + 失败计数 | 30 min |
| 8 | 消除动画 | 逐格移出边界 + 消失效果 | 20 min |
| 9 | HUD + 倒计时 | 心形 + 倒计时 + 胜负判定 | 30 min |
| 10 | 弹层 + 重开 | 胜利/失败弹层 + scene.restart | 20 min |
| 11 | 微信预览 | run_game / 调试 / 修复兼容问题 | 30 min |

> 总计核心循环 ≈ 5~6 小时

---

## 六 验收标准

- [ ] 微信开发者工具 / weixin-minigame-helper 预览端能跑
- [ ] 7×9 点阵正确显示，线段颜色区分清晰
- [ ] 点击线段后贪吃蛇式逐格前进，动画流畅
- [ ] 碰撞时线段变红并退回原位，失败计数 +1
- [ ] 线段成功移出边界时逐格消失
- [ ] 3 次失败后弹出游戏结束
- [ ] 倒计时归零后弹出游戏结束
- [ ] 所有线段消除后弹出胜利
- [ ] 每次重开生成不同的关卡布局
- [ ] 生成的关卡一定有解（贪心验证通过）
- [ ] 代码结构与 Day 1/2 对齐（core / scene / libs 三段式）

---

## 七 已识别的坑与对策

| # | 坑 | 对策 |
|---|---|---|
| 1 | 关卡生成可能死循环（放不下足够线段） | 设置最大尝试次数，降级减少线段数 |
| 2 | 贪心验证可能误判（存在解但贪心找不到） | 贪心失败时重新生成，不做回溯搜索（性能考虑） |
| 3 | 线段移动动画中玩家再次点击 | `isAnimating` 全局锁，动画期间禁止输入 |
| 4 | 退回动画时网格状态不一致 | 移动前保存 `savedSegments`，退回时完整恢复 |
| 5 | CANVAS 模式大量 Graphics 重绘性能 | 线段不动时不重绘；移动时只重绘当前线段 |
| 6 | 倒计时用 Phaser time.addEvent 不工作 | 用原生 `setInterval`，shutdown 时 clear |
| 7 | 线段蛇形移动时中间格子的占位更新 | 每步严格更新 grid：新头占位、旧尾释放 |
| 8 | 点击检测精度（手指粗） | 扩大点击热区：不仅检测精确格子，还检测相邻格子 |
| 9 | 线段出界过程中的半出界状态 | 出界的段不参与碰撞检测，只有界内的段占位 |
| 10 | scene.restart 后 setInterval 残留 | 在 shutdown 事件中 clearInterval |

---

## 八 关键设计决策（待用户确认）

| # | 决策点 | 建议 | 备注 |
|---|---|---|---|
| 1 | 网格大小 | **7 列 × 9 行** | 手机竖屏适配，格子间距 44px 刚好 |
| 2 | 线段数量 | **8~12 条** | 太少没挑战，太多放不下 |
| 3 | 线段长度 | **2~5 格** | 1 格太短无意义，6+ 格太长难放置 |
| 4 | 失败次数上限 | **3 次** | 与用户描述一致 |
| 5 | 倒计时 | **60 秒**，从第一次点击开始 | 给玩家观察时间 |
| 6 | 碰撞退回方式 | **整体瞬间退回原位**（带 ease 动画） | vs 逐格退回（太慢） |
| 7 | 线段移动速度 | **100ms/格** | 太快看不清，太慢不爽快 |
| 8 | 可解性验证 | **贪心模拟**（不做完整回溯） | 性能优先，验证失败则重新生成 |
| 9 | 视觉风格 | **深色背景 + 彩色线段 + 白色网格点** | 简洁现代 |
| 10 | 线段移动时其它线段是否可点击 | **不可以**（动画锁） | 避免并发移动的复杂性 |

---

## 九 下一步

- ⏳ 等待用户确认上述 10 个设计决策
- ⏭ 确认后即刻开新目录 `day-03-arrow/`，从 day-01 拷脚手架，按第五节步骤推进
- ⏭ 完工后：截图 + 写复盘文章

> 设计完成时间：2026-05-27 · 用户确认时间：待定 · 实现：待开工
