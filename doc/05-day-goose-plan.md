ns# Day 5 · 《抓大鹅》核心玩法复刻 · 实现规划

> 系列 Day 5 · 2026-05-29 · 仅设计，不动代码
> 玩法骨架沿用 Day 4《羊了个羊：星球》的三消 + 7 槽，新增维度：**3D 渲染 + 陀螺仪甩动**
> 这是本系列的**第一个 3D 游戏**，为后续 3D 项目沉淀 babylon.js 微信小游戏脚手架

---

## 〇 为什么是这一款（顺序说明）

按 [00-prologue](../articles/00-prologue.md) 的排程：

- Day 4 原本是《箭头会拐弯》，但跟 Day 3《一箭又一箭》骨架重合 80%，用户已跳过，提前把 Day 5 排期的《羊了个羊：星球》做掉。
- 所以原 Day 8 的《抓大鹅》自然顺位上来 → **Day 5 做《抓大鹅》**。

抓大鹅的玩法骨架与《羊了个羊》完全一致（**点击 → 入 7 槽 → 同类相邻 → 三消 → 槽满判负 / 全清判胜**），所以三消逻辑可以**直接平移 Day 4 的实现**。

抓大鹅唯一的真挑战是它的"皮"：

1. **3D 渲染**：物品在三维空间堆叠，透视摆放（Day 4 是 2D 平铺）
2. **陀螺仪甩动**：用户甩手机，物品因惯性飞起，下落后位置改变（Day 4 没有动力学）
3. **遮挡判定**：3D 下"哪些物品可点击"用射线拾取（Day 4 是 2D AABB 求并集）

这恰好是本系列第一次碰 3D。值得花一天把 babylon.js 在微信小游戏环境的脚手架沉淀出来，后面所有 3D 项目都受益。

---

## 一 玩法定调

### 1.1 一句话规则

> **场景里有一个圆形或方形容器（篮子/锅/大碗），里面三维堆叠着大量带类型的小物品（萝卜、玉米、辣椒……）。玩家点击物品，物品缩小飞入屏幕底部 7 格卡槽，槽内同类型自动聚合相邻；3 张同类型立即消除并左对齐压缩。槽满 7 张未消则失败，倒计时归零未清光也判负，牌堆全清则胜利。**
>
> **特色**：用户可甩手机，容器内物品因冲击力飞起、再因重力自然落回；下落后位置变化，原本被压住的物品可能被翻出来变成可点击。

### 1.2 七条核心规则

#### 规则 1：3D 容器 + 物品堆叠

- 主视图正中央是一个**容器 mesh**（MVP 用代码搭建：圆柱锅 = `MeshBuilder.CreateCylinder` 去掉顶面，配深棕色材质）
- 容器内放 N 个**物品 mesh**（MVP 用 9 种几何体 × 颜色变体：球、立方、圆锥、圆柱、胶囊、八面体、十二面体、扁圆盘、圆环）
- 物品有真实的 3D 位置 (x, y, z)，初始时堆在容器内，受重力下落直到稳定（启用一次物理 settle）

#### 规则 2：物品类型与数量

- **9 种类型 × 6 张 = 54 个物品**（必须是 3 的倍数）
- 比 Day 4 的 108 张少一半 —— 因为 3D 堆叠在小屏幕上塞 100+ 个物品视觉太挤，且每帧 draw call 翻倍
- 每种类型用一个**几何体 + 颜色**组合表达，不依赖纹理（MVP 阶段）

#### 规则 3：点击与拾取（替代 Day 4 的 5% 遮挡阈值）

- 用 `scene.pick(pointerX, pointerY)` 的射线拾取：射线从相机出发命中的**第一个**物品就是被点击的物品
- **3D 下不需要"5% 遮挡阈值"**：射线天然只能命中"看得见"的那一面 —— 看不见 = 不可点 = 物理上的天然遮挡
- 这其实是 3D 比 2D 的**降本点**：Day 4 写了一堆联合面积算法，3D 这里 **1 行 `scene.pick()` 全干掉**

#### 规则 4：飞入 7 格卡槽（沿用 Day 4）

- 屏幕底部固定 **7 个槽位**（2D 屏幕空间 UI，覆盖在 3D 之上）
- 点击的物品执行：
  1. 从 3D 容器中飞出（沿插值路径上升、缩小）
  2. 路径终点是该物品在 7 格中的**屏幕空间目标位置**（用 `Vector3.Project` 把 3D 位置投到屏幕，再过渡到 2D UI 槽位中心）
  3. 落入槽后切换为 2D 表现（从 mesh 变成屏幕空间 quad / 或者保留 mesh 但锁在固定屏幕坐标）
- **同类型聚合 / 三同消除 / 左移压缩** —— 全部沿用 Day 4 算法（见 4.1 复用清单）

#### 规则 5：陀螺仪甩动（核心特色）

- 监听 `wx.onAccelerometerChange` 或 `DeviceMotionEvent`
- 当**瞬时加速度模长** > 阈值（如 1.8g）时判定为"甩了一下"，方向取归一化加速度向量
- 给容器内所有物品施加一个**冲击速度** = `kick * direction`（kick ≈ 5~8 m/s）
- 物品被冲起、互相碰撞、再因重力自然回落 —— 让被压住的物品有机会翻出来
- 飞行过程中物品**仍可被点击**（点击射线不区分静止/飞行状态）
- 物理用 babylon 自带的 `HavokPhysicsPlugin` 或更轻的 `CannonJSPlugin` / `AmmoJSPlugin`；MVP 优先选 **Cannon**（包小、纯 JS、微信小游戏环境最稳）

#### 规则 6：倒计时 + 失败条件

