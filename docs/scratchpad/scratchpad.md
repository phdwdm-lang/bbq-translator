# BBQ Translator - Project Status (Scratchpad)

## 📍 Current Phase (当前阶段)
- [x] Phase 0: 工程基础 (Electron 主进程、预加载脚本、环境感知层、存储适配层)
- [x] Phase 1: 嵌入式 Python 环境 (Python 3.11 embed + CPU 轻量依赖 + 内置模型)
- [x] Phase 2: 核心功能联调 (翻译管线、编辑器、书架、阅读器、拓展中心、凭证管理)
- [ ] **Phase 3: 打包与分发（进行中）** — electron-builder NSIS 安装包 + 冒烟测试
- [ ] Phase 4: 稳定性加固 (错误边界、日志体系、首次启动引导、内存监控)

## 🔄 Active Task (正在进行的任务)
> Phase 3 — 完善 `electron-builder.yml`，生成 Windows NSIS 安装包，在全新系统执行冒烟测试。
> 参考：`docs/spec_document/IMPLEMENTATION_PLAN.md §Phase 3`

## 📝 Recent Decisions & Context (最近决策与上下文)
- **产品名称**：BBQ翻译（Borderless Books Quickly）
- **核心理念**：生肉变熟肉，无界，快速，开箱即用（无需 Python / GPU）
- **平台范围**：仅 Windows 桌面端（Electron 打包版），暂不支持 macOS / Linux
- **存储架构**：纯本地，无服务端数据库。元数据存 `localStorage` / `data/library.json`，图片 Blob 存 IndexedDB。**无 Supabase，无云端。**
- **UI 主题**：永久亮色，无暗色模式（config 中 dark 字段为占位，不实现）
- **文档位置**：6 份规范文档均在 `docs/spec_document/`
- **翻译 API**：DeepSeek / Gemini / Custom OpenAI / Groq — Key 存 localStorage，通过请求头传递，不经后端持久化
- **OCR 引擎（核心包内置）**：`32px` / `48px` / `48px_ctc`；MangaOCR 为拓展模块按需安装
- **拓展模块**：mocr / lama_large / cuda — 通过拓展中心在线下载或离线导入

## 📋 Backlog / Next Steps (待办事项)

### Phase 3（进行中）
- [ ] 检查 `electron-builder.yml`：appId / productName / extraResources 路径正确
- [ ] 运行 `npm run build:desktop`，验证产出目录结构
- [ ] 测量安装包压缩体积（目标 ≤ 500 MB）
- [ ] 在全新 Windows 系统执行冒烟测试（参考 `docs/DESKTOP_PACKAGING_TEST_PLAN.md`）
- [ ] 安装包签名（可选，避免 SmartScreen 警告）
- [ ] 发布产物归档（记录版本、SHA256）

### Phase 4（待开始）
- [ ] React ErrorBoundary + Electron 崩溃重启友好页面
- [ ] 统一日志体系（后端 → `data/logs/backend.log`）
- [ ] 首次启动引导流程（API Key 配置引导）
- [ ] 内存峰值监控（`/health` 返回 `memory_mb`，前端警告）
- [ ] 大图片自动缩放保护（超过 4096×4096 自动缩）

## 🛑 Known Issues / Blockers (已知问题)
- **字体管理功能未完成端到端测试**：后端 API（`/fonts/list`、`/fonts/upload`、`/fonts/delete`）已实现，但缺乏测试用 `.ttf` / `.otf` 字体文件，上传→编辑器选择→渲染全流程尚未验证。等待字体文件就绪后执行 `IMPLEMENTATION_PLAN.md §2.8`。