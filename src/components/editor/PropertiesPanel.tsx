import React from "react";
import { VectorElement } from "../../lib/pdf/types";
import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";

export interface PropertiesPanelProps {
  selectedElement: VectorElement | any | null;
  onUpdateProperty: (key: string, value: any) => void;
  onDelete?: () => void;
  onBringToFront?: () => void;
  onSendToBack?: () => void;
  position?: { x: number; y: number };
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  selectedElement,
  onUpdateProperty,
  onDelete,
  onBringToFront,
  onSendToBack,
  position = { x: 20, y: 80 },
}) => {
  if (!selectedElement) return null;

  const bounds = selectedElement.bounds || {
    minX: selectedElement.x || 0,
    minY: selectedElement.y || 0,
    maxX: (selectedElement.x || 0) + (selectedElement.w || 0),
    maxY: (selectedElement.y || 0) + (selectedElement.h || 0),
  };

  const x = Math.round(bounds.minX);
  const y = Math.round(bounds.minY);
  const w = Math.round(bounds.maxX - bounds.minX);
  const h = Math.round(bounds.maxY - bounds.minY);

  const strokeColor = selectedElement.strokeColor || "#3b82f6";
  const fillColor = selectedElement.fillColor || "#ffffff";
  const strokeWidth = selectedElement.strokeWidth ?? 1.5;
  const opacity = Math.round((selectedElement.opacity ?? 1) * 100);
  const rotation = selectedElement.rotation ?? 0;
  const zIndex = selectedElement.zIndex ?? 1;

  const handleBoundsChange = (key: "x" | "y" | "w" | "h", val: number) => {
    let newMinX = bounds.minX;
    let newMinY = bounds.minY;
    let newMaxX = bounds.maxX;
    let newMaxY = bounds.maxY;

    if (key === "x") {
      const currentW = bounds.maxX - bounds.minX;
      newMinX = val;
      newMaxX = val + currentW;
    } else if (key === "y") {
      const currentH = bounds.maxY - bounds.minY;
      newMinY = val;
      newMaxY = val + currentH;
    } else if (key === "w") {
      newMaxX = bounds.minX + Math.max(val, 1);
    } else if (key === "h") {
      newMaxY = bounds.minY + Math.max(val, 1);
    }

    onUpdateProperty("bounds", { minX: newMinX, minY: newMinY, maxX: newMaxX, maxY: newMaxY });
  };

  return (
    <div
      data-testid="properties-panel"
      className="fixed z-50 w-72 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl p-4 text-xs font-sans text-zinc-800 dark:text-zinc-200"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
    >
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2 mb-3">
        <span className="font-semibold text-sm">Vector Inspector</span>
        <div className="flex items-center gap-1">
          {onBringToFront && (
            <button
              onClick={onBringToFront}
              title="Bring to Front"
              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          )}
          {onSendToBack && (
            <button
              onClick={onSendToBack}
              title="Send to Back"
              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              title="Delete Element"
              className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Geometry Grid (X, Y, W, H) */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-zinc-500 text-[10px] uppercase font-bold block mb-1">X Position</label>
          <input
            type="number"
            value={x}
            onChange={(e) => handleBoundsChange("x", parseFloat(e.target.value) || 0)}
            className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-zinc-500 text-[10px] uppercase font-bold block mb-1">Y Position</label>
          <input
            type="number"
            value={y}
            onChange={(e) => handleBoundsChange("y", parseFloat(e.target.value) || 0)}
            className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-zinc-500 text-[10px] uppercase font-bold block mb-1">Width</label>
          <input
            type="number"
            value={w}
            onChange={(e) => handleBoundsChange("w", parseFloat(e.target.value) || 1)}
            className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-zinc-500 text-[10px] uppercase font-bold block mb-1">Height</label>
          <input
            type="number"
            value={h}
            onChange={(e) => handleBoundsChange("h", parseFloat(e.target.value) || 1)}
            className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Rotation & Opacity */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="text-zinc-500 text-[10px] uppercase font-bold block mb-1">Rotation (°)</label>
          <input
            type="number"
            value={rotation}
            min={0}
            max={360}
            onChange={(e) => onUpdateProperty("rotation", parseFloat(e.target.value) || 0)}
            className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-zinc-500 text-[10px] uppercase font-bold block mb-1">Opacity (%)</label>
          <input
            type="number"
            value={opacity}
            min={0}
            max={100}
            onChange={(e) => onUpdateProperty("opacity", (parseFloat(e.target.value) || 100) / 100)}
            className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Colors & Stroke */}
      <div className="space-y-2 mb-3 border-t border-zinc-200 dark:border-zinc-800 pt-3">
        <div className="flex items-center justify-between">
          <label className="text-zinc-500 text-[10px] uppercase font-bold">Stroke Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={strokeColor.startsWith("#") ? strokeColor : "#3b82f6"}
              onChange={(e) => onUpdateProperty("strokeColor", e.target.value)}
              className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
            />
            <input
              type="text"
              value={strokeColor}
              onChange={(e) => onUpdateProperty("strokeColor", e.target.value)}
              className="w-20 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-1 py-0.5 text-[10px]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-zinc-500 text-[10px] uppercase font-bold">Fill Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={fillColor.startsWith("#") ? fillColor : "#ffffff"}
              onChange={(e) => onUpdateProperty("fillColor", e.target.value)}
              className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
            />
            <input
              type="text"
              value={fillColor}
              onChange={(e) => onUpdateProperty("fillColor", e.target.value)}
              className="w-20 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-1 py-0.5 text-[10px]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="text-zinc-500 text-[10px] uppercase font-bold">Stroke Width</label>
          <input
            type="number"
            value={strokeWidth}
            min={0}
            step={0.5}
            onChange={(e) => onUpdateProperty("strokeWidth", parseFloat(e.target.value) || 0)}
            className="w-16 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center justify-between">
          <label className="text-zinc-500 text-[10px] uppercase font-bold">Z-Index</label>
          <input
            type="number"
            value={zIndex}
            min={0}
            onChange={(e) => onUpdateProperty("zIndex", parseInt(e.target.value, 10) || 0)}
            className="w-16 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
};
