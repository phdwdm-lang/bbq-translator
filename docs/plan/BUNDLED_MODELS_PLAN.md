# 预置核心模型打包方案

> 版本：v1.0  
> 日期：2026-02-17  
> 目标：首次使用离线可用（检测/OCR/修复），无需联网下载模型

---

## 一、背景与目标

### 1.1 当前问题

- 核心模型（检测、OCR、修复）未包含在安装包中
- 用户首次使用时需要联网下载 ~420MB 模型文件
- 国内网络环境下载 GitHub Releases 不稳定
- 离线环境完全无法使用

### 1.2 目标

- **首次启动即可翻译**：检测/OCR/修复功能开箱即用
- **离线友好**：除翻译 API 外，全流程离线可用
- **增量下载**：用户可后续下载可选模型（MOCR、LaMa Large）

---

## 二、核心模型清单

| 模块 | 子目录 | 文件名 | 下载 URL | SHA256 |
|------|--------|--------|----------|--------|
| CTD 检测 (GPU) | `detection/` | `comictextdetector.pt` | `https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.3/comictextdetector.pt` | `1f90fa60aeeb1eb82e2ac1167a66bf139a8a61b8780acd351ead55268540cccb` |
| CTD 检测 (CPU) | `detection/` | `comictextdetector.pt.onnx` | `https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.3/comictextdetector.pt.onnx` | `1a86ace74961413cbd650002e7bb4dcec4980ffa21b2f19b86933372071d718f` |
| OCR 模型 | `ocr/` | `ocr_ar_48px.ckpt` | `https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.3/ocr_ar_48px.ckpt` | `29daa46d080818bb4ab239a518a88338cbccff8f901bef8c9db191a7cb97671d` |
| OCR 字典 | `ocr/` | `alphabet-all-v7.txt` | `https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.3/alphabet-all-v7.txt` | `f5722368146aa0fbcc9f4726866e4efc3203318ebb66c811d8cbbe915576538a` |
| LaMa 修复 | `inpainting/` | `inpainting_lama_mpe.ckpt` | `https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.3/inpainting_lama_mpe.ckpt` | `d625aa1b3e0d0408acfd6928aa84f005867aa8dbb9162480346a4e20660786cc` |

> **注意**：`ModelWrapper._check_downloaded()` 会检查 `_MODEL_MAPPING` 中所有条目，CTD 的 .pt 和 .onnx 都需要预置，否则会触发下载。

### 预估体积

| 文件 | 大小 |
|------|------|
| comictextdetector.pt | ~65 MB |
| comictextdetector.pt.onnx | ~55 MB |
| ocr_ar_48px.ckpt | ~100 MB |
| alphabet-all-v7.txt | ~1 MB |
| inpainting_lama_mpe.ckpt | ~200 MB |
| **合计** | **~420 MB** |

---

## 三、运行时路径分析

### 3.1 路径链

```
electron/main.cjs (line 181)
  MTS_BASE_PATH = app.getPath("userData") + "/data"
                = C:\Users\{user}\AppData\Roaming\MangaTrans Studio\data

manga_translator/utils/inference.py (line 94)
  _MODEL_DIR = os.path.join(BASE_PATH, 'models')
             = {userData}/data/models

最终模型路径示例:
  {userData}/data/models/detection/comictextdetector.pt.onnx
  {userData}/data/models/ocr/ocr_ar_48px.ckpt
  {userData}/data/models/inpainting/inpainting_lama_mpe.ckpt
```

### 3.2 为什么需要复制

- 安装目录 (`Program Files`) 可能是只读的
- 用户后续下载的模型需要写入同一目录
- 保持与现有 `ModelWrapper` 逻辑兼容，无需修改后端代码

---

## 四、修改清单

### 4.1 新建文件

| 文件路径 | 作用 |
|----------|------|
| `scripts/download_models.ps1` | 构建时下载核心模型到 `build/bundled-models/` |

### 4.2 修改文件

