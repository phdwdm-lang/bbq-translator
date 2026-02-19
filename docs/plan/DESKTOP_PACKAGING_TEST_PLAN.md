# 桌面端打包与测试方案

> 版本：v2.0  
> 日期：2026-02-18  
> 状态：方案阶段（未执行代码修改）

---

## 一、目标效果

### 1.1 用户体验目标

| 项目 | 目标 |
|------|------|
| **安装方式** | 解压 zip 即用，无需安装程序 |
| **首次启动** | 冷启动 ≤ 3 分钟（含模块导入），后续启动 ≤ 30 秒 |
| **离线可用** | 检测、OCR、修复全流程离线可用，零网络依赖 |
| **翻译依赖** | 仅翻译环节需联网，用户只需配置 DeepSeek API Key |
| **代理依赖** | 完全不需要代理，国内网络直接使用 |
| **模型下载** | 首次使用无需等待任何模型下载 |
| **安装包体积** | 压缩后 ≤ 1.5 GB（优先可用性，体积次之） |

### 1.2 核心用户流程

```
用户解压 zip → 双击 exe → 等待后端启动（进度提示）
→ 导入图片 → 选择"我自己来" → 自动检测+OCR+修复（全离线）
→ 配置 DeepSeek API Key → 翻译（联网）→ 导出
```

---

## 二、当前问题与卡点

### 2.1 已修复的问题

| 问题 | 根因 | 修复方案 | 状态 |
|------|------|----------|------|
| 关闭应用后 Python 进程残留 | Windows 上 `SIGTERM` 无法杀死子进程 | 使用 `taskkill /F /T /PID` 替代 | ✅ 已修复 |
| 再次启动端口冲突 | 残留进程占用 8000 端口 | 启动前 `killStaleBackendProcesses()` 清理 | ✅ 已修复 |
| Electron 日志 0 bytes | Python 管道模式下 stdout 缓冲 | 添加 `PYTHONUNBUFFERED=1` 环境变量 | ✅ 已修复 |
| 健康检查超时 | 冷启动模块导入耗时 ~145 秒 | 超时从 30s → 180s | ✅ 已修复 |

### 2.2 当前未修复的问题

#### 🔴 P0：预置模型错误（核心卡点）

**现象**：用户点击"我自己来"翻译时，终端输出正在从 GitHub 下载 `detect-20241225.ckpt`（294MB），而非使用预置模型。

**根因**：`electron/main.cjs` 中 `BUNDLED_MODELS` 预置了 **CTD 检测器** 的模型（`comictextdetector.pt` / `.onnx`），但后端默认使用的是 **DefaultDetector**，需要的是 `detect-20241225.ckpt`。

```javascript
// 当前预置（错误）
const BUNDLED_MODELS = [
  { subDir: "detection", fileName: "comictextdetector.pt" },      // CTD 模型，非默认
  { subDir: "detection", fileName: "comictextdetector.pt.onnx" },  // CTD 模型，非默认
  { subDir: "ocr", fileName: "ocr_ar_48px.ckpt" },
  { subDir: "ocr", fileName: "alphabet-all-v7.txt" },
  { subDir: "inpainting", fileName: "inpainting_lama_mpe.ckpt" },
];
```

**后端默认配置**（`manga_translator/config.py`）：

| 模块 | 默认值 | 对应类 | 需要的模型文件 |
|------|--------|--------|----------------|
| 检测器 | `Detector.default` | `DefaultDetector` | `detect-20241225.ckpt` |
| OCR | `Ocr.ocr48px` | `Model48pxOCR` | `ocr_ar_48px.ckpt` + `alphabet-all-v7.txt` |
| 修复器 | `Inpainter.lama_mpe` | `LamaMPEInpainter` | `inpainting_lama_mpe.ckpt` |

#### 🔴 P0："自动翻译"报错 `Book not found`

**现象**：用户使用"自动翻译"功能时，DevTools Console 报错 `Uncaught (in promise) Error: Book not found`。

**初步分析**：前端 `storage.ts` 中 `createChapter()` 在 `loadLibrary()` 找不到对应 `bookId` 时抛出此错误。推测"自动翻译"流程中创建章节时，Book 尚未写入 localStorage 或 bookId 传参不一致。此问题需要进一步追踪前端 auto-translate 调用链定位。

#### 🟡 P1：冷启动耗时过长（~145 秒）

**现象**：首次启动后端需要约 145 秒完成 Python 模块导入，期间用户看到"后端启动中..."。

**根因**：嵌入式 Python 环境中 PyTorch 等大型库的首次导入耗时极长。

