# 编辑器增强开发方案：修复画笔 / 蒙版 / 橡皮擦 / 旋转 / 撤回重做

> 版本: v1.0 | 日期: 2026-02-16

---

## 一、现状分析

### 1.1 后端 Inpainting 架构

| 层级 | 文件 | 职责 |
|------|------|------|
| API 入口 | `app/api/v1/endpoints/translation.py` → `POST /inpaint_region` | 接收图片+蒙版，调度修复引擎 |
| 调度层 | `manga_translator/inpainting/__init__.py` → `dispatch()` | 根据引擎 key 分发到具体实现 |
| 抽象基类 | `manga_translator/inpainting/common.py` → `CommonInpainter` | 定义 `inpaint(image, mask, config)` 接口 |
| 具体实现 | `inpainting_lama_mpe.py` / `inpainting_sd.py` 等 | LaMa、StableDiffusion 等修复模型 |

**关键发现：后端 `/inpaint_region` 已支持 mask 图片模式**

```python
# translation.py L657-L662 — 已存在 mask 图片上传逻辑
if mask and mask.filename:
    mask_pil = Image.open(mask_temp_path).convert('L')
    mask_np = np.array(mask_pil)  # 白色=需修复区域
```

前端目前只使用 `mask_rect`（矩形）模式，**从未使用过 mask 图片模式**。画笔修复的核心改动是：前端生成一张 mask 图（用户画笔涂抹的区域为白色），上传给后端。后端无需任何修改。

### 1.2 前端编辑器架构

| 模块 | 文件 | 职责 |
|------|------|------|
| 类型定义 | `src/types/editor.ts` | `EditorTool`、`EditorRegion`、`DrawingRect` |
| 状态管理 | `src/hooks/useEditorState.ts` | 编辑器全局状态 Hook |
| 画布主体 | `src/components/editor/EditorWorkspace.tsx` | Konva Stage、工具切换、鼠标事件 |
| 文本区域 | `src/components/editor/RegionGroup.tsx` | 单个文本框的渲染、拖拽、变形 |
| 右侧面板 | `src/components/editor/EditorPanelRight.tsx` | 文本编辑、样式设置 |
| 页面逻辑 | `src/app/translate/page.tsx` | 调用后端 API、状态编排 |

**现有工具模式**: `pan` | `select` | `ocr_region` | `inpaint_region`

现有 `inpaint_region` 是**框选矩形区域**进行修复，需要被替换为画笔模式。

### 1.3 参考项目分析 (manga-translator-ui)

该项目的核心概念：

- **Inpaint Mask（修复蒙版）**：一张与原图同尺寸的灰度图（或 RGBA alpha 通道），白色区域表示"需要修复"的位置
- **修复画笔**：用户在画布上涂抹，涂抹轨迹被绘制到蒙版上（白色）
- **橡皮擦**：在蒙版上擦除（将白色区域恢复为黑色/透明），即撤销部分涂抹
- **蒙版可视化**：将蒙版以半透明彩色叠加在原图上方，让用户直观看到哪些区域会被修复（如截图中的蓝紫色区域）
- **确认修复**：用户完成涂抹后点击"确认"，前端将 mask 图片发送给后端执行 inpainting

---

## 二、需求拆解与技术方案

### 2.1 功能点总览

| # | 功能 | 优先级 | 复杂度 |
|---|------|--------|--------|
| F1 | 修复画笔（Inpaint Brush） | P0 | 高 |
| F2 | 蒙版可视化（Mask Overlay） | P0 | 中 |
| F3 | 橡皮擦（Eraser） | P0 | 中 |
| F4 | 去除原有区域修复功能 | P0 | 低 |
| F5 | 撤回/重做（Undo/Redo） | P0 | 高 |
| F6 | 文本框旋转支持 | P1 | 中 |

### 2.2 F1 — 修复画笔 (Inpaint Brush)

#### 概念

