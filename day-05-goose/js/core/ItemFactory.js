// 《抓大鹅》Day 5 · 3D 物品 Mesh 工厂
//
// 用代码构造 9 种简单几何体（球/立方体/圆柱/圆锥/甜甜圈/胶囊/8 面/12 面/20 面），
// 每种配一种鲜艳颜色 + 卡通 PBR 材质（高反光 + 边缘高亮，看起来像玩具）。

import {
  ITEM_SHAPES,
  ITEM_COLORS,
  ITEM_VISUAL_SCALE,
  ITEM_RADIUS,
} from './config.js';

// 缓存材质，避免重复创建
const _materialCache = new Map();

function getMaterial(scene, type) {
  if (_materialCache.has(type)) return _materialCache.get(type);
  const color = BABYLON.Color3.FromHexString(ITEM_COLORS[type]);
  const mat = new BABYLON.StandardMaterial(`mat_item_${type}`, scene);
  mat.diffuseColor = color;
  // 卡通玩具感：高一点的 ambient + specular 高亮 + 略带自发光
  mat.specularColor = new BABYLON.Color3(0.5, 0.5, 0.5);
  mat.specularPower = 64;
  mat.emissiveColor = color.scale(0.18);
  mat.ambientColor = new BABYLON.Color3(0.4, 0.4, 0.4);
  mat.backFaceCulling = true;
  _materialCache.set(type, mat);
  return mat;
}

// 创建一个物品 Mesh（按 type 决定形状），半径统一为 ITEM_RADIUS（碰撞用）
// 视觉尺寸略小（ITEM_VISUAL_SCALE * 2）以避免穿插
export function createItemMesh(scene, id, type) {
  const shape = ITEM_SHAPES[type];
  const visualSize = ITEM_VISUAL_SCALE * 2; // 直径
  let mesh;

  switch (shape) {
    case 'sphere':
      mesh = BABYLON.MeshBuilder.CreateSphere(`item_${id}`, {
        diameter: visualSize, segments: 16,
      }, scene);
      break;
    case 'box':
      mesh = BABYLON.MeshBuilder.CreateBox(`item_${id}`, {
        size: visualSize * 0.85,
      }, scene);
      break;
    case 'cylinder':
      mesh = BABYLON.MeshBuilder.CreateCylinder(`item_${id}`, {
        diameter: visualSize * 0.9, height: visualSize, tessellation: 24,
      }, scene);
      break;
    case 'cone':
      mesh = BABYLON.MeshBuilder.CreateCylinder(`item_${id}`, {
        diameterTop: 0, diameterBottom: visualSize, height: visualSize * 1.1, tessellation: 24,
      }, scene);
      break;
    case 'torus':
      mesh = BABYLON.MeshBuilder.CreateTorus(`item_${id}`, {
        diameter: visualSize, thickness: visualSize * 0.32, tessellation: 24,
      }, scene);
      break;
    case 'capsule':
      mesh = BABYLON.MeshBuilder.CreateCapsule(`item_${id}`, {
        radius: visualSize * 0.4, height: visualSize * 1.2, tessellation: 16,
      }, scene);
      break;
    case 'octahedron':
      mesh = BABYLON.MeshBuilder.CreatePolyhedron(`item_${id}`, {
        type: 1, size: visualSize * 0.55,
      }, scene);
      break;
    case 'dodecahedron':
      mesh = BABYLON.MeshBuilder.CreatePolyhedron(`item_${id}`, {
        type: 2, size: visualSize * 0.5,
      }, scene);
      break;
    case 'icosphere':
      mesh = BABYLON.MeshBuilder.CreateIcoSphere(`item_${id}`, {
        radius: visualSize * 0.55, subdivisions: 2,
      }, scene);
      break;
    default:
      mesh = BABYLON.MeshBuilder.CreateSphere(`item_${id}`, {
        diameter: visualSize,
      }, scene);
  }

  mesh.material = getMaterial(scene, type);
  // 接收阴影 + 投射阴影
  mesh.receiveShadows = true;
  // 自定义元数据，便于 picking 时识别
  mesh.metadata = { kind: 'item', itemId: id, itemType: type };
  return mesh;
}

