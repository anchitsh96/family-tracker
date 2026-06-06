// Validation harness — runs the INDmoney/DriveWealth parser against any
// dev fixtures present in ./fixtures. Real statement extracts go in
// `*.dev.txt` (gitignored — contain PII); a synthetic anonymized
// fixture in `*.anon.txt` provides a deterministic check that survives
// in source control.
//
// Run with: npx ts-node src/parsers/indmoney-dw-pdf/_validate.ts
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { IndmoneyDriveWealthPdfParser } from './IndmoneyDriveWealthPdfParser';

async function run(label: string, fixturePath: string) {
  if (!existsSync(fixturePath)) {
    console.log(`[${label}] fixture missing: ${fixturePath}`);
    return;
  }
  const text = readFileSync(fixturePath, 'utf-8');
  const bytes = new TextEncoder().encode(text);

  const score = await IndmoneyDriveWealthPdfParser.detect({
    type: 'pdf',
    filename: fixturePath,
    bytes,
    textPreview: text,
  });
  console.log(`\n=== [${label}] detect score: ${score} ===`);

  const result = await IndmoneyDriveWealthPdfParser.parse({
    type: 'pdf',
    filename: fixturePath,
    bytes,
    textPreview: text,
  });
  if (!result.ok) {
    console.log(`[${label}] FAILED: ${result.code} — ${result.message}`);
    return;
  }
  const bundle = result.bundles[0]!;
  const holdings = bundle.holdings;
  console.log(
    `[${label}] account: ${bundle.account.nickname} (${bundle.account.currency})`
  );
  console.log(`[${label}] holdings: ${holdings.length}`);
  for (const h of holdings) {
    const usd = h.valueNative?.toFixed(2) ?? '?';
    const sym = h.rowMeta?.symbol ?? '?';
    const sec = h.rowMeta?.subSection ?? '?';
    console.log(
      `  ${h.instrumentName} [${sym}] qty=${h.quantity} → $${usd} (${sec})`
    );
  }
  const sumUsd = holdings.reduce((s, h) => s + (h.valueNative ?? 0), 0);
  console.log(`[${label}] sum: $${sumUsd.toFixed(2)}`);
  console.log(`[${label}] warnings: ${result.warnings.length}`);
  for (const w of result.warnings) console.log(`    [${w.code}] ${w.message}`);
}

async function main() {
  // Resolve fixtures dir from the script location AND also as a fallback
  // relative to CWD (so bundled-and-run-from-/tmp invocations work).
  const candidates = [
    join(__dirname, 'fixtures'),
    join(process.cwd(), 'src/parsers/indmoney-dw-pdf/fixtures'),
  ];
  const dir = candidates.find((p) => existsSync(p));
  if (!dir) {
    console.log('No fixtures directory — nothing to validate.');
    return;
  }
  const files = readdirSync(dir).filter(
    (f) => f.endsWith('.dev.txt') || f.endsWith('.anon.txt')
  );
  if (files.length === 0) {
    console.log('No fixtures found.');
    return;
  }
  for (const f of files) {
    await run(f, join(dir, f));
  }
}

void main();
