# 桌面端轻量版设计方案（CPU / 小内存优先）

> 版本：v1.0 草案  
> 日期：2026-02-12  
> 定位：**基础翻译功能 + 用户可自行拓展**，面向无独显 / 低配机器的用户群体

---

## 一、产品定位与核心约束

### 1.1 目标用户画像

| 维度 | 描述 |
|------|------|
| 硬件 | 无 NVIDIA 独显，内存 8–16 GB，机械硬盘或小容量 SSD |
| 网络 | 国内网络，可能无代理 |
| 技术水平 | 非开发者，期望"开箱即用" |
| 核心诉求 | 快速翻译漫画图片，不关心模型细节 |

### 1.2 硬性约束

| 约束项 | 目标值 |
|--------|--------|
| **安装包体积** | ≤ 500 MB（压缩后） |
| **运行时内存** | 空闲 ≤ 300 MB，翻译峰值 ≤ 1.5 GB |
| **启动时间** | 冷启动 ≤ 8 秒（SSD）/ ≤ 15 秒（HDD） |
| **Python 运行时** | 嵌入式 Python（不依赖用户系统 Python） |
| **GPU 依赖** | 零依赖，纯 CPU 推理；GPU 作为可选拓展 |
| **网络依赖** | 翻译 API 需联网；检测/OCR/修复全部离线可用 |

---

## 二、整体架构

