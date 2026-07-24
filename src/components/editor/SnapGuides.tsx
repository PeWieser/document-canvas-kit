import React from "react";
import { BoundingBox, SnapGuide } from "../../lib/pdf/types";

export interface SnapGuidesProps {
  guides: SnapGuide[];
  pageWidth: number;
  pageHeight: number;
  scale?: number;
  enabled?: boolean;
}

export const SnapGuides: React.FC<SnapGuidesProps> = ({
  guides,
  pageWidth,
  pageHeight,
  scale = 1,
  enabled = true,
}) => {
  if (!enabled || !guides || guides.length === 0) return null;

  return (
    <svg
      data-testid="snap-guides"
      className="absolute top-0 left-0 w-full h-full pointer-events-none z-30"
      style={{
        width: `${pageWidth * scale}px`,
        height: `${pageHeight * scale}px`,
      }}
    >
      {guides.map((guide) => {
        const isVertical = guide.type === "vertical";
        let strokeColor = "#ec4899"; // element alignment (pink)
        let strokeDash = undefined;

        if (guide.kind === "center") {
          strokeColor = "#06b6d4"; // cyan
          strokeDash = "4 4";
        } else if (guide.kind === "margin") {
          strokeColor = "#8b5cf6"; // purple
          strokeDash = "2 2";
        }

        if (isVertical) {
          const x = guide.position * scale;
          const y1 = guide.start !== undefined ? (pageHeight - guide.start) * scale : 0;
          const y2 = guide.end !== undefined ? (pageHeight - guide.end) * scale : pageHeight * scale;
          return (
            <line
              key={guide.id}
              x1={x}
              y1={y1}
              x2={x}
              y2={y2}
              stroke={strokeColor}
              strokeWidth={1}
              strokeDasharray={strokeDash}
            />
          );
        } else {
          const y = (pageHeight - guide.position) * scale;
          const x1 = guide.start !== undefined ? guide.start * scale : 0;
          const x2 = guide.end !== undefined ? guide.end * scale : pageWidth * scale;
          return (
            <line
              key={guide.id}
              x1={x1}
              y1={y}
              x2={x2}
              y2={y}
              stroke={strokeColor}
              strokeWidth={1}
              strokeDasharray={strokeDash}
            />
          );
        }
      })}
    </svg>
  );
};

export function computeSnapGuides(
  activeBounds: BoundingBox,
  otherElementsBounds: BoundingBox[],
  pageWidth: number,
  pageHeight: number,
  threshold: number = 5,
  enabled: boolean = true
): { snappedBounds: BoundingBox; guides: SnapGuide[] } {
  if (!enabled) {
    return { snappedBounds: { ...activeBounds }, guides: [] };
  }
  const guides: SnapGuide[] = [];
  const snapped = { ...activeBounds };
  const width = activeBounds.maxX - activeBounds.minX;
  const height = activeBounds.maxY - activeBounds.minY;

  const activeCenterX = activeBounds.minX + width / 2;
  const activeCenterY = activeBounds.minY + height / 2;

  // 1. Page Center Snap
  const pageCenterX = pageWidth / 2;
  const pageCenterY = pageHeight / 2;

  if (Math.abs(activeCenterX - pageCenterX) < threshold) {
    snapped.minX = pageCenterX - width / 2;
    snapped.maxX = snapped.minX + width;
    guides.push({
      id: "guide-center-v",
      type: "vertical",
      position: pageCenterX,
      kind: "center",
    });
  }

  if (Math.abs(activeCenterY - pageCenterY) < threshold) {
    snapped.minY = pageCenterY - height / 2;
    snapped.maxY = snapped.minY + height;
    guides.push({
      id: "guide-center-h",
      type: "horizontal",
      position: pageCenterY,
      kind: "center",
    });
  }

  // 2. Page Margin Snap (36pt / 0.5in)
  const margin = 36;
  const targetXVals = [margin, pageWidth - margin];
  const targetYVals = [margin, pageHeight - margin];

  for (const targetX of targetXVals) {
    if (Math.abs(activeBounds.minX - targetX) < threshold) {
      snapped.minX = targetX;
      snapped.maxX = snapped.minX + width;
      guides.push({ id: `guide-margin-v-${targetX}`, type: "vertical", position: targetX, kind: "margin" });
    } else if (Math.abs(activeBounds.maxX - targetX) < threshold) {
      snapped.maxX = targetX;
      snapped.minX = snapped.maxX - width;
      guides.push({ id: `guide-margin-v-${targetX}`, type: "vertical", position: targetX, kind: "margin" });
    }
  }

  for (const targetY of targetYVals) {
    if (Math.abs(activeBounds.minY - targetY) < threshold) {
      snapped.minY = targetY;
      snapped.maxY = snapped.minY + height;
      guides.push({ id: `guide-margin-h-${targetY}`, type: "horizontal", position: targetY, kind: "margin" });
    } else if (Math.abs(activeBounds.maxY - targetY) < threshold) {
      snapped.maxY = targetY;
      snapped.minY = snapped.maxY - height;
      guides.push({ id: `guide-margin-h-${targetY}`, type: "horizontal", position: targetY, kind: "margin" });
    }
  }

  // 3. Element Alignment Snap
  for (let i = 0; i < otherElementsBounds.length; i++) {
    const other = otherElementsBounds[i];
    const otherCenterX = other.minX + (other.maxX - other.minX) / 2;
    const otherCenterY = other.minY + (other.maxY - other.minY) / 2;

    // X Alignment
    if (Math.abs(activeBounds.minX - other.minX) < threshold) {
      snapped.minX = other.minX;
      snapped.maxX = snapped.minX + width;
      guides.push({ id: `guide-elem-v-l-${i}`, type: "vertical", position: other.minX, kind: "element" });
    } else if (Math.abs(activeCenterX - otherCenterX) < threshold) {
      snapped.minX = otherCenterX - width / 2;
      snapped.maxX = snapped.minX + width;
      guides.push({ id: `guide-elem-v-c-${i}`, type: "vertical", position: otherCenterX, kind: "element" });
    } else if (Math.abs(activeBounds.maxX - other.maxX) < threshold) {
      snapped.maxX = other.maxX;
      snapped.minX = snapped.maxX - width;
      guides.push({ id: `guide-elem-v-r-${i}`, type: "vertical", position: other.maxX, kind: "element" });
    }

    // Y Alignment
    if (Math.abs(activeBounds.minY - other.minY) < threshold) {
      snapped.minY = other.minY;
      snapped.maxY = snapped.minY + height;
      guides.push({ id: `guide-elem-h-b-${i}`, type: "horizontal", position: other.minY, kind: "element" });
    } else if (Math.abs(activeCenterY - otherCenterY) < threshold) {
      snapped.minY = otherCenterY - height / 2;
      snapped.maxY = snapped.minY + height;
      guides.push({ id: `guide-elem-h-c-${i}`, type: "horizontal", position: otherCenterY, kind: "element" });
    } else if (Math.abs(activeBounds.maxY - other.maxY) < threshold) {
      snapped.maxY = other.maxY;
      snapped.minY = snapped.maxY - height;
      guides.push({ id: `guide-elem-h-t-${i}`, type: "horizontal", position: other.maxY, kind: "element" });
    }
  }

  return { snappedBounds: snapped, guides };
}
