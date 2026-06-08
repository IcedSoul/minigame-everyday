// 快乐拼拼豆 · 颜色分布算法（大片连续同色区域版）

import { CONFIG } from './config.js';

export class ColorDistributor {
  /**
   * 为所有有效格子分配打乱后的豆颜色
   * 关键：生成大片连续同色区域（而不是打散）
   * 每种颜色的总数 = 目标图案中该颜色的豆槽数量
   */
  static distribute(validCells, board) {
    // 1. 统计每种颜色的目标数量
    const colorCounts = new Array(CONFIG.COLOR_COUNT).fill(0);
    for (const { row, col } of validCells) {
      const tc = board[row][col].targetColor;
      if (tc >= 0) colorCounts[tc]++;
    }

    // 2. 收集实际使用的颜色
    const usedColors = [];
    for (let c = 0; c < CONFIG.COLOR_COUNT; c++) {
      if (colorCounts[c] > 0) usedColors.push(c);
    }

    // 3. 使用区域生长算法生成大块连续同色区域
    const result = this.generateClusteredDistribution(validCells, board, colorCounts, usedColors);

    return result;
  }

  /**
   * 区域生长算法：从随机种子点开始向外扩展，形成大片连续区域
   */
  static generateClusteredDistribution(validCells, board, colorCounts, usedColors) {
    const rows = CONFIG.ROWS;
    const cols = CONFIG.COLS;

    // 创建一个 cellIndex map 方便查找
    const cellIndexMap = new Map();
    for (let i = 0; i < validCells.length; i++) {
      cellIndexMap.set(`${validCells[i].row},${validCells[i].col}`, i);
    }

    const result = new Array(validCells.length).fill(-1);
    const assigned = new Set();
    const remaining = new Map(); // color -> remaining count
    for (const c of usedColors) {
      remaining.set(c, colorCounts[c]);
    }

    const dirs = [
      { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
      { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
    ];

    // 打乱颜色顺序
    const shuffledColors = this.shuffle([...usedColors]);

    // 为每种颜色分配多个种子点，每个种子扩展形成一个连续区域
    // 策略：每种颜色分 2~3 个区域块
    const colorSeeds = [];
    for (const color of shuffledColors) {
      const count = remaining.get(color);
      // 每块大约 8~15 个格子，但不超过总数
      const numBlocks = Math.max(1, Math.min(3, Math.ceil(count / 12)));
      const perBlock = Math.ceil(count / numBlocks);
      for (let b = 0; b < numBlocks; b++) {
        const blockSize = Math.min(perBlock, count - perBlock * b);
        if (blockSize > 0) {
          colorSeeds.push({ color, size: blockSize });
        }
      }
    }

    // 打乱种子块的处理顺序
    this.shuffle(colorSeeds);

    // 为每个块选择种子点并区域生长
    for (const seed of colorSeeds) {
      const { color, size } = seed;
      let rem = remaining.get(color);
      if (rem <= 0) continue;

      const actualSize = Math.min(size, rem);

      // 选择一个未分配的种子点（尽量远离已分配的同色区域）
      const seedIdx = this.findSeedPoint(validCells, assigned, cellIndexMap, result, color, rows, cols);
      if (seedIdx === -1) continue;

      // BFS 扩展
      const grown = this.growRegion(seedIdx, actualSize, validCells, assigned, cellIndexMap, rows, cols, board);

      for (const idx of grown) {
        result[idx] = color;
        assigned.add(idx);
        rem--;
      }
      remaining.set(color, rem);
    }

    // 处理剩余未分配的格子（补漏）
    const unassigned = [];
    for (let i = 0; i < validCells.length; i++) {
      if (!assigned.has(i)) unassigned.push(i);
    }

    // 将剩余格子分配给还有余量的颜色
    this.shuffle(unassigned);
    for (const idx of unassigned) {
      // 找有余量的颜色，优先选相邻同色的
      const { row, col } = validCells[idx];
      let bestColor = -1;
      let bestRemaining = 0;

      // 先看邻居颜色
      for (const { dr, dc } of dirs) {
        const nr = row + dr;
        const nc = col + dc;
        const nKey = `${nr},${nc}`;
        const nIdx = cellIndexMap.get(nKey);
        if (nIdx !== undefined && result[nIdx] >= 0) {
          const nc2 = result[nIdx];
          const r = remaining.get(nc2) || 0;
          if (r > 0 && r > bestRemaining) {
            bestColor = nc2;
            bestRemaining = r;
          }
        }
      }

      // 如果邻居没有合适的，找余量最多的颜色
      if (bestColor === -1) {
        for (const [c, r] of remaining) {
          if (r > bestRemaining) {
            bestColor = c;
            bestRemaining = r;
          }
        }
      }

      if (bestColor >= 0) {
        result[idx] = bestColor;
        assigned.add(idx);
        remaining.set(bestColor, (remaining.get(bestColor) || 1) - 1);
      }
    }

    // 最终兜底：如果还有 -1，用任意颜色填充
    for (let i = 0; i < result.length; i++) {
      if (result[i] === -1) {
        result[i] = usedColors[0];
      }
    }

    // 确保不是已解状态
    if (this.isSolved(result, validCells, board)) {
      // 找两个不同颜色的格子交换
      for (let i = 0; i < result.length - 1; i++) {
        if (result[i] !== result[i + 1]) {
          [result[i], result[i + 1]] = [result[i + 1], result[i]];
          break;
        }
      }
    }

    return result;
  }

  /**
   * 找一个合适的种子点
   */
  static findSeedPoint(validCells, assigned, cellIndexMap, result, color, rows, cols) {
    // 收集所有未分配的点
    const candidates = [];
    for (let i = 0; i < validCells.length; i++) {
      if (!assigned.has(i)) candidates.push(i);
    }
    if (candidates.length === 0) return -1;

    // 随机选择一个
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * 从种子点 BFS 扩展指定数量的格子
   */
  static growRegion(seedIdx, size, validCells, assigned, cellIndexMap, rows, cols, board) {
    const result = [];
    const queue = [seedIdx];
    const visited = new Set();
    visited.add(seedIdx);

    const dirs = [
      { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
      { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
    ];

    while (queue.length > 0 && result.length < size) {
      // 随机从队列中取一个（而不是先进先出），让形状更自然
      const qIdx = Math.floor(Math.random() * queue.length);
      const idx = queue[qIdx];
      queue.splice(qIdx, 1);

      if (assigned.has(idx)) continue;

      result.push(idx);

      // 将邻居加入队列
      const { row, col } = validCells[idx];
      for (const { dr, dc } of dirs) {
        const nr = row + dr;
        const nc = col + dc;
        const nKey = `${nr},${nc}`;
        const nIdx = cellIndexMap.get(nKey);
        if (nIdx !== undefined && !visited.has(nIdx) && !assigned.has(nIdx)) {
          visited.add(nIdx);
          queue.push(nIdx);
        }
      }
    }

    return result;
  }

  static shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  static isSolved(colors, validCells, board) {
    for (let i = 0; i < validCells.length; i++) {
      const { row, col } = validCells[i];
      if (colors[i] !== board[row][col].targetColor) return false;
    }
    return true;
  }
}
