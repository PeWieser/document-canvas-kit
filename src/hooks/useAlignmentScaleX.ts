import { useState, useLayoutEffect, useEffect, useRef, RefObject } from "react";

export interface UseAlignmentScaleXOptions {
  initialScaleX?: number;
  targetWidth?: number;
  text?: string;
  fontSpec?: string;
  enabled?: boolean;
}

/**
 * Custom hook managing predicted scaleX factor without visual jitter.
 */
export function useAlignmentScaleX(
  elementRefOrOptions: RefObject<HTMLElement | HTMLTextAreaElement | null> | UseAlignmentScaleXOptions | number,
  optionsOrText?: UseAlignmentScaleXOptions | string,
  fontSpec?: string,
  initialScaleXParam: number = 1
): number {
  let elementRef: RefObject<HTMLElement | HTMLTextAreaElement | null> | null = null;
  let initialScaleX = initialScaleXParam;
  let targetWidth: number | undefined;
  let text: string | undefined;
  let currentFontSpec: string | undefined = fontSpec;
  let enabled = true;

  if (
    elementRefOrOptions &&
    typeof elementRefOrOptions === "object" &&
    "current" in elementRefOrOptions
  ) {
    elementRef = elementRefOrOptions as RefObject<HTMLElement | HTMLTextAreaElement | null>;
    if (typeof optionsOrText === "object") {
      const opts = optionsOrText as UseAlignmentScaleXOptions;
      initialScaleX = opts.initialScaleX ?? initialScaleXParam;
      targetWidth = opts.targetWidth;
      text = opts.text;
      currentFontSpec = opts.fontSpec ?? fontSpec;
      enabled = opts.enabled ?? true;
    } else if (typeof optionsOrText === "string") {
      text = optionsOrText;
    }
  } else if (typeof elementRefOrOptions === "object") {
    const opts = elementRefOrOptions as UseAlignmentScaleXOptions;
    initialScaleX = opts.initialScaleX ?? 1;
    targetWidth = opts.targetWidth;
    text = opts.text;
    currentFontSpec = opts.fontSpec;
    enabled = opts.enabled ?? true;
  } else if (typeof elementRefOrOptions === "number") {
    targetWidth = elementRefOrOptions;
    if (typeof optionsOrText === "string") {
      text = optionsOrText;
    }
  }

  const [scaleX, setScaleX] = useState<number>(initialScaleX);
  const prevInitialRef = useRef(initialScaleX);

  useEffect(() => {
    if (Math.abs(prevInitialRef.current - initialScaleX) > 0.0001) {
      prevInitialRef.current = initialScaleX;
      setScaleX(initialScaleX);
    }
  }, [initialScaleX]);

  const useIsomorphicLayoutEffect =
    typeof window !== "undefined" ? useLayoutEffect : useEffect;

  useIsomorphicLayoutEffect(() => {
    if (!enabled || targetWidth === undefined || targetWidth <= 0) return;

    let cancelled = false;

    const measureAndSetScale = () => {
      let unscaledWidth = 0;

      if (elementRef?.current) {
        unscaledWidth = elementRef.current.scrollWidth;
      }

      if (text !== undefined && currentFontSpec && typeof document !== "undefined") {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.font = currentFontSpec;
            const measured = ctx.measureText(text).width;
            if (measured > 0) {
              unscaledWidth = measured;
            }
          }
        } catch {
          /* ignore */
        }
      }

      if (unscaledWidth > 0 && targetWidth > 0) {
        const computed = targetWidth / unscaledWidth;
        if (Math.abs(computed - scaleX) > 0.001) {
          setScaleX(computed);
        }
      }
    };

    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.ready.then(() => {
        if (!cancelled) {
          measureAndSetScale();
        }
      });
    } else {
      measureAndSetScale();
    }

    return () => {
      cancelled = true;
    };
  }, [text, targetWidth, currentFontSpec, enabled, scaleX]);

  return scaleX;
}
