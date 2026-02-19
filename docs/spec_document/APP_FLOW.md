# APP_FLOW — Application Flow & Navigation

> 版本：v1.0 | 日期：2026-02-19 | 状态标注：✅ 已实现 · ⬜ 待实现  
> 本文档使用自然语言描述，禁止伪代码。每一个点击、每一个跳转均有明确说明。

---

## 1. 屏幕清单（所有页面）

| 路由 | 页面名称 | 文件 | 状态 |
|------|----------|------|------|
| `/` | 首页（快速翻译） | `src/app/page.tsx` | ✅ |
| `/translate` | 翻译编辑器 | `src/app/translate/page.tsx` | ✅ |
| `/shelf` | 书架 | `src/app/shelf/page.tsx` | ✅ |
| `/shelf/[bookId]` | 书籍详情（章节列表） | `src/app/shelf/[bookId]/page.tsx` | ✅ |
| `/shelf/[bookId]/[chapterId]` | 章节内页面管理 | `src/app/shelf/[bookId]/[chapterId]/` | ✅ |
| `/reader` | 阅读器 | `src/app/reader/page.tsx` | ✅ |

此外有若干全局覆盖层（Modal），不单独作为路由存在：
- **SettingsModal**：设置与 API 凭证配置弹窗（全局可触发）
- **TranslateModal**：翻译参数选择弹窗（首页触发）
- **ProgressModal**：文件导入进度弹窗
- **TranslatingCard**：悬浮翻译任务进度卡片

---

## 2. 全局布局

所有页面（除 `/reader` 外）使用 `AppShell` 组件包裹，提供：
- **顶部标题栏**（Electron 可拖动区域）：显示产品名称、后端状态指示器、设置按钮。
- **左侧导航栏**：首页 / 书架 / 拓展中心 三个入口。
- **主内容区**：各页面内容。

`/reader` 页面为沉浸式全屏，无导航栏。

---

## 3. 启动流程（Electron）✅

1. 用户双击桌面快捷方式，Electron 主进程启动。
2. 主进程检测端口 8000–8010 可用性，选定空闲端口。
3. 主进程以子进程方式启动嵌入式 Python 后端（`uvicorn app.main:app`）。
4. 主进程轮询 `GET /health`（每 500ms），超时上限 180 秒。
   - **成功**：加载前端页面（`http://127.0.0.1:{frontendPort}/`），显示首页。
   - **超时**：显示错误页面，提示日志路径，让用户排查问题。
5. 前端 `useBackendStatus` Hook 持续监听后端状态，在顶部状态栏展示 `连接中 / 就绪 / 离线`。
6. 若后端崩溃，Electron 主进程自动重启最多 3 次（冷却 5 秒），前端状态栏显示 `重启中`。

---

## 4. 首页（快速翻译）`/` ✅

### 4.1 进入页面
用户打开应用，默认落地首页。页面展示：
- 拖拽上传区域（支持图片 / ZIP / CBZ / CBR / PDF / EPUB）。
- 目标语言选择器（默认读取 `localStorage` 中上次使用的语言）。
- 「高级选项」折叠面板（检测器 / OCR 引擎 / 修复器 / 翻译器等）。
- 书架近期内容预览卡片（显示最近翻译的章节）。

### 4.2 导入文件
用户执行以下任一操作导入文件：
- 将文件拖拽到上传区域。
- 点击上传区域，调起 Electron 文件选择对话框（`open-import-dialog` IPC）。
- 点击「选择文件夹」，选择目录批量导入图片。

**触发**：文件被选中后，前端解析文件列表（`importToImages`）：
- 图片文件 → 直接提取。
- ZIP / CBZ / CBR → `jszip` 解压，提取图片。
- PDF → `pdfjs-dist` 渲染每页为图片。
- EPUB / MOBI → 调用后端 `/convert_mobi_to_epub` / `/convert_rar_to_zip` 转换后再解压。

