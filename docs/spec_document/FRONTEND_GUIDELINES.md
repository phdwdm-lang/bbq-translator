# FRONTEND_GUIDELINES — Frontend Design System & Visual Conventions

> 版本：v1.0 | 日期：2026-02-19 | 状态标注：✅ 已实现 · ⬜ 待实现  
> **规则**：AI 生成任何组件代码时，必须强制引用本文档中的颜色、间距与排版规范，禁止随机颜色或不一致的间距。

---

## 1. 调色板（Color Palette）✅

所有颜色通过 CSS 自定义属性定义在 `src/app/globals.css` 的 `:root` 中。

### 1.1 语义颜色（Semantic Colors）

| Token | 十六进制 | 用途 |
|-------|----------|------|
| `--background` | `#F8FAFC` | 页面背景（Slate 50） |
| `--foreground` | `#0F172A` | 主要文字颜色（Slate 900） |
| `--color-primary` | `#4F46E5` | 主要操作色（Indigo 600）——按钮、链接、激活状态 |
| `--color-primary-foreground` | `#FFFFFF` | 主要色上的文字色 |
| `--color-accent` | `#F97316` | 强调色（Orange 500）——徽章、高亮、进度 |
| `--color-accent-foreground` | `#FFFFFF` | 强调色上的文字色 |

### 1.2 TailwindCSS Slate 调色板补充（常用）

| 颜色 | 十六进制 | 典型用途 |
|------|----------|----------|
| `slate-50` | `#F8FAFC` | 页面背景 |
| `slate-100` | `#F1F5F9` | 卡片背景、输入框背景 |
| `slate-200` | `#E2E8F0` | 分割线、边框 |
| `slate-300` | `#CBD5E1` | 滚动条滑块、禁用状态边框 |
| `slate-400` | `#94A3B8` | 占位文字、图标（非激活） |
| `slate-500` | `#64748B` | 次要文字、标签 |
| `slate-600` | `#475569` | 次要按钮文字 |
| `slate-700` | `#334155` | 正文文字（较深） |
| `slate-800` | `#1E293B` | 侧边栏背景、深色区域 |
| `slate-900` | `#0F172A` | 主文字颜色 |
| `indigo-50` | `#EEF2FF` | 侧边栏激活项背景 |
| `indigo-600` | `#4F46E5` | 主要色（同 `--color-primary`） |
| `orange-500` | `#F97316` | 强调色（同 `--color-accent`） |
| `green-500` | `#22C55E` | 成功状态 |
| `red-500` | `#EF4444` | 错误状态 |
| `yellow-500` | `#EAB308` | 警告状态 |

### 1.3 使用规则
- **禁止**在组件中使用 `style={{ color: '#xxx' }}` 内联颜色，必须使用 TailwindCSS 工具类或 CSS 变量。
- **禁止**使用上述调色板以外的颜色，除非有明确设计说明。
- 错误/成功/警告状态分别固定使用 `red-500` / `green-500` / `yellow-500`。

---

## 2. 排版（Typography）✅

### 2.1 字体族（Font Family）

```css
--font-sans: "Plus Jakarta Sans", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
```

| 字体 | 用途 |
|------|------|
| **Plus Jakarta Sans** | 拉丁字符（英文、数字）主字体 |
| **PingFang SC** | 中文字符（macOS / iOS） |
| **Microsoft YaHei** | 中文字符（Windows） |
| **system-ui** | 系统回退字体 |

> **注意**：Plus Jakarta Sans 为外部字体，需确保在 Electron standalone 环境下可用（通过内嵌字体文件或系统字体回退）。

### 2.2 字号规范（Font Size）

使用 TailwindCSS 默认字号刻度，以下为项目中使用的规范：

| 类名 | 字号 | 行高 | 用途 |
|------|------|------|------|
| `text-xs` | `12px` | `16px` | 辅助标签、徽章、版权信息 |
| `text-sm` | `14px` | `20px` | 次要正文、输入框、下拉选项 |
| `text-base` | `16px` | `24px` | 主要正文、卡片描述 |
| `text-lg` | `18px` | `28px` | 区块标题、弹窗副标题 |
| `text-xl` | `20px` | `28px` | 卡片标题、页面次标题 |
| `text-2xl` | `24px` | `32px` | 页面主标题 |
| `text-3xl` | `30px` | `36px` | 首页 Hero 标题（如有） |

### 2.3 字重（Font Weight）

| 类名 | 字重值 | 用途 |
|------|--------|------|
| `font-normal` | `400` | 正文 |
| `font-medium` | `500` | 次要强调、按钮文字 |
| `font-semibold` | `600` | 标题、激活状态导航项 |
| `font-bold` | `700` | 重要提示、Hero 标题 |

---

## 3. 间距与布局（Spacing & Layout）✅

### 3.1 间距刻度（Spacing Scale）

使用 TailwindCSS 4 × 4 像素基础刻度（`1 = 4px`）：

