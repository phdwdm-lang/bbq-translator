# TECH_STACK — Technology Stack

> 版本：v1.0 | 日期：2026-02-19 | 状态标注：✅ 已实现 · ⬜ 待实现  
> **规则**：所有版本号精确锁定，禁止使用 "latest" 或无版本号的库名。

---

## 1. 桌面壳层（Desktop Shell）✅

| 技术 | 版本 | 用途 | 来源 |
|------|------|------|------|
| **Electron** | `30.0.0` | 桌面窗口管理、IPC、系统托盘、后端进程生命周期 | `package.json devDependencies` |
| **electron-builder** | `26.7.0` | 打包 Windows NSIS 安装程序 | `package.json devDependencies` |
| **electronmon** | `2.0.3` | 开发时热重载 Electron 主进程 | `package.json devDependencies` |
| **concurrently** | `9.2.1` | 开发时并行运行 Next.js dev + Electron | `package.json devDependencies` |
| **cross-env** | `10.1.0` | 跨平台设置环境变量（开发脚本） | `package.json devDependencies` |

**关键文件**：
- `electron/main.cjs` — Electron 主进程（后端生命周期、IPC、窗口管理）✅
- `electron/preload.cjs` — 预加载脚本（暴露 `window.mts.*` API 给渲染进程）✅
- `electron-builder.yml` — 打包配置（目标平台、资源路径、NSIS 配置）✅

---

## 2. 前端框架（Frontend Framework）✅

| 技术 | 版本 | 用途 | 来源 |
|------|------|------|------|
| **Next.js** | `16.1.0` | React 应用框架，`output: 'standalone'` 产出独立服务器 | `package.json dependencies` |
| **React** | `19.2.3` | UI 渲染库 | `package.json dependencies` |
| **React DOM** | `19.2.3` | React DOM 绑定 | `package.json dependencies` |
| **TypeScript** | `^5`（≥5.0） | 静态类型检查 | `package.json devDependencies` |

**构建输出**：`next build` → `output: 'standalone'`，产出 `server.js` + `.next/static/`，由 Electron 内置 Node.js 运行，无需额外 Node 运行时。

---

## 3. 样式系统（Styling）✅

| 技术 | 版本 | 用途 | 来源 |
|------|------|------|------|
| **TailwindCSS** | `^4`（≥4.0） | 原子化 CSS 工具类 | `package.json devDependencies` |
| **@tailwindcss/postcss** | `^4` | PostCSS 插件集成 | `package.json devDependencies` |
| **PostCSS** | 随 @tailwindcss/postcss | CSS 处理 | `postcss.config.mjs` |

**设计系统变量定义**：见 `src/app/globals.css`（CSS 自定义属性）。

---

## 4. UI 组件与图标（UI Components & Icons）✅

| 技术 | 版本 | 用途 | 来源 |
|------|------|------|------|
| **Lucide React** | `0.540.0` | SVG 图标库 | `package.json dependencies` |

> 项目**无引入 shadcn/ui 或其他组件库**。所有 UI 组件均为自研，位于 `src/components/`。

---

## 5. Canvas 与图像处理（Canvas & Image）✅

| 技术 | 版本 | 用途 | 来源 |
|------|------|------|------|
| **Konva** | `10.0.12` | 2D Canvas 引擎，用于编辑器文字框绘制与交互 | `package.json dependencies` |
| **react-konva** | `19.2.1` | Konva 的 React 封装 | `package.json dependencies` |
| **use-image** | `1.1.4` | 在 Konva 中加载图片为 HTML Image 元素 | `package.json dependencies` |
| **pdfjs-dist** | `4.10.38` | PDF 文件解析与每页渲染为图片 | `package.json dependencies` |
| **jszip** | `3.10.1` | ZIP / CBZ / CBR 解压 | `package.json dependencies` |

---

## 6. API 客户端（API Client）✅

| 技术 | 版本 | 用途 | 来源 |
|------|------|------|------|
| **@google/generative-ai** | `0.24.1` | Gemini API 直接调用（前端调用场景） | `package.json dependencies` |

