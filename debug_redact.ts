import { tokenizeStream, filterRedactedText, createInitialGraphicsState } from './src/lib/pdf/ContentStreamEditor.ts';

const data = new TextEncoder().encode('1 0 0 1 100 100 Tm\n(Hello) Tj\n');
const tokens = tokenizeStream(data);
const state = createInitialGraphicsState();
const redacted = filterRedactedText(tokens, [{x: 100, y: 90, x2: 106, y2: 120}], undefined, state);

for (const t of redacted) {
  if (t.type === 'String' || t.type === 'Number' || t.type === 'Operator') {
    console.log(t.type, t.text || new TextDecoder().decode(t.raw));
  }
}
