#!/usr/bin/env python3
"""Append Matter.js best practices to phaser-weixin-minigame SKILL.md"""

SKILL_PATH = "/Users/xiaofengguo/.codebuddy/skills/phaser-weixin-minigame/SKILL.md"

APPEND_CONTENT = '''

---

## Matter.js 物理引擎最佳实践

如果你的小游戏使用 Phaser + Matter.js 物理引擎，以下是从实战中总结的关键模式。

### 物理体与图片必须解耦

**问题**：`matter.add.image(x, y, key, null, { shape: { type: 'circle', radius: R } })` 创建的 body 尺寸**可能与纹理尺寸绑定**，而非你指定的 `shape.radius`。当纹理是 2x 高清图（如 88x88）但游戏需要 44x44 显示时，body 和视觉会严重错配。

**正确做法**：完全解耦渲染和物理——

```js
// 1) 纯渲染 Image（不是 Matter Image）
const img = this.add.image(x, y, textureKey);
img.setDisplaySize(DISPLAY_SIZE, DISPLAY_SIZE);

// 2) 独立 Matter circle body — 半径绝对等于你指定的值
const body = this.matter.add.circle(x, y, PHYSICS_RADIUS, {
  label: 'fruit',
  friction: 0.1,
  frictionStatic: 0.2,
  frictionAir: 0.03,
  restitution: 0.0,
});

// 3) 手动关联
img.body = body;
body.gameObject = img;

// 4) 每帧 update() 中同步位置
update() {
  for (const f of this.fruits) {
    if (!f || !f.active || !f.body) continue;
    f.x = f.body.position.x;
    f.y = f.body.position.y;
    f.rotation = f.body.angle;
  }
}
```

**关键原则**：
- `PHYSICS_RADIUS` 控制碰撞体积（可以比视觉略小 2-4px，让元素看起来紧密贴合）
- `DISPLAY_SIZE` 控制视觉大小（= 纹理缩放后的像素尺寸）
- 两者独立配置，互不干扰

---

### Scene Restart 的正确清理模式

**问题**：`scene.restart()` 会销毁 Phaser GameObjects，但**独立创建的 Matter bodies（通过 `matter.add.circle` / `matter.add.rectangle`）不会被自动清理**。旧 body 残留在物理世界中，导致重开后元素叠加。

**正确做法**：在重开触发时手动清理一切，然后延迟一帧 restart——

```js
// 重开逻辑（在 pointerdown 回调中）
if (this.gameOver) {
  // 1. 停止所有定时器
  if (this.tickIntervalId) {
    clearInterval(this.tickIntervalId);
    this.tickIntervalId = null;
  }

  // 2. 手动移除所有独立 Matter bodies
  for (const f of this.fruits) {
    if (!f) continue;
    try {
      if (f.body && this.matter && this.matter.world) {
        this.matter.world.remove(f.body);
      }
    } catch (_e) {}
    f.body = null;
    if (f.active) f.destroy();
  }
  this.fruits = [];

  // 3. 清空整个 Matter world（包括墙体，create 会重建）
  const M = Phaser.Physics.Matter.Matter;
  if (M && M.Composite && this.matter.world.localWorld) {
    M.Composite.clear(this.matter.world.localWorld, false, true);
  }

  // 4. 延迟一帧再 restart（避免在 input 回调中直接重启）
  this.time.delayedCall(0, () => this.scene.restart());
  return;
}
```

**同时在 `create()` 开头兜底**：

```js
create() {
  const M = Phaser.Physics.Matter.Matter;
  if (M && M.Composite && this.matter?.world?.localWorld) {
    M.Composite.clear(this.matter.world.localWorld, false, true);
  }
  this.fruits = [];
  // ... 重置所有状态变量
}
```

**shutdown 事件中清理碰撞监听**：

```js
this.events.once('shutdown', () => {
  if (this.matter && this.matter.world) {
    this.matter.world.off('collisionstart', handleStart);
    this.matter.world.off('collisionend', handleEnd);
  }
});
```

---

### 斜面/漏斗零摩擦

漏斗或斜面墙体的 `friction` 和 `frictionStatic` 必须设为 0，否则物体会在斜面上抖动：

```js
this.matter.add.rectangle(cx, cy, len, WALL_THICK, {
  isStatic: true,
  angle: angle,
  friction: 0.0,
  frictionStatic: 0.0,
  restitution: 0.0,
});
```

Matter.js 的摩擦力 = `sqrt(frictionA * frictionB)`。斜面设 0 则任何物体在斜面上都无摩擦。

---

### 防隧穿速度限制

Matter.js 没有内置 CCD，高速物体会穿过薄墙。在 `update()` 中限制最大速度：

```js
update() {
  const VMAX = PHYSICS_RADIUS * 0.9;
  for (const f of this.fruits) {
    if (!f?.active || !f.body || f.body.isStatic) continue;
    const v = f.body.velocity;
    if (Math.abs(v.x) > VMAX || Math.abs(v.y) > VMAX) {
      const M = Phaser.Physics.Matter.Matter;
      M.Body.setVelocity(f.body, {
        x: Math.max(-VMAX, Math.min(VMAX, v.x)),
        y: Math.max(-VMAX, Math.min(VMAX, v.y)),
      });
    }
  }
}
```

---

### Dissolving 阶段保持物理阻挡

消除动画期间，**不要**把 body 设为 `isSensor`（会导致后续物体穿透）。正确做法是设为 `static`：

```js
// 正确：设为 static，保持物理阻挡直到动画结束
const M = Phaser.Physics.Matter.Matter;
M.Body.setStatic(fruit.body, true);

// 错误：不要设为 sensor — 后续物体会穿透
// fruit.body.isSensor = true;
```
'''

with open(SKILL_PATH, 'a', encoding='utf-8') as f:
    f.write(APPEND_CONTENT)

print(f"Done. Appended {len(APPEND_CONTENT)} chars to {SKILL_PATH}")
