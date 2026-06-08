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

// 3D模型缓存（只加载一次）
let _appleMeshTemplate = null;
let _appleLoadPromise = null; // 防止并发重复加载

// 其他类型模型缓存
const _modelTemplates = new Map();
const _modelLoadPromises = new Map();

// ─── GLB 手动解析（不依赖 SceneLoader / XMLHttpRequest） ───

// 读取 GLB 文件的二进制数据（兼容浏览器 + 微信小游戏 + 模拟器）
function _readGLBFile(filePath) {
  return new Promise((resolve, reject) => {
    // 微信小游戏环境
    if (typeof wx !== 'undefined' && wx.getFileSystemManager) {
      const fs = wx.getFileSystemManager();
      try {
        const data = fs.readFileSync(filePath);
        if (data instanceof ArrayBuffer) {
          resolve(data);
          return;
        }
        // 某些版本返回 typed array 而非 ArrayBuffer
        if (data && data.buffer instanceof ArrayBuffer) {
          resolve(data.buffer);
          return;
        }
      } catch (e) {
        console.warn('[GLBLoader] wx.readFileSync failed, trying fetch:', e.message || e.errMsg || e);
        // 不立即 reject，继续尝试 fetch
      }
    }
    // 浏览器/模拟器环境：用 fetch（或 XMLHttpRequest）
    if (typeof fetch !== 'undefined') {
      fetch(filePath)
        .then((res) => {
          if (!res.ok) throw new Error(`fetch ${filePath} failed: ${res.status}`);
          return res.arrayBuffer();
        })
        .then(resolve)
        .catch(reject);
      return;
    }
    // 最后尝试 XMLHttpRequest（虽然在小游戏里通常没有，但某些 polyfill 环境可能有）
    if (typeof XMLHttpRequest !== 'undefined') {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', filePath, true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = () => {
        if (xhr.status === 200 || xhr.status === 0) {
          resolve(xhr.response);
        } else {
          reject(new Error(`XHR ${filePath} failed: ${xhr.status}`));
        }
      };
      xhr.onerror = () => reject(new Error(`XHR ${filePath} network error`));
      xhr.send();
      return;
    }
    reject(new Error('当前环境不支持文件读取 (无 wx/fetch/XHR)'));
  });
}

// 解析 GLB 二进制 → { positions: Float32Array, indices: Uint32Array }
function _parseGLB(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  // Header: magic(4) + version(4) + length(4)
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3));
  if (magic !== 'glTF') throw new Error('不是有效的 GLB 文件');
  const version = view.getUint32(4, true);
  if (version !== 2) throw new Error(`不支持的 glTF 版本: ${version}`);

  // Chunk 0: JSON
  const jsonLen = view.getUint32(12, true);
  // const jsonType = view.getUint32(16, true); // 0x4E4F534A = "JSON"
  const jsonBytes = new Uint8Array(arrayBuffer, 20, jsonLen);
  const jsonStr = new TextDecoder().decode(jsonBytes);
  const gltf = JSON.parse(jsonStr);

  // Chunk 1: BIN
  const binOffset = 20 + jsonLen;
  // const binLen = view.getUint32(binOffset, true);
  // const binType = view.getUint32(binOffset + 4, true); // 0x004E4942 = "BIN\0"
  const binData = new Uint8Array(arrayBuffer, binOffset + 8);

  // 解析 accessors
  const accessors = gltf.accessors;
  const bufferViews = gltf.bufferViews;

  // 找到 mesh primitive
  const mesh = gltf.meshes[0];
  const primitive = mesh.primitives[0];
  const posAccessorIdx = primitive.attributes.POSITION;
  const idxAccessorIdx = primitive.indices;

  // 读取 positions
  const posAccessor = accessors[posAccessorIdx];
  const posBV = bufferViews[posAccessor.bufferView];
  const posOffset = (posBV.byteOffset || 0) + (posAccessor.byteOffset || 0);
  const posCount = posAccessor.count;
  const positions = new Float32Array(binData.buffer, binData.byteOffset + posOffset, posCount * 3);

  // 读取 indices
  const idxAccessor = accessors[idxAccessorIdx];
  const idxBV = bufferViews[idxAccessor.bufferView];
  const idxOffset = (idxBV.byteOffset || 0) + (idxAccessor.byteOffset || 0);
  const idxCount = idxAccessor.count;

  let indices;
  const compType = idxAccessor.componentType;
  if (compType === 5125) { // UNSIGNED_INT
    indices = new Uint32Array(binData.buffer, binData.byteOffset + idxOffset, idxCount);
  } else if (compType === 5123) { // UNSIGNED_SHORT
    indices = new Uint16Array(binData.buffer, binData.byteOffset + idxOffset, idxCount);
  } else if (compType === 5121) { // UNSIGNED_BYTE
    indices = new Uint8Array(binData.buffer, binData.byteOffset + idxOffset, idxCount);
  } else {
    throw new Error(`不支持的 indices componentType: ${compType}`);
  }

  // 读取法线（如果有）
  let normals = null;
  if (primitive.attributes.NORMAL !== undefined) {
    const nrmAccessor = accessors[primitive.attributes.NORMAL];
    const nrmBV = bufferViews[nrmAccessor.bufferView];
    const nrmOffset = (nrmBV.byteOffset || 0) + (nrmAccessor.byteOffset || 0);
    normals = new Float32Array(binData.buffer, binData.byteOffset + nrmOffset, nrmAccessor.count * 3);
  }

  return { positions, indices, normals, vertexCount: posCount, indexCount: idxCount };
}