**可能的优化方向**：
- 延迟导入非核心模块（lazy import）
- 预编译 `.pyc` 文件减少解析时间
- 前端增加启动进度提示，告知用户预计等待时间
- 后续版本探索模块裁剪（去除未使用的 CUDA/GPU 相关代码）

#### 🟡 P1：`ensureBundledModels()` 仅在打包环境下执行

**现象**：`resolveBundledModelsDir()` 在非打包环境下返回空字符串，导致开发模式下无法测试模型复制逻辑。

---

## 三、正确的模型预置清单

### 3.1 默认管线所需模型

| 模块 | 子目录 | 文件名 | 下载 URL | 预估大小 | SHA256 |
|------|--------|--------|----------|----------|--------|
| Detection (default) | `detection/` | `detect-20241225.ckpt` | `https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.3/detect-20241225.ckpt` | ~294 MB | `67ce1c4ed4793860f038c71189ba9630a7756f7683b1ee5afb69ca0687dc502e` |
| OCR (48px) | `ocr/` | `ocr_ar_48px.ckpt` | `https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.3/ocr_ar_48px.ckpt` | ~100 MB | `29daa46d080818bb4ab239a518a88338cbccff8f901bef8c9db191a7cb97671d` |
| OCR 字典 | `ocr/` | `alphabet-all-v7.txt` | `https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.3/alphabet-all-v7.txt` | ~1 MB | `f5722368146aa0fbcc9f4726866e4efc3203318ebb66c811d8cbbe915576538a` |
| Inpainting (lama_mpe) | `inpainting/` | `inpainting_lama_mpe.ckpt` | `https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.3/inpainting_lama_mpe.ckpt` | ~200 MB | `d625aa1b3e0d0408acfd6928aa84f005867aa8dbb9162480346a4e20660786cc` |

**预估合计：~595 MB（未压缩）**

### 3.2 CTD 检测器 → 拓展包（不预置）

CTD 检测器仅在用户手动选择 `detector=ctd` 时使用，桌面端默认使用 `DefaultDetector`，因此 **不预置到安装包中**，改为拓展包形式供用户按需导入。

| 文件 | 用途 | 是否默认使用 | 处理方式 |
|------|------|-------------|----------|
| `comictextdetector.pt` | CTD 检测器 (GPU) | ❌ 非默认 | 打包到 CTD 拓展包 |
| `comictextdetector.pt.onnx` | CTD 检测器 (CPU) | ❌ 非默认 | 打包到 CTD 拓展包 |

> 去掉预置可节省约 120 MB 安装包体积。用户如需使用 CTD 检测器，可通过拓展中心导入。

### 3.3 CTD 拓展包规格

拓展包采用 zip 格式，CPU 版与 GPU 版捆绑在一起，用户一次导入即可获得两个版本。

**拓展包名称**：`ctd-detector-v1.0.zip`

**拓展包内容**：

```
ctd-detector-v1.0/
├── manifest.json              # 拓展包元信息
├── comictextdetector.pt       # GPU 版模型 (~65 MB)
└── comictextdetector.pt.onnx  # CPU 版模型 (~55 MB)
```

**manifest.json 示例**：

```json
{
  "name": "ctd-detector",
  "version": "1.0.0",
  "display_name": "CTD 漫画文字检测器",
  "description": "Comic Text Detector - 专为漫画优化的文字检测模型，包含 CPU 和 GPU 版本",
  "type": "model",
  "category": "detection",
  "target_dir": "detection",
  "files": [
    {
      "name": "comictextdetector.pt",
      "hash": "1f90fa60aeeb1eb82e2ac1167a66bf139a8a61b8780acd351ead55268540cccb",
      "size": 68000000,
      "variant": "gpu"
    },
    {
      "name": "comictextdetector.pt.onnx",
      "hash": "1a86ace74961413cbd650002e7bb4dcec4980ffa21b2f19b86933372071d718f",
      "size": 57000000,
      "variant": "cpu"
    }
  ],
  "total_size": 125000000,
  "restart_recommended": false
}
```

**拓展包预构建位置**：`D:\work\project\拓展包\ctd-detector-v1.0.zip`

**用户导入流程**：

1. 用户在拓展中心点击「离线导入」
2. 选择 `ctd-detector-v1.0.zip` 文件
3. 后端校验 `manifest.json` + SHA256
4. 解压模型文件到 `{userData}/data/models/detection/`
5. 用户在检测器设置中切换为 CTD

> **后续开发**：拓展中心的离线导入功能需在拓展模块系统（`MODULAR_EXTENSION_SYSTEM.md`）中实现，当前阶段先准备好拓展包文件。

### 3.4 运行时路径

