// 关卡随机生成器 v4
//
// 设计目标：
// 1. 板子形状随机（多种宽高），避免清一色
// 2. 板子分布均匀铺满主游戏区，不全堆顶部
// 3. 每板严格 3 颗螺丝，间距合规
// 4. 多层 z，制造遮挡（部分覆盖关键螺丝）
//
import {
  LEVEL_TOTAL_COLORS,
  LEVEL_GROUPS_PER_COLOR,
  SCREWS_PER_BOARD,
  SCREW_MIN_DIST,
  SCREW_RADIUS,
  TOP_BOX_COUNT,
  BOARD_SHAPES,
  COLORS,
} from './config.js';

export const LEVEL_LOGICAL_W = 720;
export const LEVEL_LOGICAL_H = 1280;

// 布局区域：
// - 顶部工具箱：0 ~ 240
// - 备选区（5 圆洞）：240 ~ 380
// - 主游戏区：400 ~ 1240（高度 840，容纳 7 行板子）
const PLAY_TOP = 400;
const PLAY_BOTTOM = 1240;
const PLAY_LEFT = 50;
const PLAY_RIGHT = 670;

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickN(arr, n, rand) {
  const a = arr.slice();
  const out = [];
  for (let i = 0; i < n && a.length > 0; i++) {
    const idx = Math.floor(rand() * a.length);
    out.push(a.splice(idx, 1)[0]);
  }
  return out;
}

function shuffle(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 生成一个随机关卡
 */
export function generateLevel(seed) {
  const rand = rng(seed != null ? seed : Date.now() % 0xffffffff);

  // 1. 选颜色
  const allColorIdx = COLORS.map((_, i) => i);
  const levelColors = pickN(allColorIdx, LEVEL_TOTAL_COLORS, rand);

  // 2. 螺丝总池
  const screwPool = [];
  for (const c of levelColors) {
    for (let i = 0; i < LEVEL_GROUPS_PER_COLOR * 3; i++) screwPool.push(c);
  }
  const screws = shuffle(screwPool, rand);
  const totalScrews = screws.length;
  const boardCount = totalScrews / SCREWS_PER_BOARD;

  // 3. 板子布局：把游戏区分成 7 行 × 3 列基础网格，每板从一个网格出发，加抖动 + 形状随机
  const rows = 7;
  const cols = 3;
  const cellW = (PLAY_RIGHT - PLAY_LEFT) / cols;
  const cellH = (PLAY_BOTTOM - PLAY_TOP) / rows;

  // 21 个格子位置打乱顺序，按层级 z 分配（越后画的 z 越大 = 更上层）
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ r, c });
    }
  }
  const cellOrder = shuffle(cells, rand);

  const boards = [];
  for (let i = 0; i < boardCount; i++) {
    const cell = cellOrder[i % cellOrder.length];
    const shape = BOARD_SHAPES[Math.floor(rand() * BOARD_SHAPES.length)];

    // 中心坐标 + 抖动（不让板子完全贴格）
    const cx = PLAY_LEFT + cell.c * cellW + cellW / 2 + (rand() - 0.5) * (cellW * 0.4);
    const cy = PLAY_TOP + cell.r * cellH + cellH / 2 + (rand() - 0.5) * (cellH * 0.35);

    // z：递增（i 越大越靠上）→ 后生成的板会盖住先生成的
    const z = i;

    const colorTriplet = screws.slice(i * SCREWS_PER_BOARD, (i + 1) * SCREWS_PER_BOARD);
    const screwsArr = layoutScrewsOnBoard(shape.w, shape.h, colorTriplet, rand);

    boards.push({
      id: `b${i}`,
      x: cx,
      y: cy,
      w: shape.w,
      h: shape.h,
      z,
      screws: screwsArr,
    });
  }

  // 4. 工具箱颜色序列：保证总消除次数 = 总螺丝数 / 3
  //    每色螺丝数 = LEVEL_GROUPS_PER_COLOR * 3，即每色需要 LEVEL_GROUPS_PER_COLOR 次消除
  //    所有颜色共需 LEVEL_TOTAL_COLORS * LEVEL_GROUPS_PER_COLOR 次消除
  //    例：7 色 × 9 螺丝 = 63；7 × 3 = 21 次消除（每次消 3 颗，正好 63）
  //    总盒子序列 = 21 个；前 4 个作为初始 4 工具箱，其余 17 个是后续补给
  //
  //    约束：初始 4 个必须互相不重复，避免一开始就有重色
  const totalDissolves = LEVEL_TOTAL_COLORS * LEVEL_GROUPS_PER_COLOR;
  // 颜色多重集：每色出现 LEVEL_GROUPS_PER_COLOR 次
  const fullSequence = [];
  for (const c of levelColors) {
    for (let i = 0; i < LEVEL_GROUPS_PER_COLOR; i++) fullSequence.push(c);
  }
  // 反复打乱直到前 TOP_BOX_COUNT 个互不相同
  let boxSequence = shuffle(fullSequence, rand);
  for (let attempt = 0; attempt < 200; attempt++) {
    const head = boxSequence.slice(0, TOP_BOX_COUNT);
    if (new Set(head).size === TOP_BOX_COUNT) break;
    boxSequence = shuffle(fullSequence, rand);
  }
  const initialBoxColors = boxSequence.slice(0, TOP_BOX_COUNT);
  // 补给池：剩余的 (totalDissolves - TOP_BOX_COUNT) 个，按顺序消费
  const colorPool = boxSequence.slice(TOP_BOX_COUNT);

  return {
    boards,
    initialBoxColors,
    colorPool,
    levelColors,
    seed,
  };
}

/**
 * 在一块板子上排布 3 颗螺丝（横向均匀 + 纵向小抖动），强制最小间距
 */
function layoutScrewsOnBoard(w, h, colors, rand) {
  const n = colors.length;
  const out = [];
  const margin = SCREW_RADIUS + 10;
  const usableW = w - margin * 2;

  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const baseX = -usableW / 2 + t * usableW;
    let offsetX, offsetY;
    let tries = 0;
    do {
      offsetX = baseX + (rand() - 0.5) * 12;
      offsetY = (rand() - 0.5) * (h * 0.4);
      const ok = out.every((s) => {
        const dx = s.offsetX - offsetX;
        const dy = s.offsetY - offsetY;
        return Math.hypot(dx, dy) >= SCREW_MIN_DIST;
      });
      if (ok) break;
      tries++;
    } while (tries < 30);
    out.push({ color: colors[i], offsetX, offsetY });
  }
  return out;
}

// 兼容旧 import
export const LEVEL_1 = generateLevel(1);
