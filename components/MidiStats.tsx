import React from 'react';
import { MidiData } from '../types';

interface MidiStatsProps {
  data: MidiData | null;
}

export const MidiStats: React.FC<MidiStatsProps> = ({ data }) => {
  if (!data) return null;

  const noteCount = data.notes.length;
  const pitches = data.notes.map(n => n.pitch);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);
  const range = maxPitch - minPitch;
  
  // Simple key detection (very basic)
  const pitchCounts: Record<number, number> = {};
  data.notes.forEach(n => {
    const p = n.pitch % 12;
    pitchCounts[p] = (pitchCounts[p] || 0) + 1;
  });
  
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const topNote = Object.entries(pitchCounts).sort((a, b) => b[1] - a[1])[0];
  const probableKey = topNote ? noteNames[parseInt(topNote[0])] : 'Unknown';

  return (
    <div className="p-4 bg-white/5 border border-white/10 rounded-xl space-y-3">
      <h4 className="text-[9px] font-black text-white/40 uppercase tracking-widest">Neural Analysis</h4>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <p className="text-[8px] text-gray-500 uppercase">Probable Key</p>
          <p className="text-xs font-bold text-cyan-400">{probableKey} Major/Minor</p>
        </div>
        <div className="space-y-1">
          <p className="text-[8px] text-gray-500 uppercase">Pitch Range</p>
          <p className="text-xs font-bold text-purple-400">{range} Semitones</p>
        </div>
        <div className="space-y-1">
          <p className="text-[8px] text-gray-500 uppercase">Note Density</p>
          <p className="text-xs font-bold text-emerald-400">{(noteCount / data.totalDuration).toFixed(1)} n/s</p>
        </div>
        <div className="space-y-1">
          <p className="text-[8px] text-gray-500 uppercase">Complexity</p>
          <p className="text-xs font-bold text-orange-400">{noteCount > 500 ? 'High' : 'Medium'}</p>
        </div>
      </div>
    </div>
  );
};