- 顶部显示 60 秒倒计时
- **失败条件**（任一触发）：
  - 槽内卡片数 == 7 且未触发消除
  - 倒计时归零且牌堆未清空
- **顺序**：入槽 → 扫三同消除 → 判槽满 → 倒计时归零另起一条独立判定

#### 规则 7：胜利条件

- 牌堆所有物品消除完毕（槽内可有少量剩余）→ 胜利

### 1.3 与 Day 4《羊了个羊》的差异

| 维度 | Day 4 羊了个羊 | Day 5 抓大鹅 | 是否复用 |
|---|---|---|---|
| 玩法骨架（点击→入槽→三消→胜负） | ✅ | ✅ | **直接复用** |
| 渲染 | Phaser 3 (2D Canvas) | Babylon.js (3D WebGL) | ❌ 重写 |
| 物品视觉 | 卡片 + emoji/图标 | 几何体 + 颜色 | ❌ 重写 |
| 容器 | 无（铺在屏幕上） | 圆柱锅/篮子 | ❌ 新增 |
| 遮挡判定 | 联合面积 + 5% 阈值 | 射线拾取（天然 1 个 API） | ❌ 简化 |
| 卡槽 UI | 2D 屏幕底部 | **2D 屏幕底部**（即使主场景 3D，槽位仍 2D） | ✅ 复用思路 |
| 飞入动画 | 2D tween x/y | 3D→2D 投影 + tween | ⚠️ 适配 |
| 三消算法 | `findTripleIndex` / `removeTriple` / `computeInsertIndex` | 完全相同 | **直接复用** |
| 倒计时 | 无 | 60s | ❌ 新增 |
| 陀螺仪甩动 | 无 | 核心特色 | ❌ 新增 |
| 物理 | 无 | 重力 + 碰撞 + 冲击力 | ❌ 新增 |

> **结论**：Day 5 ≈ Day 4 玩法层 + 全新 3D/物理表现层 + 陀螺仪交互。

---

## 二 MVP 范围与非目标

### 2.1 MVP 必做（Day 5 当天）

- ✅ Babylon.js 微信小游戏脚手架跑通（关键里程碑）
- ✅ 容器（圆柱锅）+ 9 种几何物品 × 6 个 = 54 个物品
- ✅ 物品在容器内**初始堆叠**（启用物理 settle 1~2 秒后冻结）
- ✅ 射线拾取点击 → 高亮 → 飞入屏幕底部 7 格
- ✅ **三消逻辑 100% 复用 Day 4**（同类型聚合 / 三同消除 / 左移压缩）
- ✅ 顶部 60 秒倒计时 + 槽满判负 + 全清判胜 + 重开
- ✅ 陀螺仪甩动（监听加速度计 + 阈值触发 + 给所有物品施加冲击力）
- ✅ HUD：剩余物品数 / 槽容量 / 倒计时 / 重开按钮

### 2.2 MVP 不做（明确砍掉）

- ❌ 真实 3D 模型（萝卜、玉米模型留给第二轮，MVP 用几何体 + 颜色）
- ❌ PBR 材质 / 实时阴影（用 StandardMaterial + 烘焙环境光）
- ❌ 关卡系统 / 难度分级
- ❌ 道具（撤回 / 洗牌 / 移除一个）
- ❌ 排行榜 / 分享 / 复活
- ❌ 音效
- ❌ 容器形状切换（只做圆柱锅）
- ❌ 复杂粒子特效

### 2.3 第二轮（核心循环 OK 后再做）

- 用 GLB 模型替换几何体（10 个蔬菜/食材的低面模型，MeshOpt 压缩后每个 < 50KB）
- 加柔光投影 / 环境贴图
- 多关卡（增加物品类型数到 12，引入"特殊物品"如冰块需点 2 次）

---

## 三 技术方案

### 3.1 引擎选型

