# IMPLEMENTATION_PLAN — Step-by-Step Build Sequence

> 版本：v1.0 | 日期：2026-02-19  
> 状态标注：✅ 已完成 · 🔄 进行中 · ⬜ 待开始  
> **规则**：每个步骤均引用上述 5 份文档作为依据，每次编码前必须确认对应步骤已到达。

---

## Phase 0：工程基础（Engineering Foundation）✅

> 参考：`TECH_STACK.md §1`、`TECH_STACK.md §15`、`BACKEND_STRUCTURE.md §2`

### 0.1 前端 Standalone 构建配置 ✅
- 在 `next.config.ts` 中配置 `output: 'standalone'`。
- 验证 `npm run build:frontend` 产出 `standalone/server.js` + `.next/static/` + `public/`。
- 配置 `scripts/copy-standalone-assets.cjs` 自动复制静态资源到 standalone 目录。

### 0.2 Electron 主进程实现 ✅
- 实现 `electron/main.cjs`：后端子进程启动、健康检查轮询（500ms 间隔，180s 超时）、崩溃自动重启（最多 3 次，冷却 5s）。
- 实现动态端口检测（8000–8010），选定空闲端口。
- 实现前端 standalone server 启动（复用 Electron 内置 Node.js）。
- 创建 `BrowserWindow`，加载 `http://127.0.0.1:{frontendPort}/`。

### 0.3 Electron 预加载脚本 ✅
- 实现 `electron/preload.cjs`，通过 `contextBridge` 暴露 `window.mts.*` API。
- 暴露 IPC 频道：`open-import-dialog`、`read-file`、`list-dir-images`、`get-backend-url`、`restart-backend`、`get-app-paths`、`open-external`、`save-file-dialog`、`select-directory`、`backend-status`。

### 0.4 环境感知层 ✅
- 实现 `src/lib/env.ts`：
  - `IS_ELECTRON`：检测运行环境。
  - `getBackendUrl()`：Electron 环境读取 `window.mts.backendUrl`，浏览器环境读取 `NEXT_PUBLIC_API_BASE` 或默认 `http://127.0.0.1:8000`。

### 0.5 存储适配层 ✅
- 实现 `src/lib/desktopStorage.ts`：通过 IPC `mts-storage` 读写 `data/library.json`。
- 修改 `src/lib/storage.ts`：根据 `IS_ELECTRON` 切换 `localStorage` ↔ `desktopStorage`。

### 0.6 开发调试流程 ✅
- 验证 `npm run dev:desktop`：同时启动 Next.js dev server + Electron，热重载正常工作。
- 验证 `npm run dev`：纯前端浏览器模式，连接外部 Python 后端正常工作。

---

## Phase 1：嵌入式 Python 环境（Embedded Python）✅

> 参考：`TECH_STACK.md §8`、`TECH_STACK.md §9`、`BACKEND_STRUCTURE.md §1`

### 1.1 嵌入式 Python 环境搭建 ✅
- 下载 `python-3.11.x-embed-amd64.zip`，解压至 `scripts/build_embedded_python.ps1` 指定目录。
- 配置 `python._pth` 文件，启用 `site-packages` 和 `import site`。
- 安装 `pip`（bootstrap 方式）。

### 1.2 CPU 轻量依赖安装 ✅
- 执行 `pip install -r requirements-cpu-lite.txt --target python/Lib/site-packages`。
- 验证 PyTorch 2.6.0+cpu 安装成功（`import torch; print(torch.__version__)`）。
- 验证 FastAPI、uvicorn、onnxruntime 可正常导入。

### 1.3 依赖精简 ✅
- 执行 `scripts/cleanup_python.ps1`：
  - 删除 `__pycache__`、`.dist-info`、`.pyc` 文件。
  - 删除测试文件（`test_*.py`、`*_test.py`）。
  - 删除多余 locale 文件（保留 `zh_CN`、`en_US`）。
- 验证精简后 Python 环境体积 ≤ 400 MB。

### 1.4 后端启动脚本 ✅
- 实现 `start_backend.py`：
  - 接受 `--port`、`--data-dir`、`--extensions-dir` 命令行参数。
  - 设置 `HF_HOME`、`MTS_*` 环境变量。
  - 启动 `uvicorn app.main:app --host 127.0.0.1 --port {port}`。
  - 捕获信号，优雅退出（`SIGTERM`→模型卸载→exit）。

### 1.5 内置模型验证 ✅
- 将以下模型文件放入 `resources/backend/models/`：
  - `detection/detect-20241225.ckpt`
  - `ocr/ocr_ar_48px.ckpt`
  - `ocr/alphabet-all-v7.txt`
  - `inpainting/inpainting_lama_mpe.ckpt`