用户选择「修复画笔」工具后，在画布上自由涂抹。涂抹痕迹实时显示为半透明蓝紫色覆盖层（蒙版可视化）。涂抹完成后，用户点击「执行修复」按钮，前端将涂抹区域导出为一张 mask 灰度图（PNG），连同原图一起发送给后端 `/inpaint_region`。

#### 技术方案

**方案：离屏 Canvas + Konva Layer 叠加渲染**

```
┌───────────────────────────────┐
│  Konva Stage                  │
│  ├─ Layer 0: 底图 (原图/修复图)│
│  ├─ Layer 1: 蒙版可视化层     │  ← 半透明蓝紫色
│  ├─ Layer 2: 文本区域层       │  ← RegionGroup
│  └─ Layer 3: 工具交互层       │  ← 画笔光标、选区等
└───────────────────────────────┘
        ↕ 数据同步
┌───────────────────────────────┐
│  离屏 Canvas (maskCanvas)     │  ← 不可见，用于生成 mask 图
│  · 白色 = 需修复区域          │
│  · 黑色 = 保留区域            │
└───────────────────────────────┘
```

**核心数据结构**：

```typescript
// src/types/editor.ts 新增
export type EditorTool =
  | "pan"
  | "select"
  | "ocr_region"
  | "inpaint_brush"   // 替换 inpaint_region
  | "eraser";          // 新增橡皮擦

export interface BrushSettings {
  size: number;         // 画笔大小 (px), 范围 [1, 200]
  opacity: number;      // 蒙版可视化透明度, 范围 [0.1, 1.0]
}

export interface MaskState {
  canvas: HTMLCanvasElement;    // 离屏 canvas，与原图同尺寸
  ctx: CanvasRenderingContext2D;
  hasContent: boolean;          // 是否有涂抹内容
}
```

**新增 Hook**: `src/hooks/useInpaintMask.ts`

```typescript
// 职责：管理 mask 离屏 canvas 的创建/销毁/绘制/导出
export function useInpaintMask(imageSize: [number, number] | null) {
  // 状态
  // - maskCanvas: 离屏 Canvas
  // - brushSettings: BrushSettings
  // - hasContent: boolean

  // 方法
  // - drawStroke(points: number[]): void  // 画笔在 mask 上绘制白色笔触
  // - eraseStroke(points: number[]): void // 橡皮擦在 mask 上擦除（绘制黑色/透明）
  // - clearMask(): void                   // 清空 mask
  // - exportMaskBlob(): Promise<Blob>     // 导出 mask 为 PNG Blob
  // - getMaskImageData(): ImageData       // 获取 mask 像素数据用于 Konva 可视化
  // - setBrushSize(size: number): void
  // - resetForNewImage(): void            // 切换图片时重置
}
```

**画笔绘制流程**：

```
用户按下鼠标 → onMouseDown
  └─ 记录起始点坐标 (转换为图片坐标系)
  └─ 开始收集路径点

用户移动鼠标 → onMouseMove
  └─ 收集路径点
  └─ 在离屏 maskCanvas 上以圆形笔刷绘制白色
  └─ 触发 Konva 蒙版层重绘 (实时可视化)

用户松开鼠标 → onMouseUp
  └─ 结束当前笔画
  └─ 将本次笔画推入 undo 栈 (见 F5)
```

**画笔大小调整 UI**：

- 工具栏中新增滑块组件 (range input)，范围 1~200px
- 快捷键: `[` 减小, `]` 增大 (步进 5px)
- 画布上显示画笔光标预览圆圈 (Konva Circle, 跟随鼠标)

#### 后端交互

后端 `/inpaint_region` **无需修改**。前端改为发送 mask 图片：

```typescript
// 修改 handleInpaintRegion → handleInpaintBrush
const handleInpaintBrush = async () => {
  const maskBlob = await exportMaskBlob();
  const formData = new FormData();
  formData.append("file", imageBlob, "image.jpg");
  formData.append("mask", maskBlob, "mask.png");  // 使用 mask 图片模式
  formData.append("inpainter", inpainter);
  formData.append("inpainting_size", String(inpaintingSize));
  
  const res = await fetch(`${API_BASE}/inpaint_region`, { method: "POST", body: formData });
  // ... 处理返回
};
```

