// 快乐拼拼豆 · 主入口

import { CONFIG } from './core/config.js';
import { GameState } from './core/GameState.js';
import { AnimManager } from './anim/AnimManager.js';
import { Renderer } from './render/Renderer.js';
import { TouchHandler } from './input/TouchHandler.js';

export class Main {
  constructor() {
    this.canvas = this._getCanvas();
    if (!this.canvas) {
      console.error('[Main] no canvas');
      return;
    }

    this.dpr = this._getDpr();
    this._setupCanvas();

    this.ctx = this.canvas.getContext('2d');
    this.gameState = new GameState();
    this.animManager = new AnimManager();
    this.renderer = new Renderer(this.ctx, this.canvas, this);
    this.touchHandler = new TouchHandler(this.canvas, this);

    this.lastTime = 0;

    // 开始游戏
    this.gameState.init();
    this._startLoop();
  }

  _getCanvas() {
    if (typeof GameGlobal !== 'undefined' && GameGlobal.canvas) return GameGlobal.canvas;
    if (typeof window !== 'undefined' && window.canvas) return window.canvas;
    if (typeof document !== 'undefined') return document.getElementById('gameCanvas');
    return null;
  }

  _getDpr() {
    if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
      return wx.getSystemInfoSync().pixelRatio || 2;
    }
    return window.devicePixelRatio || 2;
  }

  _setupCanvas() {
    let w, h;
    if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
      const info = wx.getSystemInfoSync();
      w = info.windowWidth;
      h = info.windowHeight;
    } else {
      w = window.innerWidth;
      h = window.innerHeight;
    }

    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;

    if (this.canvas.style) {
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
    }
  }

  _startLoop() {
    const loop = (timestamp) => {
      const dt = this.lastTime ? timestamp - this.lastTime : 16;
      this.lastTime = timestamp;

      this._update(dt);
      this._render();

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  _update(dt) {
    // 更新计时
    this.gameState.updateTimer();

    // 更新动画
    this.animManager.update(dt);

    // 更新消息计时器
    if (this.gameState.message) {
      this.gameState.message.timer -= dt;
      if (this.gameState.message.timer <= 0) {
        this.gameState.message = null;
      }
    }

    // 选中状态的高亮跟随 selection 自动维持
    if (this.gameState.selection && this.gameState.selection.source === 'board') {
      this.gameState.highlightedRegion = this.gameState.selection.cells;
    } else if (!this.gameState.selection || this.gameState.selection.source !== 'board') {
      this.gameState.highlightedRegion = null;
    }
  }

  _render() {
    this.renderer.render(this.gameState, this.animManager);
  }

  /**
   * 处理点击（canvasX, canvasY 是画布像素坐标）
   */
  handleTap(canvasX, canvasY) {
    const gs = this.gameState;

    // 胜利/超时状态下点击重开
    if (gs.phase === 'won' || gs.phase === 'timeout') {
      this.restart();
      return;
    }

    // 动画进行中不处理
    if (this.animManager.isAnimating) return;

    // 检测重开按钮
    if (this.renderer.hitTestRestartButton(canvasX, canvasY)) {
      this.restart();
      return;
    }

    // 检测暂存槽区域点击
    const holdingHit = this.renderer.hitTestHoldingArea(canvasX, canvasY);
    if (holdingHit) {
      this._handleHoldingTap(canvasX, canvasY);
      return;
    }

    // 检测棋盘点击（需要经过视图变换逆变换）
    const cell = this.renderer.hitTestBoard(canvasX, canvasY);
    if (cell) {
      this._handleBoardTap(cell.row, cell.col);
    }
  }

  /**
   * 处理暂存槽区域点击
   */
  _handleHoldingTap(canvasX, canvasY) {
    const gs = this.gameState;

    // 如果当前有棋盘选中的豆 → 移入暂存槽
    if (gs.selection && gs.selection.source === 'board') {
      const result = gs.moveSelectionToHolding();
      if (result && result.action === 'moved_to_holding') {
        // 飞行动画：从棋盘到暂存槽
        for (let i = 0; i < result.beans.length; i++) {
          const bean = result.beans[i];
          const from = this.renderer.getCellCenter(bean.sourceRow, bean.sourceCol);
          const holdingIdx = gs.holding.length - result.beans.length + i;
          const to = this.renderer.getHoldingCenter(holdingIdx);

          this.animManager.addFlyingBean(
            from.x, from.y, to.x, to.y,
            bean.color, CONFIG.ANIM_FLY_DURATION + i * 30, null
          );
        }
      }
      return;
    }

    // 否则尝试选中暂存槽中的豆
    const holdIdx = this.renderer.hitTestHolding(canvasX, canvasY);
    if (holdIdx >= 0 && holdIdx < gs.holding.length) {
      gs.selectHoldingColor(holdIdx);
    }
  }

  /**
   * 处理棋盘点击
   */
  _handleBoardTap(row, col) {
    const gs = this.gameState;
    const boardCell = gs.board[row][col];
    if (!boardCell.valid) return;

    if (boardCell.beanColor !== null) {
      // 有豆的格子 → 选中提起（或切换选中）
      gs.selectBoardBeans(row, col);
    } else {
      // 空位格子 → 放豆
      this._doPlaceBeans(row, col);
    }
  }

  _doPlaceBeans(row, col) {
    const gs = this.gameState;
    const result = gs.placeBeans(row, col);
    if (!result) return;

    if (result.action === 'placed' || result.action === 'placed_and_won') {
      // 飞行动画
      for (let i = 0; i < result.placed.length; i++) {
        const p = result.placed[i];
        let from;
        if (result.fromBoard) {
          from = this.renderer.getCellCenter(p.bean.sourceRow, p.bean.sourceCol);
        } else {
          from = this.renderer.getHoldingCenter(0);
        }
        const to = this.renderer.getCellCenter(p.row, p.col);

        this.animManager.addFlyingBean(
          from.x, from.y, to.x, to.y,
          p.bean.color, CONFIG.ANIM_FLY_DURATION + i * 50, null
        );
      }

      if (result.action === 'placed_and_won') {
        setTimeout(() => {
          this.animManager.addCelebrationParticles(this.canvas.width, this.canvas.height);
        }, 600);
      }
    }
  }

  restart() {
    this.gameState.init();
    this.animManager = new AnimManager();
    this.renderer.calculateLayout();
  }
}

// 浏览器环境自启动
if (typeof document !== 'undefined' && typeof wx === 'undefined') {
  new Main();
}
