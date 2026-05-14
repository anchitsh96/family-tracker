// Standalone validation harness — `npx tsx _validate.ts`
// Reads the real CAS dev fixture and prints what the parser extracts.
// Not part of the runtime app. Useful while iterating on the parser logic
// before the native PDF text extractor is wired in.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CdslCasPdfParser } from './CdslCasPdfParser';

async function run(label: string, fixture: string) {
  const txtPath = join(__dirname, 'fixtures', fixture);
  try {
    const text = require('node:fs').readFileSync(txtPath, 'utf-8');
    const bytes = new TextEncoder().encode(text);
    const score = await CdslCasPdfParser.detect({
      type: 'pdf',
      filename: fixture,
      bytes,
      textPreview: text,
    });
    console.log(`\n=== [${label}] detect score: ${score} ===`);
    const result = await CdslCasPdfParser.parse({
      type: 'pdf',
      filename: fixture,
      bytes,
      textPreview: text,
    });
    if (!result.ok) {
      console.log(`[${label}] FAILED: ${result.code} — ${result.message}`);
      return;
    }
    let totalAcross = 0;
    for (const b of result.bundles) {
      const sum = b.holdings.reduce((s, h) => s + h.valueInr, 0);
      totalAcross += sum;
      console.log(
        `[${label}] ${b.account.bucket} (${b.account.nickname}): ${b.holdings.length} holdings, ₹${sum.toFixed(2)}`
      );
      for (const h of b.holdings) {
        console.log(`     ${h.instrumentName.slice(0, 60)} → ₹${h.valueInr.toFixed(2)}`);
      }
    }
    console.log(`[${label}] grand sum: ₹${totalAcross.toFixed(2)}`);
    console.log(`[${label}] warnings: ${result.warnings.length}`);
    for (const w of result.warnings) console.log(`    [${w.code}] ${w.message}`);
  } catch (e: any) {
    console.log(`[${label}] error: ${e.message}`);
  }
}

async function main() {
  await run('pdftotext-raw', 'mar2026.cas.dev.txt');
  await run('PDFKit', 'mar2026.cas.pdfkit.dev.txt');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