// 计算平滑法线（带顶点焊接，修复降面后重复顶点导致的裂痕）
function _computeNormals(positions, indices) {
  const vertCount = positions.length / 3;
  const normals = new Float32Array(positions.length);

  // 1. 空间哈希焊接：位置相同的顶点映射到同一个"代表顶点"
  //    使用固定精度四舍五入作为 hash key，精度 1e-5 足以合并降面产生的微小偏移
  const PRECISION = 1e5;
  const posMap = new Map(); // key → 代表顶点索引
  const vertexGroup = new Uint32Array(vertCount); // 每个顶点对应的代表顶点

  for (let i = 0; i < vertCount; i++) {
    const x = Math.round(positions[i * 3] * PRECISION);
    const y = Math.round(positions[i * 3 + 1] * PRECISION);
    const z = Math.round(positions[i * 3 + 2] * PRECISION);
    const key = `${x},${y},${z}`;
    if (!posMap.has(key)) {
      posMap.set(key, i);
    }
    vertexGroup[i] = posMap.get(key);
  }

  // 2. 按代表顶点累加面法线
  const groupNormals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3, i1 = indices[i + 1] * 3, i2 = indices[i + 2] * 3;
    const ax = positions[i1] - positions[i0], ay = positions[i1 + 1] - positions[i0 + 1], az = positions[i1 + 2] - positions[i0 + 2];
    const bx = positions[i2] - positions[i0], by = positions[i2 + 1] - positions[i0 + 1], bz = positions[i2 + 2] - positions[i0 + 2];
    // 面法线（面积加权，不归一化）
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;

    // 累加到代表顶点上
    const g0 = vertexGroup[indices[i]] * 3;
    const g1 = vertexGroup[indices[i + 1]] * 3;
    const g2 = vertexGroup[indices[i + 2]] * 3;
    groupNormals[g0] += nx; groupNormals[g0 + 1] += ny; groupNormals[g0 + 2] += nz;
    groupNormals[g1] += nx; groupNormals[g1 + 1] += ny; groupNormals[g1 + 2] += nz;
    groupNormals[g2] += nx; groupNormals[g2 + 1] += ny; groupNormals[g2 + 2] += nz;
  }

  // 3. 归一化代表顶点法线，然后赋值给所有同组顶点
  for (let i = 0; i < vertCount; i++) {
    const gi = vertexGroup[i] * 3;
    const nx = groupNormals[gi], ny = groupNormals[gi + 1], nz = groupNormals[gi + 2];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      normals[i * 3] = nx / len;
      normals[i * 3 + 1] = ny / len;
      normals[i * 3 + 2] = nz / len;
    }
  }

  return normals;
}

// 从解析结果构建 Babylon Mesh
function _buildMeshFromGLBData(scene, name, data) {
  const mesh = new BABYLON.Mesh(name, scene);
  const vertexData = new BABYLON.VertexData();

  vertexData.positions = data.positions;
  vertexData.indices = Array.from(data.indices); // Babylon 需要普通数组或 IndicesArray

  if (data.normals) {
    vertexData.normals = data.normals;
  } else {
    vertexData.normals = _computeNormals(data.positions, data.indices);
  }

  vertexData.applyToMesh(mesh, false);
  return mesh;
}

