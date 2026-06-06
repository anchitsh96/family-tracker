// Validation harness — runs the INDmoney Holdings XLS parser against
// fixtures in ./fixtures. Real reports go in `*.dev.xls` (gitignored,
// contain PII); the anonymized `holdings.anon.xls` provides a
// deterministic check in source control.
//
// Run with: npx esbuild --bundle src/parsers/indmoney-holdings-xls/_validate.ts \
//             --platform=node --target=node20 --outfile=/tmp/v.js --alias:@=./src
//           && node /tmp/v.js

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { IndmoneyHoldingsXlsParser } from './IndmoneyHoldingsXlsParser';

async function run(label: string, path: string) {
  if (!existsSync(path)) {
    console.log(`[${label}] missing: ${path}`);
    return;
  }
  const buf = readFileSync(path);
  const bytes = new Uint8Array(buf);

  const score = await IndmoneyHoldingsXlsParser.detect({
    type: 'xlsx',
    filename: path,
    bytes,
  });
  console.log(`\n=== [${label}] detect: ${score} ===`);

  const result = await IndmoneyHoldingsXlsParser.parse({
    type: 'xlsx',
    filename: path,
    bytes,
  });
  if (!result.ok) {
    console.log(`[${label}] FAILED: ${result.code} — ${result.message}`);
    return;
  }
  const b = result.bundles[0]!;
  console.log(
    `[${label}] ${b.account.nickname} (${b.account.currency}) · last4=${
      b.account.accountNumberLast4 ?? '-'
    } · ${b.holdings.length} holdings`
  );
  let sum = 0;
  for (const h of b.holdings) {
    const usd = h.valueNative?.toFixed(2) ?? '?';
    console.log(
      `  ${h.instrumentName.padEnd(6)}  qty=${(h.quantity ?? 0)
        .toString()
        .padEnd(14)}  @ $${(h.unitPrice ?? 0).toFixed(4).padEnd(10)}  = $${usd}`
    );
    sum += h.valueNative ?? 0;
  }
  console.log(`[${label}] sum: $${sum.toFixed(2)}`);
  console.log(`[${label}] warnings: ${result.warnings.length}`);
  for (const w of result.warnings) console.log(`    [${w.code}] ${w.message}`);
}

async function main() {
  const candidates = [
    join(__dirname, 'fixtures'),
    join(process.cwd(), 'src/parsers/indmoney-holdings-xls/fixtures'),
  ];
  const dir = candidates.find((p) => existsSync(p));
  if (!dir) {
    console.log('No fixtures dir.');
    return;
  }
  const files = readdirSync(dir).filter(
    (f) => f.endsWith('.dev.xls') || f.endsWith('.anon.xls')
  );
  if (files.length === 0) {
    console.log('No fixtures found.');
    return;
  }
  for (const f of files) await run(f, join(dir, f));
}

void main();
