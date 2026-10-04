import { SiloDerivedState } from '../types';

interface HopperFieldProps {
  sides: { sideName: string; silos: SiloDerivedState[] }[];
  selectedSilo?: number | null;
  onSelect?: (siloNumber: number) => void;
}

export default function HopperField({ sides, selectedSilo, onSelect }: HopperFieldProps) {
  return (
    <div className="relative overflow-hidden rounded-none border border-[#3a2a16] bg-[#050505] px-2 py-8 sm:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(212,160,23,0.16),transparent_42%)]" />
      <div className="relative space-y-12">
        {sides.map(({ sideName, silos }) => (
          <div key={sideName}>
            <div className="mb-3 text-[12px] font-mono uppercase tracking-[0.35em] text-[#d4a017]">
              {sideName.toUpperCase().startsWith('SIDE') ? sideName.toUpperCase() : `Side ${sideName}`}
            </div>
            <div className="flex items-end gap-3 overflow-x-auto pb-2">
              {silos.map((silo) => {
                const fill = Math.max(12, Math.min(90, silo.percentFull || 0));
                const selected = selectedSilo === silo.siloNumber;
                const pile = 132 - fill * 0.85;
                return (
                  <button
                    key={silo.siloNumber}
                    type="button"
                    onClick={() => onSelect?.(silo.siloNumber)}
                    className={`shrink-0 w-[148px] border px-2 pb-3 pt-2 text-center ${
                      selected ? 'border-[#e25a4a] bg-[#1a0c0b]' : 'border-[#2a2418] bg-[#0c0c0c] hover:border-[#d4a017]'
                    }`}
                  >
                    <svg viewBox="0 0 160 230" className="mx-auto h-64 w-[140px]">
                      <ellipse cx="80" cy="28" rx="48" ry="12" fill="#1c1c1c" stroke={selected ? '#e25a4a' : '#d4a017'} strokeWidth="2" />
                      <path d="M34 30 H126 V132 L106 176 H54 L34 132 Z" fill="#111" stroke={selected ? '#e25a4a' : '#6a5a32'} strokeWidth={selected ? 4 : 2} />
                      <path d="M44 128 L58 170 H102 L116 128 Z" fill="#0a0a0a" />
                      <polygon points={`46,${pile + 22} 80,${pile - 18} 114,${pile + 22}`} fill="#b8892d" />
                      <polygon points={`56,${pile + 16} 80,${pile} 104,${pile + 16}`} fill="#f0d48a" />
                      <path d="M48 176 L38 208 M112 176 L122 208 M38 208 H122" fill="none" stroke="#d4a017" strokeWidth="3" />
                    </svg>
                    <div className={`text-base font-mono ${selected ? 'text-[#e25a4a]' : 'text-[#f3efe4]'}`}>
                      Silo {silo.siloNumber}
                    </div>
                    <div className="text-sm font-mono text-[#f0d48a]">{Math.round(silo.onHandLbs).toLocaleString()} lb</div>
                    <div className="text-[11px] font-mono uppercase tracking-widest text-[#d4a017]">{silo.sandType || 'Empty'}</div>
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
