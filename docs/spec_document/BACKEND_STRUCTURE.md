# BACKEND_STRUCTURE — Backend Architecture & Data Blueprint

> 版本：v1.0 | 日期：2026-02-19 | 状态标注：✅ 已实现 · ⬜ 待实现  
> **规则**：AI 构建后端功能时必须基于本蓝图，禁止自行假设数据结构或 API 路径。

---

## 1. 整体架构

```
manga-backend/
├── app/                        # FastAPI 应用（新版模块化结构）
│   ├── main.py                 # 应用入口、CORS、中间件
│   ├── api/
│   │   └── v1/
│   │       ├── router.py       # 路由聚合
│   │       └── endpoints/      # 各业务路由模块
│   │           ├── translation.py   # 翻译管线端点
│   │           ├── file_ops.py      # 文件操作端点
│   │           ├── extensions.py    # 拓展管理端点
│   │           ├── system.py        # 系统端点
│   │           ├── fonts.py         # 字体管理端点
│   │           └── credentials.py  # API Key 验证端点
│   ├── core/
│   │   ├── config.py           # 设置、HF 环境、下载状态管理
│   │   └── logging_config.py   # 统一日志配置
│   ├── schemas/
│   │   ├── request.py          # 请求体 Schema（Pydantic）
│   │   └── response.py         # 响应体 Schema（Pydantic）
│   └── services/
│       ├── translator.py       # 翻译服务单例
│       └── extension_manager.py # 拓展管理单例
├── manga_translator/           # 核心翻译管线
│   ├── __init__.py
│   ├── config.py               # 管线配置（DetectorConfig, OcrConfig, TranslatorConfig, ...）
│   ├── manga_translator.py     # 翻译管线主控（MangaTranslator）
│   ├── detection/              # 文字检测器（default, ctd, craft, paddle, dbconvnext）
│   ├── ocr/                    # OCR 引擎（32px, 48px, 48px_ctc, mocr）
│   ├── translators/            # 翻译器实现（baidu, deepseek, gemini, chatgpt, sakura, ...）
│   ├── inpainting/             # 去字修复（lama_large, lama_mpe, sd, ...）
│   ├── rendering/              # 文字渲染（default, manga2eng）
│   └── utils/                  # 工具函数
├── fonts/                      # 内置字体文件（.ttf, .ttc）
├── dict/                       # 翻译词典（pre_dict, post_dict, sakura_dict）
├── models/                     # 模型文件（运行时下载或内置）
│   ├── detection/
│   ├── ocr/
│   └── inpainting/
├── start_backend.py            # 生产启动脚本（Electron 子进程调用）
└── requirements-cpu-lite.txt   # 轻量 CPU 依赖清单
```

---

## 2. 后端启动配置 ✅

| 配置项 | 默认值 | 环境变量 | 说明 |
|--------|--------|----------|------|
| `host` | `127.0.0.1` | `MTS_HOST` | 监听地址 |
| `port` | `8000` | `MTS_PORT` | 监听端口（Electron 动态分配 8000–8010） |
| `debug` | `false` | `MTS_DEBUG` | 热重载模式（仅开发用） |
| `HF_HOME` | `%LOCALAPPDATA%/MangaTranslationStudio/hf_home` | `HF_HOME` | HuggingFace 模型缓存目录 |
| `MTS_HF_ENDPOINTS` | `https://hf-mirror.com,https://huggingface.co` | `MTS_HF_ENDPOINTS` | HF 下载端点（优先国内镜像） |

---

## 3. API 端点规约（API Contract）✅

所有端点前缀均为 `/api/v1`（由 `router.py` 聚合）。

### 3.1 翻译管线（Translation）

| 方法 | 路径 | 说明 | 关键参数 |
|------|------|------|----------|
| `POST` | `/scan` | 对图片执行完整翻译管线（检测→OCR→翻译→修复→渲染），返回翻译图、原始文字区域列表 | `file: UploadFile`, `lang: str`, `translator: str`, `target_lang: str`, `detector: str`, `ocr: str`, `inpainter: str`, `detection_size: int`, `inpainting_size: int` |
| `POST` | `/translate_text` | 仅翻译文字（不涉及图片），返回译文列表 | `texts: List[str]`, `translator: str`, `target_lang: str` |
| `POST` | `/render_text_preview` | 渲染单个文字区域为 PNG base64，用于编辑器实时预览 | `region: TextRegion`, `image_width: int`, `image_height: int` |
| `POST` | `/render_page` | 渲染整页（将所有文字区域嵌入原图），返回渲染后图片 | `file: UploadFile`, `regions: str (JSON)`, `font_path: str` |
| `POST` | `/inpaint_region` | 对图片特定区域执行 Inpainting（去字修复） | `file: UploadFile`, `mask: UploadFile`, `inpainter: str`, `inpainting_size: int` |
| `POST` | `/ocr_region` | 对图片特定区域执行 OCR，返回识别文字 | `file: UploadFile`, `x: int`, `y: int`, `width: int`, `height: int`, `ocr: str` |