**成功**：显示「导入进度」弹窗（ProgressModal），进度条展示当前处理文件数。解析完成后弹窗关闭，显示文件名和图片数量。

**错误**：若文件格式不支持，展示内联错误提示。

### 4.3 语言自动检测（可选）
用户点击「自动检测语言」按钮：
- 前端调用 `POST /probe_lang`，传入第一张图片。
- 后端返回检测到的源语言代码。
- 前端更新源语言显示标签。

### 4.4 开始翻译（批量）
用户确认文件和参数后，点击「开始翻译」：
1. 前端调用 `TranslateModal`（翻译参数最终确认弹窗）。
2. 用户确认，前端创建翻译任务（`startTranslation`），生成唯一 `taskId`。
3. 前端显示 `TranslatingCard`（悬浮进度卡片），展示当前页翻译进度。
4. 每张图片依次调用 `POST /scan`（检测 + OCR + 翻译 + 修复 + 渲染一体）。
5. 每张图片完成后，将 `originalBlobKey` / `translatedBlobKey` / `regions` 写入对应 `MangaPage`，并持久化到书架。
6. 所有图片完成后，任务状态变为 `done`，`TranslatingCard` 显示「完成」，并提供「查看书架」链接。

**取消**：用户点击 `TranslatingCard` 上的「取消」，`AbortController` 中断当前请求，任务状态变为 `canceled`。

**错误**：
- 若 API Key 缺失，弹出 `MissingApiKeyError` 提示，引导用户前往设置配置。
- 若单张图片翻译失败，记录错误并继续处理下一张（不中断整批）。

### 4.5 开始编辑（进入编辑器）
用户导入文件后，点击「编辑模式」：
1. 前端调用 `scanMangaImage` 对第一张图片执行检测 + OCR，获取文字区域（`regions`）。
2. 图片和 `regions` 写入 `_workspace` 临时存储。
3. 前端跳转至 `/translate?workspace=1`（翻译编辑器，工作区模式）。

---

## 5. 翻译编辑器 `/translate` ✅

### 5.1 两种进入方式
- **工作区模式**：从首页「编辑模式」进入，URL 参数 `?workspace=1`，加载 `_workspace` 临时数据。
- **书架章节模式**：从书架章节页面「编辑」进入，URL 参数 `?bookId=xxx&chapterId=xxx`，加载对应章节数据。

### 5.2 页面布局
- **顶部工具栏**（EditorHeader）：章节标题、页面计数、翻译参数选择器（语言、翻译器、OCR 等）、「重新翻译全页」按钮、「导出」按钮、「保存到书架」按钮。
- **左侧页面缩略图导航**（EditorNavLeft）：所有页面缩略图列表，点击跳转至对应页。
- **中间 Canvas 工作区**（EditorWorkspace）：当前页原图，叠加 Konva Canvas 绘制文字框。
- **右侧属性面板**（EditorPanelRight）：选中文字框后显示译文编辑区、字体/字号/方向/颜色/对齐等属性。

### 5.3 文字框交互
- **查看**：进入编辑器后，Canvas 上自动绘制所有文字框（绿色矩形），显示译文。
- **选中**：点击任意文字框，框变为选中状态（蓝色），右侧面板显示该框的详细属性。
- **编辑译文**：在右侧面板的文本框中直接修改译文，实时在 Canvas 上预览效果（`POST /render_text_preview`）。
- **修改样式**：修改字体、字号、方向（横排/竖排）、颜色、对齐方式，Canvas 实时预览。
- **重新 OCR**：点击右侧面板「重新识别」，对当前框重新执行 OCR（`POST /ocr_region`）。
- **重新修复**：点击「重新修复区域」，对当前框重新执行 Inpainting（`POST /inpaint_region`）。

### 5.4 手动绘制文字框
- 用户在 Canvas 上按住鼠标左键拖拽，绘制新的矩形框。
- 松开鼠标，前端自动对该框执行 OCR（`POST /ocr_region`），填充 `text_original`。
- 用户可随后编辑译文并在完整重渲染时渲染该框。