// ─── 3D模型加载逻辑 ───

// 加载指定类型的3D模型（异步）
async function load3DModel(scene, id, type) {
  // type 0 使用原来的苹果模型逻辑保持兼容
  if (type === 0) {
    return await loadAppleModel(scene, id);
  }
  
  // type 1,2,3,4 使用对应的模型文件
  if (type >= 1 && type <= 4) {
    return await loadTypeModel(scene, id, type);
  }
  
  return null;
}

// 加载苹果 GLB 模型（异步）
async function loadAppleModel(scene, id) {
  if (_appleMeshTemplate) {
    const instance = _appleMeshTemplate.clone(`item_${id}`);
    instance.makeGeometryUnique();
    instance.setEnabled(true); // 模板是隐藏的，克隆后需要启用
    instance.hasVertexAlpha = false;
    instance.visibility = 1.0;
    return instance;
  }

  // 防止多个 createItemMesh 并发触发重复加载
  if (!_appleLoadPromise) {
    _appleLoadPromise = _doLoadAppleModel(scene);
  }

  try {
    await _appleLoadPromise;
  } catch (e) {
    console.warn('[ItemFactory] apple GLB 加载失败，回退到 sphere:', e.message || e);
    _appleLoadPromise = null;
    return null;
  }

  if (!_appleMeshTemplate) return null;

  const instance = _appleMeshTemplate.clone(`item_${id}`);
  instance.makeGeometryUnique();
  instance.setEnabled(true); // 模板是隐藏的，克隆后需要启用
  instance.hasVertexAlpha = false;
  instance.visibility = 1.0;
  return instance;
}

async function _doLoadAppleModel(scene) {
  const filePath = (typeof wx !== 'undefined') ? 'image/apple-processed.glb' : 'image/apple-processed.glb';
  console.log('[ItemFactory] loading GLB (manual parse):', filePath);

  // 1. 读取二进制
  const arrayBuffer = await _readGLBFile(filePath);

  // 2. 解析 GLB
  const data = _parseGLB(arrayBuffer);
  console.log(`[ItemFactory] GLB parsed: ${data.vertexCount} vertices, ${data.indexCount} indices`);

  // 3. 构建模板 mesh
  const templateMesh = _buildMeshFromGLBData(scene, 'apple_template', data);

  // 4. 给苹果一个红色材质（完全不透明，确保深度正确）
  const mat = new BABYLON.StandardMaterial('apple_mat', scene);
  mat.diffuseColor = new BABYLON.Color3(0.9, 0.15, 0.12);
  mat.specularColor = new BABYLON.Color3(0.5, 0.4, 0.3);
  mat.specularPower = 32;
  mat.emissiveColor = new BABYLON.Color3(0.15, 0.02, 0.01);
  mat.backFaceCulling = true;  // 开启背面剔除（法线已正确，不需要双面渲染）
  mat.alpha = 1.0;
  mat.transparencyMode = BABYLON.Material.MATERIAL_OPAQUE; // 强制不透明模式
  templateMesh.material = mat;

  // 确保 mesh 不会被当作半透明对象处理
  templateMesh.hasVertexAlpha = false;
  templateMesh.visibility = 1.0;

  // 5. 缓存模板
  templateMesh.setEnabled(false);
  _appleMeshTemplate = templateMesh;
}

// 加载 type 1,2,3,4 的模型（异步）
async function loadTypeModel(scene, id, type) {
  // 检查是否已有模板
  if (_modelTemplates.has(type)) {
    const template = _modelTemplates.get(type);
    const instance = template.clone(`item_${id}`);
    instance.makeGeometryUnique();
    instance.setEnabled(true);
    instance.hasVertexAlpha = false;
    instance.visibility = 1.0;
    return instance;
  }

  // 防止并发重复加载
  if (_modelLoadPromises.has(type)) {
    await _modelLoadPromises.get(type);
  } else {
    const promise = _doLoadTypeModel(scene, type);
    _modelLoadPromises.set(type, promise);
    await promise;
  }

  if (!_modelTemplates.has(type)) return null;

  const template = _modelTemplates.get(type);
  const instance = template.clone(`item_${id}`);
  instance.makeGeometryUnique();
  instance.setEnabled(true);
  instance.hasVertexAlpha = false;
  instance.visibility = 1.0;
  return instance;
}

