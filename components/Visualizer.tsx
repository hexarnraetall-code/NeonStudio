
import React, { useRef, useEffect } from 'react';
import { Note } from '../types';

export type VisualizerTheme = 'rainbow' | 'neon' | 'golden' | 'matrix' | 'fire' | 'cyber';

interface VisualizerProps {
  notes: Note[];
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  theme?: VisualizerTheme;
  particlesEnabled?: boolean;
}

export const Visualizer: React.FC<VisualizerProps> = ({
  notes,
  currentTime,
  totalDuration,
  theme = 'neon',
  particlesEnabled = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const THEMES = {
    rainbow: { bg: '#010206', note: 'hsl(0, 100%, 60%)', hit: '#ffffff', particle: '#fff' },
    neon: { bg: '#020617', note: '#22d3ee', noteSharp: '#f472b6', hit: '#a855f7', particle: '#fff' },
    cyber: { bg: '#05010a', note: '#0ff', noteSharp: '#f0f', hit: '#fff', particle: '#0ff' },
    golden: { bg: '#0c0a09', note: '#fbbf24', noteSharp: '#d97706', hit: '#fffbeb', particle: '#fde68a' },
    matrix: { bg: '#000', note: '#22c55e', noteSharp: '#166534', hit: '#4ade80', particle: '#86efac' },
    fire: { bg: '#0c0202', note: '#f97316', noteSharp: '#dc2626', hit: '#fca5a5', particle: '#fdba74' }
  };

  const getNoteColor = (pitch: number, isActive: boolean, velocity: number = 80) => {
    const vOffset = (velocity / 127) * 20; // Brighter for harder hits
    if (theme === 'rainbow') {
      const hue = (pitch % 12) * 30;
      return `hsl(${hue}, ${isActive ? '100%' : '80%'}, ${isActive ? (60 + vOffset) + '%' : (40 + vOffset/2) + '%'})`;
    }
    const isSharp = [1, 3, 6, 8, 10].includes(pitch % 12);
    const colors = THEMES[theme] || THEMES.neon;
    
    // Gradient based on pitch within theme
    if (isActive) {
        if (isSharp && 'noteSharp' in colors) return (colors as any).noteSharp;
        return colors.note;
    }
    
    const baseColor = (isSharp && 'noteSharp' in colors) ? (colors as any).noteSharp : colors.note;
    return baseColor + '88'; // Semi-transparent for inactive
  };

  const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    if (w <= 0 || h <= 0) return;
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.closePath();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationId: number;
    const particles: {x: number, y: number, vx: number, vy: number, life: number, color: string}[] = [];

    const render = () => {
      const { width, height } = canvas;
      if (width === 0 || height === 0) {
        animationId = requestAnimationFrame(render);
        return;
      }

      const pps = 240; // Pixels per second (speed)
      const keyHeight = 120;
      const hitLineY = height - keyHeight;
      const minPitch = 21, maxPitch = 108;
      const totalKeys = maxPitch - minPitch + 1;
      const keyWidth = width / totalKeys;
      const activePitches = new Map<number, number>(); // pitch -> velocity

      const colors = THEMES[theme] || THEMES.neon;
      ctx.fillStyle = colors.bg;
      ctx.fillRect(0, 0, width, height);

      // Sub-grid lines
      ctx.strokeStyle = '#ffffff04';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for(let i=0; i <= width; i += keyWidth * 12) {
        ctx.moveTo(i, 0); ctx.lineTo(i, hitLineY);
      }
      ctx.stroke();

      // Sort notes roughly by time for better depth perception if needed
      // (Using forEach for now, but in high-note-count mode, we can optimize further)
      notes.forEach(note => {
        const timeFromStart = currentTime - note.startTime;
        const timeToHit = note.startTime - currentTime;
        
        const yBottom = hitLineY - (timeToHit * pps);
        const noteHeight = note.duration * pps;
        const yTop = yBottom - noteHeight;

        // Culling
        if (yBottom < -50 || yTop > height + 50) return;

        const isActive = timeFromStart >= 0 && timeFromStart < note.duration;
        if (isActive) activePitches.set(note.pitch, note.velocity);

        const x = (note.pitch - minPitch) * keyWidth;
        const noteColor = getNoteColor(note.pitch, isActive, note.velocity);

        if (isActive) {
          ctx.shadowBlur = 15 + (note.velocity / 127) * 20;
          ctx.shadowColor = noteColor;
          if (particlesEnabled && Math.random() > 0.6) {
            particles.push({
              x: x + keyWidth / 2, y: hitLineY,
              vx: (Math.random() - 0.5) * 8, vy: -Math.random() * 6 - 2,
              life: 1.0, color: noteColor
            });
          }
        }

        const grad = ctx.createLinearGradient(x, yTop, x, yBottom);
        grad.addColorStop(0, noteColor);
        grad.addColorStop(1, isActive ? '#fff' : noteColor);
        
        ctx.fillStyle = grad;
        drawRoundedRect(ctx, x + 1, yTop, keyWidth - 2, Math.max(5, noteHeight), 5);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // Render Particles
      if (particlesEnabled) {
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.5 * p.life + 1, 0, Math.PI * 2);
          ctx.fill();
          p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.life -= 0.025;
          if (p.life <= 0) particles.splice(i, 1);
        }
        ctx.globalAlpha = 1.0;
      }

      // Render Keyboard
      for (let i = 0; i < totalKeys; i++) {
        const pitch = minPitch + i;
        const isSharp = [1, 3, 6, 8, 10].includes(pitch % 12);
        const x = i * keyWidth;
        const activeVel = activePitches.get(pitch);
        const isActive = activeVel !== undefined;

        if (isActive) {
          const c = getNoteColor(pitch, true, activeVel);
          ctx.fillStyle = c;
          ctx.shadowBlur = 25;
          ctx.shadowColor = c;
        } else {
          ctx.fillStyle = isSharp ? '#0a0d14' : '#f8fafc';
        }
        
        ctx.fillRect(x, hitLineY, keyWidth, keyHeight);
        ctx.shadowBlur = 0;
        
        // Borders
        ctx.strokeStyle = '#00000033';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, hitLineY, keyWidth, keyHeight);
        
        if (isActive) {
          ctx.fillStyle = '#ffffffaa';
          ctx.fillRect(x, hitLineY, keyWidth, 8);
          // Highlight flash
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.fillRect(x, hitLineY, keyWidth, keyHeight);
        }
      }

      animationId = requestAnimationFrame(render);
    };

    const handleResize = () => {
      if (canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationId);
    };
  }, [notes, currentTime, theme, particlesEnabled]);

  return <canvas ref={canvasRef} className="w-full h-full" />;
};
