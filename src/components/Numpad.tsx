import { Delete, RotateCcw } from 'lucide-react';

interface NumpadProps {
  value: string;
  onChange: (newValue: string) => void;
  onAddAmount?: (amount: number) => void;
  label?: string;
}

export default function Numpad({ value, onChange, onAddAmount, label }: NumpadProps) {
  const handleDigit = (digit: string) => {
    if (value === '0') {
      onChange(digit);
    } else {
      onChange(value + digit);
    }
  };

  const handleBackspace = () => {
    if (value.length <= 1) {
      onChange('0');
    } else {
      onChange(value.slice(0, -1));
    }
  };

  const handleClear = () => {
    onChange('0');
  };

  const handleAddQuick = (amount: number) => {
    const currentNum = parseInt(value, 10) || 0;
    const newNum = currentNum + amount;
    onChange(newNum.toString());
  };

  return (
    <div className="bg-[#14171c] text-[#e8ebe6] p-3 sm:p-4 rounded-xl border border-[#2a313b] shadow-xl select-none">
      {label && <div className="text-[11px] font-mono uppercase tracking-wider text-[#9aa3ad] mb-2 px-1">{label}</div>}

      {/* Display box */}
      <div className="bg-[#0b0c0e] border border-[#2a313b] rounded-lg p-3 mb-3 text-right">
        <div className="text-2xl sm:text-3xl font-mono font-bold tracking-tight text-[#e8ebe6] overflow-x-auto whitespace-nowrap">
          {parseInt(value, 10) ? parseInt(value, 10).toLocaleString() : '0'}{' '}
          <span className="text-xs text-[#9aa3ad] font-sans font-normal ml-1">LBS</span>
        </div>
      </div>

      {/* Quick addition shortcuts */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          type="button"
          onClick={() => handleAddQuick(10000)}
          className="bg-[#1b2027] hover:bg-[#2a313b] active:bg-[#c23b32] text-[#e8ebe6] font-medium py-2.5 px-3 rounded-lg text-xs font-mono border border-[#2a313b] transition cursor-pointer"
        >
          +10,000 lbs
        </button>
        <button
          type="button"
          onClick={() => handleAddQuick(57000)}
          className="bg-[#1b2027] hover:bg-[#2a313b] active:bg-[#c23b32] text-[#e8ebe6] font-medium py-2.5 px-3 rounded-lg text-xs font-mono border border-[#2a313b] transition cursor-pointer"
        >
          +57,000 (1 Load)
        </button>
      </div>

      {/* Keypad Grid */}
      <div className="grid grid-cols-3 gap-2">
        {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => handleDigit(digit)}
            className="bg-[#1b2027] hover:bg-[#2a313b] active:bg-[#c23b32] text-[#e8ebe6] font-mono font-semibold text-xl sm:text-2xl py-3.5 rounded-lg border border-[#2a313b] shadow-sm transition active:scale-95 cursor-pointer min-h-[52px]"
          >
            {digit}
          </button>
        ))}

        <button
          type="button"
          onClick={handleClear}
          className="bg-[#1b2027] hover:bg-[#260e0c] active:bg-[#c23b32] text-[#e25a4a] font-mono text-xs font-medium py-3.5 rounded-lg border border-[#2a313b] flex flex-col items-center justify-center transition cursor-pointer min-h-[52px]"
        >
          <RotateCcw className="w-4 h-4 mb-0.5" />
          CLEAR
        </button>

        <button
          type="button"
          onClick={() => handleDigit('0')}
          className="bg-[#1b2027] hover:bg-[#2a313b] active:bg-[#c23b32] text-[#e8ebe6] font-mono font-semibold text-xl sm:text-2xl py-3.5 rounded-lg border border-[#2a313b] shadow-sm transition active:scale-95 cursor-pointer min-h-[52px]"
        >
          0
        </button>

        <button
          type="button"
          onClick={handleBackspace}
          className="bg-[#1b2027] hover:bg-[#2a313b] active:bg-[#c23b32] text-[#9aa3ad] active:text-[#e8ebe6] font-mono text-xs font-medium py-3.5 rounded-lg border border-[#2a313b] flex flex-col items-center justify-center transition cursor-pointer min-h-[52px]"
        >
          <Delete className="w-4 h-4 mb-0.5" />
          DEL
        </button>
      </div>
    </div>
  );
}