> 大部分翻译 API 调用通过后端 Python 代理，前端仅负责传递凭证头（`loadCredentialHeaders()`）。

---

## 7. 本地存储（Local Storage）✅

| 技术 | 版本 | 用途 | 实现文件 |
|------|------|------|----------|
| **localStorage** | 浏览器原生 | 书架元数据（MangaBook/Chapter/Page JSON）、用户设置、API Key | `src/lib/storage.ts` |
| **IndexedDB** | 浏览器原生 | 图片 Blob 数据（原图、译图、渲染图） | `src/lib/blobDb.ts` |
| **Electron desktopStorage** | 自研（基于 IPC） | Electron 环境下替代 localStorage，读写 `data/library.json` | `src/lib/desktopStorage.ts` |

> **存储策略**：运行时通过 `IS_ELECTRON` 标志（`src/lib/env.ts`）自动切换 localStorage → desktopStorage。

---

## 8. Python 后端（Backend）✅

| 技术 | 版本 | 用途 | 来源 |
|------|------|------|------|
| **Python** | `3.10–3.11`（嵌入式 3.11） | 运行时，嵌入式 Python embed amd64 | `pyproject.toml requires-python` |
| **FastAPI** | 最新兼容版（≥0.100.0） | Web 框架，提供 REST API | `requirements.txt` |
| **uvicorn** | 最新兼容版 | ASGI 服务器，承载 FastAPI | `requirements.txt` |
| **pydantic** | `2.5.0` | 请求/响应数据验证 | `requirements-cpu-lite.txt` |
| **python-multipart** | 最新兼容版 | 处理 `multipart/form-data`（文件上传） | `requirements.txt` |

---

## 9. AI / ML 推理（AI Pipeline）✅

| 技术 | 版本 | 用途 | 来源 |
|------|------|------|------|
| **PyTorch** | `2.6.0+cpu` | 深度学习推理（检测器、Inpainting） | `requirements-cpu-lite.txt` |
| **torchvision** | `0.21.0+cpu` | 图像预处理，配合 PyTorch | `requirements-cpu-lite.txt` |
| **onnxruntime** | 最新兼容版 | ONNX 格式推理（CTD 检测器，CPU 友好） | `requirements-cpu-lite.txt` |
| **opencv-python-headless** | 最新兼容版 | 图像处理（无 GUI 版本，适合服务端） | `requirements-cpu-lite.txt` |
| **Pillow** | 最新兼容版 | 图像 I/O（读写 PNG/JPEG/WebP） | `requirements-cpu-lite.txt` |
| **numpy** | `1.26.4` | 数值计算 | `requirements-cpu-lite.txt` |
| **transformers** | 最新兼容版 | 模型加载（MangaOCR 拓展使用） | `requirements-cpu-lite.txt` |
| **huggingface_hub** | 最新兼容版 | 模型文件下载（HF Mirror 支持） | `requirements-cpu-lite.txt` |
| **kornia** | 最新兼容版 | 几何变换、图像处理 | `requirements-cpu-lite.txt` |
| **scikit-image** | 最新兼容版 | 图像算法 | `requirements-cpu-lite.txt` |
| **einops** | 最新兼容版 | 张量操作 | `requirements-cpu-lite.txt` |

---

## 10. 翻译 API 客户端（Translation API Clients）✅

| 技术 | 版本 | 用途 | 来源 |
|------|------|------|------|
| **openai** | `1.63.0` | OpenAI / DeepSeek / Custom OpenAI API 调用 | `requirements-cpu-lite.txt` |
| **google-genai** | 最新兼容版 | Google Gemini API 调用 | `requirements-cpu-lite.txt` |
| **groq** | 最新兼容版 | Groq API 调用 | `requirements-cpu-lite.txt` |
| **deepl** | 最新兼容版 | DeepL API 调用 | `requirements-cpu-lite.txt` |
| **httpx** | `0.27.2` | 异步 HTTP 客户端（API 请求） | `requirements-cpu-lite.txt` |
| **aiohttp** | 最新兼容版 | 异步 HTTP（部分翻译器使用） | `requirements-cpu-lite.txt` |
| **requests** | 最新兼容版 | 同步 HTTP 客户端 | `requirements-cpu-lite.txt` |

