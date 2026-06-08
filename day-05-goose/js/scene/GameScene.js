// 《抓大鹅》Day 5 · 主场景
//
// 职责：
//   1. 创建 Babylon Scene、相机、灯光、阴影
//   2. 创建容器（圆柱锅）+ 54 个物品 Mesh，绑定到自写物理 Body
//   3. 主循环：物理 step → 渲染
//   4. 点击 Mesh → 飞向槽位 → 同类聚合 → 三连消除
//   5. 屏幕 GUI：倒计时、剩余/槽位、甩动按钮、底部 7 槽视觉、胜负面板
//   6. 启动 ShakeDetector，把甩动转发给物理
//
// 与 Day 4 的差异：
//   - 渲染由 2D Sprite 换成 3D Mesh
//   - 遮挡判定不再需要（物理位置就是真实位置）
//   - 点击采用 Babylon picking 而不是 hit area
//   - 增加倒计时

import {
  TOTAL_ITEMS,
  ITEM_TYPES,
  ITEM_RADIUS,
  POT_RADIUS,
  POT_BOTTOM_Y,
  POT_RIM_Y,
  GRAVITY,
  PHYSICS_TIMESTEP,
  PHYSICS_MAX_SUBSTEPS,
  CAMERA_ALPHA,
  CAMERA_BETA,
  CAMERA_RADIUS,
  CAMERA_TARGET_Y,
  SLOT_CAPACITY,
  TRIPLE_COUNT,
  TIME_LIMIT_SEC,
  ANIM_FLY_TO_SLOT,
  ANIM_SLOT_SHIFT,
  ANIM_TRIPLE_REMOVE,
  ANIM_SLOT_COMPACT,
  ENABLE_BUTTON_SHAKE,
} from '../core/config.js';
import { generateLevel } from '../core/LevelGenerator.js';
import { createItemMesh, createContainer, createSlotTray } from '../core/ItemFactory.js';
import { PhysicsWorld } from '../core/PhysicsWorld.js';
import { ShakeDetector } from '../core/ShakeDetector.js';

export class GameScene {
  constructor(engine, canvas) {
    this.engine = engine;
    this.canvas = canvas;
    this.scene = null;
    this.camera = null;
    this.shadowGen = null;
    this.physics = null;
    this.shake = null;

    // 运行时状态
    this.items = [];           // [{ id, type, body, mesh, state }]
    this.slot = [];            // 当前槽内 items（最大 7）
    this.status = 'playing';   // playing | win | lose
    this.isAnimating = false;  // 动画中（飞入/消除）锁住点击
    this.timeLeft = TIME_LIMIT_SEC;
    this._physicsAcc = 0;      // 物理步长累积器

    // GUI
    this.gui = null;
    this.txtTimer = null;
    this.txtRemain = null;     // 剩余物品计数
    this.txtSlot = null;       // 槽位占用计数
    this.txtHint = null;
    this.endPanel = null;

    // 3D 卡槽托盘
    this.tray = null;          // { root, slotCenters }
  }

  async create() {
    console.log('[GameScene] create');
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = BABYLON.Color3.FromHexString('#1d3557').toColor4(1);

    this._setupCamera();
    this._setupLights();
    this._setupContainer();
    this._setupSlotTray();
    await this._setupPhysicsAndItems();
    this._setupGUI();
    this._setupPicking();
    this._setupShake();
    this._setupRenderLoop();
  }

  // ───────────── 摄像机 ─────────────
  _setupCamera() {
    const target = new BABYLON.Vector3(0, CAMERA_TARGET_Y, 0);
    this.camera = new BABYLON.ArcRotateCamera(
      'cam',
      CAMERA_ALPHA, CAMERA_BETA, CAMERA_RADIUS,
      target,
      this.scene,
    );
    // 不允许玩家拖拽相机（避免与点击冲突）；后续可放开开发模式
    // this.camera.attachControl(this.canvas, true);
    this.camera.minZ = 0.1;
    this.camera.maxZ = 50;
  }

