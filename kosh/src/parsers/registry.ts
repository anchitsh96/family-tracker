import { ParserOrchestrator } from './Orchestrator';
import { ZerodhaHoldingsXlsxParser } from './zerodha-holdings/ZerodhaHoldingsXlsxParser';
import { GrowwMfXlsxParser } from './groww-mf/GrowwMfXlsxParser';

let _orchestrator: ParserOrchestrator | null = null;

export function getOrchestrator(): ParserOrchestrator {
  if (_orchestrator) return _orchestrator;
  _orchestrator = new ParserOrchestrator();
  _orchestrator.register(ZerodhaHoldingsXlsxParser);
  _orchestrator.register(GrowwMfXlsxParser);
  return _orchestrator;
}