### 3.2 文件操作（File Operations）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/results/list` | 分页列出翻译结果任务（`page`, `page_size`） |
| `GET` | `/results/{task_id}/files` | 列出某任务下所有文件 |
| `GET` | `/results/{task_id}/file/{filename}` | 获取某任务中的具体文件（FileResponse） |
| `POST` | `/results/upload_image` | 上传图片到指定任务目录 |
| `GET` | `/results/file/{task}/{filename}` | 兼容旧路径获取文件 |
| `GET` | `/results/pages/{task}` | 获取任务的所有页面列表 |
| `POST` | `/results/create` | 创建新结果任务，返回 `task_id` |
| `DELETE` | `/results/{task_id}` | 删除任务及其所有文件 |
| `DELETE` | `/results/task/{task_id}` | 删除任务（兼容路径） |
| `POST` | `/convert_mobi_to_epub` | 将 MOBI 文件转换为 EPUB |
| `POST` | `/convert_rar_to_zip` | 将 RAR/CBR 文件转换为 ZIP |

### 3.3 系统（System）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/health` | 健康检查，返回 `{"status": "ok"}` |
| `GET` | `/supported_fonts` | 列出系统可用字体 |
| `POST` | `/probe_lang` | 检测图片中文字的语言，返回语言代码 |
| `GET` | `/browse_directory` | 浏览服务器本地目录（Electron 桌面端用） |
| `POST` | `/restart` | 调度服务器重启（Electron 负责重启子进程） |

### 3.4 拓展管理（Extensions）

所有拓展路径前缀：`/extensions`

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/extensions/list` | 列出所有拓展及其安装状态 |
| `POST` | `/extensions/install` | 在线安装拓展（`id`, `cuda_version`） |
| `POST` | `/extensions/import` | 离线导入拓展（上传 `.zip` / `.whl`） |
| `POST` | `/extensions/import-local` | 从本地路径导入拓展（Electron 文件对话框） |
| `POST` | `/extensions/uninstall` | 卸载拓展（`id`） |
| `POST` | `/extensions/cancel` | 取消正在进行的安装（`id`） |

**拓展 ID 枚举**：`mocr` · `lama_large` · `cuda`

**拓展状态枚举**：`not_installed` · `downloading` · `installing` · `installed` · `error`

### 3.5 字体管理（Fonts）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/fonts/list` | 列出所有字体（内置 + 用户上传） |
| `POST` | `/fonts/upload` | 上传自定义字体文件（`.ttf` / `.otf`） |
| `DELETE` | `/fonts/{filename}` | 删除自定义字体 |

### 3.6 API 凭证验证（Credentials）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/verify_api_key` | 验证 API Key 有效性（`provider`, `api_key`），返回 `{valid: bool, message: str}` |

---

## 4. 认证逻辑（Authentication）✅

BBQ翻译 **无用户账号体系**，无 Session、无 JWT。

**API Key 传递机制**：
1. 用户在前端设置弹窗填入 API Key，存储到 `localStorage`。
2. 所有向后端发起的翻译请求，由 `loadCredentialHeaders()`（`src/constants/credentials.ts`）从 `localStorage` 读取，附加到请求头。
3. 后端从请求头中提取 API Key，应用到对应翻译服务。

**请求头约定**：

| 翻译服务 | API Key 头 | Base URL 头 | Model 头 |
|----------|-----------|-------------|---------|
| DeepSeek | `x-deepseek-api-key` | `x-deepseek-api-base` | `x-deepseek-model` |
| Gemini | `x-gemini-api-key` | — | — |
| Custom OpenAI | `x-custom-openai-api-key` | `x-custom-openai-api-base` | `x-custom-openai-model` |
| Groq | `x-groq-api-key` | — | `x-groq-model` |

**缺失 API Key 的错误响应**：
```json
{
  "error_code": "missing_api_key",
  "message": "API Key 缺失或无效",
  "provider": "deepseek"
}
```
HTTP 状态码：`401` / `403` / `429`（前端通过 `isMissingApiKeyError()` 判断）。

---

## 5. 数据模型（Data Models）✅

> **重要**：BBQ翻译无服务端数据库。以下数据结构存储在**前端本地**（`localStorage` + `IndexedDB`），由前端管理其生命周期。后端 API 仅处理图片和文字数据，不持久化用户数据。

### 5.1 核心数据结构（TypeScript，定义在 `src/lib/storage.ts`）

