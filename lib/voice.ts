// Voice-over via ElevenLabs (with character timestamps → exact word timings for captions).
import crypto from 'node:crypto';
import fs from 'node:fs';
import { config } from './env';
import { getProject, projectPath, updateProject } from './store';
import { probeDuration } from './media';

type Log = (msg: string, pct?: number) => void;
const API = 'https://api.elevenlabs.io/v1';
const SETTINGS = { stability: 0.42, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true };
/** Delivery per energy: calm = steady and warm, energetic = more expressive and a touch faster. */
export const DELIVERY: Record<string, { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean; speed: number }> = {
  calm: { stability: 0.62, similarity_boost: 0.8, style: 0.12, use_speaker_boost: true, speed: 0.96 },
  balanced: { stability: 0.45, similarity_boost: 0.8, style: 0.28, use_speaker_boost: true, speed: 1.0 },
  energetic: { stability: 0.3, similarity_boost: 0.78, style: 0.55, use_speaker_boost: true, speed: 1.06 },
};
const MODEL = 'eleven_multilingual_v2';

let voiceCache: { at: number; list: any[] } | null = null;
export async function listVoices(): Promise<{ id: string; name: string; labels: Record<string, string>; preview?: string; description?: string }[]> {
  if (!config.elevenKey) return [];
  if (voiceCache && Date.now() - voiceCache.at < 30 * 60_000) return voiceCache.list;
  const r = await fetch(`${API}/voices`, { headers: { 'xi-api-key': config.elevenKey } });
  if (!r.ok) throw new Error(`ElevenLabs voices: HTTP ${r.status}`);
  const j: any = await r.json();
  const list = (j.voices || []).map((v: any) => ({ id: v.voice_id, name: v.name, labels: v.labels || {}, preview: v.preview_url, description: v.description || '' }));
  voiceCache = { at: Date.now(), list }; return list;
}

function wordsFromAlignment(text: string, al: any) {
  const chars: string[] = al?.characters || []; const st: number[] = al?.character_start_times_seconds || []; const en: number[] = al?.character_end_times_seconds || [];
  const out: { w: string; s: number; e: number }[] = []; let cur = ''; let s = 0; let e = 0;
  chars.forEach((c, i) => {
    if (/\s/.test(c)) { if (cur) out.push({ w: cur, s, e }); cur = ''; return; }
    if (!cur) s = st[i] ?? 0; cur += c; e = en[i] ?? s;
  });
  if (cur) out.push({ w: cur, s, e });
  return out;
}

export async function synthLine(pid: string, text: string, voiceId: string, opts: { energy?: string; prev?: string; next?: string } = {}) {
  const settings = DELIVERY[opts.energy || ''] || SETTINGS;
  const hash = crypto.createHash('sha1').update([voiceId, MODEL, JSON.stringify(settings), opts.prev || '', opts.next || '', text].join('|')).digest('hex').slice(0, 16);
  const file = `vo/${hash}.mp3`; const meta = projectPath(pid, `vo/${hash}.json`);
  if (fs.existsSync(projectPath(pid, file)) && fs.existsSync(meta)) return { ...JSON.parse(fs.readFileSync(meta, 'utf8')), file, hash };
  if (!config.elevenKey) throw new Error('ELEVENLABS_API_KEY is not set');
  const r = await fetch(`${API}/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': config.elevenKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: settings, ...(opts.prev ? { previous_text: opts.prev } : {}), ...(opts.next ? { next_text: opts.next } : {}) }),
  });
  if (!r.ok) throw new Error(`ElevenLabs HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j: any = await r.json();
  fs.writeFileSync(projectPath(pid, file), Buffer.from(j.audio_base64, 'base64'));
  const duration = await probeDuration(projectPath(pid, file));
  const words = wordsFromAlignment(text, j.alignment || j.normalized_alignment);
  fs.writeFileSync(meta, JSON.stringify({ duration, words }));
  return { duration, words, file, hash };
}

export async function voiceAll(pid: string, log: Log) {
  const p = getProject(pid);
  // Founder talks keep the founder's own recorded voice. Nothing is ever synthesised for them.
  if (p.kind === 'talk') { log("Founder talk: keeping the speaker's original voice (no synthetic voice-over)", 100); return; }
  const lines = p.scenes.filter((s) => s.vo?.text);
  if (!lines.length) throw new Error('No voice lines in the storyboard.');
  const fallback = p.intake.voiceId || config.defaultVoice;
  const member = (sid: string) => { const role = p.cast.assign[sid]; return p.cast.members.find((m) => m.role === role) || p.cast.members[0]; };
  let k = 0;
  for (const [i, s] of lines.entries()) {
    k++;
    const m = member(s.id);
    // continuity: neighbouring lines read by the SAME voice shape the prosody of this one
    const prev = lines.slice(0, i).reverse().find((x) => member(x.id)?.voiceId === m?.voiceId)?.vo?.text;
    const next = lines.slice(i + 1).find((x) => member(x.id)?.voiceId === m?.voiceId)?.vo?.text;
    log(`Voicing scene ${k}/${lines.length}${m ? ` (${m.name || m.role})` : ''}: “${s.vo!.text.slice(0, 50)}”`, (k / lines.length) * 95);
    const r = await synthLine(pid, s.vo!.text, m?.voiceId || fallback, { energy: m?.energy, prev, next });
    updateProject(pid, (pp) => { const sc = pp.scenes.find((x) => x.id === s.id); if (sc && sc.vo && sc.vo.text === s.vo!.text) Object.assign(sc.vo, { duration: r.duration, words: r.words, file: r.file, hash: r.hash }); });
  }
  updateProject(pid, (pp) => { pp.audioFile = undefined; pp.audioHash = undefined; if (pp.stage === 'storyboard') pp.stage = 'voice'; });
  const voices = new Set(lines.map((s) => member(s.id)?.voiceId || fallback));
  log(`Voiced ${lines.length} lines with ${voices.size} voice${voices.size > 1 ? 's' : ''}`, 100);
}
