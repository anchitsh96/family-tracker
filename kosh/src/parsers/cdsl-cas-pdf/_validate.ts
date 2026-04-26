// Standalone validation harness — `npx tsx _validate.ts`
// Reads the real CAS dev fixture and prints what the parser extracts.
// Not part of the runtime app. Useful while iterating on the parser logic
// before the native PDF text extractor is wired in.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CdslCasPdfParser } from './CdslCasPdfParser';

async function main() {
  const txtPath = join(__dirname, 'fixtures', 'mar2026.cas.dev.txt');
  const text = readFileSync(txtPath, 'utf-8');
  const bytes = new TextEncoder().encode(text);

  const score = await CdslCasPdfParser.detect({
    type: 'pdf',
    filename: 'mar2026.cas.dev.txt',
    bytes,
    textPreview: text,
  });
  console.log('detect score:', score);

  const result = await CdslCasPdfParser.parse({
    type: 'pdf',
    filename: 'mar2026.cas.dev.txt',
    bytes,
    textPreview: text,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