### 2.3 F2 — 蒙版可视化 (Mask Overlay)

#### 概念

将 mask 离屏 canvas 的内容以半透明蓝紫色叠加在底图上方，让用户直观看到修复区域。

#### 技术方案

**方案：Konva Image + 颜色映射**

在 Konva Layer 1 中放置一个与底图同尺寸的 `KonvaImage` 节点。该节点的图像源是一个临时 Canvas，内容为：

```
对 maskCanvas 每个像素：
  如果白色 (已涂抹) → 输出 rgba(100, 80, 220, 0.45)  // 蓝紫色半透明
  如果黑色 (未涂抹) → 输出 rgba(0, 0, 0, 0)           // 完全透明
```

**新增组件**: `src/components/editor/MaskOverlay.tsx`

```typescript
// 职责：将 mask 数据渲染为半透明蓝紫色覆盖层
interface MaskOverlayProps {
  maskCanvas: HTMLCanvasElement;    // mask 离屏 canvas
  imageWidth: number;
  imageHeight: number;
  color?: string;                   // 蒙版颜色，默认蓝紫色
  opacity?: number;                 // 蒙版透明度
  visible?: boolean;
}
```

**性能优化**：
- 不要逐像素映射，而是用 `globalCompositeOperation = "source-in"` 技巧：先绘制 mask，再用合成模式叠加纯色层
- 或者使用 Konva 的 `filters` + 自定义 filter 实现颜色映射
- 涂抹过程中使用 `requestAnimationFrame` 节流刷新

### 2.4 F3 — 橡皮擦 (Eraser)

#### 概念

橡皮擦与画笔互为反操作。画笔在 mask 上涂白色（标记修复区域），橡皮擦在 mask 上涂黑色/透明（恢复原图区域）。

#### 技术方案

复用画笔的绘制逻辑，差异仅在于：

| 属性 | 画笔 (inpaint_brush) | 橡皮擦 (eraser) |
|------|-----------------------|-----------------|
| mask 绘制颜色 | 白色 `rgb(255,255,255)` | 黑色 `rgb(0,0,0)` 或 `destination-out` |
| 画布光标样式 | 蓝紫色圆圈 | 白色虚线圆圈 |
| 可视化效果 | 添加蓝紫色蒙版 | 移除蓝紫色蒙版 |

橡皮擦的大小也支持独立调整（或共享画笔大小设置）。

```typescript
// useInpaintMask.ts 中
const drawOnMask = (points: number[], mode: "brush" | "eraser") => {
  ctx.globalCompositeOperation = mode === "brush" ? "source-over" : "destination-out";
  ctx.strokeStyle = "white";
  ctx.lineWidth = brushSize;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // ... 绘制路径
};
```

### 2.5 F4 — 去除原有区域修复功能

#### 改动清单

| 文件 | 改动 |
|------|------|
| `src/types/editor.ts` | `EditorTool` 移除 `"inpaint_region"`，新增 `"inpaint_brush"` \| `"eraser"` |
| `src/components/editor/EditorWorkspace.tsx` | 移除 `inpaint_region` 相关按钮和矩形绘制逻辑；新增画笔/橡皮擦交互逻辑 |
| `src/app/translate/page.tsx` | 移除 `handleInpaintRegion`（矩形模式），替换为 `handleInpaintBrush`（mask 模式） |
| `src/hooks/useEditorState.ts` | 默认工具保持 `"pan"` 不变 |

### 2.6 F5 — 撤回/重做 (Undo/Redo)

#### 范围界定

需要支持撤回/重做的操作类型：

