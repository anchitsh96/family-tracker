// Validation harness — runs the Fisdom parser against BOTH dev fixtures:
//   - apr2026.fisdom.dev.txt          (pdftotext -raw output, row-major)
//   - apr2026.fisdom.pdfkit.dev.txt   (iOS PDFKit .string output, column-major)
// Both should produce identical holdings + totals.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { FisdomPmsPdfParser } from './FisdomPmsPdfParser';

async function run(label: string, fixture: string) {
  const txtPath = join(__dirname, 'fixtures', fixture);
  if (!existsSync(txtPath)) {
    console.log(`[${label}] fixture missing: ${txtPath}`);
    return;
  }
  const text = readFileSync(txtPath, 'utf-8');
  const bytes = new TextEncoder().encode(text);

  const score = await FisdomPmsPdfParser.detect({
    type: 'pdf',
    filename: fixture,
    bytes,
    textPreview: text,
  });
  console.log(`\n=== [${label}] detect score: ${score} ===`);

  const result = await FisdomPmsPdfParser.parse({
    type: 'pdf',
    filename: fixture,
    bytes,
    textPreview: text,
  });
  if (!result.ok) {
    console.log(`[${label}] FAILED: ${result.code} — ${result.message}`);
    return;
  }
  const bundle = result.bundles[0]!;
  const holdings = bundle.holdings;
  console.log(`[${label}] holdings: ${holdings.length}`);
  for (const h of holdings) {
    console.log(`  ${h.instrumentName} → ₹${h.valueInr.toFixed(2)} (${h.rowMeta?.assetClass})`);
  }
  const sumValue = holdings.reduce((s, h) => s + h.valueInr, 0);
  console.log(`[${label}] sum: ₹${sumValue.toFixed(2)} | stated total: ₹${bundle.totals?.presentValueInr ?? '?'}`);
  console.log(`[${label}] warnings: ${result.warnings.length}`);
  for (const w of result.warnings) console.log(`    [${w.code}] ${w.message}`);
}

async function main() {
  await run('pdftotext-raw', 'apr2026.fisdom.dev.txt');
  await run('PDFKit', 'apr2026.fisdom.pdfkit.dev.txt');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
