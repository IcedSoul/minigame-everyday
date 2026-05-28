/**
 * GameScene - Main gameplay scene for "一箭又一箭" (Arrow Puzzle)
 *
 * Animation strategy:
 * - Uses Phaser's update(time, delta) loop as the sole animation driver (~60fps)
 * - Snake-style animation: head extends, tail retracts per frame
 * - No setInterval, no Phaser tweens - pure delta-time based interpolation
 * - Supports pinch-to-zoom and zoom slider
 */

import {
  GRID_COLS, GRID_ROWS, CELL_SIZE, DOT_RADIUS,
  MOVE_DURATION, RETREAT_DURATION, MAX_FAILURES, COUNTDOWN_SECONDS,
  DOT_COLOR, ARROWHEAD_SIZE, MIN_ZOOM, MAX_ZOOM, DEFAULT_ZOOM
} from '../core/config.js';
import { generateLevel } from '../core/LevelGenerator.js';
import { WIDTH, HEIGHT } from '../main.js';

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    // Calculate grid offset to center it (leave space for HUD top and zoom slider bottom)
    this.gridOffsetX = (WIDTH - (GRID_COLS - 1) * CELL_SIZE) / 2;
    this.gridOffsetY = 50 + ((HEIGHT - 100) - (GRID_ROWS - 1) * CELL_SIZE) / 2;

    // Game state
    this.failures = 0;
    this.countdown = COUNTDOWN_SECONDS;
    this.status = 'playing';
    this.countdownStarted = false;
    this.countdownTimer = null;

    // Animation state: supports multiple simultaneous animations
    this.activeAnims = [];

    // Zoom state
    this.currentZoom = DEFAULT_ZOOM;
    this.pinchStartDist = 0;
    this.pinchStartZoom = 1;
    this.isPinching = false;

    // Generate level
    const level = generateLevel();
    this.arrows = level.arrows.map(a => ({
      ...a,
      state: 'idle',
      originalColor: a.color,
      savedSegments: null,
      graphics: null,
    }));
    this.grid = level.grid;

    // Create a container for all game content (for zoom)
    this.gameContainer = this.add.container(0, 0);

    // Draw everything into the container
    this.drawGrid();
    this.drawAllArrows();

    // HUD is drawn on top (not in container, stays fixed)
    this.createHUD();
    this.createZoomSlider();

    // Input handling
    this.input.on('pointerdown', this.onPointerDown, this);

    // Pinch-to-zoom support
    this.input.addPointer(1); // Enable multi-touch (2 pointers total)
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);

    // Cleanup on scene shutdown
    this.events.on('shutdown', () => {
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
    });
  }

  // ===== PHASER UPDATE LOOP (animation driver) =====

  update(time, delta) {
    const now = Date.now();
    if (!this._lastUpdateTime) this._lastUpdateTime = now;
    const realDelta = now - this._lastUpdateTime;
    this._lastUpdateTime = now;
    const dt = Math.min(realDelta, 50);

    // Update click dots fade
    if (this._clickDots && this._clickDots.length > 0) {
      for (let i = this._clickDots.length - 1; i >= 0; i--) {
        const d = this._clickDots[i];
        d.elapsed += dt;
        if (d.elapsed >= d.life) {
          d.graphics.destroy();
          this._clickDots.splice(i, 1);
        } else {
          const alpha = 0.8 * (1 - d.elapsed / d.life);
          d.graphics.clear();
          d.graphics.fillStyle(0xff0000, alpha);
          d.graphics.fillCircle(0, 0, 6);
        }
      }
    }

    // Update all active animations
    for (let i = this.activeAnims.length - 1; i >= 0; i--) {
      const a = this.activeAnims[i];
      a.elapsed += dt;
      const progress = Math.min(a.elapsed / a.duration, 1);

      if (a.onFrame) {
        a.onFrame(progress);
      }

      if (progress >= 1) {
        this.activeAnims.splice(i, 1);
        if (a.onComplete) {
          a.onComplete();
        }
      }
    }
  }

  // ===== ANIMATION HELPERS =====

  addAnim(opts) {
    const anim = {
      duration: opts.duration,
      elapsed: 0,
      onFrame: opts.onFrame || null,
      onComplete: opts.onComplete || null,
    };
    this.activeAnims.push(anim);
    return anim;
  }

  scheduleCallback(duration, callback) {
    setTimeout(callback, duration);
  }

  // ===== COORDINATE CONVERSION =====

  gridToScreen(gx, gy) {
    return {
      x: this.gridOffsetX + gx * CELL_SIZE,
      y: this.gridOffsetY + gy * CELL_SIZE,
    };
  }

  screenToGrid(sx, sy) {
    // Convert screen coordinates to grid, accounting for container zoom
    const worldX = (sx - this.gameContainer.x) / this.currentZoom;
    const worldY = (sy - this.gameContainer.y) / this.currentZoom;
    return {
      x: Math.round((worldX - this.gridOffsetX) / CELL_SIZE),
      y: Math.round((worldY - this.gridOffsetY) / CELL_SIZE),
    };
  }

  screenToWorld(sx, sy) {
    const worldX = (sx - this.gameContainer.x) / this.currentZoom;
    const worldY = (sy - this.gameContainer.y) / this.currentZoom;
    return { x: worldX, y: worldY };
  }

  inBounds(x, y) {
    return x >= 0 && x < GRID_COLS && y >= 0 && y < GRID_ROWS;
  }

  // ===== DRAWING =====

  drawGrid() {
    const g = this.add.graphics();
    g.fillStyle(DOT_COLOR, 1);
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const { x, y } = this.gridToScreen(col, row);
        g.fillCircle(x, y, DOT_RADIUS);
      }
    }
    this.gameContainer.add(g);
  }

  drawAllArrows() {
    for (const arrow of this.arrows) {
      if (arrow.state === 'removed') continue;
      this.createArrowGraphics(arrow);
    }
  }

  createArrowGraphics(arrow) {
    if (arrow.graphics) {
      arrow.graphics.destroy();
    }
    const g = this.add.graphics();
    g.x = 0;
    g.y = 0;
    arrow.graphics = g;
    this.gameContainer.add(g);
    this.renderArrowToGraphics(arrow);
  }

  renderArrowToGraphics(arrow) {
    const g = arrow.graphics;
    if (!g) return;
    g.clear();

    const segments = arrow.segments;
    if (segments.length === 0) return;

    const color = arrow.color;
    const lineWidth = 3;

    const pts = segments.map(seg => this.gridToScreen(seg.x, seg.y));

    if (pts.length > 1) {
      g.lineStyle(lineWidth, color, 1);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        g.lineTo(pts[i].x, pts[i].y);
      }
      g.strokePath();
    }

    // Tail circle
    g.fillStyle(color, 1);
    g.fillCircle(pts[0].x, pts[0].y, 4);

    // Arrowhead
    const head = pts[pts.length - 1];
    const dir = arrow.direction;
    const size = ARROWHEAD_SIZE;

    const tipX = head.x + dir.dx * (size + 4);
    const tipY = head.y + dir.dy * (size + 4);
    const perpX = -dir.dy;
    const perpY = dir.dx;

    const wing1X = head.x + perpX * size * 0.45;
    const wing1Y = head.y + perpY * size * 0.45;
    const wing2X = head.x - perpX * size * 0.45;
    const wing2Y = head.y - perpY * size * 0.45;

    g.fillStyle(color, 1);
    g.fillTriangle(tipX, tipY, wing1X, wing1Y, wing2X, wing2Y);
  }

  // ===== HUD =====

  createHUD() {
    // HUD container (fixed, not affected by zoom)
    this.hudContainer = this.add.container(0, 0);
    this.hudContainer.setDepth(200);

    // Background bar for HUD
    const hudBg = this.add.rectangle(WIDTH / 2, 22, WIDTH, 44, 0xf5f0e8, 0.9);
    this.hudContainer.add(hudBg);

    this.hearts = [];
    for (let i = 0; i < MAX_FAILURES; i++) {
      const heart = this.add.text(20 + i * 35, 10, '❤️', { fontSize: '22px' });
      this.hearts.push(heart);
      this.hudContainer.add(heart);
    }

    this.timerText = this.add.text(WIDTH - 20, 12, `⏱ ${this.formatTime(this.countdown)}`, {
      fontSize: '18px',
      color: '#333333',
      fontFamily: 'monospace',
    }).setOrigin(1, 0);
    this.hudContainer.add(this.timerText);

    const remaining = this.arrows.filter(a => a.state !== 'removed').length;
    this.arrowCountText = this.add.text(WIDTH / 2, 12, `剩余: ${remaining}`, {
      fontSize: '16px',
      color: '#666666',
    }).setOrigin(0.5, 0);
    this.hudContainer.add(this.arrowCountText);
  }

  createZoomSlider() {
    // Zoom slider at the bottom of the screen
    this.zoomContainer = this.add.container(0, 0);
    this.zoomContainer.setDepth(200);

    const sliderY = HEIGHT - 30;
    const sliderLeft = 60;
    const sliderRight = WIDTH - 60;
    const sliderWidth = sliderRight - sliderLeft;

    // Slider background
    const sliderBg = this.add.rectangle(WIDTH / 2, sliderY, sliderWidth, 4, 0xcccccc, 1);
    this.zoomContainer.add(sliderBg);

    // Labels
    const minLabel = this.add.text(sliderLeft - 20, sliderY, '−', {
      fontSize: '20px', color: '#666666'
    }).setOrigin(0.5, 0.5);
    const maxLabel = this.add.text(sliderRight + 20, sliderY, '+', {
      fontSize: '20px', color: '#666666'
    }).setOrigin(0.5, 0.5);
    this.zoomContainer.add(minLabel);
    this.zoomContainer.add(maxLabel);

    // Slider handle
    const handleX = sliderLeft + ((this.currentZoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM)) * sliderWidth;
    this.sliderHandle = this.add.circle(handleX, sliderY, 10, 0x4ecdc4, 1);
    this.sliderHandle.setStrokeStyle(2, 0x333333);
    this.sliderHandle.setInteractive({ draggable: true, useHandCursor: true });
    this.zoomContainer.add(this.sliderHandle);

    // Store slider dimensions for drag calculation
    this.sliderLeft = sliderLeft;
    this.sliderRight = sliderRight;
    this.sliderWidth = sliderWidth;
    this.sliderY = sliderY;

    // Drag handler
    this.input.setDraggable(this.sliderHandle);
    this.sliderHandle.on('drag', (pointer, dragX) => {
      const clampedX = Math.max(this.sliderLeft, Math.min(this.sliderRight, dragX));
      this.sliderHandle.x = clampedX;
      const ratio = (clampedX - this.sliderLeft) / this.sliderWidth;
      this.setZoom(MIN_ZOOM + ratio * (MAX_ZOOM - MIN_ZOOM));
    });
  }

  setZoom(zoom) {
    this.currentZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));

    // Scale the game container around its center
    const centerX = WIDTH / 2;
    const centerY = HEIGHT / 2;
    this.gameContainer.setScale(this.currentZoom);

    // Default position (centered)
    const defaultX = centerX - centerX * this.currentZoom;
    const defaultY = centerY - centerY * this.currentZoom;
    this.setContainerPosition(defaultX, defaultY);

    // Update slider handle position
    if (this.sliderHandle) {
      const ratio = (this.currentZoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
      this.sliderHandle.x = this.sliderLeft + ratio * this.sliderWidth;
    }
  }

  /**
   * Set the game container position with bounds clamping.
   * Prevents panning too far away from the game area.
   */
  setContainerPosition(x, y) {
    if (this.currentZoom <= 1.05) {
      // When not zoomed in, center the container
      const centerX = WIDTH / 2;
      const centerY = HEIGHT / 2;
      this.gameContainer.setPosition(
        centerX - centerX * this.currentZoom,
        centerY - centerY * this.currentZoom
      );
      return;
    }

    // Clamp position so the game area stays partially visible
    const scaledWidth = WIDTH * this.currentZoom;
    const scaledHeight = HEIGHT * this.currentZoom;
    const minX = WIDTH - scaledWidth;
    const minY = HEIGHT - scaledHeight;
    const maxX = 0;
    const maxY = 0;

    const clampedX = Math.max(minX, Math.min(maxX, x));
    const clampedY = Math.max(minY, Math.min(maxY, y));

    this.gameContainer.setPosition(clampedX, clampedY);
  }

  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  startCountdown() {
    if (this.countdownStarted) return;
    this.countdownStarted = true;

    this.countdownTimer = setInterval(() => {
      if (this.status !== 'playing') {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        return;
      }
      this.countdown--;
      this.timerText.setText(`⏱ ${this.formatTime(this.countdown)}`);
      if (this.countdown <= 10) {
        this.timerText.setColor('#ff4444');
      }
      if (this.countdown <= 0) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.gameOver(false);
      }
    }, 1000);
  }

  updateHUD() {
    for (let i = 0; i < MAX_FAILURES; i++) {
      this.hearts[i].setText(i < MAX_FAILURES - this.failures ? '❤️' : '🖤');
    }
    const remaining = this.arrows.filter(a => a.state !== 'removed').length;
    this.arrowCountText.setText(`剩余: ${remaining}`);
  }

  // ===== INPUT =====

  onPointerDown(pointer) {
    if (this.status !== 'playing') return;

    // Check if clicking on the slider area (bottom 60px)
    if (pointer.y > HEIGHT - 60) return;

    // Check for pinch start
    const pointers = this.input.manager.pointers;
    const activePointers = pointers.filter(p => p.isDown);
    if (activePointers.length >= 2) {
      this.startPinch(activePointers[0], activePointers[1]);
      return;
    }

    // Start drag tracking for pan (when zoomed in)
    this._dragStart = { x: pointer.x, y: pointer.y };
    this._dragStartContainerPos = { x: this.gameContainer.x, y: this.gameContainer.y };
    this._isDragging = false;
    this._pointerDownTime = Date.now();
    this._pendingClickPointer = { x: pointer.x, y: pointer.y };

    // If not zoomed in, handle click immediately
    if (this.currentZoom <= 1.05) {
      this.handleArrowClick(pointer.x, pointer.y);
    }
    // If zoomed in, defer click to pointerup (to distinguish from drag)
  }

  /**
   * Handle arrow click at the given screen position.
   */
  handleArrowClick(screenX, screenY) {
    // Convert screen to world coordinates for grid detection
    const world = this.screenToWorld(screenX, screenY);
    const gx = Math.round((world.x - this.gridOffsetX) / CELL_SIZE);
    const gy = Math.round((world.y - this.gridOffsetY) / CELL_SIZE);

    let clickedArrow = null;

    // Try exact grid position
    if (this.inBounds(gx, gy) && this.grid[gy][gx] !== 0) {
      const id = this.grid[gy][gx];
      clickedArrow = this.arrows.find(a => a.id === id && a.state === 'idle');
    }

    // Try nearby cells (tolerance for fat fingers)
    if (!clickedArrow) {
      const tolerance = CELL_SIZE * 0.6;
      for (const arrow of this.arrows) {
        if (arrow.state !== 'idle') continue;
        for (const seg of arrow.segments) {
          const { x: sx, y: sy } = this.gridToScreen(seg.x, seg.y);
          const dist = Math.sqrt((world.x - sx) ** 2 + (world.y - sy) ** 2);
          if (dist < tolerance) {
            clickedArrow = arrow;
            break;
          }
        }
        if (clickedArrow) break;
      }
    }

    if (!clickedArrow) return;

    // Show red dot at click position (in world space)
    this.showClickDot(world.x, world.y);

    this.startCountdown();
    this.startArrowMove(clickedArrow);
  }

  onPointerMove(pointer) {
    // Handle pinch zoom
    const pointers = this.input.manager.pointers;
    const activePointers = pointers.filter(p => p.isDown);
    if (activePointers.length >= 2 && this.isPinching) {
      this.updatePinch(activePointers[0], activePointers[1]);
      return;
    }

    // Handle drag-to-pan when zoomed in (single finger)
    if (this.currentZoom > 1.05 && pointer.isDown && this._dragStart && !this.isPinching) {
      const dx = pointer.x - this._dragStart.x;
      const dy = pointer.y - this._dragStart.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Start dragging after moving more than 8px (prevents accidental drags)
      if (dist > 8) {
        this._isDragging = true;
      }

      if (this._isDragging) {
        const newX = this._dragStartContainerPos.x + dx;
        const newY = this._dragStartContainerPos.y + dy;
        this.setContainerPosition(newX, newY);
      }
    }
  }

  onPointerUp(pointer) {
    const pointers = this.input.manager.pointers;
    const activePointers = pointers.filter(p => p.isDown);
    if (activePointers.length < 2) {
      this.isPinching = false;
    }

    // If zoomed in and no drag occurred, treat as a click
    if (this.currentZoom > 1.05 && !this._isDragging && this._pendingClickPointer) {
      this.handleArrowClick(this._pendingClickPointer.x, this._pendingClickPointer.y);
    }

    this._dragStart = null;
    this._isDragging = false;
    this._pendingClickPointer = null;
  }

  startPinch(p1, p2) {
    this.isPinching = true;
    this.pinchStartDist = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
    this.pinchStartZoom = this.currentZoom;
  }

  updatePinch(p1, p2) {
    const dist = Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
    if (this.pinchStartDist > 0) {
      const scale = dist / this.pinchStartDist;
      this.setZoom(this.pinchStartZoom * scale);
    }
  }

  showClickDot(x, y) {
    const dot = this.add.graphics();
    dot.setPosition(x, y);
    dot.fillStyle(0xff0000, 0.8);
    dot.fillCircle(0, 0, 6);
    dot.setDepth(50);
    this.gameContainer.add(dot);

    this._clickDots = this._clickDots || [];
    this._clickDots.push({ graphics: dot, life: 400, elapsed: 0 });
  }

  // ===== MOVEMENT LOGIC =====

  startArrowMove(arrow) {
    arrow.state = 'moving';
    arrow.savedSegments = arrow.segments.map(s => ({ ...s }));

    this.doNextStep(arrow);
  }

  /**
   * Snake-style movement: head extends forward, tail retracts.
   * Each step animates one cell of movement with per-frame redraw.
   */
  doNextStep(arrow) {
    const dir = arrow.direction;
    const segments = arrow.segments;

    if (segments.length === 0) {
      this.finishArrowRemoval(arrow);
      return;
    }

    const head = segments[segments.length - 1];
    const newHeadX = head.x + dir.dx;
    const newHeadY = head.y + dir.dy;

    // === CASE 1: Head goes out of bounds → exiting phase ===
    // The head continues moving off-screen while tail retracts
    if (!this.inBounds(newHeadX, newHeadY)) {
      this.doExitStep(arrow);
      return;
    }

    // === CASE 2: Collision with another arrow ===
    if (this.grid[newHeadY][newHeadX] !== 0 && this.grid[newHeadY][newHeadX] !== arrow.id) {
      this.handleCollision(arrow);
      return;
    }

    // === CASE 3: Normal snake move ===
    const tail = segments[0];
    const headScreen = this.gridToScreen(head.x, head.y);
    const newHeadScreen = this.gridToScreen(newHeadX, newHeadY);
    const tailScreen = this.gridToScreen(tail.x, tail.y);
    const nextTailScreen = segments.length > 1
      ? this.gridToScreen(segments[1].x, segments[1].y)
      : newHeadScreen;

    this.addAnim({
      duration: MOVE_DURATION,
      onFrame: (progress) => {
        this.renderSnakeFrame(arrow, headScreen, newHeadScreen, tailScreen, nextTailScreen, progress);
      },
      onComplete: () => {
        const removedTail = segments.shift();
        if (this.inBounds(removedTail.x, removedTail.y)) {
          this.grid[removedTail.y][removedTail.x] = 0;
        }
        segments.push({ x: newHeadX, y: newHeadY });
        this.grid[newHeadY][newHeadX] = arrow.id;

        arrow.graphics.x = 0;
        arrow.graphics.y = 0;
        this.renderArrowToGraphics(arrow);

        this.doNextStep(arrow);
      },
    });
  }

  /**
   * Render a single frame of snake-style movement.
   */
  renderSnakeFrame(arrow, headPos, newHeadPos, tailPos, nextTailPos, progress) {
    const g = arrow.graphics;
    if (!g) return;
    g.clear();
    g.x = 0;
    g.y = 0;

    const segments = arrow.segments;
    const color = arrow.color;
    const lineWidth = 3;

    const currentHeadX = headPos.x + (newHeadPos.x - headPos.x) * progress;
    const currentHeadY = headPos.y + (newHeadPos.y - headPos.y) * progress;
    const currentTailX = tailPos.x + (nextTailPos.x - tailPos.x) * progress;
    const currentTailY = tailPos.y + (nextTailPos.y - tailPos.y) * progress;

    const pts = [];
    pts.push({ x: currentTailX, y: currentTailY });

    for (let i = 1; i < segments.length - 1; i++) {
      pts.push(this.gridToScreen(segments[i].x, segments[i].y));
    }

    if (segments.length > 1) {
      pts.push(headPos);
    }

    pts.push({ x: currentHeadX, y: currentHeadY });

    if (pts.length > 1) {
      g.lineStyle(lineWidth, color, 1);
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        g.lineTo(pts[i].x, pts[i].y);
      }
      g.strokePath();
    }

    g.fillStyle(color, 1);
    g.fillCircle(pts[0].x, pts[0].y, 4);

    const dir = arrow.direction;
    const size = ARROWHEAD_SIZE;
    const tipX = currentHeadX + dir.dx * (size + 4);
    const tipY = currentHeadY + dir.dy * (size + 4);
    const perpX = -dir.dy;
    const perpY = dir.dx;

    g.fillStyle(color, 1);
    g.fillTriangle(
      tipX, tipY,
      currentHeadX + perpX * size * 0.45, currentHeadY + perpY * size * 0.45,
      currentHeadX - perpX * size * 0.45, currentHeadY - perpY * size * 0.45
    );
  }

  /**
   * Exit step: the arrow slides completely off-screen.
   * Head keeps moving in the arrow's direction far beyond the visible area,
   * while the tail retracts one cell at a time. The arrow remains fully visible
   * during the entire exit animation until it's completely off-screen.
   */
  doExitStep(arrow) {
    const dir = arrow.direction;
    const segments = arrow.segments;

    if (segments.length === 0) {
      this.finishArrowRemoval(arrow);
      return;
    }

    // Track how far the head has already moved off-screen
    if (arrow._exitOffset === undefined) {
      arrow._exitOffset = 0;
    }
    arrow._exitOffset += 1;

    const head = segments[segments.length - 1];
    const headScreen = this.gridToScreen(head.x, head.y);
    // Head position is already offset by previous exit steps
    const currentHeadBase = {
      x: headScreen.x + dir.dx * CELL_SIZE * (arrow._exitOffset - 1),
      y: headScreen.y + dir.dy * CELL_SIZE * (arrow._exitOffset - 1),
    };
    // Head extends one more cell further off-screen
    const newHeadScreen = {
      x: headScreen.x + dir.dx * CELL_SIZE * arrow._exitOffset,
      y: headScreen.y + dir.dy * CELL_SIZE * arrow._exitOffset,
    };

    const tail = segments[0];
    const tailScreen = this.gridToScreen(tail.x, tail.y);
    const nextTailScreen = segments.length > 1
      ? this.gridToScreen(segments[1].x, segments[1].y)
      : newHeadScreen;

    this.addAnim({
      duration: MOVE_DURATION,
      onFrame: (progress) => {
        const g = arrow.graphics;
        if (!g) return;
        g.clear();
        g.x = 0;
        g.y = 0;

        const color = arrow.color;
        // Head extends further off-screen
        const currentHeadX = currentHeadBase.x + (newHeadScreen.x - currentHeadBase.x) * progress;
        const currentHeadY = currentHeadBase.y + (newHeadScreen.y - currentHeadBase.y) * progress;
        // Tail retracts
        const currentTailX = tailScreen.x + (nextTailScreen.x - tailScreen.x) * progress;
        const currentTailY = tailScreen.y + (nextTailScreen.y - tailScreen.y) * progress;

        // Build path: tail → middle segments → head → current extended head
        const pts = [];
        pts.push({ x: currentTailX, y: currentTailY });
        for (let i = 1; i < segments.length - 1; i++) {
          pts.push(this.gridToScreen(segments[i].x, segments[i].y));
        }
        if (segments.length > 1) {
          pts.push(headScreen);
        }
        pts.push({ x: currentHeadX, y: currentHeadY });

        // Draw line
        if (pts.length > 1) {
          g.lineStyle(3, color, 1);
          g.beginPath();
          g.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            g.lineTo(pts[i].x, pts[i].y);
          }
          g.strokePath();
        }

        // Tail circle
        g.fillStyle(color, 1);
        g.fillCircle(pts[0].x, pts[0].y, 4);

        // Arrowhead at extended head
        const size = ARROWHEAD_SIZE;
        const tipX = currentHeadX + dir.dx * (size + 4);
        const tipY = currentHeadY + dir.dy * (size + 4);
        const perpX = -dir.dy;
        const perpY = dir.dx;
        g.fillTriangle(
          tipX, tipY,
          currentHeadX + perpX * size * 0.45, currentHeadY + perpY * size * 0.45,
          currentHeadX - perpX * size * 0.45, currentHeadY - perpY * size * 0.45
        );
      },
      onComplete: () => {
        // Remove tail from grid
        const removedTail = segments.shift();
        if (this.inBounds(removedTail.x, removedTail.y)) {
          this.grid[removedTail.y][removedTail.x] = 0;
        }

        if (segments.length === 0) {
          delete arrow._exitOffset;
          this.finishArrowRemoval(arrow);
        } else {
          // Continue exit - don't redraw static, just continue animation
          this.doExitStep(arrow);
        }
      },
    });
  }

  /**
   * Handle collision
   */
  handleCollision(arrow) {
    const dir = arrow.direction;
    const segments = arrow.segments;
    const head = segments[segments.length - 1];
    const headScreen = this.gridToScreen(head.x, head.y);

    const bumpTarget = {
      x: headScreen.x + dir.dx * CELL_SIZE * 0.4,
      y: headScreen.y + dir.dy * CELL_SIZE * 0.4,
    };

    this.addAnim({
      duration: MOVE_DURATION * 0.5,
      onFrame: (progress) => {
        const g = arrow.graphics;
        if (!g) return;
        g.clear();
        g.x = 0;
        g.y = 0;

        const color = arrow.color;
        const currentHeadX = headScreen.x + (bumpTarget.x - headScreen.x) * progress;
        const currentHeadY = headScreen.y + (bumpTarget.y - headScreen.y) * progress;

        const pts = segments.map(seg => this.gridToScreen(seg.x, seg.y));
        pts[pts.length - 1] = { x: currentHeadX, y: currentHeadY };

        g.lineStyle(3, color, 1);
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          g.lineTo(pts[i].x, pts[i].y);
        }
        g.strokePath();

        g.fillStyle(color, 1);
        g.fillCircle(pts[0].x, pts[0].y, 4);

        const size = ARROWHEAD_SIZE;
        const tipX = currentHeadX + dir.dx * (size + 4);
        const tipY = currentHeadY + dir.dy * (size + 4);
        const perpX = -dir.dy;
        const perpY = dir.dx;
        g.fillTriangle(
          tipX, tipY,
          currentHeadX + perpX * size * 0.45, currentHeadY + perpY * size * 0.45,
          currentHeadX - perpX * size * 0.45, currentHeadY - perpY * size * 0.45
        );
      },
      onComplete: () => {
        // Turn red
        arrow.color = 0xff0000;
        const g = arrow.graphics;
        g.clear();
        g.x = 0;
        g.y = 0;
        const pts = segments.map(seg => this.gridToScreen(seg.x, seg.y));
        pts[pts.length - 1] = bumpTarget;
        g.lineStyle(3, 0xff0000, 1);
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          g.lineTo(pts[i].x, pts[i].y);
        }
        g.strokePath();
        g.fillStyle(0xff0000, 1);
        g.fillCircle(pts[0].x, pts[0].y, 4);
        const size = ARROWHEAD_SIZE;
        const tipX = bumpTarget.x + dir.dx * (size + 4);
        const tipY = bumpTarget.y + dir.dy * (size + 4);
        const perpX = -dir.dy;
        const perpY = dir.dx;
        g.fillTriangle(
          tipX, tipY,
          bumpTarget.x + perpX * size * 0.45, bumpTarget.y + perpY * size * 0.45,
          bumpTarget.x - perpX * size * 0.45, bumpTarget.y - perpY * size * 0.45
        );

        // Pause, then retreat
        this.scheduleCallback(200, () => {
          for (const seg of arrow.segments) {
            if (this.inBounds(seg.x, seg.y)) {
              this.grid[seg.y][seg.x] = 0;
            }
          }
          arrow.segments = arrow.savedSegments.map(s => ({ ...s }));
          for (const seg of arrow.segments) {
            this.grid[seg.y][seg.x] = arrow.id;
          }

          const origHeadScreen = this.gridToScreen(
            arrow.segments[arrow.segments.length - 1].x,
            arrow.segments[arrow.segments.length - 1].y
          );

          this.addAnim({
            duration: RETREAT_DURATION,
            onFrame: (progress) => {
              const g2 = arrow.graphics;
              if (!g2) return;
              g2.clear();
              g2.x = 0;
              g2.y = 0;

              const curHeadX = bumpTarget.x + (origHeadScreen.x - bumpTarget.x) * progress;
              const curHeadY = bumpTarget.y + (origHeadScreen.y - bumpTarget.y) * progress;

              const pts2 = arrow.segments.map(seg => this.gridToScreen(seg.x, seg.y));
              pts2[pts2.length - 1] = { x: curHeadX, y: curHeadY };

              g2.lineStyle(3, 0xff0000, 1);
              g2.beginPath();
              g2.moveTo(pts2[0].x, pts2[0].y);
              for (let i = 1; i < pts2.length; i++) {
                g2.lineTo(pts2[i].x, pts2[i].y);
              }
              g2.strokePath();
              g2.fillStyle(0xff0000, 1);
              g2.fillCircle(pts2[0].x, pts2[0].y, 4);

              const sz = ARROWHEAD_SIZE;
              const tX = curHeadX + dir.dx * (sz + 4);
              const tY = curHeadY + dir.dy * (sz + 4);
              const pX = -dir.dy;
              const pY = dir.dx;
              g2.fillTriangle(
                tX, tY,
                curHeadX + pX * sz * 0.45, curHeadY + pY * sz * 0.45,
                curHeadX - pX * sz * 0.45, curHeadY - pY * sz * 0.45
              );
            },
            onComplete: () => {
              arrow.color = arrow.originalColor;
              arrow.state = 'idle';
              arrow.graphics.x = 0;
              arrow.graphics.y = 0;
              this.renderArrowToGraphics(arrow);

              this.failures++;
              this.updateHUD();

              if (this.failures >= MAX_FAILURES) {
                this.gameOver(false);
              }
            },
          });
        });
      },
    });
  }

  finishArrowRemoval(arrow) {
    arrow.state = 'removed';
    if (arrow.graphics) {
      arrow.graphics.destroy();
      arrow.graphics = null;
    }
    this.updateHUD();
    this.checkWin();
  }

  // ===== WIN/LOSE =====

  checkWin() {
    const remaining = this.arrows.filter(a => a.state !== 'removed');
    if (remaining.length === 0) {
      this.gameOver(true);
    }
  }

  gameOver(isWin) {
    if (this.status !== 'playing') return;
    this.status = isWin ? 'win' : 'lose';

    this.scheduleCallback(300, () => {
      this.showGameOverUI(isWin);
    });
  }

  showGameOverUI(isWin) {
    const overlay = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x000000, 0.7);
    overlay.setDepth(300);

    const title = isWin ? '🎉 恭喜通关！' : '💔 游戏结束';
    this.add.text(WIDTH / 2, HEIGHT / 2 - 60, title, {
      fontSize: '32px',
      color: '#ffffff',
      fontFamily: 'Arial',
    }).setOrigin(0.5).setDepth(301);

    const statsStr = isWin
      ? `用时: ${COUNTDOWN_SECONDS - this.countdown}秒`
      : this.countdown <= 0 ? '时间耗尽' : `失败次数: ${this.failures}/${MAX_FAILURES}`;

    this.add.text(WIDTH / 2, HEIGHT / 2 - 10, statsStr, {
      fontSize: '18px',
      color: '#cccccc',
    }).setOrigin(0.5).setDepth(301);

    const btnBg = this.add.rectangle(WIDTH / 2, HEIGHT / 2 + 60, 160, 50, 0x4ecdc4, 1);
    btnBg.setDepth(301);
    btnBg.setInteractive({ useHandCursor: true });

    this.add.text(WIDTH / 2, HEIGHT / 2 + 60, '再来一局', {
      fontSize: '22px',
      color: '#1a1a2e',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(302);

    btnBg.on('pointerdown', () => {
      if (this.countdownTimer) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
      this.scene.restart();
    });
  }
}
