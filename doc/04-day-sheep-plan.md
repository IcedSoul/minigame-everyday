
# Day 4 · 《羊了个羊：星球》核心玩法复刻 · 实现规划

> 系列 Day 4 · 2026-05-28 · 仅设计，不动代码
> 基于用户口述玩法 + 同类游戏调研（Sheep N Sheep / Tile Triple Match / Mahjong Solitaire Triple）

---

## 〇 为什么是这一款（顺序说明）

按 [00-prologue](../articles/00-prologue.md) 的排程，Day 4 原本应是《箭头会拐弯》。但用户判断：

> "因为箭头会拐弯和一箭又一箭核心玩法基本上一模一样"

（都是网格上的路径/方向解谜，逻辑骨架共享 80%。Day 3 的《一箭又一箭》已经把网格 + 移动 + 碰撞退回那一套吃掉了，再做拐弯版本边际收益太低。）

所以 **Day 4 跳过《箭头会拐弯》，直接做 Day 5《羊了个羊：星球》**。这也是清单里唯一一个"易档"里没碰过的核心循环（三消 + 堆叠遮挡），后面再做不会重复浪费一天。

---

## 一 玩法定调（基于用户描述与调研）

### 1.1 一句话规则

> **场景里堆叠着大量带类型图案的方形卡片，卡片之间互相部分遮挡，只有"上方未被压住或被压住面积 < 5%"的卡片可点。被点击的卡片飞入下方一个 7 格卡槽，槽内自动按类型聚合（同类型相邻插入）；当某一类型在槽内累积到 3 张时立即消除并左对齐压缩。槽满 7 张未消则失败；牌堆全清则胜利。**

### 1.2 七条核心规则（必须做对）

#### 规则 1：卡片堆叠与遮挡（继承自 Day 1，但更难）

- 场上有 **大量** 卡片（目标 9 类型 × 9 张 = 81 张起步，整版可解但难）
- 每张卡片有：`type`（图案类型，如蔬菜种类）、`x, y`（中心坐标）、`zLayer`（层级）、`w, h`（尺寸固定）
- **遮挡判定**：对每张卡片 C，遍历所有 `zLayer > C.zLayer` 的卡片 O，计算 O 与 C 的 AABB 相交面积；
  - 若所有 O 与 C 的相交面积之和 / C 的面积 ≥ **5%** → C 被遮挡，置灰且禁止点击
  - 若 < 5% 或没有上层卡片 → C 高亮可点击
- **关键**：5% 阈值是对玩法体验最关键的参数（Day 1 是任意覆盖即不可点，这里更宽松，给玩家"擦边球"机会）

#### 规则 2：堆叠模式（两种）

- **模式 A：随意堆叠**（默认/难版）
  - 卡片中心 `x, y` 在游戏区内**随机抖动**生成，z 层从低到高叠
  - 同 z 层之间也允许部分重叠（造成"花一样的乱"）
  - 视觉感：参考"消个水果""抓大鹅"
- **模式 B：整齐堆叠**（牌堆/简单版）
  - 卡片严格按网格行列对齐生成（如 7 列 × N 行），z 层从下往上
  - 上层卡片中心**对齐到下层 4 张卡片的交叉点**（牌堆塔的视觉感）
  - 视觉感：参考《羊了个羊》经典塔式布局
- **MVP 范围**：两种都做，提供 UI 切换按钮（也方便对比测试）

#### 规则 3：7 格卡槽 + 自动聚合排序

- 屏幕底部固定 **7 个槽位**，从左到右 0..6
- 每次点击卡片，飞入卡槽**插入位置**满足以下规则：
  - 扫描槽内已有卡片，找到**最后一张与当前卡片同类型**的位置 K
  - 若 K 存在 → 新卡片插入到位置 K+1，K+1 之后的卡片整体右移一位
  - 若 K 不存在（槽里没有同类型）→ 新卡片直接追加到末尾
- 这样保证：**同类型的卡片在槽内永远是连续相邻的**（这是消除算法的前提）

#### 规则 4：三同消除 + 左对齐压缩

- 卡片入槽后**立即**扫描槽：是否存在某个连续的 3 张同类型？
- 若存在 → 整段消除（动画：3 张同时缩小淡出），后续卡片**整体左移**到空位
- 消除是单次的：一次入槽最多触发一次三同消除（因为同类型只可能新增 1 张，最多让一段从 2 → 3）

#### 规则 5：失败条件

- 入槽后槽内卡片数 == 7 且**没有触发消除** → 立即判负
- **顺序很重要**：先入槽 → 后扫描三同消除 → 最后判槽是否满 7
  - 这样保证"第 7 张正好凑齐三同"也算胜利动作（玩家最爽的瞬间不能被偷掉）

#### 规则 6：胜利条件

