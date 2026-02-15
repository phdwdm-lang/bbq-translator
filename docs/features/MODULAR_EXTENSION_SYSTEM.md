# 模块化安装与拓展中心设计文档 (Modular Extension System)

## 1. 背景与目标 (Background & Goals)

### 1.1 现状问题
目前软件分发包（Bundle）集成了 CUDA 运行时、MangaOCR 模型、LaMa Large 模型等大体积组件，导致：
- **安装包体积过大**（可能超过 2-4GB），下载耗时。
- **用户门槛高**：对于仅想体验或硬件配置较低（无 NVIDIA 显卡）的用户，强制下载 CUDA 组件是浪费。
- **更新困难**：每次更新都需要重新下载完整的巨型包。

### 1.2 设计目标
- **轻量化初始包 (Lightweight Core)**：将初始下载体积控制在 **1GB 以内**（仅含 CPU 环境 + 轻量模型）。
- **按需加载 (On-Demand)**：高阶功能（GPU 加速、SOTA 模型）作为“拓展模块”由用户在软件内按需下载。
- **国内直连 (Proxy-Free)**：所有拓展模块必须支持在国内网络环境下直接下载，无需用户配置代理。
- **可视化管理**：提供直观的 UI 查看模块状态、下载进度和进行管理。

---

## 2. 模块划分 (Module Definitions)

### 2.1 核心包 (Core - Default Installed)
所有用户下载的默认版本，开箱即用，保证基础功能完整。
- **运行环境**：Python Embedded, PyTorch (CPU 版本)。
- **OCR 能力**：
  - `ocr-32px` / `ocr-48px` (轻量级模型)。
  - `ocr-48px-ctc` (CPU 推理速度尚可)。
- **去字/嵌字能力**：
  - `LaMa-Tiny` 或 `Original` (传统算法)。
  - 基础渲染器。
- **翻译能力**：
  - 在线翻译 API（DeepSeek, Google, etc.）。

### 2.2 拓展模块 (Extension Modules)

| 模块名称 | 内容描述 | 典型体积 | 依赖关系 | 作用 |
| :--- | :--- | :--- | :--- | :--- |
| **CUDA 加速包** | `torch+cu121` 及其依赖的 `.dll/.so` | ~2.5GB | 需 NVIDIA 显卡 | 提升整体处理速度 5-10 倍。 |
| **MangaOCR 模型** | `kha-white/manga-ocr-base` 完整权重 | ~400MB | 推荐 CUDA | 提供业界最佳的竖排/手写体日语识别能力。 |
| **LaMa Large 模型** | `big-lama.pt` | ~350MB | 推荐 CUDA | 提供最佳的去字（Inpainting）效果，尤其是大面积文字覆盖。 |
| **离线翻译模型** | (可选) 本地 LLM 或 NLLB 离线包 | >2GB | 必须 CUDA | 支持完全离线翻译（未来规划）。 |

---

## 3. 技术方案 (Technical Architecture)

### 3.1 资源分发与下载源 (Distribution & Source)
为实现无代理下载，采用以下策略：

1.  **HuggingFace 镜像 (hf-mirror.com)**
    - 适用：**MangaOCR**, **LaMa Large** 等模型文件。
    - 方案：后端通过设置 `HF_ENDPOINT=https://hf-mirror.com` 调用 `huggingface_hub` 或 `snapshot_download`。
    
2.  **PyPI 国内镜像 (Aliyun/Tsinghua)**
    - 适用：**CUDA 包** (若通过 `pip` 机制安装)。
    - 方案：`pip install ... -i https://mirrors.aliyun.com/pypi/simple/`。
    
3.  **定制化 CDN / 对象存储 (OSS/R2)**
    - 适用：**CUDA 运行时库 (Runtime Libs)** 的打包 zip。由于 pip 安装完整的 torch cuda 版在嵌入式 python 环境中可能较复杂，直接下载预打包好的 `site-packages` 覆盖或挂载可能是更稳健的方案（类似现在的 MOCR 离线包机制）。