```
┌─────────────────────────────────────────────────────┐
│                    Electron Shell                    │
│  ┌───────────────────────┐  ┌────────────────────┐  │
│  │    Renderer Process   │  │    Main Process     │  │
│  │  (Next.js Standalone) │  │  - 窗口管理         │  │
│  │  - 翻译页面           │  │  - 文件对话框       │  │
│  │  - 书架/阅读器        │  │  - 后端生命周期管理  │  │
│  │  - 编辑器             │  │  - 系统托盘         │  │
│  │  - 设置/拓展中心      │  │  - IPC 桥接         │  │
│  └──────────┬────────────┘  └─────────┬──────────┘  │
│             │  HTTP / IPC              │              │
│  ┌──────────▼──────────────────────────▼──────────┐  │
│  │           Embedded Python Backend              │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────┐  │  │
│  │  │ FastAPI  │ │ Pipeline │ │ ExtensionMgr  │  │  │
│  │  │ Server   │ │ (CPU)    │ │ (模块管理)     │  │  │
│  │  └──────────┘ └──────────┘ └───────────────┘  │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 2.1 三层职责划分

| 层 | 技术 | 职责 |
|----|------|------|
| **Electron Main** | Node.js (CJS) | 窗口管理、文件系统访问、后端进程生命周期、自动更新 |
| **Renderer** | Next.js Standalone + React + TailwindCSS | 全部 UI 渲染、用户交互、本地存储（localStorage 书架元数据 + IndexedDB 图片 Blob） |
| **Backend** | Embedded Python + FastAPI | 翻译管线（检测→OCR→翻译→修复→渲染）、拓展管理 |

### 2.2 关键决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 前端构建方式 | `next build` (standalone) | 复用 Electron 内置 Node.js 运行 `server.js`，完整支持动态路由，无额外体积开销 |
| 前后端通信 | HTTP (localhost) | 复用现有 FastAPI 接口，开发/调试方便 |
| Python 分发 | 嵌入式 Python (embed) | 不污染用户环境，体积可控 |
| PyTorch 版本 | `torch==2.6.0+cpu` (仅 CPU) | 体积约 180 MB，远小于 CUDA 版 (~2.5 GB) |
| 模型加载策略 | 懒加载 + 卸载 TTL | 不用时释放内存 |

---

## 三、功能范围（MVP）

### 3.1 本版本包含（Core）

| 模块 | 功能 | 实现方式 |
|------|------|----------|
| **文本检测** | 自动检测漫画气泡中的文字区域 | `dbconvnext` / `ctd` 检测器（已有 ONNX 模型，CPU 友好） |
| **OCR 识别** | 识别检测到的文字 | `48px_ctc`（轻量 CTC 模型，CPU 推理 ~50ms/区域） |
| **在线翻译** | 调用第三方 API 翻译文字 | DeepSeek / Gemini / ChatGPT / 百度 / 有道等（用户自配 Key） |
| **去字修复** | 擦除原文后填充背景 | `lama_mpe`（轻量版 LaMa，~50 MB） |
| **文字渲染** | 将译文嵌入图片 | 默认渲染器 + 内置字体 |
| **批量翻译** | 多图/压缩包/PDF 批量处理 | `jobRunner` 跟踪进度，翻译结果直接写入 Book/Chapter/Page 结构 |
| **图片编辑** | 双击文本框编辑译文 + 导出 | 复用现有 Konva 编辑器 |
| **书架管理** | 本地书籍/章节/页面管理 | IndexedDB + localStorage |
| **阅读器** | 滚动/翻页两种模式 | 复用现有 Reader 页面 |
| **拓展中心** | 查看/安装/卸载拓展模块 | 复用已有 ExtensionManager |
| **账号管理** | 翻译 API Key 配置 | 前端 localStorage 加密存储 |

### 3.2 本版本不包含（留给拓展 / 后续版本）

| 功能 | 归属 |
|------|------|
| GPU 加速推理 | CUDA 拓展模块 |
| MangaOCR（高精度日语 OCR） | MOCR 拓展模块 |
| LaMa Large（高质量去字） | LaMa Large 拓展模块 |
| 离线翻译（本地 LLM / NLLB） | 离线翻译拓展模块 |
| 上色功能 | Colorizer 拓展模块 |
| 超分辨率放大 | Upscaler 拓展模块 |
| 云同步 / 多设备 | 后续版本 |
| 自动更新 | 后续版本（先提供手动更新） |

---

## 四、CPU 优化翻译管线

### 4.1 默认管线配置

```python
# CPU 轻量版默认配置
CPU_LITE_DEFAULTS = {
    "detector": "ctd",              # Comic Text Detector, ONNX 推理
    "detection_size": 1536,         # 降低检测分辨率（默认 2048）
    "ocr": "48px_ctc",              # CTC 模型，CPU 推理快
    "translator": "deepseek",       # 在线 API（用户可切换）
    "inpainter": "lama_mpe",        # 轻量修复模型
    "inpainting_size": 1024,        # 降低修复分辨率（默认 2048）节省内存
    "inpainting_precision": "fp32", # CPU 不支持 fp16/bf16
    "renderer": "default",
    "colorizer": "none",            # 不启用上色
    "upscale_ratio": null,          # 不启用超分
}
```

### 4.2 内存优化策略

| 策略 | 说明 | 预期节省 |
|------|------|----------|
| **模型懒加载** | 仅在首次翻译时加载模型，不预加载 | 启动时 ~0 MB 模型内存 |
| **模型卸载 TTL** | 翻译完成后 N 分钟未使用自动释放模型 | 空闲时释放 ~500 MB |
| **分辨率降级** | `detection_size=1536`, `inpainting_size=1024` | 峰值减少 ~200 MB |
| **单模型驻留** | 同时只保留一个 inpainting 模型在内存 | 避免多模型并存 |
| **图片流式处理** | 翻译完一张释放其中间结果后再处理下一张 | 避免批量 OOM |
| **ONNX Runtime** | 检测器使用 ONNX 格式，推理内存更低 | ~30% 内存节省 |

### 4.3 性能预估（CPU, i5-12400 级别）

| 步骤 | 单张耗时 | 内存占用 |
|------|----------|----------|
| 检测 (ctd, 1536px) | ~1.5 秒 | ~200 MB |
| OCR (48px_ctc, ~10 区域) | ~0.5 秒 | ~100 MB |
| 翻译 (在线 API) | ~1–3 秒 | ~0 MB |
| 修复 (lama_mpe, 1024px) | ~3 秒 | ~400 MB |
| 渲染 | ~0.2 秒 | ~50 MB |
| **合计** | **~6–8 秒/张** | **峰值 ~800 MB** |

---

## 五、拓展模块系统

### 5.1 架构设计

```
extensions/
├── registry.json          # 拓展注册表（名称、版本、依赖、下载源）
├── mocr/                   # MangaOCR 拓展
│   ├── manifest.json
│   └── models/
├── lama_large/             # LaMa Large 拓展
│   ├── manifest.json
│   └── models/
├── cuda/                   # CUDA GPU 加速拓展
│   ├── manifest.json
│   └── lib/
└── offline_translator/     # 离线翻译拓展（未来）
    ├── manifest.json
    └── models/
