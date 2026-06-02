// 《抓大鹅》Day 5 · 关卡生成器
//
// 在锅内随机生成 54 个物品的初始位置，让它们看起来"堆"在一起：
//  - 横截面：在半径 [0, POT_RADIUS - r) 内均匀采样
//  - 高度：分 6 层，每层 9 个，逐层往上堆
//  - 加少量随机扰动，避免完全规则
//
// 物理 settle：实际高度由物理引擎落体后决定，本生成器只给一个"略高于最终位置"的初值

import {
  TOTAL_ITEMS,
  ITEM_TYPES,
  ITEMS_PER_TYPE,
  ITEM_RADIUS,
  POT_RADIUS,
  POT_BOTTOM_Y,
} from './config.js';

// Fisher–Yates 洗牌
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateLevel() {
  // 1) 生成 54 个物品的 type（每种 6 个），打乱
  const types = [];
  for (let t = 0; t < ITEM_TYPES; t++) {
    for (let k = 0; k < ITEMS_PER_TYPE; k++) types.push(t);
  }
  shuffle(types);

  // 2) 生成初始位置：9 层 × 6 个 / 层（容器变小了，每层放更少）
  //    每层 y 从 0.6 起逐层 +1.0，落体后会自然 settle 到锅底
  const items = [];
  const perLayer = 6;
  const layers = TOTAL_ITEMS / perLayer; // 9
  const safeR = POT_RADIUS - ITEM_RADIUS - 0.05;

  let id = 0;
  for (let L = 0; L < layers; L++) {
    for (let i = 0; i < perLayer; i++) {
      // 在水平圆面内均匀采样：r = sqrt(u) * safeR, theta = 2π v
      const r = Math.sqrt(Math.random()) * safeR * 0.9;
      const theta = Math.random() * Math.PI * 2;
      const x = r * Math.cos(theta);
      const z = r * Math.sin(theta);
      // 高度：层 L 的基线 + 随机扰动，且整体抬高一些让它们落下时有动感
      const baseY = POT_BOTTOM_Y + ITEM_RADIUS + 0.3 + L * (ITEM_RADIUS * 2 + 0.05);
      const y = baseY + (Math.random() - 0.5) * 0.15;
      items.push({
        id: id++,
        type: types[L * perLayer + i],
        x, y, z,
      });
    }
  }

  return { items };
}