### 3.2 后端架构 (Backend)

新增 `ExtensionManager` 类，负责：

- **状态维护**：
  - 扫描本地目录（如 `models/` 或 `libs/`）判断模块是否已安装。
  - 维护内存中的下载任务状态（进度、速度、剩余时间、错误信息）。
  - **热更新通知**：安装完成后广播事件，通知前端刷新可用性状态。
- **下载引擎**：
  - **双模式支持**：
    1.  **在线下载**：支持多线程、断点续传、镜像源切换。
    2.  **离线导入**：支持上传本地 Zip 包（校验 Hash 后解压安装），适配无网/内网环境。
  - 下载完成后自动校验 SHA256。
  - 自动解压/部署到指定目录。
- **生命周期管理**：
  - **安装 (Install)**：下载 -> 校验 -> 解压 -> 注册。
  - **卸载 (Uninstall)**：安全删除文件 -> 清理配置 -> 释放空间。
  - **重启提示 (Restart Hint)**：安装完成后在接口返回中提供重启建议/强制标志，前端据此提示用户重启以更新环境（最稳妥）。
    - 建议字段：`restart_recommended: boolean`、`restart_required: boolean`、`restart_reason: string`。
    - 约定：模型类拓展（MOCR/LaMa Large）通常为 `restart_recommended=true`；运行时类拓展（CUDA/Torch GPU）为 `restart_required=true`。

### 3.3 前端交互 (UI/UX)

#### A. 设置页 - 拓展中心 (Extension Center)
位置：`设置 (SettingsModal)` -> `拓展 (Extensions)`

**UI 布局与信息展示：**
- **状态概览栏**：显示当前运行环境（CPU / GPU），磁盘占用情况。
- **模块列表 (Card List)**：
  - 每个模块一个详细卡片。
  - **基础信息**：
    - 图标 + 名称 (e.g., "LaMa Large 去字模型")。
    - **用途描述**：(e.g., "提供最佳的去字效果，针对大面积遮盖优化，推荐显存 > 4GB 使用")。
    - **体积**：(e.g., "350 MB")。
  - **状态/进度区**：
    - **未安装**：显示 [在线下载] 和 [离线导入] 按钮。
    - **下载中**：进度条 (45%) + 实时速度 (5.2 MB/s) + [暂停] / [取消]。
    - **已安装**：显示 "已就绪" + [校验完整性] + [删除] (红色危险按钮)。

**安装完成后的重启提示：**
- 当某个拓展安装完成后，如果后端返回 `restart_recommended` 或 `restart_required`，前端应弹出提示：
  - 文案示例："拓展已安装完成。为确保环境更新生效，建议立即重启软件。"
  - 如果是 `restart_required=true`（例如 CUDA/Torch GPU）：提示应更强（"必须重启后才可使用"），并在该模块卡片上持续显示“待重启生效”。
- 操作按钮：
  - [立即重启]：调用应用层重启能力（若具备），或给出明确指引（关闭后重新打开）。
  - [稍后]：允许用户继续操作，但需要在 UI 上保留“待重启”状态提醒。

#### C. 翻译器账号管理 (Translator Credentials)
位置：`设置 (SettingsModal)` -> `账号 (Accounts)`

为了方便用户使用在线翻译服务，新增统一的凭证管理模块，支持主流 LLM 和传统翻译 API 的密钥配置。

1.  **支持的服务商 (Providers)**
    根据后端能力，支持配置以下服务商的凭证：
    *   **LLM 系列**:
        *   **ChatGPT / OpenAI**: `API Key`, `API Base URL` (可选), `Model` (可选)
        *   **DeepSeek**: `API Key`
        *   **Gemini**: `API Key`
        *   **Groq**: `API Key`
        *   **Custom OpenAI**: `API Key`, `API Base URL` (用于适配 Claude/LocalLLM 等兼容接口)
    *   **传统翻译 API**:
        *   **Baidu (百度翻译)**: `App ID`, `Secret Key`
        *   **Youdao (有道翻译)**: `App Key`, `App Secret`
        *   **DeepL**: `API Key`
        *   **Caiyun (彩云小译)**: `Token`
        *   **Papago**: `Client ID`, `Client Secret`

