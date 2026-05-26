import {
  COLORS,
  BOX_SLOT_CAPACITY,
  TOP_BOX_COUNT,
  BUFFER_CAPACITY,
  SCREW_RADIUS,
  BOARD_RADIUS,
} from '../core/config.js';
import { generateLevel, LEVEL_LOGICAL_W, LEVEL_LOGICAL_H } from '../core/levelData.js';
import { WIDTH, HEIGHT } from '../main.js';

/**
 * 《打个螺丝》核心玩法场景（v4）
 *
 * 改动要点（vs v3）：
 *  1. 板子形状多样、分布更均匀、螺丝数从 36 → 63
 *  2. 遮挡判定改为螺丝粒度：每颗螺丝独立判断上方是否有其他板子覆盖
 *  3. 备选区改为 1 个矩形框 + 5 个圆洞（容纳螺丝）
 *  4. 工具箱补新色时自动扫描 buffer：同色螺丝回流，剩余左移
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  init() {
    this.uiScale = WIDTH / LEVEL_LOGICAL_W;
    this.offsetX = 0;
    this.offsetY = Math.max(0, (HEIGHT - LEVEL_LOGICAL_H * this.uiScale) / 2);
  }

  create() {
    console.log('[GameScene] create start');
    try {
      this.level = generateLevel();
      console.log('[GameScene] level', this.level.boards.length, 'boards,',
        this.level.boards.reduce((s, b) => s + b.screws.length, 0), 'screws');

      this.resetState();
      this.buildScrewTextures();
      this.buildHUD();
      this.buildTopBoxes();
      this.buildBuffer();
      this.buildBoards();
      this.recomputeOcclusion();
      this.refreshHUD();
      this.playEntranceAnimation();
      console.log('[GameScene] create end OK');
    } catch (e) {
      console.error('[GameScene] create error', e && e.stack || e);
    }
  }

  // ───────────────────── 坐标工具 ─────────────────────

  toScreenX(lx) { return this.offsetX + lx * this.uiScale; }
  toScreenY(ly) { return this.offsetY + ly * this.uiScale; }
  s(v) { return v * this.uiScale; }

  // ───────────────────── 状态管理 ─────────────────────

  resetState() {
    this.boards = this.level.boards.map((b) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      z: b.z,
      removed: false,
      screws: b.screws.map((s, idx) => ({
        id: `${b.id}_s${idx}`,
        color: s.color,
        offsetX: s.offsetX,
        offsetY: s.offsetY,
        sprite: null,
        boardId: b.id,
        unlocked: true,
      })),
    }));

    this.boxes = this.level.initialBoxColors.map((c, i) => ({
      slotIndex: i,
      color: c,
      count: 0,
    }));

    this.colorPoolIdx = 0;
    this.buffer = [];
    this.status = 'playing';
    this.totalScrews = this.boards.reduce((sum, b) => sum + b.screws.length, 0);
    this.removedCount = 0;
  }

  // ───────────────────── 螺丝纹理预生成 ─────────────────────

  buildScrewTextures() {
    const r = Math.ceil(this.s(SCREW_RADIUS));
    const size = (r + 4) * 2;
    for (let ci = 0; ci < COLORS.length; ci++) {
      this.makeScrewTexture(`screw_${ci}_on`, ci, true, r, size);
      this.makeScrewTexture(`screw_${ci}_off`, ci, false, r, size);
    }
  }

  makeScrewTexture(key, colorIdx, enabled, r, size) {
    if (this.textures.exists(key)) this.textures.remove(key);

    const g = this.add.graphics();
    g.setVisible(false);

    const fill = parseInt(COLORS[colorIdx].slice(1), 16);
    const alpha = enabled ? 1 : 0.4;
    const cx = size / 2;
    const cy = size / 2;

    g.fillStyle(0x000000, enabled ? 0.3 : 0.12);
    g.fillCircle(cx + 2, cy + 3, r);
    g.fillStyle(fill, alpha);
    g.fillCircle(cx, cy, r);
    g.fillStyle(0x000000, enabled ? 0.18 : 0.08);
    g.fillCircle(cx, cy, r * 0.7);
    g.fillStyle(fill, alpha);
    g.fillCircle(cx, cy, r * 0.6);
    g.lineStyle(Math.max(2, r * 0.14), 0x111111, enabled ? 0.85 : 0.3);
    g.beginPath();
    g.moveTo(cx - r * 0.45, cy);
    g.lineTo(cx + r * 0.45, cy);
    g.moveTo(cx, cy - r * 0.45);
    g.lineTo(cx, cy + r * 0.45);
    g.strokePath();
    g.fillStyle(0xffffff, enabled ? 0.55 : 0.18);
    g.fillCircle(cx - r * 0.35, cy - r * 0.35, r * 0.13);
    g.lineStyle(2, 0xffffff, enabled ? 0.8 : 0.25);
    g.strokeCircle(cx, cy, r);

    g.generateTexture(key, size, size);
    g.destroy();
  }

  screwTextureKey(colorIdx, enabled) {
    return `screw_${colorIdx}_${enabled ? 'on' : 'off'}`;
  }

  // ───────────────────── HUD ─────────────────────

  buildHUD() {
    this.hudText = this.add.text(WIDTH / 2, this.s(50), '打个螺丝 · Day 1', {
      fontSize: `${Math.round(this.s(32))}px`,
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.statusText = this.add.text(WIDTH / 2, this.s(88), '', {
      fontSize: `${Math.round(this.s(20))}px`,
      color: '#cccccc',
    }).setOrigin(0.5);
  }

  refreshHUD() {
    const remaining = this.totalScrews - this.removedCount;
    const poolRemain = (this.level && this.level.colorPool ? this.level.colorPool.length : 0) - (this.colorPoolIdx || 0);
    const boxCnts = this.boxes.map((b) => `${b.color}:${b.count}`).join(',');
    this.statusText.setText(
      `剩余 ${remaining}/${this.totalScrews} · 备选 ${this.buffer.length}/${BUFFER_CAPACITY} · 箱${this.boxes.length} · 池${poolRemain}\n[${boxCnts}]`,
    );
  }

  // ───────────────────── 顶部工具箱 ─────────────────────

  buildTopBoxes() {
    const boxW = 140;
    const boxH = 90;
    const gap = 16;
    const totalW = TOP_BOX_COUNT * boxW + (TOP_BOX_COUNT - 1) * gap;
    const startX = (LEVEL_LOGICAL_W - totalW) / 2;
    const y = 170;

    this.boxLayout = {
      boxW, boxH, gap, startX, y,
      sw: this.s(boxW), sh: this.s(boxH), r: this.s(12),
    };

    this.boxes.forEach((box, i) => {
      const cx = startX + i * (boxW + gap) + boxW / 2;
      box.cx = this.toScreenX(cx);
      box.cy = this.toScreenY(y);
      box.sw = this.boxLayout.sw;
      box.sh = this.boxLayout.sh;
      box.r = this.boxLayout.r;
      box.holeCenters = [];
      for (let h = 0; h < BOX_SLOT_CAPACITY; h++) {
        const t = (h + 1) / (BOX_SLOT_CAPACITY + 1);
        const hx = box.cx - box.sw / 2 + box.sw * t;
        const hy = box.cy + this.s(8);
        box.holeCenters.push({ x: hx, y: hy });
      }
    });

    this.boxGfx = this.add.graphics();
    this.redrawAllBoxes();
  }

  redrawAllBoxes() {
    const g = this.boxGfx;
    g.clear();
    for (const box of this.boxes) {
      if (box.removed || box.color == null) continue;
      this.drawToolboxInto(g, box);
    }
  }

  drawToolboxInto(g, box) {
    const fill = parseInt(COLORS[box.color].slice(1), 16);
    const dark = 0x1a1d2e;

    g.fillStyle(fill, 1);
    g.fillRoundedRect(box.cx - box.sw / 2, box.cy - box.sh / 2 + this.s(10), box.sw, box.sh - this.s(10), box.r);
    g.fillStyle(0xffffff, 0.18);
    g.fillRoundedRect(box.cx - box.sw / 2, box.cy - box.sh / 2 + this.s(10), box.sw, this.s(14), box.r);
    const hw = this.s(50);
    const hh = this.s(20);
    g.fillStyle(0x222639, 1);
    g.fillRoundedRect(box.cx - hw / 2, box.cy - box.sh / 2 - this.s(2), hw, hh, this.s(8));
    g.fillStyle(fill, 1);
    g.fillRoundedRect(box.cx - hw / 2 + this.s(4), box.cy - box.sh / 2 + this.s(2), hw - this.s(8), hh - this.s(6), this.s(6));
    g.lineStyle(this.s(2), 0x000000, 0.35);
    g.strokeRoundedRect(box.cx - box.sw / 2, box.cy - box.sh / 2 + this.s(10), box.sw, box.sh - this.s(10), box.r);

    const holeR = this.s(14);
    for (let h = 0; h < BOX_SLOT_CAPACITY; h++) {
      const c = box.holeCenters[h];
      if (h < box.count) {
        g.fillStyle(0xffffff, 1);
        g.fillCircle(c.x, c.y, holeR);
        g.fillStyle(fill, 1);
        g.fillCircle(c.x, c.y, holeR - this.s(3));
        g.lineStyle(this.s(2), 0x000000, 0.6);
        g.beginPath();
        g.moveTo(c.x - holeR * 0.45, c.y);
        g.lineTo(c.x + holeR * 0.45, c.y);
        g.moveTo(c.x, c.y - holeR * 0.45);
        g.lineTo(c.x, c.y + holeR * 0.45);
        g.strokePath();
      } else {
        g.fillStyle(dark, 1);
        g.fillCircle(c.x, c.y, holeR);
        g.lineStyle(this.s(2), 0x000000, 0.5);
        g.strokeCircle(c.x, c.y, holeR);
      }
    }
  }

  // ───────────────────── 备选区（矩形框 + 5 圆洞） ─────────────────────

  buildBuffer() {
    // 5 个洞位（圆心）。整体一个圆角矩形包住。
    const holeR = 36;            // 洞半径（略大于螺丝半径 24）
    const gap = 26;              // 洞间距
    const totalHolesW = BUFFER_CAPACITY * (holeR * 2) + (BUFFER_CAPACITY - 1) * gap;
    const rectPadX = 28;
    const rectPadY = 22;
    const rectW = totalHolesW + rectPadX * 2;
    const rectH = holeR * 2 + rectPadY * 2;
    const cy = 310;
    const startCx = (LEVEL_LOGICAL_W - totalHolesW) / 2 + holeR;  // 第一个洞中心

    this.bufferHoleCenters = [];
    for (let i = 0; i < BUFFER_CAPACITY; i++) {
      const cxL = startCx + i * (holeR * 2 + gap);
      this.bufferHoleCenters.push({
        x: this.toScreenX(cxL),
        y: this.toScreenY(cy),
      });
    }
    this.bufferHoleR = this.s(holeR);

    // 标题
    this.add.text(WIDTH / 2, this.toScreenY(cy - rectH / 2 - 24), '备选区（满 5 即失败）', {
      fontSize: `${Math.round(this.s(20))}px`,
      color: '#aaaaaa',
    }).setOrigin(0.5);

    // 矩形框 + 圆洞（合并到 1 个 Graphics）
    const g = this.add.graphics();
    const rectCx = LEVEL_LOGICAL_W / 2;
    const sx = this.toScreenX(rectCx - rectW / 2);
    const sy = this.toScreenY(cy - rectH / 2);
    const sw = this.s(rectW);
    const sh = this.s(rectH);
    const sr = this.s(20);

    // 外框
    g.fillStyle(0x2a2d44, 1);
    g.fillRoundedRect(sx, sy, sw, sh, sr);
    g.lineStyle(this.s(2), 0x6a6e8e, 0.9);
    g.strokeRoundedRect(sx, sy, sw, sh, sr);
    // 内层装饰
    g.fillStyle(0xffffff, 0.05);
    g.fillRoundedRect(sx + this.s(4), sy + this.s(4), sw - this.s(8), this.s(10), sr);

    // 5 个圆洞
    for (const c of this.bufferHoleCenters) {
      g.fillStyle(0x14162a, 1);
      g.fillCircle(c.x, c.y, this.bufferHoleR);
      g.lineStyle(this.s(2), 0x000000, 0.55);
      g.strokeCircle(c.x, c.y, this.bufferHoleR);
      // 内阴影
      g.fillStyle(0x000000, 0.35);
      g.fillCircle(c.x + this.s(2), c.y + this.s(2), this.bufferHoleR - this.s(3));
    }
  }

  // ───────────────────── 板子 + 螺丝 ─────────────────────

  buildBoards() {
    this.boardLayer = this.add.container(0, 0);
    this.screwLayer = this.add.container(0, 0);

    this.boardGfx = this.add.graphics();
    this.boardLayer.add(this.boardGfx);

    this.redrawAllBoards();

    for (const board of this.boards) {
      for (const screw of board.screws) {
        const lx = board.x + screw.offsetX;
        const ly = board.y + screw.offsetY;
        const sx = this.toScreenX(lx);
        const sy = this.toScreenY(ly);
        const sr = this.s(SCREW_RADIUS);
        screw.cx = sx;
        screw.cy = sy;
        screw.r = sr;
        screw.lx = lx;
        screw.ly = ly;

        const img = this.add.image(sx, sy, this.screwTextureKey(screw.color, true));
        img.setDisplaySize(sr * 2 + 8, sr * 2 + 8);
        img.setInteractive({ useHandCursor: true });
        img.on('pointerdown', () => this.onScrewClick(screw));
        screw.sprite = img;
        this.screwLayer.add(img);
      }
    }
  }

  redrawAllBoards() {
    const g = this.boardGfx;
    g.clear();

    const sorted = [...this.boards].filter((b) => !b.removed).sort((a, b) => a.z - b.z);
    const woodColors = [0xa0826d, 0x8b6f5a, 0xb89576, 0x9c7a5e, 0xc4a37e];
    for (const board of sorted) {
      const sx = this.toScreenX(board.x);
      const sy = this.toScreenY(board.y);
      const sw = this.s(board.w);
      const sh = this.s(board.h);
      const r = this.s(BOARD_RADIUS);

      const c = woodColors[board.z % woodColors.length];

      // 阴影
      g.fillStyle(0x000000, 0.35);
      g.fillRoundedRect(sx - sw / 2 + this.s(4), sy - sh / 2 + this.s(6), sw, sh, r);
      // 板身
      g.fillStyle(c, 1);
      g.fillRoundedRect(sx - sw / 2, sy - sh / 2, sw, sh, r);
      // 上沿高光
      g.fillStyle(0xffffff, 0.14);
      g.fillRoundedRect(sx - sw / 2, sy - sh / 2, sw, this.s(10), r);
      // 木纹横线
      g.lineStyle(this.s(1), 0x000000, 0.18);
      g.beginPath();
      g.moveTo(sx - sw / 2 + this.s(10), sy);
      g.lineTo(sx + sw / 2 - this.s(10), sy);
      g.strokePath();
      // 描边
      g.lineStyle(this.s(2), 0x000000, 0.4);
      g.strokeRoundedRect(sx - sw / 2, sy - sh / 2, sw, sh, r);
    }
  }

  playEntranceAnimation() {
    this.screwLayer.alpha = 0;
    this.boardLayer.alpha = 0;
    this.boardLayer.y = -this.s(40);

    this.tweens.add({
      targets: [this.boardLayer, this.screwLayer],
      alpha: 1,
      duration: 280,
      ease: 'Cubic.easeOut',
    });
    this.tweens.add({
      targets: this.boardLayer,
      y: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
    });
  }

  // ───────────────────── 螺丝粒度遮挡判定 ─────────────────────

  /**
   * 判断点 (px,py) 是否在板子的 AABB 内（板子坐标用逻辑坐标）
   * 螺丝半径用逻辑坐标的 SCREW_RADIUS
   */
  isPointCoveredByBoard(px, py, board) {
    // 圆-矩形相交：找到矩形上距离圆心最近的点
    const left = board.x - board.w / 2;
    const right = board.x + board.w / 2;
    const top = board.y - board.h / 2;
    const bottom = board.y + board.h / 2;
    const cx = Math.max(left, Math.min(px, right));
    const cy = Math.max(top, Math.min(py, bottom));
    const dx = px - cx;
    const dy = py - cy;
    return (dx * dx + dy * dy) < (SCREW_RADIUS * SCREW_RADIUS);
  }

  /**
   * 螺丝粒度遮挡：遍历每颗螺丝，看是否有任意 z 更高的板子覆盖它（圆-矩相交）
   */
  recomputeOcclusion() {
    const live = this.boards.filter((b) => !b.removed);
    for (const b of live) {
      for (const s of b.screws) {
        const screwLx = b.x + s.offsetX;
        const screwLy = b.y + s.offsetY;
        let unlocked = true;
        for (const other of live) {
          if (other.id === b.id) continue;
          if (other.z <= b.z) continue;
          if (this.isPointCoveredByBoard(screwLx, screwLy, other)) {
            unlocked = false;
            break;
          }
        }
        s.unlocked = unlocked;
        if (s.sprite && s.sprite.active) {
          s.sprite.setTexture(this.screwTextureKey(s.color, unlocked));
          if (s.sprite.input) s.sprite.input.enabled = unlocked;
        }
      }
    }
  }

  // ───────────────────── 点击螺丝主流程 ─────────────────────

  onScrewClick(screw) {
    if (this.status !== 'playing') return;
    const board = this.boards.find((b) => b.id === screw.boardId);
    if (!board || board.removed) return;
    if (!screw.unlocked) return;

    const targetBox = this.boxes.find(
      (bx) => !bx.removed && bx.color === screw.color && bx.count < BOX_SLOT_CAPACITY,
    );
    screw.sprite.disableInteractive();

    if (targetBox) {
      this.flyScrewToBox(screw, targetBox, board);
    } else {
      // 备选区——先判后塞
      if (this.buffer.length >= BUFFER_CAPACITY) {
        this.tweens.add({
          targets: screw.sprite,
          alpha: 0,
          scale: 1.5,
          duration: 220,
          onComplete: () => {
            screw.sprite.destroy();
            this.endGame('lose');
          },
        });
        return;
      }
      this.flyScrewToBuffer(screw, board);
    }
  }

  flyScrewToBox(screw, targetBox, fromBoard) {
    const holeIdx = targetBox.count;
    const holeCenter = targetBox.holeCenters[holeIdx];

    this.tweens.add({
      targets: screw.sprite,
      x: holeCenter.x,
      y: holeCenter.y,
      scale: 0.55,
      rotation: Math.PI * 1.5,
      duration: 300,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        screw.sprite.destroy();
        if (fromBoard) {
          this.removeScrewFromBoard(fromBoard, screw);
        }
        targetBox.count += 1;
        console.log('[WIN-DBG] flyScrewToBox done, box color=', targetBox.color, 'count=', targetBox.count, '/', BOX_SLOT_CAPACITY);
        if (targetBox.count >= BOX_SLOT_CAPACITY) {
          this.dissolveBox(targetBox);
        } else {
          this.redrawAllBoxes();
        }
        if (fromBoard) this.afterRemoval(fromBoard);
      },
    });
  }

  flyScrewToBuffer(screw, board) {
    const slotIndex = this.buffer.length;
    const target = this.bufferHoleCenters[slotIndex];

    this.tweens.add({
      targets: screw.sprite,
      x: target.x,
      y: target.y,
      scale: 0.9,
      rotation: Math.PI,
      duration: 340,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        // 让螺丝挂到 buffer 上：解除 board 归属，标记为 buffer 状态
        screw.bufferSlot = slotIndex;
        screw.boardId = null;
        this.buffer.push(screw);
        this.removeScrewFromBoard(board, screw);
        this.afterRemoval(board);
      },
    });
  }

  removeScrewFromBoard(board, screw) {
    board.screws = board.screws.filter((s) => s.id !== screw.id);
    this.removedCount += 1;
  }

  /**
   * 工具箱满 3 后消除并补新色（按序从 colorPool 消费，不循环）：
   *  1. colorPool 还有色 → 取下一个色
   *  2. colorPool 已空 → 该槽位空缺（不再产生新工具箱）
   *  3. 扫描 buffer：如果新色与 buffer 中任意螺丝同色 → 该螺丝飞入工具箱
   */
  dissolveBox(box) {
    console.log('[WIN-DBG] dissolveBox enter color=', box.color, 'poolIdx=', this.colorPoolIdx, '/', this.level.colorPool.length, 'boxesLen=', this.boxes.length);
    const flash = this.add.graphics();
    flash.fillStyle(0xffffff, 0.85);
    flash.fillRoundedRect(box.cx - box.sw / 2, box.cy - box.sh / 2, box.sw, box.sh, box.r);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 1.15,
      duration: 260,
      onComplete: () => flash.destroy(),
    });

    if (this.colorPoolIdx < this.level.colorPool.length) {
      box.color = this.level.colorPool[this.colorPoolIdx];
      box.count = 0;
      this.colorPoolIdx += 1;
      this.redrawAllBoxes();
      console.log('[WIN-DBG] dissolveBox refilled new color=', box.color, 'poolIdx=', this.colorPoolIdx);
      // 关键新增：扫描 buffer 看是否有同色螺丝可以回流
      this.flushBufferToBoxes();
    } else {
      // 补给池耗尽，该槽位永久消失
      box.color = null;
      box.count = 0;
      box.removed = true;
      this.boxes = this.boxes.filter((b) => b !== box);
      this.redrawAllBoxes();
      this.flushBufferToBoxes();
      console.log('[WIN-DBG] dissolveBox REMOVED, remaining boxes=', this.boxes.length, 'status=', this.status);
      // 直接判：所有工具箱清空 = 通关（仿照失败路径，同步调用 endGame）
      if (this.boxes.length === 0 && this.status === 'playing') {
        console.log('[WIN-DBG] WIN TRIGGERED');
        this.endGame('win');
      }
    }
  }

  /**
   * 扫描 buffer，把所有能匹配某个工具箱颜色的螺丝飞回去；剩余左对齐。
   * 注意：可能链式触发（飞进去后又把箱填满 → 又消 → 又扫 buffer）。
   * 这里只处理"当前能匹配的"，后续动画完成回调里再次调用。
   */
  flushBufferToBoxes() {
    if (this.buffer.length === 0) return;

    // 找第一个能回流的螺丝
    let idx = -1;
    let box = null;
    for (let i = 0; i < this.buffer.length; i++) {
      const s = this.buffer[i];
      const b = this.boxes.find(
        (bx) => !bx.removed && bx.color === s.color && bx.count < BOX_SLOT_CAPACITY,
      );
      if (b) { idx = i; box = b; break; }
    }
    if (idx === -1) return;

    const screw = this.buffer[idx];
    // 从 buffer 摘掉
    this.buffer.splice(idx, 1);
    // 左移动画：其它螺丝重新指派 slot
    this.reflowBufferPositions();

    // 飞向工具箱（注意：当前 screw.sprite 还在 buffer 位置上）
    screw.sprite.setInteractive(); // 重新启用（其实没必要，但避免 disable 状态）
    screw.sprite.disableInteractive();
    const holeIdx = box.count;
    const holeCenter = box.holeCenters[holeIdx];

    this.tweens.add({
      targets: screw.sprite,
      x: holeCenter.x,
      y: holeCenter.y,
      scale: 0.55,
      rotation: Math.PI * 1.5,
      duration: 320,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        screw.sprite.destroy();
        box.count += 1;
        console.log('[WIN-DBG] flushBufferToBoxes done, box color=', box.color, 'count=', box.count, '/', BOX_SLOT_CAPACITY);
        if (box.count >= BOX_SLOT_CAPACITY) {
          this.dissolveBox(box);  // 链式（箱清光时内部会判胜）
        } else {
          this.redrawAllBoxes();
          // 还有可能继续匹配（一个箱填了一颗后仍有空位）
          this.flushBufferToBoxes();
        }
        this.refreshHUD();
      },
    });
  }

  /**
   * 重新对齐 buffer 中所有螺丝的位置（左对齐到 0..n-1 洞）
   */
  reflowBufferPositions() {
    for (let i = 0; i < this.buffer.length; i++) {
      const s = this.buffer[i];
      s.bufferSlot = i;
      const target = this.bufferHoleCenters[i];
      this.tweens.add({
        targets: s.sprite,
        x: target.x,
        y: target.y,
        duration: 220,
        ease: 'Cubic.easeOut',
      });
    }
  }

  afterRemoval(board) {
    if (board && board.screws.length === 0 && !board.removed) {
      board.removed = true;
      this.redrawAllBoards();
    }
    this.recomputeOcclusion();
    this.refreshHUD();
    this.checkWinCondition();
  }

  /**
   * 胜利判定已经下放到 dissolveBox（最后一个工具箱消失时即胜利），
   * 这里保留空函数避免老调用点崩溃。
   */
  checkWinCondition() {
    // no-op
  }

  // ───────────────────── 胜负 ─────────────────────

  endGame(result) {
    console.log('[WIN-DBG] endGame called, result=', result, 'status=', this.status);
    this.status = result;
    const overlay = this.add.graphics();
    overlay.setDepth(10000);
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, WIDTH, HEIGHT);

    const title = result === 'win' ? '🎉 通关！' : '💀 失败';
    const titleColor = result === 'win' ? '#2a9d8f' : '#e63946';

    const tt = this.add.text(WIDTH / 2, HEIGHT / 2 - this.s(60), title, {
      fontSize: `${Math.round(this.s(72))}px`,
      color: titleColor,
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(10001);

    const tip = this.add.text(WIDTH / 2, HEIGHT / 2 + this.s(40), '点击屏幕重开（新关卡）', {
      fontSize: `${Math.round(this.s(28))}px`,
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(10001);
    console.log('[WIN-DBG] endGame UI created');

    this.input.once('pointerdown', () => {
      overlay.destroy();
      tt.destroy();
      tip.destroy();
      this.scene.restart();
    });
  }
}
