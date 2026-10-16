import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { voiceCleanFilter, RNNOISE_MODEL } from '../src/talk/voice';
import { ffmpegPath } from '../src/render/media';

const run = (args: string[]) => spawnSync(ffmpegPath(), ['-v', 'error', '-y', ...args], { encoding: 'utf8' });
const rms = (f: string, ss: number, t: number) => { const r = spawnSync(ffmpegPath(), ['-v', 'info', '-ss', String(ss), '-t', String(t), '-i', f, '-af', 'astats=metadata=0', '-f', 'null', '-'], { encoding: 'utf8' }); return Number((r.stderr.match(/RMS level dB:\s*(-?[\d.]+)/) || [])[1]); };

describe('voice noise reduction', () => {
  it('has levels, ships its model and builds a chain', () => {
    expect(voiceCleanFilter('off')).toBe('');
    expect(fs.existsSync(RNNOISE_MODEL)).toBe(true);
    expect(voiceCleanFilter('auto')).toMatch(/highpass.*arnndn.*loudnorm/);
    expect(voiceCleanFilter('strong')).toMatch(/afftdn/);
  });
  it('makes the background clearly quieter', () => {
    const d = '/tmp/tc-voice-test'; fs.mkdirSync(d, { recursive: true });
    // a speech-like source: pulsed 200 Hz harmonics (no TTS dependency), 6 s, then 3 s of noise alone
    run(['-f', 'lavfi', '-i', 'aevalsrc=0.25*sin(2*PI*200*t)*(0.6+0.4*sin(2*PI*3*t))+0.15*sin(2*PI*400*t)*(0.6+0.4*sin(2*PI*3*t)):d=6:s=48000', `${d}/v.wav`]);
    run(['-f', 'lavfi', '-i', 'anoisesrc=d=9:c=pink:a=0.12:r=48000', `${d}/n.wav`]);
    run(['-i', `${d}/v.wav`, '-i', `${d}/n.wav`, '-filter_complex', '[0]apad=pad_dur=3[v];[v][1]amix=inputs=2:duration=shortest:normalize=0[o]', '-map', '[o]', `${d}/noisy.wav`]);
    const r = run(['-i', `${d}/noisy.wav`, '-af', voiceCleanFilter('strong'), `${d}/clean.wav`]);
    expect(r.status).toBe(0);
    const noiseBefore = rms(`${d}/noisy.wav`, 6.5, 2), noiseAfter = rms(`${d}/clean.wav`, 6.5, 2);
    expect(noiseAfter).toBeLessThan(noiseBefore - 6); // background at least 6 dB quieter (loudness levelling is included)
  }, 60000);
});
