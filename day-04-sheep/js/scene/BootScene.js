// BootScene: preload all image assets before starting the game

import { CARD_TYPES, TYPE_ICON_KEYS } from '../core/config.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    console.log('[BootScene] preload start');

    // Base path for processed assets
    const base = 'assets/processed';

    // Background
    this.load.image('bg_grass', `${base}/bg_grass.jpg`);

    // Card frame (square green card base)
    this.load.image('card_frame', `${base}/card_frame.png`);

    // Slot background
    this.load.image('slot_bg', `${base}/slot_bg.png`);

    // 12 vegetable/fruit icons
    for (let i = 0; i < CARD_TYPES; i++) {
      this.load.image(TYPE_ICON_KEYS[i], `${base}/${TYPE_ICON_KEYS[i]}.png`);
    }

    console.log('[BootScene] preload queued');
  }

  create() {
    console.log('[BootScene] create -> starting GameScene');
    this.scene.start('GameScene');
  }
}
