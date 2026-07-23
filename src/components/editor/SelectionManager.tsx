import React, { useState, useRef } from "react";
import { BoundingBox, HandlePosition, VectorElement } from "../../lib/pdf/types";

export interface SelectionManagerProps {
  selectedElements: VectorElement[];
  onUpdateBounds?: (id: string, newBounds: BoundingBox) => void;
  onUpdateRotation?: (id: string, newRotation: number) => void;
  onSelectionChange?: (selectedIds: string[]) => void;
  pageWidth: number;
  pageHeight: number;
  scale?: number;
  onDragMove?: (currentBounds: BoundingBox) => void;
}

export const SelectionManager: React.FC<SelectionManagerProps> = ({
  selectedElements,
  onUpdateBounds,
  onUpdateRotation,
  pageWidth,
  pageHeight,
  scale = 1,
  onDragMove,
}) => {
  const [activeHandle, setActiveHandle] = useState<HandlePosition | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialBoundsRef = useRef<BoundingBox | null>(null);

  if (!selectedElements || selectedElements.length === 0) return null;

  // Compute combined bounding box in PDF user space
  const combinedMinX = Math.min(...selectedElements.map((el) => el.bounds.minX));
  const combinedMinY = Math.min(...selectedElements.map((el) => el.bounds.minY));
  const combinedMaxX = Math.max(...selectedElements.map((el) => el.bounds.maxX));
  const combinedMaxY = Math.max(...selectedElements.map((el) => el.bounds.maxY));

  // Convert to Canvas / Screen space (Y inverted)
  const boxX = combinedMinX * scale;
  const boxY = (pageHeight - combinedMaxY) * scale;
  const boxW = Math.max((combinedMaxX - combinedMinX) * scale, 8);
  const boxH = Math.max((combinedMaxY - combinedMinY) * scale, 8);

  const rotation = selectedElements.length === 1 ? selectedElements[0].rotation || 0 : 0;

  const handles: { pos: HandlePosition; x: number; y: number; cursor: string }[] = [
    { pos: "nw", x: 0, y: 0, cursor: "nwse-resize" },
    { pos: "n", x: boxW / 2, y: 0, cursor: "ns-resize" },
    { pos: "ne", x: boxW, y: 0, cursor: "nesw-resize" },
    { pos: "e", x: boxW, y: boxH / 2, cursor: "ew-resize" },
    { pos: "se", x: boxW, y: boxH, cursor: "nwse-resize" },
    { pos: "s", x: boxW / 2, y: boxH, cursor: "ns-resize" },
    { pos: "sw", x: 0, y: boxH, cursor: "nesw-resize" },
    { pos: "w", x: 0, y: boxH / 2, cursor: "ew-resize" },
  ];

  const handlePointerDown = (e: React.PointerEvent, handle: HandlePosition | "move") => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    initialBoundsRef.current = {
      minX: combinedMinX,
      minY: combinedMinY,
      maxX: combinedMaxX,
      maxY: combinedMaxY,
    };
    setActiveHandle(handle === "move" ? null : handle);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !initialBoundsRef.current) return;

    const dx = (e.clientX - dragStartRef.current.x) / scale;
    const dy = (e.clientY - dragStartRef.current.y) / scale; // Screen dy (down is positive)
    const pdfDy = -dy; // PDF dy (up is positive)

    const orig = initialBoundsRef.current;
    let newMinX = orig.minX;
    let newMaxX = orig.maxX;
    let newMinY = orig.minY;
    let newMaxY = orig.maxY;

    if (activeHandle === null) {
      // Move drag
      newMinX += dx;
      newMaxX += dx;
      newMinY += pdfDy;
      newMaxY += pdfDy;
    } else if (activeHandle === "rotation") {
      // Rotation drag
      const centerX = boxX + boxW / 2;
      const centerY = boxY + boxH / 2;
      const rad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
      let deg = Math.round((rad * 180) / Math.PI + 90);
      if (deg < 0) deg += 360;

      selectedElements.forEach((el) => {
        onUpdateRotation?.(el.id, deg);
      });
      return;
    } else {
      // Resize drag
      if (activeHandle.includes("w")) newMinX += dx;
      if (activeHandle.includes("e")) newMaxX += dx;
      if (activeHandle.includes("n")) newMaxY += pdfDy;
      if (activeHandle.includes("s")) newMinY += pdfDy;
    }

    const currentBounds: BoundingBox = {
      minX: Math.min(newMinX, newMaxX - 1),
      minY: Math.min(newMinY, newMaxY - 1),
      maxX: Math.max(newMaxX, newMinX + 1),
      maxY: Math.max(newMaxY, newMinY + 1),
    };

    onDragMove?.(currentBounds);

    selectedElements.forEach((el) => {
      onUpdateBounds?.(el.id, currentBounds);
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setActiveHandle(null);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore if pointer capture already lost
    }
  };

  return (
    <div
      data-testid="selection-manager"
      className="absolute border-2 border-blue-600 pointer-events-auto cursor-move select-none z-20"
      style={{
        left: `${boxX}px`,
        top: `${boxY}px`,
        width: `${boxW}px`,
        height: `${boxH}px`,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: "center center",
      }}
      onPointerDown={(e) => handlePointerDown(e, "move")}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* 8 Resize Handles */}
      {handles.map(({ pos, x, y, cursor }) => (
        <div
          key={pos}
          data-testid={`handle-${pos}`}
          className="absolute w-3 h-3 bg-white border-2 border-blue-600 rounded-sm transform -translate-x-1/2 -translate-y-1/2 hover:scale-125 transition-transform"
          style={{
            left: `${x}px`,
            top: `${y}px`,
            cursor,
          }}
          onPointerDown={(e) => handlePointerDown(e, pos)}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      ))}

      {/* Rotation Handle */}
      <div
        className="absolute w-px h-5 bg-blue-600 left-1/2 transform -translate-x-1/2 -top-5"
      />
      <div
        data-testid="handle-rotation"
        className="absolute w-3.5 h-3.5 bg-white border-2 border-blue-600 rounded-full left-1/2 transform -translate-x-1/2 -top-8 cursor-grab active:cursor-grabbing hover:scale-125 transition-transform"
        onPointerDown={(e) => handlePointerDown(e, "rotation")}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
    </div>
  );
};