- 验证 `/scan` 端点能在纯 CPU 环境下完成一次完整翻译（≤ 30s，无 GPU）。

---

## Phase 2：核心功能联调（Feature Integration）✅

> 参考：`PRD.md §2`、`APP_FLOW.md §4–§10`、`BACKEND_STRUCTURE.md §3`

### 2.1 翻译全链路验证 ✅
- 从首页导入单张 PNG 图片，配置 DeepSeek API Key，点击翻译。
- 验证 `POST /scan` 返回 `translatedImage` + `regions`。
- 验证翻译图显示在 UI 中，`TranslatingCard` 正常展示进度。

### 2.2 批量翻译验证 ✅
- 从首页导入 ZIP 压缩包（含 5+ 张图片），触发批量翻译。
- 验证逐页翻译进度展示，翻译完成后书架「快速翻译」区出现新章节。
- 验证取消批量翻译（`AbortController`）能正常中断并标记状态为 `canceled`。

### 2.3 编辑器全链路验证 ✅
- 从首页进入编辑模式（`/translate?workspace=1`）。
- 验证 Canvas 上文字框正确显示，点击框后右侧面板显示对应属性。
- 验证修改译文后「重新渲染」（`POST /render_page`）返回新图片。
- 验证手动绘制新框→OCR（`POST /ocr_region`）→填充文字。
- 验证「保存到书架」后书架出现对应章节。

### 2.4 阅读器验证 ✅
- 从书架章节进入阅读器，验证滚动模式和翻页模式正常工作。
- 验证键盘快捷键（`←`/`→`/`Esc`）正常响应。
- 验证从阅读器跳转到编辑器（顶部「编辑」按钮）正常工作。

### 2.5 拓展中心 UI 联调 ✅
- 验证 `GET /extensions/list` 返回正确的拓展列表。
- 验证在线安装流程（以 `mocr` 为例）：下载进度实时更新，完成后状态变为「已安装」。
- 验证离线导入流程（本地 `.zip` 文件）。
- 验证取消安装（`POST /extensions/cancel`）。
- 验证卸载（`POST /extensions/uninstall`）。

### 2.6 API 凭证管理联调 ✅
- 在设置弹窗填入 DeepSeek API Key，点击验证（`POST /verify_api_key`）。
- 验证 Key 有效时显示绿色✓，无效时显示错误信息。
- 验证保存后翻译请求正确携带 Key 头（`x-deepseek-api-key`）。
- 验证 Key 缺失时翻译请求返回 `missing_api_key` 错误，前端弹出引导提示。

### 2.7 文件系统 IPC 适配 ✅
- 验证文件导入通过 Electron `open-import-dialog` IPC 打开系统文件对话框。
- 验证导出章节通过 `save-file-dialog` IPC 打开保存对话框，ZIP 文件正确写入磁盘。
- 验证 `select-directory` IPC 替代浏览器 File System Access API。

### 2.8 字体管理联调 ⬜（待测试——缺乏测试用字体文件）
- [ ] 验证 `GET /fonts/list` 返回内置字体列表。
- [ ] 验证上传自定义字体（`POST /fonts/upload`），编辑器字体选择器中出现新字体。
- [ ] 验证删除自定义字体后选择器中消失。

> ⚠️ **阻塞原因**：目前无可用测试字体文件，等待字体文件就绪后执行本步骤。

---

## Phase 3：打包与分发（Packaging & Distribution）🔄

> 参考：`TECH_STACK.md §15`、`DESKTOP_APP_DESIGN.md §六`

### 3.1 electron-builder 配置完善 🔄
- 检查 `electron-builder.yml`，确认：
  - `appId`、`productName`（BBQ翻译）、`win.target: nsis` 配置正确。
  - `files` 数组包含 `resources/standalone/**`。
  - `extraResources` 包含 `python/**`（嵌入式 Python）和 `backend/**`（后端代码）。
  - NSIS 配置：安装路径可自定义、创建桌面快捷方式、卸载程序。

### 3.2 资源目录结构验证 🔄
- 运行 `npm run build:desktop`，检查产出目录结构符合 `DESKTOP_APP_DESIGN.md §6.1`：
  ```
  resources/
  ├── standalone/          # Next.js standalone
  ├── python/              # 嵌入式 Python
  └── backend/             # 后端代码 + 模型
  ```

### 3.3 安装包体积验证 ⬜
- 测量压缩后安装包体积，目标 ≤ 500 MB（参见 `PRD.md §7` 约束）。
- 若超标，执行：
  - 确认 `scripts/cleanup_python.ps1` 已充分精简。
  - 检查是否有不必要的大文件打入包中（如开发依赖、文档文件）。