- 牌堆所有卡片消除完毕 → 胜利
- 槽内若还有剩余卡片不影响判定（实际上这种情况只可能发生在卡片总数不是 3 的倍数，本游戏不允许）

#### 规则 7：可解性（不做主动验证）

- 用户明确指示：**不做可解性判断**，通过卡片种类数控制整体难度
- 难度参数：`类型数 × 每类型张数`，必须是 3 的倍数
- 默认难度：**9 种类型 × 9 张 = 81 张**（每类型 9 张 = 3 次三消，9 类型超过槽容量 7，必然产生卡死风险）
- 失败也是体验的一部分，玩家可以"再来一局"

### 1.3 与同类游戏的对比

| 游戏 | 与本作的区别 |
|---|---|
| 《打个螺丝》（Day 1） | 顶部 4 色盒 + 满 3 消除 + 5 格备选区；**遮挡是板子粒度**（板子被覆盖整体不可点） |
| 《消个水果》 | 没有堆叠遮挡，水果在屏幕上飘浮；同类型相邻消除 |
| 《羊了个羊：星球》（本作） | **三层堆叠遮挡 + 7 格卡槽 + 三同自动消除 + 同类型自动聚合排序** |
| 《抓大鹅》 | 3D 三消（透视摆放），玩法骨架与本作一致，难点在 3D 渲染 |
| Mahjong Solitaire | 找两张相同的对消，且只能消"开放"的牌；本作是**找 3 张**且**有缓冲槽** |

---

## 二 MVP 范围与非目标

### 2.1 MVP 必做（Day 4 当天）

- ✅ 9 类型 × 9 张卡片（共 81 张）随机生成
- ✅ 两种堆叠模式（随意 / 整齐）+ 切换按钮
- ✅ 卡片代码绘制（圆角矩形 + 中心 emoji 图标占位，先不用图片）
- ✅ 多层 z 堆叠 + 5% 阈值的遮挡判定 + 灰化效果
- ✅ 点击未遮挡卡片飞入槽位的动画（300ms tween）
- ✅ 槽内同类型自动聚合排序（插入到最后一张同类型之后）
- ✅ 三同自动消除 + 左移压缩动画
- ✅ 槽满 7 张未消 → 失败
- ✅ 牌堆清空 → 胜利
- ✅ HUD：剩余卡片数 / 槽容量 / 模式切换
- ✅ 胜利/失败弹层 + 一键重开

### 2.2 MVP 不做（明确砍掉）

- ❌ 关卡进度系统（只单关随机生成）
- ❌ 道具（撤回/洗牌/移除一张）
- ❌ 真实美术资源（先 emoji，跑通后再换 AI 生图）
- ❌ 可解性主动验证（用户明确说不做）
- ❌ 排行榜 / 计时 / 分享
- ❌ 音效（第一轮一律不做）
- ❌ 多关卡难度梯度

---

## 三 技术方案

### 3.1 引擎选型

| 选项 | 评估 | 结论 |
|---|---|---|
| Phaser 3 + 无物理 | 纯逻辑 + 矩形遮挡判定 + Tween 动画即可 | ✅ **本次首选** |
| Phaser 3 + Arcade | 不需要重力/连续碰撞 | ❌ |
| Phaser 3 + Matter | 完全用不到 | ❌ |

> **结论：和 Day 1 / Day 3 一致——纯 Phaser 3 + Tween，不开任何物理引擎。**

### 3.2 Phaser 配置（继承 Day 1/3 踩坑结论）

```js
{
  type: Phaser.CANVAS,           // 微信小游戏兼容（不要 WEBGL，截屏 readback 会超时）
  physics: { default: false },
  scale: { mode: Phaser.Scale.NONE, width: WIDTH, height: HEIGHT },
  fps: { target: 60, forceSetTimeOut: true },
  backgroundColor: '#fef6e4',    // 暖米色（卡牌游戏偏暖比偏冷舒服）
}
```

- viewport 用 `wx.getSystemInfoSync()`（防 sandbox 里 `window.devicePixelRatio` undefined 崩溃）
- 不开 `zoom`，直接用 css 像素当 width/height
- `game.json` 去掉 `workers` / `subPackages`

### 3.3 目录结构（沿用 Day 1/3 三段式）

```
day-04-sheep/
├── game.js                       # 微信小游戏入口
├── game.json                     # 简化配置
├── project.config.json
├── project.private.config.json
├── index.html                    # 网页入口
├── js/
│   ├── main.js                   # Phaser 初始化（拷自 day-01）
│   ├── libs/
│   │   ├── phaser.min.js
│   │   ├── weapp-phaser3-adapter.min.js
│   │   └── symbol.js
│   ├── core/
│   │   ├── config.js             # 类型、尺寸、颜色、阈值常量
│   │   └── LevelGenerator.js     # 关卡随机生成（两种堆叠模式）
│   └── scene/
│       └── GameScene.js          # 主玩法场景
└── types/
    └── phaser.d.ts
```

