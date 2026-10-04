import { SiloDerivedState } from '../types';

interface HopperFieldProps {
  sides: { sideName: string; silos: SiloDerivedState[] }[];
  selectedSilo?: number | null;
  onSelect?: (siloNumber: number) => void;
}

export default function HopperField({ sides, selectedSilo, onSelect }: HopperFieldProps) {
  return (
    <div className="relative min-h-[560px] rounded-xl border border-[#2a313b] bg-[#090a0c] px-3 py-8 sm:px-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'linear-gradient(rgba(42,49,59,0.45) 1px, transparent 1px), linear-gradient(90deg, rgba(42,49,59,0.45) 1px, transparent 1px)',
          backgroundSize: '36px 36px',
        }}
      />
      <div className="relative space-y-10">
        {sides.map(({ sideName, silos }) => (
          <div key={sideName} className="flex items-end gap-4">
            <div className="w-16 shrink-0 pb-8 text-[12px] font-mono uppercase tracking-[0.2em] text-[#9aa3ad]">
              {sideName.toUpperCase().startsWith('SIDE') ? sideName.toUpperCase() : `Side ${sideName}`}
            </div>
            <div className="flex flex-1 items-end justify-between gap-2 overflow-x-auto">
              {silos.map((silo) => {
                const fill = Math.max(8, Math.min(92, silo.percentFull || 0));
                const selected = selectedSilo === silo.siloNumber;
                const pile = 108 - fill * 0.7;
                return (
                  <button
                    key={silo.siloNumber}
                    type="button"
                    onClick={() => onSelect?.(silo.siloNumber)}
                    className="shrink-0 w-[120px] text-center"
                  >
                    <svg viewBox="0 0 140 210" className="mx-auto h-52 w-[118px] drop-shadow-lg">
                      <ellipse cx="70" cy="24" rx="42" ry="10" fill="#1a1e24" stroke={selected ? '#e25a4a' : '#4a5562'} strokeWidth={selected ? 3 : 1.5} />
                      <path d="M30 22 h80" stroke={selected ? '#e25a4a' : '#6b7682'} strokeWidth="3" />
                      <path d="M28 28 H112 V118 L94 158 H46 L28 118 Z" fill="#12151a" stroke={selected ? '#e25a4a' : '#3d4652'} strokeWidth={selected ? 3 : 1.5} />
                      <path d="M36 112 L48 152 H92 L104 112 Z" fill="#0c0e12" />
                      <polygon points={`40,${pile + 18} 70,${pile - 16} 100,${pile + 18}`} fill={silo.isOutOfService ? '#2a313b' : '#c6a15a'} />
                      <polygon points={`48,${pile + 16} 70,${pile - 4} 92,${pile + 16}`} fill="#e2c27a" opacity="0.55" />
                      <path d="M42 158 L34 188 M98 158 L106 188 M34 188 H106" fill="none" stroke="#5b6672" strokeWidth="3" />
                      <path d="M52 188 V198 M88 188 V198" stroke="#5b6672" strokeWidth="3" />
                    </svg>
                    <div className={`mt-1 text-sm font-mono ${selected ? 'text-[#e25a4a]' : 'text-[#e8ebe6]'}`}>
                      {silo.name && silo.name !== `Silo ${silo.siloNumber}` ? silo.name : `T-${String(silo.siloNumber).padStart(2, '0')}`}
                    </div>
                    <div className="text-xs font-mono text-[#d4a017]">{Math.round(silo.onHandLbs).toLocaleString()} lbs</div>
                    <div className="text-[10px] font-mono uppercase text-[#9aa3ad]">{silo.sandType || 'Empty'}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
