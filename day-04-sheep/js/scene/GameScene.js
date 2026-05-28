// 《羊了个羊：星球》Day 4 主玩法场景
//
// 玩法流程：
//   1. 生成 108 张混合堆叠的卡片（55% 整齐塔 + 45% 随意散乱）
//   2. 5% 阈值的遮挡判定决定哪些卡片可点击
//   3. 点击未遮挡卡片 → 飞入底部 7 格卡槽
//   4. 槽内同类型自动聚合排序（同类型相邻）
//   5. 槽内连续 3 张同类型 → 立即消除 + 左对齐压缩
//   6. 槽满 7 张未消 → 失败；牌堆全清 → 胜利

import {
  TOTAL_CARDS,
  CARD_TYPES,
  CARDS_PER_TYPE,
  TYPE_ICON_KEYS,
  CARD_W,
  CARD_H,
  CARD_RADIUS,
  SLOT_CAPACITY,
  TRIPLE_COUNT,
  OCCLUSION_THRESHOLD,
  HUD_HEIGHT,
  SLOT_AREA_HEIGHT,
  LEVEL_LOGICAL_W,
  LEVEL_LOGICAL_H,
  ANIM_FLY_TO_SLOT,
  ANIM_SLOT_SHIFT,
  ANIM_TRIPLE_REMOVE,
  ANIM_SLOT_COMPACT,
  SLOT_BG_ASPECT,
  SLOT_BG_LEFT_CX_RATIO,
  SLOT_BG_RIGHT_CX_RATIO,
} from '../core/config.js';
import { generateLevel } from '../core/LevelGenerator.js';
import { WIDTH, HEIGHT } from '../main.js';