| 常用值 | 像素 | 典型用途 |
|--------|------|----------|
| `p-1` | `4px` | 图标内边距 |
| `p-2` | `8px` | 小型按钮内边距 |
| `p-3` | `12px` | 输入框内边距 |
| `p-4` | `16px` | 卡片内边距、标准间距 |
| `p-6` | `24px` | 弹窗内边距、区块间距 |
| `p-8` | `32px` | 页面内容区内边距 |
| `gap-2` | `8px` | 紧凑列表项间距 |
| `gap-4` | `16px` | 标准列表项间距 |
| `gap-6` | `24px` | 卡片网格间距 |
| `mb-4` | `16px` | 标准段落间距 |
| `mb-8` | `32px` | 区块间距 |

### 3.2 容器规则（Container Rules）

- **主内容区**：`max-w-7xl mx-auto`（最大宽度 1280px，水平居中）。
- **弹窗内容**：`max-w-lg`（最大宽度 512px）或 `max-w-2xl`（768px，复杂弹窗）。
- **左侧导航栏宽度**：固定 `w-16`（64px，图标模式）或 `w-56`（224px，展开模式）。
- **右侧属性面板**：固定 `w-80`（320px）。

### 3.3 圆角规范（Border Radius）

| 类名 | 值 | 用途 |
|------|----|------|
| `rounded` | `4px` | 输入框、小标签 |
| `rounded-md` | `6px` | 按钮 |
| `rounded-lg` | `8px` | 卡片、弹窗 |
| `rounded-xl` | `12px` | 大卡片、上传区域 |
| `rounded-full` | `50%` | 头像、状态圆点 |

---

## 4. 响应式断点（Responsive Breakpoints）

> BBQ翻译 是 **纯桌面 Electron 应用**，最小窗口尺寸为 **1024 × 768px**，不需要移动端适配。但编辑器需要在不同窗口大小下保持可用性。

| 断点 | TailwindCSS 前缀 | 最小宽度 | 场景 |
|------|-----------------|----------|------|
| 小窗口 | `sm:` | `640px` | 最小可用窗口，部分面板折叠 |
| 标准窗口 | `md:` | `768px` | 默认最小推荐尺寸 |
| 宽屏窗口 | `lg:` | `1024px` | 正常使用窗口（默认启动尺寸） |
| 超宽窗口 | `xl:` | `1280px` | 双列卡片网格展开 |

---

## 5. 组件视觉规范（Component Visual Rules）✅

### 5.1 按钮（Button）

| 类型 | 样式类 | 用途 |
|------|--------|------|
| **主要按钮** | `bg-indigo-600 text-white hover:bg-indigo-700 rounded-md px-4 py-2 font-medium transition-colors` | 主要操作：翻译、保存、安装 |
| **次要按钮** | `bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-md px-4 py-2 font-medium transition-colors` | 次要操作：取消、返回 |
| **危险按钮** | `bg-red-500 text-white hover:bg-red-600 rounded-md px-4 py-2 font-medium transition-colors` | 破坏性操作：删除 |
| **幽灵按钮** | `text-indigo-600 hover:bg-indigo-50 rounded-md px-3 py-1.5 font-medium transition-colors` | 内联操作：编辑、查看 |
| **图标按钮** | `p-2 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors` | 只含图标的操作按钮 |
| **禁用状态** | 追加 `opacity-50 cursor-not-allowed pointer-events-none` | 后端不可达、参数不完整时 |

### 5.2 卡片（Card）

```
基础卡片：bg-white rounded-lg border border-slate-200 p-4 shadow-sm
悬浮卡片（.card-hover）：添加 transition-all 0.3s ease，hover 时 translateY(-4px) + 加深阴影
```

- **书籍封面卡片**：`aspect-[3/4]`（3:4 纵横比），封面图 `object-cover`。
- **章节卡片**：横向布局，左侧缩略图，右侧信息。
- **拓展模块卡片**：含状态徽章（未安装 / 安装中 / 已安装）。

### 5.3 输入框（Input）

```
标准输入框：bg-white border border-slate-200 rounded px-3 py-2 text-sm text-slate-900 
           focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
           placeholder:text-slate-400
密码输入框：同上，type="password"，右侧可显示/隐藏图标
禁用状态：bg-slate-50 text-slate-400 cursor-not-allowed
```

### 5.4 选择器（Select / Dropdown）

使用自研 `CustomSelect` 组件（`src/components/common/CustomSelect.tsx`），样式与输入框一致，带有 `ChevronDown` 图标。

### 5.5 弹窗（Modal）

```
遮罩层：fixed inset-0 bg-black/50 z-50 flex items-center justify-center
弹窗容器：bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4
弹窗标题：text-xl font-semibold text-slate-900 mb-4
操作按钮行：flex justify-end gap-3 mt-6
```

### 5.6 侧边栏导航项（`.sidebar-item`）

