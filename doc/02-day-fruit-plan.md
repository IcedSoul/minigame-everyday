
# Day 2 · 《消个水果》核心玩法复刻 · 实现规划

> 系列 Day 2 · 2026-05-25 · 仅设计，不动代码
> 上一稿（"卡槽相邻二消"基于 LLM 印象）已被用户判定与真实玩法差异过大，已废弃；本稿基于用户口述真实玩法 + 截图重新立项。

---

## 一 玩法定调（基于用户口述与截图）

### 1.1 一句话规则

> **屏幕上方一片悬浮水果（无重力错落叠放），下方是一道 Y 字漏斗连着一段竖直窄通道。点击空中任意水果即给它单独施加重力，水果开始下落，途中会被仍悬浮的其它水果与漏斗墙体物理阻挡；水果最终汇入底部窄通道堆叠。通道底部最下两颗同色水果自动消除。通道一旦堆满 4 颗且再无可消除时判负；屏幕全部清空判胜。**

### 1.2 五条核心规则（从截图与用户描述提炼）

#### 规则 1：默认无重力 · 点击才掉落
- 场景生成时，所有水果以圆形 body 散布在上半屏，**全部 sleeping / 无重力**，互相错开（不重叠）
- 玩家点击未被遮挡的水果 → 给那一颗水果开启重力 → 水果下落

#### 规则 2：物理阻挡（关键）
- 下落途中，**会被仍悬浮的其他水果挡住**（接触即静止压在上面）
- 被压住的悬浮水果不会被推开（视为很重的"准静态"），但当其下方支撑消失时也可能跟着滑落 —— 截图里的"半空堆叠"形态正是这种行为
- 也会被 **Y 字漏斗的两片斜墙** 与 **窄通道两侧竖墙** 挡住

#### 规则 3：Y 字漏斗 + 底部窄通道
- 屏幕下半部分是一道呈 Y 字形的几何障碍：左右两片向中心收拢的斜墙 + 中间一段竖直窄通道
- 通道宽度 ≈ **1 颗水果直径 + 一点缝隙**（容纳"垂直堆叠"的同心轴）
- 通道高度仅容纳 **4 颗水果** 垂直堆叠（这是关键的失败阈值）

#### 规则 4：通道底部相邻同色 → 消除
- 通道里水果按 y 排序排列，**y 最大的那一颗 与 倒数第二颗 同色** → 触发消除
- 消除有 ≈ 250 ms 冷却（避免视觉串）；消除时上面的水果靠重力自然下沉补位
- 这是**物理触发** + **位置触发**（不是按数组索引），因此通道里如果出现"非相邻同色"是不会消的

#### 规则 5：胜负判定
- **胜利**：屏幕水果全部消除 → 计数器为 0 触发胜利
- **失败**：通道里 ≥ 4 颗 + 全静止（速度近 0）+ 按 y 排序无相邻同色对 → 触发失败

### 1.3 与同类的差异点（避免设计混淆）

| 游戏 | 核心区别 |
|---|---|
| 《打个螺丝》 | 收纳玩法，不存在重力/物理；颜色盒子 + 备选区惩罚 |
| 《羊了个羊》 | 同色 3 个就地消，无物理 |
| 《合成大西瓜》 | 同色合体升级，不消除；从顶部下落 |
| **《消个水果》** | **物理重力 + Y 字漏斗 + 底部 4 格窄通道二消**（点击触发单体重力是核心创新点） |

---

## 二 MVP 范围与非目标

### 2.1 MVP 必做（Day 2 当天）

- ✅ 全屏水果错落悬浮（约 6 色 × 4 对 × 2 颗 = **48 颗** 起步）
- ✅ 点击单颗 → 该颗获重力 → 下落 + 物理阻挡
- ✅ Y 字漏斗 + 窄通道几何（静态刚体）
- ✅ 通道底两颗同色冷却消除
- ✅ 胜利 / 失败弹层 + 一键重开
- ✅ 仅代码绘制（六色实心圆 + 不同色 stroke 即可，不下载素材）

### 2.2 MVP 不做（明确砍掉）