// 飞行中卡片的 depth（保证压在所有牌堆和槽位之上）
const FLYING_DEPTH = 99999;

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  init() {
    // 逻辑坐标 → 屏幕坐标的均匀缩放：以宽度对齐
    this.uiScale = WIDTH / LEVEL_LOGICAL_W;
    // 居中（高度方向多余空间均分）
    this.offsetX = 0;
    this.offsetY = Math.max(0, (HEIGHT - LEVEL_LOGICAL_H * this.uiScale) / 2);
  }

  create() {
    console.log('[GameScene] create start');
    try {
      this.level = generateLevel();
      console.log('[GameScene] cards count =', this.level.cards.length);

      this.resetState();
      this.buildBackground();
      this.buildHUD();
      this.buildSlotArea();
      this.buildCards();
      this.recomputeOcclusion();
      this.refreshHUD();
      console.log('[GameScene] create end OK');
    } catch (e) {
      console.error('[GameScene] create error', e && e.stack || e);
    }
  }

  // ──────────────── 坐标工具 ────────────────

  toScreenX(lx) { return this.offsetX + lx * this.uiScale; }
  toScreenY(ly) { return this.offsetY + ly * this.uiScale; }
  s(v) { return v * this.uiScale; }

  // ──────────────── 状态管理 ────────────────

  resetState() {
    // 把生成的逻辑卡片转成运行时状态对象
    this.cards = this.level.cards.map((c) => ({
      id: c.id,
      type: c.type,
      lx: c.x,            // 逻辑 x
      ly: c.y,            // 逻辑 y
      lw: c.w,            // 逻辑宽
      lh: c.h,            // 逻辑高
      zLayer: c.zLayer,
      state: 'on_pile',   // on_pile | flying | in_slot | removed
      unlocked: false,
      sprite: null,       // Container
      grayOverlay: null,  // 灰化遮罩
    }));

    this.slot = [];                // 槽位中的卡片（数组）
    this.status = 'playing';       // playing | win | lose
    this.isAnimating = false;      // 全局动画锁（飞入 + 消除期间锁住）
  }

  // ──────────────── 背景 ────────────────
  buildBackground() {
    // Use the grass background image, cover the full screen
    const bg = this.add.image(WIDTH / 2, HEIGHT / 2, 'bg_grass');
    bg.setDisplaySize(WIDTH, HEIGHT);
    bg.setDepth(-1);
  }

  // ──────────────── HUD ────────────────

  buildHUD() {
    const hudSafeOffset = this.s(90);

    // 标题：白底深绿描边 + 柔和阴影，卡通游戏风格
    this.hudTitle = this.add.text(WIDTH / 2, this.s(46) + hudSafeOffset, '羊了个羊 · 星球', {
      fontFamily: '"Comic Sans MS", "Hiragino Sans GB", "PingFang SC", sans-serif',
      fontSize: `${Math.round(this.s(46))}px`,
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#3a6b1f',
      strokeThickness: this.s(6),
      shadow: {
        offsetX: 0,
        offsetY: this.s(3),
        color: '#1f3d10',
        blur: this.s(4),
        fill: true,
      },
    }).setOrigin(0.5);

    // 状态条：浅米色填充 + 深棕描边
    this.hudStatus = this.add.text(WIDTH / 2, this.s(96) + hudSafeOffset, '', {
      fontFamily: '"PingFang SC", "Hiragino Sans GB", sans-serif',
      fontSize: `${Math.round(this.s(26))}px`,
      color: '#fff8e0',
      fontStyle: 'bold',
      stroke: '#5a3a18',
      strokeThickness: this.s(4),
    }).setOrigin(0.5);

    this.hudHint = this.add.text(WIDTH / 2, this.s(132) + hudSafeOffset, '点击亮色卡片 · 槽满 7 张未凑齐 3 同则失败', {
      fontFamily: '"PingFang SC", "Hiragino Sans GB", sans-serif',
      fontSize: `${Math.round(this.s(20))}px`,
      color: '#ffffff',
      stroke: '#4a7522',
      strokeThickness: this.s(3),
    }).setOrigin(0.5);
  }

  refreshHUD() {
    if (!this.hudStatus) return;
    const onPile = this.cards.filter((c) => c.state === 'on_pile').length;
    this.hudStatus.setText(
      `牌堆 ${onPile}/${TOTAL_CARDS} · 槽 ${this.slot.length}/${SLOT_CAPACITY}`,
    );
  }

  // ──────────────── 卡槽 UI ────────────────
  //
  // 关键逻辑：
  //   1. slot_bg PNG 的真实宽高比是 SLOT_BG_ASPECT (5:1)，必须按此比例显示，避免变形
  //   2. 7 个凹槽的中心位置 是 PNG 自身的属性，用 ratio 表达，不依赖屏幕分辨率
  //   3. 我们先决定槽底"目标宽度"（屏幕宽的某个比例），高度按 aspect 自动算
  //   4. 7 个槽位中心 = 槽底中心 ± (槽底宽度 × ratio)
  //   这样无论屏幕宽多少、缩放多少，卡片都能精确落到凹槽里

  buildSlotArea() {
    // 1) 决定槽底"逻辑宽度"：占游戏宽度的 92%
    const slotBgLogicalW = LEVEL_LOGICAL_W * 0.92;
    // 2) 高度按 PNG 真实宽高比算
    const slotBgLogicalH = slotBgLogicalW / SLOT_BG_ASPECT;
    // 3) 槽底中心：水平居中、底部留 24px 安全距
    const slotBgLogicalCx = LEVEL_LOGICAL_W / 2;
    const slotBgLogicalCy = LEVEL_LOGICAL_H - slotBgLogicalH / 2 - 24;

    // 4) 计算 7 个槽位中心（基于 PNG 内部凹槽比例）
    //    凹槽中心相对槽底中心的水平偏移 = (ratio - 0.5) × slotBgLogicalW
    const leftCellOffsetX = (SLOT_BG_LEFT_CX_RATIO - 0.5) * slotBgLogicalW;
    const rightCellOffsetX = (SLOT_BG_RIGHT_CX_RATIO - 0.5) * slotBgLogicalW;
    const leftCellLx = slotBgLogicalCx + leftCellOffsetX;
    const rightCellLx = slotBgLogicalCx + rightCellOffsetX;
    const stepX = (rightCellLx - leftCellLx) / (SLOT_CAPACITY - 1);

    this.slotCenters = [];
    for (let i = 0; i < SLOT_CAPACITY; i++) {
      const lx = leftCellLx + i * stepX;
      const ly = slotBgLogicalCy;  // 凹槽中心在槽底竖直中线
      this.slotCenters.push({
        lx,
        ly,
        sx: this.toScreenX(lx),
        sy: this.toScreenY(ly),
      });
    }

    // 5) 渲染 slot_bg：严格按 PNG 宽高比，不变形
    const slotBgScreenCx = this.toScreenX(slotBgLogicalCx);
    const slotBgScreenCy = this.toScreenY(slotBgLogicalCy);
    const slotBgScreenW = this.s(slotBgLogicalW);
    const slotBgScreenH = this.s(slotBgLogicalH);

    const slotBg = this.add.image(slotBgScreenCx, slotBgScreenCy, 'slot_bg');
    slotBg.setDisplaySize(slotBgScreenW, slotBgScreenH);
    slotBg.setDepth(10000);

    // 调试：保留这些数值便于排查
    if (typeof console !== 'undefined') {
      console.log('[Slot] bg logical:', {
        cx: slotBgLogicalCx, cy: slotBgLogicalCy,
        w: slotBgLogicalW, h: slotBgLogicalH,
      });
      console.log('[Slot] cell centers (logical x):',
        this.slotCenters.map((c) => Math.round(c.lx)));
      console.log('[Slot] step x:', Math.round(stepX), '(card_w:', CARD_W, ')');
    }
  }

  // ──────────────── 牌堆卡片渲染 ────────────────

  buildCards() {
    // 按 zLayer 升序绘制，同 z 内按 id 升序
    const sorted = [...this.cards].sort((a, b) => {
      if (a.zLayer !== b.zLayer) return a.zLayer - b.zLayer;
      return a.id - b.id;
    });

    for (let i = 0; i < sorted.length; i++) {
      const card = sorted[i];
      this.buildCardSprite(card, i);
    }
  }

  buildCardSprite(card, depthOrder) {
    const sx = this.toScreenX(card.lx);
    const sy = this.toScreenY(card.ly);
    const sw = this.s(card.lw);
    const sh = this.s(card.lh);
    const sr = this.s(CARD_RADIUS);

    const container = this.add.container(sx, sy);
    container.setSize(sw, sh);

    // 1) 多层柔和投影：模拟更均匀、更轻的外扩柔光
    //    不再做明显右下偏移，避免某个角落阴影过重；只保留极轻微下沉感
    const shadow = this.add.graphics();
    const shadowDx = 0;
    const shadowDy = this.s(1);
    const shadowLayers = 6;
    const shadowSpread = this.s(4.5);
    for (let i = shadowLayers - 1; i >= 0; i--) {
      const t = i / (shadowLayers - 1);
      const expand = shadowSpread * t;
      const alpha = 0.13 * (1 - t * 0.9);
      shadow.fillStyle(0x2f4a18, alpha);
      shadow.fillRoundedRect(
        -sw / 2 - expand + shadowDx,
        -sh / 2 - expand + shadowDy,
        sw + expand * 2,
        sh + expand * 2,
        sr + expand,
      );
    }
    container.add(shadow);

    // 2) 卡片底框（绿色卡片图）
    const frame = this.add.image(0, 0, 'card_frame');
    frame.setDisplaySize(sw, sh);
    container.add(frame);

    // 3) 蔬菜/水果图标（比卡片略小，居中）
    const iconKey = TYPE_ICON_KEYS[card.type];
    const icon = this.add.image(0, 0, iconKey);
    icon.setDisplaySize(sw * 0.72, sh * 0.72);
    container.add(icon);

    // 4) 顶部高光：一条很淡的内描边白线，让卡片表面有"上釉"质感
    //    （只在顶部 + 左侧画一段，模拟来自左上的环境光）
    const hilight = this.add.graphics();
    hilight.lineStyle(this.s(1.5), 0xffffff, 0.35);
    hilight.beginPath();
    // 从左下圆角起点 → 沿左边上行 → 经左上圆角 → 沿顶边到右上圆角附近
    const inset = this.s(1);
    const x0 = -sw / 2 + inset;
    const y0 = -sh / 2 + inset;
    const x1 = sw / 2 - inset;
    const y1 = sh / 2 - inset;
    const r2 = sr - inset;
    hilight.moveTo(x0, y1 - r2 * 1.2);
    hilight.lineTo(x0, y0 + r2);
    hilight.arc(x0 + r2, y0 + r2, r2, Math.PI, Math.PI * 1.5);
    hilight.lineTo(x1 - r2, y0);
    hilight.strokePath();
    container.add(hilight);

    // 5) 遮挡时的灰化薄膜（与原方案一致，配合 tint 实现灰阶）
    const gray = this.add.graphics();
    gray.fillStyle(0x000000, 0.28);
    gray.fillRoundedRect(-sw / 2, -sh / 2, sw, sh, sr);
    gray.setVisible(false);
    container.add(gray);

    // 6) 交互
    container.setInteractive(
      new Phaser.Geom.Rectangle(-sw / 2, -sh / 2, sw, sh),
      Phaser.Geom.Rectangle.Contains,
    );
    container.on('pointerdown', () => this.onCardClick(card));

    // 7) 深度
    container.setDepth(card.zLayer * 1000 + depthOrder);

    card.sprite = container;
    card.grayOverlay = gray;
    card.frame = frame;
    card.icon = icon;
  }

  // ──────────────── 遮挡判定（5% 阈值，联合面积） ────────────────
  //
  // 关键修复：
  //   1. "在上方"的标准 = 绘制顺序（(zLayer, id) 字典序），与 buildCards 一致
  //      —— 同 zLayer 内 id 大的覆盖 id 小的，不能用严格大于 zLayer 跳过
  //   2. 用 *联合面积*（多个上层相交矩形的并集）而不是简单求和，避免重复计数
  //      —— 否则两张上层卡片自己重叠时会虚高，可能误判为"暗"
  //
  // 联合面积算法：扫描线 + 区间合并（O(K^2 logK)，K 通常 < 50 足够快）

  // 求两个 AABB 的相交矩形（逻辑坐标）；若不相交返回 null
  rectIntersect(ax, ay, aw, ah, bx, by, bw, bh) {
    const left = Math.max(ax - aw / 2, bx - bw / 2);
    const right = Math.min(ax + aw / 2, bx + bw / 2);
    const top = Math.max(ay - ah / 2, by - bh / 2);
    const bottom = Math.min(ay + ah / 2, by + bh / 2);
    if (right <= left || bottom <= top) return null;
    return { left, right, top, bottom };
  }

  // 多个矩形并集面积（坐标压缩 + 网格法）
  // rects: [{left,right,top,bottom}]
  unionArea(rects) {
    if (rects.length === 0) return 0;
    if (rects.length === 1) {
      const r = rects[0];
      return (r.right - r.left) * (r.bottom - r.top);
    }
    // 收集所有 x、y 切线
    const xsSet = new Set();
    const ysSet = new Set();
    for (const r of rects) {
      xsSet.add(r.left); xsSet.add(r.right);
      ysSet.add(r.top); ysSet.add(r.bottom);
    }
    const xs = [...xsSet].sort((a, b) => a - b);
    const ys = [...ysSet].sort((a, b) => a - b);
    let area = 0;
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i], x1 = xs[i + 1];
      for (let j = 0; j < ys.length - 1; j++) {
        const y0 = ys[j], y1 = ys[j + 1];
        // 该子格子是否被任一矩形覆盖
        let covered = false;
        for (const r of rects) {
          if (r.left <= x0 && r.right >= x1 && r.top <= y0 && r.bottom >= y1) {
            covered = true;
            break;
          }
        }
        if (covered) area += (x1 - x0) * (y1 - y0);
      }
    }
    return area;
  }

  // 判定 o 是否绘制在 c 之上（与 buildCards 的 depth 排序对齐）
  isAbove(o, c) {
    if (o.zLayer !== c.zLayer) return o.zLayer > c.zLayer;
    return o.id > c.id;
  }

  recomputeOcclusion() {
    const live = this.cards.filter((c) => c.state === 'on_pile');
    const cardArea = CARD_W * CARD_H;
    const threshold = OCCLUSION_THRESHOLD * cardArea;

    for (const c of live) {
      // 收集所有上层卡片与本卡的相交矩形
      const interRects = [];
      for (const o of live) {
        if (o.id === c.id) continue;
        if (!this.isAbove(o, c)) continue;
        const inter = this.rectIntersect(
          c.lx, c.ly, c.lw, c.lh,
          o.lx, o.ly, o.lw, o.lh,
        );
        if (inter) interRects.push(inter);
      }
      const coveredArea = this.unionArea(interRects);
      const newUnlocked = (coveredArea < threshold);
      if (newUnlocked !== c.unlocked) {
        c.unlocked = newUnlocked;
      }
      // 灰化薄膜（半透明）+ 子图 tint（让被遮挡卡片显得更暗淡）
      if (c.grayOverlay) {
        c.grayOverlay.setVisible(!c.unlocked);
      }
      // tint：遮挡时整体偏灰，未遮挡恢复原色
      const tint = c.unlocked ? 0xffffff : 0x888888;
      if (c.frame && c.frame.setTint) c.frame.setTint(tint);
      if (c.icon && c.icon.setTint) c.icon.setTint(tint);
    }
  }

  // ──────────────── 点击主流程 ────────────────

  onCardClick(card) {
    if (this.status !== 'playing') return;
    if (this.isAnimating) return;
    if (card.state !== 'on_pile') return;
    if (!card.unlocked) {
      // 被遮挡 → 忽略点击
      return;
    }

    this.isAnimating = true;
    card.state = 'flying';
    if (card.sprite) {
      card.sprite.disableInteractive();
      card.sprite.setDepth(FLYING_DEPTH);
    }

    // 1) 计算插入位置（同类型聚合排序）
    const insertIdx = this.computeInsertIndex(card);

    // 2) 把已有 [insertIdx..end] 卡片右移一格 + 新卡片飞入 insertIdx
    //    两个动画并行
    this.slot.splice(insertIdx, 0, card);

    const promises = [];
    promises.push(this.tweenCardToSlotPosition(card, insertIdx, ANIM_FLY_TO_SLOT, 'Cubic.easeOut'));
    for (let i = insertIdx + 1; i < this.slot.length; i++) {
      const s = this.slot[i];
      promises.push(this.tweenCardToSlotPosition(s, i, ANIM_SLOT_SHIFT, 'Cubic.easeOut'));
    }

    Promise.all(promises).then(() => this.afterFlyIn(card));
  }

  // 给定卡片在槽内的目标 index，启动 tween 把它移动到对应槽中心
  tweenCardToSlotPosition(card, slotIdx, duration, ease) {
    const target = this.slotCenters[slotIdx];
    return new Promise((resolve) => {
      this.tweens.add({
        targets: card.sprite,
        x: target.sx,
        y: target.sy,
        duration,
        ease,
        onComplete: () => resolve(),
      });
    });
  }

  // 计算新卡片插入槽的位置
  // 规则：找到槽内最后一张同类型的位置 K，插入到 K+1；若没有则追加到末尾
  computeInsertIndex(card) {
    let lastSameIdx = -1;
    for (let i = this.slot.length - 1; i >= 0; i--) {
      if (this.slot[i].type === card.type) {
        lastSameIdx = i;
        break;
      }
    }
    return lastSameIdx === -1 ? this.slot.length : lastSameIdx + 1;
  }

  // 入槽动画完成后：扫描三同 → 消除 → 判断胜负
  afterFlyIn(card) {
    card.state = 'in_slot';
    if (card.sprite) {
      // 槽内卡片用统一中等 depth，避免覆盖即将消除的动画
      card.sprite.setDepth(50000);
    }
    this.recomputeOcclusion();
    this.refreshHUD();

    // 扫描三同
    const tripleStartIdx = this.findTripleIndex();
    if (tripleStartIdx !== -1) {
      this.removeTriple(tripleStartIdx).then(() => this.afterAction());
    } else {
      this.afterAction();
    }
  }

  // 槽内是否存在连续 3 张同类型？返回起始 index 或 -1
  findTripleIndex() {
    for (let i = 0; i + TRIPLE_COUNT - 1 < this.slot.length; i++) {
      let same = true;
      for (let k = 1; k < TRIPLE_COUNT; k++) {
        if (this.slot[i + k].type !== this.slot[i].type) {
          same = false;
          break;
        }
      }
      if (same) return i;
    }
    return -1;
  }

  // 消除从 startIdx 起的 3 张连续同类型
  removeTriple(startIdx) {
    const removed = this.slot.splice(startIdx, TRIPLE_COUNT);

    // 1) 三张消除动画（缩小 + 淡出）
    const removePromises = removed.map((c) => new Promise((resolve) => {
      this.tweens.add({
        targets: c.sprite,
        scale: 0,
        alpha: 0,
        duration: ANIM_TRIPLE_REMOVE,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          c.state = 'removed';
          if (c.sprite) c.sprite.destroy();
          c.sprite = null;
          resolve();
        },
      });
    }));

    // 2) 后续卡片左移到新位置（与消除动画并行启动，但等其完成）
    return Promise.all(removePromises).then(() => {
      const shiftPromises = [];
      for (let i = startIdx; i < this.slot.length; i++) {
        const s = this.slot[i];
        shiftPromises.push(this.tweenCardToSlotPosition(s, i, ANIM_SLOT_COMPACT, 'Cubic.easeOut'));
      }
      return Promise.all(shiftPromises);
    });
  }

  // 一次完整动作（飞入 + 可能的消除）结束后：判定胜负 + 解锁动画
  afterAction() {
    this.isAnimating = false;
    this.refreshHUD();

    // 胜利：所有牌堆卡片消除完
    const onPileLeft = this.cards.some((c) => c.state === 'on_pile');
    if (!onPileLeft) {
      // 槽内可能还有少量卡片（理论上不会发生，因为总数是 3 的倍数）
      // 但保险：等槽空也判胜
      this.endGame('win');
      return;
    }
    // 失败：槽满 7 张未消
    if (this.slot.length >= SLOT_CAPACITY) {
      this.endGame('lose');
      return;
    }
  }

  // ──────────────── 胜负 & 重开 ────────────────

  endGame(result) {
    if (this.status !== 'playing') return;
    this.status = result;
    console.log('[GameScene] endGame:', result);

    const overlay = this.add.graphics();
    overlay.setDepth(100000);
    overlay.fillStyle(0x000000, 0.7);
    overlay.fillRect(0, 0, WIDTH, HEIGHT);

    const title = result === 'win' ? '🎉 通关！' : '💀 槽满失败';
    const titleColor = result === 'win' ? '#2a9d8f' : '#e63946';

    const tt = this.add.text(WIDTH / 2, HEIGHT / 2 - this.s(60), title, {
      fontSize: `${Math.round(this.s(72))}px`,
      color: titleColor,
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(100001);

    const tip = this.add.text(WIDTH / 2, HEIGHT / 2 + this.s(40), '点击屏幕重开（新随机布局）', {
      fontSize: `${Math.round(this.s(28))}px`,
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(100001);

    this.input.once('pointerdown', () => {
      overlay.destroy();
      tt.destroy();
      tip.destroy();
      this.scene.restart();
    });
  }
}
