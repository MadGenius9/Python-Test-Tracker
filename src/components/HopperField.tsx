import { SiloDerivedState } from '../types';

interface HopperFieldProps {
  sides: { sideName: string; silos: SiloDerivedState[] }[];
  selectedSilo?: number | null;
  onSelect?: (siloNumber: number) => void;
}

export default function HopperField({ sides, selectedSilo, onSelect }: HopperFieldProps) {
  return (
    <div className="bg-[#121418] border border-[#2c3138] px-4 py-6">
      <div className="space-y-8">
        {sides.map(({ sideName, silos }) => (
          <div key={sideName}>
            <div className="mb-4 text-[11px] font-mono uppercase tracking-[0.22em] text-[#8b938c]">
              {sideName.toUpperCase().startsWith('SIDE') ? sideName.toUpperCase() : `Side ${sideName}`}
            </div>
            <div className="flex items-end gap-5 overflow-x-auto pb-2">
              {silos.map((silo) => {
                const fill = Math.max(4, Math.min(96, silo.percentFull || 0));
                const selected = selectedSilo === silo.siloNumber;
                return (
                  <button
                    key={silo.siloNumber}
                    type="button"
                    onClick={() => onSelect?.(silo.siloNumber)}
                    className={`group relative shrink-0 w-[150px] text-center ${selected ? 'opacity-100' : 'opacity-90 hover:opacity-100'}`}
                  >
                    <div className="pointer-events-none absolute -top-10 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap border border-[#2c3138] bg-[#0e1013] px-2 py-1 text-[10px] font-mono text-[#e7e1d6] group-hover:block">
                      {Math.round(silo.onHandLbs).toLocaleString()} lb · {silo.stagesLeft.toFixed(1)} stages
                    </div>
                    <svg viewBox="0 0 140 220" className="mx-auto h-52 w-[130px]">
                      <ellipse cx="70" cy="22" rx="42" ry="10" fill="#1c2128" stroke={selected ? '#d7c4a3' : '#3c444d'} />
                      <rect x="28" y="22" width="84" height="112" fill="#171b21" stroke={selected ? '#d7c4a3' : '#3c444d'} />
                      <path d="M28 134 L48 176 H92 L112 134 Z" fill="#14181e" stroke={selected ? '#d7c4a3' : '#3c444d'} />
                      <clipPath id={`steel-${silo.siloNumber}`}>
                        <rect x="32" y="28" width="76" height="104" />
                        <path d="M32 132 L50 170 H90 L108 132 Z" />
                      </clipPath>
                      <g clipPath={`url(#steel-${silo.siloNumber})`}>
                        <rect x="30" y={176 - fill * 1.4} width="80" height="150" fill="#c4a36a" />
                        <rect x="30" y={176 - fill * 1.4} width="80" height="6" fill="#e6d3a8" />
                      </g>
                      <path d="M40 176 L34 204 M100 176 L106 204 M34 204 H106" fill="none" stroke="#5c656e" strokeWidth="3" />
                    </svg>
                    <div className="mt-1 text-sm text-[#e7e1d6]">Silo {silo.siloNumber}</div>
                    <div className="font-mono text-sm text-[#d7c4a3]">{Math.round(silo.onHandLbs).toLocaleString()} lb</div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-[#8b938c]">{silo.sandType || 'Empty'} · {Math.round(fill)}%</div>
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
