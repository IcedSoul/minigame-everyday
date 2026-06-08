// 快乐拼拼豆 · 触摸/点击事件处理（支持双指缩放+拖拽）

import { CONFIG } from '../core/config.js';

export class TouchHandler {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.enabled = true;

    // 手势状态
    this._touches = [];
    this._gesture = 'none'; // 'none' | 'tap' | 'pan' | 'pinch'
    this._startTime = 0;
    this._startPos = null;
    this._lastPinchDist = 0;
    this._pinchStartScale = 1;
    this._pinchStartOffsetX = 0;
    this._pinchStartOffsetY = 0;
    this._panStartX = 0;
    this._panStartY = 0;
    this._panStartOffsetX = 0;
    this._panStartOffsetY = 0;
    this._moved = false;

    this._bindEvents();
  }

  _bindEvents() {
    if (typeof wx !== 'undefined') {
      this._bindWx();
    } else {
      this._bindBrowser();
    }
  }

  _bindWx() {
    wx.onTouchStart((e) => {
      if (!this.enabled) return;
      this._onTouchStart(e.touches);
    });
    wx.onTouchMove((e) => {
      if (!this.enabled) return;
      this._onTouchMove(e.touches);
    });
    wx.onTouchEnd((e) => {
      if (!this.enabled) return;
      this._onTouchEnd(e.changedTouches);
    });
  }

  _bindBrowser() {
    // 触摸事件
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      this._onTouchStart(this._normalizeTouches(e.touches));
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      this._onTouchMove(this._normalizeTouches(e.touches));
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      this._onTouchEnd(this._normalizeTouches(e.changedTouches));
    }, { passive: false });

    // 鼠标事件（PC调试用）
    let mouseDown = false;
    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      mouseDown = true;
      this._onTouchStart([{ clientX: e.clientX, clientY: e.clientY }]);
    });
    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.enabled || !mouseDown) return;
      this._onTouchMove([{ clientX: e.clientX, clientY: e.clientY }]);
    });
    this.canvas.addEventListener('mouseup', (e) => {
      if (!this.enabled) return;
      mouseDown = false;
      this._onTouchEnd([{ clientX: e.clientX, clientY: e.clientY }]);
    });

    // 鼠标滚轮缩放（PC调试）
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this.enabled) return;
      const renderer = this.game.renderer;
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      const newScale = renderer.viewScale + delta;
      renderer.setViewTransform(newScale, renderer.viewOffsetX, renderer.viewOffsetY);
    }, { passive: false });
  }

  _normalizeTouches(touches) {
    const rect = this.canvas.getBoundingClientRect
      ? this.canvas.getBoundingClientRect()
      : { left: 0, top: 0 };
    const result = [];
    for (let i = 0; i < touches.length; i++) {
      result.push({
        clientX: touches[i].clientX,
        clientY: touches[i].clientY,
      });
    }
    return result;
  }

  _toCanvasCoord(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect
      ? this.canvas.getBoundingClientRect()
      : { left: 0, top: 0, width: this.canvas.width, height: this.canvas.height };
    const scaleX = this.canvas.width / (rect.width || this.canvas.width);
    const scaleY = this.canvas.height / (rect.height || this.canvas.height);
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  _onTouchStart(touches) {
    this._touches = touches;
    this._startTime = Date.now();
    this._moved = false;

    if (touches.length === 1) {
      const pos = this._toCanvasCoord(touches[0].clientX, touches[0].clientY);
      this._startPos = pos;

      const renderer = this.game.renderer;
      if (renderer.viewScale > 1.05 && renderer.isInBoardArea(pos.x, pos.y)) {
        // 缩放状态下在棋盘区域 → 可能是拖拽
        this._gesture = 'pan';
        this._panStartX = pos.x;
        this._panStartY = pos.y;
        this._panStartOffsetX = renderer.viewOffsetX;
        this._panStartOffsetY = renderer.viewOffsetY;
      } else {
        this._gesture = 'tap';
      }
    } else if (touches.length === 2) {
      this._gesture = 'pinch';
      const renderer = this.game.renderer;
      this._lastPinchDist = this._getPinchDist(touches);
      this._pinchStartScale = renderer.viewScale;
      this._pinchStartOffsetX = renderer.viewOffsetX;
      this._pinchStartOffsetY = renderer.viewOffsetY;
    }
  }

  _onTouchMove(touches) {
    if (touches.length === 1 && this._gesture === 'pan') {
      const pos = this._toCanvasCoord(touches[0].clientX, touches[0].clientY);
      const dx = pos.x - this._panStartX;
      const dy = pos.y - this._panStartY;

      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        this._moved = true;
      }

      const renderer = this.game.renderer;
      renderer.setViewTransform(
        renderer.viewScale,
        this._panStartOffsetX + dx,
        this._panStartOffsetY + dy
      );
    } else if (touches.length === 2 && this._gesture === 'pinch') {
      this._moved = true;
      const dist = this._getPinchDist(touches);
      const scaleFactor = dist / this._lastPinchDist;
      const newScale = this._pinchStartScale * scaleFactor;

      const renderer = this.game.renderer;
      renderer.setViewTransform(newScale, this._pinchStartOffsetX, this._pinchStartOffsetY);
    } else if (touches.length === 1 && this._gesture === 'tap') {
      const pos = this._toCanvasCoord(touches[0].clientX, touches[0].clientY);
      const dx = pos.x - this._startPos.x;
      const dy = pos.y - this._startPos.y;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        this._moved = true;
        // 转换为 pan 手势（在缩放状态下）
        const renderer = this.game.renderer;
        if (renderer.viewScale > 1.05) {
          this._gesture = 'pan';
          this._panStartX = this._startPos.x;
          this._panStartY = this._startPos.y;
          this._panStartOffsetX = renderer.viewOffsetX;
          this._panStartOffsetY = renderer.viewOffsetY;
        }
      }
    }
  }

  _onTouchEnd(touches) {
    if (!this._moved && this._gesture !== 'pinch') {
      // 是一次点击
      const elapsed = Date.now() - this._startTime;
      if (elapsed < 300 && this._startPos) {
        this.game.handleTap(this._startPos.x, this._startPos.y);
      }
    }

    // 双击回归缩放
    if (!this._moved && this._gesture === 'tap') {
      const now = Date.now();
      if (this._lastTapTime && now - this._lastTapTime < 300) {
        // 双击：切换缩放
        const renderer = this.game.renderer;
        if (renderer.viewScale > 1.1) {
          renderer.setViewTransform(1.0, 0, 0);
        } else {
          renderer.setViewTransform(2.0, 0, 0);
        }
        this._lastTapTime = 0;
      } else {
        this._lastTapTime = now;
      }
    }

    this._gesture = 'none';
    this._touches = [];
  }

  _getPinchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