- ❌ 截图里的"剩余 / 进度 / 解锁 / 消除道具 / 打乱道具" 等 UI（先不做）
- ❌ 多关卡 / 关卡数据
- ❌ 横向传送带、广告复活、计分排行
- ❌ 真实水果贴图与音效（第二轮再补素材）
- ❌ 粒子效果与精细消除动画（用 1 个 alpha tween 占位）

---

## 三 技术方案

### 3.1 引擎与物理选型（关键决策）

| 选项 | 评估 | 结论 |
|---|---|---|
| **Phaser 3 + Arcade Physics** | 仅支持 AABB 矩形 / 圆形 body，不支持斜面，Y 字斜墙必须"楼梯化"24 段；圆和圆碰撞不能稳定堆叠（彼此抖动）；setter 在该版本下不可靠（已踩坑） | 上一稿 Day 2 已在此栽过跟头 |
| **Phaser 3 + Matter.js（内置）** | 完整刚体物理：圆形堆叠稳定、支持任意角度斜墙、自带 sleeping 机制（自动判定静止，正好用于失败判定）、支持 collisionFilter / sensor（用于"半空堆叠 vs 通道"分区） | ✅ **本次首选** |
| Cocos + box2d | Phaser 模板已跑通，再换 Cocos 不划算 | 系列后期再用 |

> **结论：本次切到 Matter.js**。Day 1 是 Arcade，正好让系列展示"Phaser 双物理引擎"的对比。

### 3.2 Matter 配置要点（基于 phaser-wx-template + Day 1 踩坑）

```js
{
  type: Phaser.CANVAS,             // 沙箱里 WEBGL 截屏 readback 超时
  physics: {
    default: 'matter',
    matter: {
      gravity: { y: 1 },           // 全局重力开启（Matter 默认 y=1）
      enableSleeping: true,        // 关键：sleep 用于失败判定
      // debug 关掉，CANVAS 模式下 debug 绘制开销大
    },
  },
  scale: { mode: Phaser.Scale.NONE, width: WIDTH, height: HEIGHT },
  fps: { target: 60, forceSetTimeOut: true },
}
```

**关键：默认 `gravity.y = 1`，但所有水果生成时设置 `body.ignoreGravity = true`**，点击后切换成 `body.ignoreGravity = false` 即可下落。
这避开了 Day 1 "Arcade setAllowGravity setter 不可靠" 的坑——Matter 的 `ignoreGravity` 是直接读 body 属性，行为可靠。

### 3.3 目录结构

```
day-02-fruit/
├── game.js                       # 微信小游戏入口
├── game.json                     # 简化（去掉 worker / subPackages）
├── project.config.json
├── project.private.config.json
├── index.html                    # 网页入口（不验收）
├── .eslintrc.js
├── js/
│   ├── main.js                   # Phaser + Matter 初始化（参考 day-01）
│   ├── libs/
│   │   ├── phaser.min.js         # 含 Matter（Phaser 全量包内置）
│   │   ├── weapp-phaser3-adapter.min.js
│   │   └── symbol.js
│   ├── core/
│   │   ├── config.js             # 颜色 / 尺寸 / 物理常量
│   │   └── levelData.js          # 关卡：颜色×对数、漏斗几何参数
│   └── scene/
│       └── GameScene.js          # 主玩法
└── types/                        # phaser.d.ts（可选，Day 1 已有副本可拷贝）
```

### 3.4 关键数据结构

```js
// 配置常量
const COLORS  = ['#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#457b9d', '#9b5de5']; // 6 色
const PAIRS_PER_COLOR = 4;                   // 每色 4 对 = 8 颗
const FRUIT_RADIUS    = 28;                  // 单颗水果半径

// 单颗水果
{
  id, color,
  body,          // Matter body
  sprite,        // Phaser GameObject（圆形 Graphics 转 texture）
  state: 'idle' | 'falling' | 'channel' | 'dissolving',
}

// 全局状态
{
  fruits: Map<id, Fruit>,
  remaining: number,                          // 剩余水果数（=胜利条件）
  channelFruits: Set<id>,                     // 落入通道的水果集合（用于失败判定）
  status: 'playing' | 'win' | 'lose',
  lastDissolveAt: number,                     // 消除冷却时间戳
}
```

