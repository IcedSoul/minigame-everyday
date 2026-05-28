// 《羊了个羊：星球》关卡生成器 v2
// 混合堆叠：多个"小摞"（pile/deck 风）+ 散卡，全部交错混在同一牌堆区
//
// 输出：cards[] = { id, type, x, y, w, h, zLayer }

import {
  CARD_TYPES,
  CARDS_PER_TYPE,
  TOTAL_CARDS,
  CARD_W,
  CARD_H,
  PILE_COUNT,
  PILE_HEIGHT,
  PILE_OFFSET_X,
  PILE_OFFSET_Y,
  PILE_GRID_COLS,
  PILE_GRID_ROWS,
  SCATTER_LAYERS,
  SCATTER_JITTER,
  LEVEL_LOGICAL_W,
  LEVEL_LOGICAL_H,
  HUD_HEIGHT,
  SLOT_AREA_HEIGHT,
} from './config.js';

// ───────────────── 工具：洗牌 ─────────────────
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 生成 type 池：每种类型 CARDS_PER_TYPE 张
function buildTypePool() {
  const pool = [];
  for (let t = 0; t < CARD_TYPES; t++) {
    for (let i = 0; i < CARDS_PER_TYPE; i++) pool.push(t);
  }
  return shuffle(pool);
}

// ───────────────── 一摞牌生成 ─────────────────
// 在 anchor 位置放一摞 height 张卡片，每张相对下张偏移一点点（看起来像扑克牌摞）
// 整摞的 zLayer 范围 [zStart, zStart+height-1]
function generatePile(anchor, types, startId, height, zStart, jitterAngle) {
  const cards = [];
  let id = startId;

  // 给每摞一个微小整体倾斜（让多摞之间不显呆板）
  const cosA = Math.cos(jitterAngle);
  const sinA = Math.sin(jitterAngle);

  for (let i = 0; i < height && i < types.length; i++) {
    // 在摞的局部坐标系中：第 i 张相对底牌偏移 (i*OFFSET_X, i*OFFSET_Y)
    const localX = i * PILE_OFFSET_X;
    const localY = i * PILE_OFFSET_Y;
    // 旋转后投影到世界
    const dx = localX * cosA - localY * sinA;
    const dy = localX * sinA + localY * cosA;
    cards.push({
      id: id++,
      type: types[i],
      x: anchor.x + dx,
      y: anchor.y + dy,
      w: CARD_W,
      h: CARD_H,
      zLayer: zStart + i,
    });
  }

  return cards;
}

// ───────────────── 散卡生成 ─────────────────
// 在牌堆区内生成 count 张散卡，每张随机位置 + 随机 zLayer（与摞 z 范围交错）
function generateScatter(region, types, startId, count, zRange) {
  const cards = [];
  let id = startId;

  const margin = CARD_W / 2 + 6;
  const left = region.left + margin;
  const right = region.right - margin;
  const top = region.top + margin;
  const bottom = region.bottom - margin;
  const w = right - left;
  const h = bottom - top;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;

  for (let i = 0; i < count && i < types.length; i++) {
    const rx = (Math.random() - 0.5) * w * SCATTER_JITTER;
    const ry = (Math.random() - 0.5) * h * SCATTER_JITTER;
    // zLayer 在 zRange [min,max] 内随机，让散卡和摞充分穿插
    const z = zRange.min + Math.floor(Math.random() * (zRange.max - zRange.min + 1));
    cards.push({
      id: id++,
      type: types[i],
      x: cx + rx,
      y: cy + ry,
      w: CARD_W,
      h: CARD_H,
      zLayer: z,
    });
  }

  return cards;
}