### 3.4 全流程冒烟测试（Smoke Test）⬜
- 在一台**全新 Windows 10/11 系统**（无 Python、无 Node.js）上执行：
  1. 安装 → 无报错。
  2. 启动 → 冷启动时间 ≤ 15s（HDD）。
  3. 导入单张图片。
  4. 配置 API Key。
  5. 翻译 → 成功显示翻译图。
  6. 编辑文字框 → 修改译文 → 重新渲染。
  7. 导出章节 ZIP → 文件可正常打开。
  8. 安装拓展（`mocr`）→ 安装成功。
  9. 卸载程序 → 无残留文件。
- 参见 `docs/DESKTOP_PACKAGING_TEST_PLAN.md` 完整测试清单。

### 3.5 安装包签名（可选）⬜
- 若需要避免 Windows SmartScreen 警告，配置代码签名证书。
- 在 `electron-builder.yml` 的 `win.signingHashAlgorithms` 中配置。

### 3.6 发布产物归档 ⬜
- 将产出的 `.exe` 安装包归档，记录版本号、构建日期、SHA256 校验值。
- 更新发布说明（`CHANGELOG`）。

---

## Phase 4：稳定性加固（Stability Hardening）⬜

> 参考：`PRD.md §5`、`BACKEND_STRUCTURE.md §9`

### 4.1 错误边界完善 ⬜
- 在 React 组件层添加 `ErrorBoundary`，防止组件崩溃导致白屏。
- 在 `electron/main.cjs` 中完善后端崩溃重启逻辑，展示用户友好的错误页面（含日志路径）。
- 验证：强制杀死后端进程 → 前端显示「后端离线」状态 → 自动重启 → 恢复正常。

### 4.2 统一日志体系 ⬜
- 后端：确认 `app/core/logging_config.py` 输出到 `logs/` 目录，格式包含时间戳、级别、模块名。
- Electron 主进程：后端 stdout/stderr 输出重定向至 `data/logs/backend.log`。
- 前端：关键操作（翻译开始/结束/失败）记录到 `console` 或 Electron 日志。
- 验证：发生翻译错误后，用户能在 `data/logs/` 中找到对应错误详情。

### 4.3 内存监控与防护 ⬜
- 后端定期（每 30s）汇报当前内存使用（通过 `GET /health` 返回 `memory_mb` 字段）。
- 前端后台轮询 `/health`，若内存超过阈值（如 1.8 GB），在顶部状态栏显示警告。
- 验证：翻译大分辨率图片时，内存峰值 ≤ 1.5 GB（i5-12400，无 GPU）。

### 4.4 首次启动引导流程 ⬜
- 检测是否为首次启动（读取 `localStorage: mts.first_launch`）。
- 首次启动时：
  1. 显示「欢迎使用 BBQ翻译」引导页。
  2. 提示用户配置翻译 API Key（引导至设置弹窗「账号管理」Tab）。
  3. 提示后端启动进度（Loading 动画）。
  4. 引导完成，写入 `mts.first_launch = done`，进入主界面。
- 参见 `APP_FLOW.md §3` 启动流程。

### 4.5 大图片自动缩放保护 ⬜
- 在 `POST /scan` 前检测图片分辨率，若超过 `4096×4096`，自动等比缩放至安全尺寸。
- 前端展示缩放提示（「原图过大，已自动缩放至 X × Y」）。

### 4.6 LocalStorage 容量监控 ⬜（Web 模式）
- 在书架写入操作前调用 `checkStorageCapacity()`，检测 `localStorage` 剩余容量。
- 若接近 5 MB 上限，弹出警告提示用户清理旧章节。
- **Electron 模式**：数据存储在 `data/library.json`，无此限制。

---

## 附录：文档交叉引用索引

| 文档 | 引用关系 |
|------|----------|
| `PRD.md` | 定义"做什么"，是所有后续文档的业务依据 |
| `APP_FLOW.md` | 引用 `PRD.md` 的功能点，描述"如何用" |
| `TECH_STACK.md` | 引用 `PRD.md` 的约束（体积/性能），锁定"用什么做" |
| `FRONTEND_GUIDELINES.md` | 引用 `TECH_STACK.md` 的前端技术栈，定义"怎么画" |
| `BACKEND_STRUCTURE.md` | 引用 `PRD.md` 的功能列表，描述"后端怎么做" |
| `IMPLEMENTATION_PLAN.md` | 引用所有 5 份文档，逐步执行 |

> **使用规则**：每次开始一个编码步骤前，必须先阅读该步骤引用的文档章节，以文档为唯一判断依据，不得凭记忆假设。
