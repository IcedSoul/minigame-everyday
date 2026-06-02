// 《抓大鹅》Day 5 · 甩动检测
//
// 数据源（按优先级）：
//   1. 微信 wx.onAccelerometerChange（mini game）
//   2. 浏览器 DeviceMotionEvent（移动 Safari/Chrome；iOS 13+ 需要请求授权）
//   3. 键盘 / 屏幕按钮（桌面 / 无传感器回退）
//
// 核心算法：
//   - 持续读取 (ax, ay, az)，扣除重力基线得到"瞬时加速度向量"
//   - 当 |a| > SHAKE_THRESHOLD_G 且距上次触发 > SHAKE_COOLDOWN_MS 时触发
//   - 触发时把 (ax, ay, az) 标准化作为甩动方向 → 调 PhysicsWorld.applyShake

import {
  SHAKE_THRESHOLD_G,
  SHAKE_COOLDOWN_MS,
  ENABLE_KEYBOARD_SHAKE,
} from './config.js';

const G = 9.81;

export class ShakeDetector {
  constructor(onShake) {
    this.onShake = onShake; // (dirVec3, strength) => void
    this.lastShakeAt = 0;
    this._smoothA = { x: 0, y: 0, z: 0 };
    this._wxHandler = null;
    this._winHandler = null;
    this._keyHandler = null;
    this._sensorAvailable = false;
  }

  start() {
    // 1) 微信小游戏
    if (typeof wx !== 'undefined' && wx.onAccelerometerChange) {
      try {
        wx.startAccelerometer && wx.startAccelerometer({ interval: 'game' });
        this._wxHandler = (res) => this._onAccel(res.x, res.y, res.z);
        wx.onAccelerometerChange(this._wxHandler);
        this._sensorAvailable = true;
        console.log('[Shake] using wx.accelerometer');
      } catch (e) {
        console.warn('[Shake] wx accelerometer failed', e);
      }
    }

    // 2) 浏览器 devicemotion
    if (!this._sensorAvailable && typeof window !== 'undefined' && window.DeviceMotionEvent) {
      const attach = () => {
        this._winHandler = (ev) => {
          const a = ev.accelerationIncludingGravity || ev.acceleration;
          if (!a) return;
          // accelerationIncludingGravity 单位 m/s²，需 /G 换算成 g
          // x/y/z 注意：浏览器与微信的坐标系约定不同，但这里只关心"突然冲击"，方向归一化无差
          this._onAccel((a.x || 0) / G, (a.y || 0) / G, (a.z || 0) / G);
        };
        window.addEventListener('devicemotion', this._winHandler, { passive: true });
        this._sensorAvailable = true;
        console.log('[Shake] using window.devicemotion');
      };
      // iOS 13+ 必须用户手势触发授权
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        // 留到第一次 touchstart 时请求，以满足"必须由用户手势触发"
        const requestOnce = () => {
          DeviceMotionEvent.requestPermission().then((state) => {
            if (state === 'granted') attach();
            else console.warn('[Shake] iOS motion permission denied');
          }).catch((err) => console.warn('[Shake] perm err', err));
          window.removeEventListener('touchstart', requestOnce);
        };
        window.addEventListener('touchstart', requestOnce, { once: true });
        console.log('[Shake] iOS perm requested on first touch');
      } else {
        attach();
      }
    }

    // 3) 键盘回退（开发用）
    if (ENABLE_KEYBOARD_SHAKE && typeof window !== 'undefined') {
      this._keyHandler = (e) => {
        if (e.code === 'Space') {
          e.preventDefault();
          this._fireShake({ x: 0, y: 0, z: 0 }, 1.0);
        } else if (e.code === 'ArrowLeft') {
          this._fireShake({ x: -1, y: 0, z: 0 }, 1.0);
        } else if (e.code === 'ArrowRight') {
          this._fireShake({ x: 1, y: 0, z: 0 }, 1.0);
        } else if (e.code === 'ArrowUp') {
          this._fireShake({ x: 0, y: 0, z: -1 }, 1.0);
        } else if (e.code === 'ArrowDown') {
          this._fireShake({ x: 0, y: 0, z: 1 }, 1.0);
        }
      };
      window.addEventListener('keydown', this._keyHandler);
    }
  }

  stop() {
    if (this._wxHandler && typeof wx !== 'undefined') {
      wx.offAccelerometerChange && wx.offAccelerometerChange(this._wxHandler);
      wx.stopAccelerometer && wx.stopAccelerometer();
    }
    if (this._winHandler && typeof window !== 'undefined') {
      window.removeEventListener('devicemotion', this._winHandler);
    }
    if (this._keyHandler && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this._keyHandler);
    }
  }

  // 外部主动触发（按钮）
  triggerManual(dir = { x: 0, y: 0, z: 0 }, strength = 1.2) {
    this._fireShake(dir, strength);
  }

  isSensorAvailable() {
    return this._sensorAvailable;
  }

  // ─────── 内部：原始数据 → 甩动事件 ───────
  _onAccel(ax, ay, az) {
    // 低通滤波得到"重力基线"
    const k = 0.85;
    this._smoothA.x = this._smoothA.x * k + ax * (1 - k);
    this._smoothA.y = this._smoothA.y * k + ay * (1 - k);
    this._smoothA.z = this._smoothA.z * k + az * (1 - k);
    // 高频部分 = 总加速度 - 重力基线
    const hx = ax - this._smoothA.x;
    const hy = ay - this._smoothA.y;
    const hz = az - this._smoothA.z;
    const mag = Math.sqrt(hx * hx + hy * hy + hz * hz);
    if (mag > SHAKE_THRESHOLD_G) {
      // 注意：传感器坐标系 → 世界坐标系映射，第一版直接传，让物理 +Y 偏置主导甩起来的动作
      // 后续可根据 device orientation 矩阵精确旋转
      const strength = Math.min(2, mag / SHAKE_THRESHOLD_G);
      this._fireShake({ x: hx, y: hy, z: hz }, strength);
    }
  }

  _fireShake(dir, strength) {
    const now = Date.now();
    if (now - this.lastShakeAt < SHAKE_COOLDOWN_MS) return;
    this.lastShakeAt = now;
    if (this.onShake) this.onShake(dir, strength);
  }
}
