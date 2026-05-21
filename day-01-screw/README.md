## Phaser 网页/微信小游戏双端模板

这是一个基于 Phaser 3 的跨平台游戏开发模板，同时支持网页端和微信小游戏平台。

## 项目特点

- ✅ 同时支持网页浏览器和微信小游戏双端运行
- ✅ 基于 Phaser 3 游戏引擎
- ✅ 统一的代码库，一次开发，双端部署
- ✅ 支持 ES6+ 模块化开发
- ✅ 内置 Worker 多线程支持

## 项目结构

```
Phaser-wx/
├── index.html              # 网页端入口文件（仅做加载，请勿修改）
├── game.js                 # 微信小游戏入口文件
├── game.json               # 微信小游戏配置文件
├── project.config.json     # 微信开发者工具配置
├── js/
│   ├── main.js            # 主程序入口
│   ├── core/              # 核心模块（独立分包）
│   │   └── game.js
│   ├── scene/             # 场景文件
│   │   └── UIScene.js     # UI场景示例
│   ├── libs/              # 第三方库
│   │   ├── phaser.min.js
│   │   ├── weapp-phaser3-adapter.min.js
│   │   └── symbol.js
│   └── worker/            # Worker 多线程
│       ├── index.js
│       └── worker.js
└── README.md
```

## 快速开始

### 网页端开发

1. **启动开发服务器**
   ```bash
   # 使用任意 HTTP 服务器，例如：
   npx http-server
   # 或
   python -m http.server 8000
   ```

2. **访问应用**
   
   在浏览器中打开 `http://localhost:8000/index.html`

3. **入口说明**
   - 网页端入口：`index.html`
   - **重要：`index.html` 仅用于加载，请勿修改此文件**
   - 所有业务逻辑从 `js/main.js` 开始编写

### 微信小游戏开发

1. **安装微信开发者工具**
   
   从[微信官方网站](https://developers.weixin.qq.com/minigame/dev/devtools/download.html)下载并安装

2. **导入项目**
   - 打开微信开发者工具
   - 选择"小游戏"项目类型
   - 导入本项目目录
   - AppID 可使用测试号

3. **入口说明**
   - 微信小游戏入口：`game.js`
   - 配置文件：`game.json`、`project.config.json`

## 开发规范

### ⚠️ 重要约束

由于微信小游戏环境**没有 DOM**，为了保证双端兼容性，必须遵守以下规则：

1. **禁止操作浏览器 DOM**
   - ❌ 不要使用 `document.getElementById()`
   - ❌ 不要使用 `document.createElement()`
   - ❌ 不要使用 `document.querySelector()`
   - ❌ 不要直接操作 HTML 元素

2. **所有 UI 必须在 Phaser 画布内实现**
   - ✅ 使用 Phaser 的 Scene 系统
   - ✅ 使用 Phaser 的 Text、Image、Sprite 等对象
   - ✅ 使用 Phaser 的事件系统处理交互

3. **入口文件保护**
   - ✅ `index.html` 仅用于加载，不要修改
   - ✅ 业务代码从 `js/main.js` 开始编写

### 开发示例

#### 创建新场景

```javascript
// js/scene/MyScene.js
export class MyScene extends Phaser.Scene {
    constructor() {
        super();
        this.key = "MYSCENE";
    }

    init(data) {
        // 初始化场景数据
    }

    preload() {
        // 加载资源
        this.load.image('logo', 'assets/logo.png');
    }

    create() {
        // 创建游戏对象
        const logo = this.add.image(400, 300, 'logo');
        
        // 添加文本（双端兼容）
        this.add.text(400, 450, '欢迎使用', {
            fontSize: '32px',
            fill: '#ffffff'
        }).setOrigin(0.5);
        
        // 添加交互（双端兼容）
        logo.setInteractive();
        logo.on('pointerdown', () => {
            console.log('点击了 logo');
        });
    }

    update() {
        // 游戏循环更新
    }
}
```

#### 在主程序中注册场景

```javascript
// js/main.js
import { MyScene } from './scene/MyScene.js';

export class Main {
    constructor() {
        const config = {
            type: Phaser.AUTO,
            width: 1200,
            height: 900,
            scene: [MyScene]  // 注册场景
        };
        
        new Phaser.Game(config);
    }
}

new Main();
```

## 双端差异处理

### 平台检测

```javascript
// 检测当前运行平台
const isWeChat = typeof wx !== 'undefined';

if (isWeChat) {
    // 微信小游戏特有逻辑
    console.log('运行在微信小游戏');
} else {
    // 网页端特有逻辑
    console.log('运行在浏览器');
}
```

### Worker 使用

项目已配置 Worker 支持，可用于处理复杂计算：

```javascript
// 在 game.js 中已导出 worker
import { worker } from './game.js';

// 发送消息
worker.postMessage({
    type: 'calculate',
    data: [1, 2, 3]
});

// 接收消息
worker.onMessage((res) => {
    console.log('Worker 返回:', res);
});
```

## 资源管理

### 资源加载

```javascript
preload() {
    // 图片资源
    this.load.image('key', 'path/to/image.png');
    
    // 音频资源
    this.load.audio('bgm', 'path/to/audio.mp3');
    
    // 精灵图
    this.load.spritesheet('player', 'path/to/spritesheet.png', {
        frameWidth: 32,
        frameHeight: 32
    });
}
```

### 资源路径

- 网页端：相对于 `index.html` 的路径
- 微信端：相对于 `game.js` 的路径
- 建议使用相对路径以保证双端兼容

## 调试技巧

### 网页端调试

- 使用浏览器开发者工具（F12）
- Console 查看日志
- Network 查看资源加载

### 微信端调试

- 微信开发者工具内置调试器
- Console 面板查看日志
- 真机调试：工具栏 -> 预览 -> 扫码真机调试

## 发布部署

### 网页端发布

1. 将整个项目上传到 Web 服务器
2. 确保服务器支持 HTTPS（推荐）
3. 访问 `index.html` 即可运行

### 微信小游戏发布

1. 在微信开发者工具中点击"上传"
2. 填写版本号和项目备注
3. 登录[微信公众平台](https://mp.weixin.qq.com/)
4. 进入"版本管理"提交审核
5. 审核通过后发布上线

## 常见问题

### Q: 为什么不能使用 DOM 操作？

A: 微信小游戏运行在 JavaScript 引擎中，没有浏览器的 DOM 环境。为了保证代码双端兼容，必须只使用 Phaser 提供的 API。

### Q: 如何添加按钮？

A: 使用 Phaser 的 Image 或 Sprite 配合 `setInteractive()` 方法：

```javascript
const button = this.add.image(400, 300, 'button');
button.setInteractive();
button.on('pointerdown', () => {
    console.log('按钮被点击');
});
```

### Q: 如何处理不同屏幕尺寸？

A: 使用 Phaser 的缩放模式：

```javascript
const config = {
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
};
```

## 技术栈

- **游戏引擎**: Phaser 3
- **开发语言**: JavaScript (ES6+)
- **微信适配**: weapp-phaser3-adapter
- **模块化**: ES Modules

## 相关链接

- [Phaser 官方文档](https://phaser.io/docs)
- [微信小游戏开发文档](https://developers.weixin.qq.com/minigame/dev/guide/)
- [Phaser 示例](https://phaser.io/examples)

## 许可证

MIT License

---

**开发建议**：始终在双端测试你的代码，确保功能在网页和微信小游戏中都能正常运行。