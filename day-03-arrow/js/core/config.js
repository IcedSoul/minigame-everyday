/**
 * Game configuration constants
 */

// Grid settings
export const GRID_COLS = 9;
export const GRID_ROWS = 12;
export const CELL_SIZE = 36;
export const DOT_RADIUS = 3;

// Arrow settings - fill all grid points
export const MIN_ARROWS = 20;
export const MAX_ARROWS = 50;
export const MIN_LENGTH = 2;
export const MAX_LENGTH = 4;

// Animation timing (ms)
export const MOVE_DURATION = 100;
export const RETREAT_DURATION = 200;
export const COLLISION_FLASH_DURATION = 200;

// Gameplay
export const MAX_FAILURES = 3;
export const COUNTDOWN_SECONDS = 120;

// Directions
export const DIR = {
  UP:    { dx: 0, dy: -1, label: '↑', angle: -Math.PI / 2 },
  DOWN:  { dx: 0, dy: 1,  label: '↓', angle: Math.PI / 2 },
  LEFT:  { dx: -1, dy: 0, label: '←', angle: Math.PI },
  RIGHT: { dx: 1, dy: 0,  label: '→', angle: 0 },
};

export const ALL_DIRS = [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT];

// Colors for arrows (all dark/black tones for clean look)
export const ARROW_COLORS = [
  0x222222,
  0x333333,
  0x1a1a1a,
  0x2a2a2a,
  0x181818,
  0x252525,
  0x202020,
  0x2e2e2e,
  0x1c1c1c,
  0x282828,
  0x242424,
  0x303030,
];

// Visual
export const BG_COLOR = '#f5f0e8';
export const DOT_COLOR = 0xcccccc;
export const GRID_LINE_ALPHA = 0.15;
export const ARROWHEAD_SIZE = 10;

// Zoom settings
export const MIN_ZOOM = 1.0;
export const MAX_ZOOM = 2.5;
export const DEFAULT_ZOOM = 1.0;