### 3.4 关键数据结构

```js
// ===== 配置常量 =====
const CARD_TYPES = 9;             // 类型数（9 种蔬菜/物品）
const CARDS_PER_TYPE = 9;         // 每类张数（必须是 3 的倍数）
const TOTAL_CARDS = 81;           // = CARD_TYPES * CARDS_PER_TYPE
const SLOT_CAPACITY = 7;          // 槽容量
const TRIPLE_COUNT = 3;           // 三同消除

const CARD_W = 76;                // 卡片宽度（逻辑像素）
const CARD_H = 92;                // 卡片高度
const OCCLUSION_THRESHOLD = 0.05; // 遮挡阈值 5%

// 9 种类型（emoji 占位）
const TYPE_ICONS = ['🥕','🍆','🌽','🥦','🍅','🥬','🌶️','🍄','🥒'];
const TYPE_BG_COLORS = [
  0xffd6a5, 0xc8b6ff, 0xfff7ae, 0xb5e48c,
  0xffafcc, 0xa0e8af, 0xff9b85, 0xd4a5a5, 0xb8e0d2,
];

// ===== 模式 =====
const STACK_MODE = {
  RANDOM: 'random',   // 随意堆叠
  GRID:   'grid',     // 整齐堆叠
};

// ===== 单张卡片 =====
{
  id: number,               // 唯一标识
  type: number,             // 0..CARD_TYPES-1
  x: number, y: number,     // 中心逻辑坐标
  w: number, h: number,     // 尺寸（固定）
  zLayer: number,           // 层级（0=最底）
  state: 'on_pile' | 'flying' | 'in_slot' | 'removed',
  unlocked: boolean,        // 当前是否未遮挡
  sprite: Phaser.GameObjects.Container,  // 渲染容器
}

// ===== 卡槽 =====
slot: Card[]                // 长度 0~7

// ===== 全局状态 =====
{
  cards: Card[],            // 所有卡片（包括槽内、已消除等）
  slot: Card[],             // 当前槽内卡片
  remaining: number,        // 牌堆剩余数（未点击）
  status: 'playing' | 'win' | 'lose',
  isAnimating: boolean,     // 动画锁
  mode: 'random' | 'grid',
}
```

### 3.5 屏幕布局（以 720×1280 逻辑分辨率为参考，与 Day 1 一致）

```
┌─────────────────────────────────┐
│  HUD: 羊了个羊 · 剩余 81/81      │  y=0~120
│  [随意堆叠] [整齐堆叠]            │  y=120~180  模式切换
├─────────────────────────────────┤
│                                 │
│        〔 牌堆游戏区 〕          │  y=200~1020 高度 820
│        9 × 9 = 81 张             │  最多 ~10 层 z 堆叠
│        随意/整齐两种布局           │
│                                 │
├─────────────────────────────────┤
│ ▢ ▢ ▢ ▢ ▢ ▢ ▢                  │  y=1080~1220 卡槽 7 格
└─────────────────────────────────┘
```

### 3.6 卡片渲染（代码绘制 + Container）

每张卡片用 `Phaser.GameObjects.Container` 包：

```js
function buildCardSprite(card) {
  const container = scene.add.container(card.x, card.y);
  
  // 1. 阴影
  const shadow = scene.add.graphics();
  shadow.fillStyle(0x000000, 0.25);
  shadow.fillRoundedRect(-CARD_W/2 + 3, -CARD_H/2 + 5, CARD_W, CARD_H, 10);
  
  // 2. 卡片底（圆角矩形 + 类型背景色）
  const bg = scene.add.graphics();
  bg.fillStyle(0xffffff, 1);
  bg.fillRoundedRect(-CARD_W/2, -CARD_H/2, CARD_W, CARD_H, 10);
  bg.lineStyle(2, 0x666666, 0.4);
  bg.strokeRoundedRect(-CARD_W/2, -CARD_H/2, CARD_W, CARD_H, 10);
  
  // 3. 内层彩色背景圆
  const inner = scene.add.graphics();
  inner.fillStyle(TYPE_BG_COLORS[card.type], 1);
  inner.fillCircle(0, 0, CARD_W * 0.35);
  
  // 4. 中心 emoji 图标
  const icon = scene.add.text(0, 0, TYPE_ICONS[card.type], {
    fontSize: `${CARD_W * 0.55}px`,
  }).setOrigin(0.5);
  
  // 5. 灰化遮罩（默认隐藏）
  const grayOverlay = scene.add.graphics();
  grayOverlay.fillStyle(0x000000, 0.55);
  grayOverlay.fillRoundedRect(-CARD_W/2, -CARD_H/2, CARD_W, CARD_H, 10);
  grayOverlay.setVisible(false);
  
  container.add([shadow, bg, inner, icon, grayOverlay]);
  container.setSize(CARD_W, CARD_H);
  container.setInteractive();
  container.on('pointerdown', () => onCardClick(card));
  
  card.sprite = container;
  card.grayOverlay = grayOverlay;
  return container;
}
```