| 操作类型 | 数据内容 |
|---------|----------|
| 画笔涂抹 | 笔画路径数据 (points + brushSize) |
| 橡皮擦擦除 | 笔画路径数据 (points + brushSize) |
| 文本框移动 | regionId + oldBox + newBox |
| 文本框缩放 | regionId + oldBox + newBox |
| 文本框旋转 | regionId + oldRotation + newRotation |
| 文本内容修改 | regionId + oldText + newText |
| 文本样式修改 | regionId + oldPatch + newPatch |
| 文本框删除 | region 完整快照 |
| 文本框新增 (OCR) | regionId |
| 执行修复 | oldImageBlobKey + newImageBlobKey + oldMaskSnapshot |

#### 技术方案

**新增 Hook**: `src/hooks/useUndoRedo.ts`

```typescript
export type ActionType =
  | "brush_stroke"
  | "eraser_stroke"
  | "region_move"
  | "region_resize"
  | "region_rotate"
  | "region_text_change"
  | "region_style_change"
  | "region_delete"
  | "region_add"
  | "inpaint_execute";

export interface UndoableAction {
  type: ActionType;
  timestamp: number;
  undo: () => void;    // 执行撤回
  redo: () => void;    // 执行重做
}

export function useUndoRedo(maxHistory: number = 50) {
  // 状态
  // - undoStack: UndoableAction[]
  // - redoStack: UndoableAction[]

  // 方法
  // - pushAction(action: UndoableAction): void
  // - undo(): void      // 弹出 undoStack 顶部，执行 undo()，压入 redoStack
  // - redo(): void      // 弹出 redoStack 顶部，执行 redo()，压入 undoStack
  // - canUndo: boolean
  // - canRedo: boolean
  // - clear(): void     // 切换页面时清空
}
```

**画笔/橡皮擦的撤回策略**：

对于画笔操作，每一次 mouseDown→mouseUp 为一个 action。撤回时需要：

```
方案 A（快照法）：每次笔画前保存 maskCanvas 快照 (toDataURL/ImageData)
  - 优点：撤回简单，直接恢复快照
  - 缺点：内存占用大（每次快照一张与原图同尺寸的图片）

方案 B（重绘法）：记录所有笔画序列，撤回时清空 canvas 并从头重绘
  - 优点：内存占用小
  - 缺点：笔画多时重绘慢

推荐：方案 A (快照法) + 内存限制
  - 使用 ImageBitmap 存储快照（比 toDataURL 更高效）
  - 限制最大历史记录数量 (50 步)
  - 超出限制时丢弃最早的快照
```

**文本操作的撤回策略**：

对文本框的修改，使用 Command 模式：每次修改前记录旧值，撤回时恢复旧值。

```typescript
// 示例：移动文本框的 undo action
const action: UndoableAction = {
  type: "region_move",
  timestamp: Date.now(),
  undo: () => setRegionBox(regionId, oldBox),
  redo: () => setRegionBox(regionId, newBox),
};
pushAction(action);
```

**快捷键**：

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+Z` | 撤回 |
| `Ctrl+Shift+Z` 或 `Ctrl+Y` | 重做 |

**UI 展示**：

在工具栏中增加撤回/重做按钮（`Undo2` / `Redo2` icon from Lucide），并显示灰色/高亮状态。

### 2.7 F6 — 文本框旋转支持

#### 现状

`RegionGroup.tsx` 中 Transformer 设置了 `rotateEnabled={false}`，文本框不支持旋转。

#### 技术方案

**数据层**：

```typescript
// src/types/editor.ts EditorRegion 新增字段
export interface EditorRegion {
  // ... 现有字段
  rotation?: number;  // 旋转角度 (度), 默认 0
}

// src/lib/storage.ts TextRegion 新增字段
export type TextRegion = {
  // ... 现有字段
  rotation?: number;
};
```

**组件层**：

```typescript
// RegionGroup.tsx 修改
<Group
  rotation={region.rotation || 0}   // 新增
  // ... 其他属性
>

