import React from "react";
import { VectorElement } from "../../lib/pdf/types";

export interface VectorOverlayProps {
  elements: VectorElement[];
  selectedIds?: string[];
  onSelectElement?: (id: string, multiSelect: boolean) => void;
  pageWidth: number;
  pageHeight: number;
  scale?: number;
  interactive?: boolean;
  showBounds?: boolean;
}

export const VectorOverlay: React.FC<VectorOverlayProps> = ({
  elements,
  selectedIds = [],
  onSelectElement,
  pageWidth,
  pageHeight,
  scale = 1,
  interactive = true,
  showBounds = true,
}) => {
  const convertSegmentsToSvgPath = (element: VectorElement): string => {
    const parts: string[] = [];

    for (const seg of element.segments) {
      const pts = seg.points;
      switch (seg.op) {
        case "m":
          if (pts.length >= 1) {
            parts.push(`M ${pts[0].x} ${pageHeight - pts[0].y}`);
          }
          break;
        case "l":
          if (pts.length >= 1) {
            parts.push(`L ${pts[0].x} ${pageHeight - pts[0].y}`);
          }
          break;
        case "c":
          if (pts.length >= 3) {
            parts.push(
              `C ${pts[0].x} ${pageHeight - pts[0].y}, ${pts[1].x} ${pageHeight - pts[1].y}, ${pts[2].x} ${pageHeight - pts[2].y}`
            );
          }
          break;
        case "v":
          if (pts.length >= 2) {
            parts.push(
              `C ${pts[0].x} ${pageHeight - pts[0].y}, ${pts[0].x} ${pageHeight - pts[0].y}, ${pts[1].x} ${pageHeight - pts[1].y}`
            );
          }
          break;
        case "y":
          if (pts.length >= 2) {
            parts.push(
              `C ${pts[0].x} ${pageHeight - pts[0].y}, ${pts[1].x} ${pageHeight - pts[1].y}, ${pts[1].x} ${pageHeight - pts[1].y}`
            );
          }
          break;
        case "h":
          parts.push("Z");
          break;
        case "re":
          if (pts.length >= 4) {
            parts.push(
              `M ${pts[0].x} ${pageHeight - pts[0].y} L ${pts[1].x} ${pageHeight - pts[1].y} L ${pts[2].x} ${pageHeight - pts[2].y} L ${pts[3].x} ${pageHeight - pts[3].y} Z`
            );
          }
          break;
        default:
          break;
      }
    }

    if (element.closed && parts.length > 0 && !parts[parts.length - 1].endsWith("Z")) {
      parts.push("Z");
    }

    return parts.join(" ");
  };

  return (
    <svg
      data-testid="vector-overlay"
      className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
      style={{
        width: `${pageWidth * scale}px`,
        height: `${pageHeight * scale}px`,
      }}
      viewBox={`0 0 ${pageWidth} ${pageHeight}`}
    >
      {elements.map((el) => {
        const isSelected = selectedIds.includes(el.id);
        const pathData = convertSegmentsToSvgPath(el);
        const b = el.bounds;

        const boundsX = b.minX;
        const boundsY = pageHeight - b.maxY;
        const boundsW = Math.max(b.maxX - b.minX, 1);
        const boundsH = Math.max(b.maxY - b.minY, 1);

        return (
          <g key={el.id} className="vector-element-group">
            {/* Vector Path */}
            <path
              d={pathData}
              stroke={el.strokeColor || (isSelected ? "#2563eb" : "#3b82f6")}
              strokeWidth={el.strokeWidth ?? 1.5}
              fill={el.fillColor || "none"}
              opacity={el.opacity ?? 1}
              className={interactive ? "pointer-events-auto cursor-pointer hover:stroke-blue-400" : ""}
              onClick={(e) => {
                if (!interactive) return;
                e.stopPropagation();
                onSelectElement?.(el.id, e.shiftKey || e.metaKey || e.ctrlKey);
              }}
            />

            {/* Bounding Box indicator */}
            {(showBounds || isSelected) && (
              <rect
                x={boundsX}
                y={boundsY}
                width={boundsW}
                height={boundsH}
                fill="none"
                stroke={isSelected ? "#2563eb" : "#94a3b8"}
                strokeWidth={isSelected ? 1.5 / scale : 1 / scale}
                strokeDasharray={isSelected ? undefined : "3 3"}
                className={interactive ? "pointer-events-auto cursor-pointer" : ""}
                onClick={(e) => {
                  if (!interactive) return;
                  e.stopPropagation();
                  onSelectElement?.(el.id, e.shiftKey || e.metaKey || e.ctrlKey);
                }}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
};
