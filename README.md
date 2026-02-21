# BBQ翻译 (Borderless Books Quickly)

> 生肉变熟肉，无界，快速。一款面向 Windows 桌面的漫画 AI 翻译工具，开箱即用，无需配置 Python 或独立显卡。

---

## ✨ 功能特性

- **全自动翻译管线**：文字检测 → OCR 识别 → AI 翻译 → 去字修复 → 文字渲染，一键完成
- **批量翻译**：支持拖拽导入图片、ZIP / CBZ / CBR 压缩包、PDF、EPUB
- **可视化编辑器**：Konva Canvas 文字框编辑，支持修改译文、字体、字号、方向、颜色，实时预览
- **书架管理**：MangaBook 书库，章节列表，历史翻译内容持久化
- **阅读器**：滚动 / 翻页双模式，键盘快捷键支持
- **拓展中心**：按需安装 MangaOCR / LaMa Large / CUDA 加速等高级模块
- **多翻译 API**：支持 DeepSeek / Gemini / ChatGPT / Groq / Custom OpenAI（Ollama 等）/ 百度 / 有道
- **纯本地运行**：所有数据存储在本地，无账号，无云端

---

## 💬 交流与反馈

遇到问题或想交流使用心得？欢迎扫码加入官方 QQ 交流群：

<p align="center">
  <img src="public/images/qq_group.png" alt="QQ交流群二维码" width="180" />
</p>

---

## 📦 安装使用（终端用户）

从 [Releases](https://github.com/phdwdm-lang/manga-studio/releases) 下载最新的 `.exe` 安装包，双击安装，开箱即用。

**最低硬件要求**：
- Windows 10 / 11 (64-bit)
- 内存 ≥ 8 GB
- 磁盘剩余空间 ≥ 2 GB

---

## 🛠️ 开发环境搭建

本项目为 **Electron + Next.js** 桌面应用，前端与嵌入式 Python 后端配合运行。  
后端代码以 **Git Submodule** 的形式包含在 `backend/` 目录中。

### 克隆项目（含后端子模块）

```bash
git clone --recurse-submodules https://github.com/phdwdm-lang/manga-studio.git
```

> 如已克隆但未拉取子模块：
> ```bash
> git submodule update --init --recursive
> ```

### 前置依赖

- Node.js 18+
- Python 3.10–3.11（仅开发时需要，生产包含嵌入式 Python）

### 安装前端依赖

```bash
npm install
```

### 开发模式（浏览器，连接外部 Python 后端）

```bash
# 先启动后端（在 backend/ 目录）
python backend/start_backend.py

# 再启动前端
npm run dev
```

### 开发模式（Electron 桌面，跳过后端）

```bash
npm run dev:desktop
```

### 开发模式（Electron + Next.js 同时启动）

```bash
npm run dev:all
```

---

## 🏗️ 构建打包

### 构建 Windows 安装包

```bash
npm run build:desktop
```

构建产物位于 `dist/` 目录，包含 `.zip` 压缩包（当前配置）。

> **重新生成应用图标**：若需更新 `build/icon.ico`，运行：
> ```powershell
> powershell -ExecutionPolicy Bypass -File scripts/generate-icon.ps1
> ```

> **注意**：构建前需确保 `resources/python/` 目录包含嵌入式 Python 环境，`resources/backend/` 包含后端代码与预置模型。  
> 参考：`scripts/build_embedded_python.ps1` 和 `scripts/build_desktop.ps1`

### 仅构建前端

```bash
npm run build:frontend
```

---

## 📁 项目结构

```
nextjs-tailwind-app/
├── electron/               # Electron 主进程与预加载脚本
│   ├── main.cjs            # 主进程：后端生命周期、IPC、窗口管理
│   └── preload.cjs         # 预加载：暴露 window.mts.* API
├── src/
│   ├── app/                # Next.js 页面路由
│   │   ├── page.tsx        # 首页（快速翻译）
│   │   ├── translate/      # 翻译编辑器
│   │   ├── shelf/          # 书架 + 书籍详情
│   │   └── reader/         # 阅读器
│   ├── components/         # React 组件
│   ├── constants/          # 常量与枚举
│   ├── hooks/              # Custom Hooks
│   ├── lib/                # 工具函数、存储、API 客户端
│   └── types/              # TypeScript 类型定义
├── scripts/                # 构建与打包脚本
├── docs/
│   ├── spec_document/      # 项目规范文档（PRD / APP_FLOW / TECH_STACK 等）
│   ├── scratchpad/         # 项目进度追踪
│   └── features/           # 功能设计文档
└── electron-builder.yml    # 桌面端打包配置
```

---

## 🔧 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳层 | Electron 30.0.0 + electron-builder 26.7.0 |
| 前端框架 | Next.js 16.1.0 + React 19.2.3 + TypeScript 5 |
| 样式 | TailwindCSS 4 |
| Canvas 编辑器 | Konva 10.0.12 + react-konva 19.2.1 |
| 图标 | Lucide React 0.540.0 |
| 文件解析 | pdfjs-dist 4.10.38 + jszip 3.10.1 |
| Python 后端 | FastAPI + uvicorn + PyTorch 2.6.0+cpu |
| 本地存储 | localStorage + IndexedDB（无服务端数据库） |

完整版本清单见 [`docs/spec_document/TECH_STACK.md`](docs/spec_document/TECH_STACK.md)。

---

## 📄 项目文档

| 文档 | 说明 |
|------|------|
| [PRD.md](docs/spec_document/PRD.md) | 产品需求规格 |
| [APP_FLOW.md](docs/spec_document/APP_FLOW.md) | 用户流程与页面导航 |
| [TECH_STACK.md](docs/spec_document/TECH_STACK.md) | 技术栈版本清单 |
| [FRONTEND_GUIDELINES.md](docs/spec_document/FRONTEND_GUIDELINES.md) | 设计系统与组件规范 |
| [BACKEND_STRUCTURE.md](docs/spec_document/BACKEND_STRUCTURE.md) | API 与数据模型蓝图 |
| [IMPLEMENTATION_PLAN.md](docs/spec_document/IMPLEMENTATION_PLAN.md) | 构建阶段路线图 |
| [scratchpad.md](docs/scratchpad/scratchpad.md) | 项目实时进度追踪 |

---

## 🔗 相关仓库

- **后端（Python AI 管线）**：[manga-image-translator](https://github.com/phdwdm-lang/manga-image-translator)（已作为 `backend/` submodule 引入）

---

## 📝 License

MIT
