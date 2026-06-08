// 快乐拼拼豆 · 核心游戏状态

import { CONFIG, LEVEL_MASK, generateTargetPattern } from './config.js';
import { BoardLogic } from './BoardLogic.js';
import { ColorDistributor } from './ColorDistributor.js';

export class GameState {
  constructor() {
    this.board = [];        // [row][col] = { targetColor, beanColor, valid }
    this.holding = [];      // FIFO: [{ color, sourceRow, sourceCol }]
    this.steps = 0;
    this.startTime = 0;
    this.elapsedTime = 0;
    this.phase = 'playing'; // 'playing' | 'animating' | 'won' | 'timeout'
    this.highlightedRegion = null; // [{row, col}, ...]
    this.message = null;    // {text, timer}
    this.validCells = [];   // [{row, col}, ...] 所有有效格子

    // 选中状态（统一管理棋盘选中和暂存槽选中）
    // source: 'board' | 'holding'
    // color: 选中豆的颜色
    // cells: 选中的棋盘坐标数组 (仅 board 来源时有)
    this.selection = null;
  }

  init() {
    const mask = LEVEL_MASK;
    const targetPattern = generateTargetPattern(mask);
    const rows = CONFIG.ROWS;
    const cols = CONFIG.COLS;

    // 收集有效格子
    this.validCells = [];
    this.board = [];

    for (let r = 0; r < rows; r++) {
      this.board[r] = [];
      for (let c = 0; c < cols; c++) {
        const valid = mask[r][c] === 1;
        const targetColor = valid ? targetPattern[r][c] : -1;
        this.board[r][c] = {
          targetColor,
          beanColor: null,
          valid,
        };
        if (valid) {
          this.validCells.push({ row: r, col: c });
        }
      }
    }

    // 用颜色分布算法打乱豆的颜色（初始状态 — 大片连续同色区域）
    const shuffledColors = ColorDistributor.distribute(this.validCells, this.board);
    for (let i = 0; i < this.validCells.length; i++) {
      const { row, col } = this.validCells[i];
      this.board[row][col].beanColor = shuffledColors[i];
    }

    // 初始化状态
    this.holding = [];
    this.steps = 0;
    this.startTime = Date.now();
    this.elapsedTime = 0;
    this.phase = 'playing';
    this.highlightedRegion = null;
    this.message = null;
    this.selection = null;
  }

  /**
   * 点击棋盘上有豆的格子 → 选中提起
   * 选中规则：连通区域内，同时满足"豆槽颜色=点击格的豆槽颜色"且"豆颜色=点击格的豆颜色"
   */
  selectBoardBeans(row, col) {
    if (this.phase !== 'playing') return null;

    const cell = this.board[row][col];
    if (!cell.valid || cell.beanColor === null) return null;

    // 已匹配的豆不可选中
    if (cell.beanColor === cell.targetColor) {
      this.showMessage('已匹配的豆无法移动');
      return { action: 'locked' };
    }

    const beanColor = cell.beanColor;
    const slotColor = cell.targetColor;

    // BFS 找连通区域：同色豆且同色豆槽
    const region = BoardLogic.findConnectedRegionFiltered(this.board, row, col, beanColor, slotColor);
    if (region.length === 0) return null;

    // 如果已经选中了同一区域，取消选中
    if (this.selection && this.selection.source === 'board' &&
        this.selection.cells.length === region.length &&
        this.selection.cells[0].row === region[0].row &&
        this.selection.cells[0].col === region[0].col) {
      this.selection = null;
      return { action: 'deselected' };
    }

    // 设置选中状态
    this.selection = {
      source: 'board',
      color: beanColor,
      slotColor: slotColor,
      cells: region,
    };

    return { action: 'selected', color: beanColor, region };
  }

  /**
   * 点击暂存槽中的豆 → 选中该颜色
   */
  selectHoldingColor(index) {
    if (this.phase !== 'playing') return null;
    if (index < 0 || index >= this.holding.length) return null;

    const bean = this.holding[index];

    // 如果已经选中了同色，取消
    if (this.selection && this.selection.source === 'holding' && this.selection.color === bean.color) {
      this.selection = null;
      return { action: 'deselected' };
    }

    this.selection = {
      source: 'holding',
      color: bean.color,
    };

    return { action: 'selected', color: bean.color };
  }

  /**
   * 点击暂存槽区域（任意位置） — 如果当前有棋盘选中的豆，将其移入暂存槽
   */
  moveSelectionToHolding() {
    if (this.phase !== 'playing') return null;

    if (!this.selection || this.selection.source !== 'board') {
      return null;
    }

    const cells = this.selection.cells;
    const available = CONFIG.MAX_HOLDING - this.holding.length;

    if (available <= 0) {
      this.showMessage('暂存槽已满');
      return { action: 'full' };
    }

    // 取出（最多取 available 个）
    const toTake = cells.length <= available ? cells : cells.slice(0, available);
    const pickedBeans = [];

    for (const pos of toTake) {
      const bean = {
        color: this.board[pos.row][pos.col].beanColor,
        sourceRow: pos.row,
        sourceCol: pos.col,
      };
      this.holding.push(bean);
      pickedBeans.push(bean);
      this.board[pos.row][pos.col].beanColor = null;
    }

    this.steps++;
    this.selection = null;

    return { action: 'moved_to_holding', beans: pickedBeans };
  }

