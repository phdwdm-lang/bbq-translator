"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Image as KonvaImage, Rect, Text, Group, Transformer, Label, Tag } from "react-konva";
import Konva from "konva";
import type { EditorRegion } from "../../types/editor";
import { getBackendUrl } from "../../lib/env";
import {
  debounce,
  previewCache,
  getCacheKey,
  getContrastingStrokeColor,
  normalizeCanvasFontFamily,
} from "../../lib/editorUtils";

interface RegionGroupProps {
  region: EditorRegion;
  isSelected: boolean;
  onSelect: (id: string | null, options?: { ctrlKey?: boolean }) => void;
  onChange: (id: string, box: [number, number, number, number], text: string) => void;
  scale: number;
  showOriginal?: boolean;
}

export function RegionGroup({
  region,
  isSelected,
  onSelect,
  onChange,
  scale,
  showOriginal = false,
}: RegionGroupProps) {
  const shapeRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const rectRef = useRef<Konva.Rect>(null);
  const textRef = useRef<Konva.Text>(null);
  const [previewImage, setPreviewImage] = useState<{ img: HTMLImageElement; offsetX: number; offsetY: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const computePreviewOffset = useCallback((imgW: number, imgH: number, r: EditorRegion, contentBBox?: [number, number, number, number]) => {
    const boxW = Math.round(r.box[2]);
    const boxH = Math.round(r.box[3]);
    const align = (r.align || "left").toLowerCase();

    const pad = Math.max(2, Math.floor(Math.min(boxW, boxH) * 0.06));

    let offsetX = 0;
    let offsetY = 0;

    if (contentBBox && contentBBox.length === 4) {
      const [cx0, cy0, cx1, cy1] = contentBBox;
      const contentW = Math.max(0, cx1 - cx0);

      let targetLeftInBox = 0;
      if (align === "right") {
        targetLeftInBox = boxW - contentW;
      } else if (align === "center") {
        targetLeftInBox = Math.round((boxW - contentW) / 2);
      }
      offsetX = Math.round(targetLeftInBox - cx0);
      offsetY = Math.round(pad - cy0);
    } else {
      if (align === "right") {
        offsetX = boxW - imgW;
      } else if (align === "center") {
        offsetX = Math.round((boxW - imgW) / 2);
      }
      offsetY = 0;
    }
    return { offsetX, offsetY, boxW, boxH };
  }, []);

  const fetchPreview = useCallback(async (r: EditorRegion) => {
    if (showOriginal || !r.text) {
      setPreviewImage(null);
      return;
    }

    const cacheKey = getCacheKey(r);
    const cached = previewCache.get(cacheKey);
    if (cached) {
      const img = new window.Image();
      img.src = cached.image;
      img.onload = () => {
        const { offsetX, offsetY } = computePreviewOffset(img.naturalWidth || img.width, img.naturalHeight || img.height, r, cached.content_bbox);
        setPreviewImage({ img, offsetX, offsetY });
      };
      return;
    }

    setIsLoading(true);
    try {
      const fillColor = r.fill || "#000000";
      const autoStrokeColor = getContrastingStrokeColor(fillColor);
      const userStroke = r.strokeWidth !== undefined && r.strokeWidth > 0;

      const response = await fetch(`${getBackendUrl()}/render_text_preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: r.text,
          width: Math.round(r.box[2]),
          height: Math.round(r.box[3]),
          font_size: r.fontSize || 16,
          font_family: r.fontFamily || "sans-serif",
          fill: fillColor,
          alignment: r.align || "left",
          line_height: r.lineHeight || 1.0,
          letter_spacing: r.letterSpacing || 0,
          bold: r.fontStyle?.includes("bold") || false,
          italic: r.fontStyle?.includes("italic") || false,
          underline: r.textDecoration?.includes("underline") || false,
          strikethrough: r.textDecoration?.includes("line-through") || false,
          direction: r.direction || "horizontal",
          stroke_color: userStroke ? r.strokeColor : autoStrokeColor,
          stroke_width: userStroke ? r.strokeWidth : 0,
        }),
      });
      const result = await response.json();
      if (result.status === "success" && result.image) {
        const entry = {
          image: result.image as string,
          content_bbox: (Array.isArray(result.content_bbox) && result.content_bbox.length === 4 ? (result.content_bbox as [number, number, number, number]) : undefined),
        };
        previewCache.set(cacheKey, entry);
        const img = new window.Image();
        img.src = entry.image;
        img.onload = () => {
          const { offsetX, offsetY } = computePreviewOffset(img.naturalWidth || img.width, img.naturalHeight || img.height, r, entry.content_bbox);
          setPreviewImage({ img, offsetX, offsetY });
        };
      }
    } catch (err) {
      console.error("Preview fetch error:", err);
    } finally {
      setIsLoading(false);
    }
  }, [showOriginal, computePreviewOffset]);

  const debouncedFetch = useMemo(
    () => debounce((r: EditorRegion) => fetchPreview(r), 300),
    [fetchPreview]
  );

  useEffect(() => {
    if (!showOriginal && region.text) {
      debouncedFetch(region);
    } else {
      setPreviewImage(null);
    }
  }, [
    region.text,
    region.box[2],
    region.box[3],
    region.fontSize,
    region.fontFamily,
    region.fill,
    region.align,
    region.lineHeight,
    region.letterSpacing,
    region.fontStyle,
    region.textDecoration,
    region.direction,
    region.strokeColor,
    region.strokeWidth,
    showOriginal,
    debouncedFetch,
  ]);

  useEffect(() => {
    if (!isSelected) return;
    const tr = trRef.current;
    const rect = rectRef.current;
    if (!tr || !rect) return;

    tr.nodes([rect]);
    tr.getLayer()?.batchDraw();
  }, [
    isSelected,
    region.box[0],
    region.box[1],
    region.box[2],
    region.box[3],
    previewImage,
  ]);

  return (
    <>
      <Group
        ref={shapeRef}
        x={region.box[0]}
        y={region.box[1]}
        draggable={!showOriginal}
        onClick={(e) => {
          e.cancelBubble = true;
          if (!showOriginal) onSelect(region.id, { ctrlKey: e.evt.ctrlKey || e.evt.metaKey });
        }}
        onTap={(e) => {
          e.cancelBubble = true;
          if (!showOriginal) onSelect(region.id);
        }}
        onDragMove={(e) => {
          if (showOriginal) return;
          if (textRef.current) {
            textRef.current.x(e.target.x());
            textRef.current.y(e.target.y());
          }
        }}
        onDragEnd={(e) => {
          if (showOriginal) return;
          onChange(
            region.id,
            [Math.round(e.target.x()), Math.round(e.target.y()), region.box[2], region.box[3]],
            region.text
          );
        }}
      >
        <Rect
          ref={rectRef}
          width={region.box[2]}
          height={region.box[3]}
          fill={showOriginal ? "transparent" : (isSelected ? "rgba(79, 70, 229, 0.1)" : "rgba(248, 113, 113, 0.05)")}
          stroke={isSelected ? "#4F46E5" : "rgba(248, 113, 113, 0.6)"}
          strokeWidth={2 / scale}
          strokeScaleEnabled={false}
          cornerRadius={2 / scale}
          onTransformEnd={() => {
            if (showOriginal) return;
            const node = rectRef.current;
            if (!node) return;

            const scaleX = node.scaleX();
            const scaleY = node.scaleY();

            const w = Math.max(5, Math.round(node.width() * scaleX));
            const h = Math.max(5, Math.round(node.height() * scaleY));

            node.scaleX(1);
            node.scaleY(1);
            node.width(w);
            node.height(h);

            onChange(region.id, [region.box[0], region.box[1], w, h], region.text);
          }}
        />
        {!showOriginal && previewImage ? (
          <KonvaImage
            image={previewImage.img}
            x={previewImage.offsetX}
            y={previewImage.offsetY}
            listening={false}
          />
        ) : !showOriginal && isLoading ? (
          <Text
            x={0}
            y={0}
            width={region.box[2]}
            text="加载中..."
            fontSize={12}
            fill="#999"
            align="center"
            verticalAlign="top"
            listening={false}
          />
        ) : null}
        {/* Region Label Tag */}
        {!showOriginal && (
          <Label x={0} y={-20 / scale} listening={false}>
            <Tag
              fill={isSelected ? "#4F46E5" : "#F87171"}
              cornerRadius={3 / scale}
            />
            <Text
              text={`文本框 ${region.regionIndex + 1}`}
              fontSize={9 / scale}
              fontStyle="bold"
              fill="white"
              padding={Math.max(1, 3 / scale)}
              listening={false}
            />
          </Label>
        )}
      </Group>
      {!showOriginal && !previewImage && !isLoading && (
        <Text
          ref={textRef}
          x={region.box[0]}
          y={region.box[1]}
          width={region.box[2]}
          text={region.text}
          fontSize={region.fontSize || 16}
          fontFamily={normalizeCanvasFontFamily(region.fontFamily)}
          fill={region.fill || "black"}
          fontStyle={region.fontStyle}
          textDecoration={region.textDecoration}
          align={region.align || "left"}
          verticalAlign="top"
          wrap="char"
          padding={0}
          lineHeight={region.lineHeight || 1.0}
          letterSpacing={region.letterSpacing || 0}
          stroke={getContrastingStrokeColor(region.fill || "#000000")}
          strokeWidth={region.fontStyle?.includes("bold")
            ? Math.max(1, (region.fontSize || 16) * 0.18)
            : Math.max(0.5, (region.fontSize || 16) * 0.06)}
          ellipsis={false}
          listening={false}
        />
      )}
      {isSelected && !showOriginal && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          keepRatio={false}
          enabledAnchors={['bottom-right']}
          ignoreStroke={true}
          anchorCornerRadius={2}
          borderStroke="#4F46E5"
          anchorStroke="#4F46E5"
          anchorFill="white"
          anchorSize={10}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) return oldBox;
            return newBox;
          }}
        />
      )}
    </>
  );
}
