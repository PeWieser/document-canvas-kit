import { expect, test, describe } from "vitest";
import {
  tokenizeStream,
  filterRedactedText,
  createInitialGraphicsState,
} from "../../lib/pdf/ContentStreamEditor";

describe("ContentStreamEditor", () => {
  test("Tokenizer: Bekannter Byte-Stream → korrekte Token-Typen", () => {
    const data = new Uint8Array([0x28, 0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x29, 0x20, 0x54, 0x6a]); // (Hello) Tj
    const tokens = tokenizeStream(data);
    expect(tokens.length).toBe(3);
    expect(tokens[0].type).toBe("String");
    expect(new TextDecoder().decode(tokens[0].raw)).toBe("(Hello)");
    expect(tokens[1].type).toBe("Whitespace");
    expect(tokens[2].type).toBe("Operator");
    expect(tokens[2].text).toBe("Tj");
  });

  test("Redact-Filter: Zeichen in Box → entfernt, Zeichen außerhalb → bleibt", () => {
    const data = new TextEncoder().encode("1 0 0 1 100 100 Tm\n(Hello) Tj\n");
    const tokens = tokenizeStream(data);

    // Fully redacted
    let state = createInitialGraphicsState();
    let redacted = filterRedactedText(
      tokens,
      [{ x: 90, y: 90, x2: 200, y2: 120 }],
      undefined,
      state,
    );
    let resultTokens = redacted.filter((t) => t.type === "String" || t.type === "HexString");
    expect(resultTokens.length).toBe(0); // All text redacted

    // Partially redacted: x=100 to x=110 covers the first letter "H"
    const data2 = new TextEncoder().encode("1 0 0 1 100 100 Tm\n(Hello) Tj\n");
    const tokens2 = tokenizeStream(data2);
    state = createInitialGraphicsState();
    redacted = filterRedactedText(tokens2, [{ x: 100, y: 90, x2: 106, y2: 120 }], undefined, state);
    resultTokens = redacted.filter((t) => t.type === "String");
    expect(resultTokens.length).toBe(1);

    // The string "ello" should remain, "H" is redacted
    const text = new TextDecoder("latin1").decode(resultTokens[0].raw);
    expect(text).toContain("ello");
    expect(text).not.toContain("Hello");
  });
});
