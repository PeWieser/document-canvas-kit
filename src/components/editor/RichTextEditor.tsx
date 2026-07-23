import React, { useRef, useEffect, useCallback } from "react";
import type { TextRun, ParagraphStyle } from "@/lib/pdf/paragraphGroup";
import { cn } from "@/lib/utils";

export interface RichTextEditorProps {
  initialRuns?: TextRun[];
  initialHtml?: string;
  initialText?: string;
  style?: ParagraphStyle;
  onChange?: (runs: TextRun[], html: string, plainText: string) => void;
  onBlur?: () => void;
  className?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
}

export function mergeTextRuns(runs: TextRun[]): TextRun[] {
  const merged: TextRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    if (merged.length === 0) {
      merged.push({ ...run });
    } else {
      const prev = merged[merged.length - 1];
      if (isSameStyle(prev, run)) {
        prev.text += run.text;
      } else {
        merged.push({ ...run });
      }
    }
  }
  return merged;
}

function isSameStyle(a: TextRun, b: TextRun): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    !!a.strikethrough === !!b.strikethrough &&
    !!a.superscript === !!b.superscript &&
    !!a.subscript === !!b.subscript &&
    a.fontFamily === b.fontFamily &&
    a.fontSize === b.fontSize &&
    a.color === b.color
  );
}

export function parseHtmlToTextRuns(input: string | HTMLElement): TextRun[] {
  let container: HTMLElement;
  if (typeof input === "string") {
    if (typeof document !== "undefined") {
      container = document.createElement("div");
      container.innerHTML = input;
    } else {
      return [{ text: input.replace(/<[^>]+>/g, "") }];
    }
  } else {
    container = input;
  }

  const runs: TextRun[] = [];

  function walk(node: Node, currentStyle: TextRun) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue || "";
      if (text) {
        runs.push({ ...currentStyle, text });
      }
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement;
      const tag = elem.tagName.toLowerCase();

      if (tag === "br") {
        runs.push({ ...currentStyle, text: "\n" });
        return;
      }

      const style: TextRun = { ...currentStyle };

      // HTML Tags
      if (tag === "b" || tag === "strong") style.bold = true;
      if (tag === "i" || tag === "em") style.italic = true;
      if (tag === "u") style.underline = true;
      if (tag === "s" || tag === "strike" || tag === "del") style.strikethrough = true;
      if (tag === "sup") style.superscript = true;
      if (tag === "sub") style.subscript = true;

      // Inline CSS Styles
      if (elem.style) {
        if (elem.style.fontWeight === "bold" || parseInt(elem.style.fontWeight, 10) >= 600) {
          style.bold = true;
        }
        if (elem.style.fontStyle === "italic") style.italic = true;
        if (elem.style.textDecoration?.includes("underline")) style.underline = true;
        if (elem.style.textDecoration?.includes("line-through")) style.strikethrough = true;
        if (elem.style.verticalAlign === "super") style.superscript = true;
        if (elem.style.verticalAlign === "sub") style.subscript = true;
        if (elem.style.fontFamily) style.fontFamily = elem.style.fontFamily.replace(/['"]/g, "");
        if (elem.style.fontSize) {
          const fs = parseFloat(elem.style.fontSize);
          if (!isNaN(fs)) style.fontSize = fs;
        }
        if (elem.style.color) style.color = elem.style.color;
      }

      const isBlock = tag === "p" || tag === "div";
      if (isBlock && runs.length > 0) {
        const lastRun = runs[runs.length - 1];
        if (lastRun && !lastRun.text.endsWith("\n")) {
          runs.push({ text: "\n" });
        }
      }

      for (let i = 0; i < elem.childNodes.length; i++) {
        walk(elem.childNodes[i], style);
      }
    }
  }

  walk(container, {});
  return mergeTextRuns(runs);
}

export function runsToHtml(runs: TextRun[]): string {
  if (!runs || runs.length === 0) return "";
  return runs
    .map((run) => {
      let text = run.text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br>");
      if (run.italic) text = `<i>${text}</i>`;
      if (run.bold) text = `<b>${text}</b>`;
      if (run.underline) text = `<u>${text}</u>`;
      if (run.strikethrough) text = `<s>${text}</s>`;
      if (run.superscript) text = `<sup>${text}</sup>`;
      if (run.subscript) text = `<sub>${text}</sub>`;

      const styles: string[] = [];
      if (run.fontFamily) styles.push(`font-family: ${run.fontFamily}`);
      if (run.fontSize) styles.push(`font-size: ${run.fontSize}pt`);
      if (run.color) styles.push(`color: ${run.color}`);

      if (styles.length > 0) {
        text = `<span style="${styles.join("; ")}">${text}</span>`;
      }
      return text;
    })
    .join("");
}

export function RichTextEditor({
  initialRuns,
  initialHtml,
  initialText,
  style,
  onChange,
  onBlur,
  className,
  autoFocus = true,
  onKeyDown,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);

  // Initialize innerHTML
  useEffect(() => {
    if (!editorRef.current) return;
    if (initialHtml) {
      editorRef.current.innerHTML = initialHtml;
    } else if (initialRuns && initialRuns.length > 0) {
      editorRef.current.innerHTML = runsToHtml(initialRuns);
    } else if (initialText) {
      editorRef.current.innerText = initialText;
    }
  }, []);

  useEffect(() => {
    if (autoFocus && editorRef.current) {
      editorRef.current.focus();
    }
  }, [autoFocus]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const plainText = editorRef.current.innerText;
    const runs = parseHtmlToTextRuns(editorRef.current);
    onChange?.(runs, html, plainText);
  }, [onChange]);

  const textAlignClass = style?.alignment === "center"
    ? "text-center"
    : style?.alignment === "right"
    ? "text-right"
    : style?.alignment === "justify"
    ? "text-justify"
    : "text-left";

  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      className={cn(
        "outline-none ring-1 ring-primary/40 rounded p-1 min-h-[1.5em] focus:ring-2 focus:ring-primary bg-background/80 text-foreground",
        textAlignClass,
        className
      )}
      style={{
        lineHeight: style?.lineHeight || 1.2,
        fontSize: style?.fontSize ? `${style.fontSize}pt` : undefined,
        fontFamily: style?.fontFamily || undefined,
        color: style?.color || undefined,
      }}
    />
  );
}
