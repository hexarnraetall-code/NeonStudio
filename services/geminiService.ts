
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { Note, MidiData } from "../types";

async function callGeminiWithRetry(fn: () => Promise<any>, maxRetries = 3): Promise<any> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      // Check if it's a 429 error (Quota Exceeded)
      const isRateLimit = error?.message?.includes('429') || error?.status === 429 || error?.code === 429;
      if (isRateLimit && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 2000; // 2s, 4s, 8s
        console.warn(`Rate limit hit. Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export async function fileToGenerativePart(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function parseMidiCsv(text: string): MidiData {
  // Clean up potential markdown formatting
  const cleanedText = text.replace(/```csv/g, '').replace(/```/g, '').trim();
  const lines = cleanedText.split('\n');
  const notes: Note[] = [];
  let tempo = 120;
  
  for (const line of lines) {
    const cleaned = line.trim();
    if (!cleaned) continue;

    if (cleaned.toUpperCase().startsWith('TEMPO:')) {
       const val = parseInt(cleaned.split(':')[1]);
       if (!isNaN(val)) tempo = val;
       continue;
    }

    const parts = cleaned.split(',').map(s => s.trim());
    if (parts.length >= 4) {
      const pitch = parseInt(parts[0]);
      const start = parseFloat(parts[1]);
      const dur = parseFloat(parts[2]);
      const vel = parseInt(parts[3]);
      const part = parts.length >= 5 ? parseInt(parts[4]) : 1;

      if (!isNaN(pitch) && !isNaN(start) && !isNaN(dur)) {
        notes.push({
          pitch: Math.min(108, Math.max(21, pitch)),
          startTime: Math.max(0, start),
          duration: Math.max(0.01, dur),
          velocity: isNaN(vel) ? 80 : Math.min(127, Math.max(1, vel)),
          part: isNaN(part) ? 1 : part
        });
      }
    }
  }

  const totalDuration = notes.reduce((max, n) => Math.max(max, n.startTime + n.duration), 0);
  return {
    notes: notes.sort((a, b) => a.startTime - b.startTime),
    totalDuration: totalDuration + 1.0, 
    tempo
  };
}

export function cleanMidiData(data: MidiData): MidiData {
  if (!data.notes || data.notes.length === 0) return data;
  
  // 1. Basic filtering and sorting
  let cleanedNotes = data.notes.filter(n => n.duration > 0.005 && n.velocity > 0);
  cleanedNotes.sort((a, b) => a.startTime - b.startTime || a.pitch - b.pitch);
  
  // 2. Remove exact duplicates and near-simultaneous same-pitch notes
  const uniqueNotes: Note[] = [];
  for (const note of cleanedNotes) {
    const last = uniqueNotes[uniqueNotes.length - 1];
    if (last && last.pitch === note.pitch && Math.abs(last.startTime - note.startTime) < 0.01) {
      if (note.velocity > last.velocity) {
        uniqueNotes[uniqueNotes.length - 1] = note;
      }
      continue;
    }
    uniqueNotes.push(note);
  }

  // 3. Intelligent Gap Handling: If there's a gap > 2s, we might want to flag it or shift notes, 
  // but for now let's just ensure the totalDuration is accurate.
  // Also, remove "stuttering" notes that are physically impossible or sound like glitches (unless intentional)
  const finalNotes: Note[] = [];
  for (let i = 0; i < uniqueNotes.length; i++) {
    const note = uniqueNotes[i];
    const prev = finalNotes[finalNotes.length - 1];
    
    // If notes are too close (stuttering < 10ms) and same pitch, merge or skip
    if (prev && prev.pitch === note.pitch && (note.startTime - (prev.startTime + prev.duration)) < 0.01) {
        prev.duration = (note.startTime + note.duration) - prev.startTime;
        continue;
    }
    
    finalNotes.push(note);
  }
  
  return { 
    ...data, 
    notes: finalNotes,
    totalDuration: finalNotes.reduce((max, n) => Math.max(max, n.startTime + n.duration), 0) + 0.5
  };
}

export interface GenerationOptions {
  hellMode?: boolean;
  chaoticMode?: boolean;
  duetMode?: boolean;
  style?: string;
  disableArpeggio?: boolean;
}

export async function generateMidiFromText(userPrompt: string, noteCount: number, duration: number, options: GenerationOptions = {}): Promise<MidiData> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-pro-preview";

  let modeInstructions = "";
  if (options.hellMode) {
    modeInstructions += "\n- HELL MODE: Create extremely high density, complex 'death waltz' style patterns. Think Touhou MIDI style: massive chords, rapid-fire notes, and intricate, overlapping melodies. Push the limits of polyphony.";
  }
  if (options.chaoticMode) {
    modeInstructions += "\n- HALF-LIFE BLACK MIDI MODE: Create an overwhelming, industrial, and scientific 'Black MIDI' style. Use extreme note density (thousands of notes), glitchy mechanical patterns, and intense, dissonant soundscapes. Think Half-Life sound design meets impossible-to-play MIDI files. High polyphony and rapid-fire textures are required.";
  }
  if (options.duetMode) {
    modeInstructions += "\n- DUET MODE: Create two distinct musical parts. Assign part 1 (Blue) to the main melody/lead and part 2 (Orange) to the accompaniment/harmony/bass. Use the 5th column in CSV for the part ID (1 or 2).";
  }
  if (options.style) {
    modeInstructions += `\n- MUSICAL STYLE: The composition MUST strictly follow the characteristics of the ${options.style} genre.`;
  }
  if (options.disableArpeggio) {
    modeInstructions += "\n- DISABLE ARPEGGIO: Do NOT use arpeggios. Notes in chords should be played simultaneously, not broken up into sequences.";
  }

  const systemPrompt = `You are a world-class AI Music Composer and Theorist. 
    Task: Create a ${duration} second MIDI composition based on the prompt: "${userPrompt}".
    
    CRITICAL MUSICAL GUIDELINES:
    1. STRUCTURE: Ensure a clear musical arc. Avoid long silence gaps (>0.5s) unless musically intentional.
    2. COHERENCE: Avoid mindless repetition. If a motif repeats, vary it (transposition, rhythmic variation).
    3. HARMONY: Use sophisticated chord voicings. Ensure bass notes support the harmony.
    4. RHYTHM: Maintain a consistent but dynamic pulse. Avoid "mechanical" quantization; use subtle syncopation.
    5. DENSITY: Aim for approximately ${noteCount} notes distributed logically across the duration.
    ${modeInstructions}

    Output MUST be in strict CSV format:
    TEMPO:BPM
    pitch, startTime, duration, velocity, part
    
    Note: 'part' is 1 for Blue (Lead) and 2 for Orange (Accompaniment). Default is 1.
    
    Do not include any text other than the CSV.`;

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
      config: { 
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        responseMimeType: "text/plain" 
      }
    }));
    return cleanMidiData(parseMidiCsv(response.text || ""));
  } catch (error) {
    console.error("Composer Error:", error);
    throw error;
  }
}

export async function convertAudioToMidi(audioFile: File, noteCount: number): Promise<MidiData> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const base64Audio = await fileToGenerativePart(audioFile);
  const model = "gemini-3-flash-preview"; 

  const prompt = `Transcribe this musical audio to MIDI CSV format. 
    Analyze harmonics and rhythm precisely. Aim for roughly ${noteCount} notes.
    Output:
    TEMPO:BPM
    pitch, startTime, duration, velocity`;

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model,
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType: audioFile.type, data: base64Audio } },
          { text: prompt }
        ]
      }],
      config: { responseMimeType: "text/plain" }
    }));
    return cleanMidiData(parseMidiCsv(response.text || ""));
  } catch (error) {
    console.error("Transcriber Error:", error);
    throw error;
  }
}

export interface RemixStyles {
  dubstep: number; edm: number; rock: number; chaos: number;
}

export async function remixMidi(originalData: MidiData, styles: RemixStyles, options: GenerationOptions = {}): Promise<MidiData> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-pro-preview";
  
  // Analyze the input to provide a better summary to the AI
  const avgPitch = originalData.notes.reduce((sum, n) => sum + n.pitch, 0) / originalData.notes.length;
  const noteRange = Math.max(...originalData.notes.map(n => n.pitch)) - Math.min(...originalData.notes.map(n => n.pitch));
  
  // Send a representative chunk for context
  const inputCsv = originalData.notes.slice(0, 600).map(n => `${n.pitch},${n.startTime.toFixed(3)},${n.duration.toFixed(3)},${n.velocity},${n.part || 1}`).join('\n');

  let modeInstructions = "";
  if (options.hellMode) {
    modeInstructions += "\n- HELL MODE INFLUENCE: Transform the remix into a high-density 'death waltz' style. Add massive layers and rapid note patterns.";
  }
  if (options.chaoticMode) {
    modeInstructions += "\n- HALF-LIFE BLACK MIDI MODE INFLUENCE: Infuse the remix with industrial, scientific 'Black MIDI' energy. Use extreme note density, mechanical glitch patterns, and intense, dissonant soundscapes. Think Half-Life sound design meets impossible-to-play MIDI files.";
  }
  if (options.duetMode) {
    modeInstructions += "\n- DUET MODE INFLUENCE: Split the remix into two distinct parts. Assign part 1 (Blue) to the primary melody and part 2 (Orange) to the supporting layers. Use the 5th column in CSV for part ID (1 or 2).";
  }
  if (options.style) {
    modeInstructions += `\n- STYLE INFLUENCE: Re-arrange the piece in the style of ${options.style}.`;
  }
  if (options.disableArpeggio) {
    modeInstructions += "\n- DISABLE ARPEGGIO INFLUENCE: Ensure the remix does not use arpeggios. Play chords as solid blocks.";
  }

  const prompt = `You are a Master Remix Engineer. 
    INPUT ANALYSIS: Average Pitch: ${avgPitch.toFixed(1)}, Pitch Range: ${noteRange}.
    STYLE TARGETS: EDM(${styles.edm}%), Dubstep(${styles.dubstep}%), Rock(${styles.rock}%), Experimental Chaos(${styles.chaos}%).
    ${modeInstructions}

    TASK:
    1. UNDERSTAND the source material's melody and rhythm.
    2. REIMAGINE it using the style targets.
    3. IMPROVE the flow: Remove awkward gaps, fix clashing notes, and ensure a professional "produced" feel.
    4. VARIATION: Do not just repeat the input. Evolve it.
    5. DUET: If Duet Mode is active, ensure clear separation between Part 1 and Part 2.
    
    TEMPO:${originalData.tempo}
    SOURCE MIDI (CSV format: pitch, startTime, duration, velocity, part):
    ${inputCsv}`;

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { 
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
        responseMimeType: "text/plain" 
      }
    }));
    return cleanMidiData(parseMidiCsv(response.text || ""));
  } catch (error) {
    throw error;
  }
}

export async function improveAndExtendMidi(originalData: MidiData, targetTotalDuration: number, noteDensity: number, options: GenerationOptions = {}): Promise<MidiData> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-pro-preview";
  
  const sortedNotes = [...originalData.notes].sort((a, b) => a.startTime - b.startTime);
  const notesToKeepCount = Math.max(0, sortedNotes.length - 5);
  const notesToKeep = sortedNotes.slice(0, notesToKeepCount);
  
  const currentDuration = originalData.totalDuration;
  const contextNotes = notesToKeep.filter(n => n.startTime > currentDuration - 20); // More context
  const contextCsv = contextNotes.map(n => `${n.pitch},${n.startTime.toFixed(3)},${n.duration.toFixed(3)},${n.velocity},${n.part || 1}`).join('\n');

  const extensionTime = Math.max(10, targetTotalDuration - currentDuration);

  let modeInstructions = "";
  let effectiveNoteDensity = noteDensity;
  if (options.hellMode) {
    effectiveNoteDensity = Math.max(noteDensity * 2, 1500);
    modeInstructions += `\n- HELL MODE: Maximize polyphony and density.`;
  }
  if (options.chaoticMode) {
    modeInstructions += "\n- HALF-LIFE BLACK MIDI MODE: Use industrial, scientific 'Black MIDI' patterns. Extreme note density and mechanical glitches.";
  }
  if (options.duetMode) {
    modeInstructions += "\n- DUET MODE: Continue the piece with two distinct voices. Part 1 (Blue) and Part 2 (Orange). Use the 5th column in CSV.";
  }
  if (options.style) {
    modeInstructions += `\n- STYLE EXTENSION: Extend the piece in the style of ${options.style}.`;
  }
  if (options.disableArpeggio) {
    modeInstructions += "\n- DISABLE ARPEGGIO: Ensure the extension does not introduce arpeggios.";
  }

  const prompt = `You are an Expert Music Continuator. 
    CONTEXT: The user has a piece that ends at ${currentDuration.toFixed(1)}s.
    TASK:
    1. ANALYZE the existing motif and harmonic progression.
    2. EXTEND the piece by ${extensionTime.toFixed(1)}s.
    3. FIX ISSUES: Ensure no dead air and no mindless looping. 
    4. DEVELOPMENT: Introduce a new section or a variation that feels earned.
    5. DUET: Maintain the two-voice structure if applicable.
    ${modeInstructions}
    
    TEMPO:${originalData.tempo}
    CONTEXT MIDI (CSV format: pitch, startTime, duration, velocity, part):
    ${contextCsv}`;

  try {
    const response = await callGeminiWithRetry(() => ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { 
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }, 
        responseMimeType: "text/plain" 
      }
    }));
    const newMidi = parseMidiCsv(response.text || "");
    
    // Merge: Keep the notes we decided to keep, and append the new ones.
    // We filter new notes to ensure they start after or near the end of our kept notes to avoid overlaps if Gemini hallucinated earlier times.
    const lastKeptTime = contextNotes.length > 0 ? contextNotes[contextNotes.length - 1].startTime : 0;
    const mergedNotes = [...notesToKeep, ...newMidi.notes.filter(n => n.startTime > lastKeptTime - 0.1)];
    
    return cleanMidiData({
      notes: mergedNotes,
      totalDuration: mergedNotes.reduce((max, n) => Math.max(max, n.startTime + n.duration), 0) + 1.0,
      tempo: originalData.tempo
    });
  } catch (error) {
    console.error("Improve & Extend Error:", error);
    throw error;
  }
}
