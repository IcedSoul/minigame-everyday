// 快乐拼拼豆 · 游戏配置常量

export const CONFIG = {
  // 棋盘尺寸（不规则图案，以 mask 决定有效格子）
  ROWS: 14,
  COLS: 14,

  // 颜色系统（8种清亮柔和色 — 饱和度较高但不刺眼）
  COLOR_COUNT: 8,
  COLORS: [
    '#F2D05E', // 0 向日葵黄
    '#E8645A', // 1 番茄红
    '#5EC47A', // 2 青草绿
    '#52B8D9', // 3 晴空蓝
    '#F0944D', // 4 甜橙色
    '#B5855A', // 5 太妃棕
    '#F07BAF', // 6 蜜桃粉
    '#A96FE0', // 7 葡萄紫
  ],
  COLOR_NAMES: ['黄', '红', '绿', '蓝', '橙', '棕', '粉', '紫'],

  // 暂存槽
  MAX_HOLDING: 14,

  // 渲染
  CELL_SIZE: 36,       // 格子大小（逻辑像素）
  CELL_GAP: 0,         // 格子间距（由border填充，无额外间隙）
  BEAN_RADIUS: 15,     // 豆半径
  HOLDING_CELL: 36,    // 暂存槽格子大小

  // 动画时长（ms）
  ANIM_FLY_DURATION: 280,
  ANIM_BOUNCE_DURATION: 200,
  ANIM_SHAKE_DURATION: 300,
  ANIM_HIGHLIGHT_DURATION: 600,

  // 倒计时（秒）
  TIME_LIMIT: 180,

  // UI
  BG_COLOR: '#E8E0F0',
  BOARD_BG: '#FFFFFF',
  HOLDING_BG: '#FFFFFF',
  HUD_HEIGHT: 80,
  HOLDING_HEIGHT: 60,
};

// 小鸡图案 mask（1=有效格子，0=空）
// 14x14 的像素图案
export const LEVEL_MASK = [
  [0,0,0,0,0,1,1,1,1,0,0,0,0,0],
  [0,0,0,0,1,1,1,1,1,1,0,0,0,0],
  [0,0,0,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,0,1,1,1,1,1,1,1,1,1,1,0,0],
  [0,0,0,1,1,1,1,1,1,1,1,0,0,0],
  [0,0,0,0,0,1,1,1,1,0,0,0,0,0],
];

// 豆槽目标颜色图案（预设的像素画）
// -1 表示无效格子，数字对应 COLORS 索引
export function generateTargetPattern(mask) {
  const rows = mask.length;
  const cols = mask[0].length;
  const pattern = [];

  // 使用噪声 + 区域分割生成丰富的颜色图案
  // 主色调分布：上部黄绿、中部橙红棕、下部粉红
  for (let r = 0; r < rows; r++) {
    pattern[r] = [];
    for (let c = 0; c < cols; c++) {
      if (!mask[r][c]) {
        pattern[r][c] = -1;
        continue;
      }

      const nr = r / rows;  // 归一化行 0~1
      const nc = c / cols;  // 归一化列 0~1

      // 基于区域的颜色分配
      let color;
      if (nr < 0.3) {
        // 上部：黄 + 绿
        color = nc < 0.5 ? 0 : 2;  // 黄/绿
        // 少量点缀
        if ((r + c) % 5 === 0) color = 4; // 橙点缀
      } else if (nr < 0.5) {
        // 中上部：黄 + 橙 + 棕
        if (nc < 0.35) color = 2;       // 绿
        else if (nc < 0.65) color = 0;  // 黄
        else color = 4;                  // 橙
        if ((r * 3 + c * 7) % 11 === 0) color = 5; // 棕点缀
      } else if (nr < 0.7) {
        // 中下部：棕 + 红 + 橙
        if (nc < 0.3) color = 6;        // 粉
        else if (nc < 0.5) color = 5;   // 棕
        else if (nc < 0.7) color = 4;   // 橙
        else color = 1;                  // 红
        if ((r * 5 + c * 3) % 9 === 0) color = 3; // 青点缀
      } else {
        // 下部：红 + 粉 + 橙
        if (nc < 0.4) color = 1;        // 红
        else if (nc < 0.6) color = 6;   // 粉
        else color = 4;                  // 橙
        if ((r + c * 2) % 7 === 0) color = 0; // 黄点缀
      }

      // 加入一些随机噪声（使用确定性伪随机）
      const hash = ((r * 131 + c * 97 + r * c * 17) % 100);
      if (hash < 8) {
        // 8%的格子使用邻近色变化
        const shift = [0, 4, 2, 6, 0, 1, 3, 5];
        color = shift[color] || color;
      }

      pattern[r][c] = color;
    }
  }
  return pattern;
}
