import { BootScene } from './scene/BootScene.js';
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
// 限制最大设备像素比（>3 时收益递减且性能成本高）
export const DPR = Math.min(3, Math.max(1, Number(vp.dpr.toFixed(2))));

// CSS 显示尺寸（与屏幕实际尺寸一致）
const CSS_W = Math.round(vp.width);
const CSS_H = Math.round(vp.height);

// 渲染尺寸 = CSS × DPR：游戏代码使用这个尺寸（物理像素）
// 所有场景通过 uiScale = WIDTH / LEVEL_LOGICAL_W 自动适配 DPR
export const WIDTH = Math.round(CSS_W * DPR);
export const HEIGHT = Math.round(CSS_H * DPR);

console.log('[main] viewport', { dpr: DPR, css: `${CSS_W}x${CSS_H}`, render: `${WIDTH}x${HEIGHT}` });

export class Main {
  constructor() {
    const config = {
      // 微信小游戏沙盒要求显式指定渲染类型，不能用 Phaser.AUTO
      type: Phaser.CANVAS,
      parent: 'phaser-example',
      scene: [BootScene, GameScene],
      scale: {
        mode: Phaser.Scale.NONE,
        // 内部 buffer 用 dpr 倍物理像素
        width: WIDTH,
        height: HEIGHT,
        // CSS 缩回逻辑像素（浏览器；微信小游戏 canvas 由平台 fullscreen 处理）
        zoom: 1 / DPR,
      },
      render: {
        pixelArt: false,
        roundPixels: false,
        antialias: true,
        antialiasGL: true,
        mipmapFilter: 'LINEAR_MIPMAP_LINEAR',
      },
      backgroundColor: '#4a8c3f',
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