```
模型存储位置（userData）：
  %APPDATA%\mangatrans-studio\data\models\detection\detect-20241225.ckpt
  %APPDATA%\mangatrans-studio\data\models\ocr\ocr_ar_48px.ckpt
  %APPDATA%\mangatrans-studio\data\models\ocr\alphabet-all-v7.txt
  %APPDATA%\mangatrans-studio\data\models\inpainting\inpainting_lama_mpe.ckpt

打包时预置位置（安装目录）：
  {installDir}\resources\bundled-models\detection\detect-20241225.ckpt
  {installDir}\resources\bundled-models\ocr\ocr_ar_48px.ckpt
  {installDir}\resources\bundled-models\ocr\alphabet-all-v7.txt
  {installDir}\resources\bundled-models\inpainting\inpainting_lama_mpe.ckpt

首次启动时由 ensureBundledModels() 将预置模型复制到 userData。
```

### 3.5 后端如何判断模型已下载

`ModelWrapper._check_downloaded()` → `_check_downloaded_map()` 检查 `model_dir` 下文件是否存在：

```python
# detection/default.py - DefaultDetector
# file='.' → 从 URL 推断文件名 → detect-20241225.ckpt
# 检查路径: {_MODEL_DIR}/detection/detect-20241225.ckpt

# ocr/model_48px.py - Model48pxOCR  
# 无 file 字段 → file 默认为 '.' → 从 URL 推断
# 检查路径: {_MODEL_DIR}/ocr/ocr_ar_48px.ckpt, {_MODEL_DIR}/ocr/alphabet-all-v7.txt

# inpainting/inpainting_lama_mpe.py - LamaMPEInpainter
# file='.' → 从 URL 推断 → inpainting_lama_mpe.ckpt
# 检查路径: {_MODEL_DIR}/inpainting/inpainting_lama_mpe.ckpt
```

---

## 四、后续开发计划

### 阶段 1：修复核心可用性（优先级最高）

| 序号 | 任务 | 详情 | 预估工作量 |
|------|------|------|-----------|
| 1.1 | 修正模型预置清单 | 将 `BUNDLED_MODELS` 中的 CTD 模型替换为 `detect-20241225.ckpt` | 小 |
| 1.2 | 更新模型下载脚本 | `scripts/download_models.ps1` 下载正确的模型文件 | 小 |
| 1.3 | 修复"自动翻译" Book not found | 追踪 auto-translate 调用链，定位 bookId 传参问题 | 中 |
| 1.4 | 重新打包并测试 | 在离线环境下验证检测+OCR+修复全流程 | 小 |

### 阶段 2：用户体验优化

| 序号 | 任务 | 详情 | 预估工作量 |
|------|------|------|-----------|
| 2.1 | 启动进度提示 | 前端显示后端加载进度（模块导入 / 模型加载），替代单一"启动中..." | 中 |
| 2.2 | 冷启动优化 | 探索延迟导入、`.pyc` 预编译、模块裁剪 | 大 |
| 2.3 | API Key 引导 | 首次使用时引导用户配置 DeepSeek API Key | 小 |
| 2.4 | 错误提示友好化 | 翻译失败时给出明确提示（如"请检查 API Key 配置"） | 小 |
| 2.5 | CTD 拓展包离线导入 | 拓展中心支持用户导入 CTD 拓展包 zip，校验后解压到模型目录 | 中 |

### 阶段 3：安装包瘦身（可用性稳定后）

| 序号 | 任务 | 详情 | 预估工作量 |
|------|------|------|-----------|
| 3.1 | Python 环境裁剪 | 去除未使用的 CUDA/GPU 库、测试文件、文档 | 大 |
| 3.2 | PyTorch CPU-only | 替换为 CPU-only 版 PyTorch，节省数百 MB | 中 |
| 3.3 | 模型压缩 | 探索模型量化（FP16/INT8）减小体积 | 大 |

---

## 五、测试方案

### 5.1 测试环境要求

| 条件 | 说明 |
|------|------|
| 操作系统 | Windows 10/11 x64 |
| 网络 | 完全断网（或仅允许 DeepSeek API `api.deepseek.com`） |
| 用户数据 | 清空 `%APPDATA%\mangatrans-studio` 模拟首次安装 |
| 代理 | 无代理 |
| 测试目录 | 全新目录解压 zip 包 |

### 5.2 测试用例

#### TC-01：首次启动

