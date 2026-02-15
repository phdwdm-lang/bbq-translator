import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
} from "lucide-react";
import type { EditorRegion } from "../../types/editor";

interface TextFormattingToolbarProps {
  region: EditorRegion;
  onRegionChange: (id: string, patch: Partial<EditorRegion>) => void;
}

const FORMAT_BUTTON_BASE = "w-8 h-8 rounded-lg flex items-center justify-center transition-all";
const FORMAT_BUTTON_ACTIVE = `${FORMAT_BUTTON_BASE} bg-white shadow-sm text-indigo-600`;
const FORMAT_BUTTON_INACTIVE = `${FORMAT_BUTTON_BASE} text-slate-600 hover:bg-white hover:shadow-sm`;

type AlignValue = "left" | "center" | "right";

const ALIGN_OPTIONS: { value: AlignValue; icon: typeof AlignLeft; title: string }[] = [
  { value: "left", icon: AlignLeft, title: "左对齐" },
  { value: "center", icon: AlignCenter, title: "居中" },
  { value: "right", icon: AlignRight, title: "右对齐" },
];

function parseFontStyle(fontStyle?: string) {
  const raw = (fontStyle ?? "").toLowerCase();
  return {
    bold: raw.includes("bold"),
    italic: raw.includes("italic"),
  };
}

function buildFontStyle(bold: boolean, italic: boolean): string | undefined {
  const parts: string[] = [];
  if (bold) parts.push("bold");
  if (italic) parts.push("italic");
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function parseTextDecoration(textDecoration?: string) {
  const raw = (textDecoration ?? "").toLowerCase();
  return {
    underline: raw.includes("underline"),
    strikethrough: raw.includes("line-through"),
  };
}

function buildTextDecoration(underline: boolean, strikethrough: boolean): string | undefined {
  const parts: string[] = [];
  if (underline) parts.push("underline");
  if (strikethrough) parts.push("line-through");
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export function TextFormattingToolbar({ region, onRegionChange }: TextFormattingToolbarProps) {
  const { bold, italic } = parseFontStyle(region.fontStyle);
  const { underline, strikethrough } = parseTextDecoration(region.textDecoration);
  const currentAlign = (region.align || "left") as AlignValue;

  const toggleBold = () => {
    onRegionChange(region.id, { fontStyle: buildFontStyle(!bold, italic) });
  };

  const toggleItalic = () => {
    onRegionChange(region.id, { fontStyle: buildFontStyle(bold, !italic) });
  };

  const toggleUnderline = () => {
    onRegionChange(region.id, { textDecoration: buildTextDecoration(!underline, strikethrough) });
  };

  const toggleStrikethrough = () => {
    onRegionChange(region.id, { textDecoration: buildTextDecoration(underline, !strikethrough) });
  };

  const setAlign = (align: AlignValue) => {
    onRegionChange(region.id, { align });
  };

  return (
    <div className="bg-slate-50 rounded-xl p-2 border border-slate-100">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={bold ? FORMAT_BUTTON_ACTIVE : FORMAT_BUTTON_INACTIVE}
          onClick={(e) => { e.stopPropagation(); toggleBold(); }}
          title="加粗 (Ctrl+B)"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          type="button"
          className={italic ? FORMAT_BUTTON_ACTIVE : FORMAT_BUTTON_INACTIVE}
          onClick={(e) => { e.stopPropagation(); toggleItalic(); }}
          title="斜体 (Ctrl+I)"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          type="button"
          className={underline ? FORMAT_BUTTON_ACTIVE : FORMAT_BUTTON_INACTIVE}
          onClick={(e) => { e.stopPropagation(); toggleUnderline(); }}
          title="下划线 (Ctrl+U)"
        >
          <Underline className="w-4 h-4" />
        </button>
        <button
          type="button"
          className={strikethrough ? FORMAT_BUTTON_ACTIVE : FORMAT_BUTTON_INACTIVE}
          onClick={(e) => { e.stopPropagation(); toggleStrikethrough(); }}
          title="删除线"
        >
          <Strikethrough className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-200 mx-1" />

        {ALIGN_OPTIONS.map(({ value, icon: Icon, title }) => (
          <button
            key={value}
            type="button"
            className={currentAlign === value ? FORMAT_BUTTON_ACTIVE : FORMAT_BUTTON_INACTIVE}
            onClick={(e) => { e.stopPropagation(); setAlign(value); }}
            title={title}
          >
            <Icon className="w-4 h-4" />
          </button>
        ))}
      </div>
    </div>
  );
}
