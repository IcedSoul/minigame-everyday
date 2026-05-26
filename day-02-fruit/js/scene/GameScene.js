import { WIDTH, HEIGHT } from '../main.js';
import {
  FRUIT_COLORS,
  FRUIT_COLOR_NAMES,
  FRUIT_RADIUS,
  FRUIT_DISPLAY_SIZE,
  FRUIT_MIN_DIST,
  FRUIT_PAIRS_PER_COLOR,
  TOTAL_FRUITS,
  CHANNEL_WIDTH,
  WALL_THICK,
  CHANNEL_LIMIT,
  LOSE_GRACE_MS,
  DISSOLVE_DURATION,
  DISSOLVE_COOLDOWN,
  FLOAT_TOP_RATIO,
  FLOAT_BOTTOM_RATIO,
  FUNNEL_TOP_RATIO,
  FUNNEL_BOTTOM_RATIO,
  CHANNEL_BOTTOM_RATIO,
  SPAWN_MAX_ATTEMPTS,
} from '../core/config.js';

// ---- Helpers ----------------------------------------------------------------
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---- Scene ------------------------------------------------------------------
export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });

    /** @type {Phaser.GameObjects.Image[]} */
    this.fruits = [];
    this.channelFruits = new Set(); // ids of fruits currently in channel
    this.lastDissolveAt = 0;
    this.gameOver = false;
    this.win = false;
    this.dissolving = new Set(); // body ids currently dissolving
    this.overflowSince = 0; // timestamp when channel first exceeded CHANNEL_LIMIT

    // World geometry (computed in create)
    this.geo = null;
  }

  // -------------------------------------------------------------------------
  preload() {
    // Load real fruit + background art (sliced/composed from AI sources by
    // tools/slice_assets.py).
    FRUIT_COLOR_NAMES.forEach((name) => {
      this.load.image(`fruit_${name}`, `assets/fruit_${name}.png`);
    });
    this.load.image('bg_stage', 'assets/bg_stage.png');

    // Fallback: if any image fails to load (e.g. asset missing), fall back to
    // procedurally-drawn solid-color circles so the game still runs.
    this.load.once('complete', () => {
      FRUIT_COLOR_NAMES.forEach((name, idx) => {
        const key = `fruit_${name}`;
        if (!this.textures.exists(key)) {
          this.makeFallbackFruitTexture(key, FRUIT_COLORS[idx]);
        }
      });
    });
    this.load.on('loaderror', (_file) => { /* silently ignore */ });

    this.generateDissolveDot();
  }

  makeFallbackFruitTexture(key, color) {
    const r = FRUIT_DISPLAY_SIZE / 2;
    const size = FRUIT_DISPLAY_SIZE;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(color, 1);
    g.fillCircle(r, r, r);
    g.fillStyle(0xffffff, 0.35);
    g.beginPath();
    g.arc(r - r * 0.3, r - r * 0.3, r * 0.4, 0, Math.PI * 2);
    g.fillPath();
    g.generateTexture(key, size, size);
    g.destroy();
  }

  generateDissolveDot() {
    if (this.textures.exists('dissolve_dot')) return;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture('dissolve_dot', 8, 8);
    g.destroy();
  }

  // -------------------------------------------------------------------------
  create() {
    // Reset all per-run state. scene.restart() reuses the GameScene instance
    // (constructor is NOT called again), so any stale arrays/sets/timers from
    // the previous run must be cleared here — otherwise we keep references to
    // destroyed GameObjects whose .body is now undefined.

    // Fallback: if shutdown handler didn't run (first create), clear world.
    const M = Phaser.Physics.Matter.Matter;
    if (M && M.Composite && this.matter && this.matter.world && this.matter.world.localWorld) {
      M.Composite.clear(this.matter.world.localWorld, false, true);
    }

    this.fruits = [];
    this.channelFruits = new Set();
    this.dissolving = new Set();
    this.lastDissolveAt = 0;
    this.gameOver = false;
    this.win = false;
    this.overflowSince = 0;
    this.remaining = 0;
    this.touchingPairs = new Set();

    this.cameras.main.setBackgroundColor('#bde0fe');

    this.computeGeometry();
    this.drawBackdrop();
    try {
      this.buildStaticBodies();
      this.spawnFruits();
      this.bindInput();
      this.bindCollisions();
      this.buildHud();
      // Native setInterval works reliably in this WX-mini-game sandbox; the
      // Phaser TimerEvent variant did not fire here. Make sure to clear it on
      // scene shutdown / destroy so a stale interval doesn't keep ticking
      // against destroyed fruits after scene.restart().
      if (this.tickIntervalId) clearInterval(this.tickIntervalId);
      this.tickIntervalId = setInterval(() => this.tickRules(), 200);
      this.events.once('shutdown', () => {
        if (this.tickIntervalId) {
          clearInterval(this.tickIntervalId);
          this.tickIntervalId = null;
        }
        // Remove all standalone Matter bodies BEFORE the scene shuts down,
        // while this.matter.world is still valid. Phaser will handle
        // destroying the Image GameObjects from the display list.
        if (this.fruits) {
          for (let i = 0; i < this.fruits.length; i++) {
            const f = this.fruits[i];
            if (!f || !f.body) continue;
            try {
              if (this.matter && this.matter.world) {
                this.matter.world.remove(f.body);
              }
            } catch (_e) { /* body already removed */ }
            f.body = null;
          }
        }
        // Clear the entire Matter world (walls, etc.) so nothing persists.
        const Mx = Phaser.Physics.Matter.Matter;
        if (Mx && Mx.Composite && this.matter && this.matter.world && this.matter.world.localWorld) {
          Mx.Composite.clear(this.matter.world.localWorld, false, true);
        }
      });
      this.events.once('destroy', () => {
        if (this.tickIntervalId) {
          clearInterval(this.tickIntervalId);
          this.tickIntervalId = null;
        }
      });
    } catch (e) {
      console.error('[GameScene create error]', e && e.message);
    }
  }

  // -------------------------------------------------------------------------
  computeGeometry() {
    const w = WIDTH;
    const h = HEIGHT;

    // Float region (where suspended fruits live)
    const floatTop = h * FLOAT_TOP_RATIO + 60; // leave room for HUD
    const floatBottom = h * FLOAT_BOTTOM_RATIO;

    // Funnel: two diagonal walls forming a "Y" that converges to channel top
    const funnelTopY = h * FUNNEL_TOP_RATIO;
    const funnelBottomY = h * FUNNEL_BOTTOM_RATIO;
    const channelHalfWidth = CHANNEL_WIDTH / 2;
    const cx = w / 2;

    // Channel: vertical column from funnelBottomY down to channelBottom
    const channelTopY = funnelBottomY;
    const channelBottomY = h * CHANNEL_BOTTOM_RATIO;

    this.geo = {
      w, h,
      floatTop, floatBottom,
      funnelTopY, funnelBottomY,
      channelTopY, channelBottomY,
      channelLeft: cx - channelHalfWidth,
      channelRight: cx + channelHalfWidth,
      cx,
    };
  }

  drawBackdrop() {
    const { w, h, funnelTopY, funnelBottomY, channelLeft, channelRight } = this.geo;

    if (this.textures.exists('bg_stage')) {
      // Stretch the pre-composed background image to the exact game viewport.
      // The image was authored with the same funnel ratios used here, so the
      // visual grass edges align with the physical funnel walls.
      const bg = this.add.image(w / 2, h / 2, 'bg_stage');
      bg.setDisplaySize(w, h);
      bg.setDepth(-100);
      return;
    }

    // -------- Fallback (no asset): draw the original flat backdrop --------
    const sky = this.add.graphics();
    sky.fillStyle(0xbde0fe, 1);
    sky.fillRect(0, 0, w, h);

    const wall = this.add.graphics();
    wall.fillStyle(0x6c3a1f, 1);
    wall.beginPath();
    wall.moveTo(0, funnelTopY);
    wall.lineTo(channelLeft, funnelBottomY);
    wall.lineTo(channelLeft, h);
    wall.lineTo(0, h);
    wall.closePath();
    wall.fillPath();
    wall.beginPath();
    wall.moveTo(w, funnelTopY);
    wall.lineTo(channelRight, funnelBottomY);
    wall.lineTo(channelRight, h);
    wall.lineTo(w, h);
    wall.closePath();
    wall.fillPath();
  }

  buildStaticBodies() {
    const { w, h, funnelTopY, funnelBottomY, channelTopY, channelBottomY, channelLeft, channelRight, cx } = this.geo;
    const halfWall = WALL_THICK / 2;

    // ---------------------------------------------------------------------
    // Geometry strategy (simple & correct):
    //   Wall CENTERLINE sits exactly on the visible grass edge. The wall
    //   thickness (WALL_THICK=8) extends 4px to each side. So:
    //     - Inner face protrudes 4px into the channel/funnel interior.
    //     - Effective channel inner width = CHANNEL_WIDTH - WALL_THICK
    //       = 67 - 8 = 59px. Fruit physics diameter = 40px → 19px margin.
    //     - Fruits visually (44px display) will appear to almost touch the
    //       grass edge (only 4px gap from inner face to grass visual edge
    //       is invisible because the wall IS the grass edge).
    // ---------------------------------------------------------------------

    // ---- Channel side walls (vertical) ---------------------------------
    const sideWallTop = channelTopY - WALL_THICK;
    const sideWallBottom = h;
    const sideWallH = sideWallBottom - sideWallTop;
    const sideWallCY = (sideWallTop + sideWallBottom) / 2;
    this.matter.add.rectangle(channelLeft, sideWallCY, WALL_THICK, sideWallH, {
      isStatic: true,
      friction: 0.3,
      frictionStatic: 0.5,
      restitution: 0.0,
      label: 'channel-left',
    });
    this.matter.add.rectangle(channelRight, sideWallCY, WALL_THICK, sideWallH, {
      isStatic: true,
      friction: 0.3,
      frictionStatic: 0.5,
      restitution: 0.0,
      label: 'channel-right',
    });

    // ---- Funnel diagonal walls (centerline = visible grass slope) ------
    // Friction = 0 so fruits slide smoothly down the slope without jittering.
    const buildDiagonal = (x0, y0, x1, y1, label) => {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const cxw = (x0 + x1) / 2;
      const cyw = (y0 + y1) / 2;
      this.matter.add.rectangle(cxw, cyw, len + WALL_THICK * 2, WALL_THICK, {
        isStatic: true,
        angle,
        friction: 0.0,
        frictionStatic: 0.0,
        restitution: 0.0,
        label,
      });
    };
    buildDiagonal(0, funnelTopY, channelLeft, funnelBottomY, 'funnel-left');
    buildDiagonal(w, funnelTopY, channelRight, funnelBottomY, 'funnel-right');

    // ---- Channel bottom -----------------------------------------------
    this.matter.add.rectangle(
      cx,
      h + halfWall,
      (channelRight - channelLeft) + WALL_THICK * 2,
      WALL_THICK,
      {
        isStatic: true,
        friction: 0.3,
        frictionStatic: 0.5,
        restitution: 0.0,
        label: 'channel-bottom',
      },
    );

    // ---- Outer world bounds (catch-all) -------------------------------
    this.matter.add.rectangle(-halfWall, h / 2, WALL_THICK, h, { isStatic: true, label: 'world-left' });
    this.matter.add.rectangle(w + halfWall, h / 2, WALL_THICK, h, { isStatic: true, label: 'world-right' });
    this.matter.add.rectangle(w / 2, -halfWall, w, WALL_THICK, { isStatic: true, label: 'world-top' });


  }

  // -------------------------------------------------------------------------
  /** Build a balanced list of color indices: 4 pairs × 2 per color, then shuffle. */
  buildColorBag() {
    const bag = [];
    for (let i = 0; i < FRUIT_COLORS.length; i += 1) {
      for (let p = 0; p < FRUIT_PAIRS_PER_COLOR; p += 1) {
        bag.push(i, i); // a pair
      }
    }
    return shuffle(bag);
  }

  /** Poisson-ish disk sampling within float region; falls back to a jittered grid to ensure exact count. */
  generatePositions(count) {
    const { w, floatTop, floatBottom } = this.geo;
    const positions = [];
    const left = FRUIT_DISPLAY_SIZE / 2 + 6;
    const right = w - FRUIT_DISPLAY_SIZE / 2 - 6;
    let attempts = 0;
    while (positions.length < count && attempts < count * SPAWN_MAX_ATTEMPTS) {
      attempts += 1;
      const x = left + Math.random() * (right - left);
      const y = floatTop + Math.random() * (floatBottom - floatTop);
      let ok = true;
      for (let i = 0; i < positions.length; i += 1) {
        const dx = x - positions[i].x;
        const dy = y - positions[i].y;
        if (dx * dx + dy * dy < FRUIT_MIN_DIST * FRUIT_MIN_DIST) {
          ok = false;
          break;
        }
      }
      if (ok) positions.push({ x, y });
    }

    // Fallback: relaxed min-distance to fill remaining slots
    if (positions.length < count) {
      const relaxed = (FRUIT_DISPLAY_SIZE + 1) * (FRUIT_DISPLAY_SIZE + 1);
      let safety = 0;
      while (positions.length < count && safety < count * 200) {
        safety += 1;
        const x = left + Math.random() * (right - left);
        const y = floatTop + Math.random() * (floatBottom - floatTop);
        let ok = true;
        for (let i = 0; i < positions.length; i += 1) {
          const dx = x - positions[i].x;
          const dy = y - positions[i].y;
          if (dx * dx + dy * dy < relaxed) {
            ok = false;
            break;
          }
        }
        if (ok) positions.push({ x, y });
      }
    }

    return positions;
  }

  spawnFruits() {
    const bag = this.buildColorBag();
    const positions = this.generatePositions(TOTAL_FRUITS);
    const n = Math.min(bag.length, positions.length);

    const M = Phaser.Physics.Matter.Matter;

    // ------------------------------------------------------------------
    // CRITICAL: decouple Matter body from the image's texture size.
    //
    // The fruit PNGs are 88x88 (2x scale, drawn that way for crispness).
    // If we use `matter.add.image(...)` with a circle shape config, the
    // resulting body radius depends on Phaser-Matter's internals and in
    // some cases ends up tied to the texture size, NOT to our
    // `shape.radius`. That is exactly the bug we were chasing — visual
    // size and body size drifted apart, so two fruits that *looked*
    // overlapped were physically far apart (and vice versa).
    //
    // Fix: create the renderer (this.add.image) and the body
    // (this.matter.add.circle) independently. We then sync the image's
    // position to the body each frame in update(). Now `FRUIT_RADIUS`
    // unambiguously controls BOTH the visual size (via setDisplaySize)
    // AND the physics radius (via matter.add.circle's first arg).
    // ------------------------------------------------------------------
    const bodyOptions = {
      friction: 0.1,
      frictionStatic: 0.2,
      frictionAir: 0.03,
      restitution: 0.0,
      density: 0.002,
      slop: 0.05,
      sleepThreshold: 30,
      label: 'fruit',
    };

    for (let i = 0; i < n; i += 1) {
      const colorIdx = bag[i];
      const { x, y } = positions[i];

      // 1) Render-only image (NOT a Matter image).
      const img = this.add.image(x, y, `fruit_${FRUIT_COLOR_NAMES[colorIdx]}`);
      img.setDisplaySize(FRUIT_DISPLAY_SIZE, FRUIT_DISPLAY_SIZE);
      img.setOrigin(0.5, 0.5);

      // 2) Standalone circle body — radius is exactly FRUIT_RADIUS.
      const body = this.matter.add.circle(x, y, FRUIT_RADIUS, bodyOptions);
      // Suspend: make body fully static until clicked.
      if (M && M.Body && M.Body.setStatic) M.Body.setStatic(body, true);
      else body.isStatic = true;

      // Wire image <-> body together.
      img.body = body;          // so existing code that reads fruit.body keeps working
      body.gameObject = img;    // reverse lookup for collision handlers
      img.setData('colorIdx', colorIdx);
      img.setData('state', 'float');
      img.setData('id', i);
      // Helper methods used by existing code (setVelocity).
      img.setVelocity = (vx, vy) => {
        if (M && M.Body && M.Body.setVelocity) {
          M.Body.setVelocity(body, { x: vx, y: vy });
        } else {
          body.velocity.x = vx;
          body.velocity.y = vy;
        }
      };
      this.fruits.push(img);
    }

    this.remaining = this.fruits.length;


  }

  // -------------------------------------------------------------------------
  bindInput() {
    // Use a single global 'pointerdown' and resolve the hit ourselves by
    // measuring the pointer distance to each fruit body center. This avoids
    // any mismatch between Phaser's GameObject hit area and the Matter body
    // center, and guarantees the click area is exactly the visible circle.
    this.input.on('pointerdown', (pointer) => {
      if (this.gameOver) {
        // Manually clean up BEFORE restarting to avoid stale state.
        // 1. Kill the tick interval immediately so it stops firing.
        if (this.tickIntervalId) {
          clearInterval(this.tickIntervalId);
          this.tickIntervalId = null;
        }
        // 2. Destroy all fruit bodies manually.
        if (this.fruits) {
          for (let i = 0; i < this.fruits.length; i++) {
            const f = this.fruits[i];
            if (!f) continue;
            try {
              if (f.body && this.matter && this.matter.world) {
                this.matter.world.remove(f.body);
              }
            } catch (_e) { /* already removed */ }
            f.body = null;
            if (f.active) f.destroy();
          }
          this.fruits = [];
        }
        // 3. Clear the entire Matter world (walls etc).
        const Mx = Phaser.Physics.Matter.Matter;
        if (Mx && Mx.Composite && this.matter && this.matter.world && this.matter.world.localWorld) {
          Mx.Composite.clear(this.matter.world.localWorld, false, true);
        }
        // 4. Restart the scene on next frame to avoid issues with
        //    restarting from within an input callback.
        this.time.delayedCall(0, () => {
          this.scene.restart();
        });
        return;
      }
      const px = pointer.worldX !== undefined ? pointer.worldX : pointer.x;
      const py = pointer.worldY !== undefined ? pointer.worldY : pointer.y;
      // Iterate from the end so visually-on-top fruits win when overlapping.
      const hitR = FRUIT_DISPLAY_SIZE / 2;
      const r2 = hitR * hitR;
      let best = null;
      let bestDist = Infinity;
      for (let i = this.fruits.length - 1; i >= 0; i -= 1) {
        const f = this.fruits[i];
        if (!f || !f.active || !f.body) continue;
        if (f.getData('state') !== 'float') continue;
        const dx = px - f.body.position.x;
        const dy = py - f.body.position.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2 && d2 < bestDist) {
          best = f;
          bestDist = d2;
        }
      }

      if (best) this.releaseFruit(best);
    });
  }

  releaseFruit(fruit) {
    const M = Phaser.Physics.Matter.Matter;
    // Switch from static to dynamic so this fruit can fall.
    if (M && M.Body && M.Body.setStatic) {
      M.Body.setStatic(fruit.body, false);
    } else {
      fruit.body.isStatic = false;
    }
    fruit.body.ignoreGravity = false;
    if (M && M.Sleeping && M.Sleeping.set && fruit.body.isSleeping) {
      M.Sleeping.set(fruit.body, false);
    }
    fruit.setVelocity(0, 0);
    fruit.setData('state', 'falling');
  }

  // -------------------------------------------------------------------------
  // Per-frame: (1) sync each fruit image's position/rotation to its detached
  // Matter body, (2) clamp dynamic fruits' velocity to a safe cap so they
  // never move more than ~one radius per step (cheap CCD against tunnelling).
  update(_t, _dtMs) {
    if (!this.fruits || this.fruits.length === 0) return;
    const VMAX = FRUIT_DISPLAY_SIZE * 0.45;
    for (let i = 0; i < this.fruits.length; i += 1) {
      const f = this.fruits[i];
      if (!f || !f.active || !f.body) continue;
      // Sync render position to physics position (body is now independent
      // of the image, so Phaser won't do this for us).
      f.x = f.body.position.x;
      f.y = f.body.position.y;
      f.rotation = f.body.angle;

      if (f.body.isStatic) continue;
      const v = f.body.velocity;
      if (v.y > VMAX || v.y < -VMAX || v.x > VMAX || v.x < -VMAX) {
        const clampedX = Math.max(-VMAX, Math.min(VMAX, v.x));
        const clampedY = Math.max(-VMAX, Math.min(VMAX, v.y));
        f.setVelocity(clampedX, clampedY);
      }
    }
  }

  // -------------------------------------------------------------------------
  buildHud() {
    const style = { fontSize: '20px', color: '#1d3557', fontStyle: 'bold' };
    this.hudText = this.add.text(16, 16, '', style).setDepth(1000);
    this.statusText = this.add
      .text(WIDTH / 2, HEIGHT * 0.45, '', { fontSize: '36px', color: '#e63946', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(1000);
    this.hintText = this.add
      .text(WIDTH / 2, HEIGHT * 0.5, '', { fontSize: '18px', color: '#1d3557' })
      .setOrigin(0.5)
      .setDepth(1000);
    this.refreshHud();
  }

  refreshHud() {
    if (!this.hudText) return;
    this.hudText.setText(`剩余: ${this.remaining}    通道: ${this.channelFruits.size}/${CHANNEL_LIMIT}`);
  }

  // -------------------------------------------------------------------------
  // The "channel" used for game-rule purposes is intentionally taller than the
  // visible vertical column. Fruits that get jammed at the funnel junction
  // (above the geometric channelTopY) still occupy the channel from a gameplay
  // point of view and must be counted toward CHANNEL_LIMIT — otherwise the
  // 5th / 6th stuck fruit would never trigger a lose state.
  //
  // We define the rule-zone top as channelBottomY - 5.5 * fruit-diameter, so a
  // stack of up to ~5 fruits plus a little slack qualifies as "in channel".
  // Horizontally we also widen the band by one diameter on each side to catch
  // fruits that come to rest against the funnel walls just above the throat.
  isInChannel(fruit) {
    const { channelLeft, channelRight, channelBottomY } = this.geo;
    const diameter = FRUIT_DISPLAY_SIZE;
    const ruleTopY = channelBottomY - 5.5 * diameter;
    const xPad = diameter; // tolerate fruits leaning on the funnel walls
    const x = fruit.body.position.x;
    const y = fruit.body.position.y;
    return x > channelLeft - xPad && x < channelRight + xPad && y > ruleTopY;
  }

  tickRules() {
    if (this.gameOver) return;

    // Update channel membership
    for (let i = 0; i < this.fruits.length; i += 1) {
      const f = this.fruits[i];
      if (!f.active) continue;
      const state = f.getData('state');
      if (state === 'dissolving') continue;
      const inChannel = this.isInChannel(f);
      if (inChannel && state !== 'channel') {
        f.setData('state', 'channel');
        this.channelFruits.add(f.getData('id'));
      } else if (!inChannel && state === 'channel') {
        // shouldn't normally happen but guard
        this.channelFruits.delete(f.getData('id'));
        f.setData('state', 'falling');
      }
    }

    // Try to dissolve adjacent same-color pairs in channel
    this.tryDissolveInChannel();



    // Win check
    if (this.remaining <= 0 && !this.win) {
      this.win = true;
      this.gameOver = true;
      this.statusText.setColor('#2a9d8f').setText('胜利！');
      this.hintText.setText('点击任意处再玩一局');
      return;
    }

    // Lose check: once channel has > CHANNEL_LIMIT fruits, give the dissolver a
    // short grace window. If after that window the count is still over, lose.
    // Reasoning: any adjacent same-color pair would have been removed by
    // tryDissolveInChannel during the grace period; if not, the channel is
    // truly jammed.
    if (this.channelFruits.size > CHANNEL_LIMIT) {
      if (this.overflowSince === 0) {
        this.overflowSince = Date.now();
      } else if (Date.now() - this.overflowSince > LOSE_GRACE_MS) {
        this.gameOver = true;
        this.statusText.setColor('#e63946').setText('失败！');
        this.hintText.setText('点击任意处再玩一局');
      }
    } else {
      this.overflowSince = 0;
    }

    this.refreshHud();
  }

  // Dissolve only happens when two fruits are *physically touching* AND of
  // the same color AND both fruits are inside the channel. The actual
  // contact detection lives in bindCollisions() which records every
  // currently-touching same-color pair into this.touchingPairs. Here we
  // simply pick one such pair (cooldown gated) and dissolve it.
  tryDissolveInChannel() {
    const now = Date.now();
    if (now - this.lastDissolveAt < DISSOLVE_COOLDOWN) return;
    if (!this.touchingPairs || this.touchingPairs.size === 0) return;

    for (const key of this.touchingPairs) {
      const [idA, idB] = key.split('|').map((s) => parseInt(s, 10));
      const a = this.fruits.find((f) => f.getData('id') === idA);
      const b = this.fruits.find((f) => f.getData('id') === idB);
      if (!a || !b || !a.active || !b.active) continue;
      if (a.getData('state') !== 'channel' || b.getData('state') !== 'channel') continue;
      if (a.getData('colorIdx') !== b.getData('colorIdx')) continue;
      // Both must be (nearly) at rest so we don't dissolve mid-bounce.
      const restA = Math.abs(a.body.velocity.y) < 2.0 && Math.abs(a.body.velocity.x) < 2.0;
      const restB = Math.abs(b.body.velocity.y) < 2.0 && Math.abs(b.body.velocity.x) < 2.0;
      if (!restA || !restB) continue;
      this.dissolveTwo(a, b);
      this.lastDissolveAt = now;
      return;
    }
  }

  // ---------------------------------------------------------------------
  // Listen to Matter collision events so we always know which fruit pairs
  // are *actually touching* this frame. We track them in a Set keyed by
  // "smallerId|biggerId" — added on collisionStart, kept across
  // collisionActive ticks, removed on collisionEnd.
  bindCollisions() {
    this.touchingPairs = new Set();
    const pairKey = (idA, idB) => (idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`);
    const fruitOf = (body) => this.fruits.find((f) => f.body === body);

    const handleStart = (event) => {
      const pairs = event.pairs || [];
      for (let i = 0; i < pairs.length; i += 1) {
        const { bodyA, bodyB } = pairs[i];
        if (bodyA.label !== 'fruit' || bodyB.label !== 'fruit') continue;
        const fa = fruitOf(bodyA);
        const fb = fruitOf(bodyB);
        if (!fa || !fb) continue;
        this.touchingPairs.add(pairKey(fa.getData('id'), fb.getData('id')));
      }
    };
    const handleEnd = (event) => {
      const pairs = event.pairs || [];
      for (let i = 0; i < pairs.length; i += 1) {
        const { bodyA, bodyB } = pairs[i];
        if (bodyA.label !== 'fruit' || bodyB.label !== 'fruit') continue;
        const fa = fruitOf(bodyA);
        const fb = fruitOf(bodyB);
        if (!fa || !fb) continue;
        this.touchingPairs.delete(pairKey(fa.getData('id'), fb.getData('id')));
      }
    };
    this.matter.world.on('collisionstart', handleStart);
    this.matter.world.on('collisionend', handleEnd);
    // Clean up on shutdown so the next scene.restart() starts fresh.
    this.events.once('shutdown', () => {
      if (this.matter && this.matter.world) {
        this.matter.world.off('collisionstart', handleStart);
        this.matter.world.off('collisionend', handleEnd);
      }
      if (this.touchingPairs) this.touchingPairs.clear();
    });
  }

  dissolveTwo(a, b) {
    a.setData('state', 'dissolving');
    b.setData('state', 'dissolving');
    this.channelFruits.delete(a.getData('id'));
    this.channelFruits.delete(b.getData('id'));
    // Forget any contact state involving these two so they aren't re-picked.
    if (this.touchingPairs) {
      const idA = a.getData('id');
      const idB = b.getData('id');
      for (const key of [...this.touchingPairs]) {
        const [k1, k2] = key.split('|').map((s) => parseInt(s, 10));
        if (k1 === idA || k2 === idA || k1 === idB || k2 === idB) {
          this.touchingPairs.delete(key);
        }
      }
    }

    // IMPORTANT: do NOT turn the bodies into sensors. We want the two
    // dissolving fruits to KEEP physically blocking newly arriving fruits
    // until they're actually removed — otherwise an incoming fruit can
    // tunnel through the fading pair and end up clipped into the grass /
    // overlapping a third fruit. Freeze them in place by switching to
    // static so they stay perfectly still during the fade.
    const M = Phaser.Physics.Matter.Matter;
    [a, b].forEach((f) => {
      f.setVelocity(0, 0);
      if (M && M.Body && M.Body.setStatic) {
        M.Body.setStatic(f.body, true);
      } else {
        f.body.isStatic = true;
      }
    });

    // Subtle flash + fade-out: two quick alpha blinks, then fade to 0.
    // No scale change — the fruit just twinkles out of existence.
    [a, b].forEach((f) => {
      this.tweens.add({
        targets: f,
        alpha: 0.35,
        duration: 70,
        yoyo: true,
        repeat: 1,
        onComplete: () => {
          this.tweens.add({
            targets: f,
            alpha: 0,
            duration: 110,
            onComplete: () => {
              this.removeFruit(f);
            },
          });
        },
      });
    });
  }

  removeFruit(f) {
    if (!f || !f.active) return;
    if (f.body) {
      this.matter.world.remove(f.body);
      f.body = null; // Clear reference so Phaser's destroy() won't call body.destroy()
    }
    f.destroy();
    this.remaining -= 1;
    this.refreshHud();
  }
}
