import { Note, MidiData } from '../types';

export async function parseMidiFile(file: File): Promise<MidiData> {
  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);
  let p = 0;

  function readString(len: number): string {
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(data[p++]);
    return s;
  }

  function readInt16(): number {
    return (data[p++] << 8) | data[p++];
  }

  function readInt32(): number {
    return (data[p++] << 24) | (data[p++] << 16) | (data[p++] << 8) | data[p++];
  }

  function readVarInt(): number {
    let result = 0;
    while (true) {
      const b = data[p++];
      if (b & 0x80) {
        result += (b & 0x7f);
        result <<= 7;
      } else {
        result += b;
        return result;
      }
    }
  }

  // Parse Header
  if (readString(4) !== 'MThd') throw new Error('Invalid MIDI header');
  const headerLength = readInt32();
  const format = readInt16();
  const numTracks = readInt16();
  const division = readInt16(); // Ticks per quarter note

  if ((division & 0x8000) !== 0) throw new Error('SMPTE time division not supported');

  interface RawEvent {
    tick: number;
    type: number;
    channel: number;
    param1: number;
    param2: number;
    metaType?: number;
    metaData?: number[];
  }

  const allEvents: RawEvent[] = [];

  // Parse Tracks
  for (let t = 0; t < numTracks; t++) {
    if (readString(4) !== 'MTrk') throw new Error('Invalid track header');
    const trackLength = readInt32();
    const trackEnd = p + trackLength;
    
    let currentTick = 0;
    let runningStatus = 0;

    while (p < trackEnd) {
      const delta = readVarInt();
      currentTick += delta;

      let status = data[p];
      
      // Handle Running Status
      if ((status & 0x80) === 0) {
        status = runningStatus;
      } else {
        p++;
        runningStatus = status;
      }

      const type = (status >> 4) & 0xF;
      const channel = status & 0xF;

      if (type === 0x8 || type === 0x9) {
        // Note Off or Note On
        const note = data[p++];
        const velocity = data[p++];
        allEvents.push({ tick: currentTick, type, channel, param1: note, param2: velocity });
      } else if (type === 0xB) {
        // Control Change
        p += 2; 
      } else if (type === 0xC) {
        // Program Change
        p += 1;
      } else if (type === 0xD) {
        // Channel Pressure
        p += 1;
      } else if (type === 0xE) {
        // Pitch Bend
        p += 2;
      } else if (type === 0xF) {
        // System / Meta
        if (status === 0xFF) {
          const metaType = data[p++];
          const len = readVarInt();
          
          if (metaType === 0x51) {
             // Tempo
             const tempoBytes = [data[p], data[p+1], data[p+2]];
             allEvents.push({ 
                 tick: currentTick, 
                 type: 0xFF, 
                 channel: 0, 
                 param1: 0, 
                 param2: 0, 
                 metaType: 0x51, 
                 metaData: tempoBytes 
             });
          }
          
          p += len;
        } else if (status === 0xF0 || status === 0xF7) {
            // Sysex
            const len = readVarInt();
            p += len;
        }
      }
    }
  }

  // Sort events by tick
  allEvents.sort((a, b) => a.tick - b.tick);

  // Convert Ticks to Seconds
  const notes: Note[] = [];
  const activeNotes: Map<string, { start: number, velocity: number }> = new Map();
  
  let currentTempo = 500000; // Default 120 BPM (microseconds per quarter note)
  let currentTime = 0;
  let prevTick = 0;

  for (const event of allEvents) {
    const deltaTicks = event.tick - prevTick;
    const timeDelta = (deltaTicks / division) * (currentTempo / 1000000);
    currentTime += timeDelta;
    prevTick = event.tick;

    if (event.type === 0xFF && event.metaType === 0x51 && event.metaData) {
        // Set Tempo
        currentTempo = (event.metaData[0] << 16) | (event.metaData[1] << 8) | event.metaData[2];
    } else if (event.type === 0x9 && event.param2 > 0) {
        // Note On
        const key = `${event.channel}-${event.param1}`;
        // If note already exists on this channel/pitch, end it (monophonic per key enforcement usually handled by synthesizers, but for MIDI structure we allow overlaps, but simplistic parser might want to close prev)
        // Here we just stack.
        activeNotes.set(key, { start: currentTime, velocity: event.param2 });
    } else if (event.type === 0x8 || (event.type === 0x9 && event.param2 === 0)) {
        // Note Off
        const key = `${event.channel}-${event.param1}`;
        const startData = activeNotes.get(key);
        if (startData) {
            notes.push({
                pitch: event.param1,
                startTime: startData.start,
                duration: currentTime - startData.start,
                velocity: startData.velocity
            });
            activeNotes.delete(key);
        }
    }
  }

  // Calculate stats
  const totalDuration = notes.reduce((max, n) => Math.max(max, n.startTime + n.duration), 0);
  // Estimate BPM from last tempo
  const estimatedBPM = Math.round(60000000 / currentTempo);

  return {
    notes: notes.sort((a, b) => a.startTime - b.startTime),
    totalDuration: totalDuration + 0.5, // Add buffer
    tempo: estimatedBPM
  };
}