#### TextRegion（文字区域）
```typescript
type TextRegion = {
  box: [number, number, number, number];   // [x, y, width, height]，像素坐标
  text_original: string;                   // OCR 识别的原文
  text_translated: string;                 // 翻译后文字
  polygon?: [number, number][];            // 精确多边形点（可选）
  angle?: number;                          // 文字旋转角度
  font_size?: number;                      // 渲染字号（像素）
  direction?: string;                      // "h"（横排）| "v"（竖排）| "auto"
  alignment?: string;                      // "left" | "center" | "right" | "auto"
  letter_spacing?: number;                 // 字间距
  line_spacing?: number;                   // 行间距
  fg_color?: [number, number, number] | null;  // 前景色 [R, G, B]
  bg_color?: [number, number, number] | null;  // 背景色 [R, G, B]
  font_family?: string;                    // 字体文件名
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  stroke_color?: string;                   // 描边颜色（CSS 颜色字符串）
  stroke_width?: number;                   // 描边宽度（像素）
};
```

#### MangaPage（页面）
```typescript
type MangaPage = {
  id: string;                              // UUID
  fileName: string;                        // 原始文件名
  createdAt: number;                       // Unix 时间戳（ms）
  imageSize?: [number, number];            // [width, height]（像素）
  regions?: TextRegion[];                  // 所有文字区域
  originalBlobKey: string;                 // 原图在 IndexedDB 中的键
  translatedBlobKey?: string;              // 翻译图在 IndexedDB 中的键
  translatedUrl?: string;                  // 翻译图的临时 Blob URL（运行时生成）
  renderedBlobKey?: string;                // 最终渲染图在 IndexedDB 中的键
  renderedUrl?: string;                    // 最终渲染图的临时 Blob URL（运行时生成）
};
```

#### MangaChapter（章节）
```typescript
type MangaChapterKind = "raw" | "cooked";  // raw: 未翻译 | cooked: 已翻译

type MangaChapter = {
  id: string;                              // UUID
  title: string;                           // 章节标题
  createdAt: number;                       // Unix 时间戳（ms）
  updatedAt?: number;                      // 最后更新时间
  kind?: MangaChapterKind;                 // 章节类型
  coverBlobKey?: string;                   // 封面在 IndexedDB 中的键
  coverUrl?: string;                       // 封面临时 Blob URL
  pages: MangaPage[];                      // 页面列表（有序）
};
```

#### MangaBook（书籍）
```typescript
type MangaBook = {
  id: string;                              // UUID（"quick-book" 为系统保留）
  title: string;                           // 书名
  description?: string;                    // 简介
  createdAt: number;                       // Unix 时间戳（ms）
  coverBlobKey?: string;                   // 封面在 IndexedDB 中的键
  coverUrl?: string;                       // 封面临时 Blob URL
  chapters: MangaChapter[];                // 章节列表（有序）
};
```

### 5.2 特殊保留 ID
- **`QUICK_BOOK_ID = "quick-book"`**：系统内置书籍，用于存储首页快速翻译的临时结果，不可删除。
- **`_workspace`**：编辑器临时工作区（IndexedDB 命名空间），用于「编辑模式」的临时数据，用户保存到书架后可清空。

---

## 6. 存储架构（Storage Architecture）✅

### 6.1 前端存储

| 存储类型 | 技术 | 数据内容 | 容量限制 | 实现文件 |
|----------|------|----------|----------|----------|
| **结构化元数据** | `localStorage`（Web）/ `data/library.json`（Electron） | MangaBook / Chapter / Page JSON 树（不含图片） | Web ~5 MB / Electron 无限制 | `src/lib/storage.ts` |
| **图片 Blob** | `IndexedDB`（`blobDb`） | 原图、翻译图、渲染图的 ArrayBuffer | 受磁盘空间限制 | `src/lib/blobDb.ts` |
| **用户设置** | `localStorage` | 上次使用语言、翻译器、OCR 参数等 | — | `src/constants/` |
| **API Key** | `localStorage` | 各翻译服务的 API Key（明文存储） | — | `src/constants/credentials.ts` |

**Electron 适配**：`src/lib/env.ts` 中的 `IS_ELECTRON` 标志控制：
- `true`：`localStorage` 读写转发至 `desktopStorage.ts`（通过 `mts-storage` IPC 通道读写 `data/library.json`）。
- `false`：直接使用浏览器原生 `localStorage`。

### 6.2 后端存储

| 目录 | 内容 | 生命周期 |
|------|------|----------|
| `result/` | 翻译结果临时文件（图片），按 `task_id` 子目录组织 | 可手动清理 |
| `fonts/custom/` | 用户上传的自定义字体 | 用户手动删除 |
| `models/` | 内置模型 + 拓展下载的模型文件 | 拓展卸载时清理 |
| `%LOCALAPPDATA%/MangaTranslationStudio/hf_home/` | HuggingFace 模型缓存 | 拓展卸载时清理 |
| `logs/` | 运行日志 | 保留最近 7 天 |