| 步骤 | 预期结果 |
|------|----------|
| 1. 清空 `%APPDATA%\mangatrans-studio` | - |
| 2. 解压 zip 到全新目录 | - |
| 3. 双击 exe 启动 | 应用窗口出现 |
| 4. 等待后端启动 | 3 分钟内 UI 显示"后端已连接"，无 `ERR_CONNECTION_REFUSED` |
| 5. 检查模型目录 | `%APPDATA%\mangatrans-studio\data\models\` 下有 detection/ocr/inpainting 模型文件 |

#### TC-02：离线翻译管线（"我自己来"模式）

| 步骤 | 预期结果 |
|------|----------|
| 1. 导入漫画图片 | 图片显示在编辑器中 |
| 2. 选择"我自己来"，源语言=自动检测，目标语言=简体中文 | - |
| 3. 观察终端日志 | 检测模型加载（无下载），OCR 模型加载（无下载），修复模型加载（无下载） |
| 4. 等待检测+OCR+修复完成 | 文本框高亮显示，OCR 结果正确，修复后图片干净 |
| 5. 无网络下跳过翻译 | 进入编辑模式，用户可手动编辑文本 |

#### TC-03：自动翻译模式（需联网）

| 步骤 | 预期结果 |
|------|----------|
| 1. 配置 DeepSeek API Key | 设置面板可正常保存 |
| 2. 允许网络访问 `api.deepseek.com` | - |
| 3. 导入图片，选择"自动翻译" | 自动完成检测→OCR→修复→翻译→渲染，无报错 |
| 4. 检查翻译结果 | 翻译文本正确嵌入图片 |

#### TC-04：再次启动（进程清理验证）

| 步骤 | 预期结果 |
|------|----------|
| 1. 关闭应用 | Python 进程被正确终止 |
| 2. 验证无残留进程 | `Get-Process python` 无 `test-mts` 相关进程 |
| 3. 重新启动应用 | 后端正常启动在端口 8000（非 8001），UI 正常连接 |

#### TC-05：终端日志验证

| 检查项 | 预期 |
|--------|------|
| 日志文件非空 | `%APPDATA%\mangatrans-studio\data\logs\backend-*.log` 有内容 |
| 无模型下载日志 | 不出现 `Downloading:` 字样（模型应已预置） |
| 健康检查通过 | 出现 `[electron] Backend ready on http://127.0.0.1:8000` |

### 5.3 自动化测试脚本

已有 `scripts/test_offline_install.ps1` 可执行基础的解压+启动+超时验证。待模型预置修正后，需扩展此脚本增加以下检查：

- 验证模型文件复制到 userData
- 健康检查响应 200
- 发送 `/scan` 请求验证检测+OCR+修复离线可用
- 关闭后验证进程清理

---

## 六、安装包组成与体积预估

| 组件 | 未压缩大小 | 压缩后预估 | 说明 |
|------|-----------|-----------|------|
| Electron + 前端 | ~250 MB | ~90 MB | app.asar + Electron runtime |
| 嵌入式 Python 环境 | ~2.5 GB | ~900 MB | Python 3.11 + PyTorch CPU + 依赖 |
| 后端代码 | ~50 MB | ~15 MB | manga-backend 源码 |
| 预置模型 | ~595 MB | ~550 MB | 检测+OCR+修复模型（压缩比低） |
| **合计** | **~3.4 GB** | **~1.55 GB** | |

> **注意**：当前体积超出 `DESKTOP_APP_DESIGN.md` 中 ≤ 500 MB 的约束。主要原因是 PyTorch CPU 运行时体积较大。后续可通过 PyTorch CPU-only 包 + 模块裁剪大幅压缩。当前阶段优先保证可用性。

---

## 七、关键代码修改清单（待执行）

以下修改在方案确认后执行，此处仅列出范围：

### 7.1 `electron/main.cjs`

- 修正 `BUNDLED_MODELS` 数组：移除 CTD 模型，添加 `detect-20241225.ckpt`
- 确认 `ensureBundledModels()` 的复制逻辑兼容新文件名

### 7.2 `scripts/download_models.ps1`

- 更新模型下载列表：
  - 移除 `comictextdetector.pt`、`comictextdetector.pt.onnx`
  - 添加 `detect-20241225.ckpt`
- 更新 SHA256 校验值

### 7.3 前端 auto-translate 流程

- 追踪 `Book not found` 错误的调用链
- 修复 bookId 传参时序问题

### 7.4 `electron-builder.yml`

- 确认 `extraResources` 中 `bundled-models` 目录正确包含新模型文件

---

## 八、风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| GitHub 下载模型不稳定 | 构建环境无法下载模型 | 提供镜像下载源，或手动预下载 |
| 模型文件 hash 变更 | 下载后校验失败 | 脚本中记录 hash，异常时跳过校验并警告 |
| Python 环境裁剪过度 | 某些功能运行时报 ImportError | 裁剪前建立完整功能测试用例 |
| 安装包过大用户不愿下载 | 用户流失 | 阶段 3 瘦身优化，提供分体下载（基础包+模型包） |
