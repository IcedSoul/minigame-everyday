// 《抓大鹅》Day 5 · 极简自写物理引擎
//
// 设计目标：
//   - 0 第三方依赖（不引入 cannon/ammo/havok），避免在微信小游戏沙盒踩坑
//   - 只支持本游戏需要的 3 类碰撞：
//       球 vs 球 / 球 vs 圆柱内壁 / 球 vs 圆盘底
//   - 支持休眠（静止物体不参与计算，省 CPU）
//   - 提供"甩动 → 给所有物品施加冲量"的接口
//
// 性能预算：
//   N=54 个球，球-球碰撞 O(N²) = 2916 次/帧，60fps 下绰绰有余
//   静止后所有球休眠，CPU 占用归零

import {
  GRAVITY,
  RESTITUTION,
  LINEAR_DAMPING,
  SLEEP_VEL_THRESHOLD,
  SLEEP_FRAMES,
  POT_RADIUS,
  POT_BOTTOM_Y,
  POT_RIM_Y,
  POT_OPEN_TOP,
  SHAKE_IMPULSE_SCALE,
  SHAKE_VERTICAL_BIAS,
} from './config.js';

// 单个物理体
class Body {
  constructor(id, radius, x, y, z) {
    this.id = id;
    this.r = radius;
    // 位置
    this.x = x; this.y = y; this.z = z;
    // 速度
    this.vx = 0; this.vy = 0; this.vz = 0;
    // 状态
    this.sleeping = false;
    this.sleepCounter = 0;
    this.removed = false;     // 已离开物理世界（飞向槽位 / 已消除）
    this.kinematic = false;   // 飞行中的物品脱离物理
    this.mass = 1;
    // 视觉绑定（Babylon Mesh），物理 step 后写回
    this.mesh = null;
  }

  setVel(vx, vy, vz) {
    this.vx = vx; this.vy = vy; this.vz = vz;
    if (Math.abs(vx) + Math.abs(vy) + Math.abs(vz) > SLEEP_VEL_THRESHOLD) {
      this.wake();
    }
  }

  addImpulse(ix, iy, iz) {
    this.vx += ix; this.vy += iy; this.vz += iz;
    this.wake();
  }

  wake() {
    this.sleeping = false;
    this.sleepCounter = 0;
  }
}

export class PhysicsWorld {
  constructor() {
    this.bodies = [];
    this._nextId = 1;
  }

  addBody(radius, x, y, z) {
    const b = new Body(this._nextId++, radius, x, y, z);
    this.bodies.push(b);
    return b;
  }

  removeBody(body) {
    body.removed = true;
    // 真正从数组移除推迟到 step 末尾，避免迭代中变更
  }

