// Local / Standalone Job Import Service
// Imports job packages and restores sample University 40E data locally.

import { JobImportPackage } from '../types/import';
import { university40ePadConfig } from '../data/university40eData';
import { deliveriesChunk1 } from '../data/deliveriesChunk1';
import { deliveriesChunk2 } from '../data/deliveriesChunk2';
import { deliveriesChunk3 } from '../data/deliveriesChunk3';
import { university40eRuns } from '../data/runsData';
import {
  UNIVERSITY_40E_PAD_ID,
  calculateStageRecordFromRuns,
  createPad,
  savePadConfig,
} from './firestoreService';
import { StageRecord } from '../types';

export { UNIVERSITY_40E_PAD_ID };

export async function importJobPackage(
  pkg: JobImportPackage,
  onProgress?: (status: string, percent: number) => void
): Promise<{ padId: string; deliveriesCount: number; runsCount: number }> {
  const padId = pkg.padId || UNIVERSITY_40E_PAD_ID;
  if (onProgress) onProgress('Saving Pad Configuration...', 20);

  // Precompute stage records
  const stageRecords: Record<string, StageRecord> = {};
  const activeRunsByStage = new Map<string, typeof pkg.runs>();
  for (const r of pkg.runs) {
    if (r.deleted) continue;
    const stageKey = `${r.wellId}_stage_${r.stageNumber}`;
    if (!activeRunsByStage.has(stageKey)) {
      activeRunsByStage.set(stageKey, []);
    }
    activeRunsByStage.get(stageKey)!.push(r);
  }

  for (const [stageKey, runs] of activeRunsByStage.entries()) {
    const first = runs[0];
    stageRecords[stageKey] = calculateStageRecordFromRuns(
      pkg.config,
      first.wellId,
      first.stageNumber,
      runs,
      null,
      undefined,
      'history_backfill'
    );
  }

  if (onProgress) onProgress('Storing pad data...', 60);

  // Save to local storage
  const padRecord = {
    id: padId,
    config: pkg.config,
    deliveries: pkg.deliveries,
    deletedDeliveries: [],
    runs: pkg.runs,
    deletedRuns: [],
    stageRecords,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(`sandtracker_local_pad_v2_${padId}`, JSON.stringify(padRecord));
      const rawIndex = localStorage.getItem('sandtracker_local_pads_index_v2');
      const index: { id: string; name: string }[] = rawIndex ? JSON.parse(rawIndex) : [];
      const existing = index.find((p) => p.id === padId);
      if (existing) {
        existing.name = pkg.config.padName || padId;
      } else {
        index.push({ id: padId, name: pkg.config.padName || padId });
      }
      localStorage.setItem('sandtracker_local_pads_index_v2', JSON.stringify(index));
    } catch (e) {
      console.warn('Error saving imported pad to localStorage:', e);
    }
  }

  // Trigger state update
  await savePadConfig(padId, pkg.config);

  if (onProgress) onProgress('Import complete!', 100);

  return {
    padId,
    deliveriesCount: pkg.deliveries.length,
    runsCount: pkg.runs.length,
  };
}

export async function restoreUniversity40E(
  onProgress?: (status: string, percent: number) => void
): Promise<{ padId: string; deliveriesCount: number; runsCount: number }> {
  const allDeliveries = [
    ...deliveriesChunk1,
    ...deliveriesChunk2,
    ...deliveriesChunk3,
  ];

  const pkg: JobImportPackage = {
    version: 1,
    source: 'University 40E SandTracker Data Restore',
    exportedAt: new Date().toISOString(),
    padId: UNIVERSITY_40E_PAD_ID,
    config: university40ePadConfig,
    deliveries: allDeliveries,
    runs: university40eRuns,
  };

  return await importJobPackage(pkg, onProgress);
}
