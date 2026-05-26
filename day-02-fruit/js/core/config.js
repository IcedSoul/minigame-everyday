// Day 2 Fruit Match - Constants

// 6-color palette for fruits
export const FRUIT_COLORS = [
  0xe63946, // red
  0xf4a261, // orange
  0xe9c46a, // yellow
  0x2a9d8f, // green
  0x6a4c93, // purple
  0xe76f51, // coral
];
export const FRUIT_COLOR_NAMES = ['red', 'orange', 'yellow', 'green', 'purple', 'coral'];

// Fruit visuals & physics
// The visual display diameter is 44px (image scaled to 44×44), but we use a
// slightly smaller physics radius so that fruits appear to touch/overlap
// visually rather than having a visible gap between them.
export const FRUIT_RADIUS = 20;
export const FRUIT_DISPLAY_SIZE = 44; // visual diameter (px)
// Poisson min center distance based on DISPLAY size (not physics) to avoid
// visual overlap at spawn time.
export const FRUIT_MIN_DIST = FRUIT_DISPLAY_SIZE + 2;

// Level: 6 colors x 4 pairs x 2 = 48 fruits
export const FRUIT_PAIRS_PER_COLOR = 4;
export const TOTAL_FRUITS = FRUIT_COLORS.length * FRUIT_PAIRS_PER_COLOR * 2;

// Channel & funnel sizing.
// CHANNEL_WIDTH is calibrated to the painted grass gap in the background
// image (assets/bg_stage.png) so the visible grass inner edges line up with
// the physics walls exactly. Measured value (after the source bg is
// resized 1:1 to 390x844): inner gap = 67 px.
export const CHANNEL_WIDTH = 67;
export const WALL_THICK = 8;

// Channel capacity: > CHANNEL_LIMIT (i.e. >= 5) for longer than LOSE_GRACE_MS
// without being resolved by the dissolve logic => the channel is jammed => lose.
export const CHANNEL_LIMIT = 4;
export const LOSE_GRACE_MS = 800;

// Dissolve cooldown / animation duration
export const DISSOLVE_DURATION = 250; // ms
export const DISSOLVE_COOLDOWN = 250; // ms

// Float layout safety zone (vertical)
export const FLOAT_TOP_RATIO = 0.06;     // top reserved for HUD
export const FLOAT_BOTTOM_RATIO = 0.6;   // float fruits live above this y ratio

// Funnel geometry (relative to height) — calibrated to match the painted
// grass V-shape in the background image after it has been resized to the
// game viewport.
//   funnel top    y ~ 536 / 844 ~ 0.635   (grass first appears at the edges)
//   funnel bottom y ~ 640 / 844 ~ 0.758   (grass inner edges become parallel)
export const FUNNEL_TOP_RATIO = 0.635;
export const FUNNEL_BOTTOM_RATIO = 0.758;
export const CHANNEL_BOTTOM_RATIO = 1.0; // channel reaches the bottom of the viewport

// Misc
export const SPAWN_MAX_ATTEMPTS = 80;
