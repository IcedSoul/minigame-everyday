import { GameScene } from './scene/GameScene.js';

// 微信小游戏环境用 wx.getSystemInfoSync()；浏览器用 window
function getViewport() {
  if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
    const info = wx.getSystemInfoSync();
    return {
      dpr: info.pixelRatio || 1,
      width: info.windowWidth || info.screenWidth || 375,
      height: info.windowHeight || info.screenHeight || 667,
    };
  }
  if (typeof window !== 'undefined') {
    return {
      dpr: window.devicePixelRatio || 1,
      width: window.innerWidth || 375,
      height: window.innerHeight || 667,
    };
  }
  return { dpr: 1, width: 375, height: 667 };
}

const vp = getViewport();
export const DPR = Number(vp.dpr.toFixed(1));
// 微信小游戏环境：canvas 大小由平台决定，Phaser 内部以 css 像素绘制更稳
export const WIDTH = Math.round(vp.width);
export const HEIGHT = Math.round(vp.height);

export class Main {
  constructor() {
    const config = {
      type: Phaser.CANVAS,
      parent: 'phaser-example',
      scene: [GameScene],
      scale: {
        mode: Phaser.Scale.NONE,
        width: WIDTH,
        height: HEIGHT,
      },
      render: {
        pixelArt: false,
        roundPixels: true,
      },
      backgroundColor: '#2d3142',
      fps: {
        target: 60,
        forceSetTimeOut: true,
      },
    };

    if (typeof window !== 'undefined' && window.canvas) {
      config.canvas = window.canvas;
    } else if (typeof GameGlobal !== 'undefined' && GameGlobal.canvas) {
      config.canvas = GameGlobal.canvas;
    }

    // eslint-disable-next-line no-new
    new Phaser.Game(config);
  }
}
