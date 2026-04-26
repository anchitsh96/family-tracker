import { Parser, ParserInput, ParserResult } from '@/types/parser';

function failed(name: string, code: string, message: string): ParserResult {
  return { ok: false, parser: { name, version: '0' }, code, message, warnings: [] };
}

export class ParserOrchestrator {
  private parsers: Parser[] = [];

  register(p: Parser) {
    this.parsers.push(p);
  }

  list(): Parser[] {
    return [...this.parsers];
  }

  async parse(input: ParserInput): Promise<ParserResult> {
    const candidates = this.parsers.filter((p) => p.inputType === input.type);
    if (candidates.length === 0) {
      return failed('orchestrator', 'NO_PARSER_FOR_TYPE', `No parser for input type ${input.type}`);
    }
    const scored = await Promise.all(
      candidates.map(async (p) => ({ parser: p, score: await p.detect(input) }))
    );
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best || best.score < 0.5) {
      return failed('orchestrator', 'NO_PARSER_MATCHED', 'No parser recognized this file');
    }
    return best.parser.parse(input);
  }
}