---

## 7. 翻译管线核心流程（Pipeline）✅

`POST /scan` 内部执行以下步骤（均在单次请求内同步完成）：

```
1. 接收图片（UploadFile → 临时文件）
2. 按需超分辨率放大（upscaler，默认跳过）
3. 文字检测（detector）→ 返回文字框坐标列表
4. OCR 识别（ocr）→ 每个文字框识别原文
5. 语言检测 / 过滤（langid）→ 跳过目标语言相同的区域
6. 批量翻译（translator）→ 调用第三方 API，获取译文
7. 去字修复（inpainter）→ 在原图上擦除文字并填充背景
8. 文字渲染（renderer）→ 将译文嵌入修复后的图片
9. 返回：
   - translatedImage: base64 编码的渲染后图片
   - cleanImage: base64 编码的修复后图片（无文字）
   - regions: List[TextRegion] 所有文字区域的完整数据
   - imageSize: [width, height]
   - detectedLang: 检测到的源语言代码
   - usedOcr: 实际使用的 OCR 引擎名称
```

---

## 8. 翻译管线配置参数（Pipeline Config）✅

以下参数对应 `manga_translator/config.py` 中的 `Config` 类，由前端通过 `POST /scan` 的 Form 数据传递：

| 参数 | 类型 | 默认值 | 可选值 |
|------|------|--------|--------|
| `detector` | `str` | `"ctd"` | `default` / `dbconvnext` / `ctd` / `craft` / `paddle` / `none` |
| `detection_size` | `int` | `1536` | 512–4096 |
| `ocr` | `str` | `"48px_ctc"` | `32px` / `48px` / `48px_ctc` / `mocr` |
| `translator` | `str` | `"deepseek"` | `deepseek` / `gemini` / `chatgpt` / `groq` / `custom_openai` / `baidu` / `youdao` / `sakura` / `none` 等 |
| `target_lang` | `str` | `"CHS"` | `CHS`（简中）/ `CHT`（繁中）/ `ENG`（英）/ `JPN`（日）/ `KOR`（韩）等 |
| `inpainter` | `str` | `"lama_mpe"` | `lama_mpe` / `lama_large` / `original` / `none` |
| `inpainting_size` | `int` | `1024` | 512–4096 |
| `inpainting_precision` | `str` | `"fp32"` | `fp32` / `fp16` / `bf16`（CPU 仅支持 fp32） |
| `renderer` | `str` | `"default"` | `default` / `manga2eng` / `none` |
| `upscale_ratio` | `int \| null` | `null` | `2` / `4`（null 表示跳过） |

---

## 9. 拓展管理架构（Extension Manager）✅

`app/services/extension_manager.py` 统一管理三类拓展的安装状态：

| 拓展 ID | 实现方式 | 安装内容 | 检测已安装条件 |
|---------|----------|----------|--------------|
| `mocr` | 下载 HF 仓库文件（`kha-white/manga-ocr-base`） | 模型文件至 `HF_HUB_CACHE` | `HF_HUB_CACHE` 中存在对应模型目录 |
| `lama_large` | 下载单个 `.ckpt` 文件 | `models/lama_large_512px.ckpt` | 文件存在且 SHA256 验证通过 |
| `cuda` | `pip install torch torchvision --index-url <cuda_url>` | 替换 CPU 版 torch 为 CUDA 版 | `torch.cuda.is_available()` 返回 `True` |

**下载状态机**（各拓展独立）：
```
idle → downloading → installing → installed
                  ↘ error
```

**并发安全**：每个拓展的下载状态通过 `threading.RLock()` 保护（见 `app/core/config.py` 中的 `MOCRDownloadState` / `LamaLargeDownloadState` / `CudaDownloadState`）。

---

## 10. 错误响应规范（Error Response）✅

| 场景 | HTTP 状态码 | 响应体 |
|------|-------------|--------|
| API Key 缺失 | `401` | `{"error_code": "missing_api_key", "message": "...", "provider": "deepseek"}` |
| API Key 无效 | `403` | `{"error_code": "missing_api_key", "message": "...", "provider": "deepseek"}` |
| API 请求限频 | `429` | `{"error_code": "missing_api_key", "message": "...", "provider": "deepseek"}` |
| 文件处理错误 | `500` | `{"status": "error", "message": "错误描述"}` |
| 参数验证失败 | `422` | Pydantic 默认 `ValidationError` 响应 |
| 拓展未知 ID | `400` | `{"detail": "Unknown extension id: xxx"}` |

前端通过 `src/lib/translateClient.ts` 中的 `isMissingApiKeyError()` 和 `resolveMissingApiKeyError()` 统一处理 API Key 相关错误。