  // 把所有非静止 / 非 removed 的物体步进 dt 秒
  step(dt) {
    // 1) 重力 + 阻尼
    for (const b of this.bodies) {
      if (b.removed || b.kinematic) continue;
      if (b.sleeping) continue;
      b.vy += GRAVITY * dt;
      b.vx *= LINEAR_DAMPING;
      b.vy *= LINEAR_DAMPING;
      b.vz *= LINEAR_DAMPING;
    }

    // 2) 位置积分
    for (const b of this.bodies) {
      if (b.removed || b.kinematic) continue;
      if (b.sleeping) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.z += b.vz * dt;
    }

    // 3) 球-球碰撞（O(N²)，N=54 完全够用）
    const live = this.bodies.filter((b) => !b.removed && !b.kinematic);
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j];
        if (a.sleeping && b.sleeping) continue;
        this._resolveSphereSphere(a, b);
      }
    }

    // 4) 球-容器碰撞（圆柱内壁 + 圆盘底 + 可选顶盖）
    for (const b of live) {
      if (b.sleeping) continue;
      this._resolveContainer(b);
    }

    // 5) 休眠判定
    for (const b of live) {
      if (b.sleeping) continue;
      const speedSq = b.vx * b.vx + b.vy * b.vy + b.vz * b.vz;
      if (speedSq < SLEEP_VEL_THRESHOLD * SLEEP_VEL_THRESHOLD) {
        b.sleepCounter++;
        if (b.sleepCounter >= SLEEP_FRAMES) {
          b.sleeping = true;
          b.vx = b.vy = b.vz = 0;
        }
      } else {
        b.sleepCounter = 0;
      }
    }

    // 6) 写回 Mesh
    for (const b of this.bodies) {
      if (b.removed || !b.mesh) continue;
      // kinematic 时不要把物理位置写回 mesh（mesh 由 tween 控制）
      if (b.kinematic) continue;
      b.mesh.position.x = b.x;
      b.mesh.position.y = b.y;
      b.mesh.position.z = b.z;
    }

    // 7) 清理 removed
    if (this.bodies.some((b) => b.removed)) {
      this.bodies = this.bodies.filter((b) => !b.removed);
    }
  }

  // 球-球弹性碰撞（等质量）：分离 + 沿法线交换速度分量
  _resolveSphereSphere(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    const minDist = a.r + b.r;
    if (distSq >= minDist * minDist) return;

    const dist = Math.sqrt(distSq) || 0.0001;
    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;

    // 分离：把两球各推开一半穿透量
    const overlap = (minDist - dist) * 0.5;
    a.x -= nx * overlap; a.y -= ny * overlap; a.z -= nz * overlap;
    b.x += nx * overlap; b.y += ny * overlap; b.z += nz * overlap;

    // 法线方向相对速度
    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    const rvz = b.vz - a.vz;
    const velAlongNormal = rvx * nx + rvy * ny + rvz * nz;
    if (velAlongNormal > 0) return; // 已经在分离

    const e = RESTITUTION;
    const j = -(1 + e) * velAlongNormal / 2; // 等质量
    a.vx -= j * nx; a.vy -= j * ny; a.vz -= j * nz;
    b.vx += j * nx; b.vy += j * ny; b.vz += j * nz;

    a.wake(); b.wake();
  }

  // 球-容器：圆柱壁（径向）+ 底（y=POT_BOTTOM_Y）+ 可选顶（y=POT_RIM_Y）
  _resolveContainer(b) {
    // 1) 圆柱内壁：xz 平面径向距离
    const rxz = Math.sqrt(b.x * b.x + b.z * b.z);
    const maxR = POT_RADIUS - b.r;
    if (rxz > maxR) {
      const nx = b.x / rxz;
      const nz = b.z / rxz;
      b.x = nx * maxR;
      b.z = nz * maxR;
      // 反弹径向速度分量
      const vRadial = b.vx * nx + b.vz * nz;
      if (vRadial > 0) {
        b.vx -= (1 + RESTITUTION) * vRadial * nx;
        b.vz -= (1 + RESTITUTION) * vRadial * nz;
        b.wake();
      }
    }

    // 2) 锅底
    const minY = POT_BOTTOM_Y + b.r;
    if (b.y < minY) {
      b.y = minY;
      if (b.vy < 0) {
        b.vy = -b.vy * RESTITUTION;
        // 静摩擦：贴底速度小时直接归零
        if (Math.abs(b.vy) < SLEEP_VEL_THRESHOLD * 4) b.vy = 0;
        b.wake();
      }
    }

    // 3) 锅顶（如果不开口）
    if (!POT_OPEN_TOP) {
      const maxY = POT_RIM_Y - b.r;
      if (b.y > maxY) {
        b.y = maxY;
        if (b.vy > 0) b.vy = -b.vy * RESTITUTION;
      }
    } else {
      // 开口：飞太高就让它继续往上、然后重力带回；不做硬限制
      // 但若飞超过锅口 6 米还在涨，强制回收（极端保护）
      const safeMaxY = POT_RIM_Y + 6;
      if (b.y > safeMaxY && b.vy > 0) {
        b.vy = 0;
      }
    }
  }

  // 给所有非休眠物体一个甩动冲量（来自陀螺仪/加速度计）
  // dir = { x, y, z } 单位向量（甩动方向，世界坐标）
  // strength: 0..1（甩动强度）
  applyShake(dir, strength) {
    const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z) || 1;
    const nx = dir.x / len;
    const ny = dir.y / len;
    const nz = dir.z / len;
    const baseImpulse = SHAKE_IMPULSE_SCALE * Math.max(0.4, Math.min(2, strength));

    for (const b of this.bodies) {
      if (b.removed || b.kinematic) continue;
      // 每个物品加一点随机扰动，让翻动更自然
      const jitter = 0.4;
      const jx = (Math.random() - 0.5) * jitter;
      const jy = (Math.random() - 0.5) * jitter;
      const jz = (Math.random() - 0.5) * jitter;
      b.addImpulse(
        (nx + jx) * baseImpulse,
        (ny + SHAKE_VERTICAL_BIAS + jy) * baseImpulse, // 竖直方向额外加成
        (nz + jz) * baseImpulse,
      );
    }
  }

  // 把所有非休眠物体唤醒（当用户开始触摸时也调用一下，防止视觉错位）
  wakeAll() {
    for (const b of this.bodies) b.wake();
  }
}
