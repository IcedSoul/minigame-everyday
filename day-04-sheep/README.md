## Day 4 · 《羊了个羊：星球》核心玩法复刻

经典三消堆叠游戏的最小可玩复刻。基于 Phaser 3 + 微信小游戏适配器，单端代码双端运行（网页 + 微信小游戏）。

### 玩法

- 牌堆中堆叠 108 张卡片（12 类型 × 9 张），混合堆叠：上半区金字塔整齐塔，下半区随意散乱
- 卡片之间互相部分遮挡：被上层覆盖面积 < 5% 的卡片才高亮可点
- 点击未遮挡卡片 → 飞入底部 7 格卡槽
- 槽内自动按类型聚合排序（同类型相邻）
- 槽内连续 3 张同类型 → 立即消除 + 后续卡片左移
- 槽满 7 张未消 → 失败；牌堆全清 → 胜利

### 运行

**网页端**：
```bash
npx http-server .
# 访问 http://localhost:8080/index.html
```

**微信小游戏**：在微信开发者工具中导入本目录，或使用 `weixin-minigame-helper` 一键预览。

### 项目结构

```
day-04-sheep/
├── game.js                       # 微信小游戏入口
├── game.json
├── project.config.json
├── index.html
├── js/
│   ├── main.js                   # Phaser 启动 + viewport 适配
│   ├── libs/
│   │   ├── phaser.min.js
│   │   ├── weapp-phaser3-adapter.min.js
│   │   └── symbol.js
│   ├── core/
│   │   ├── config.js             # 类型 / 尺寸 / 颜色 / 阈值常量
│   │   └── LevelGenerator.js     # 混合堆叠关卡生成
│   └── scene/
│       └── GameScene.js          # 主玩法场景（遮挡 / 卡槽 / 三消）
└── README.md
```

### 设计文档

完整的玩法分析、技术方案、踩坑记录见 [`doc/04-day-sheep-plan.md`](../doc/04-day-sheep-plan.md)。