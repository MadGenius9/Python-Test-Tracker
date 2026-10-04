import { SiloDerivedState } from '../types';

interface HopperFieldProps {
  sides: { sideName: string; silos: SiloDerivedState[] }[];
  selectedSilo?: number | null;
  onSelect?: (siloNumber: number) => void;
}

export default function HopperField({ sides, selectedSilo, onSelect }: HopperFieldProps) {
  return (
    <div className="relative overflow-hidden border border-cyan-500/30 bg-[#070b12] px-3 py-6 shadow-[0_0_40px_rgba(34,211,238,0.08)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(34,211,238,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.05)_1px,transparent_1px)] bg-[size:28px_28px]" />
      <div className="relative space-y-8">
        {sides.map(({ sideName, silos }) => (
          <div key={sideName}>
            <div className="mb-3 text-[11px] font-mono uppercase tracking-[0.28em] text-cyan-300">
              {sideName.toUpperCase().startsWith('SIDE') ? sideName.toUpperCase() : `Side ${sideName}`}
            </div>
            <div className="flex items-end gap-4 overflow-x-auto pb-2">
              {silos.map((silo) => {
                const fill = Math.max(6, Math.min(94, silo.percentFull || 0));
                const selected = selectedSilo === silo.siloNumber;
                return (
                  <button
                    key={silo.siloNumber}
                    type="button"
                    onClick={() => onSelect?.(silo.siloNumber)}
                    className={`group relative shrink-0 w-[132px] border px-2 py-3 text-center transition cursor-pointer ${
                      selected
                        ? 'border-fuchsia-400 bg-fuchsia-500/10 shadow-[0_0_24px_rgba(217,70,239,0.35)]'
                        : 'border-cyan-500/20 bg-black/40 hover:border-cyan-300'
                    }`}
                  >
                    {/* Hover tooltip showing pounds remaining and stages left */}
                    <div className="pointer-events-none absolute -top-11 left-1/2 -translate-x-1/2 z-30 opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 transition-all duration-200 bg-[#070b12]/95 backdrop-blur-md border border-cyan-400 px-2.5 py-1 text-center whitespace-nowrap min-w-[90px] shadow-[0_0_15px_rgba(34,211,238,0.3)]">
                      <div className="text-[10px] font-mono font-bold text-cyan-100">
                        {Math.round(silo.onHandLbs).toLocaleString()} lbs remaining
                      </div>
                      <div className="text-[9px] font-mono text-fuchsia-300">
                        {silo.stagesLeft > 99 ? '>99' : silo.stagesLeft.toFixed(1)} stages left
                      </div>
                    </div>

                    <svg viewBox="0 0 120 190" className="mx-auto h-44 w-24">
                      {/* Top Cap */}
                      <ellipse
                        cx="60"
                        cy="18"
                        rx="34"
                        ry="8"
                        fill="#0e1724"
                        stroke={selected ? '#e879f9' : '#67e8f9'}
                        strokeWidth={selected ? 2 : 1.5}
                      />
                      {/* Silo Body */}
                      <path
                        d="M26 18 H94 V108 L76 146 H44 L26 108 Z"
                        fill="#0b1220"
                        stroke={selected ? '#e879f9' : '#155e75'}
                        strokeWidth={selected ? 2.5 : 1.4}
                      />
                      {/* Live Sand Fill */}
                      <clipPath id={`cyber-${silo.siloNumber}`}>
                        <path d="M30 24 H90 V106 L74 142 H46 L30 106 Z" />
                      </clipPath>
                      <g clipPath={`url(#cyber-${silo.siloNumber})`}>
                        <rect
                          x="28"
                          y={146 - fill * 1.15}
                          width="64"
                          height="130"
                          fill={silo.isOutOfService ? '#334155' : selected ? '#d946ef' : '#22d3ee'}
                          opacity="0.85"
                        />
                        <rect
                          x="28"
                          y={146 - fill * 1.15}
                          width="64"
                          height="8"
                          fill={selected ? '#f5d0fe' : '#f0abfc'}
                          opacity="0.85"
                        />
                      </g>
                      {/* Support Legs */}
                      <path
                        d="M36 146 L30 170 M84 146 L90 170 M30 170 H90"
                        fill="none"
                        stroke={selected ? '#e879f9' : '#67e8f9'}
                        strokeWidth="2"
                      />
                      {/* Percent on tank */}
                      <text
                        x="60"
                        y="78"
                        textAnchor="middle"
                        fontSize="14"
                        fontFamily="monospace"
                        fontWeight="bold"
                        fill="#ecfeff"
                      >
                        {Math.round(fill)}%
                      </text>
                    </svg>

                    <div className={`mt-1 text-sm font-mono ${selected ? 'text-fuchsia-300 font-bold' : 'text-cyan-100'}`}>
                      Silo {silo.siloNumber}
                    </div>
                    <div className="text-xs font-mono text-fuchsia-200">{Math.round(silo.onHandLbs).toLocaleString()} lb</div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-cyan-400">{silo.sandType || 'Empty'}</div>
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
