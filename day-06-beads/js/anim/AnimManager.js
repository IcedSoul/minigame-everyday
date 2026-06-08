// 快乐拼拼豆 · 动画管理器

import { Tween } from './Tween.js';

export class AnimManager {
  constructor() {
    this.tweens = [];
    this.flyingBeans = [];   // 飞行中的豆 [{x,y,targetX,targetY,color,scale,alpha}]
    this.particles = [];     // 粒子效果
  }

  get isAnimating() {
    return this.tweens.length > 0 || this.flyingBeans.length > 0;
  }

  addTween(target, from, to, duration, easing, onComplete) {
    const tween = new Tween(target, from, to, duration, easing, onComplete);
    this.tweens.push(tween);
    return tween;
  }

  /**
   * 添加飞行豆动画
   */
  addFlyingBean(fromX, fromY, toX, toY, color, duration, onComplete) {
    const bean = {
      x: fromX,
      y: fromY,
      targetX: toX,
      targetY: toY,
      color,
      scale: 1,
      alpha: 1,
      progress: 0,
      duration,
      onComplete,
    };
    this.flyingBeans.push(bean);
    return bean;
  }

  /**
   * 添加庆祝粒子
   */
  addCelebrationParticles(canvasWidth, canvasHeight) {
    const colors = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4ECDC4', '#F4A261', '#FFB6C1', '#9B59B6'];
    for (let i = 0; i < 80; i++) {
      this.particles.push({
        x: Math.random() * canvasWidth,
        y: canvasHeight + Math.random() * 100,
        vx: (Math.random() - 0.5) * 4,
        vy: -(Math.random() * 8 + 4),
        radius: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        life: 1,
        decay: 0.005 + Math.random() * 0.01,
      });
    }
  }

  update(dt) {
    // 更新 tweens
    this.tweens = this.tweens.filter(t => !t.update(dt));

    // 更新飞行豆
    for (let i = this.flyingBeans.length - 1; i >= 0; i--) {
      const bean = this.flyingBeans[i];
      bean.progress += dt / bean.duration;

      if (bean.progress >= 1) {
        bean.x = bean.targetX;
        bean.y = bean.targetY;
        if (bean.onComplete) bean.onComplete();
        this.flyingBeans.splice(i, 1);
      } else {
        const t = Tween.easeOutQuad(bean.progress);
        bean.x = bean.x + (bean.targetX - bean.x) * 0.08;
        bean.y = bean.y + (bean.targetY - bean.y) * 0.08;
        // 弧线效果
        const arc = Math.sin(bean.progress * Math.PI) * -30;
        bean.y += arc * 0.02;
        bean.scale = 1 + Math.sin(bean.progress * Math.PI) * 0.2;
      }
    }

    // 更新粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15; // 重力
      p.life -= p.decay;
      p.alpha = Math.max(0, p.life);
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }
}
