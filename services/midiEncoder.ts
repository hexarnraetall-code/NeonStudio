import { Note } from '../types';

/**
 * reliable variable-length quantity encoder for MIDI
 */
function toVLQ(value: number): number[] {
  let buffer = value & 0x7f;
  const bytes = [buffer];
  value >>= 7;
  while (value > 0) {
    buffer = (value & 0x7f) | 0x80;
    bytes.unshift(buffer);
    value >>= 7;
  }
  return bytes;
}

/**
 * Simple MIDI writer:
 * Creates a Format 0 MIDI file (single track).
 * Resolution: 480 ticks per quarter note.
 * Assumes 120 BPM for simplicity in calculation (1 second = 2 quarter notes = 960 ticks).
 */
export function generateMidiFile(notes: Note[]): Uint8Array {
  // Constants
  const TICKS_PER_QUARTER = 480;
  const BPM = 120;
  // At 120 BPM: 60 / 120 = 0.5s per beat.
  // 1 tick = 0.5s / 480 = 0.00104166s ~ 1.04ms
  // Or: Seconds * (BPM * TICKS_PER_QUARTER / 60) = Ticks
  const SECONDS_TO_TICKS = (BPM * TICKS_PER_QUARTER) / 60;

  // 1. Convert simple Note objects to MIDI Events (Note On / Note Off)
  interface MidiEvent {
    type: 'on' | 'off';
    pitch: number;
    velocity: number;
    ticks: number;
  }

  const events: MidiEvent[] = [];

  notes.forEach(note => {
    events.push({
      type: 'on',
      pitch: note.pitch,
      velocity: note.velocity,
      ticks: Math.round(note.startTime * SECONDS_TO_TICKS)
    });
    events.push({
      type: 'off',
      pitch: note.pitch,
      velocity: 0,
      ticks: Math.round((note.startTime + note.duration) * SECONDS_TO_TICKS)
    });
  });

  // 2. Sort events by time (ticks)
  events.sort((a, b) => a.ticks - b.ticks);

  // 3. Generate Track Data
  const trackData: number[] = [];

  // Set Tempo (Optional, usually first event in track 0)
  // Meta FF 51 03 [microseconds per quarter note]
  // 120 BPM = 500,000 microseconds = 07 A1 20
  trackData.push(0x00, 0xFF, 0x51, 0x03, 0x07, 0xA1, 0x20);

  let lastTick = 0;

  events.forEach(event => {
    const deltaTicks = event.ticks - lastTick;
    const vlq = toVLQ(deltaTicks);
    trackData.push(...vlq);

    if (event.type === 'on') {
      // Note On channel 0
      trackData.push(0x90, event.pitch, event.velocity);
    } else {
      // Note Off channel 0
      trackData.push(0x80, event.pitch, 0x00);
    }

    lastTick = event.ticks;
  });

  // End of Track Meta Event: FF 2F 00
  trackData.push(0x00, 0xFF, 0x2F, 0x00);

  // 4. Create Header Chunk
  // MThd
  const header = [
    0x4D, 0x54, 0x68, 0x64, // "MThd"
    0x00, 0x00, 0x00, 0x06, // Chunk size (6)
    0x00, 0x00, // Format 0 (single track)
    0x00, 0x01, // Number of tracks (1)
    (TICKS_PER_QUARTER >> 8) & 0xFF, TICKS_PER_QUARTER & 0xFF // Time division
  ];

  // 5. Create Track Chunk Header
  // MTrk
  const trackHeader = [
    0x4D, 0x54, 0x72, 0x6B, // "MTrk"
    (trackData.length >> 24) & 0xFF,
    (trackData.length >> 16) & 0xFF,
    (trackData.length >> 8) & 0xFF,
    trackData.length & 0xFF
  ];

  // 6. Combine all
  const fileBytes = new Uint8Array([...header, ...trackHeader, ...trackData]);
  return fileBytes;
}