**深度排序**：用 `container.setDepth(card.zLayer * 100 + i)` 保证渲染顺序。

### 3.7 核心算法 A：遮挡判定（5% 阈值）

```js
// 计算两个卡片 AABB 的相交面积（卡片是 axis-aligned 矩形）
function rectIntersectionArea(a, b) {
  const xOverlap = Math.max(0, 
    Math.min(a.x + a.w/2, b.x + b.w/2) - Math.max(a.x - a.w/2, b.x - b.w/2)
  );
  const yOverlap = Math.max(0,
    Math.min(a.y + a.h/2, b.y + b.h/2) - Math.max(a.y - a.h/2, b.y - b.h/2)
  );
  return xOverlap * yOverlap;
}

function recomputeOcclusion() {
  const live = cards.filter(c => c.state === 'on_pile');
  const cardArea = CARD_W * CARD_H;
  
  for (const c of live) {
    let coveredArea = 0;
    for (const o of live) {
      if (o.id === c.id) continue;
      if (o.zLayer <= c.zLayer) continue;  // 只看更上层
      coveredArea += rectIntersectionArea(c, o);
      // 短路优化：累计已经超过阈值就跳出
      if (coveredArea / cardArea >= OCCLUSION_THRESHOLD) break;
    }
    const ratio = coveredArea / cardArea;
    c.unlocked = (ratio < OCCLUSION_THRESHOLD);
    
    // 更新视觉
    if (c.grayOverlay) c.grayOverlay.setVisible(!c.unlocked);
  }
}
```

**复杂度**：O(N²)，N=81 时 ≈ 6500 次矩形相交计算，毫秒级，每次点击后调一次完全够用。

> **注意**：`coveredArea` 是**累加**而不是取最大单个覆盖。因为如果两块上层卡片各自覆盖 3%，总和 6% > 5%，应当判定为遮挡。这点比 Day 1 的"任一覆盖即不可点"更合理。

> **进阶坑**：累加可能高估（两块上层卡片之间也互相重叠的部分被算了两次）。MVP 范围内可以忽略，反正 5% 阈值本身就是松散的体验参数；如果后续发现问题再优化。

### 3.8 核心算法 B：关卡生成（两种模式）

#### 模式 A：随意堆叠

```js
function generateRandomStack(rand) {
  const cards = [];
  const types = [];
  for (let t = 0; t < CARD_TYPES; t++) {
    for (let i = 0; i < CARDS_PER_TYPE; i++) types.push(t);
  }
  shuffle(types, rand);
  
  // 游戏区域
  const areaLeft = 60, areaRight = WIDTH - 60;
  const areaTop = 220, areaBottom = HEIGHT - 280;
  
  const layerCount = 6;     // 6 层堆叠
  const perLayer = Math.ceil(TOTAL_CARDS / layerCount);
  
  for (let i = 0; i < TOTAL_CARDS; i++) {
    const z = Math.floor(i / perLayer);
    // 每层随机抖动
    const x = areaLeft + rand() * (areaRight - areaLeft);
    const y = areaTop + rand() * (areaBottom - areaTop);
    cards.push({
      id: i, type: types[i],
      x, y, w: CARD_W, h: CARD_H,
      zLayer: z,
      state: 'on_pile',
      unlocked: false,
    });
  }
  return cards;
}
```

#### 模式 B：整齐堆叠（牌堆塔）

```js
function generateGridStack(rand) {
  const cards = [];
  const types = [];
  for (let t = 0; t < CARD_TYPES; t++) {
    for (let i = 0; i < CARDS_PER_TYPE; i++) types.push(t);
  }
  shuffle(types, rand);
  
  // 牌堆塔布局：每层卡片数递减，居中对齐
  // 第 0 层 7×6=42 张，第 1 层 6×5=30 张，第 2 层 5×4=20 张...
  // 简化：固定 4 层，分别 5×4=20, 4×4=16, 3×3=9, 2×2=4，再加几张顶部
  
  const gapX = CARD_W * 0.5;     // 上下两层中心错位半张
  const gapY = CARD_H * 0.5;
  const stepX = CARD_W;          // 同层间距
  const stepY = CARD_H;
  
  const layers = [
    { cols: 7, rows: 5 },  // 35
    { cols: 6, rows: 4 },  // 24
    { cols: 5, rows: 3 },  // 15
    { cols: 3, rows: 2 },  // 6
    { cols: 1, rows: 1 },  // 1  → 共 81
  ];
  
  let id = 0;
  for (let z = 0; z < layers.length; z++) {
    const { cols, rows } = layers[z];
    const totalW = cols * stepX;
    const totalH = rows * stepY;
    const layerOffsetX = (z % 2) * (CARD_W * 0.5);  // 奇偶错位
    const layerOffsetY = z * 4;                     // 视觉上向上移
    const startX = (WIDTH - totalW) / 2 + stepX / 2 + layerOffsetX;
    const startY = 240 + (HEIGHT - 240 - 280 - totalH) / 2 + stepY / 2 + layerOffsetY;
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (id >= TOTAL_CARDS) break;
        cards.push({
          id, type: types[id],
          x: startX + c * stepX, y: startY + r * stepY,
          w: CARD_W, h: CARD_H,
          zLayer: z,
          state: 'on_pile',
          unlocked: false,
        });
        id++;
      }
    }
  }
  // 不够 81 张就在第 0 层补
  return cards;
}
```

