// 《抓大鹅》Day 5 · 关卡 / 颜色 / 尺寸常量
//
// 设计参考：3D 三消，圆柱锅容器内堆叠 54 个物品（9 类型 × 6 个），
//          点击送入底部 7 格槽，三同消除，槽满失败，倒计时结束失败。

// ───────────────── 物品类型 ─────────────────
// 9 种几何形状 × 6 个 = 54 个（必须是 3 的倍数）
export const ITEM_TYPES = 9;
export const ITEMS_PER_TYPE = 6;
export const TOTAL_ITEMS = ITEM_TYPES * ITEMS_PER_TYPE; // 54

// 9 种几何体类型枚举
export const ITEM_SHAPES = [
  'sphere',     // 球
  'box',        // 立方体
  'cylinder',   // 圆柱
  'cone',       // 圆锥
  'torus',      // 甜甜圈
  'capsule',    // 胶囊
  'octahedron', // 八面体
  'dodecahedron', // 十二面体
  'icosphere',  // 二十面体
];

// 9 种颜色（鲜艳卡通风，避免相邻类型颜色相近）
export const ITEM_COLORS = [
  '#ff5c5c', // 红
  '#ffa726', // 橙
  '#ffd54f', // 黄
  '#66bb6a', // 绿
  '#26c6da', // 青
  '#42a5f5', // 蓝
  '#ab47bc', // 紫
  '#ec407a', // 粉
  '#8d6e63', // 棕
];

export const ITEM_NAMES = [
  '红球', '橙箱', '黄柱', '绿锥', '青圈',
  '蓝囊', '紫八', '粉十二', '棕二十',
];

// ───────────────── 物品尺寸（世界单位 = 米） ─────────────────
export const ITEM_RADIUS = 0.5;          // 物品包围球半径（碰撞用）
export const ITEM_VISUAL_SCALE = 0.45;   // 物品视觉缩放（略小于半径，避免视觉穿插）

// ───────────────── 容器（圆柱锅） ─────────────────
export const POT_RADIUS = 1.8;           // 锅内半径（缩小以便看清所有物品）
export const POT_HEIGHT = 3.2;           // 锅高
export const POT_WALL_THICKNESS = 0.15;  // 锅壁厚度（视觉用）
export const POT_BOTTOM_Y = 0;           // 锅底 y 坐标
export const POT_RIM_Y = POT_BOTTOM_Y + POT_HEIGHT; // 锅口 y 坐标
export const POT_OPEN_TOP = true;        // 顶部敞开（不封顶）

// ───────────────── 物理参数 ─────────────────
export const GRAVITY = -9.8 * 1.2;        // 重力加速度（略放大让回落更利落）
export const RESTITUTION = 0.35;          // 碰撞反弹系数（球-球 / 球-壁）
export const LINEAR_DAMPING = 0.92;       // 每帧线速度阻尼
export const ANGULAR_DAMPING = 0.90;      // 每帧角速度阻尼
export const SLEEP_VEL_THRESHOLD = 0.04;  // 速度低于此值视为静止
export const SLEEP_FRAMES = 30;           // 连续 N 帧低速 → 进入休眠（不再参与物理）
export const PHYSICS_TIMESTEP = 1 / 60;   // 物理固定步长
export const PHYSICS_MAX_SUBSTEPS = 3;    // 单帧最大子步

// ───────────────── 甩动检测（陀螺仪 / 加速度计） ─────────────────
export const SHAKE_THRESHOLD_G = 1.8;     // 加速度阈值（单位 g）
export const SHAKE_IMPULSE_SCALE = 6.0;   // 冲量缩放系数（甩一下给所有物品的速度幅度）
export const SHAKE_VERTICAL_BIAS = 0.6;   // 竖直分量加成（让物品翻起来更明显）
export const SHAKE_COOLDOWN_MS = 500;     // 两次甩动之间最小间隔

// ───────────────── 槽位 ─────────────────
export const SLOT_CAPACITY = 7;
export const TRIPLE_COUNT = 3;

// ───────────────── 倒计时 ─────────────────
export const TIME_LIMIT_SEC = 180;        // 3 分钟

// ───────────────── 动画时长（毫秒） ─────────────────
export const ANIM_FLY_TO_SLOT = 320;      // 物品飞到槽位的时长
export const ANIM_SLOT_SHIFT = 200;
export const ANIM_TRIPLE_REMOVE = 280;
export const ANIM_SLOT_COMPACT = 240;

// ───────────────── 摄像机 ─────────────────
// Babylon ArcRotateCamera：beta=0 表示从正上方往下看（垂直俯视）
// 注意：beta 严格为 0 会出现 up 向量奇异，因此用一个极小值 0.001
export const CAMERA_ALPHA = -Math.PI / 2;  // 水平角度（-PI/2 = 正前方）
export const CAMERA_BETA = 0.001;          // 俯仰角度（≈0 = 垂直俯视）
export const CAMERA_RADIUS = 13.0;         // 摄像机距锅心距离（拉远让物品更小、画面更宽）
export const CAMERA_TARGET_Y = 1.6;        // 摄像机看向锅中部

// ───────────────── 触摸调试模式（无陀螺仪时） ─────────────────
export const ENABLE_KEYBOARD_SHAKE = true; // 桌面端按空格模拟甩动
export const ENABLE_BUTTON_SHAKE = true;   // 屏幕显示一个"甩一甩"按钮

// 兼容性配置：从陀螺仪获取数据失败时是否回退到按钮模式
export const FALLBACK_TO_BUTTON_ON_NO_SENSOR = true;