<Transformer
  rotateEnabled={true}              // 改为 true
  rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}  // 吸附角度
  // ... 其他属性
/>
```

**交互**：

- 拖拽 Transformer 的旋转手柄进行旋转
- `onTransformEnd` 时读取 `node.rotation()` 并同步到 region 数据
- 按住 Shift 时限制为 15° 步进

**后端渲染**：

`/render_text_preview` 和 `/render` API 需要接受 `rotation` 参数并在渲染时应用旋转。这需要后端配合修改。

---

## 三、文件变更清单

### 3.1 前端 (nextjs-tailwind-app)

#### 新增文件

| 文件路径 | 职责 |
|---------|------|
| `src/hooks/useInpaintMask.ts` | 管理 mask 离屏 canvas 和画笔/橡皮擦绘制逻辑 |
| `src/hooks/useUndoRedo.ts` | 通用撤回/重做栈管理 |
| `src/components/editor/MaskOverlay.tsx` | 蒙版可视化渲染组件 |
| `src/components/editor/BrushCursor.tsx` | 画笔/橡皮擦光标预览组件 |
| `src/components/editor/BrushToolbar.tsx` | 画笔大小/模式切换工具栏子组件 |

#### 修改文件

| 文件路径 | 改动内容 |
|---------|----------|
| `src/types/editor.ts` | 修改 `EditorTool` 类型；新增 `BrushSettings`、`MaskState`；`EditorRegion` 加 `rotation` |
| `src/hooks/useEditorState.ts` | 整合 `useInpaintMask` 和 `useUndoRedo`；新增 brushSettings 状态 |
| `src/components/editor/EditorWorkspace.tsx` | **重构**：拆分为多层 Layer；新增画笔/橡皮擦鼠标事件；移除旧 inpaint_region 矩形逻辑；集成 MaskOverlay 和 BrushCursor |
| `src/components/editor/RegionGroup.tsx` | 启用旋转；Group 加 rotation prop；Transformer 改 rotateEnabled |
| `src/components/editor/EditorPanelRight.tsx` | 新增旋转角度控制 UI（输入框 + 快捷按钮） |
| `src/app/translate/page.tsx` | 替换 `handleInpaintRegion` 为 `handleInpaintBrush`；包装所有 region 操作为 undoable action；集成撤回/重做快捷键 |
| `src/lib/storage.ts` | `TextRegion` 增加 `rotation` 字段 |
| `src/lib/translateClient.ts` | 传递 rotation 参数到后端 |

### 3.2 后端 (manga-backend)

| 文件路径 | 改动内容 |
|---------|----------|
| `app/api/v1/endpoints/translation.py` | `/render_text_preview` 和 `/render` 增加 `rotation` 参数支持 |
| 无其他改动 | `/inpaint_region` 已支持 mask 图片模式，无需修改 |

---

## 四、EditorWorkspace 重构方案

当前 `EditorWorkspace.tsx` (580 行) 职责过重，建议拆分：

```
EditorWorkspace.tsx (重构后)
├── 管理 Stage/Layer 结构
├── 缩放/平移逻辑 → 可抽取到 useCanvasNavigation.ts
├── Layer 0: BaseImageLayer     → 底图渲染
├── Layer 1: MaskOverlay        → 蒙版可视化 (新增)
├── Layer 2: RegionsLayer       → 文本框渲染 (现有逻辑)
├── Layer 3: InteractionLayer   → 画笔光标、选区框 (新增)
└── Toolbar (右上角)            → 可抽取为 CanvasToolbar.tsx
```

### 拆分计划

| 新文件 | 职责 |
|--------|------|
| `src/hooks/useCanvasNavigation.ts` | 缩放、平移、中键拖拽逻辑 |
| `src/hooks/useBrushInteraction.ts` | 画笔/橡皮擦的鼠标事件处理 |
| `src/components/editor/CanvasToolbar.tsx` | 工具栏按钮组（从 EditorWorkspace 抽取） |

---

## 五、核心交互流程

### 5.1 修复画笔完整流程

```
用户点击「修复画笔」工具按钮
  └─ editorActiveTool = "inpaint_brush"
  └─ 初始化 maskCanvas (如尚未创建)
  └─ 画布光标变为蓝紫色圆圈