| 文件路径 | 修改内容 |
|----------|----------|
| `scripts/build_desktop.ps1` | 在 Python 构建后、打包前调用 `download_models.ps1` |
| `electron-builder.yml` | 添加 `build/bundled-models` 到 `extraResources` |
| `electron/main.cjs` | 添加 `ensureBundledModels()` 函数，首次启动时复制模型 |

### 4.3 不需要修改的文件

- **Python 后端代码**：`ModelWrapper` 已有完善的 `_check_downloaded()` 逻辑，只要文件在正确位置即可

---

## 五、详细实现

### 5.1 `scripts/download_models.ps1`

```powershell
# 功能：下载核心模型到 build/bundled-models/
# 调用：.\scripts\download_models.ps1 [-TargetDir <path>] [-SkipExisting]

# 模型清单（数组）
$MODELS = @(
    @{ SubDir = "detection"; FileName = "comictextdetector.pt"; Url = "..."; Hash = "..." },
    @{ SubDir = "detection"; FileName = "comictextdetector.pt.onnx"; Url = "..."; Hash = "..." },
    @{ SubDir = "ocr"; FileName = "ocr_ar_48px.ckpt"; Url = "..."; Hash = "..." },
    @{ SubDir = "ocr"; FileName = "alphabet-all-v7.txt"; Url = "..."; Hash = "..." },
    @{ SubDir = "inpainting"; FileName = "inpainting_lama_mpe.ckpt"; Url = "..."; Hash = "..." }
)

# 逻辑：
# 1. 遍历模型清单
# 2. 检查目标文件是否存在且 hash 匹配 → 跳过
# 3. 下载文件（支持断点续传）
# 4. 验证 SHA256
# 5. 失败则报错退出
```

### 5.2 `scripts/build_desktop.ps1` 修改

在 Step 2（Build Embedded Python）和 Step 3（Package）之间插入：

```powershell
# ── Step 2.5: Download Core Models ──
$stepNum++
$modelsDir = Join-Path $ProjectRoot "build\bundled-models"
if (-not $SkipModels) {
    Write-Host "[$stepNum] Downloading core models..." -ForegroundColor Green
    & "$PSScriptRoot\download_models.ps1" -TargetDir $modelsDir
    if ($LASTEXITCODE -ne 0) { throw "Model download failed" }
} else {
    Write-Host "[$stepNum] Skipping model download" -ForegroundColor Yellow
}
```

添加参数：`-SkipModels` 开关

### 5.3 `electron-builder.yml` 修改

在 `extraResources` 数组中添加：

```yaml
# Bundled models for offline use (~420 MB)
- from: "build/bundled-models"
  to: "bundled-models"
  filter:
    - "**/*"
```

### 5.4 `electron/main.cjs` 修改

添加 `ensureBundledModels()` 函数：

```javascript
// 核心模型清单（与 download_models.ps1 保持一致）
const BUNDLED_MODELS = [
  { subDir: "detection", fileName: "comictextdetector.pt" },
  { subDir: "detection", fileName: "comictextdetector.pt.onnx" },
  { subDir: "ocr", fileName: "ocr_ar_48px.ckpt" },
  { subDir: "ocr", fileName: "alphabet-all-v7.txt" },
  { subDir: "inpainting", fileName: "inpainting_lama_mpe.ckpt" },
];

function ensureBundledModels() {
  if (!IS_PACKAGED) return; // 开发模式跳过

  const bundledDir = path.join(process.resourcesPath, "bundled-models");
  const targetDir = path.join(resolveDataDir(), "models");

  for (const model of BUNDLED_MODELS) {
    const srcPath = path.join(bundledDir, model.subDir, model.fileName);
    const dstPath = path.join(targetDir, model.subDir, model.fileName);

    // 目标已存在则跳过
    if (fs.existsSync(dstPath)) continue;

    // 源文件不存在则跳过（不应发生）
    if (!fs.existsSync(srcPath)) {
      console.warn(`[electron] Bundled model not found: ${srcPath}`);
      continue;
    }

    // 创建目标目录并复制
    fs.mkdirSync(path.dirname(dstPath), { recursive: true });
    fs.copyFileSync(srcPath, dstPath);
    console.log(`[electron] Copied model: ${model.subDir}/${model.fileName}`);
  }
}
```

