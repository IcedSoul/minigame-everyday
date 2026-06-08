// 快乐拼拼豆 · 轻量 Tween 引擎

export class Tween {
  constructor(target, from, to, duration, easing = Tween.easeOutBack, onComplete = null) {
    this.target = target;
    this.from = { ...from };
    this.to = { ...to };
    this.duration = duration;
    this.easing = easing;
    this.onComplete = onComplete;
    this.elapsed = 0;
    this.done = false;
  }

  update(dt) {
    if (this.done) return true;
    this.elapsed += dt;
    const t = Math.min(this.elapsed / this.duration, 1);
    const e = this.easing(t);

    for (const key of Object.keys(this.to)) {
      if (this.from[key] !== undefined) {
        this.target[key] = this.from[key] + (this.to[key] - this.from[key]) * e;
      }
    }

    if (t >= 1) {
      this.done = true;
      if (this.onComplete) this.onComplete();
      return true;
    }
    return false;
  }

  // 缓动函数
  static linear(t) { return t; }
  static easeInQuad(t) { return t * t; }
  static easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }
  static easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  static easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  static easeOutBounce(t) {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  }
  static easeOutElastic(t) {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
  }
}
