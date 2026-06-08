// 《抓大鹅》Day 5 · 入口
//
// 创建 Babylon Engine、绑定 canvas（浏览器 / 微信小游戏两套兼容）

import { GameScene } from './scene/GameScene.js';

function getCanvas() {
  // 微信小游戏：window.canvas / GameGlobal.canvas
  if (typeof GameGlobal !== 'undefined' && GameGlobal.canvas) return GameGlobal.canvas;
  if (typeof window !== 'undefined' && window.canvas) return window.canvas;
  // 浏览器：取 #renderCanvas
  if (typeof document !== 'undefined') {
    return document.getElementById('renderCanvas');
  }
  return null;
}

function getViewportSize() {
  if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
    const info = wx.getSystemInfoSync();
    return {
      width: info.windowWidth || info.screenWidth || 375,
      height: info.windowHeight || info.screenHeight || 667,
      dpr: info.pixelRatio || 1,
    };
  }
  if (typeof window !== 'undefined') {
    return {
      width: window.innerWidth || 375,
      height: window.innerHeight || 667,
      dpr: window.devicePixelRatio || 1,
    };
  }
  return { width: 375, height: 667, dpr: 1 };
}

export class Main {
  constructor() {
    const canvas = getCanvas();
    if (!canvas) {
      console.error('[Main] no canvas');
      return;
    }
    const vp = getViewportSize();
    console.log('[Main] viewport', vp);

    // Babylon Engine：用 WebGL2 优先，失败回退 WebGL1
    const engineOpts = {
      preserveDrawingBuffer: true,
      stencil: true,
      antialias: true,
      adaptToDeviceRatio: true,
    };
    let engine;
    try {
      engine = new BABYLON.Engine(canvas, true, engineOpts, true);
    } catch (e) {
      console.error('[Main] BABYLON.Engine create failed', e);
      return;
    }

    // 浏览器：监听窗口大小变化
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', () => engine.resize());
    }

    this.engine = engine;
    this.canvas = canvas;
    this.scene = new GameScene(engine, canvas);
    this.scene.create().catch((e) => console.error('[Main] scene create failed', e));
  }
}

// 浏览器环境（非微信小游戏）：自动启动
// 微信小游戏由 game.js 显式 `new Main()`，此处不会重复触发（因为微信小游戏没有 document）
if (typeof document !== 'undefined' && typeof wx === 'undefined') {
  // 等 BABYLON 全局加载完毕（<script src="...babylon.js"> 是同步的，到 module 解析时已就绪）
  // eslint-disable-next-line no-new
  new Main();
}