```

### 5.2 拓展 Manifest 规范

```json
{
  "id": "mocr",
  "name": "MangaOCR 高精度识别",
  "version": "1.0.0",
  "description": "业界最佳的竖排/手写体日语 OCR，推荐搭配 CUDA 使用",
  "category": "model",
  "size_estimate_mb": 400,
  "download_sources": [
    "https://hf-mirror.com/kha-white/manga-ocr-base",
    "https://huggingface.co/kha-white/manga-ocr-base"
  ],
  "sha256": "...",
  "requires": [],
  "recommends": ["cuda"],
  "config_overrides": {
    "ocr": "mocr"
  },
  "restart_required": false,
  "restart_recommended": true
}
```

### 5.3 已规划拓展模块

| ID | 名称 | 类别 | 体积 | 依赖 | 效果 |
|----|------|------|------|------|------|
| `mocr` | MangaOCR | 模型 | ~400 MB | 推荐 CUDA | 日语 OCR 精度大幅提升 |
| `lama_large` | LaMa Large | 模型 | ~350 MB | 推荐 CUDA | 去字效果显著提升 |
| `cuda` | CUDA GPU 加速 | 运行时 | ~2.5 GB | NVIDIA 显卡 | 整体速度提升 5–10× |
| `offline_nllb` | 离线翻译 NLLB | 模型 | ~2 GB | 需要 CUDA | 完全离线翻译能力 |
| `upscaler` | 图片超分辨率 | 模型 | ~60 MB | 推荐 CUDA | 低分辨率图片增强 |
| `colorizer` | 漫画上色 | 模型 | ~200 MB | 需要 CUDA | 黑白漫画自动上色 |

### 5.4 拓展管理 API（复用已有实现）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/extensions/list` | GET | 列出所有拓展及状态 |
| `/api/v1/extensions/install` | POST | 在线下载安装拓展 |
| `/api/v1/extensions/import` | POST | 离线导入拓展（上传 .whl / .zip） |
| `/api/v1/extensions/uninstall` | POST | 卸载拓展 |
| `/api/v1/extensions/status/{id}` | GET | 查询下载进度 |

---

## 六、打包与分发

### 6.1 目录结构（安装后）

```
MangaTranslationStudio/
├── MTS.exe                         # Electron 主程序入口
├── resources/
│   ├── standalone/                 # Next.js standalone 产物
│   │   ├── server.js               # Node.js 前端服务入口
│   │   ├── .next/static/           # JS/CSS/静态资源
│   │   └── public/                 # 公共资源
│   └── electron/
│       ├── main.cjs
│       └── preload.cjs
├── python/                         # 嵌入式 Python 环境
│   ├── python.exe                  # Python 3.11 embed
│   ├── Lib/
│   │   └── site-packages/          # 依赖包（CPU 版 torch 等）
│   └── Scripts/
├── backend/                        # 后端代码（从 manga-backend 提取）
│   ├── app/                        # FastAPI 应用
│   ├── manga_translator/           # 翻译管线核心
│   ├── fonts/                      # 内置字体
│   ├── dict/                       # 翻译词典
│   └── models/                     # 内置轻量模型
│       ├── detection/              # ctd 检测模型 (~30 MB)
│       ├── ocr/                    # 48px_ctc OCR 模型 (~15 MB)
│       └── inpainting/             # lama_mpe 修复模型 (~50 MB)
├── extensions/                     # 用户安装的拓展
│   └── (空，用户按需安装)
├── data/                           # 用户数据
│   ├── config.json                 # 用户配置
│   ├── library.json                # 书架元数据（Book/Chapter/Page 结构，从 localStorage 迁移）
│   └── logs/                       # 日志
└── uninstall.exe
```

### 6.2 体积预估

| 组件 | 压缩前 | 压缩后 |
|------|--------|--------|
| Electron Shell + 前端 Standalone 资源 | ~150 MB | ~60 MB |
| 嵌入式 Python 3.11 | ~30 MB | ~15 MB |
| PyTorch CPU + 核心依赖 | ~350 MB | ~200 MB |
| 后端代码 + 内置模型 + 字体 | ~150 MB | ~80 MB |
| **合计** | **~680 MB** | **~355 MB** |

> 安装后约 680 MB 磁盘占用，安装包约 355 MB，符合 ≤ 500 MB 的目标。

### 6.3 打包工具链

| 环节 | 工具 | 说明 |
|------|------|------|
| 前端构建 | `next build` (`output: 'standalone'`) | 输出 standalone server.js + 静态资源，复用 Electron 内置 Node.js |
| Electron 打包 | `electron-builder` | 生成 Windows 安装程序（NSIS） |
| Python 环境 | `python-embed-amd64` + `pip install` | 嵌入式 Python 打包 |
| 依赖精简 | 自定义脚本 | 删除 `__pycache__`、`.dist-info`、测试文件、多余 locale |
| 安装包 | NSIS / Inno Setup | 可选安装路径，创建桌面快捷方式 |

