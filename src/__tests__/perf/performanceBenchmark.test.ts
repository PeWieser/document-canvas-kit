import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useEditor } from "../../store/editorStore";
import { resolvePDFCoreFontName } from "../../lib/pdf/fontDetect";

describe("Autonomous Performance Benchmark Suite", () => {
  beforeEach(() => {
    useEditor.getState().loadDoc("perf_test.pdf", new Uint8Array([1, 2, 3]), 5, { w: 600, h: 800 });
  });

  afterEach(() => {
    useEditor.getState().closeDoc();
  });

  it("benchmarks 100 rapid tool switching transitions", () => {
    const tools = ["select", "pen", "highlight", "redact", "textbox", "textReplace"] as const;
    const start = performance.now();

    for (let i = 0; i < 100; i++) {
      useEditor.getState().setTool(tools[i % tools.length]);
    }

    const duration = performance.now() - start;
    console.log(`[PERF BENCHMARK] 100 tool switches completed in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(100); // Must execute under 100ms
  });

  it("benchmarks 200 high-frequency annotation state updates", () => {
    const store = useEditor.getState();

    // Add initial annotation
    store.addAnnotation({
      id: "perf-anno-1",
      kind: "textbox",
      page: 0,
      x: 50,
      y: 50,
      w: 200,
      h: 40,
      text: "Initial",
      fontSize: 12,
      color: "#000",
      fontFamily: "Arial",
      bold: false,
      italic: false,
    });

    const start = performance.now();
    for (let i = 0; i < 200; i++) {
      store.updateAnnotation("perf-anno-1", { x: 50 + i, y: 50 + i, text: `Frame ${i}` }, false);
    }
    const duration = performance.now() - start;

    console.log(`[PERF BENCHMARK] 200 annotation updates completed in ${duration.toFixed(2)}ms (${(duration / 200).toFixed(3)}ms/frame)`);
    expect(duration).toBeLessThan(150); // Under 150ms total (<0.75ms/frame)
  });

  it("benchmarks core font resolution throughput for 500 font queries", () => {
    const fontNames = ["Helvetica", "Times-Roman", "Courier-Bold", "F1_Garbage", "BCDEEE+Arial-BoldItalic"];
    const start = performance.now();

    for (let i = 0; i < 500; i++) {
      resolvePDFCoreFontName(fontNames[i % fontNames.length]);
    }

    const duration = performance.now() - start;
    console.log(`[PERF BENCHMARK] 500 font resolutions completed in ${duration.toFixed(2)}ms`);
    expect(duration).toBeLessThan(50); // Under 50ms total
  });
});
