// 快乐拼拼豆 · Canvas 2D 渲染器（支持缩放/拖拽）

import { CONFIG } from '../core/config.js';

export class Renderer {
  constructor(ctx, canvas, game) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.game = game;
    this.layout = null;

    // 缩放/平移状态（仅针对棋盘区域）
    this.viewScale = 1.0;
    this.viewOffsetX = 0;
    this.viewOffsetY = 0;
    this.minScale = 1.0;
    this.maxScale = 3.0;

    this.calculateLayout();
  }

  calculateLayout() {
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 基准单位：以 canvas 宽度为基准缩放 UI
    const baseUnit = w / 375; // 以 375px 逻辑宽度为基准

    // 刘海屏安全区域偏移
    const notchOffset = 50 * baseUnit;

    // HUD 区域（加上刘海屏偏移）
    const hudH = Math.max(90, 90 * baseUnit) + notchOffset;

    // 棋盘区域：占屏幕宽度 92%
    const cellTotal = CONFIG.CELL_SIZE + CONFIG.CELL_GAP;
    const boardPixelW = CONFIG.COLS * cellTotal;
    const boardPixelH = CONFIG.ROWS * cellTotal;

    // 暂存槽和按钮区域
    const holdingH = Math.max(70, 70 * baseUnit);
    const btnAreaH = Math.max(60, 60 * baseUnit);
    const bottomPadding = 20 * baseUnit;

    // 棋盘可用空间
    const availW = w * 0.92;
    const availH = h - hudH - holdingH - btnAreaH - bottomPadding - 20 * baseUnit;

    const scale = Math.min(availW / boardPixelW, availH / boardPixelH, 3.0);

    const scaledBoardW = boardPixelW * scale;
    const scaledBoardH = boardPixelH * scale;

    const boardX = (w - scaledBoardW) / 2;
    const boardY = hudH;

    // 暂存槽
    const holdingCellW = Math.min(48 * baseUnit, (w - 40 * baseUnit) / CONFIG.MAX_HOLDING - 4);
    const holdingW = CONFIG.MAX_HOLDING * (holdingCellW + 4) + 24 * baseUnit;
    const holdingX = (w - holdingW) / 2;
    const holdingY = boardY + scaledBoardH + 16 * baseUnit;
    const holdingTotalH = holdingCellW + 16 * baseUnit;

    // 按钮区
    const btnY = holdingY + holdingTotalH + 12 * baseUnit;
    const btnW = Math.max(130, 130 * baseUnit);
    const btnH = Math.max(48, 48 * baseUnit);

    this.layout = {
      baseUnit,
      scale,
      boardX,
      boardY,
      boardW: scaledBoardW,
      boardH: scaledBoardH,
      cellTotal: cellTotal * scale,
      cellSize: CONFIG.CELL_SIZE * scale,
      beanRadius: CONFIG.BEAN_RADIUS * scale,
      hudH,
      holdingX,
      holdingY,
      holdingW,
      holdingCellW,
      holdingH: holdingTotalH,
      btnY,
      btnW,
      btnH,
    };

    // 重置缩放
    this.viewScale = 1.0;
    this.viewOffsetX = 0;
    this.viewOffsetY = 0;
  }

  // 设置缩放（外部调用）
  setViewTransform(scale, offsetX, offsetY) {
    this.viewScale = Math.max(this.minScale, Math.min(this.maxScale, scale));
    this.viewOffsetX = offsetX;
    this.viewOffsetY = offsetY;
    this._clampOffset();
  }

  _clampOffset() {
    const l = this.layout;
    const scaledW = l.boardW * this.viewScale;
    const scaledH = l.boardH * this.viewScale;

    // 限制不能拖出可视区太远
    const maxOffsetX = Math.max(0, (scaledW - l.boardW) / 2 + 20);
    const maxOffsetY = Math.max(0, (scaledH - l.boardH) / 2 + 20);

    this.viewOffsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, this.viewOffsetX));
    this.viewOffsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, this.viewOffsetY));
  }

  // 将画布坐标转换为棋盘视图坐标（考虑缩放/偏移）
  canvasToBoardView(canvasX, canvasY) {
    const l = this.layout;
    const centerX = l.boardX + l.boardW / 2;
    const centerY = l.boardY + l.boardH / 2;

    // 逆变换：从画布坐标还原到棋盘逻辑坐标
    const x = (canvasX - centerX - this.viewOffsetX) / this.viewScale + centerX;
    const y = (canvasY - centerY - this.viewOffsetY) / this.viewScale + centerY;
    return { x, y };
  }

  // 获取格子中心坐标（画布坐标，应用缩放后）
  getCellCenter(row, col) {
    const l = this.layout;
    const rawX = l.boardX + col * l.cellTotal + l.cellTotal / 2;
    const rawY = l.boardY + row * l.cellTotal + l.cellTotal / 2;
    return this._applyViewTransform(rawX, rawY);
  }

  _applyViewTransform(x, y) {
    const l = this.layout;
    const centerX = l.boardX + l.boardW / 2;
    const centerY = l.boardY + l.boardH / 2;
    return {
      x: (x - centerX) * this.viewScale + centerX + this.viewOffsetX,
      y: (y - centerY) * this.viewScale + centerY + this.viewOffsetY,
    };
  }

  // 获取暂存槽中某个位置的中心坐标
  getHoldingCenter(index) {
    const l = this.layout;
    const cellW = l.holdingCellW + 4;
    const x = l.holdingX + 12 * l.baseUnit + index * cellW + cellW / 2;
    const y = l.holdingY + l.holdingH / 2;
    return { x, y };
  }

  // 通过画布坐标获取对应的格子(row,col) — 考虑缩放
  hitTestBoard(canvasX, canvasY) {
    const l = this.layout;
    // 先逆变换
    const { x, y } = this.canvasToBoardView(canvasX, canvasY);

    const relX = x - l.boardX;
    const relY = y - l.boardY;

    if (relX < 0 || relY < 0 || relX > l.boardW || relY > l.boardH) return null;

    const col = Math.floor(relX / l.cellTotal);
    const row = Math.floor(relY / l.cellTotal);

    if (row < 0 || row >= CONFIG.ROWS || col < 0 || col >= CONFIG.COLS) return null;
    return { row, col };
  }

  // 检测暂存槽点击（返回具体索引）
  hitTestHolding(canvasX, canvasY) {
    const l = this.layout;
    if (canvasY < l.holdingY || canvasY > l.holdingY + l.holdingH) return -1;
    if (canvasX < l.holdingX || canvasX > l.holdingX + l.holdingW) return -1;

    const cellW = l.holdingCellW + 4;
    const relX = canvasX - l.holdingX - 12 * l.baseUnit;
    const idx = Math.floor(relX / cellW);
    if (idx < 0 || idx >= CONFIG.MAX_HOLDING) return -1;
    return idx;
  }

  // 检测暂存槽区域（任意位置）
  hitTestHoldingArea(canvasX, canvasY) {
    const l = this.layout;
    return canvasY >= l.holdingY && canvasY <= l.holdingY + l.holdingH &&
           canvasX >= l.holdingX && canvasX <= l.holdingX + l.holdingW;
  }

  // 放置按钮已移除，总是返回false
  hitTestPlaceButton(canvasX, canvasY) {
    return false;
  }

  // 检测重开按钮（居中）
  hitTestRestartButton(canvasX, canvasY) {
    const l = this.layout;
    const w = this.canvas.width;
    const btnX = (w - l.btnW) / 2;
    return canvasX >= btnX && canvasX <= btnX + l.btnW &&
           canvasY >= l.btnY && canvasY <= l.btnY + l.btnH;
  }

  // 检测是否在棋盘区域内（用于手势判断）
  isInBoardArea(canvasX, canvasY) {
    const l = this.layout;
    return canvasX >= l.boardX - 20 && canvasX <= l.boardX + l.boardW + 20 &&
           canvasY >= l.boardY - 20 && canvasY <= l.boardY + l.boardH + 20;
  }

  render(gameState, animManager) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // 清屏
    ctx.fillStyle = CONFIG.BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    // 绘制HUD
    this.renderHUD(gameState);

    // 绘制棋盘（带缩放）
    ctx.save();
    const l = this.layout;
    const centerX = l.boardX + l.boardW / 2;
    const centerY = l.boardY + l.boardH / 2;
    ctx.translate(centerX + this.viewOffsetX, centerY + this.viewOffsetY);
    ctx.scale(this.viewScale, this.viewScale);
    ctx.translate(-centerX, -centerY);

    this.renderBoardBg();
    this.renderBoard(gameState);
    if (gameState.highlightedRegion) {
      this.renderHighlight(gameState.highlightedRegion);
    }

    ctx.restore();

    // 缩放指示器（当缩放 > 1 时显示）
    if (this.viewScale > 1.05) {
      this.renderZoomIndicator();
    }

    // 绘制暂存槽
    this.renderHolding(gameState);

    // 绘制按钮
    this.renderButtons(gameState);

    // 绘制飞行中的豆
    this.renderFlyingBeans(animManager);

    // 绘制粒子
    this.renderParticles(animManager);

    // 绘制消息
    if (gameState.message) {
      this.renderMessage(gameState.message.text);
    }

    // 绘制胜利/超时界面
    if (gameState.phase === 'won') {
      this.renderWinScreen(gameState);
    } else if (gameState.phase === 'timeout') {
      this.renderTimeoutScreen(gameState);
    }
  }

  renderHUD(gameState) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const bu = this.layout.baseUnit;
    const notchOffset = 50 * bu; // 刘海屏偏移

    // 关卡标题
    ctx.fillStyle = '#5B3E8A';
    ctx.font = `bold ${Math.round(24 * bu)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('快乐拼拼豆', w / 2, 35 * bu + notchOffset);

    // 倒计时
    ctx.fillStyle = '#F4A261';
    ctx.font = `bold ${Math.round(20 * bu)}px sans-serif`;
    ctx.fillText(`⏱ ${gameState.getRemainingTime()}`, w / 2, 62 * bu + notchOffset);

    // 步数
    ctx.fillStyle = '#555';
    ctx.font = `bold ${Math.round(16 * bu)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(`步数: ${gameState.steps}`, 20 * bu, 62 * bu + notchOffset);

    // 进度
    const prog = gameState.getProgress();
    ctx.textAlign = 'right';
    ctx.fillText(`${prog.matched}/${prog.total}`, w - 20 * bu, 62 * bu + notchOffset);
    ctx.textAlign = 'left';
  }

  renderBoardBg() {
    const ctx = this.ctx;
    const l = this.layout;

    ctx.fillStyle = CONFIG.BOARD_BG;
    ctx.beginPath();
    this.roundRect(ctx, l.boardX - 8, l.boardY - 8, l.boardW + 16, l.boardH + 16, 12);
    ctx.fill();
  }

  renderBoard(gameState) {
    const ctx = this.ctx;
    const l = this.layout;
    const borderWidth = l.cellTotal * 0.12; // 粗border

    // 构建选中区域的快速查找集合
    const highlightSet = new Set();
    if (gameState.highlightedRegion) {
      for (const { row, col } of gameState.highlightedRegion) {
        highlightSet.add(`${row},${col}`);
      }
    }

    for (let r = 0; r < CONFIG.ROWS; r++) {
      for (let c = 0; c < CONFIG.COLS; c++) {
        const cell = gameState.board[r][c];
        if (!cell.valid) continue;

        const cx = l.boardX + c * l.cellTotal + l.cellTotal / 2;
        const cy = l.boardY + r * l.cellTotal + l.cellTotal / 2;
        const fullSize = l.cellTotal; // 占满整格，无间隙

        const isHighlighted = highlightSet.has(`${r},${c}`);

        const targetColorHex = CONFIG.COLORS[cell.targetColor];

        // 整个格子填充目标颜色（作为border/底色）
        ctx.fillStyle = targetColorHex;
        ctx.beginPath();
        this.roundRect(ctx, cx - fullSize / 2, cy - fullSize / 2, fullSize, fullSize, 1);
        ctx.fill();

        if (cell.beanColor !== null) {
          const innerSize = fullSize - borderWidth * 2;

          if (isHighlighted) {
            const liftY = -5; // 上提像素

            // 选中状态：画阴影（在原位）
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            this.roundRect(ctx, cx - innerSize * 0.44, cy - innerSize * 0.38 + 2, innerSize * 0.88, innerSize * 0.76, innerSize * 0.15);
            ctx.fill();

            // 平滑呼吸式闪烁（sin曲线，柔和过渡）
            const time = Date.now();
            const cycle = (time % 2000) / 2000; // 0~1 循环，每2秒一轮
            const t = (Math.sin(cycle * Math.PI * 2) + 1) / 2; // 0~1 平滑值，0=最深 1=最亮

            // t接近0时画加深版，t接近1时画高亮版
            if (t < 0.5) {
              this.renderBeanDarkened(cx, cy + liftY, innerSize * 0.48, cell.beanColor);
            } else {
              this.renderBeanBrightened(cx, cy + liftY, innerSize * 0.48, cell.beanColor);
            }
          } else {
            // 普通状态
            this.renderBean(cx, cy, innerSize * 0.48, cell.beanColor, cell.beanColor === cell.targetColor);
          }
        } else {
          // 空位：整格都是目标颜色，中间绘制一个稍暗的凹陷效果
          const innerSize = fullSize - borderWidth * 2;
          ctx.fillStyle = this.hexToRgba(this.darkenHex(targetColorHex, 0.1), 0.6);
          ctx.beginPath();
          this.roundRect(ctx, cx - innerSize / 2, cy - innerSize / 2, innerSize, innerSize, 2);
          ctx.fill();
        }
      }
    }
  }

  renderBean(cx, cy, radius, colorIndex, matched) {
    const ctx = this.ctx;
    const color = CONFIG.COLORS[colorIndex];
    const r = Math.max(radius, 1); // 防止负值

    // 豆主体（圆角方形）
    ctx.fillStyle = color;
    ctx.beginPath();
    this.roundRect(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.4);
    ctx.fill();

    // 底部深色边（立体感）
    ctx.fillStyle = this.hexToRgba(this.darkenHex(color, 0.2), 0.5);
    ctx.beginPath();
    this.roundRect(ctx, cx - r, cy - r + r * 0.15, r * 2, r * 2, r * 0.4);
    ctx.fill();

    // 覆盖回主色
    ctx.fillStyle = color;
    ctx.beginPath();
    this.roundRect(ctx, cx - r, cy - r, r * 2, r * 1.85, r * 0.4);
    ctx.fill();

    // 高光
    const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 0, cx, cy, r * 1.2);
    grad.addColorStop(0, 'rgba(255,255,255,0.45)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    this.roundRect(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.4);
    ctx.fill();

    // 匹配标记
    if (matched) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      this.roundRect(ctx, cx - r + 1, cy - r + 1, r * 2 - 2, r * 2 - 2, r * 0.35);
      ctx.stroke();
    }
  }

  // 选中状态 — 加深版（前1秒）
  renderBeanDarkened(cx, cy, radius, colorIndex) {
    const ctx = this.ctx;
    const baseColor = CONFIG.COLORS[colorIndex];
    const color = this.darkenHex(baseColor, 0.12); // 轻微加深12%
    const r = Math.max(radius, 1);

    // 豆主体
    ctx.fillStyle = color;
    ctx.beginPath();
    this.roundRect(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.4);
    ctx.fill();

    // 底部深色边
    ctx.fillStyle = this.hexToRgba(this.darkenHex(baseColor, 0.25), 0.5);
    ctx.beginPath();
    this.roundRect(ctx, cx - r, cy - r + r * 0.15, r * 2, r * 2, r * 0.4);
    ctx.fill();

    // 覆盖回加深色
    ctx.fillStyle = color;
    ctx.beginPath();
    this.roundRect(ctx, cx - r, cy - r, r * 2, r * 1.85, r * 0.4);
    ctx.fill();

    // 微弱高光
    const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 0, cx, cy, r * 1.2);
    grad.addColorStop(0, 'rgba(255,255,255,0.2)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    this.roundRect(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.4);
    ctx.fill();
  }

  // 选中状态 — 高亮版（后1秒）
  renderBeanBrightened(cx, cy, radius, colorIndex) {
    const ctx = this.ctx;
    const baseColor = CONFIG.COLORS[colorIndex];
    const color = this.brightenHex(baseColor, 0.12); // 轻微提亮12%
    const r = Math.max(radius, 1);

    // 豆主体
    ctx.fillStyle = color;
    ctx.beginPath();
    this.roundRect(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.4);
    ctx.fill();

    // 底部深色边
    ctx.fillStyle = this.hexToRgba(this.darkenHex(baseColor, 0.08), 0.35);
    ctx.beginPath();
    this.roundRect(ctx, cx - r, cy - r + r * 0.15, r * 2, r * 2, r * 0.4);
    ctx.fill();

    // 覆盖回亮色
    ctx.fillStyle = color;
    ctx.beginPath();
    this.roundRect(ctx, cx - r, cy - r, r * 2, r * 1.85, r * 0.4);
    ctx.fill();

    // 柔和高光
    const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 0, cx, cy, r * 1.2);
    grad.addColorStop(0, 'rgba(255,255,255,0.35)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    this.roundRect(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.4);
    ctx.fill();
  }

  // 辅助：提亮颜色
  brightenHex(hex, amount) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    r = Math.min(255, Math.round(r + (255 - r) * amount));
    g = Math.min(255, Math.round(g + (255 - g) * amount));
    b = Math.min(255, Math.round(b + (255 - b) * amount));
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
  }

  darkenHex(hex, amount) {
    const r = Math.max(0, parseInt(hex.slice(1, 3), 16) * (1 - amount));
    const g = Math.max(0, parseInt(hex.slice(3, 5), 16) * (1 - amount));
    const b = Math.max(0, parseInt(hex.slice(5, 7), 16) * (1 - amount));
    return `#${Math.round(r).toString(16).padStart(2,'0')}${Math.round(g).toString(16).padStart(2,'0')}${Math.round(b).toString(16).padStart(2,'0')}`;
  }

  renderHighlight(region) {
    // 选中效果已在 renderBoard 中通过上提+鲜艳色实现，此处无需额外绘制
  }

  renderZoomIndicator() {
    const ctx = this.ctx;
    const l = this.layout;
    const bu = l.baseUnit;

    const text = `${Math.round(this.viewScale * 100)}%`;
    const x = this.canvas.width - 60 * bu;
    const y = l.boardY + 20 * bu;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    this.roundRect(ctx, x - 25 * bu, y - 12 * bu, 50 * bu, 24 * bu, 12 * bu);
    ctx.fill();

    ctx.fillStyle = '#FFF';
    ctx.font = `bold ${Math.round(12 * bu)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(text, x, y + 4 * bu);
    ctx.textAlign = 'left';
  }

  renderHolding(gameState) {
    const ctx = this.ctx;
    const l = this.layout;
    const bu = l.baseUnit;

    // 暂存槽背景
    ctx.fillStyle = CONFIG.HOLDING_BG;
    ctx.beginPath();
    this.roundRect(ctx, l.holdingX, l.holdingY, l.holdingW, l.holdingH, 12 * bu);
    ctx.fill();
    ctx.strokeStyle = '#D0C8E0';
    ctx.lineWidth = 2 * bu;
    ctx.stroke();

    // 格子
    const cellW = l.holdingCellW;
    const gap = 4;
    for (let i = 0; i < CONFIG.MAX_HOLDING; i++) {
      const x = l.holdingX + 12 * bu + i * (cellW + gap);
      const y = l.holdingY + (l.holdingH - cellW) / 2;

      // 空格子
      ctx.fillStyle = '#F0ECF5';
      ctx.beginPath();
      this.roundRect(ctx, x, y, cellW, cellW, 6 * bu);
      ctx.fill();

      // 如果有豆
      if (i < gameState.holding.length) {
        const bean = gameState.holding[i];
        const isSelected = gameState.selection && gameState.selection.source === 'holding' && bean.color === gameState.selection.color;
        const bcx = x + cellW / 2;
        // 选中的豆向上偏移（提起效果）
        const bcy = y + cellW / 2 + (isSelected ? -8 * bu : 0);

        // 选中态发光边框
        if (isSelected) {
          ctx.shadowColor = CONFIG.COLORS[bean.color];
          ctx.shadowBlur = 8 * bu;
          ctx.strokeStyle = CONFIG.COLORS[bean.color];
          ctx.lineWidth = 2 * bu;
          ctx.beginPath();
          this.roundRect(ctx, bcx - cellW * 0.42, bcy - cellW * 0.42, cellW * 0.84, cellW * 0.84, 6 * bu);
          ctx.stroke();
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        }

        this.renderBean(bcx, bcy, cellW * 0.38, bean.color, false);
      }
    }
  }

  renderButtons(gameState) {
    const ctx = this.ctx;
    const l = this.layout;
    const w = this.canvas.width;
    const bu = l.baseUnit;

    // 只有重新开始按钮（居中）
    const btnX = (w - l.btnW) / 2;
    this.drawButton(btnX, l.btnY, l.btnW, l.btnH, '重新开始', '#4ECDC4', true);
  }

  drawButton(x, y, w, h, text, color, enabled) {
    const ctx = this.ctx;
    const bu = this.layout.baseUnit;

    ctx.fillStyle = enabled ? color : '#CCC';
    ctx.beginPath();
    this.roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();

    // 轻微阴影
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 4 * bu;
    ctx.shadowOffsetY = 2 * bu;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 文字
    ctx.fillStyle = '#FFF';
    ctx.font = `bold ${Math.round(16 * bu)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
  }

  renderFlyingBeans(animManager) {
    const ctx = this.ctx;
    for (const bean of animManager.flyingBeans) {
      ctx.save();
      ctx.globalAlpha = bean.alpha;
      ctx.translate(bean.x, bean.y);
      ctx.scale(bean.scale, bean.scale);
      this.renderBean(0, 0, CONFIG.BEAN_RADIUS * this.layout.scale * 0.85, bean.color, false);
      ctx.restore();
    }
  }

  renderParticles(animManager) {
    const ctx = this.ctx;
    for (const p of animManager.particles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  renderMessage(text) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const bu = this.layout.baseUnit;

    ctx.font = `bold ${Math.round(16 * bu)}px sans-serif`;
    const tw = ctx.measureText(text).width + 40 * bu;
    const ty = h * 0.45;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    this.roundRect(ctx, (w - tw) / 2, ty - 18 * bu, tw, 36 * bu, 18 * bu);
    ctx.fill();

    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'center';
    ctx.fillText(text, w / 2, ty + 5 * bu);
    ctx.textAlign = 'left';
  }

  renderWinScreen(gameState) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const bu = this.layout.baseUnit;

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, w, h);

    const boxW = 280 * bu;
    const boxH = 200 * bu;
    const boxX = (w - boxW) / 2;
    const boxY = (h - boxH) / 2;

    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    this.roundRect(ctx, boxX, boxY, boxW, boxH, 16 * bu);
    ctx.fill();

    ctx.fillStyle = '#5B3E8A';
    ctx.font = `bold ${Math.round(26 * bu)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('🎉 恭喜完成!', w / 2, boxY + 55 * bu);

    ctx.fillStyle = '#666';
    ctx.font = `${Math.round(18 * bu)}px sans-serif`;
    const elapsed = Math.floor(gameState.elapsedTime / 1000);
    const min = Math.floor(elapsed / 60);
    const sec = elapsed % 60;
    ctx.fillText(`用时: ${min}分${sec}秒  步数: ${gameState.steps}`, w / 2, boxY + 100 * bu);

    this.drawButton(boxX + 70 * bu, boxY + 130 * bu, 140 * bu, 44 * bu, '再来一局', '#6BCB77', true);
    ctx.textAlign = 'left';
  }

  renderTimeoutScreen(gameState) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const bu = this.layout.baseUnit;

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, 0, w, h);

    const boxW = 280 * bu;
    const boxH = 180 * bu;
    const boxX = (w - boxW) / 2;
    const boxY = (h - boxH) / 2;

    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    this.roundRect(ctx, boxX, boxY, boxW, boxH, 16 * bu);
    ctx.fill();

    ctx.fillStyle = '#E76F51';
    ctx.font = `bold ${Math.round(26 * bu)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('⏰ 时间到!', w / 2, boxY + 55 * bu);

    ctx.fillStyle = '#666';
    ctx.font = `${Math.round(18 * bu)}px sans-serif`;
    const prog = gameState.getProgress();
    ctx.fillText(`完成进度: ${prog.matched}/${prog.total}`, w / 2, boxY + 95 * bu);

    this.drawButton(boxX + 70 * bu, boxY + 120 * bu, 140 * bu, 44 * bu, '重新开始', '#4ECDC4', true);
    ctx.textAlign = 'left';
  }

  // 辅助：圆角矩形
  roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
}