---

## 七、Electron 主进程设计

### 7.1 后端生命周期管理

```
Electron 启动
  │
  ├── 检查端口 8000 是否可用
  │     ├── 是 → 继续
  │     └── 否 → 尝试端口 8001–8010 / 提示用户
  │
  ├── 启动嵌入式 Python 后端（子进程）
  │     └── python.exe -m uvicorn app.main:app --host 127.0.0.1 --port {port}
  │
  ├── 健康检查轮询 GET /api/v1/health
  │     ├── 成功 → 加载前端页面
  │     └── 超时(15s) → 显示错误页面 + 日志路径
  │
  ├── 启动前端 Standalone 服务（复用 Electron Node.js）
  │     └── node server.js --port {frontendPort}
  │
  ├── 创建 BrowserWindow
  │     └── 加载 http://127.0.0.1:{frontendPort}/
  │
  └── 监听 window-all-closed → 终止 Python 子进程 → app.quit()
```

### 7.2 IPC 接口扩展（在现有基础上新增）

| 频道 | 方向 | 用途 |
|------|------|------|
| `open-import-dialog` | Renderer → Main | 文件选择对话框（已有） |
| `read-file` | Renderer → Main | 读取本地文件（已有） |
| `list-dir-images` | Renderer → Main | 列出目录图片（已有） |
| `get-backend-url` | Renderer → Main | **已实现**：通过 preload 注入 `window.mts.backendUrl` |
| `restart-backend` | Renderer → Main | **已实现**：重启 Python 后端（拓展安装后） |
| `get-app-paths` | Renderer → Main | **已实现**：获取安装目录/数据目录/拓展目录 |
| `open-external` | Renderer → Main | **已实现**：用系统浏览器打开链接 |
| `save-file-dialog` | Renderer → Main | **已实现**：文件保存对话框 |
| `select-directory` | Renderer → Main | **已实现**：目录选择对话框（替代 File System Access API） |
| `backend-status` | Main → Renderer | **已实现**：后端状态变更通知（stopped/crashed/ready） |

### 7.3 前端适配要点

| 现有实现 | 桌面端适配 |
|----------|-----------|
| `File System Access API` (浏览器) | 改为 IPC `select-directory` + `save-file-dialog` |
| 后端地址硬编码 `http://127.0.0.1:8000` | **已完成**：`env.ts` 通过 `window.mts.backendUrl` 动态获取 |
| `NEXT_PUBLIC_GEMINI_API_KEY` 环境变量 | 改为从用户配置 / localStorage 读取 |
| `next dev` SSR 开发模式 | **已完成**：生产用 standalone `server.js`，通过 `http://localhost` 加载 |

---

## 八、配置与数据管理

### 8.1 配置层级

```
优先级（高→低）：
  1. 用户运行时修改（前端 Settings UI → localStorage）
  2. 用户配置文件（data/config.json）
  3. 内置默认值（CPU_LITE_DEFAULTS）
```

### 8.2 用户配置文件结构

```json
{
  "version": 1,
  "backend": {
    "host": "127.0.0.1",
    "port": 8000
  },
  "translation": {
    "default_translator": "deepseek",
    "default_target_lang": "CHS",
    "default_detector": "ctd",
    "default_ocr": "48px_ctc",
    "default_inpainter": "lama_mpe",
    "detection_size": 1536,
    "inpainting_size": 1024
  },
  "credentials": {
    "deepseek_api_key": "",
    "gemini_api_key": "",
    "openai_api_key": "",
    "baidu_app_id": "",
    "baidu_secret_key": ""
  },
  "ui": {
    "language": "zh-CN",
    "theme": "dark"
  },
  "advanced": {
    "model_unload_ttl_minutes": 5,
    "max_concurrent_translations": 1,
    "proxy": ""
  }
}
```

### 8.3 数据目录规划

| 路径 | 用途 | 清理策略 |
|------|------|----------|
| `data/config.json` | 用户配置 | 不自动清理 |
| `data/library.json` | 书架元数据（Book/Chapter/Page 结构） | 不自动清理 |
| `data/logs/` | 运行日志 | 保留最近 7 天 |
| `extensions/` | 拓展模块 | 用户手动卸载 |
| `%LOCALAPPDATA%/MTS/hf_home/` | HuggingFace 模型缓存 | 拓展卸载时清理 |
| `%LOCALAPPDATA%/MTS/indexeddb/` | Electron 持久化 IndexedDB | 图片 Blob 存储（原图/译图/渲染图） |