| 选项 | 评估 | 结论 |
|---|---|---|
| **Babylon.js 7** | 微信官方文档推荐，社区有 [`starter_for_3d_minigames`](https://github.com/ZhuoYitao/starter_for_3d_minigames) 现成脚手架；API 友好（`MeshBuilder` / `scene.pick` 一行调用） | ✅ **本次首选** |
| Three.js | 社区生态更大，但微信小游戏适配需要额外补丁；Cannon 集成更繁琐 | ❌ |
| Cocos Creator 3D | 编辑器形式，与本系列"代码 + AI 生成"主线不太契合 | ❌（留给以后压轴） |
| PlayCanvas | 编辑器/在线 IDE，本地工程化困难 | ❌ |

> **结论**：Babylon.js 7（ESM 引入）+ Cannon-es 物理 + 微信原生 `wx.createCanvas()`。

### 3.2 微信小游戏 3D 适配关键点

> 这是 Day 5 的**最大未知数**，必须在脚手架阶段验证完。

| # | 关键点 | 处理 |
|---|---|---|
| 1 | 微信小游戏沙盒里 `document.createElement('canvas')` 不能用 | 用 `wx.createCanvas()`，第二次调用是离屏 canvas |
| 2 | Babylon 默认会去找 `window.PointerEvent` / `addEventListener` | 用 `weapp-adapter` 把 `window` / `document` 垫起来 |
| 3 | 资源加载：`fetch` / `XMLHttpRequest` 行为不同 | MVP 阶段不用外部资源，全部用 `MeshBuilder.CreateXxx` 代码生成 |
| 4 | 默认 RuntimeURL 会去 `https://preview.babylonjs.com/...`（远程加载 textures.bin） | 用 `import * as BABYLON from '@babylonjs/core'` ESM 引入，避免 CDN |
| 5 | 微信不支持 WebGL2（部分机型） | Babylon 7 自动降级到 WebGL1，开关：`engine.disableUniformBuffers = true` |
| 6 | `requestAnimationFrame` 在小游戏环境是 `wx.requestAnimationFrame` | weapp-adapter 已处理 |
| 7 | 物理引擎选择 | Cannon-es 体积 ~100KB；HavokPhysics 体积 ~700KB（webasm 在小游戏沙盒不稳）→ **选 Cannon-es** |
| 8 | DPR：微信 canvas 的物理像素需要乘 dpr | `engine.setHardwareScalingLevel(1 / dpr)` |
| 9 | 真机性能：54 个物品 + 物理 + 60fps | 物品数控制 ≤ 54；物理 settle 完后停掉 world step；甩动时再开 |
| 10 | 触控事件：微信小游戏没有 PointerEvent | 用 `wx.onTouchStart` 转发到 `scene.pick(touch.clientX, touch.clientY)` |

### 3.3 Babylon 配置（脚手架最小集）

```js
// js/main.js
import * as BABYLON from '@babylonjs/core/Legacy/legacy';
// 或者按需 import：
//   '@babylonjs/core/Engines/engine'
//   '@babylonjs/core/Meshes/meshBuilder'
//   '@babylonjs/core/Lights/hemisphericLight'
//   '@babylonjs/core/Physics/v1/physicsImpostor'
import * as CANNON from 'cannon-es';

const canvas = wx.createCanvas();   // 主 canvas
const engine = new BABYLON.Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true,
  disableWebGL2Support: false,      // 先尝试 WebGL2，自动降级
});
engine.setHardwareScalingLevel(1 / DPR);

const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.95, 0.93, 0.85, 1.0); // 暖米色
scene.collisionsEnabled = true;
scene.enablePhysics(
  new BABYLON.Vector3(0, -9.81, 0),
  new BABYLON.CannonJSPlugin(true, 10, CANNON),
);

// 相机：俯视容器（轻微倾角，看清堆叠）
const camera = new BABYLON.ArcRotateCamera(
  'cam',
  -Math.PI / 2,         // alpha：从 -X 看向 +X
  Math.PI / 4,          // beta：俯视 45°
  9,                    // 距离
  BABYLON.Vector3.Zero(),
  scene,
);
camera.attachControl(canvas, false);    // MVP 阶段允许调试旋转，发布前关掉
camera.lowerBetaLimit = 0.3;
camera.upperBetaLimit = Math.PI / 2.2;

// 光：半球光 + 方向光（柔和投影感）
const hemiLight = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), scene);
hemiLight.intensity = 0.6;
const dirLight = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(-1, -2, -1), scene);
dirLight.intensity = 0.8;

engine.runRenderLoop(() => scene.render());
```

### 3.4 目录结构（沿用三段式 + 新增 3d 目录）

```
day-05-goose/
├── game.js                         # 微信小游戏入口（沿用 day-04 结构）
├── game.json
├── project.config.json
├── project.private.config.json
├── index.html                      # 网页入口
├── js/
│   ├── main.js                     # 引擎/相机/光初始化
│   ├── libs/
│   │   ├── weapp-adapter.js        # 微信 polyfill（用 finscn/weapp-adapter）
│   │   ├── babylon.js              # Babylon UMD bundle（ESM 在小游戏环境兼容性差）
│   │   ├── cannon.js               # Cannon UMD bundle
│   │   └── symbol.js
│   ├── core/
│   │   ├── config.js               # 类型/数量/颜色/阈值/时长（参考 day-04）
│   │   ├── LevelGenerator.js       # 物品生成（位置随机 + 物理 settle）
│   │   └── MatchEngine.js          # ★ 三消纯逻辑模块（从 day-04 GameScene 抽出来）
│   └── scene/
│       ├── GameScene.js            # 主场景（3D 容器 + 物品 + 拾取 + 飞入动画）
│       ├── HUDLayer.js             # 顶部倒计时 + 底部 7 格槽（用 Babylon GUI 或 DOM 覆层）
│       └── Shake.js                # 陀螺仪甩动监听 + 阈值判断 + 施加冲击力
└── README.md
```

> **关键**：`MatchEngine.js` 从 day-04 抽出来后，day-04 / day-05 都引用同一份纯逻辑，未来再做三消游戏直接复用。这是 100 天计划真正在沉淀工具的体现。

### 3.5 关键数据结构

```js
// core/config.js
export const ITEM_TYPES = 9;
export const ITEMS_PER_TYPE = 6;
export const TOTAL_ITEMS = 54;        // = 9 × 6
export const SLOT_CAPACITY = 7;
export const TRIPLE_COUNT = 3;
export const COUNTDOWN_SEC = 60;

// 9 种类型的几何体 + 颜色（MVP 占位）
export const TYPE_GEOMETRIES = [
  'sphere', 'box', 'cone', 'cylinder', 'capsule',
  'octahedron', 'dodecahedron', 'disc', 'torus',
];
export const TYPE_COLORS = [
  '#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9',
  '#4dabf7', '#748ffc', '#b197fc', '#f783ac',
];

// 容器（圆柱锅）参数
export const POT_RADIUS = 2.5;
export const POT_HEIGHT = 2.0;
export const POT_THICKNESS = 0.1;

// 陀螺仪甩动
export const SHAKE_THRESHOLD_G = 1.8;     // 触发阈值（重力倍数）
export const SHAKE_KICK_VELOCITY = 6.0;   // 物品被甩起的初速度（m/s）
export const SHAKE_COOLDOWN_MS = 600;     // 两次甩动最小间隔

// 物品逻辑模型（与 Phaser 时一致，但 x/y 换成 Vector3）
{
  id: number,
  type: number,                        // 0..ITEM_TYPES-1
  mesh: BABYLON.Mesh,                  // 3D mesh
  impostor: BABYLON.PhysicsImpostor,   // 物理刚体
  state: 'in_pot' | 'flying' | 'in_slot' | 'removed',
}

// 全局状态
{
  items: Item[],
  slot: Item[],                        // 长度 0..7
  status: 'playing' | 'win' | 'lose',
  isAnimating: boolean,
  countdownLeft: number,               // 秒，每帧 -dt
}
```

### 3.6 屏幕布局（720×1280 逻辑分辨率，参考 Day 4）

```
┌─────────────────────────────────┐
│  顶部 HUD                        │  y=0~180
│   抓大鹅 · 剩余 54/54 · ⏱ 60s    │
├─────────────────────────────────┤
│                                 │
│       〔3D 视图：容器 + 物品〕    │  y=180~1080
│       ArcRotate Camera 俯视      │
│       54 个物品在锅里随机堆叠     │
│                                 │
│       (甩动手机时物品飞起)        │
│                                 │
├─────────────────────────────────┤
│ ▢ ▢ ▢ ▢ ▢ ▢ ▢                  │  y=1080~1240 卡槽（2D 覆层）
└─────────────────────────────────┘
```

> HUD + 卡槽用 **Babylon GUI（AdvancedDynamicTexture.CreateFullscreenUI）** 渲染。它本质上还是 3D，但可以做屏幕空间的 2D UI。也可以用单独的 DOM/Canvas 覆层，但小游戏沙盒里 DOM 不通用，**优先用 Babylon GUI**。

### 3.7 物品 mesh 构造（代码生成）

```js
function buildItemMesh(scene, type, position) {
  let mesh;
  switch (TYPE_GEOMETRIES[type]) {
    case 'sphere':
      mesh = BABYLON.MeshBuilder.CreateSphere(`item_${id}`, { diameter: 0.5 }, scene);
      break;
    case 'box':
      mesh = BABYLON.MeshBuilder.CreateBox(`item_${id}`, { size: 0.5 }, scene);
      break;
    case 'cone':
      mesh = BABYLON.MeshBuilder.CreateCylinder(`item_${id}`, {
        height: 0.5, diameterTop: 0, diameterBottom: 0.5,
      }, scene);
      break;
    // ... 其余类型
  }
  mesh.position = position.clone();
  // 材质：单色 + 一点点高光
  const mat = new BABYLON.StandardMaterial(`mat_${id}`, scene);
  mat.diffuseColor = BABYLON.Color3.FromHexString(TYPE_COLORS[type]);
  mat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
  mesh.material = mat;
  // 物理：球形碰撞器（最快，54 个跑得动）
  mesh.physicsImpostor = new BABYLON.PhysicsImpostor(
    mesh, BABYLON.PhysicsImpostor.SphereImpostor,
    { mass: 1, restitution: 0.3, friction: 0.5 }, scene,
  );
  return mesh;
}
```

> **物理简化**：所有物品都用**球形碰撞器**（即使视觉是立方体），换 80% 性能 / 20% 视觉真实度。MVP 阶段完全可接受。

### 3.8 容器构造（圆柱锅 = 圆柱去顶 + 圆盘底）

```js
function buildPot(scene) {
  // 锅壁：薄壁圆柱（外径 R，内径 R-thickness，去掉顶面）
  const wall = BABYLON.MeshBuilder.CreateCylinder('pot_wall', {
    diameterTop: POT_RADIUS * 2,
    diameterBottom: POT_RADIUS * 2,
    height: POT_HEIGHT,
    tessellation: 48,
    sideOrientation: BABYLON.Mesh.DOUBLESIDE,
  }, scene);
  wall.position.y = POT_HEIGHT / 2;
  // 锅壁的物理碰撞：用一组矩形板拼出 24 边形围栏
  const segments = 24;
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const segWall = BABYLON.MeshBuilder.CreateBox(`pot_seg_${i}`, {
      width: 0.05, height: POT_HEIGHT, depth: (Math.PI * 2 * POT_RADIUS) / segments * 1.05,
    }, scene);
    segWall.position.set(
      Math.cos(angle) * POT_RADIUS,
      POT_HEIGHT / 2,
      Math.sin(angle) * POT_RADIUS,
    );
    segWall.rotation.y = -angle;
    segWall.isVisible = false;     // 不渲染，只做物理墙
    segWall.physicsImpostor = new BABYLON.PhysicsImpostor(
      segWall, BABYLON.PhysicsImpostor.BoxImpostor,
      { mass: 0, restitution: 0.2 }, scene,
    );
  }
  // 锅底：圆盘
  const bottom = BABYLON.MeshBuilder.CreateDisc('pot_bottom', { radius: POT_RADIUS, tessellation: 48 }, scene);
  bottom.rotation.x = Math.PI / 2;
  bottom.position.y = 0;
  bottom.physicsImpostor = new BABYLON.PhysicsImpostor(
    bottom, BABYLON.PhysicsImpostor.PlaneImpostor,
    { mass: 0, restitution: 0.2 }, scene,
  );
  // 给锅壁/锅底上颜色
  const potMat = new BABYLON.StandardMaterial('potMat', scene);
  potMat.diffuseColor = BABYLON.Color3.FromHexString('#5a3a1a');
  wall.material = potMat;
  bottom.material = potMat;
}
```

### 3.9 关卡生成（位置随机 + 物理 settle）

```js
function generateLevel(scene) {
  // 1) 类型数组打散
  const types = [];
  for (let t = 0; t < ITEM_TYPES; t++) {
    for (let i = 0; i < ITEMS_PER_TYPE; i++) types.push(t);
  }
  shuffle(types);

  // 2) 在锅口上方随机生成位置（让物理引擎自由下落 settle）
  const items = [];
  for (let i = 0; i < TOTAL_ITEMS; i++) {
    // 锅口上方 0.5 ~ 3 m 高度，xz 在锅内随机
    const r = Math.random() * (POT_RADIUS - 0.3);
    const a = Math.random() * Math.PI * 2;
    const pos = new BABYLON.Vector3(
      Math.cos(a) * r,
      POT_HEIGHT + 0.5 + Math.random() * 2,
      Math.sin(a) * r,
    );
    const mesh = buildItemMesh(scene, types[i], pos);
    items.push({ id: i, type: types[i], mesh, state: 'in_pot' });
  }

  // 3) settle：让 babylon 跑 1.5 秒物理（48 帧 * dt=1/30）
  //    settle 完成后冻结物品（设 mass = 0 暂停，等甩动时再 mass = 1）
  scene.physicsEnabled = true;
  return items;
}

// settle 完成的判定：场上所有物品速度模长 < 0.05 持续 0.5 秒
function isAllSettled(items) {
  return items.every((it) => {
    const v = it.mesh.physicsImpostor.getLinearVelocity();
    return v && v.length() < 0.05;
  });
}
```

### 3.10 核心算法 A：射线拾取（替代 Day 4 遮挡判定）

```js
canvas.addEventListener('pointerdown', (evt) => {
  const pickResult = scene.pick(scene.pointerX, scene.pointerY,
    (mesh) => mesh.name.startsWith('item_'),
  );
  if (pickResult.hit && pickResult.pickedMesh) {
    const item = items.find((it) => it.mesh === pickResult.pickedMesh);
    if (item && item.state === 'in_pot') {
      onItemClick(item);
    }
  }
});

// 微信小游戏：用 wx.onTouchStart 替代 pointerdown
wx.onTouchStart((e) => {
  const t = e.touches[0];
  const pickResult = scene.pick(t.clientX * DPR, t.clientY * DPR,
    (mesh) => mesh.name.startsWith('item_'),
  );
  // 同上
});
```

> **关键收益**：射线只命中"看得见的最前面那一个" mesh，等价于 Day 4 的"未被遮挡的卡片"判定。**1 个 API 替代了 ~80 行联合面积代码**。

### 3.11 核心算法 B：物品飞入卡槽（3D → 2D 投影 + tween）

```js
async function flyItemToSlot(item, slotIdx) {
  item.state = 'flying';
  // 1) 关掉物理（变成 kinematic，跟着 tween 走）
  item.mesh.physicsImpostor.dispose();
  item.mesh.physicsImpostor = null;

  // 2) 计算槽位 i 的屏幕坐标 → 反投影成 3D 世界坐标（深度 = 相机近平面 + 1）
  const slotScreenX = SLOT_CENTER_X[slotIdx];   // 屏幕像素
  const slotScreenY = SLOT_CENTER_Y;
  const targetWorld = BABYLON.Vector3.Unproject(
    new BABYLON.Vector3(slotScreenX, slotScreenY, 0.95),
    engine.getRenderWidth(), engine.getRenderHeight(),
    BABYLON.Matrix.Identity(),
    scene.getViewMatrix(),
    scene.getProjectionMatrix(),
  );

  // 3) tween：position lerp + scale lerp（1→0.5）+ rotation 旋转 360°
  const startPos = item.mesh.position.clone();
  const startScale = item.mesh.scaling.clone();
  const T = 600; // ms
  const t0 = performance.now();
  return new Promise((resolve) => {
    const observer = scene.onBeforeRenderObservable.add(() => {
      const t = (performance.now() - t0) / T;
      if (t >= 1) {
        item.mesh.position.copyFrom(targetWorld);
        item.mesh.scaling.scaleInPlace(0.5);
        scene.onBeforeRenderObservable.remove(observer);
        item.state = 'in_slot';
        resolve();
        return;
      }
      // ease-out cubic
      const k = 1 - Math.pow(1 - t, 3);
      item.mesh.position = BABYLON.Vector3.Lerp(startPos, targetWorld, k);
      const s = 1 - 0.5 * k;
      item.mesh.scaling.set(startScale.x * s, startScale.y * s, startScale.z * s);
      item.mesh.rotation.y += 0.15;
    });
  });
}
```

> **简化方案**：飞入完成后，物品 mesh 仍保留在 3D 场景，但锁在屏幕固定坐标 —— **不需要切换成 2D quad**，让 3D mesh 跟着相机移动即可（因为相机不动，等价于固定屏幕位置）。

### 3.12 核心算法 C：三消模块（直接复用 Day 4）

```js
// core/MatchEngine.js  (从 day-04 GameScene 抽出，纯逻辑)
export class MatchEngine {
  constructor({ slotCapacity, tripleCount }) {
    this.slot = [];
    this.SLOT_CAPACITY = slotCapacity;
    this.TRIPLE_COUNT = tripleCount;
  }
  computeInsertIndex(itemType) { /* 找最后一张同类型的 idx + 1 */ }
  insert(item) { /* 插入并返回 insertIdx */ }
  findTriple() { /* 扫描连续 3 张同类型，返回 startIdx 或 -1 */ }
  removeTriple(startIdx) { /* splice 3 张并返回 */ }
  isFull() { return this.slot.length >= this.SLOT_CAPACITY; }
}
```

> 这个模块的所有函数与 Day 4 GameScene 里的 `findTripleIndex / computeInsertIndex / removeTriple` **逐行一致**，只是参数从 `Phaser.GameObjects.Container` 换成 `BABYLON.Mesh`（实际上模块只关心 `item.type`，连 mesh 都不依赖）。

### 3.13 核心算法 D：陀螺仪甩动

```js
// scene/Shake.js
let lastShakeTs = 0;

function startShakeListener(items) {
  const handler = (res) => {
    const now = Date.now();
    if (now - lastShakeTs < SHAKE_COOLDOWN_MS) return;
    // 加速度模长（res.x/y/z 单位 g）
    const mag = Math.sqrt(res.x * res.x + res.y * res.y + res.z * res.z);
    if (mag < SHAKE_THRESHOLD_G) return;
    lastShakeTs = now;
    // 归一化方向（在 babylon 坐标系下：x→水平，y→上下，z→前后）
    const dir = new BABYLON.Vector3(res.x / mag, Math.abs(res.y / mag), res.z / mag);
    // 给所有"在锅内"的物品施加冲击速度
    for (const it of items) {
      if (it.state !== 'in_pot' || !it.mesh.physicsImpostor) continue;
      // 重新激活物理（如果之前 settle 后冻结了）
      if (it.mesh.physicsImpostor.mass === 0) {
        it.mesh.physicsImpostor.setMass(1);
      }
      const kick = dir.scale(SHAKE_KICK_VELOCITY * (0.7 + Math.random() * 0.6));
      it.mesh.physicsImpostor.setLinearVelocity(kick);
    }
  };

  if (typeof wx !== 'undefined' && wx.onAccelerometerChange) {
    wx.startAccelerometer({ interval: 'game' });
    wx.onAccelerometerChange(handler);
  } else if (typeof window !== 'undefined' && window.DeviceMotionEvent) {
    window.addEventListener('devicemotion', (ev) => {
      const a = ev.accelerationIncludingGravity;
      if (a) handler({ x: a.x / 9.81, y: a.y / 9.81, z: a.z / 9.81 });
    });
  }
}
```

> **手心向下校准**：wx 的加速度计 y 轴是"垂直手机屏幕"，需要根据手机姿态做投影；MVP 阶段直接取模长 + 大致方向就够，不做精细校准。

### 3.14 核心交互流程（状态机）

```
 ┌──────────────────────────┐
 │  Boot：Engine + Scene    │
 │  Camera + Lights         │
 │  buildPot()              │
 │  generateLevel() (54 件) │
 │  物理 settle 1.5 s       │
 │  startShakeListener()    │
 └────────┬─────────────────┘
          ▼
 ┌──────────────────────────┐
 │ Playing 主循环           │
 │  - 倒计时每秒 -1         │
 │  - render loop 60fps     │
 │                          │
 │  事件 1：触摸点击         │
 │    → scene.pick()        │
 │    → onItemClick()       │
 │                          │
 │  事件 2：陀螺仪甩动       │
 │    → 给所有 in_pot mesh   │
 │      施加随机方向冲击     │
 │                          │
 │  事件 3：倒计时归零       │
 │    → if 还有 in_pot → 失败│
 └────────┬─────────────────┘
          │
          ▼
 onItemClick(item):
   1. 关物理 + state=flying
   2. flyItemToSlot(item, idx)
   3. matchEngine.insert(item)
   4. 同类型卡片右移动画
   5. const triple = matchEngine.findTriple()
      if triple: removeTriple + 左移动画
   6. 判胜负：
      - 全清 → win
      - 槽满 7 → lose
```

### 3.15 微信小游戏适配清单（继承 day-04 + 3D 新坑）

| # | 坑 | 处理 |
|---|---|---|
| 1 | `document` / `window` 缺失 | weapp-adapter |
| 2 | `wx.createCanvas()` 必须用主 canvas | `game.js` 第一行获取 |
| 3 | Babylon UMD vs ESM | 用 UMD bundle（`babylon.js`）放进 `js/libs/`，避免动态 import |
| 4 | Cannon-es 在小游戏环境的 ESM 引入 | 用 cannon UMD（cannon.min.js） |
| 5 | 触控事件 | `wx.onTouchStart` 转发，不要依赖 PointerEvent |
| 6 | 陀螺仪 | `wx.startAccelerometer({ interval: 'game' })` |
| 7 | 屏幕尺寸 | `wx.getSystemInfoSync()`，配合 `engine.setHardwareScalingLevel` |
| 8 | 不允许动态加载远程贴图 | 不用纹理，用纯色材质 |
| 9 | game.json 不要 workers / subPackages | 沿用 day-04 |
| 10 | iOS 加速度计需要请求权限 | MVP 阶段先不弹权限，浏览器 demo 提示用户授权 |

---

## 四 性能预算（与 Day 4 对比）

| 维度 | Day 4 羊了个羊（2D） | Day 5 抓大鹅（3D） | 风险 |
|---|---|---|---|
| 物品总数 | 108 | **54** | 低（数量减半） |
| 每帧 draw call | ~80 | **~70**（54 物品 + 锅 + GUI） | 低 |
| 物理刚体 | 0 | **54 + 锅墙 24** | 中（物理 settle 阶段 CPU 占用高） |
| 拾取复杂度 | O(N²) | **O(N) 射线遍历** | 低 |
| 陀螺仪事件 | — | 30Hz | 低 |
| 内存 | ~30MB | **~80MB**（Babylon + 物理） | 中（小游戏 sandbox 安全） |

**性能优化策略**：

1. **物理 settle 完冻结**：物品稳定后 `setMass(0)`，render loop 跳过物理 step
2. **甩动时短时激活**：施加冲击力时设回 `mass=1`，3 秒后再次冻结
3. **mesh instancing**：9 种类型每种克隆 6 个，共享几何体（`mesh.createInstance`）
4. **关掉镜面反射 / 阴影**：MVP 不用 shadowGenerator
5. **GPU picking 兜底**：如果 CPU pick 在 54 物品下卡，用 `BABYLON.GPUPicker`（一行替换）

---

## 五 素材清单（Day 5 第一轮 0 外部素材）

| 类型 | 资源 | MVP 处理 |
|---|---|---|
| 容器（锅） | 圆柱 + 圆盘 + 棕色材质 | `MeshBuilder` 代码生成 |
| 物品 | 9 种几何体 × 颜色 | `MeshBuilder.CreateXxx` 代码生成 |
| 7 格卡槽 | 圆角矩形 + 编号 | Babylon GUI Rectangle |
| HUD | 倒计时数字 + 剩余数 | Babylon GUI TextBlock |
| 背景 | 浅米色纯色 | `scene.clearColor` |
| 失败/胜利弹层 | 半透明 + 文字 | Babylon GUI Container |

> **第二轮（核心循环 OK 后）**：用 GLB 模型替换几何体（食材类小模型，AI 生模型 / 找开源），加柔光投影。

---

## 六 实现步骤（当天执行计划）

| # | 阶段 | 内容 | 预估 |
|---|---|---|---|
| 1 | 脚手架（最关键） | 拷贝 day-04 改名 day-05；引入 babylon UMD + cannon UMD + weapp-adapter；空场景 + 一个旋转立方体；微信开发者工具能跑 | **90 min** |
| 2 | 引擎封装 | Engine + Scene + ArcRotateCamera + 半球光 + 方向光 | 20 min |
| 3 | 容器构造 | `buildPot()` + 24 段碰撞墙 + 锅底物理 | 30 min |
| 4 | 物品构造 | 9 种 `buildItemMesh` + 配色 + 球形碰撞器 | 30 min |
| 5 | 关卡生成 + 物理 settle | `generateLevel()` + 1.5s settle + 冻结 | 30 min |
| 6 | 拾取 + 飞入 | `scene.pick` + 屏幕反投影 + 3D tween | 60 min |
| 7 | MatchEngine 抽取 | 从 day-04 GameScene 抽 3 个函数到 `core/MatchEngine.js`，day-05 引入 | 20 min |
| 8 | 卡槽 UI（Babylon GUI） | 7 格 + 入槽位置计算 + 同类型聚合渲染 | 60 min |
| 9 | 三消消除动画 | 缩小 + 淡出 + 左移压缩（用 babylon `Animation`） | 30 min |
| 10 | 倒计时 + 胜负 | HUD 数字 + 弹层 + 重开 | 25 min |
| 11 | 陀螺仪甩动 | `wx.onAccelerometerChange` + 阈值 + 冲击力 + cooldown | 40 min |
| 12 | 微信预览 | run_game / get_logs / 修兼容 | 45 min |
| 13 | 调优 | 性能（mass=0 冻结）、视角、物品大小、动画手感 | 40 min |

> **总计**：≈ 8 小时（比 Day 4 多 2 小时，主要花在脚手架 + 物理调试）

---

## 七 验收标准

Day 5 必须同时满足：

- [ ] 微信开发者工具 / weixin-minigame-helper 预览端能跑（无报错）
- [ ] 3D 容器（锅）正确渲染，54 个物品在锅内堆叠
- [ ] 9 种类型颜色清晰可辨（即使几何体相似）
- [ ] 物理 settle：物品自然下落、互相碰撞、最终静止
- [ ] **触摸/点击物品**：射线命中最前面的物品 → 飞入卡槽
- [ ] 卡槽内**同类型自动聚合**（沿用 Day 4 算法）
- [ ] 槽内 3 张同类型 → 立即消除 + 左移
- [ ] 槽满 7 张未消 → 失败
- [ ] 牌堆全清 → 胜利
- [ ] **倒计时 60 秒**正常工作，归零判负
- [ ] **甩动手机 / 浏览器 devicemotion 模拟**：物品被冲起、碰撞、回落，被压住的物品翻出来
- [ ] 重开按钮能重新生成关卡
- [ ] 60fps 不掉帧（物品静止时；甩动瞬间允许短暂 30fps）
- [ ] `MatchEngine.js` 模块可被 day-04 也引用（验证抽离正确）

---

## 八 已识别的坑与对策

| # | 坑 | 对策 |
|---|---|---|
| 1 | Babylon UMD 在小游戏沙盒里 `window.BABYLON` 不存在 | 用 ES module 引入，或在 weapp-adapter 之后手动注入 `GameGlobal.BABYLON = window.BABYLON` |
| 2 | Cannon 物理对小球碰撞容易"卡墙" | 锅壁段数从 24 降到 16；增大物品 mass、降低 restitution |
| 3 | 物品堆叠 settle 太久（>3s） | 给每个物品初始向下速度 -2 m/s，加速 settle |
| 4 | 射线 pick 在物品紧贴时返回错误 mesh | 用 `fastCheck = false`，遍历所有候选取最前面 |
| 5 | 飞入动画时物品被其他物品遮挡（视觉穿模） | 飞行时把 mesh 的 `renderingGroupId` 设到最高（2），最后还原 |
| 6 | 陀螺仪在 iOS Safari 需要权限 | 先做浏览器 demo，加一个"启用甩动"按钮调用 `DeviceMotionEvent.requestPermission()` |
| 7 | 微信开发者工具桌面端**不模拟陀螺仪** | 加键盘 hack：按空格 = 模拟一次甩动（仅 dev 模式） |
| 8 | 物品 mesh 数量大时 GUI 卡顿 | Babylon GUI 用 fullscreen UI 模式而不是 mesh 模式 |
| 9 | 屏幕反投影坐标精度（DPR） | `scene.pick` 用的是 `scene.pointerX/Y`（已是物理像素），槽位坐标也用物理像素 |
| 10 | 物品消除后 mesh 没释放，内存泄漏 | `mesh.dispose()` + `physicsImpostor.dispose()` + `material.dispose()` |
| 11 | 重开（scene.restart 等价物）会泄漏 mesh | 不用 restart，写一个 `resetLevel()` 函数：dispose 所有 item，重新 generate |
| 12 | 倒计时和入槽动画并发：动画期间倒计时不能扣秒？ | 倒计时独立线程，无视动画锁；玩家被动画"偷掉"半秒可接受 |
| 13 | wx.startAccelerometer 在某些机型 30Hz 卡 | 改用 `interval: 'normal'`（200ms）退化版本 |
| 14 | 用户甩太猛物品飞出锅口外（物理穿模） | 锅壁碰撞器再加 1 倍高度（看不见的延伸墙） |
| 15 | day-04 的 MatchEngine 抽取破坏 day-04 已通过的功能 | 抽取后**先在 day-04 验证一遍**（最小回归测试），再给 day-05 用 |

---

## 九 关键设计决策（待用户确认）

> 这一节是给用户拍板用的，不替用户决定。下面是**默认推荐方案**，加 `?` 的部分需要用户回答。

| # | 决策点 | 默认推荐 | 是否需要用户确认 |
|---|---|---|---|
| 1 | 3D 引擎 | **Babylon.js 7** | ✅ 用户已说"用 babylon.js"，确认 |
| 2 | 物理引擎 | **Cannon-es UMD**（小、稳） | ❓ 需要 |
| 3 | 物品类型数 × 每类张数 | **9 × 6 = 54** | ❓ Day 4 是 12×9=108，3D 减半 |
| 4 | 容器形状 | **圆柱锅**（先做这一种） | ❓ 是否需要篮子/方形碗也做？ |
| 5 | 物品视觉 | **9 种几何体 + 9 种颜色** | ❓ 还是单一几何（如全是球）+ 颜色区分？ |
| 6 | 倒计时 | **60 秒** | ❓ 用户描述"顶部计时" |
| 7 | 甩动阈值 | **1.8g** | ❓ 试玩后调 |
| 8 | 槽容量 | **7**（沿用 day-04） | ✅ 用户描述明确 |
| 9 | 三同消除 | **3 张**（沿用 day-04） | ✅ |
| 10 | 是否做"飞行中也可点击" | **做**（用户描述要求） | ✅ |
| 11 | 是否抽 MatchEngine 共享给 day-04 | **抽** | ❓ 工程量 +20min，但收益高 |
| 12 | UI 层方案 | **Babylon GUI 全屏 UI** | ❓ 还是用 DOM/Canvas 覆层 |

> **建议工作流**：先把 1/2/3/4/5 这几个跟用户对一遍（影响脚手架），其余可以边做边定。

---

## 十 与 Day 4 的代码复用清单

### 可以直接复用

- ✅ Day 4 GameScene 的 `findTripleIndex` / `computeInsertIndex` / `removeTriple` → 抽到 `core/MatchEngine.js`
- ✅ Day 4 的"逻辑分辨率 + uiScale"模板（HUD / 卡槽位置计算）
- ✅ `endGame()` 弹层结构
- ✅ `project.config.json` / `project.private.config.json`（改 projectname）
- ✅ Day 4 的"槽满判负 / 全清判胜 / 顺序很重要"思路

### 需要重写

- ❌ 渲染层（Phaser → Babylon）
- ❌ 关卡生成（2D 坐标 → 3D 位置 + 物理 settle）
- ❌ 遮挡判定（联合面积 → 射线拾取，**大幅简化**）
- ❌ 输入处理（pointerdown → wx.onTouchStart）
- ❌ 飞入动画（2D tween → 3D Lerp + 屏幕投影）

### 新增

- ➕ Babylon Engine + Scene + Camera + Light 初始化
- ➕ 物理引擎（Cannon-es）
- ➕ 容器 mesh 构造
- ➕ 陀螺仪监听 + 冲击力
- ➕ 倒计时
- ➕ 微信小游戏 3D 适配（weapp-adapter）

---

## 十一 实现状态

- ⏭ **2026-05-29 设计中**：等用户确认第九节的待决项
- ⏭ 实现 day-05-goose
- ⏭ 抽 day-04 GameScene 中的三消逻辑到 `core/MatchEngine.js`
- ⏭ 写复盘文章 `articles/05-day-goose.md`

---

## 附录 A：玩法术语对照（增量）

| 中文 | 英文 | 说明 |
|---|---|---|
| 容器 | pot / basket / bowl | 装物品的 3D 容器 |
| 物品 | item | 容器内的可点击物体 |
| 甩动 | shake / fling | 通过陀螺仪触发的冲击力 |
| 射线拾取 | raycast picking | 屏幕点击转 3D 命中检测 |
| 物理 settle | physics settle | 让物理引擎自由演化直到稳定 |
| 屏幕反投影 | unproject | 屏幕坐标转 3D 世界坐标 |

## 附录 B：Babylon.js 微信小游戏适配资源

- [`ZhuoYitao/starter_for_3d_minigames`](https://github.com/ZhuoYitao/starter_for_3d_minigames)：现成 starter（Babylon + Cocos + Three 三种）
- [微信小游戏 · 通用引擎适配方案](https://developers.weixin.qq.com/minigame/dev/guide/game-engine/common-adaptation.html)：官方 weapp-adapter 文档
- [`finscn/weapp-adapter`](https://github.com/finscn/weapp-adapter)：社区维护的 adapter（比官方 demo 完整）
- [Babylon.js 官方拾取文档](https://doc.babylonjs.com/features/featuresDeepDive/mesh/interactions/picking_collisions)：`scene.pick` / `pickWithRay` / GPUPicker
