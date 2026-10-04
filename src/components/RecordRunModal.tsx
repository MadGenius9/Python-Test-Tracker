import { X, Layers } from 'lucide-react';
import React, { useEffect } from 'react';
import RecordRunForm, { RecordRunPayload } from './RecordRunForm';
import { AppState } from '../types';

export interface RecordRunModalProps {
  isOpen: boolean;
  onClose: () => void;
  state: AppState;
  wellId: string;
  stageNumber: number;
  onRecordRun: (records: RecordRunPayload[]) => Promise<void> | void;
  onSuccess?: () => void;
}

export default function RecordRunModal({
  isOpen,
  onClose,
  state,
  wellId,
  stageNumber,
  onRecordRun,
  onSuccess,
}: RecordRunModalProps) {
  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const wellObj = state.config.wells.find((w) => w.id === wellId);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-slate-900 border-2 border-slate-700 rounded-3xl p-4 sm:p-6 md:p-8 max-w-4xl w-full text-white shadow-2xl space-y-6 my-auto max-h-[92vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-run-modal-title"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500 text-slate-950 p-2.5 sm:p-3 rounded-2xl font-black shrink-0">
              <Layers className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.5]" />
            </div>
            <div>
              <h2
                id="record-run-modal-title"
                className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white"
              >
                RECORD STAGE RUN
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                Log actual sand pulled from silos for{' '}
                <strong className="text-amber-400 font-bold">
                  {wellObj?.name || 'WELL'} STAGE #{stageNumber}
                </strong>
                .
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Form Body */}
        <RecordRunForm
          state={state}
          initialWellId={wellId}
          initialStageNumber={stageNumber}
          fixedTarget={true}
          isModal={true}
          onRecordRun={onRecordRun}
          onCancel={onClose}
          onSuccess={() => {
            if (onSuccess) onSuccess();
            onClose();
          }}
          submitButtonLabel={`RECORD RUN — ${wellObj?.name || 'WELL'} STAGE ${stageNumber}`}
        />
      </div>
    </div>
  );
}