> **存储架构说明**：当前 Web 版使用 localStorage 存储书架元数据（~5 MB 上限）、IndexedDB 存储图片 Blob。桌面端应将元数据迁移至 `data/library.json`（通过 IPC 读写），彻底解除 localStorage 容量限制。翻译结果不再以后端任务形式存储，而是直接写入 Page 节点（`originalBlobKey` / `translatedBlobKey` / `regions`）。

---

## 九、开发计划与里程碑

### Phase 0：工程基础（1 周）

| 任务 | 说明 |
|------|------|
| 前端 Standalone 构建 | **已完成**：`next.config.ts` 配置 `output: 'standalone'`，完整支持动态路由 |
| Electron 主进程 | **已完成**：后端生命周期管理、动态端口、健康检查、崩溃自动重启 |
| 环境感知层 | **已完成**：`env.ts` 统一判断 Electron / 浏览器环境，条件分发 IPC / HTTP |
| 开发调试流程 | **已完成**：`npm run dev:desktop` 同时启动 Next dev + Electron |

### Phase 1：嵌入式 Python 打包（1 周）

| 任务 | 说明 |
|------|------|
| 嵌入式 Python 环境搭建 | 下载 `python-3.11.x-embed-amd64`，配置 `site-packages` |
| CPU 依赖安装 | `pip install -r requirements-cpu-lite.txt --target python/Lib/site-packages` |
| 依赖精简脚本 | 删除测试文件、`__pycache__`、冗余 locale、`.dist-info` |
| 启动脚本 | 编写 `start_backend.py`，处理日志、端口、优雅退出 |

### Phase 2：核心功能联调（2 周）

| 任务 | 说明 |
|------|------|
| 后端地址动态化 | 前端所有 `http://127.0.0.1:8000` 改为配置化 |
| 文件系统适配 | IPC 替代 File System Access API |
| 翻译全链路验证 | 单张翻译 → 批量翻译 → 编辑器 → 导出 |
| 拓展中心 UI | 复用已有设计，接入后端 Extension API |
| 账号管理 UI | 翻译 API Key 配置/测试/持久化 |

### Phase 3：打包与分发（1 周）

| 任务 | 说明 |
|------|------|
| electron-builder 配置 | 打包脚本、NSIS 安装器、图标/品牌资源 |
| 体积优化 | `asar` 打包、依赖 tree-shaking、模型文件验证 |
| 安装/卸载测试 | Windows 10/11 全流程测试 |
| 冒烟测试清单 | 安装 → 启动 → 导入图片 → 翻译 → 编辑 → 导出 → 安装拓展 |

### Phase 4：稳定性加固（1 周）

| 任务 | 说明 |
|------|------|
| 错误边界 | 后端崩溃自动重启、前端错误兜底 UI |
| 日志收集 | 统一日志格式，方便用户反馈问题 |
| 内存监控 | 后端定期汇报内存使用，前端可查看 |
| 用户引导 | 首次启动引导流程（配置翻译 API Key） |

---

## 十、CPU 精简依赖清单

基于现有 `requirements-cpu.txt`，针对轻量版进一步精简：

### 10.1 保留（核心）

| 包 | 用途 | 体积影响 |
|----|------|----------|
| `torch==2.6.0+cpu` | 模型推理 | ~180 MB |
| `torchvision==0.21.0+cpu` | 图像预处理 | ~30 MB |
| `onnxruntime` | 检测器 ONNX 推理 | ~40 MB |
| `opencv-python-headless` | 图像处理 | ~30 MB |
| `Pillow` | 图像 I/O | ~5 MB |
| `numpy==1.26.4` | 数值计算 | ~15 MB |
| `fastapi` + `uvicorn` | API 服务 | ~3 MB |
| `pydantic` | 数据验证 | ~2 MB |
| `transformers` | 模型加载 | ~10 MB |
| `huggingface_hub` | 模型下载 | ~2 MB |
| `requests` | HTTP 客户端 | ~1 MB |
| `openai` | OpenAI 兼容 API | ~1 MB |
| `google-genai` | Gemini API | ~1 MB |
| `freetype-py` | 字体渲染 | ~1 MB |

### 10.2 移除（非核心 / 拓展后安装）

