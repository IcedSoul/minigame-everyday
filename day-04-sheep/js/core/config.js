// 《羊了个羊：星球》Day 4 · 关卡 / 颜色 / 尺寸常量

// 关卡参考的逻辑分辨率（与 Day 1 一致：720×1280 竖屏）
export const LEVEL_LOGICAL_W = 720;
export const LEVEL_LOGICAL_H = 1280;

// ───────────────── 卡片类型 ─────────────────
// 12 种类型 × 9 张 = 108 张（必须是 3 的倍数）
export const CARD_TYPES = 12;
export const CARDS_PER_TYPE = 9;
export const TOTAL_CARDS = CARD_TYPES * CARDS_PER_TYPE; // 108

// 12 种蔬菜/水果图标（使用真实图片素材）
export const TYPE_ICON_KEYS = [
  'veg_0', 'veg_1', 'veg_2', 'veg_3',
  'veg_4', 'veg_5', 'veg_6', 'veg_7',
  'veg_8', 'veg_9', 'veg_10', 'veg_11',
];

// ───────────────── 卡槽 ─────────────────
export const SLOT_CAPACITY = 7;       // 槽位数
export const TRIPLE_COUNT = 3;        // 三同消除张数

// slot_bg.png 的真实结构（脚本 scripts/_measure_slot.py 像素扫描得到，不依赖具体显示尺寸）
// PNG 原始尺寸 2000×556（aspect ≈ 3.5971:1）
// 7 个凹槽中心由像素扫描得到的均匀分布
export const SLOT_BG_ASPECT = 2000 / 556;       // PNG 宽高比
export const SLOT_BG_LEFT_CX_RATIO = 0.1583;    // 第一个凹槽中心 / PNG宽（像素 ~316.5）
export const SLOT_BG_RIGHT_CX_RATIO = 0.8460;   // 最后一个凹槽中心 / PNG宽（像素 ~1692）
export const SLOT_BG_INNER_CELL_RATIO = 0.0834; // 每个凹槽内部宽度 / PNG宽（像素 ~167）

// ───────────────── 卡片尺寸（逻辑像素，正方形） ─────────────────
export const CARD_W = 76;
export const CARD_H = 76;
export const CARD_RADIUS = 12;

// ───────────────── 遮挡判定 ─────────────────
export const OCCLUSION_THRESHOLD = 0.05;  // 5% 阈值

// ───────────────── 牌堆混合堆叠参数 ─────────────────
//
// 设计思路（v2）：
//   牌堆 = 多个"小摞"（pile/deck 风）+ 散卡，全部混在牌堆区，无上下分区
//   - 一个"摞"：所有卡片几乎在同一位置，每张相对下张轻微偏移（X、Y 各 2-3px）
//     看起来像扑克牌摞在桌上，能看出层次但整体只占一张卡的视觉空间
//   - 散卡：单独散落，每张自己一个位置
//
// 整齐摞配置：摞数 + 每摞张数（总和应小于等于 TOTAL_CARDS）
export const PILE_COUNT = 6;         // 6 摞
export const PILE_HEIGHT = 10;       // 每摞 10 张 → 60 张走摞，剩 48 张走散卡
export const PILE_OFFSET_X = 2.5;    // 摞内每往上一张：X 偏移（逻辑像素）
export const PILE_OFFSET_Y = -3.5;   // 摞内每往上一张：Y 偏移（向上一点点）

// 散卡参数
export const SCATTER_LAYERS = 8;     // 散卡分 8 个 z 层（与摞混合）
export const SCATTER_JITTER = 0.92;  // 散卡位置抖动幅度（0-1，1 表示填满区域）

// 摞之间的中心放置：在牌堆区做一个粗网格，避免摞重叠太严重
export const PILE_GRID_COLS = 3;     // 摞中心 3 列
export const PILE_GRID_ROWS = 2;     // 2 行 = 6 个 anchor，对应 PILE_COUNT

// ───────────────── 游戏区与槽位的位置 ─────────────────
export const HUD_HEIGHT = 230;        // 顶部 HUD 高度（预留刘海安全区）
export const SLOT_AREA_HEIGHT = 160;  // 底部槽位区高度
// 牌堆区域：HUD_HEIGHT ~ (LEVEL_LOGICAL_H - SLOT_AREA_HEIGHT)

// ───────────────── 动画时长（毫秒） ─────────────────
export const ANIM_FLY_TO_SLOT = 280;
export const ANIM_SLOT_SHIFT = 180;
export const ANIM_TRIPLE_REMOVE = 220;
export const ANIM_SLOT_COMPACT = 220;
