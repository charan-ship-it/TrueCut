// Cleaning the founder's voice before it is mixed. Phone and laptop recordings carry room noise, fans, traffic and chatter;
// the bed and captions can't hide that, so the voice is cleaned first: a high-pass for rumble, RNNoise (a small recurrent neural net
// trained to separate speech from noise, shipped with ffmpeg's arnndn filter) for the broadband and non-stationary noise, an adaptive
// FFT denoiser for what is left (strong only), then EBU R128 loudness so a quiet phone recording sits at a normal level.
// The model is the "beguiling-drafter" RNNoise model (recording noise, voice signal) from GregorR/rnnoise-models, which its author
// states is not subject to copyright.
import path from 'node:path';
import fs from 'node:fs';
import { ROOT } from '@truecut/config';

export type Denoise = 'off' | 'auto' | 'strong';
export const DENOISE_LEVELS: Denoise[] = ['off', 'auto', 'strong'];
export const RNNOISE_MODEL = path.join(ROOT, 'packages', 'core', 'assets', 'rnnoise-bd.rnnn');

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");

/** An ffmpeg audio filter chain (no pad labels) for the chosen level, or '' for off / when the model file is missing. */
export function voiceCleanFilter(level: Denoise = 'auto'): string {
  if (level === 'off') return '';
  const model = fs.existsSync(RNNOISE_MODEL) ? `arnndn=m='${esc(RNNOISE_MODEL)}':mix=${level === 'strong' ? 1 : 0.9}` : '';
  const chain = [
    `highpass=f=${level === 'strong' ? 100 : 80}`,
    model,
    // without the neural model fall back to the FFT denoiser at a firmer setting; with it, only strong adds it as a second stage
    model ? (level === 'strong' ? 'afftdn=nr=12:nf=-45:tn=1' : '') : `afftdn=nr=${level === 'strong' ? 20 : 14}:nf=-40:tn=1`,
    'loudnorm=I=-16:TP=-1.5:LRA=11',
  ].filter(Boolean);
  return chain.join(',');
}