> **整齐堆叠的"塔感"**：让上层中心略微错开下层（错开 0.5 张），上层数量更少，形成视觉上的金字塔。

### 3.9 核心算法 C：槽内自动聚合排序

```js
function insertIntoSlot(card) {
  // 找最后一张同类型的位置
  let lastSameIdx = -1;
  for (let i = slot.length - 1; i >= 0; i--) {
    if (slot[i].type === card.type) {
      lastSameIdx = i;
      break;
    }
  }
  
  const insertIdx = lastSameIdx === -1 ? slot.length : lastSameIdx + 1;
  slot.splice(insertIdx, 0, card);
  card.slotIndex = insertIdx;
  // 注意：插入后，原 insertIdx 之后的卡片 slotIndex 都需要刷新
  for (let i = 0; i < slot.length; i++) slot[i].slotIndex = i;
  
  return insertIdx;
}
```

### 3.10 核心算法 D：三同消除扫描

```js
function checkAndRemoveTriple() {
  // 槽内连续 3 张相同 → 消除
  for (let i = 0; i + 2 < slot.length; i++) {
    if (slot[i].type === slot[i+1].type && slot[i+1].type === slot[i+2].type) {
      const removed = slot.splice(i, 3);
      // 刷新剩余卡片 index
      for (let k = 0; k < slot.length; k++) slot[k].slotIndex = k;
      return removed;
    }
  }
  return null;
}
```

> **关键**：因为聚合排序保证同类型连续，所以一次入槽**最多产生一组三同**（因为同类型只新增 1 张，最多让一段从 2 → 3）。所以**不需要循环扫描**，只扫一次就够。

### 3.11 核心交互流程（状态机）

```
┌──────────────────────────────────────────────────┐
│ 玩家点击牌堆中的卡片 C                             │
│ 前置：isAnimating=false, status=playing            │
│       C.state='on_pile', C.unlocked=true           │
└────────────────────────┬─────────────────────────┘
                         │
                         ▼
            isAnimating = true
            C.state = 'flying'
            C.sprite.disableInteractive()
                         │
                         ▼
            // 步骤 1：计算插入位置
            insertIdx = insertIntoSlot(C)
                         │
                         ▼
            // 步骤 2：原槽位 [insertIdx..end] 卡片右移动画
            // 同时 C 飞向 insertIdx 槽位（300ms tween）
            await Promise.all([
              tweenCardToSlot(C, insertIdx),
              shiftSlotCardsRight(insertIdx),
            ])
                         │
                         ▼
            C.state = 'in_slot'
                         │
                         ▼
            // 步骤 3：扫描三同
            removed = checkAndRemoveTriple()
                         │
              ┌──────────┴──────────┐
            removed                 null
              │                     │
              ▼                     │
            播放消除动画（缩小 + 淡出 200ms）
            后续卡片左移到空位（200ms tween）
            removedCards.forEach(c => c.state='removed')
              │                     │
              ▼                     ▼
              └─────────┬───────────┘
                        ▼
            // 步骤 4：重算遮挡
            recomputeOcclusion()
            updateHUD()
                        │
                        ▼
            isAnimating = false
                        │
                        ▼
            // 步骤 5：胜负判定
            if (cards.every(c => c.state === 'removed')) {
              endGame('win')
            } else if (slot.length >= SLOT_CAPACITY) {
              endGame('lose')
            }
```

### 3.12 槽位动画细节

- **入槽动画**：300ms `Cubic.easeOut`，从牌堆位置飞到目标槽位中心
- **右移动画**：200ms `Cubic.easeOut`，被挤的卡片向右滑一格
- **消除动画**：200ms 缩小 (scale 1→0) + 淡出 (alpha 1→0)
- **左移动画**：250ms `Cubic.easeOut`，3 张消失后右侧卡片左移
- **提升 z 序**：飞行中的卡片要 `setDepth(99999)` 保证在最上层（避免被牌堆压住）

### 3.13 模式切换

