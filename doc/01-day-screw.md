# Day 1：打个螺丝 · 复刻复盘

> 系列第一篇，复刻《打个螺丝》这款经典益智小游戏。  
> 这是我用 AI 做微信小游戏的第一天——掉了很多坑，也把坑填平了。

---

## 游戏长什么样

《打个螺丝》是微信小游戏里的现象级产品。玩法用一句话概括：**点击螺丝把它卸下来，送进正确颜色的工具箱**。

核心机制三件套：

1. **板子遮挡**：场景由一堆叠在一起的木板构成，每块板子固定 3 颗螺丝。上层木板会遮住下层的螺丝，被遮住的螺丝不能点。
2. **顶部工具箱**：4 个彩色工具箱。点击螺丝后，螺丝飞入同色工具箱；装满 3 颗自动消除，工具箱换新色继续用。
3. **备选区惩罚**：顶部没有同色工具箱时，螺丝进入中间的备选区（5 个洞位）。备选区满了还往里塞——游戏失败。

乍看简单，真正玩起来需要规划顺序：哪颗先卸、哪颗等待，全都要算。

---

## 我的技术选型

### Phaser 3 + 微信小游戏

原生 Canvas API 可以跑，但写 UI 太痛苦。Phaser 3 有完整的场景管理、输入系统、Tween 动画，对小游戏这个体量刚好够用。

脚手架用的是 Gitee 上的 [`wbgbg/phaser-wx-template`](https://gitee.com/wbgbg/phaser-wx-template)。注意：这个仓库在 **Gitee** 不在 GitHub——找了一圈 GitHub 没找到，最后才发现在 Gitee 上。

### 开发工具链

全程用 **WorkBuddy + weixin-minigame-helper** 插件。WorkBuddy 写代码，`weixin-minigame-helper` 在本地起一个 wx-compat 沙箱，直接帮你把微信小游戏跑起来，还能截图看效果。

---

## 踩坑实录

### 坑 1：WEBGL 截图超时

最开始选了 `Phaser.WEBGL`，启动没问题，但每次用工具截图都超时。

原因：`weixin-minigame-helper` 的 wx-compat 沙箱里，WEBGL readback（从 GPU 把像素读回 CPU）会卡死。

**解法**：改成 `Phaser.CANVAS`。CANVAS 模式直接在 2D 上下文操作，截图秒出。

```js
// ❌ 不要这样
type: Phaser.WEBGL,

// ✅ 要这样
type: Phaser.CANVAS,
```

### 坑 2：viewport 取错了

模板里用 `window.devicePixelRatio` 取屏幕 DPR，在微信小游戏的沙箱里这个值是 `undefined`，直接 `.toFixed()` 就崩了。

**解法**：用 `wx.getSystemInfoSync()` 取。同时发现 `scale.zoom: 1 / DPR` 在没有 DOM container 的环境里完全不生效，直接删掉，WIDTH/HEIGHT 用 css 像素就行。

```js
function getViewport() {
  if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
    const info = wx.getSystemInfoSync();
    return { width: info.windowWidth, height: info.windowHeight };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}
```

### 坑 3：玩法理解错了

这个坑最大，也最有意思。

我一开始按照普通三消游戏的直觉设计了一个"底部 7 格缓冲槽"的规则，完全没有板子遮挡，连核心策略点都没有。被彻底推翻重写。

复盘下来，《打个螺丝》的精髓有三点是不能砍的：

- **遮挡必须按螺丝粒度判断**：一颗螺丝被遮住了只锁那一颗，同一块板子上的其他螺丝仍然可点。如果按整块板子判断，整块板子只要有一颗被盖住就全部锁死，体验非常差。
- **备选区不能是纯惩罚终局**：进了备选区的螺丝，工具箱刷出同色之后要能自动回流。否则备选区一旦有螺丝就几乎必死，难度曲线崩溃。
- **备选区在中间，不在底部**：视觉上它是顶部工具箱和主游戏区的中间地带，有清晰的 5 个洞位，不是什么都往底部塞。

### 坑 4：63 个 Graphics 一起重绘

第一版每颗螺丝都是独立的 Graphics 对象，每帧重绘，帧率直接打到个位数。加上 63 个独立 Tween 同时跑入场动画，整个页面卡死。

**解法**：

- 所有板子合并到 1 个 Graphics 一次性绘制
- 所有工具箱合并到 1 个 Graphics
- 螺丝改用 `generateTexture()` 预生成纹理（每色 2 张：亮色=可点，暗色=被遮挡），用 `add.image()` 复用；状态切换只需 `setTexture()` 不重绘
- 入场动画从"63 个 tween"改为 Container 整体一个 tween

改完之后截图从 10 秒超时变成秒出。

---

## 最终实现

### 关卡生成

- **7 种颜色**，每色 9 颗（保证整除），共 63 颗螺丝
- **21 块板子**，每板严格 3 颗，板内螺丝中心距 ≥ 直径 + 8px
- **板子形状随机**（5 种宽高组合：正常/宽扁/窄高/中/大宽），布局用 7 行 × 3 列基础网格 + 抖动，铺满整个游戏区
- **z 轴分层**：板子按 id 递增分配 z 值，i 越大越靠上

### 遮挡判定

```js
// 圆-矩形相交判定：找矩形上距圆心最近的点
isPointCoveredByBoard(px, py, board) {
  const cx = Math.max(left, Math.min(px, right));
  const cy = Math.max(top, Math.min(py, bottom));
  const dx = px - cx, dy = py - cy;
  return (dx * dx + dy * dy) < (SCREW_RADIUS * SCREW_RADIUS);
}
```

每次有螺丝被拿走、板子被清空时，都重新跑一遍 `recomputeOcclusion()`，更新所有螺丝的可点状态。

### buffer 回流机制

```js
dissolveBox(box) {
  // ... 补新色 ...
  this.flushBufferToBoxes();  // 核心：补色后立即扫 buffer
}

flushBufferToBoxes() {
  // 找 buffer 里第一个能匹配当前某个工具箱颜色的螺丝
  // 飞回工具箱 → onComplete 里再次调用 flushBufferToBoxes（链式）
  // 若工具箱又被填满 → dissolveBox → 再次 flushBufferToBoxes
}
```

---

## 还可以做什么

1. **素材替换**：现在的板子和螺丝都是 Graphics 画的，换成真实素材视觉感会好很多
2. **音效**：螺丝入箱的 "咔哒" 声、工具箱消除的 "叮" 声是核心体验反馈
3. **关卡进阶**：增加颜色种类、减少工具箱数量、加道具（如临时扩展备选区）
4. **分享截图**：微信提供 `wx.shareAppMessage` + `canvas.toDataURL`，通关后一键分享战绩

---

## 开发资源

- 引擎：[Phaser 3](https://phaser.io/phaser3)
- 微信小游戏脚手架：[wbgbg/phaser-wx-template（Gitee）](https://gitee.com/wbgbg/phaser-wx-template)
- 开发工具：WorkBuddy + weixin-minigame-helper 插件

---

*下一篇：Day 2 · 消个水果*
