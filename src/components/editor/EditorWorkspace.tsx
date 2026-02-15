"use client";

import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Rect } from "react-konva";
import useImage from "use-image";
import Konva from "konva";
import type { EditorTool, DrawingRect } from "../../types/editor";
import { ScanText, Eraser, MousePointer2, ZoomIn, ZoomOut, Maximize, Layers } from "lucide-react";
import { RegionGroup } from "./RegionGroup";

interface EditorWorkspaceProps {
  imageUrl: string | null;
  regions: import("../../types/editor").EditorRegion[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChangeRegion: (id: string, newBox: [number, number, number, number], newText: string) => void;
  scale: number;
  setScale: (s: number) => void;
  showOriginal?: boolean;
  onToggleOriginal?: () => void;
  activeTool?: EditorTool;
  onToolChange?: (tool: EditorTool) => void;
  onOcrRegion?: (rect: DrawingRect) => Promise<void>;
  onInpaintRegion?: (rect: DrawingRect) => Promise<void>;
  currentImageBlob?: Blob | null;
  imageNaturalSize?: [number, number] | null;
}

type URLImageProps = { src: string } & Omit<Konva.ImageConfig, "image">;

const URLImage = ({ src, ...props }: URLImageProps) => {
  const [image] = useImage(src, "anonymous");
  return <KonvaImage image={image} {...props} />;
};

export function EditorWorkspace({
  imageUrl,
  regions,
  selectedId,
  onSelect,
  onChangeRegion,
  scale,
  setScale,
  showOriginal = false,
  onToggleOriginal,
  activeTool = "select",
  onToolChange,
  onOcrRegion,
  onInpaintRegion,
  imageNaturalSize,
}: EditorWorkspaceProps) {
  const stageRef = useRef<Konva.Stage>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  
  // Drawing state for tool regions
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingRect, setDrawingRect] = useState<DrawingRect | null>(null);
  const [toolProcessing, setToolProcessing] = useState(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);

