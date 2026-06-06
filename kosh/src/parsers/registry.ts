import { ParserOrchestrator } from './Orchestrator';
import { ZerodhaHoldingsXlsxParser } from './zerodha-holdings/ZerodhaHoldingsXlsxParser';
import { GrowwMfXlsxParser } from './groww-mf/GrowwMfXlsxParser';
import { CdslCasPdfParser } from './cdsl-cas-pdf/CdslCasPdfParser';
import { FisdomPmsPdfParser } from './fisdom-pms-pdf/FisdomPmsPdfParser';
import { IndmoneyDriveWealthPdfParser } from './indmoney-dw-pdf/IndmoneyDriveWealthPdfParser';
import { IndmoneyHoldingsXlsParser } from './indmoney-holdings-xls/IndmoneyHoldingsXlsParser';

let _orchestrator: ParserOrchestrator | null = null;

export function getOrchestrator(): ParserOrchestrator {
  if (_orchestrator) return _orchestrator;
  _orchestrator = new ParserOrchestrator();
  _orchestrator.register(ZerodhaHoldingsXlsxParser);
  _orchestrator.register(GrowwMfXlsxParser);
  _orchestrator.register(CdslCasPdfParser);
  _orchestrator.register(FisdomPmsPdfParser);
  _orchestrator.register(IndmoneyDriveWealthPdfParser);
  _orchestrator.register(IndmoneyHoldingsXlsParser);
  return _orchestrator;
}