### 5.5 重新渲染整页
- 用户点击「重新渲染」按钮。
- 前端调用 `POST /render_page`，传入原图 + 所有 `regions` 数据。
- 返回新的渲染图，更新 Canvas 右侧预览。
- 新渲染图写入 `renderedBlobKey`。

### 5.6 保存与导出
- **保存到书架**：将当前工作区数据（含 `regions` + 渲染图）写入书架对应章节的 `MangaPage`。
- **导出章节**：调用 `exportChapter`，将章节所有渲染图打包为 ZIP 并下载。

### 5.7 页面切换
- 点击左侧缩略图，或使用顶部「上一页/下一页」箭头切换。
- 切换前自动保存当前页的 `regions` 修改到内存，不触发网络请求。

---

## 6. 书架 `/shelf` ✅

### 6.1 页面内容
- **「快速翻译」区**：展示 `QUICK_BOOK_ID` 书下的所有章节（最近翻译结果）。
- **「我的书架」区**：用户创建的所有书籍卡片，含封面图、标题、章节数。

### 6.2 操作流程

**创建书籍**：
1. 点击「+ 新建书籍」，弹出 `BookEditModal`，填写书名。
2. 确认后，`MangaBook` 写入 `localStorage`，书架列表刷新。

**编辑书籍**：点击书籍卡片右上角菜单 → 「编辑」，修改标题后确认。

**设置封面**：点击书籍卡片右上角菜单 → 「设置封面」，从本地选择图片，写入 `IndexedDB`。

**删除书籍**：点击菜单 → 「删除」，弹出二次确认对话框，确认后删除 `MangaBook` 及其所有 `IndexedDB` 图片数据。

**进入书籍**：点击书籍卡片，跳转至 `/shelf/[bookId]`。

---

## 7. 书籍详情 `/shelf/[bookId]` ✅

### 7.1 页面内容
- 书籍标题和封面。
- 章节列表（MangaChapter），每项显示：封面、标题、页数、创建时间。

### 7.2 操作流程

**进入阅读器**：点击章节卡片 → 「阅读」，跳转至 `/reader?bookId=xxx&chapterId=xxx`。

**进入编辑器**：点击章节卡片 → 「编辑」，跳转至 `/translate?bookId=xxx&chapterId=xxx`。

**批量翻译章节**：
1. 选择章节内某些或全部未翻译页面。
2. 点击「翻译」，配置翻译参数（弹出 TranslateModal）。
3. 前端逐页调用 `POST /scan`，进度展示在 `TranslatingCard`。
4. 完成后章节数据更新，页面缩略图显示翻译后效果。

**导出章节**：选择章节 → 「导出」，所有渲染图打包为 ZIP 下载到本地。

**删除章节**：「删除」→ 二次确认 → 删除章节及其 `IndexedDB` 数据。

---

## 8. 阅读器 `/reader` ✅

### 8.1 进入方式
从书架章节详情点击「阅读」，携带参数 `?bookId=xxx&chapterId=xxx`（或 `?workspace=1`）跳转。

### 8.2 阅读模式
- **滚动模式**：所有页图片纵向连续排列，用户鼠标滚轮或手势滑动。
- **翻页模式**：每次显示一页，左右箭头或键盘 `←` / `→` 切换。
- 模式切换按钮在阅读器顶部工具栏，点击切换并记住用户偏好。

### 8.3 缩放
- 鼠标滚轮 + Ctrl：放大/缩小（`useReaderZoom` Hook）。
- 双击图片：重置缩放。

### 8.4 键盘快捷键（`useReaderKeyboard` Hook）
- `←` / `↑`：上一页。
- `→` / `↓`：下一页。
- `Escape`：返回书架。

