import { PadConfig, DeliveryTicket, RunRecord } from '../types';

export interface JobImportPackage {
  version: number;
  source?: string;
  exportedAt?: string;
  padId: string;
  config: PadConfig;
  deliveries: DeliveryTicket[];
  runs: RunRecord[];
}
