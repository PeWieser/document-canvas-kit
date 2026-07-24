import React, { useState, useEffect } from "react";
import { Pipette, Palette } from "lucide-react";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    EyeDropper?: new () => {
      open: () => Promise<{ sRGBHex: string }>;
    };
  }
}

export interface ColorPickerWithEyedropperProps {
  value: string;
  onChange: (color: string) => void;
  swatches?: string[];
  className?: string;
  swatchSizeClassName?: string;
  showHexInput?: boolean;
  title?: string;
}

export function ColorPickerWithEyedropper({
  value,
  onChange,
  swatches,
  className,
  swatchSizeClassName = "h-4 w-4",
  showHexInput = false,
  title,
}: ColorPickerWithEyedropperProps) {
  const [hasEyedropper, setHasEyedropper] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "EyeDropper" in window && window.EyeDropper) {
      setHasEyedropper(true);
    }
  }, []);

  const handleEyedropper = async () => {
    if (typeof window !== "undefined" && "EyeDropper" in window && window.EyeDropper) {
      try {
        const eyeDropper = new window.EyeDropper();
        const result = await eyeDropper.open();
        if (result && result.sRGBHex) {
          onChange(result.sRGBHex);
        }
      } catch {
        // User cancelled eyedropper selection
      }
    }
  };

  const formattedHex = value.startsWith("#") ? value : "#3b82f6";

  return (
    <div className={cn("flex items-center gap-1.5", className)} title={title}>
      {swatches && swatches.length > 0 && (
        <div className="flex items-center gap-1">
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              className={cn(
                "rounded-full ring-offset-1 ring-offset-toolbar transition cursor-pointer",
                swatchSizeClassName,
                value.toLowerCase() === c.toLowerCase() ? "ring-2 ring-primary" : "ring-1 ring-white/30"
              )}
              style={{ background: c }}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-1">
        <label
          className={cn(
            "relative flex cursor-pointer items-center justify-center rounded-full ring-1 ring-white/30 transition hover:ring-white/60",
            swatchSizeClassName
          )}
          style={{ background: formattedHex }}
          title="Farbe wählen"
        >
          <Palette className="h-3 w-3 text-white mix-blend-difference pointer-events-none" />
          <input
            type="color"
            value={formattedHex}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </label>

        {hasEyedropper && (
          <button
            type="button"
            onClick={handleEyedropper}
            className="flex h-5 w-5 items-center justify-center rounded hover:bg-toolbar-accent text-muted-foreground hover:text-foreground transition cursor-pointer"
            title="Pipette / Eyedropper"
          >
            <Pipette className="h-3.5 w-3.5" />
          </button>
        )}

        {showHexInput && (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-20 bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded px-1 py-0.5 text-[10px] font-mono outline-none focus:ring-1 focus:ring-primary"
          />
        )}
      </div>
    </div>
  );
}