---

## 11. 后端工具库（Backend Utilities）✅

| 技术 | 版本 | 用途 | 来源 |
|------|------|------|------|
| **freetype-py** | 最新兼容版 | 字体渲染（将译文嵌入图片） | `requirements-cpu-lite.txt` |
| **py3langid** | `0.2.2` | 语言检测 | `requirements-cpu-lite.txt` |
| **sentencepiece** | 最新兼容版 | 文本分词 | `requirements-cpu-lite.txt` |
| **python-bidi** | 最新兼容版 | 双向文本（阿拉伯语/希伯来语） | `requirements-cpu-lite.txt` |
| **arabic-reshaper** | 最新兼容版 | 阿拉伯语字形重塑 | `requirements-cpu-lite.txt` |
| **pyclipper** | 最新兼容版 | 多边形裁剪（文字框处理） | `requirements-cpu-lite.txt` |
| **shapely** | 最新兼容版 | 几何运算 | `requirements-cpu-lite.txt` |
| **cryptography** | 最新兼容版 | 加密支持 | `requirements-cpu-lite.txt` |
| **ImageHash** | 最新兼容版 | 图片哈希（去重检测） | `requirements-cpu-lite.txt` |
| **aiofiles** | 最新兼容版 | 异步文件 I/O | `requirements-cpu-lite.txt` |
| **python-dotenv** | 最新兼容版 | 环境变量加载 | `requirements-cpu-lite.txt` |
| **nest-asyncio** | 最新兼容版 | 允许嵌套事件循环 | `requirements-cpu-lite.txt` |
| **rusty-manga-image-translator** | 最新兼容版 | Rust 加速组件（检测后处理） | 特殊 index |

---

## 12. 内置模型（Bundled Models）✅

以下模型随安装包内置在 `resources/backend/models/` 目录，无需额外下载：

| 模型 | 用途 | 磁盘体积 | 推理设备 |
|------|------|----------|----------|
| `detect-20241225.ckpt` | 文字检测（DBConvNext） | ~30 MB | CPU |
| `ocr_ar_48px.ckpt` | OCR 识别（48px_ctc） | ~15 MB | CPU |
| `alphabet-all-v7.txt` | OCR 字符集 | <1 MB | — |
| `inpainting_lama_mpe.ckpt` | 去字修复（LaMa MPE） | ~50 MB | CPU |

---

## 13. 可选拓展模型（Extension Models）⬜

通过拓展中心按需安装，**不包含在初始安装包中**：

| 拓展 ID | 模型 | 体积 | 依赖 |
|---------|------|------|------|
| `mocr` | `kha-white/manga-ocr-base` | ~400 MB | 推荐 CUDA |
| `lama_large` | `lama_large_512px.ckpt` | ~350 MB | 推荐 CUDA |
| `cuda` | PyTorch CUDA 版（`cu118/cu121/cu124`） | ~2.5 GB | NVIDIA 显卡 |

---

## 14. 开发工具（Dev Tools）

| 技术 | 版本 | 用途 |
|------|------|------|
| **ESLint** | `^9` | TypeScript/JSX 代码规范检查 |
| **eslint-config-next** | `16.1.0` | Next.js ESLint 规则集 |
| **pytest** | `≥6.0` | 后端 Python 单元测试 |

---

## 15. 构建与打包流水线（Build Pipeline）⬜→✅

| 步骤 | 工具 | 命令 | 状态 |
|------|------|------|------|
| 前端构建 | `next build` | `npm run build:frontend` | ✅ |
| 静态资源复制 | `scripts/copy-standalone-assets.cjs` | 随 `postbuild:frontend` 自动执行 | ✅ |
| 桌面端打包 | `electron-builder` | `npm run build:desktop` | 🔄 进行中 |
| 嵌入式 Python 搭建 | `scripts/build_embedded_python.ps1` | 手动执行 | ✅ |
| Python 依赖精简 | `scripts/cleanup_python.ps1` | 手动执行 | ✅ |
| 发布安装包 | `electron-builder --win` | NSIS 安装程序 | 🔄 进行中 |