  const isToolMode = activeTool === "ocr_region" || activeTool === "inpaint_region";

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };
    updateSize();
    const obs = new ResizeObserver(updateSize);
    if (containerRef.current) obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    const newScale = e.evt.deltaY > 0 ? oldScale * 0.98 : oldScale * 1.02;
    const finalScale = Math.max(0.1, Math.min(newScale, 5));

    const newPos = {
      x: pointer.x - mousePointTo.x * finalScale,
      y: pointer.y - mousePointTo.y * finalScale,
    };

    setScale(finalScale);
    setPosition(newPos);
  };

  // Tool drawing handlers
  const handleToolMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isToolMode || toolProcessing) return;
    const stage = stageRef.current;
    if (!stage) return;
    
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    
    const imageX = (pointer.x - stage.x()) / stage.scaleX();
    const imageY = (pointer.y - stage.y()) / stage.scaleY();
    
    drawStartRef.current = { x: imageX, y: imageY };
    setIsDrawing(true);
    setDrawingRect({ x: imageX, y: imageY, width: 0, height: 0 });
  };

  const handleToolMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawing || !drawStartRef.current) return;
    const stage = stageRef.current;
    if (!stage) return;
    
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    
    const imageX = (pointer.x - stage.x()) / stage.scaleX();
    const imageY = (pointer.y - stage.y()) / stage.scaleY();
    
    const startX = drawStartRef.current.x;
    const startY = drawStartRef.current.y;
    
    setDrawingRect({
      x: Math.min(startX, imageX),
      y: Math.min(startY, imageY),
      width: Math.abs(imageX - startX),
      height: Math.abs(imageY - startY),
    });
  };

  const handleToolMouseUp = async () => {
    if (!isDrawing || !drawingRect) {
      setIsDrawing(false);
      drawStartRef.current = null;
      return;
    }
    
    setIsDrawing(false);
    drawStartRef.current = null;
    
    // Minimum size check
    if (drawingRect.width < 10 || drawingRect.height < 10) {
      setDrawingRect(null);
      return;
    }
    
    setToolProcessing(true);
    try {
      if (activeTool === "ocr_region" && onOcrRegion) {
        await onOcrRegion(drawingRect);
      } else if (activeTool === "inpaint_region" && onInpaintRegion) {
        await onInpaintRegion(drawingRect);
      }
    } catch (err) {
      console.error("Tool action failed:", err);
    } finally {
      setToolProcessing(false);
      setDrawingRect(null);
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-[#e5e5e5] relative overflow-hidden">
      {!imageUrl ? (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 font-bold">
          无图片
        </div>
      ) : size.width > 0 ? (
        <Stage
          width={size.width}
          height={size.height}
          draggable={!isToolMode}
          onWheel={handleWheel}
          scaleX={scale}
          scaleY={scale}
          x={position.x}
          y={position.y}
          onDragEnd={(e) => {
            if (e.target === e.target.getStage()) {
              setPosition({ x: e.target.x(), y: e.target.y() });
            }
          }}
          onMouseDown={(e) => {
            if (isToolMode) {
              handleToolMouseDown(e);
              return;
            }
            const clickedOnEmpty = e.target === e.target.getStage();
            if (clickedOnEmpty) {
              onSelect(null);
            }
          }}
          onMouseMove={isToolMode ? handleToolMouseMove : undefined}
          onMouseUp={isToolMode ? handleToolMouseUp : undefined}
          onMouseLeave={isToolMode ? handleToolMouseUp : undefined}
          ref={stageRef}
          className={isToolMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}
        >
          <Layer>
            <URLImage src={imageUrl} />
            {[...regions].sort((a, b) => {
              if (a.id === selectedId) return 1;
              if (b.id === selectedId) return -1;
              return 0;
            }).map((r) => (
              <RegionGroup
                key={r.id}
                region={r}
                isSelected={selectedId === r.id}
                onSelect={onSelect}
                onChange={onChangeRegion}
                scale={scale}
                showOriginal={showOriginal}
              />
            ))}
            {/* Drawing rectangle for tool mode */}
            {drawingRect && (
              <Rect
                x={drawingRect.x}
                y={drawingRect.y}
                width={drawingRect.width}
                height={drawingRect.height}
                fill={activeTool === "ocr_region" ? "rgba(0, 150, 255, 0.2)" : "rgba(255, 100, 0, 0.2)"}
                stroke={activeTool === "ocr_region" ? "#0096ff" : "#ff6400"}
                strokeWidth={2 / scale}
                dash={[6 / scale, 3 / scale]}
                listening={false}
              />
            )}
          </Layer>
        </Stage>
      ) : null}

      {/* Canvas Toolbar (Top-Right) */}
      <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/90 backdrop-blur border border-slate-200 rounded-xl shadow-lg p-1 z-10">
        {/* Drawing Tools Group */}
        {onToolChange && (
          <>
            <button
              className={`p-2 rounded-lg transition-all ${
                activeTool === "select"
                  ? "text-indigo-600 bg-indigo-50"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
              onClick={() => onToolChange("select")}
              title="选择工具"
              disabled={toolProcessing}
            >
              <MousePointer2 className="w-4 h-4" />
            </button>
            <button
              className={`p-2 rounded-lg transition-all ${
                activeTool === "ocr_region"
                  ? "text-indigo-600 bg-indigo-50"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
              onClick={() => onToolChange(activeTool === "ocr_region" ? "select" : "ocr_region")}
              title="区域识别 (OCR)"
              disabled={toolProcessing}
            >
              <ScanText className="w-4 h-4" />
            </button>
            <button
              className={`p-2 rounded-lg transition-all ${
                activeTool === "inpaint_region"
                  ? "text-orange-600 bg-orange-50"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
              onClick={() => onToolChange(activeTool === "inpaint_region" ? "select" : "inpaint_region")}
              title="局部修补 (Inpaint)"
              disabled={toolProcessing}
            >
              <Eraser className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-slate-200 mx-0.5" />
          </>
        )}

        {/* View Toggle */}
        {onToggleOriginal && (
          <>
            <button
              className={`p-2 rounded-lg transition-all ${
                showOriginal
                  ? "text-indigo-600 bg-indigo-50"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
              onClick={onToggleOriginal}
              title={showOriginal ? "切换到译文" : "切换到原文"}
            >
              <Layers className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-slate-200 mx-0.5" />
          </>
        )}

        {/* Zoom Controls */}
        <button
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-all"
          onClick={() => setScale(Math.min(5, scale * 1.2))}
          title="放大"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-all"
          onClick={() => setScale(Math.max(0.1, scale / 1.2))}
          title="缩小"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-all"
          onClick={() => {
            if (imageNaturalSize && size.width > 0 && size.height > 0) {
              const [imgW, imgH] = imageNaturalSize;
              const padding = 40;
              const availW = size.width - padding * 2;
              const availH = size.height - padding * 2;
              const fitScale = Math.min(availW / imgW, availH / imgH, 1);
              const centeredX = (size.width - imgW * fitScale) / 2;
              setScale(fitScale);
              setPosition({ x: centeredX, y: padding });
            } else {
              setScale(1);
              setPosition({ x: 0, y: 0 });
            }
          }}
          title="重置缩放"
        >
          <Maximize className="w-4 h-4" />
        </button>
      </div>

      {/* Tool Mode Hint */}
      {isToolMode && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-slate-900/85 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-lg backdrop-blur-sm z-10">
          {toolProcessing ? "处理中..." : activeTool === "ocr_region" ? "框选区域进行文字识别" : "框选区域进行修补"}
        </div>
      )}
    </div>
  );
}