用户在画布上涂抹
  └─ mousedown: 保存 mask 快照到 undo 栈
  └─ mousemove: 在 maskCanvas 上绘制白色圆形笔触
  └─ mousemove: 触发 MaskOverlay 重绘 (蓝紫色半透明)
  └─ mouseup: 结束笔画

用户可以切换到橡皮擦擦除部分涂抹
  └─ 同上流程，但绘制黑色/透明

用户点击「执行修复」按钮
  └─ exportMaskBlob() → 导出 mask PNG
  └─ 发送 FormData { file: 原图, mask: mask.png } → POST /inpaint_region
  └─ 后端返回修复后的图片
  └─ 更新底图为修复后图片
  └─ 清空 maskCanvas
  └─ 推入 inpaint_execute action 到 undo 栈
```

### 5.2 橡皮擦流程

```
用户点击「橡皮擦」工具按钮
  └─ editorActiveTool = "eraser"
  └─ 画布光标变为白色虚线圆圈

用户在画布上涂抹
  └─ 与画笔流程相同，但 maskCanvas 上使用 destination-out 合成模式
  └─ 效果：擦除蓝紫色蒙版，露出下方原图
```

### 5.3 撤回/重做流程

```
用户按 Ctrl+Z
  └─ 从 undoStack 弹出最近 action
  └─ 执行 action.undo()
     ├─ 画笔操作: 恢复 maskCanvas 快照 → 触发 MaskOverlay 重绘
     ├─ 文本操作: 恢复 region 旧值 → 触发 RegionGroup 重绘
     └─ 修复执行: 恢复旧底图 + 旧 mask 快照
  └─ 将 action 压入 redoStack

用户按 Ctrl+Shift+Z
  └─ 从 redoStack 弹出最近 action
  └─ 执行 action.redo()
  └─ 将 action 压入 undoStack
