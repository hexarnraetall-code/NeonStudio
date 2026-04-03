export interface Note {
  pitch: number; // MIDI note number (0-127)
  startTime: number; // Seconds
  duration: number; // Seconds
  velocity: number; // 0-127
  part?: number; // 1 for Blue, 2 for Orange
}

export interface MidiData {
  notes: Note[];
  totalDuration: number;
  tempo: number; // BPM
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  CONVERTING = 'CONVERTING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}