2.  **UI 交互设计**
    *   **服务商列表**: 以网格或列表形式展示各服务商 Logo/名称。
    *   **配置弹窗/折叠面板**:
        *   点击服务商图标，展开配置表单。
        *   表单根据服务商类型动态渲染字段（例如百度显示 AppID+Key，ChatGPT 显示 Key+BaseURL）。
        *   **掩码显示**: 密钥类字段默认显示为 `******`，提供“显示/隐藏”切换按钮。
        *   **测试连接 (Test Connection)**: 提供按钮调用后端轻量级接口（或直接请求翻译接口测试），验证密钥有效性，并显示“连接成功”或错误信息。
    *   **状态指示**: 已配置且验证通过的服务商显示“已连接”绿色状态点。

3.  **存储与注入逻辑 (Storage & Injection)**
    *   **存储**: 
        *   凭证数据加密（或 Base64 混淆）后存储于前端浏览器的 `localStorage` (Key: `mts_credentials_v1`)。
        *   *注：为保持后端无状态及适应桌面端单用户特性，暂不强制要求后端数据库存储密钥。*
    *   **注入**:
        *   当用户发起翻译任务（扫描/批量翻译）时，前端根据当前选择的 `translator` 类型，自动从 `localStorage` 读取对应凭证。
        *   将凭证合并到 `TranslatorConfig` 参数中（如 `openai_api_key`, `baidu_app_id` 等），随请求发送给后端 `MangaTranslator`。

---

## 4. 详细开发计划 (Implementation Plan)

### Phase 1: 基础设施搭建
1.  **后端**：
    - 实现 `ExtensionManager`，定义模块注册表（Registry）。
    - 封装通用的 `Downloader`（支持镜像源切换、进度回调）。
    - 开放 API: `/extensions/list`, `/extensions/install`, `/extensions/uninstall`。
2.  **前端**：
    - 改造 SettingsModal，完善“拓展”标签页的 UI 骨架。

### Phase 2: 模型类拓展 (Model Extensions)
*优先实现模型类，因为它们不涉及 Python 核心库的替换，风险较低。*
1.  **MangaOCR 模块化**：
    - 复用已实现的 MOCR 离线导入逻辑，改为“在线下载”逻辑（走 hf-mirror）。
    - 只有当检测到模型文件存在时，后端才允许调用 MOCR。
2.  **LaMa Large 模块化**：
    - 同上，下载 `big-lama.pt` 到指定缓存目录。

### Phase 3: 核心运行时拓展 (Runtime Extensions - CUDA)
*风险最高，需要精细的文件替换逻辑。*
1.  **打包策略**：制作一个仅包含 CUDA 相关 dll 和 python 库的 zip 包。
2.  **安装逻辑**：
    - 下载 zip -> 解压 -> 覆盖/并入 `site-packages` 或 `bin` 目录。
    - 标记 `config.yaml` 或 `.env` 里的 `USE_CUDA=true`。
3.  **重启机制**：前端收到“安装成功”信号后，引导用户重启应用。

---

## 5. 风险与对策

1.  **下载中断**：
    - 对策：必须支持 Range 请求（断点续传）。
2.  **文件损坏**：
    - 对策：下载后强制 SHA256 校验，不通过则自动重试或报错。
3.  **环境冲突**：
    - 对策：CUDA 包必须与 Core 包的 Python 版本和 Torch 版本严格对应（如 Core 用 torch 2.6.0+cpu，CUDA 包用 torch 2.6.0+cu121）。设计文档中需规定版本锁定策略。