- 顶部两个按钮 `[随意堆叠] [整齐堆叠]`，点击后：
  1. 销毁所有现有卡片 sprite
  2. 重置 `state.cards = generateLevel(newMode)`
  3. 重新构建所有卡片
  4. `recomputeOcclusion()` + 刷新 HUD

### 3.14 微信小游戏适配（沿用 Day 1/3 结论）

1. ✅ `Phaser.CANVAS`（不要 WEBGL）
2. ✅ viewport 用 `wx.getSystemInfoSync()`
3. ✅ 不开 `zoom`
4. ✅ `game.json` 去掉 `workers` / `subPackages`
5. ✅ 不用 DOM API（无 `document` / `window.alert`）
6. ✅ Container + Graphics + Text 组合（emoji 在 CANVAS 模式下能正常渲染）
7. ⚠️ **新坑**：CANVAS 模式下 81 张卡片可能有性能问题，每张 5+ 个 graphics 对象；考虑用 `generateTexture` 预生成 9 种类型纹理，卡片只用 1 个 Image 对象

---

## 四 性能预算（与 Day 1 对比的新挑战）

| 维度 | Day 1（打个螺丝） | Day 4（羊了个羊） | 风险 |
|---|---|---|---|
| 卡片/螺丝总数 | 63 | **81** | 中等（数量级一致） |
| 每帧渲染对象 | ~150（板子+螺丝+UI） | ~400+（每卡 5 个 graphics） | ⚠️ 高 |
| 遮挡判定复杂度 | O(板²) ~ 21² | **O(卡²) ~ 81² ≈ 6500** | 低（只在点击后） |
| Tween 并发 | 1 个螺丝飞行 | **N 个槽位卡片同时左/右移** | 中等 |

**性能优化策略**：

1. **类型纹理预生成**：用 `Graphics.generateTexture()` 预先把 9 种卡片烘焙成 9 张 Image，每张卡用 1 个 Image 而不是 5 个 Graphics
2. **遮挡判定短路**：累计覆盖到 5% 就 break
3. **不动的卡片不重绘**：Phaser CANVAS 模式自动 dirty rect，只要 sprite 没改属性就不会重绘
4. **灰化用单独的 alpha overlay**：而不是重画整张卡

---

## 五 素材清单（Day 4 第一轮 0 外部素材）

| 类型 | 资源 | MVP 处理 |
|---|---|---|
| 卡片底 | 圆角白底 | Graphics 代码绘制 |
| 类型背景色 | 9 种柔和色 | TYPE_BG_COLORS 常量 |
| 类型图标 | 蔬菜 emoji | 系统 emoji（🥕🍆🌽🥦🍅🥬🌶️🍄🥒）|
| 卡槽框 | 圆角灰底 | Graphics 代码绘制 |
| HUD 背景 | 半透明条 | Rectangle |
| 模式按钮 | 圆角矩形 + 文字 | Graphics + Text |
| 失败/胜利弹层 | 半透明遮罩 + 文字 | Graphics + Text |

> **第二轮（核心循环 OK 后）**：用 AI 生图 9 张正方形蔬菜图标（512×512 PNG）替换 emoji，提升美术档次。

### AI 生图 prompt 模板（备用，等核心循环跑通后用）

```
A flat 2D vector icon of a [carrot/eggplant/corn/broccoli/tomato/cabbage/chili/mushroom/cucumber],
cute kawaii style, glossy, vibrant color, white background, isolated,
casual mobile game art, soft shadow, no text, 512x512 transparent PNG.
```

---

## 六 实现步骤（当天执行计划）

| # | 阶段 | 内容 | 预估 |
|---|---|---|---|
| 1 | 脚手架 | 拷贝 day-01 整体结构改名 day-04-sheep；改 game.json / project.config.json 的项目名 | 15 min |
| 2 | 配置常量 | `core/config.js`：类型、尺寸、颜色、阈值 | 15 min |
| 3 | 关卡生成 | `core/LevelGenerator.js`：两种堆叠模式（随机 + 整齐） | 60 min |
| 4 | 卡片渲染 | `GameScene.js`：Container + 圆角矩形 + emoji + 灰化 overlay | 45 min |
| 5 | 遮挡判定 | 5% 阈值的 O(N²) 矩形相交累加 | 30 min |
| 6 | 卡槽 UI | 底部 7 格槽位 + 槽位标号 | 20 min |
| 7 | 点击 + 飞行 | 入槽 tween + 同类型聚合排序 + 右移动画 | 50 min |
| 8 | 三同消除 | 扫描 + 消除动画 + 左移压缩 | 30 min |
| 9 | 胜负判定 | 槽满判负 / 全消胜利 / 弹层 + 重开 | 25 min |
| 10 | HUD + 模式切换 | 剩余数 / 模式按钮 / 切换刷新 | 30 min |
| 11 | 微信预览 | run_game / get_logs / 修复兼容问题 | 30 min |
| 12 | 调优 | 性能（如必要预生成纹理）、动画手感、参数微调 | 30 min |