// ───────────────── 摞中心 anchor 网格 ─────────────────
// 在牌堆区里铺一个 cols×rows 的粗网格，每格中心用作一摞的 anchor
// 再给每个 anchor 加少量随机偏移，避免完全规整
function buildPileAnchors(region) {
  const anchors = [];
  const usableW = region.right - region.left - CARD_W * 1.6;
  const usableH = region.bottom - region.top - CARD_H * 1.6;
  const stepX = usableW / Math.max(1, PILE_GRID_COLS - 1);
  const stepY = usableH / Math.max(1, PILE_GRID_ROWS - 1);
  const startX = region.left + CARD_W * 0.8;
  const startY = region.top + CARD_H * 0.8;

  for (let r = 0; r < PILE_GRID_ROWS; r++) {
    for (let c = 0; c < PILE_GRID_COLS; c++) {
      // 每个 anchor 加 ±15 像素抖动
      const jx = (Math.random() - 0.5) * 30;
      const jy = (Math.random() - 0.5) * 30;
      anchors.push({
        x: startX + c * stepX + jx,
        y: startY + r * stepY + jy,
      });
    }
  }

  // 打乱顺序，让 anchor 分配给摞时不规则
  return shuffle(anchors).slice(0, PILE_COUNT);
}

// ───────────────── 主入口 ─────────────────
//
// z 层规划：
//   - 摞内 z 从 0 开始递增；每摞独立的 zStart，但 zStart 之间不严格连续，
//     而是让多摞的 z 范围有重叠（这样摞与摞之间也会互相穿插覆盖）
//   - 散卡的 z 在 [0, totalZ-1] 内随机，与摞充分交错
//
// 这样最终所有卡片（摞内、摞间、散卡）共享同一个 z 空间，视觉上混为一体。
export function generateLevel() {
  const types = buildTypePool();

  // 牌堆总区域（去掉 HUD 和槽位区）
  const pileRegion = {
    left: 30,
    right: LEVEL_LOGICAL_W - 30,
    top: HUD_HEIGHT + 30,
    bottom: LEVEL_LOGICAL_H - SLOT_AREA_HEIGHT - 40,
  };

  // 1) 摞 anchor
  const anchors = buildPileAnchors(pileRegion);

  // 2) 生成 PILE_COUNT 摞
  // 每摞 zStart 在一个范围内随机错开，让摞与摞之间也穿插
  const pileCards = [];
  let nextId = 0;
  let typeCursor = 0;

  // 总 z 跨度 = 摞高度 + 散卡层数 + 一些重叠
  const maxZ = PILE_HEIGHT + SCATTER_LAYERS + 4;

  for (let p = 0; p < PILE_COUNT; p++) {
    if (typeCursor >= types.length) break;
    const anchor = anchors[p];
    // 每摞 zStart 在 [0, maxZ - PILE_HEIGHT] 内随机
    const zStart = Math.floor(Math.random() * Math.max(1, maxZ - PILE_HEIGHT));
    // 每摞一个微小整体倾斜（±10°）
    const jitterAngle = (Math.random() - 0.5) * (Math.PI / 9);

    const pile = generatePile(
      anchor,
      types.slice(typeCursor, typeCursor + PILE_HEIGHT),
      nextId,
      PILE_HEIGHT,
      zStart,
      jitterAngle,
    );
    pileCards.push(...pile);
    nextId += pile.length;
    typeCursor += pile.length;
  }

  // 3) 剩余卡片走散卡，z 在全 z 范围内随机
  const remainingTypes = types.slice(typeCursor);
  const scatterCards = generateScatter(
    pileRegion,
    remainingTypes,
    nextId,
    remainingTypes.length,
    { min: 0, max: maxZ - 1 },
  );

  const allCards = [...pileCards, ...scatterCards];

  if (allCards.length !== TOTAL_CARDS) {
    console.warn(
      `[LevelGen] expected ${TOTAL_CARDS} cards, got ${allCards.length}. ` +
      `pileCount=${pileCards.length}, scatterCount=${scatterCards.length}`,
    );
  }

  return {
    cards: allCards,
    pileRegion,
  };
}
