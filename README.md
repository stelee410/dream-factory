# DreamFactory 梦工厂

AI 短剧生成器 —— 采访数字角色、生成剧本、分镜、视频，全部在终端完成。

## 安装

需要 **Node.js >= 20** 和 **ffmpeg**。

```bash
# macOS 安装 ffmpeg（如已有可跳过）
brew install ffmpeg

# 安装 DreamFactory
npm install -g dreamfactory
```

## 获取账户

DreamFactory 需要 [linkyun.co](https://linkyun.co) Creator 账户。

通过以下方式获取邀请码注册：

- **微信**：添加 `stephenliy`
- **Discord**：[https://discord.gg/52e7QPaX](https://discord.gg/52e7QPaX)

## 使用

```bash
# 首次使用，配置 API 密钥
dreamfactory init

# 启动创作（Agent 模式 — AI 自动调度完整流程）
dreamfactory

# 线性模式（逐步引导，手动控制每个环节）
dreamfactory linear

# 继续上次的项目
dreamfactory last

# 继续指定项目
dreamfactory <项目目录路径>

# 查看帮助
dreamfactory --help
```

### Agent 模式

默认模式。AI 助手理解自然语言指令，自动调用流水线工具完成创作：选角、采访、生成剧本、分镜图、视频，支持随时回退重做任意步骤。

### Linear 模式

逐步引导模式，按固定顺序完成每个环节：登录 → 选角 → 采访 → 生成人物档案 → 设定主题 → 选择导演风格 → 生成大纲 → 生成剧本 → 生成分镜 → 生成视频。

## License

MIT