// 创建容器（圆柱锅）：内壁、外壁、底
// 注意：用半透明材质，让玩家能看清里面的物品
export function createContainer(scene) {
  const PR = 1.8;             // 内半径（与 config.POT_RADIUS 保持一致；这里硬写避免循环 import）
  const PH = 3.2;
  const wallT = 0.15;
  const root = new BABYLON.TransformNode('container_root', scene);

  // 1) 锅底（一个稍大的圆盘）
  const bottom = BABYLON.MeshBuilder.CreateCylinder('pot_bottom', {
    diameter: (PR + wallT) * 2, height: 0.12, tessellation: 48,
  }, scene);
  bottom.position.y = -0.06;
  const bottomMat = new BABYLON.StandardMaterial('pot_bottom_mat', scene);
  bottomMat.diffuseColor = new BABYLON.Color3(0.4, 0.42, 0.48);
  bottomMat.specularColor = new BABYLON.Color3(0.2, 0.2, 0.25);
  bottom.material = bottomMat;
  bottom.parent = root;
  bottom.receiveShadows = true;
  bottom.isPickable = false;

  // 2) 锅外壁（金属灰）
  const wallOuter = BABYLON.MeshBuilder.CreateCylinder('pot_wall_outer', {
    diameter: (PR + wallT) * 2, height: PH, tessellation: 48,
    sideOrientation: BABYLON.Mesh.BACKSIDE, cap: BABYLON.Mesh.NO_CAP,
  }, scene);
  wallOuter.position.y = PH / 2;
  const wallMat = new BABYLON.StandardMaterial('pot_wall_mat', scene);
  wallMat.diffuseColor = new BABYLON.Color3(0.6, 0.62, 0.7);
  wallMat.specularColor = new BABYLON.Color3(0.5, 0.5, 0.55);
  wallMat.specularPower = 128;
  wallMat.alpha = 0.55;          // 半透明：玩家能看穿前壁看到内部
  wallMat.backFaceCulling = false;
  wallOuter.material = wallMat;
  wallOuter.parent = root;
  wallOuter.isPickable = false;

  // 3) 锅内壁（颜色暗一点，区分层次）
  const wallInner = BABYLON.MeshBuilder.CreateCylinder('pot_wall_inner', {
    diameter: PR * 2, height: PH, tessellation: 48,
    sideOrientation: BABYLON.Mesh.BACKSIDE, cap: BABYLON.Mesh.NO_CAP,
  }, scene);
  wallInner.position.y = PH / 2;
  const innerMat = new BABYLON.StandardMaterial('pot_inner_mat', scene);
  innerMat.diffuseColor = new BABYLON.Color3(0.85, 0.88, 0.95);
  innerMat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.35);
  wallInner.material = innerMat;
  wallInner.parent = root;
  wallInner.receiveShadows = true;
  wallInner.isPickable = false;

  // 4) 顶部金属环（装饰）
  const rim = BABYLON.MeshBuilder.CreateTorus('pot_rim', {
    diameter: (PR + wallT / 2) * 2, thickness: wallT * 1.5, tessellation: 48,
  }, scene);
  rim.position.y = PH;
  const rimMat = new BABYLON.StandardMaterial('pot_rim_mat', scene);
  rimMat.diffuseColor = new BABYLON.Color3(0.75, 0.78, 0.85);
  rimMat.specularColor = new BABYLON.Color3(0.9, 0.9, 0.95);
  rimMat.specularPower = 256;
  rim.material = rimMat;
  rim.parent = root;
  rim.isPickable = false;

  return root;
}

// 创建底部卡槽托盘：一个长方形面板 + 7 个圆形凹陷标记
//   slotCount  : 槽位数（7）
//   slotSize   : 单个槽位的可视半径（世界单位）
//   spacing    : 槽位中心间距
// 返回 { root, slotCenters }，slotCenters 是每个槽位的中心位置（相对 root 的本地坐标）
//
// 注意：这里只构造 mesh，不设位置。位置由 GameScene 通过屏幕 unproject 算出来设到 root 上。
export function createSlotTray(scene, slotCount, slotSize, spacing) {
  const root = new BABYLON.TransformNode('slot_tray_root', scene);

  // 整体托盘宽度 = 7 个槽位 + 两侧留白
  const trayPad = slotSize * 0.6;
  const trayW = spacing * (slotCount - 1) + slotSize * 2 + trayPad * 2;
  const trayH = slotSize * 2 + trayPad * 2;
  const trayD = 0.18; // 厚度

  // 1) 托盘底板（深色圆角矩形 box）
  const tray = BABYLON.MeshBuilder.CreateBox('slot_tray', {
    width: trayW, height: trayD, depth: trayH,
  }, scene);
  const trayMat = new BABYLON.StandardMaterial('slot_tray_mat', scene);
  trayMat.diffuseColor = new BABYLON.Color3(0.18, 0.22, 0.30);
  trayMat.specularColor = new BABYLON.Color3(0.3, 0.32, 0.38);
  trayMat.specularPower = 64;
  trayMat.emissiveColor = new BABYLON.Color3(0.05, 0.06, 0.09);
  tray.material = trayMat;
  tray.parent = root;
  tray.isPickable = false;
  tray.receiveShadows = true;

  // 2) 7 个圆形槽位标记（圆盘，凹陷感由稍亮颜色 + 略低于托盘表面体现）
  const slotCenters = [];
  const startX = -((slotCount - 1) * spacing) / 2;
  for (let i = 0; i < slotCount; i++) {
    const cx = startX + i * spacing;
    const cy = 0;
    const cz = 0;

    // 圆形凹槽（薄圆柱）
    const hole = BABYLON.MeshBuilder.CreateCylinder(`slot_hole_${i}`, {
      diameter: slotSize * 2, height: 0.06, tessellation: 32,
    }, scene);
    hole.position.set(cx, trayD / 2 + 0.001, cz);
    const holeMat = new BABYLON.StandardMaterial(`slot_hole_mat_${i}`, scene);
    holeMat.diffuseColor = new BABYLON.Color3(0.10, 0.13, 0.20);
    holeMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.08);
    holeMat.emissiveColor = new BABYLON.Color3(0.08, 0.10, 0.15);
    hole.material = holeMat;
    hole.parent = root;
    hole.isPickable = false;

    // 高亮圈（环形装饰）
    const ring = BABYLON.MeshBuilder.CreateTorus(`slot_ring_${i}`, {
      diameter: slotSize * 2.05, thickness: 0.05, tessellation: 24,
    }, scene);
    ring.position.set(cx, trayD / 2 + 0.04, cz);
    const ringMat = new BABYLON.StandardMaterial(`slot_ring_mat_${i}`, scene);
    ringMat.diffuseColor = new BABYLON.Color3(0.55, 0.62, 0.75);
    ringMat.specularColor = new BABYLON.Color3(0.7, 0.7, 0.75);
    ringMat.emissiveColor = new BABYLON.Color3(0.18, 0.20, 0.25);
    ring.material = ringMat;
    ring.parent = root;
    ring.isPickable = false;

    // 槽位中心：物品停留点 = 凹槽上方一点（让物品坐落在槽中）
    slotCenters.push(new BABYLON.Vector3(cx, trayD / 2 + slotSize * 0.5, cz));
  }

  return { root, slotCenters };
}