```

---

## 六、UI 布局设计

### 6.1 工具栏 (右上角，现有位置)

```
┌─────────────────────────────────────────────────────┐
│ [🤚拖动] [🖱选择] [📝OCR] │ [🖌画笔] [🧹橡皮擦] │ [↩撤回] [↪重做] │ [🔍+] [🔍-] [⬜适应] │
│                           │   大小: ═══○═══  30px │                │                    │
└─────────────────────────────────────────────────────┘
```

画笔/橡皮擦工具激活时，工具栏下方展开画笔大小滑块。

### 6.2 底部状态提示

```
┌─────────────────────────────────────────┐
│  🖌 修复画笔模式 | 画笔大小: 30px       │
│  涂抹需要修复的区域，完成后点击「执行修复」│
└─────────────────────────────────────────┘
```

### 6.3 执行修复按钮

画笔模式下且 mask 有内容时，在画布底部居中显示醒目的「执行修复」按钮：

```
┌──────────────────────┐
│  ✨ 执行修复  │  🗑 清除涂抹  │
└──────────────────────┘
```

---

## 七、开发阶段计划

### Phase 1 — 基础设施 (预计 2-3 天)

1. 修改 `EditorTool` 类型定义
2. 实现 `useInpaintMask` Hook (离屏 canvas + 画笔/橡皮擦绘制)
3. 实现 `useUndoRedo` Hook (通用撤回/重做栈)
4. 实现 `MaskOverlay` 组件
5. 实现 `BrushCursor` 组件

### Phase 2 — 画笔交互集成 (预计 2-3 天)

6. 重构 `EditorWorkspace` 为多 Layer 结构
7. 集成画笔/橡皮擦鼠标事件到 `EditorWorkspace`
8. 实现 `BrushToolbar` (画笔大小调整 UI)
9. 移除旧 `inpaint_region` 矩形逻辑
10. 修改 `page.tsx` 中 `handleInpaintBrush` (发送 mask 图片)

### Phase 3 — 撤回/重做 (预计 1-2 天)

11. 集成 `useUndoRedo` 到 `page.tsx`
12. 包装所有 region 操作为 undoable action
13. 包装画笔/橡皮擦操作为 undoable action (快照法)
14. 实现 Ctrl+Z / Ctrl+Shift+Z 快捷键
15. 工具栏增加撤回/重做按钮

### Phase 4 — 旋转支持 (预计 1 天)

16. `EditorRegion` 和 `TextRegion` 增加 `rotation` 字段
17. `RegionGroup` 启用旋转 + Transformer 配置
18. 后端 `/render_text_preview` 支持 `rotation` 参数
19. 右侧面板增加旋转角度控制

### Phase 5 — 打磨优化 (预计 1-2 天)

20. 性能优化 (蒙版重绘节流、大图 mask 压缩)
21. 抽取 `useCanvasNavigation` Hook
22. 抽取 `CanvasToolbar` 组件
23. 快捷键完善 (`[` `]` 调整画笔大小等)
24. 边界情况处理 (切换页面时清空 mask/undo 栈)

---

## 八、关键注意事项

### 8.1 坐标系转换

画笔涂抹时，鼠标坐标需从屏幕坐标转换为图片坐标：

```typescript
const imageX = (pointerX - stage.x()) / stage.scaleX();
const imageY = (pointerY - stage.y()) / stage.scaleY();
```

这与现有 `handleToolMouseDown` 中的逻辑一致。

### 8.2 mask 与底图尺寸一致性

maskCanvas 必须与原图尺寸完全一致。切换图片、执行修复后重建底图时，需要同步重置 maskCanvas。

### 8.3 页面切换时的状态处理

切换到不同页面时：
- 清空 maskCanvas
- 清空 undo/redo 栈
- 重置工具为默认 (pan)

### 8.4 修复后的 mask 保留问题

执行修复后：
- mask 应被清空（已修复区域不需要再标记）
- 但用户可以在修复后继续涂抹新的区域进行二次修复
- 撤回"执行修复"操作时，需恢复旧底图 + 旧 mask 快照

### 8.5 性能考量

- mask 可视化刷新使用 `requestAnimationFrame` 节流
- 离屏 canvas 操作不阻塞 UI
- undo 快照使用 `ImageBitmap` (比 base64 string 更高效)
- 限制 undo 栈深度为 50 步

---

## 九、与参考项目 (manga-translator-ui) 的差异

| 特性 | manga-translator-ui | 我们的方案 |
|------|---------------------|-----------|
| 渲染引擎 | 原生 Canvas 2D | Konva.js (react-konva) |
| mask 存储 | 内存中 Canvas | 同，离屏 Canvas |
| 蒙版颜色 | 蓝紫色半透明 | 同 |
| 修复触发 | 涂抹后自动/手动 | 手动点击「执行修复」按钮 |
| 撤回/重做 | 有 | 有，且范围更广（含文本操作） |
| 文本框旋转 | 不支持 | 支持 |
| 技术栈 | Vue/原生JS | Next.js + React + Konva |

---

## 十、风险与备选方案

| 风险 | 影响 | 备选方案 |
|------|------|---------|
| Konva 多 Layer 性能问题 | 蒙版重绘卡顿 | 蒙版可视化使用独立原生 Canvas 叠加 (CSS absolute positioning)，不走 Konva |
| undo 快照内存溢出 | 大图频繁操作 | 改用重绘法或限制快照数量为 20 步 |
| mask 图片过大导致上传慢 | 4K+ 图片 | mask PNG 使用 1-bit 索引色压缩，或缩放到固定最大尺寸 |
| 旋转后文本渲染对齐偏移 | 后端渲染不一致 | 旋转仅影响前端显示，后端渲染时传递 rotation 参数由 PIL/Cairo 处理 |