在 `app.whenReady()` 中、`startBackend()` 之前调用：

```javascript
app.whenReady().then(async () => {
  // 确保核心模型已复制到用户数据目录
  ensureBundledModels();

  const skipBackend = process.env.MTS_SKIP_BACKEND === "1";
  // ...
});
```

---

## 六、流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                        构建阶段                                  │
├─────────────────────────────────────────────────────────────────┤
│  download_models.ps1                                            │
│    ↓ 下载 5 个模型文件                                          │
│    ↓ 存放到 build/bundled-models/{subDir}/{fileName}           │
│                                                                 │
│  build_desktop.ps1                                              │
│    Step 1: Build Frontend (Next.js)                             │
│    Step 2: Build Python (嵌入式 Python + 依赖)                  │
│    Step 2.5: Download Models (NEW)                              │
│    Step 3: Package (electron-builder)                           │
│            ↓ bundled-models → {resourcesPath}/bundled-models    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      运行阶段 (首次启动)                         │
├─────────────────────────────────────────────────────────────────┤
│  main.cjs ensureBundledModels()                                 │
│    ↓ 检测 {userData}/data/models/ 下文件是否存在               │
│    ↓ 不存在 → 从 {resourcesPath}/bundled-models/ 复制          │
│    ↓ 已存在 → 跳过                                              │
│                                                                 │
│  startBackend()                                                 │
│    ↓ Python 后端 ModelWrapper._check_downloaded()               │
│    ↓ 检测到所有模型已存在 → 不触发任何下载                      │
│    ↓ 完全离线运行 ✓                                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      运行阶段 (后续启动)                         │
├─────────────────────────────────────────────────────────────────┤
│  ensureBundledModels()                                          │
│    ↓ 所有文件已存在 → 跳过复制（秒过）                          │
│                                                                 │
│  startBackend()                                                 │
│    ↓ 正常启动                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 七、安装包体积预估

| 组件 | 体积 |
|------|------|
| Electron 框架 | ~80 MB |
| Next.js 前端 | ~30 MB |
| 嵌入式 Python + 依赖 | ~150 MB |
| **核心模型** | **~420 MB** |
| **合计（压缩前）** | **~680 MB** |
| **合计（zip 压缩后）** | **~550 MB** |

> 略超原设计目标 (≤500 MB)，但优先保证首次使用体验。后续可通过模型量化、去除 GPU 版本等方式优化。

---

## 八、测试验证

### 8.1 构建验证

```powershell
# 完整构建
.\scripts\build_desktop.ps1

# 检查模型是否正确打包
# 解压 dist/MangaTrans Studio-Setup-x.x.x.exe 或 .zip
# 确认 resources/bundled-models/ 目录结构：
#   bundled-models/
#     detection/
#       comictextdetector.pt
#       comictextdetector.pt.onnx
#     ocr/
#       ocr_ar_48px.ckpt
#       alphabet-all-v7.txt
#     inpainting/
#       inpainting_lama_mpe.ckpt
```

### 8.2 运行验证

1. **断网测试**：安装后断开网络，启动应用
2. **翻译测试**：导入图片，执行翻译（使用离线翻译器或跳过翻译）
3. **检查日志**：确认无模型下载日志
4. **检查目录**：确认 `{userData}/data/models/` 下文件已复制

---

## 九、后续优化（可选）

1. **仅保留 CPU 模型**：去掉 `comictextdetector.pt`，节省 ~65 MB（需修改后端 `_MODEL_MAPPING` 检查逻辑）
2. **模型压缩**：使用 int8 量化减小模型体积
3. **增量更新**：支持模型版本检测和增量更新
4. **下载进度 UI**：首次启动时显示模型复制进度

---

## 十、执行步骤

1. ✅ 创建本方案文档
2. ✅ 创建 `scripts/download_models.ps1`
3. ✅ 修改 `scripts/build_desktop.ps1`
4. ✅ 修改 `electron-builder.yml`
5. ✅ 修改 `electron/main.cjs`
6. 🔲 测试构建和运行