```css
/* 定义在 globals.css */
.sidebar-item { transition: all 0.2s; cursor: pointer; }
.sidebar-item:hover,
.sidebar-item.active { background-color: #EEF2FF; color: #4F46E5; font-weight: 600; }
```

- 非激活状态：`text-slate-500`。
- 激活状态：`text-indigo-600 bg-indigo-50 font-semibold`。

### 5.7 徽章（Badge）

| 类型 | 样式 | 用途 |
|------|------|------|
| 成功 | `bg-green-100 text-green-700 rounded-full px-2 py-0.5 text-xs font-medium` | 已安装、已完成 |
| 警告 | `bg-yellow-100 text-yellow-700 rounded-full px-2 py-0.5 text-xs font-medium` | 进行中、待确认 |
| 错误 | `bg-red-100 text-red-700 rounded-full px-2 py-0.5 text-xs font-medium` | 安装失败、错误 |
| 中性 | `bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 text-xs font-medium` | 未安装、未翻译 |

### 5.8 进度条（Progress Bar）

```
容器：bg-slate-200 rounded-full h-2
填充：bg-indigo-600 rounded-full h-2 transition-all（宽度由进度百分比控制）
```

### 5.9 滚动条（Scrollbar）

```css
/* 定义在 globals.css，全局应用 */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
```

---

## 6. 动画与过渡（Animations & Transitions）✅

| 名称 | 定义 | 用途 |
|------|------|------|
| `transition-colors` | TailwindCSS 内置，150ms | 按钮 hover 颜色变化 |
| `.view-section` | `fadeIn 0.3s ease-in-out`（`globals.css`） | 页面区块进入动画 |
| `.card-hover` | `all 0.3s cubic-bezier(0.4, 0, 0.2, 1)`（`globals.css`） | 书籍/章节卡片 hover 上浮 |
| `.loading-spin` | `spin 3s linear infinite`（`globals.css`） | 加载旋转图标 |
| `transition-all duration-200` | TailwindCSS | 侧边栏项展开/折叠 |

---

## 7. 图标规范（Icons）✅

- **唯一图标库**：`lucide-react@0.540.0`。
- **禁止**混用其他图标库。
- 图标尺寸：
  - 导航栏图标：`w-5 h-5`（20px）。
  - 操作按钮图标：`w-4 h-4`（16px）。
  - 大图标（空状态插图）：`w-12 h-12`（48px）或 `w-16 h-16`（64px）。
- 图标颜色跟随父元素 `currentColor`，通过文字颜色类控制。

---

## 8. 特殊组件规范（Special Components）✅

### 8.1 Electron 标题栏拖拽区

```css
/* 定义在 globals.css */
.app-drag-region { -webkit-app-region: drag; }
.app-drag-region a,
.app-drag-region button,
.app-drag-region input,
.app-drag-region select,
.app-drag-region [role="button"] { -webkit-app-region: no-drag; }
```

- 顶部 TopBar 必须添加 `.app-drag-region` 类，使用户可拖动窗口。
- TopBar 内所有可交互元素必须添加 `no-drag` 样式（通过父类的 CSS 子选择器自动处理）。

### 8.2 Konva Canvas 编辑器

- Canvas 容器背景：`bg-slate-800`（深色背景，与图片形成对比）。
- 文字框（未选中）：`stroke: '#22C55E'`（green-500），`strokeWidth: 2`。
- 文字框（选中）：`stroke: '#4F46E5'`（indigo-600），`strokeWidth: 2.5`，添加 `shadowBlur: 8`。
- 手动绘制中的矩形：`stroke: '#F97316'`（orange-500），`strokeWidth: 2`，`dash: [5, 3]`。

### 8.3 Range Slider（参数调节滑块）

```css
/* 定义在 globals.css */
.range-slider { -webkit-appearance: none; height: 4px; background: #e2e8f0; border-radius: 2px; }
.range-slider::-webkit-slider-thumb { width: 14px; height: 14px; background: #4F46E5; border-radius: 50%; }
```

---

## 9. 代码规范（Code Conventions）

- **强制解耦**：UI 组件仅负责渲染，所有状态管理、数据获取、复杂计算抽离为 Custom Hooks（`src/hooks/`）或 Utils（`src/lib/`）。
- **禁止魔法数字**：数值常量统一定义在 `src/constants/`（如 `DETECTION_RESOLUTION`、`INPAINTING_SIZE`、`STORAGE_KEY_*`）。
- **小文件原则**：单个文件逻辑过于复杂时必须拆分子组件或独立模块。
- **命名语义化**：变量与函数名必须精准表达意图（如 `startTranslation` 而非 `start`，`resolveImageToBlob` 而非 `getImage`）。
- **动态导入（SSR 安全）**：Konva 相关组件必须使用 `dynamic(() => import(...), { ssr: false })` 导入，避免服务端渲染报错。