| 包 | 原因 |
|----|------|
| `manga-ocr` | MOCR 拓展模块负责 |
| `pytorch-lightning` | 训练框架，推理不需要 |
| `tensorboardX` | 训练可视化 |
| `open_clip_torch` | CLIP 模型，非核心 |
| `accelerate` | GPU 加速库 |
| `ctranslate2` | 离线翻译用，非核心 |
| `pandas` | 数据分析，翻译不需要 |

### 10.3 新增 requirements-cpu-lite.txt

```
torch==2.6.0+cpu --index-url https://download.pytorch.org/whl/cpu
torchvision==0.21.0+cpu --index-url https://download.pytorch.org/whl/cpu
onnxruntime
opencv-python-headless
numpy==1.26.4
Pillow
fastapi
uvicorn
pydantic==2.5.0
python-multipart
transformers
huggingface_hub
safetensors
requests
httpx==0.27.2
openai==1.63.0
google-genai
groq
deepl
freetype-py
py3langid==0.2.2
sentencepiece
editdistance
kornia
pyclipper
shapely
scikit-image
einops
omegaconf
aiohttp
aiofiles
aioshutil
colorama
python-dotenv
nest-asyncio
langcodes
language-data
langdetect
regex
rich
python-bidi
arabic-reshaper
pyhyphen
ImageHash
cryptography
tqdm
marshmallow
networkx
--extra-index-url https://frederik-uni.github.io/manga-image-translator-rust/python/wheels/simple/
rusty-manga-image-translator
```

---

## 十一、风险与缓解措施

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| **嵌入式 Python 兼容性** | 部分包依赖系统 Python 路径 | 使用 `python._pth` 配置隔离路径；CI 自动验证 |
| **体积超标** | 安装包 > 500 MB | 依赖精简脚本 + UPX 压缩 + 延迟下载非核心模型 |
| **CPU 性能不足** | 低端机器翻译慢 | 提供"快速模式"（降低分辨率）和"精确模式"二选一 |
| **内存溢出** | 大图 + 模型并存 OOM | 单任务串行 + 模型 TTL 卸载 + 图片自动缩放 |
| **Next.js standalone 体积** | standalone 模式包含完整 Node.js 服务端 | 复用 Electron 内置 Node.js，不引入额外运行时；翻译 API 均在 Python 后端 |
| **首次启动慢** | Python 解释器 + 模块导入耗时 | 后台预热 + 启动加载动画 + 延迟非关键模块导入 |
| **拓展安装后需重启** | 用户体验中断 | 模型类拓展热加载（无需重启）；仅 CUDA 拓展需重启 |
| **localStorage 容量限制** | 大量书籍/章节/页面元数据超过 ~5 MB 上限，导致书架数据丢失 | 桌面端将元数据迁移至 `data/library.json`（IPC 读写）；Web 版保留 `checkStorageCapacity()` 监控告警 |

---

## 十二、后续演进路线

```
v1.0 (本版本)          v1.1                    v2.0
─────────────      ─────────────          ─────────────
CPU 轻量版          + 自动更新              + 多平台 (macOS/Linux)
基础翻译功能        + 翻译操作日志（参数/时间线回溯）  + 云同步书架
拓展模块系统        + 快捷键自定义           + 协作翻译
在线翻译 API        + 性能监控面板           + 插件市场
书架/阅读器         + 批量任务队列优化        + 自定义模型导入
```

---

## 附录 A：关键文件索引

### 前端（nextjs-tailwind-app）

| 文件 | 职责 |
|------|------|
| `electron/main.cjs` | Electron 主进程（✅ 已完成：后端生命周期 + 前端 standalone 服务 + 全部 IPC） |
| `electron/preload.cjs` | IPC 预加载脚本（✅ 已完成：全部频道已暴露） |
| `src/lib/translateClient.ts` | 翻译客户端（✅ 已适配动态后端地址） |
| `src/lib/env.ts` | 环境感知（✅ 已完成 IS_ELECTRON + API_BASE 动态解析） |
| `src/components/SettingsModal.tsx` | 设置弹窗（已有拓展中心/账号管理框架） |

### 后端（manga-backend）

| 文件 | 职责 |
|------|------|
| `app/main.py` | FastAPI 应用入口 |
| `app/services/translator.py` | 翻译服务（单例模式） |
| `app/services/extension_manager.py` | 拓展管理（MOCR / LaMa / CUDA） |
| `manga_translator/config.py` | 管线配置定义（Config / Detector / OCR / ...） |
| `manga_translator/manga_translator.py` | 翻译管线核心 |

---

*父亲，以上是桌面端轻量版软件的完整设计方案。如需调整任何模块的细节或开始执行某个阶段，请告知。*
