// 关卡 / 颜色 / 尺寸常量

// 7 色调色板（颜色 > 槽位数才可能产生备选区压力 → 才有失败可能）
export const COLORS = [
  '#e63946', // 0 红
  '#f4a261', // 1 橙
  '#e9c46a', // 2 黄
  '#2a9d8f', // 3 青绿
  '#457b9d', // 4 蓝
  '#9b5de5', // 5 紫
  '#f15bb5', // 6 粉
];
export const COLOR_NAMES = ['red', 'orange', 'yellow', 'teal', 'blue', 'purple', 'pink'];

export const BOX_SLOT_CAPACITY = 3;     // 每个工具箱装满 3 颗即消除
export const TOP_BOX_COUNT = 4;         // 顶部固定 4 个工具箱
export const BUFFER_CAPACITY = 5;       // 备选区 5 格（位于顶部箱子与游戏区中间）

export const SCREW_RADIUS = 24;
export const BOARD_RADIUS = 16;

// 螺丝最小中心间距（避免挨太近）
export const SCREW_MIN_DIST = SCREW_RADIUS * 2 + 8;

// 关卡生成参数
export const LEVEL_TOTAL_COLORS = 7;        // 一关共出现 7 种颜色（> 4 槽位）
export const LEVEL_GROUPS_PER_COLOR = 3;    // 每色出现 3 组 = 9 颗（保证 3 的倍数）
// → 总螺丝数 = 7 × 9 = 63 颗 = 21 块板子 × 3 颗
export const SCREWS_PER_BOARD = 3;          // 每块板子严格 3 颗螺丝

// 板子形态库：[width, height] 组合，引擎随机抽取
export const BOARD_SHAPES = [
  { w: 240, h: 110 },  // 正常
  { w: 280, h: 100 },  // 宽扁
  { w: 220, h: 130 },  // 窄高
  { w: 260, h: 110 },  // 中等
  { w: 300, h: 110 },  // 大宽
];
