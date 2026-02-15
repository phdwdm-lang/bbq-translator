import type { EditorRegion } from "../../types/editor";

const DEFAULT_STROKE_COLOR = "#FFFFFF";
const DEFAULT_STROKE_WIDTH = 2;

interface StrokeSectionProps {
  region: EditorRegion;
  onRegionChange: (id: string, patch: Partial<EditorRegion>) => void;
}

export function StrokeSection({ region, onRegionChange }: StrokeSectionProps) {
  const enabled = region.strokeWidth !== undefined && region.strokeWidth > 0;
  const strokeColor = region.strokeColor || DEFAULT_STROKE_COLOR;
  const strokeWidth = region.strokeWidth ?? DEFAULT_STROKE_WIDTH;

  const handleToggle = () => {
    if (enabled) {
      onRegionChange(region.id, { strokeWidth: undefined, strokeColor: undefined });
    } else {
      onRegionChange(region.id, { strokeWidth: DEFAULT_STROKE_WIDTH, strokeColor: DEFAULT_STROKE_COLOR });
    }
  };

  return (
    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
      <div className="flex items-center justify-between mb-2">
        <label className="text-[10px] font-bold text-slate-600">描边效果</label>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={enabled}
            onChange={(e) => { e.stopPropagation(); handleToggle(); }}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600" />
        </label>
      </div>
      <div className={`grid grid-cols-2 gap-2 ${enabled ? "" : "opacity-50 pointer-events-none"}`}>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={strokeColor}
            onChange={(e) => onRegionChange(region.id, { strokeColor: e.target.value })}
            className="w-6 h-6 rounded border border-slate-200 cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          />
          <span className="text-[10px] text-slate-500">描边色</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={strokeWidth}
            min={1}
            max={10}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (v > 0) onRegionChange(region.id, { strokeWidth: v });
            }}
            className="w-12 p-1 text-xs border border-slate-200 rounded outline-none text-center"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
          <span className="text-[10px] text-slate-500">粗细 px</span>
        </div>
      </div>
    </div>
  );
}
