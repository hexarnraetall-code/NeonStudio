
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ProcessingStatus, MidiData } from './types';
import { convertAudioToMidi, generateMidiFromText, cleanMidiData, remixMidi, improveAndExtendMidi, RemixStyles, GenerationOptions } from './services/geminiService';
import { audioPlayer } from './services/audioPlayer';
import { Visualizer, VisualizerTheme } from './components/Visualizer';
import { generateMidiFile } from './services/midiEncoder';
import { parseMidiFile } from './services/midiParser';
import { Knob } from './components/Knob';
import { Switch } from './components/Switch';
import { MidiStats } from './components/MidiStats';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'text' | 'audio' | 'upload'>('text');
  const [file, setFile] = useState<File | null>(null);
  const [midiFile, setMidiFile] = useState<File | null>(null);
  const [promptText, setPromptText] = useState("");
  
  // New State for Sliders
  const [noteCount, setNoteCount] = useState<number>(500);
  const [targetDuration, setTargetDuration] = useState<number>(30);
  
  const [midiData, setMidiData] = useState<MidiData | null>(null);
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [analysisText, setAnalysisText] = useState<string>("");
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [instrument, setInstrument] = useState<string>('piano');
  const [warmth, setWarmth] = useState(60);
  const [drive, setDrive] = useState(15);
  const [masterVolume, setMasterVolume] = useState(70);
  const [styles, setStyles] = useState<RemixStyles>({ dubstep: 0, edm: 0, rock: 0, chaos: 0 });
  const [visualSettings, setVisualSettings] = useState<{ theme: VisualizerTheme, is3D: boolean }>({ theme: 'neon', is3D: true });
  const [hellMode, setHellMode] = useState(false);
  const [chaoticMode, setChaoticMode] = useState(false);
  const [duetMode, setDuetMode] = useState(false);
  const [disableArpeggio, setDisableArpeggio] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);

  const STYLES = ['pop', 'rock', 'jazz', 'reggae', 'metal', 'blues', 'chopin', 'night club'];

  const startTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);
  const lastPlayedTimeRef = useRef<number>(0);

  useEffect(() => {
    audioPlayer.setParams(warmth / 100, drive / 100);
  }, [warmth, drive]);

  useEffect(() => {
    audioPlayer.setVolume(masterVolume);
  }, [masterVolume]);

  const handleStop = useCallback(() => {
    setIsPlaying(false);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = 0;
    setCurrentTime(0);
    audioPlayer.stopAll();
    lastPlayedTimeRef.current = 0;
  }, []);

  const playLoop = useCallback(() => {
    if (!midiData) return;
    const now = performance.now();
    const newTime = (now - startTimeRef.current) / 1000;
    
    if (newTime >= midiData.totalDuration) {
      handleStop();
      return;
    }
    
    setCurrentTime(newTime);
    
    // Play notes in current time slice
    const notes = midiData.notes;
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      if (note.startTime >= lastPlayedTimeRef.current && note.startTime < newTime) {
        audioPlayer.playNote(note).catch(err => console.error("Playback Error:", err));
      }
    }
    
    lastPlayedTimeRef.current = newTime;
    animationFrameRef.current = requestAnimationFrame(playLoop);
  }, [midiData, handleStop]);

  const togglePlay = () => {
    if (!midiData) return;
    if (isPlaying) {
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = 0;
      }
      audioPlayer.stopAll();
    } else {
      setIsPlaying(true);
      startTimeRef.current = performance.now() - (currentTime * 1000);
      lastPlayedTimeRef.current = currentTime;
      animationFrameRef.current = requestAnimationFrame(playLoop);
    }
  };

  const performAction = async (fn: () => Promise<MidiData>) => {
    setStatus(ProcessingStatus.CONVERTING);
    setAnalysisText("Analyzing musical structure and harmonic flow...");
    try {
      const data = await fn();
      setAnalysisText("Optimizing note density and removing artifacts...");
      const cleaned = cleanMidiData(data);
      setMidiData(cleaned);
      setStatus(ProcessingStatus.SUCCESS);
      setCurrentTime(0);
      lastPlayedTimeRef.current = 0;
      setAnalysisText("Neural analysis complete. Composition optimized.");
      setTimeout(() => setAnalysisText(""), 5000);
    } catch (e: any) {
      console.error(e);
      setStatus(ProcessingStatus.ERROR);
      const isRateLimit = e?.message?.includes('429') || e?.status === 429 || e?.code === 429;
      if (isRateLimit) {
        setAnalysisText("Rate limit exceeded. Please wait a moment and try again.");
      } else {
        setAnalysisText("Neural engine failure. Check parameters.");
      }
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#02040a] text-gray-200 overflow-hidden font-sans">
      {/* Header */}
      <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-black/40 backdrop-blur-2xl z-50">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-gradient-to-tr from-cyan-400 via-purple-500 to-pink-500 rounded-lg rotate-45 animate-pulse-glow shadow-[0_0_20px_rgba(6,182,212,0.4)]"></div>
          <span className="font-extrabold tracking-tighter text-xl uppercase bg-clip-text text-transparent bg-gradient-to-r from-white via-cyan-400 to-purple-400">Gemini Neon Studio</span>
        </div>
        
        <div className="flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
          <button 
            type="button"
            onClick={togglePlay} 
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${isPlaying ? 'bg-white text-black scale-110 shadow-[0_0_30px_rgba(255,255,255,0.4)]' : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'}`}
          >
            <span className="text-2xl">{isPlaying ? '⏸' : '▶'}</span>
          </button>
          <div className="font-mono text-sm tabular-nums tracking-[0.2em] text-cyan-400 bg-cyan-950/20 px-4 py-2 rounded-lg border border-cyan-500/20">
            {Math.floor(currentTime / 60)}:{(currentTime % 60).toFixed(2).padStart(5, '0')}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            type="button"
            onClick={() => {
              if (!midiData) return;
              const filtered = midiData.notes.filter(n => (n.part || 1) === 1);
              if (filtered.length === 0) return;
              const bytes = generateMidiFile(filtered);
              const blob = new Blob([bytes], { type: 'audio/midi' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = 'blue_notes.mid'; a.click();
            }} 
            disabled={!midiData || !midiData.notes.some(n => (n.part || 1) === 1)}
            className="text-[8px] font-black tracking-widest uppercase px-3 py-2 bg-blue-500 text-white rounded-lg hover:brightness-110 transition-all disabled:opacity-30"
          >
            Download Blue Notes
          </button>
          <button 
            type="button"
            onClick={() => {
              if (!midiData) return;
              const filtered = midiData.notes.filter(n => n.part === 2);
              if (filtered.length === 0) return;
              const bytes = generateMidiFile(filtered);
              const blob = new Blob([bytes], { type: 'audio/midi' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = 'orange_notes.mid'; a.click();
            }} 
            disabled={!midiData || !midiData.notes.some(n => n.part === 2)}
            className="text-[8px] font-black tracking-widest uppercase px-3 py-2 bg-orange-500 text-white rounded-lg hover:brightness-110 transition-all disabled:opacity-30"
          >
            Download Orange Notes
          </button>
          <button 
            type="button"
            onClick={() => {
              if (!midiData) return;
              const bytes = generateMidiFile(midiData.notes);
              const blob = new Blob([bytes], { type: 'audio/midi' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a'); a.href = url; a.download = 'neon_studio_export.mid'; a.click();
            }} 
            disabled={!midiData}
            className="text-[10px] font-black tracking-widest uppercase px-6 py-3 bg-white text-black rounded-lg hover:invert transition-all disabled:opacity-30"
          >
            Export MIDI
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Control Bar */}
        <aside className="w-80 border-r border-white/5 bg-[#05070f]/80 backdrop-blur-md p-6 space-y-8 overflow-y-auto">
          <section className="space-y-4">
            <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Engine Parameters</h3>
            
            <div className="space-y-6 bg-black/40 p-5 rounded-2xl border border-white/5">
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  <span>Target Duration</span>
                  <span className="text-cyan-400">{targetDuration}s</span>
                </div>
                <input 
                  type="range" min="5" max="120" step="5" 
                  value={targetDuration} onChange={e => setTargetDuration(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  <span>Note Density</span>
                  <span className="text-purple-400">{noteCount}</span>
                </div>
                <input 
                  type="range" min="50" max="2000" step="50" 
                  value={noteCount} onChange={e => setNoteCount(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                />
              </div>

              <div className="pt-2 border-t border-white/5">
                <Switch label="Disable Arpeggio" checked={disableArpeggio} onChange={setDisableArpeggio} color="cyan" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
              {(['text', 'audio', 'upload'] as const).map(t => (
                <button 
                  type="button"
                  key={t} onClick={() => setActiveTab(t)} 
                  className={`py-2 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === t ? 'bg-white/10 text-white shadow-inner' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  {t}
                </button>
              ))}
            </div>

            {activeTab === 'text' ? (
              <textarea 
                value={promptText} onChange={e => setPromptText(e.target.value)}
                className="w-full h-28 bg-black/60 border border-white/5 rounded-xl p-4 text-xs focus:border-cyan-500/50 outline-none resize-none placeholder:text-gray-600 transition-colors" 
                placeholder="Describe a musical vision... (e.g. 'Melancholy piano with high-energy glitch drums')" 
              />
            ) : (
              <div className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center hover:bg-white/5 relative group transition-all">
                <input type="file" onChange={e => e.target.files && (activeTab === 'audio' ? setFile(e.target.files[0]) : setMidiFile(e.target.files[0]))} className="absolute inset-0 opacity-0 cursor-pointer" />
                <span className="text-[10px] text-gray-500 group-hover:text-gray-300 font-bold uppercase overflow-hidden text-ellipsis whitespace-nowrap block">
                  {activeTab === 'audio' ? (file?.name || 'Drop Audio File') : (midiFile?.name || 'Drop MIDI File')}
                </span>
              </div>
            )}

            <button 
              type="button"
              onClick={() => {
                const options: GenerationOptions = { hellMode, chaoticMode, duetMode, style: selectedStyle || undefined, disableArpeggio };
                if(activeTab === 'text') performAction(() => generateMidiFromText(promptText, noteCount, targetDuration, options));
                if(activeTab === 'audio' && file) performAction(() => convertAudioToMidi(file, noteCount));
                if(activeTab === 'upload' && midiFile) performAction(() => parseMidiFile(midiFile));
              }}
              disabled={status === ProcessingStatus.CONVERTING || (activeTab === 'text' && !promptText)}
              className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-700 rounded-xl text-[11px] font-black uppercase tracking-widest hover:from-cyan-500 hover:to-blue-600 disabled:opacity-20 active:scale-95 transition-all shadow-[0_10px_20px_rgba(6,182,212,0.2)]"
            >
              {status === ProcessingStatus.CONVERTING ? 'Processing...' : 'Run Neural Engine'}
            </button>
            {status === ProcessingStatus.ERROR && <p className="text-[9px] text-red-500 font-bold text-center uppercase">Engine Disconnected. Retry Action.</p>}
          </section>

          <section className="space-y-6 pt-4 border-t border-white/5">
            <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Master Tone</h3>
            <div className="grid grid-cols-2 gap-8">
              <Knob label="Warmth" value={warmth} onChange={setWarmth} color="orange" />
              <Knob label="Drive" value={drive} onChange={setDrive} color="pink" />
            </div>
            <div className="flex justify-center">
              <Knob label="Master Vol" value={masterVolume} onChange={setMasterVolume} color="cyan" />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
              <Switch label="HL Black MIDI" checked={chaoticMode} onChange={setChaoticMode} color="yellow" />
              <Switch label="Hell Mode" checked={hellMode} onChange={setHellMode} color="red" />
            </div>
            <div className="flex justify-center pt-2">
              <Switch label="Duet" checked={duetMode} onChange={setDuetMode} color="blue" />
            </div>

            <div className="pt-4 border-t border-white/5 space-y-3">
              <h4 className="text-[9px] font-black text-white/40 uppercase tracking-widest text-center">Musical Style</h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {STYLES.map(style => (
                  <Switch 
                    key={style} 
                    label={style} 
                    checked={selectedStyle === style} 
                    onChange={(checked) => setSelectedStyle(checked ? style : null)} 
                    color="purple" 
                  />
                ))}
              </div>
            </div>
          </section>
        </aside>

        {/* Central Visualizer */}
        <main className="flex-1 relative bg-[#010206] flex items-center justify-center">
          <div className="absolute top-6 left-6 z-10 flex gap-2">
             <div className="px-4 py-1.5 rounded-full text-[9px] font-black uppercase bg-white/5 border border-white/5 text-gray-400">
               Density: <span className="text-white">{midiData?.notes.length || 0}</span>
             </div>
             <div className="px-4 py-1.5 rounded-full text-[9px] font-black uppercase bg-white/5 border border-white/5 text-gray-400">
               Duration: <span className="text-white">{midiData?.totalDuration.toFixed(1) || 0}s</span>
             </div>
          </div>

          <div className="absolute top-6 right-6 z-10 flex gap-2">
            <button onClick={() => setVisualSettings(s => ({...s, is3D: !s.is3D}))} type="button" className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase border border-white/5 transition-all ${visualSettings.is3D ? 'bg-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.3)]' : 'bg-white/5 text-gray-500'}`}>3D Projection</button>
            <button onClick={() => setVisualSettings(s => ({...s, theme: s.theme === 'neon' ? 'rainbow' : 'neon'}))} type="button" className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase border border-white/5 transition-all ${visualSettings.theme === 'rainbow' ? 'bg-purple-500/20 text-purple-400 shadow-[0_0_15px_rgba(139,92,246,0.3)]' : 'bg-white/5 text-gray-500'}`}>Palette</button>
          </div>

          <div className={`w-full h-full transition-all duration-1000 ${visualSettings.is3D ? 'perspective-[2000px]' : ''}`}>
            <div className={`w-full h-full origin-bottom transition-all duration-1000 ${visualSettings.is3D ? 'rotate-x-[35deg] scale-[0.85] translate-y-[-5%]' : ''}`}>
              <Visualizer 
                notes={midiData?.notes || []} 
                currentTime={currentTime} 
                totalDuration={midiData?.totalDuration || 0} 
                isPlaying={isPlaying} 
                theme={visualSettings.theme} 
              />
            </div>
          </div>
        </main>

        {/* Right Intelligence Panel */}
        <aside className="w-80 border-l border-white/5 bg-[#05070f]/80 backdrop-blur-md p-6 space-y-8 overflow-y-auto">
          <section className="space-y-6">
            <h3 className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Sound Profile</h3>
            
            <MidiStats data={midiData} />

            <div className="relative">
              <select 
                value={instrument} onChange={e => { setInstrument(e.target.value); audioPlayer.setInstrument(e.target.value); }}
                className="w-full bg-black/60 border border-white/5 rounded-xl p-4 text-xs font-bold focus:outline-none focus:border-purple-500/50 appearance-none cursor-pointer hover:bg-white/5 transition-all"
              >
                <option value="piano">Grand Piano</option>
                <option value="cloud">Cloud Pad</option>
                <option value="sine">Pure Sine</option>
                <option value="pluck">Cyber Pluck</option>
                <option value="bell">Stellar Bell</option>
                <option value="sawtooth">Aggressive Saw</option>
                <option value="whisper">Whisper Synth</option>
                <option value="bass">Sub Destroyer</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">▼</div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Knob label="Rhythm" value={styles.edm} onChange={v => setStyles(s => ({...s, edm: v}))} color="green" />
              <Knob label="Harmonics" value={styles.chaos} onChange={v => setStyles(s => ({...s, chaos: v}))} color="indigo" />
            </div>

            <div className="space-y-3 pt-4 border-t border-white/5">
              <button 
                type="button"
                onClick={() => midiData && performAction(() => remixMidi(midiData, styles, { hellMode, chaoticMode, duetMode, style: selectedStyle || undefined, disableArpeggio }))}
                disabled={!midiData || status === ProcessingStatus.CONVERTING}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-20 active:scale-95 transition-all shadow-lg hover:brightness-110"
              >
                Neural Remix
              </button>
              
              {/* Improve and Extend Button */}
              <button 
                type="button"
                onClick={() => midiData && performAction(() => improveAndExtendMidi(midiData, targetDuration, noteCount, { hellMode, chaoticMode, duetMode, style: selectedStyle || undefined, disableArpeggio }))}
                disabled={!midiData || status === ProcessingStatus.CONVERTING}
                className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-700 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-20 active:scale-95 transition-all shadow-lg border border-emerald-400/20 hover:from-emerald-500"
              >
                Improve & Extend
              </button>
            </div>

            <div className="pt-8 text-center space-y-4">
              {analysisText && (
                <div className="px-4 py-3 bg-cyan-500/5 border border-cyan-500/20 rounded-lg animate-pulse">
                  <p className="text-[8px] text-cyan-400 font-mono uppercase tracking-widest leading-relaxed">
                    {analysisText}
                  </p>
                </div>
              )}
              <div className="opacity-30 group hover:opacity-100 transition-opacity space-y-2">
                <p className="text-[8px] text-white font-black uppercase tracking-[0.2em]">Cognitive Core v2.0</p>
                <div className="text-[7px] text-cyan-400 font-mono">GEMINI-3-PRO-PREVIEW + MUSICAL-THEORY-ENGINE</div>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};

export default App;