> **总计**：≈ 6 小时（与 Day 3 持平）

---

## 七 验收标准

Day 4 的产出必须同时满足：

- [ ] 微信开发者工具 / weixin-minigame-helper 预览端能跑（无报错日志）
- [ ] 81 张卡片正确堆叠，9 种类型颜色清晰可辨
- [ ] **5% 遮挡阈值**生效：被压超过 5% 的卡变灰且不可点；< 5% 的卡可点
- [ ] 两种堆叠模式都能切换，且各自显示风格不同
- [ ] 点击未遮挡卡片 → 飞入卡槽，动画流畅（300ms 内完成）
- [ ] 槽内**同类型自动聚合**（不是简单追加，而是插入到最后一张同类型之后）
- [ ] 槽内出现 3 张同类型 → 立即消除 + 后续卡片左移
- [ ] 槽满 7 张未消 → 失败弹层
- [ ] 牌堆全清 → 胜利弹层
- [ ] 重开按钮能重新生成关卡
- [ ] 代码结构与 Day 1/Day 3 对齐（core/scene/libs 三段式）

---

## 八 已识别的坑与对策

| # | 坑 | 对策 |
|---|---|---|
| 1 | 81 张卡每张 5 个 Graphics 渲染压力大 | 用 `generateTexture` 预生成 9 种类型纹理；每卡只用 1 个 Image |
| 2 | 多个上层卡片累加覆盖率高估（重叠部分算两次） | MVP 接受这个误差；5% 是松散参数，体验上不敏感 |
| 3 | 飞行中的卡片被牌堆压住（z 序问题） | 飞行时 `setDepth(99999)`，落定后恢复正常 z |
| 4 | 槽内连续动画的并发冲突（飞入 + 右移同时进行） | 用 `Promise.all([飞入 tween, 右移 tween])` 串成一步 |
| 5 | 胜负判定时机错乱（先消还是先判满） | **严格顺序**：入槽 → 扫三同消除 → 判槽满 → 判全清 |
| 6 | 整齐堆叠的视觉错位 | 奇偶层 X 错开 0.5 张，制造塔感 |
| 7 | 模式切换时旧 sprite 内存泄漏 | 切换前 `forEach(c => c.sprite.destroy())` 清理 |
| 8 | scene.restart 后定时器残留（沿用 Day 3 经验） | 不用 `setInterval`，本游戏没有倒计时，规避 |
| 9 | 同 z 层卡片渲染顺序不稳定 | `setDepth(zLayer * 100 + indexInLayer)` 保证有序 |
| 10 | emoji 在某些机型字体异常 | 准备 fallback：用 Graphics 画简单几何图形（圆/方/三角）作为类型图标 |
| 11 | 难度过高玩家容易失败 | MVP 里 9 类型 × 9 张 偏难，可以做一个 "简单模式" 6 类型 × 6 张 = 36 张 给玩家选 |
| 12 | 卡片密集时点击穿透（点到底层而非顶层） | Phaser 默认按 depth 倒序触发；确保 `setDepth` 正确即可 |

---

## 九 关键设计决策（用户已确认 · 实际实现）

| # | 决策点 | 最终方案 | 说明 |
|---|---|---|---|
| 1 | 类型数 × 每类张数 | **12 × 9 = 108** | 用户回复"108张吧"→ 加大难度，12 类型超过槽容量 7 |
| 2 | 槽容量 | **7** | 用户明确 |
| 3 | 三同消除张数 | **3** | 用户明确 |
| 4 | 遮挡阈值 | **5%** | 用户明确 |
| 5 | 堆叠模式 | **混合堆叠（不可切换）** | 用户回复"随意堆叠和整体堆叠混合在一起，不用考虑用哪种" |
| 6 | 卡片视觉 | **emoji 占位** | 12 个蔬菜/水果 emoji（🥕🍆🌽🥦🍅🥬🌶️🍄🥒🍓🍇🍑）|
| 7 | 卡片大小 | **76×92** | 与原方案一致 |
| 8 | 入槽动画时长 | **280ms** | 略快于 Day 1，配合 7 格槽位连锁动画感更好 |
| 9 | 是否做可解性验证 | **不做** | 用户明确 |

### 9.1 混合堆叠的具体设计

用户拍板"混合在一起"后，我把 108 张卡片分成两个区域：

- **上半区（55%，金字塔整齐塔）**：5 层堆叠，每层从底到顶递减（24/15/12/6/2）
  - 奇偶层 X、Y 各错位 1/3 张（不是 1/2）—— 错半张反而完全压住下层，1/3 张才能让下层露出可点击区域
  - 整齐塔 z 层 0..4，视觉重点
