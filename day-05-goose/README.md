# 抓大鹅 · Day 5

`minigame-everyday` 系列第 5 天：3D 三消游戏。

## 玩法
- 圆柱锅内堆叠 54 个 3D 物品（9 类型 × 6 个），随机洗牌生成
- 点击未被遮挡的物品 → 飞入屏幕底部 7 槽
- 槽内同类型自动聚合，3 个连续相同 → 消除
- **核心特色**：摇晃手机 → 锅内物品翻飞起来，方便看清下面的物品
- 倒计时 3 分钟内消完所有物品 = 胜利；槽满 7 张未消 / 超时 = 失败

## 技术栈
- 渲染：[Babylon.js 7.x](https://babylonjs.com)（UMD 全量包）
- GUI：Babylon GUI（屏幕空间 UI）
- 物理：**自写极简物理引擎**（球-球 / 球-圆柱壁 / 球-底盘 碰撞，~250 行）
- 平台：浏览器 + 微信小游戏（双入口）

## 为什么不用 Cannon-es / Havok / Ammo？
- **微信小游戏沙盒**：WASM 物理引擎（Havok / Ammo）易踩坑
- **Cannon-es ESM 兼容**：在小游戏里需要再打 UMD，不值得
- **本游戏物理需求极窄**：只有"球在圆柱内自由落体 + 弹性碰撞"，自写 200 行更可控

## 目录结构
```
day-05-goose/
├── game.js / game.json      微信小游戏入口
├── index.html               浏览器入口
├── project.config.json      微信开发者工具配置
├── js/
│   ├── libs/                Babylon.js + Symbol polyfill
│   ├── core/
│   │   ├── config.js        所有常量（关卡 / 物理 / 动画 / 视觉）
│   │   ├── PhysicsWorld.js  自写物理引擎
│   │   ├── ItemFactory.js   3D 几何体 + 容器 mesh 工厂
│   │   ├── LevelGenerator.js 54 个物品的初始位置 / 类型
│   │   └── ShakeDetector.js 加速度计（wx / DeviceMotion / 键盘三套兼容）
│   ├── scene/
│   │   └── GameScene.js     主玩法（相机 / 灯光 / GUI / 拾取 / 三消逻辑）
│   └── main.js              引擎入口
```

## 运行
### 浏览器
```bash
cd day-05-goose
python3 -m http.server 8080
# 打开 http://localhost:8080
```

### 微信小游戏
用「微信开发者工具」打开本目录即可。

## 操作
- **点击物品** → 送入下方槽位
- **点击右上 🤹「甩一甩」** → 锅内物品翻飞（开发模式）
- **手机猛甩** → 同上（陀螺仪）
- **键盘** ← → ↑ ↓ Space → 模拟甩动（开发用）