  _setupLights() {
    // 1) 半球光（环境光）
    const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.65;
    hemi.diffuse = new BABYLON.Color3(1, 1, 1);
    hemi.groundColor = new BABYLON.Color3(0.4, 0.45, 0.55);

    // 2) 主光源（带阴影的方向光）
    const dir = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(-0.6, -1, -0.4), this.scene);
    dir.position = new BABYLON.Vector3(6, 10, 6);
    dir.intensity = 0.85;
    this.shadowGen = new BABYLON.ShadowGenerator(1024, dir);
    this.shadowGen.useBlurExponentialShadowMap = true;
    this.shadowGen.blurKernel = 32;
    this.shadowGen.darkness = 0.35;
  }

  _setupContainer() {
    this.container = createContainer(this.scene);
    // 锅外的地面（接收阴影，给舞台感）
    const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 30, height: 30 }, this.scene);
    ground.position.y = -0.13;
    const gMat = new BABYLON.StandardMaterial('ground_mat', this.scene);
    gMat.diffuseColor = new BABYLON.Color3(0.1, 0.18, 0.28);
    gMat.specularColor = BABYLON.Color3.Black();
    ground.material = gMat;
    ground.receiveShadows = true;
    ground.isPickable = false;
  }

  // ───────────── 3D 卡槽托盘（屏幕底部）─────────────
  _setupSlotTray() {
    // 槽位的世界单位尺寸（与缩到 0.35 后的物品大小匹配）
    // 物品视觉直径 ≈ ITEM_VISUAL_SCALE * 2 * shrinkScale = 0.45*2*0.35 ≈ 0.315
    // 取槽位半径 = 0.32 让物品刚好坐落
    const slotSize = 0.32;
    const spacing = 0.78;
    const tray = createSlotTray(this.scene, SLOT_CAPACITY, slotSize, spacing);
    this.tray = tray;

    // 把托盘放到屏幕底部正中：先放在世界 (0, 0, 0) 处占位，
    // GUI 创建完成后我们会用屏幕反投影把它精确移到底部 UI 上方。
    // 为避免一帧的视觉跳跃，先给个估算位置：
    //   俯视相机 alpha=-PI/2、beta≈0 时，相机在 (0, target.y + radius, 0)，向下看；
    //   屏幕下方 = 世界 +Z 方向（因为相机的 up 向量约等于 -Z）。
    // 我们把托盘挪到 +Z 方向 4.5 单位处，y=0.1（贴近地面），后面 _placeSlotTray() 会精修。
    tray.root.position.set(0, 0.1, 4.5);
    // 让托盘水平躺平，且让"高边"朝向相机（y 轴朝上即默认，无需额外旋转）
  }

  // 把卡槽托盘的位置精确对齐到屏幕底部（由 unproject 计算）
  _placeSlotTray() {
    if (!this.tray) return;
    const canvas = this.canvas;
    const screenW = canvas.clientWidth || canvas.width;
    const screenH = canvas.clientHeight || canvas.height;

    // 屏幕坐标：水平居中、垂直靠近底部（约离底 14%）
    const sx = screenW * 0.5;
    const sy = screenH * 0.86;

    // 用 unproject 把屏幕点投到 y≈0.1 的水平面上
    const world = this._unprojectToYPlane(sx, sy, 0.1);
    if (world && Number.isFinite(world.x) && Number.isFinite(world.z)) {
      this.tray.root.position.copyFrom(world);
    }
  }

  // 把屏幕点 (sx, sy) 投影到 y = yPlane 的水平面上，返回世界坐标
  _unprojectToYPlane(sx, sy, yPlane) {
    const canvas = this.canvas;
    const screenW = canvas.clientWidth || canvas.width;
    const screenH = canvas.clientHeight || canvas.height;

    const ndcX = (sx / screenW) * 2 - 1;
    const ndcY = 1 - (sy / screenH) * 2;

    const matVP = this.scene.getTransformMatrix();
    const matInv = BABYLON.Matrix.Invert(matVP);

    const near = BABYLON.Vector3.TransformCoordinates(
      new BABYLON.Vector3(ndcX, ndcY, 0), matInv);
    const far = BABYLON.Vector3.TransformCoordinates(
      new BABYLON.Vector3(ndcX, ndcY, 1), matInv);

    // 射线方向
    const dir = far.subtract(near);
    if (Math.abs(dir.y) < 1e-6) return null; // 与水平面平行
    const t = (yPlane - near.y) / dir.y;
    if (t < 0) return null;
    return new BABYLON.Vector3(
      near.x + dir.x * t,
      yPlane,
      near.z + dir.z * t,
    );
  }

  // ───────────── 物理 + Items ─────────────
  async _setupPhysicsAndItems() {
    this.physics = new PhysicsWorld();
    const level = generateLevel();
    for (const it of level.items) {
      const mesh = await createItemMesh(this.scene, it.id, it.type);
      mesh.position.set(it.x, it.y, it.z);
      // 阴影投射
      if (this.shadowGen) this.shadowGen.addShadowCaster(mesh);
      const body = this.physics.addBody(ITEM_RADIUS, it.x, it.y, it.z);
      body.mesh = mesh;
      // 初始给一个微小随机速度，让落体看起来更自然
      body.setVel(
        (Math.random() - 0.5) * 0.6,
        0,
        (Math.random() - 0.5) * 0.6,
      );
      this.items.push({
        id: it.id,
        type: it.type,
        body,
        mesh,
        state: 'in_pot', // in_pot | flying | in_slot | removed
      });
    }
    console.log('[GameScene] items created:', this.items.length);
  }

  // ──────────── 字体与分辨率适配 ────────────
  // 中文友好的系统字体栈（代替 Babylon 默认的 sans-serif，避免变丑艰黑体）
  _uiFont() {
    return '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Heiti SC", system-ui, -apple-system, "Helvetica Neue", sans-serif';
  }

  // 以 720 逻辑宽度为基准的线性缩放（iPhone 6⊥72 都适用）
  _uiScale(px) {
    const w = (this.canvas && (this.canvas.clientWidth || this.canvas.width)) || 720;
    const k = Math.max(0.85, Math.min(1.6, w / 720));
    return Math.round(px * k);
  }

  // 仅取安全区顶部偏移（避开刘海/状态栏）
  _safeAreaTop() {
    // 微信小游戏环境下 wx.getSystemInfoSync().safeArea.top 是可靠的；这里优先使用个人设置
    try {
      if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
        const info = wx.getSystemInfoSync();
        if (info && info.safeArea && typeof info.safeArea.top === 'number') {
          // 再额外多留 24px 作为详情缓冲，避免 UI 贴着刘海下沿
          return Math.max(0, info.safeArea.top) + 24;
        }
        if (info && typeof info.statusBarHeight === 'number') {
          return info.statusBarHeight + 28;
        }
      }
    } catch (e) { /* ignore */ }
    // 预览/浏览器下默认留 120px 作为保守估计（以偺近带刘海机型体验）
    return 120;
  }

  // ───────────── GUI（屏幕空间） ─────────────
  _setupGUI() {
    this.gui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI('ui');
    // 以 1080 为逻辑分辨率，让 GUI 在不同设备上自适应
    this.gui.idealWidth = 1080;
    this.gui.useSmallestIdeal = true;
    this.gui.renderAtIdealSize = true;

    const FONT = this._uiFont();
    const safeTop = this._safeAreaTop();

    // ── 顶部背景条（高 = 安全区 + 内容区，下移避开刘海） ──
    const topBarH = safeTop + this._uiScale(180);
    const topBar = new BABYLON.GUI.Rectangle('top_bar');
    topBar.width = '100%';
    topBar.height = `${topBarH}px`;
    topBar.thickness = 0;
    topBar.background = 'rgba(0,0,0,0.55)';
    topBar.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    this.gui.addControl(topBar);

    // 标题
    const title = new BABYLON.GUI.TextBlock('title', '🪿 抓大鹅');
    title.color = '#ffd54f';
    title.fontFamily = FONT;
    title.fontSize = this._uiScale(44);
    title.fontWeight = 'bold';
    title.height = `${this._uiScale(60)}px`;
    title.top = `${safeTop + this._uiScale(16)}px`;    title.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    topBar.addControl(title);

    // 倒计时
    this.txtTimer = new BABYLON.GUI.TextBlock('timer', this._fmtTime(this.timeLeft));
    this.txtTimer.color = '#ffffff';
    this.txtTimer.fontFamily = FONT;
    this.txtTimer.fontSize = this._uiScale(80);
    this.txtTimer.fontWeight = 'bold';
    this.txtTimer.height = `${this._uiScale(100)}px`;
    this.txtTimer.top = `${safeTop + this._uiScale(76)}px`;
    this.txtTimer.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
    topBar.addControl(this.txtTimer);

    // 左下角：剩余物品
    this.txtRemain = new BABYLON.GUI.TextBlock('remain', '');
    this.txtRemain.color = '#a3e635';
    this.txtRemain.fontFamily = FONT;
    this.txtRemain.fontSize = this._uiScale(32);
    this.txtRemain.fontWeight = 'bold';
    this.txtRemain.height = `${this._uiScale(42)}px`;
    this.txtRemain.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    this.txtRemain.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.txtRemain.left = `${this._uiScale(20)}px`;
    this.txtRemain.top = `${-this._uiScale(12)}px`;
    this.txtRemain.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    topBar.addControl(this.txtRemain);

    // 右下角：槽位占用
    this.txtSlot = new BABYLON.GUI.TextBlock('slot_cnt', '');
    this.txtSlot.color = '#fbbf24';
    this.txtSlot.fontFamily = FONT;
    this.txtSlot.fontSize = this._uiScale(32);
    this.txtSlot.fontWeight = 'bold';
    this.txtSlot.height = `${this._uiScale(42)}px`;
    this.txtSlot.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    this.txtSlot.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
    this.txtSlot.left = `${-this._uiScale(20)}px`;
    this.txtSlot.top = `${-this._uiScale(12)}px`;
    this.txtSlot.textHorizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
    topBar.addControl(this.txtSlot);

    // ── 底部：取消文字提示，3D 卡槽托盘视觉已足够说明交互方式 ──
    // （此处刻意留白，避免与底部 3D 托盘重叠）

    // ── 右上角：甩一甩按钮 ──
    if (ENABLE_BUTTON_SHAKE) {
      const shakeBtn = BABYLON.GUI.Button.CreateSimpleButton('shake_btn', '🤹 甩一甩');
      shakeBtn.width = `${this._uiScale(160)}px`;
      shakeBtn.height = `${this._uiScale(60)}px`;
      shakeBtn.cornerRadius = this._uiScale(30);
      shakeBtn.color = 'white';
      shakeBtn.background = '#e63946';
      shakeBtn.fontFamily = FONT;
      shakeBtn.fontSize = this._uiScale(24);
      shakeBtn.fontWeight = 'bold';
      shakeBtn.thickness = 0;
      shakeBtn.horizontalAlignment = BABYLON.GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
      shakeBtn.verticalAlignment = BABYLON.GUI.Control.VERTICAL_ALIGNMENT_TOP;
      shakeBtn.left = `${-this._uiScale(16)}px`;
      shakeBtn.top = `${safeTop + this._uiScale(12)}px`;
      shakeBtn.onPointerClickObservable.add(() => {
        console.log('[Shake] button click');
        if (this.status !== 'playing') return;
        const ang = Math.random() * Math.PI * 2;
        this.physics.applyShake({
          x: Math.cos(ang) * 0.6,
          y: 0.4,
          z: Math.sin(ang) * 0.6,
        }, 1.4);
      });
      this.gui.addControl(shakeBtn);
      this.shakeBtn = shakeBtn;
    }

    // 顶部 UI 创建完成后，把 3D 卡槽托盘对齐到屏幕底部
    this._placeSlotTray();    // 屏幕尺寸变化时再对齐一次
    this.engine.onResizeObservable && this.engine.onResizeObservable.add(() => {
      this._placeSlotTray();
    });

    this._refreshHUD();
  }

  _fmtTime(sec) {
    const s = Math.max(0, Math.ceil(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r < 10 ? '0' : ''}${r}`;
  }

  _refreshHUD() {
    if (this.txtTimer) this.txtTimer.text = this._fmtTime(this.timeLeft);

    const inPot = this.items.filter((it) => it.state === 'in_pot').length;
    const removedCnt = this.items.filter((it) => it.state === 'removed').length;
    if (this.txtRemain) {
      this.txtRemain.text = `🪿 剩余 ${inPot}  ✅ 已消 ${removedCnt}/${TOTAL_ITEMS}`;
    }
    if (this.txtSlot) {
      const cnt = this.slot.length;
      // 槽位接近满时变红警告
      if (cnt >= SLOT_CAPACITY - 1) this.txtSlot.color = '#ef4444';
      else if (cnt >= SLOT_CAPACITY - 2) this.txtSlot.color = '#f97316';
      else this.txtSlot.color = '#fbbf24';
      this.txtSlot.text = `📦 槽位 ${cnt}/${SLOT_CAPACITY}`;
    }
  }

  // ───────────── 点击拾取 ─────────────
  _setupPicking() {
    // Babylon onPointerObservable 在微信小游戏沙箱中可能无法正确获取 touch 事件
    // 因此同时注册两种方式：Babylon 原生 + canvas touchstart 兑底

    // 方式1：Babylon 原生 pointer（桌面环境有效）
    this.scene.onPointerObservable.add((pi) => {
      if (pi.type !== BABYLON.PointerEventTypes.POINTERDOWN) return;
      this._handlePointerDown(this.scene.pointerX, this.scene.pointerY);
    });

    // 方式2：直接监听 canvas touchstart（微信小游戏环境兑底）
    // 保存 listener 引用，重启时可以移除，避免重复绑定造成多次点击
    const canvas = this.canvas;
    if (!canvas || !canvas.addEventListener) return;

    if (this._touchHandler && canvas.removeEventListener) {
      canvas.removeEventListener('touchstart', this._touchHandler);
    }
    if (this._mouseHandler && canvas.removeEventListener) {
      canvas.removeEventListener('mousedown', this._mouseHandler);
    }

    this._touchHandler = (e) => {
      if (!e.touches || e.touches.length === 0) return;
      const touch = e.touches[0];
      const x = (touch.clientX !== undefined ? touch.clientX : touch.pageX) || 0;
      const y = (touch.clientY !== undefined ? touch.clientY : touch.pageY) || 0;
      this._handlePointerDown(x, y);
    };
    this._mouseHandler = (e) => {
      this._handlePointerDown(e.clientX, e.clientY);
    };
    canvas.addEventListener('touchstart', this._touchHandler);
    canvas.addEventListener('mousedown', this._mouseHandler);
  }

  // 统一的指针入口：先尝试派发给 GUI 按钮，未命中则走 3D 物品 pick
  _handlePointerDown(x, y) {
    // 1) 游戏结束面板上的"再来一局"按钮
    if (this.endPanel && this.againBtn) {
      let hit = this._isPointInsideControl(this.againBtn, x, y);
      // 备用命中：endPanel 显示时，按钮大致位于屏幕中央偏下；
      // 把屏幕中部 60% 宽 × 高度 [55%, 80%] 的范围都视为有效，避免 _currentMeasure 异常时按不动
      if (!hit) {
        const sw = this.canvas.clientWidth || this.canvas.width;
        const sh = this.canvas.clientHeight || this.canvas.height;
        const inX = x >= sw * 0.20 && x <= sw * 0.80;
        const inY = y >= sh * 0.55 && y <= sh * 0.80;
        if (inX && inY) hit = true;
      }
      if (hit) {
        console.log('[UI] hit again button');
        try { this.againBtn.onPointerClickObservable.notifyObservers({}); } catch (e) { /* ignore */ }
        return;
      }
      // 结束面板可见时，下方的物品/甩按钮一律不响应
      return;
    }
    // 2) 顶部"甩一甩"按钮
    if (this.shakeBtn && this._isPointInsideControl(this.shakeBtn, x, y)) {
      console.log('[UI] hit shake button');
      try { this.shakeBtn.onPointerClickObservable.notifyObservers({}); } catch (e) { /* ignore */ }
      return;
    }
    // 3) 物品 picking
    this._handlePick(x, y);
  }

  // 把 GUI 控件的"屏幕矩形"和指针坐标做比较；考虑 idealWidth 缩放
  _isPointInsideControl(ctrl, x, y) {
    if (!ctrl || !this.gui) return false;
    // Babylon 9 的 Control 提供 _currentMeasure 表示渲染后的屏幕矩形（ADT 坐标 px）
    const measure = ctrl._currentMeasure;
    if (!measure) return false;
    const adt = this.gui;
    const adtSize = adt.getSize ? adt.getSize() : null;
    const renderW = (adtSize && adtSize.width) || (this.canvas.clientWidth || this.canvas.width);
    const renderH = (adtSize && adtSize.height) || (this.canvas.clientHeight || this.canvas.height);
    const screenW = this.canvas.clientWidth || this.canvas.width;
    const screenH = this.canvas.clientHeight || this.canvas.height;
    const sx = (x / screenW) * renderW;
    const sy = (y / screenH) * renderH;
    return sx >= measure.left
      && sx <= measure.left + measure.width
      && sy >= measure.top
      && sy <= measure.top + measure.height;
  }

  _handlePick(x, y) {
    if (this.status !== 'playing') return;
    if (this.isAnimating) return;
    const pick = this.scene.pick(x, y,
      (m) => m && m.metadata && m.metadata.kind === 'item');
    if (!pick || !pick.hit || !pick.pickedMesh) return;
    const mid = pick.pickedMesh.metadata.itemId;
    const item = this.items.find((it) => it.id === mid);
    if (!item || item.state !== 'in_pot') return;
    console.log(`[Pick] hit item id=${mid} type=${item.type}`);
    this._onItemClick(item);
  }
  // ───────────── 甩动 ─────────────
  _setupShake() {
    this.shake = new ShakeDetector((dir, strength) => {
      if (this.status !== 'playing') return;
      this.physics.applyShake(dir, strength);
    });
    this.shake.start();
  }

  // ───────────── 主循环 ─────────────
  _setupRenderLoop() {
    let lastT = performance.now();
    this._renderFrame = 0;
    this._renderRunning = true;
    // 让 Babylon Animation 使用恒定 deltaTime，避免在自驱动循环下 deltaTime 异常导致动画一帧跳完
    this.scene.useConstantAnimationDeltaTime = true;
    this.scene.constantAnimationDeltaTime = 16; // ms
    console.log('[Render] starting render loop (engine.runRenderLoop + setInterval fallback)');

    const tick = () => {
      if (!this._renderRunning) return;
      try {
        this._renderFrame++;

        const now = performance.now();
        const dt = Math.min(0.05, (now - lastT) / 1000);
        lastT = now;

        // 倒计时
        if (this.status === 'playing') {
          this.timeLeft -= dt;
          if (this.timeLeft <= 0) {
            this.timeLeft = 0;
        this._endGame('lose', '时间到');
          }
          if (this.txtTimer) this.txtTimer.text = this._fmtTime(this.timeLeft);
        }

        // 物理（固定步长子步）
        this._physicsAcc += dt;
        let steps = 0;
        while (this._physicsAcc >= PHYSICS_TIMESTEP && steps < PHYSICS_MAX_SUBSTEPS) {
          this.physics.step(PHYSICS_TIMESTEP);
          this._physicsAcc -= PHYSICS_TIMESTEP;
          steps++;
        }
        if (this._physicsAcc > PHYSICS_TIMESTEP * PHYSICS_MAX_SUBSTEPS) {
          this._physicsAcc = 0;
        }

        // 包 beginFrame/endFrame，让 engine 正常推进 deltaTime 以驱动动画
        this.engine.beginFrame();
        this.scene.render();
        this.engine.endFrame();

        // 第一帧渲染后再对齐托盘位置（此时 viewMatrix 已被正确计算）
        if (this._renderFrame === 1) {
          this._placeSlotTray();
        }
      } catch (e) {
        console.error('[Render] loop error:', e && e.message, e && e.stack);
      }
    };

    // 方式 1：Babylon 标准 runRenderLoop（在标准浏览器/小游戏适配层中通常工作）
    try {
      this.engine.runRenderLoop(tick);
    } catch (e) {
      console.warn('[Render] engine.runRenderLoop failed:', e && e.message);
    }
    // 方式 2：setInterval 兜底（确保即使 RAF 失效也能推进）
    if (this._tickInterval) clearInterval(this._tickInterval);
    this._tickInterval = setInterval(() => {
      // 如果 runRenderLoop 已经在跑（同一帧 frame 计数会快速增长），这里也跑一次也无妨
      // 但为避免双倍 step，这里只在距上次 tick 超过 30ms 时才补帧
      if (!this._renderRunning) return;
      const since = performance.now() - lastT;
      if (since >= 30) tick();
    }, 32);
  }

  // ───────────── 点击 → 飞入槽位 ─────────────
  _onItemClick(item) {
    this.isAnimating = true;
    item.state = 'flying';
    // 停止物理：mesh 由我们用 tween 控制
    item.body.kinematic = true;
    item.body.vx = item.body.vy = item.body.vz = 0;

    // 计算插入位置
    const insertIdx = this._computeInsertIndex(item);
    this.slot.splice(insertIdx, 0, item);

    // 飞行 + 槽内右移并行
    const promises = [];
    promises.push(this._tweenItemToSlot(item, insertIdx, ANIM_FLY_TO_SLOT));
    for (let i = insertIdx + 1; i < this.slot.length; i++) {
      promises.push(this._tweenItemToSlot(this.slot[i], i, ANIM_SLOT_SHIFT));
    }
    Promise.all(promises).then(() => this._afterFlyIn(item));
    this._refreshHUD();
  }

  _computeInsertIndex(item) {
    let lastSame = -1;
    for (let i = this.slot.length - 1; i >= 0; i--) {
      if (this.slot[i].type === item.type) { lastSame = i; break; }
    }
    return lastSame === -1 ? this.slot.length : lastSame + 1;
  }

  // 槽位的世界坐标：直接取 3D 托盘里第 idx 个槽位中心
  _slotWorldPos(idx) {
    if (!this.tray || !this.tray.slotCenters[idx]) {
      return new BABYLON.Vector3(0, 0, 0);
    }
    const local = this.tray.slotCenters[idx];
    const trayPos = this.tray.root.position;
    return new BABYLON.Vector3(
      trayPos.x + local.x,
      trayPos.y + local.y,
      trayPos.z + local.z,
    );
  }

  _tweenItemToSlot(item, slotIdx, durationMs) {
    const target = this._slotWorldPos(slotIdx);
    return this._tweenMesh(item.mesh, target, durationMs, /* shrink */ true);
  }

  // 通用 mesh 平滑移动 + 缩放（用 Babylon Animation）
  _tweenMesh(mesh, target, durationMs, shrink = false) {
    return new Promise((resolve) => {
      const fps = 60;
      const totalFrames = Math.max(1, Math.round((durationMs / 1000) * fps));

      const animPos = new BABYLON.Animation('pos', 'position',
        fps, BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
      animPos.setKeys([
        { frame: 0, value: mesh.position.clone() },
        { frame: totalFrames, value: target.clone() },
      ]);
      const ease = new BABYLON.CubicEase();
      ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEOUT);
      animPos.setEasingFunction(ease);

      const anims = [animPos];

      // 飞入槽位时重置旋转为 0（确保苹果等模型在槽内居中不偏移）
      if (shrink) {
        const animRot = new BABYLON.Animation('rot', 'rotation',
          fps, BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
          BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        animRot.setKeys([
          { frame: 0, value: mesh.rotation.clone() },
          { frame: totalFrames, value: BABYLON.Vector3.Zero() },
        ]);
        animRot.setEasingFunction(ease);
        anims.push(animRot);

        const animScale = new BABYLON.Animation('scale', 'scaling',
          fps, BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
          BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
        const targetScale = new BABYLON.Vector3(0.35, 0.35, 0.35);
        animScale.setKeys([
          { frame: 0, value: mesh.scaling.clone() },
          { frame: totalFrames, value: targetScale },
        ]);
        animScale.setEasingFunction(ease);
        anims.push(animScale);
      }

      this.scene.beginDirectAnimation(mesh, anims, 0, totalFrames, false, 1, () => resolve());
    });
  }

  _afterFlyIn(item) {
    item.state = 'in_slot';
    this._refreshHUD();
    const tripleStart = this._findTripleIndex();
    if (tripleStart !== -1) {
      this._removeTriple(tripleStart).then(() => this._afterAction());
    } else {
      this._afterAction();
    }
  }

  _findTripleIndex() {
    for (let i = 0; i + TRIPLE_COUNT - 1 < this.slot.length; i++) {
      let same = true;
      for (let k = 1; k < TRIPLE_COUNT; k++) {
        if (this.slot[i + k].type !== this.slot[i].type) { same = false; break; }
      }
      if (same) return i;
    }
    return -1;
  }

  _removeTriple(startIdx) {
    const removed = this.slot.splice(startIdx, TRIPLE_COUNT);
    const removePromises = removed.map((it) => new Promise((resolve) => {
      const fps = 60;
      const totalFrames = Math.max(1, Math.round((ANIM_TRIPLE_REMOVE / 1000) * fps));
      const animScale = new BABYLON.Animation('rm_scale', 'scaling',
        fps, BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
        BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT);
      animScale.setKeys([
        { frame: 0, value: it.mesh.scaling.clone() },
        { frame: totalFrames, value: new BABYLON.Vector3(0.001, 0.001, 0.001) },
      ]);
      const ease = new BABYLON.CubicEase();
      ease.setEasingMode(BABYLON.EasingFunction.EASINGMODE_EASEIN);
      animScale.setEasingFunction(ease);
      this.scene.beginDirectAnimation(it.mesh, [animScale], 0, totalFrames, false, 1, () => {
        it.state = 'removed';
        it.mesh.dispose();
        this.physics.removeBody(it.body);
        resolve();
      });
    }));

    return Promise.all(removePromises).then(() => {
      const shifts = [];
      for (let i = startIdx; i < this.slot.length; i++) {
        shifts.push(this._tweenItemToSlot(this.slot[i], i, ANIM_SLOT_COMPACT));
      }
      return Promise.all(shifts);
    });
  }

  _afterAction() {
    this.isAnimating = false;
    this._refreshHUD();
    if (this.status !== 'playing') return;

    // 胜利：所有锅内 + 槽内为空（且 removed 个数 = TOTAL_ITEMS）
    const remaining = this.items.filter((it) => it.state !== 'removed').length;
    if (remaining === 0) {
      this._endGame('win', '全部消除');
      return;
    }
    if (this.slot.length >= SLOT_CAPACITY) {
      this._endGame('lose', '槽满未消');
      return;
    }
  }

  // ───────────── 胜负 ─────────────
  _endGame(result, reason) {
    if (this.status !== 'playing') return;
    this.status = result;
    console.log('[GameScene] endGame', result, reason);

    const FONT = this._uiFont();

    const panel = new BABYLON.GUI.Rectangle('end_panel');
    panel.width = '100%';
    panel.height = '100%';
    panel.thickness = 0;
    panel.background = 'rgba(0,0,0,0.72)';
    panel.isPointerBlocker = true; // 阻断面板下方的 pick
    this.gui.addControl(panel);

    const big = new BABYLON.GUI.TextBlock('end_big',
      result === 'win' ? '通关' : '失败');
    big.color = result === 'win' ? '#4ade80' : '#ef4444';
    big.fontFamily = FONT;
    big.fontSize = this._uiScale(96);
    big.fontWeight = 'bold';
    big.height = `${this._uiScale(120)}px`;
    big.top = `${-this._uiScale(100)}px`;
    panel.addControl(big);

    // 失败原因在调用点已去除 emoji，这里直接使用
    const sub = new BABYLON.GUI.TextBlock('end_sub', reason || '');
    sub.color = '#fff';
    sub.fontFamily = FONT;
    sub.fontSize = this._uiScale(36);
    sub.height = `${this._uiScale(48)}px`;
    sub.top = `${this._uiScale(16)}px`;
    panel.addControl(sub);

    const btn = BABYLON.GUI.Button.CreateSimpleButton('again', '再来一局');
    btn.width = `${this._uiScale(300)}px`;
    btn.height = `${this._uiScale(100)}px`;
    btn.cornerRadius = this._uiScale(50);
    btn.color = '#fff';
    btn.background = '#3b82f6';
    btn.thickness = 0;
    btn.top = `${this._uiScale(140)}px`;
    if (btn.textBlock) {
      btn.textBlock.fontFamily = FONT;
      btn.textBlock.fontSize = this._uiScale(40);
      btn.textBlock.fontWeight = 'bold';
    }
    btn.onPointerClickObservable.add(() => {
      console.log('[EndPanel] again click');
      this._restart();
    });
    panel.addControl(btn);

    this.endPanel = panel;
    this.againBtn = btn;
  }

  async _restart() {
    // 简单粗暴：销毁场景重建
    this.shake && this.shake.stop();
    this._renderRunning = false;
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
    this.scene.dispose();
    this.items = [];
    this.slot = [];
    this.status = 'playing';
    this.isAnimating = false;
    this.timeLeft = TIME_LIMIT_SEC;
    this._physicsAcc = 0;
    await this.create();
  }
}
