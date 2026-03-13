import React, { useState, useEffect, useRef } from 'react';

interface KnobProps {
  label: string;
  value: number; // 0 to 100
  onChange: (val: number) => void;
  color?: string;
}

export const Knob: React.FC<KnobProps> = ({ label, value, onChange, color = "cyan" }) => {
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number>(0);
  const startValueRef = useRef<number>(0);

  const rotation = (value / 100) * 270 - 135;

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startYRef.current = e.clientY;
    startValueRef.current = value;
    document.body.style.cursor = 'ns-resize';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaY = startYRef.current - e.clientY;
      let newValue = startValueRef.current + deltaY;
      if (newValue < 0) newValue = 0;
      if (newValue > 100) newValue = 100;
      onChange(newValue);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = 'default';
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, onChange]);

  // Color mapping
  const colorMap: Record<string, string> = {
    cyan: '#06b6d4',
    pink: '#ec4899',
    orange: '#f97316',
    indigo: '#8b5cf6',
    green: '#10b981' // Emerald/Green for EDM
  };
  const activeHex = colorMap[color] || '#06b6d4';

  return (
    <div className="flex flex-col items-center gap-2 select-none group">
      <div 
        className="relative w-14 h-14 cursor-ns-resize"
        onMouseDown={handleMouseDown}
      >
        <svg viewBox="0 0 100 100" className="w-full h-full filter drop-shadow-lg">
           {/* Background Track */}
           <path d="M20,80 A 40,40 0 1,1 80,80" fill="none" stroke="#1f2937" strokeWidth="8" strokeLinecap="round" />
           {/* Active Track */}
           <path 
             d="M20,80 A 40,40 0 1,1 80,80" 
             fill="none" 
             stroke={activeHex} 
             strokeWidth="8" 
             strokeLinecap="round"
             strokeDasharray="188.5"
             strokeDashoffset={188.5 - (188.5 * (value / 100))}
             className={`transition-all duration-75 ${isDragging ? 'brightness-125' : ''}`}
           />
           {/* Knob Cap */}
           <g transform={`rotate(${rotation}, 50, 50)`}>
              <circle cx="50" cy="50" r="28" fill="#111827" stroke="#374151" strokeWidth="1" />
              <circle cx="50" cy="50" r="4" fill={activeHex} className={value > 0 ? 'opacity-100' : 'opacity-20'} />
              <rect x="48" y="22" width="4" height="8" rx="2" fill={activeHex} />
           </g>
        </svg>
      </div>
      <div className="text-center">
        <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider group-hover:text-gray-300 transition-colors">{label}</div>
      </div>
    </div>
  );
};