  /**
   * 点击空位豆槽 → 将当前选中的豆放入点击位置所在的连通同色空位区域
   * 来源可以是棋盘（槽到槽转移）或暂存槽
   */
  placeBeans(row, col) {
    if (this.phase !== 'playing') return null;

    const cell = this.board[row][col];
    if (!cell.valid) return null;

    // 必须点击空位
    if (cell.beanColor !== null) return null;

    // 必须有选中
    if (!this.selection) {
      this.showMessage('请先选中豆');
      return { action: 'no_selection' };
    }

    const selectedColor = this.selection.color;

    // 豆颜色必须与点击的豆槽目标颜色匹配
    if (cell.targetColor !== selectedColor) {
      this.showMessage('颜色不匹配');
      return { action: 'mismatch' };
    }

    // 找到点击位置所在的连通同色空位区域
    const emptyRegion = this.findConnectedEmptySlots(row, col, selectedColor);
    if (emptyRegion.length === 0) return { action: 'none_placed' };

    if (this.selection.source === 'board') {
      return this._placeBoardSelectionToSlots(selectedColor, emptyRegion);
    } else if (this.selection.source === 'holding') {
      return this._placeHoldingToSlots(selectedColor, emptyRegion);
    }

    return null;
  }

  /**
   * BFS 找点击位置所在的连通同色空豆槽区域
   */
  findConnectedEmptySlots(startRow, startCol, color) {
    const visited = new Set();
    const queue = [{ row: startRow, col: startCol }];
    const region = [];
    const dirs = [
      { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
      { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
    ];

    while (queue.length > 0) {
      const { row, col } = queue.shift();
      const key = `${row},${col}`;
      if (visited.has(key)) continue;
      visited.add(key);

      if (row < 0 || row >= CONFIG.ROWS || col < 0 || col >= CONFIG.COLS) continue;
      const cell = this.board[row][col];
      if (!cell.valid) continue;
      if (cell.targetColor !== color) continue;
      if (cell.beanColor !== null) continue; // 只找空位

      region.push({ row, col });

      for (const { dr, dc } of dirs) {
        const nKey = `${row + dr},${col + dc}`;
        if (!visited.has(nKey)) {
          queue.push({ row: row + dr, col: col + dc });
        }
      }
    }

    return region;
  }

  /**
   * 棋盘选中的豆 → 放入指定的连通空位区域（槽到槽转移）
   */
  _placeBoardSelectionToSlots(color, emptyRegion) {
    const cells = this.selection.cells;
    const placed = [];
    let slotIdx = 0;

    for (const pos of cells) {
      if (slotIdx >= emptyRegion.length) break; // 空位用完了

      // 从原位取出放入连通区域的空位
      const beanColor = this.board[pos.row][pos.col].beanColor;
      const target = emptyRegion[slotIdx];
      this.board[pos.row][pos.col].beanColor = null;
      this.board[target.row][target.col].beanColor = beanColor;
      placed.push({ bean: { color: beanColor, sourceRow: pos.row, sourceCol: pos.col }, row: target.row, col: target.col });
      slotIdx++;
    }

    if (placed.length > 0) {
      this.steps++;
      this.selection = null;

      if (this.checkWin()) {
        this.phase = 'won';
        return { action: 'placed_and_won', placed, fromBoard: true };
      }
      return { action: 'placed', placed, fromBoard: true };
    }

    this.showMessage('没有可放置的位置');
    return { action: 'none_placed' };
  }

  /**
   * 暂存槽的豆 → 放入指定的连通空位区域
   */
  _placeHoldingToSlots(color, emptyRegion) {
    const placed = [];
    let slotIdx = 0;

    while (slotIdx < emptyRegion.length) {
      const beanIdx = this.holding.findIndex(b => b.color === color);
      if (beanIdx === -1) break; // 暂存槽中没有该色豆了

      const target = emptyRegion[slotIdx];
      const bean = this.holding.splice(beanIdx, 1)[0];
      this.board[target.row][target.col].beanColor = bean.color;
      placed.push({ bean, row: target.row, col: target.col });
      slotIdx++;
    }

    if (placed.length > 0) {
      this.steps++;
      this.selection = null;

      if (this.checkWin()) {
        this.phase = 'won';
        return { action: 'placed_and_won', placed, fromBoard: false };
      }
      return { action: 'placed', placed, fromBoard: false };
    }

    this.showMessage('没有可放置的位置');
    return { action: 'none_placed' };
  }

  findEmptySlotForColor(color) {
    for (const { row, col } of this.validCells) {
      const cell = this.board[row][col];
      if (cell.beanColor === null && cell.targetColor === color) {
        return { row, col };
      }
    }
    return null;
  }

  checkWin() {
    for (const { row, col } of this.validCells) {
      const cell = this.board[row][col];
      if (cell.beanColor !== cell.targetColor) return false;
    }
    return true;
  }

  showMessage(text) {
    this.message = { text, timer: 2000 };
  }

  updateTimer() {
    if (this.phase === 'playing') {
      this.elapsedTime = Date.now() - this.startTime;
      const remaining = CONFIG.TIME_LIMIT * 1000 - this.elapsedTime;
      if (remaining <= 0) {
        this.phase = 'timeout';
      }
    }
  }

  getRemainingTime() {
    const remaining = Math.max(0, CONFIG.TIME_LIMIT * 1000 - this.elapsedTime);
    const min = Math.floor(remaining / 60000);
    const sec = Math.floor((remaining % 60000) / 1000);
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  getProgress() {
    let matched = 0;
    for (const { row, col } of this.validCells) {
      const cell = this.board[row][col];
      if (cell.beanColor === cell.targetColor) matched++;
    }
    return { matched, total: this.validCells.length };
  }
}