- **下半区（45%，随意散乱）**：6 层堆叠，每张卡片中心在区域内随机抖动
  - z 层 5..10，永远在整齐塔之上
  - 抖动幅度 0.85，制造"花一样的乱"
- 两区在分割线附近留 30 逻辑像素重叠，视觉衔接自然

---

## 十 与 Day 1（打个螺丝）的代码复用清单

明确"哪些直接抄、哪些要改"：

### 可以直接复用（拷贝到 day-04）

- ✅ `js/main.js`（Phaser 初始化、viewport 适配）
- ✅ `js/libs/*`（phaser.min.js / weapp-phaser3-adapter / symbol.js）
- ✅ `index.html`
- ✅ `game.js` / `game.json`（改一下项目名）
- ✅ `project.config.json` / `project.private.config.json`（改 projectname）
- ✅ Day 1 GameScene 中的 `endGame()` 弹层逻辑（结构复制）
- ✅ Day 1 的"逻辑坐标 + uiScale 缩放"模板（`toScreenX/Y` / `s()`）

### 需要重写

- ❌ 关卡生成（堆叠 vs 板子布局，完全不同）
- ❌ GameScene 主循环（点击 → 入槽 vs 入盒/入备选）
- ❌ 遮挡判定（卡片粒度 5% 阈值 vs 螺丝粒度二值）
- ❌ 卡槽（7 格自动聚合 vs 5 格备选 + 4 工具箱）
- ❌ 消除（3 同 vs 满 3）

### 借鉴 Day 3 的部分

- ✅ `LevelGenerator` 独立成 `core/LevelGenerator.js`，便于切换模式
- ✅ 配置统一在 `core/config.js`，两种模式参数都列出来

---

## 十一 实现状态

- ✅ **2026-05-28 设计完成** · 用户确认 108 张 + 混合堆叠 + emoji 占位
- ✅ **2026-05-28 实现完成** · `day-04-sheep/` 落地，weixin-minigame-helper 预览正常
- ⏭ **下一步**：人工试玩验证完整流程（点击 → 入槽 → 三消 → 胜利/失败），调动画手感
- ⏭ AI 生图替换 emoji（第二轮）
- ⏭ 写复盘文章 `articles/04-day-sheep.md`

### 11.1 实际工程产出

```
day-04-sheep/
├── js/core/config.js           2.92 KB   类型/尺寸/颜色/阈值
├── js/core/LevelGenerator.js   6.54 KB   混合堆叠生成器
├── js/scene/GameScene.js      ~16 KB     主玩法（遮挡/卡槽/三消）
├── js/main.js                  1.61 KB   Phaser 初始化（拷自 day-01）
├── README.md / game.js / game.json / project.config.json ...
```

### 11.2 实现过程踩到的新坑（补充第八节）

| # | 坑 | 实际对策 |
|---|---|---|
| 13 | 整齐塔上下层错位 1/2 张 → 完全压住下层卡片 | 改成错位 1/3 张（X 0.34 + Y 0.34），保证底层有 ~30% 露出 |
| 14 | RenderTexture 烘焙 Text 在 wx-compat 下不稳定，emoji 不渲染 | 卡片纹理只烘焙"白底+边框+彩色圆"，emoji 作为独立 `Text` 在 Container 内渲染 |
| 15 | 用 `removedCount += 1` 计数不准（槽内卡片其实没真消除） | 改用 `cards.filter(c => c.state === 'on_pile').length` 直接计数 |

---

## 附录 A：玩法术语对照表

| 中文 | 英文 | 说明 |
|---|---|---|
| 牌堆 | pile / board | 主游戏区里所有未消除的卡片 |
| 卡槽 | slot / tray | 底部 7 格收纳区 |
| 三同消除 | triple match | 槽内连续 3 张同类型自动消失 |
| 堆叠遮挡 | stacking occlusion | 上层卡片覆盖下层卡片 |
| 聚合排序 | auto-grouping | 同类型在槽内自动相邻 |
| 整齐堆叠 | grid stack | 卡片对齐网格的塔式布局 |
| 随意堆叠 | random stack | 卡片中心随机抖动的乱版布局 |

## 附录 B：同类游戏调研要点（来自 Web Search）

- **Sheep N Sheep（羊了个羊海外版）**：核心规则与本作完全一致，槽容量 7，三同消除
- **Mahjong Tile Triple Match**（Topy Games，500K+ 下载）：明确说"collection panel holds up to 7 tiles—if it fills up, you lose"，验证 7 槽 + 满即失败的规则
- **Mahjong Solitaire 算法**：经典做法是"逆向放置法"——先定结局空板，再倒推每一步消除组合往回放（保证有解）；本作不做这个，规则一致即可
- **3D 三消变体（如抓大鹅）**：本作降级为 2D 版本，跳过透视摆放的复杂度

