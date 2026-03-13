import React from 'react';

interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  color?: 'red' | 'yellow' | 'cyan' | 'purple';
}

export const Switch: React.FC<SwitchProps> = ({ label, checked, onChange, color = 'cyan' }) => {
  const colorClasses = {
    red: 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]',
    yellow: 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]',
    cyan: 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]',
    purple: 'bg-purple-500 shadow-[0_0_10px_rgba(139,92,246,0.5)]',
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`w-12 h-6 rounded-full p-1 transition-all duration-300 relative ${checked ? colorClasses[color] : 'bg-white/10'}`}
      >
        <div 
          className={`w-4 h-4 bg-white rounded-full transition-all duration-300 transform ${checked ? 'translate-x-6' : 'translate-x-0'}`}
        />
      </button>
    </div>
  );
};
