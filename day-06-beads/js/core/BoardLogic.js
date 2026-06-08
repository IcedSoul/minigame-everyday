// 快乐拼拼豆 · 棋盘逻辑（连通区域检测）

import { CONFIG } from './config.js';

export class BoardLogic {
  /**
   * BFS 找连通同色区域
   * @param {Array} board - 二维棋盘数组
   * @param {number} startRow
   * @param {number} startCol
   * @param {boolean} excludeMatched - 是否排除已匹配的豆（豆色=槽目标色）
   * @returns {Array<{row, col}>} 连通区域坐标列表
   */
  static findConnectedRegion(board, startRow, startCol, excludeMatched = false) {
    const cell = board[startRow][startCol];
    if (!cell.valid || cell.beanColor === null) return [];

    if (excludeMatched && cell.beanColor === cell.targetColor) return [];

    const targetColor = cell.beanColor;
    const visited = new Set();
    const queue = [{ row: startRow, col: startCol }];
    const region = [];
    const dirs = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ];

    while (queue.length > 0) {
      const { row, col } = queue.shift();
      const key = `${row},${col}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const c = board[row][col];
      if (!c.valid || c.beanColor !== targetColor) continue;
      if (excludeMatched && c.beanColor === c.targetColor) continue;

      region.push({ row, col });

      for (const { dr, dc } of dirs) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < CONFIG.ROWS && nc >= 0 && nc < CONFIG.COLS) {
          const nKey = `${nr},${nc}`;
          if (!visited.has(nKey)) {
            queue.push({ row: nr, col: nc });
          }
        }
      }
    }

    return region;
  }

  /**
   * BFS 找连通区域：同时匹配"豆颜色"和"豆槽颜色"
   * 即：只选中同一连通区域中，豆槽颜色=slotColor 且 豆颜色=beanColor 的格子
   * 连通性仍然基于相邻且满足条件的格子
   */
  static findConnectedRegionFiltered(board, startRow, startCol, beanColor, slotColor) {
    const cell = board[startRow][startCol];
    if (!cell.valid || cell.beanColor !== beanColor || cell.targetColor !== slotColor) return [];

    const visited = new Set();
    const queue = [{ row: startRow, col: startCol }];
    const region = [];
    const dirs = [
      { dr: -1, dc: 0 },
      { dr: 1, dc: 0 },
      { dr: 0, dc: -1 },
      { dr: 0, dc: 1 },
    ];

    while (queue.length > 0) {
      const { row, col } = queue.shift();
      const key = `${row},${col}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const c = board[row][col];
      if (!c.valid) continue;
      if (c.beanColor !== beanColor || c.targetColor !== slotColor) continue;

      region.push({ row, col });

      for (const { dr, dc } of dirs) {
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < CONFIG.ROWS && nc >= 0 && nc < CONFIG.COLS) {
          const nKey = `${nr},${nc}`;
          if (!visited.has(nKey)) {
            queue.push({ row: nr, col: nc });
          }
        }
      }
    }

    return region;
  }
}