### 3.5 Y 字漏斗 + 通道几何（Matter 静态刚体）

Matter 支持任意角度刚体 → 斜墙直接用 **`matter.add.rectangle(x, y, w, h, { isStatic: true, angle })`** 一段搞定，**不需要楼梯化**。

```
布局示意（720 × 1280 逻辑分辨率为例）：

  上半屏 0~750：水果悬浮区
  ─────────────────────────────
  Y 字开始 y=750
  左斜墙：从 (40, 760) 到 (CHANNEL_LEFT, 1000)，约 60° 角
  右斜墙：从 (680, 760) 到 (CHANNEL_RIGHT, 1000)，约 -60° 角
  ─────────────────────────────
  通道 y=1000~1240：竖直窄通道
  通道宽度 = FRUIT_RADIUS * 2 + 8 ≈ 64
  通道左壁/右壁：两段竖直 isStatic 矩形
  通道底板：一段水平 isStatic 矩形（y=1240）
```

辅助：通道区域用 `Phaser.Geom.Rectangle` 记录边界，`update()` 里扫描所有水果判断"是否在通道内"。

### 3.6 状态机

```
            ┌─────────────────────────────┐
            │ 玩家点击水果 F (state=idle)  │
            │ 前置：F 不被任何头顶水果遮挡  │
            └────────────┬────────────────┘
                         │
                         ▼
            F.body.ignoreGravity = false
            F.state = 'falling'
                         │
                         ▼
            ┌────────────────────────────────┐
            │ Matter 自动模拟：碰到悬浮水果  │
            │   → 自然停住（restitution 低）│
            │ 碰到斜墙 → 沿斜面下滑          │
            │ 进入通道矩形区域 → 进通道       │
            └────────────┬───────────────────┘
                         │
                         ▼
            F.state = 'channel'
            channelFruits.add(F.id)
                         │
                         ▼
        ┌────────────────────────────────────────┐
        │ 每 tick 检查通道（节流 ≥ 250ms 一次）    │
        │   收集 channel 内、static-ish 的水果    │
        │   按 y 降序，取 [0],[1] 两颗            │
        │   若同色 → 触发 dissolveTwo             │
        └────────────────┬───────────────────────┘
                         │
                         ▼
            两颗 alpha tween → destroy → remaining -= 2
            若 remaining == 0 → WIN
                         │
                         ▼
            ┌─────────────────────────────────────┐
            │ 失败检查：channelFruits.size ≥ 4 &&  │
            │ 所有 channel 水果速度|v|<0.5 (sleep)│
            │ && 按 y 排序无任何相邻同色对         │
            │ → LOSE                              │
            └─────────────────────────────────────┘
```

### 3.7 关键算法实现要点

#### A. 头顶遮挡判定（点击可达性）
- 给每颗 idle 水果维护一个 `occluders: Set<id>`
- 初始化时，对每对 (a, b)：若 b 的圆心在 a 圆心**正上方 ±0.7r 横向带状区域** 内、且 b.y < a.y、且距离 < 2r * 1.5 → b 是 a 的遮挡者
- 点击 a 时若 `occluders[a].size > 0` → 忽略点击（也可视觉上置灰反馈）
- a 离场（消除/进通道）时，遍历所有以 a 为遮挡者的水果，从其 occluders 中剔除（增量更新，避免每帧重算）

#### B. 单体重力实现
```js
// 生成时
fruit.body.ignoreGravity = true;
fruit.body.isSleeping    = true;

// 点击时
fruit.body.ignoreGravity = false;
Matter.Sleeping.set(fruit.body, false);   // 唤醒
fruit.state = 'falling';
```

> Matter 的 `ignoreGravity` 与 `isSleeping` 是 body 上的可读写属性，直接赋值即可（避开 Day 1 Arcade setter 不可靠的坑）。

#### C. 通道身份判定
```js
function isInChannel(body) {
  return body.position.x > CHANNEL_LEFT
      && body.position.x < CHANNEL_RIGHT
      && body.position.y > CHANNEL_TOP;
}
```
进入瞬间 `state = 'channel'` 并加入 `channelFruits`。