// 实际加载 type 模型的逻辑
async function _doLoadTypeModel(scene, type) {
  const modelFiles = {
    1: 'apple-standard.glb',
    2: 'apple-flat.glb', 
    3: 'apple-perfect.glb',
    4: 'apple-tall.glb'
  };
  
  const fileName = modelFiles[type];
  if (!fileName) return;
  
  const filePath = (typeof wx !== 'undefined') ? `image/${fileName}` : `image/${fileName}`;
  console.log(`[ItemFactory] loading type ${type} GLB:`, filePath);

  try {
    // 1. 读取二进制
    const arrayBuffer = await _readGLBFile(filePath);

    // 2. 解析 GLB
    const data = _parseGLB(arrayBuffer);
    console.log(`[ItemFactory] type ${type} GLB parsed: ${data.vertexCount} vertices, ${data.indexCount} indices`);

    // 3. 构建模板 mesh
    const templateMesh = _buildMeshFromGLBData(scene, `type${type}_template`, data);

    // 4. 给模型分配材质（使用对应类型的颜色）
    const mat = new BABYLON.StandardMaterial(`type${type}_mat`, scene);
    const color = BABYLON.Color3.FromHexString(ITEM_COLORS[type]);
    mat.diffuseColor = color;
    mat.specularColor = new BABYLON.Color3(0.5, 0.4, 0.3);
    mat.specularPower = 32;
    mat.emissiveColor = color.scale(0.18);
    mat.backFaceCulling = true;
    mat.alpha = 1.0;
    mat.transparencyMode = BABYLON.Material.MATERIAL_OPAQUE;
    templateMesh.material = mat;

    // 5. 确保 mesh 不会被当作半透明对象处理
    templateMesh.hasVertexAlpha = false;
    templateMesh.visibility = 1.0;

    // 6. 缓存模板
    templateMesh.setEnabled(false);
    _modelTemplates.set(type, templateMesh);
    
  } catch (e) {
    console.warn(`[ItemFactory] type ${type} GLB 加载失败:`, e.message || e);
    _modelLoadPromises.delete(type);
  }
}

// 创建一个物品 Mesh（按 type 决定形状），半径统一为 ITEM_RADIUS（碰撞用）
// 视觉尺寸略小（ITEM_VISUAL_SCALE * 2）以避免穿插
export async function createItemMesh(scene, id, type) {
  const shape = ITEM_SHAPES[type];
  const visualSize = ITEM_VISUAL_SCALE * 2; // 直径
  let mesh;

  // type 0,1,2,3,4 替换为对应的 3D 模型
  if (type >= 0 && type <= 4) {
    mesh = await load3DModel(scene, id, type);
    if (mesh) {
      // 适配模型尺寸：让模型的大小和原来球体一致
      mesh.computeWorldMatrix(true);
      mesh.refreshBoundingInfo();
      const boundingInfo = mesh.getBoundingInfo();
      const extendSize = boundingInfo.boundingBox.extendSizeWorld;
      const maxDim = Math.max(extendSize.x, extendSize.y, extendSize.z) * 2;
      const scale = maxDim > 0.001 ? visualSize / maxDim : 1;
      mesh.scaling.set(scale, scale, scale);

      // 修复碰撞：将 mesh 几何中心对齐到 pivot 原点，
      // 确保视觉中心与物理球心一致，防止其他形状"侵入"模型边缘
      mesh.computeWorldMatrix(true);
      mesh.refreshBoundingInfo();
      const center = mesh.getBoundingInfo().boundingBox.centerWorld;
      mesh.setPivotPoint(new BABYLON.Vector3(
        center.x / scale,
        center.y / scale,
        center.z / scale,
      ));
      // 将 pivot 偏移烘焙到顶点，使 position 就是几何中心
      mesh.bakeCurrentTransformIntoVertices();
      // 烘焙后清除 pivot，确保后续旋转/位移都以几何中心为基准
      mesh.setPivotPoint(BABYLON.Vector3.Zero());
      mesh.scaling.set(scale, scale, scale);
      mesh.computeWorldMatrix(true);
      mesh.refreshBoundingInfo();

      // 锅内随机旋转：让每个模型以不同角度展示
      mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      mesh.receiveShadows = true;
      mesh.metadata = { kind: 'item', itemId: id, itemType: type };
      return mesh;
    }
    // 加载失败回退到原始形状
  }

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