### 8.5 退出
- 点击顶部「返回」按钮，或按 `Escape`，返回 `/shelf/[bookId]`。
- 点击顶部「编辑」按钮，跳转至 `/translate?bookId=xxx&chapterId=xxx`。

---

## 9. 拓展中心（嵌入在 SettingsModal）✅

### 9.1 进入方式
点击任意页面顶部工具栏的「设置」图标，打开 `SettingsModal`，切换至「拓展中心」Tab。

### 9.2 拓展列表
- 调用 `GET /api/v1/extensions/list` 获取所有拓展及状态。
- 每个拓展卡片显示：名称、类别、体积估算、描述、依赖说明、当前状态（未安装 / 安装中 / 已安装）。

### 9.3 在线安装流程
1. 用户点击「安装」按钮。
2. 前端调用 `POST /api/v1/extensions/install`，传入 `id` 和 `cuda_version`（CUDA 拓展专用）。
3. 后端在后台开始下载，前端轮询拓展状态，实时展示下载进度（速度、百分比）。
4. 安装完成后，卡片状态变为「已安装」，显示「卸载」按钮。
5. 部分拓展（如 CUDA）安装后需要重启后端（点击「重启后端」，调用 Electron `restart-backend` IPC）。

### 9.4 离线导入流程
1. 用户点击「离线导入」。
2. 触发 Electron 文件选择对话框，选择 `.zip`（模型拓展）或 `.whl`（CUDA Python 包）。
3. 前端通过 `read-file` IPC 读取文件内容，调用 `POST /api/v1/extensions/import`（通用）或 `POST /api/v1/extensions/import-local`（本地路径）。
4. 后端安装后返回成功，拓展列表刷新。

### 9.5 取消安装
用户点击「取消」，调用 `POST /api/v1/extensions/cancel`，中断下载进程。

### 9.6 卸载流程
用户点击「卸载」→ 确认 → 调用 `POST /api/v1/extensions/uninstall`。卸载完成后，卡片恢复为「未安装」状态。

---

## 10. API 凭证配置（嵌入在 SettingsModal）✅

### 10.1 进入方式
打开 `SettingsModal` → 切换至「账号管理」Tab。

### 10.2 配置流程
1. 页面展示所有支持的翻译服务（DeepSeek / Gemini / Custom OpenAI / Groq）。
2. 用户在对应服务的输入框填入 API Key（以及可选的 API Base、Model）。
3. 点击「验证」，前端调用 `POST /api/v1/verify_api_key`，传入 `provider` 和 `api_key`。
   - **成功**：显示绿色✓提示。
   - **失败**：显示红色错误信息（Key 无效 / 网络错误）。
4. 点击「保存」，Key 写入 `localStorage`，弹窗关闭。
5. 后续所有翻译请求自动从 `localStorage` 加载对应 Key，通过请求头传递给后端（`loadCredentialHeaders()`）。

---

## 11. 路由决策规则

| 场景 | 触发条件 | 目标路由 |
|------|----------|----------|
| 快速翻译一批图片 | 首页上传 → 点击翻译 | 停留 `/`，通过 TranslatingCard 展示进度 |
| 进入编辑器（新内容） | 首页上传 → 点击编辑 | `/translate?workspace=1` |
| 进入编辑器（书架章节） | 书架章节 → 点击编辑 | `/translate?bookId=X&chapterId=Y` |
| 进入阅读器 | 书架章节 → 点击阅读 | `/reader?bookId=X&chapterId=Y` |
| 从阅读器切换到编辑器 | 阅读器顶部「编辑」 | `/translate?bookId=X&chapterId=Y` |
| 从编辑器返回书架 | 编辑器顶部「返回」 | `/shelf/[bookId]` |
| API Key 缺失错误 | 翻译请求返回 missing_api_key | 弹出提示 → 引导打开 SettingsModal |
| 后端不可达 | `/health` 轮询失败 | 顶部状态栏显示离线，翻译按钮禁用 |