#### D. 消除冷却
- 每次成功消除后 `lastDissolveAt = now`，下次扫描必须 `now - lastDissolveAt > 250`
- 消除动画期间两颗的 sprite tween + body 设为 sensor（避免消除途中被新落水果撞到）

#### E. 失败判定（每 200ms 跑一次，避免每帧）
```js
if (channelFruits.size < 4) return;
const sorted = [...channelFruits].map(byId).sort((a,b)=>b.y - a.y);
const allRest = sorted.every(f => Math.abs(f.body.velocity.y) < 0.5);
if (!allRest) return;
const hasAdjacentMatch = sorted.some((f,i) => i+1 < sorted.length && f.color === sorted[i+1].color);
if (!hasAdjacentMatch) lose();
```

### 3.8 数量守恒
- 颜色数 × 每色对数 × 2 = 总水果数
- MVP：6 × 4 × 2 = **48 颗**
- 调试时可改 4 × 2 × 2 = 16 颗（更易看清逻辑）

### 3.9 微信小游戏适配（沿用 Day 1 已踩坑结论）
1. `Phaser.CANVAS`（不要 WEBGL）—— 截屏稳定
2. viewport 用 `wx.getSystemInfoSync()`，不要 `window.devicePixelRatio`
3. 不开 zoom，css 像素直接当 width/height
4. `game.json` 去掉 `workers` / `subPackages`
5. 不用 DOM API（`document.fonts.ready` 等）
6. CANVAS 模式：水果用 `Graphics → generateTexture('fruit_red', 2r, 2r)` 预生成纹理，再用 `add.image` + Matter body 复用，避免每颗都跑独立 Graphics

---

## 四 素材清单（Day 2 一律 0 外部素材）

| 类型 | 处理方式 |
|---|---|
| 水果（6 色） | Graphics 实心圆 + 浅色高光弧线 → generateTexture |
| Y 字漏斗 / 通道墙 | Graphics 直接绘制深色矩形 + stroke |
| 背景 | 渐变天空蓝纯色 |
| UI | "剩余 N 颗 / 重开"系统字体 |
| 音效 | 不做 |

> 第二轮再考虑接入 game-icons / Kenney 的水果图与音效，第一天保持核心循环跑得通。

---

## 五 实现步骤（当天执行计划）

| # | 阶段 | 内容 | 预估 |
|---|---|---|---|
| 1 | 脚手架 | 拷贝 day-01 目录结构改名 day-02-fruit；切 Matter；改 main.js 注入 matter 配置 | 30 min |
| 2 | 几何 | 画 Y 字漏斗 + 通道（matter.add.rectangle 静态体）+ 视觉描边 | 30 min |
| 3 | 水果生成 | 6 色 × 4 对 × 2 颗布局；防重叠抖动；ignoreGravity=true 全部悬浮 | 45 min |
| 4 | 点击下落 | input 监听 + occluders 判定 + 切 ignoreGravity | 30 min |
| 5 | 通道判定 | isInChannel 扫描；加入 channelFruits | 20 min |
| 6 | 二消逻辑 | 排序 + 同色 + 250ms 冷却 + alpha+scale tween + 6 颗散落小圆 + destroy | 50 min |
| 7 | 胜负 + 重开 | remaining=0 / channelFruits≥4 静止无相邻同色 | 30 min |
| 8 | 微信预览 | run_game / get_logs 跑通，验证 sleeping / 物理稳定 | 30 min |
| 9 | 复盘 | doc/02-day-fruit.md 当日复盘 + 截图 | Day 3 早上 |

> 总计核心循环 ≈ 4 小时，与 Day 1 节奏一致。

---

## 六 验收标准

- [ ] 微信开发者工具 / weixin-minigame-helper 预览端能跑（Canvas 渲染稳定）
- [ ] 水果默认全部悬浮，无重力下落、无抖动
- [ ] 点击单颗水果 → 仅该颗下落，其它仍悬浮
- [ ] 下落水果会被悬浮水果与漏斗墙物理阻挡（视觉可见的接触式叠放）
- [ ] 同色对落入通道底部 ≈ 250ms 后自动消除，且消除时有 scale + alpha + 散落小圆点的轻量特效
- [ ] 悬浮水果初始化采用泊松盘采样，无任何重叠
- [ ] 至少 1 次成功通关 + 1 次主动失败的录屏
- [ ] 代码结构与 Day 1 对齐（core / scene / libs 三段式）
- [ ] 复盘文章 doc/02-day-fruit.md（Day 3 早写）

---

## 七 已识别的坑与对策（融合 Day 1 + Matter 调研）

| # | 坑 | 对策 |
|---|---|---|
| 1 | Arcade setAllowGravity setter 在该版本不可靠（Day 1 已踩） | **直接换 Matter**；用 `body.ignoreGravity = true/false` 属性赋值 |
| 2 | 圆与圆 Arcade 堆叠会抖动卡死 | Matter 的 stable stacking + sleeping 机制原生处理 |
| 3 | Y 字斜墙 Arcade 必须楼梯化 24 段 | Matter 直接 `angle` 参数一段搞定 |
| 4 | sandbox 下 WEBGL 截屏超时 | 强制 CANVAS |
| 5 | DPR 在 sandbox 是 undefined | `wx.getSystemInfoSync()` 替代 |
| 6 | CANVAS 模式大量 Graphics 性能差 | 6 张水果纹理 generateTexture 一次，全部 add.image 复用 |
| 7 | 消除途中被新水果撞坏配对 | 消除瞬间把两颗 body 设为 sensor + 非碰撞 |
| 8 | 通道中"非真静止"误判失败 | 额外检查 `body.speed < 0.5` 且 `isSleeping == true` |
| 9 | 头顶遮挡每帧重算 O(n²) 卡 | 初始化建图 + 离场增量更新 |
| 10 | preview client 偶尔断连 | run_game 重新拉起 + WorkBuddy 内置 preview_url，不要 `open` 系统浏览器 |

---

## 八 关键决策（已与用户确认 ✅）

> 2026-05-25 与用户对齐结果，作为本次实现的硬约束。

| # | 决策点 | 结论 |
|---|---|---|
| 1 | 总水果数 | **48 颗（6 色 × 4 对 × 2）**，按方案推进 |
| 2 | 通道消除规则 | **只做两两同色消除**，不做 3 连消等特殊规则 |
| 3 | 悬浮水果布局 | **泊松盘采样**，最小中心距 ≥ 2r + 4，避免重叠 |
| 4 | 半空堆叠行为 | **保留** —— 被压住的悬浮水果在下方支撑消失后会自然跟着掉，依赖 Matter 自身物理 |
| 5 | 消除特效 | **加一个轻量特效**：两颗水果 scale 1→1.15→0 + alpha 1→0，配 6 个同色小圆点 0.25s 向外散开 + 衰减 alpha；总时长 250 ms 内结束（与冷却同步）|

### 8.1 消除特效实现细节（补 3.7-D 小节）

```js
// dissolveTwo(a, b)
//   ① 立刻把 a/b 的 body 设为 sensor，避免被新落水果挤变形
//   ② sprite tween：scale 1→1.15（80ms）→ 0（170ms），alpha 1→0（250ms 同步）
//   ③ 同步在 a/b 中点位置 spawn 6 颗半径 4 的小圆 Graphics（同色）
//      —— 6 颗朝放射状方向 tween position + alpha 0，250ms 销毁
//   ④ onComplete：destroy sprite + remove body + 计数 -2 + 触发胜利检查
//   ⑤ 整段动画放进 add.tween 的 chain 里，避免节奏漂移
```

小圆点用 1 张共享纹理 `dissolve_dot`（generateTexture 出 8×8 白色圆，运行时 `setTint(color)` 上色），不每次 new Graphics，规避 CANVAS 模式性能坑（沿用 Day 1 第 6 条踩坑结论）。

---

## 九 下一步

- ✅ 方案已与用户确认，5 个决策点全部落地
- ⏭ 即刻开新目录 `day-02-fruit/`，从 day-01 拷脚手架，切 Matter，按第五节步骤推进
- ⏭ 完工后：录两段视频（一胜一负）+ 写 `doc/02-day-fruit.md` 复盘 + 推 GitHub

> 设计完成时间：2026-05-25 · 用户确认时间：2026-05-25 · 实现：待开工
