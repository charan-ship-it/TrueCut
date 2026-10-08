// Voice casting: TrueCut chooses who speaks an ad (from the real ElevenLabs voice library on the account),
// how they deliver it, whether a second voice would genuinely help, and a score that fits the piece.
// Founder talks are never cast: the founder's own recorded voice is always preserved.
import { config } from '@truecut/config';
import { getProject, updateProject } from '@truecut/db';
import { callTool } from './ai';
import { listVoices } from '../audio/voice';
import { DIRECTIONS, GENRES } from '@truecut/engine/styles.js';
import type { CastMember, Project } from '@truecut/shared/types';
import type { Log } from '@truecut/queue';

type V = Awaited<ReturnType<typeof listVoices>>[number];

const CAST_TOOL = {
  name: 'record_cast', description: 'The voice cast and score for this ad.',
  input_schema: { type: 'object', required: ['members', 'assign', 'music', 'why'], properties: {
    why: { type: 'string', description: 'one or two sentences: why this cast fits the brand, audience and story' },
    members: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'object', required: ['role', 'voiceId', 'why', 'energy'], properties: {
      role: { type: 'string', description: 'short role name, e.g. "Narrator", "The old way", "Customer line", "Hook"' },
      voiceId: { type: 'string', description: 'exact id from the voice library' },
      why: { type: 'string', description: 'why this voice for this role (one line)' },
      energy: { type: 'string', enum: ['calm', 'balanced', 'energetic'] } } } },
    assign: { type: 'array', description: 'one entry per scene WITH a spoken line, in order', items: { type: 'object', required: ['scene', 'role'], properties: { scene: { type: 'number', description: '1-based scene number' }, role: { type: 'string' } } } },
    music: { type: 'object', required: ['genre', 'why'], properties: { genre: { type: 'string', enum: GENRES }, bpm: { type: 'number', description: '60-150' }, why: { type: 'string' } } },
  } },
};

export async function castVoices(pid: string, log: Log, instruction = '') {
  const p = await getProject(pid);
  if (p.kind === 'talk') { log("Founder talk: the speaker's own voice is kept, nothing to cast"); return; }
  const lines = p.scenes.map((s, i) => ({ s, i })).filter((x) => x.s.vo?.text);
  if (!lines.length) return;
  const voices = await listVoices().catch(() => [] as V[]);
  if (!voices.length) { log('No ElevenLabs voices available, so the video keeps music and captions only'); return; }
  const dir = DIRECTIONS[p.style?.preset || 'signal'] || DIRECTIONS.signal;
  let out: any = null;
  if (config.anthropicKey) {
    log(`Casting from ${voices.length} voices…`);
    const ang = p.angles.find((a) => a.id === p.angleId);
    try {
      out = await callTool<any>({
        model: config.creativeModel, maxTokens: 2500,
        system: `You are a casting director and sound designer for short B2B video ads. Choose the voice(s) and score that make THIS ad land with THIS audience.
Rules:
- Default to ONE narrator. Use a 2nd (or rarely a 3rd) voice only when it clearly improves the piece: a deliberate contrast (problem vs solution, old way vs new way), a call-and-response hook, a quoted line that should sound like someone other than the narrator, or a product "character". If you add a voice, the narrator still carries most lines and the voices must sound clearly different (gender, age, accent or timbre).
- Never cast a voice to impersonate a real, named person. A quoted line read by a second voice is a read, not an imitation.
- Match accent and register to the audience and brand (e.g. US enterprise → American, measured; UK consulting → British; Gen-Z consumer → young, bright). Match energy to the visual direction and pacing.
- Pick a score genre and tempo that fit the tone and the direction; the voice sits on top of it.
${instruction ? `CUSTOMER REQUEST (follow it): ${instruction}` : ''}`,
        tool: CAST_TOOL,
        content: [{ type: 'text', text: `Product: ${p.intake.productName} — ${p.intake.oneLiner}\nAudience: ${p.intake.audience}\nTone: ${p.intake.tone}\nVisual direction: ${dir.label} — ${dir.vibe} (its default score: ${dir.music.genre} ${dir.music.bpm} bpm)\n${ang ? `Angle: ${ang.title} — ${ang.structure}\n` : ''}${p.cast.members.length ? `Current cast: ${p.cast.members.map((m) => `${m.role}=${m.name}`).join(', ')}\n` : ''}\nSTORYBOARD (scene · type · spoken line)\n${lines.map(({ s, i }) => `${i + 1} · ${s.type} · ${s.vo!.text}`).join('\n')}\n\nVOICE LIBRARY (id · name · labels · description)\n${voices.map((v) => `${v.id} · ${v.name} · ${Object.entries(v.labels || {}).map(([k, x]) => `${k}:${x}`).join(', ')}${v.description ? ' · ' + v.description.slice(0, 120) : ''}`).join('\n')}\n\nCall record_cast.` }],
      });
    } catch (e: any) { log('Casting with Claude failed, using the rule-based caster: ' + e.message); }
  }
  if (!out || !Array.isArray(out.members) || !out.members.length) out = heuristicCast(p, voices, lines.map((x) => x.i));
  // validate + store
  const byId = new Map(voices.map((v) => [v.id, v]));
  const members: CastMember[] = (out.members as any[]).filter((m) => byId.has(m.voiceId)).slice(0, 3).map((m) => { const v = byId.get(m.voiceId)!; return { role: String(m.role || 'Narrator').slice(0, 30), voiceId: v.id, name: v.name.split(' - ')[0], why: String(m.why || ''), energy: ['calm', 'balanced', 'energetic'].includes(m.energy) ? m.energy : 'balanced', labels: v.labels || {}, preview: v.preview }; });
  if (!members.length) { const h = heuristicCast(p, voices, lines.map((x) => x.i)); members.push(...h.members.map((m: any) => { const v = byId.get(m.voiceId)!; return { ...m, name: v.name.split(' - ')[0], labels: v.labels || {}, preview: v.preview }; })); out.assign = h.assign; }
  const roles = new Set(members.map((m) => m.role));
  const assign: Record<string, string> = {};
  for (const { s, i } of lines) { const a = (out.assign || []).find((x: any) => Number(x.scene) === i + 1); assign[s.id] = a && roles.has(a.role) ? a.role : members[0].role; }
  // a "second voice" that ends up with no lines is dropped
  const used = new Set(Object.values(assign)); const kept = members.filter((m, k) => k === 0 || used.has(m.role));
  const genre = GENRES.includes(out.music?.genre) ? out.music.genre : dir.music.genre;
  await updateProject(pid, (pp) => {
    pp.cast = { members: kept, assign, why: String(out.why || ''), music: { genre, bpm: out.music?.bpm ? Math.max(60, Math.min(150, Math.round(out.music.bpm))) : undefined, why: String(out.music?.why || ''), preset: pp.style?.preset }, auto: true, at: new Date().toISOString() };
    for (const s of pp.scenes) if (s.vo) { delete s.vo.file; delete s.vo.hash; }
    pp.audioFile = undefined; pp.audioHash = undefined;
  });
  log(`Cast ${kept.map((m) => `${m.name} (${m.role})`).join(' + ')} · ${genre} score`);
}

/** No-AI casting: score the library against the direction's character, add a contrasting voice only for quoted lines. */
export function heuristicCast(p: Project, voices: V[], lineIdx: number[]) {
  const preset = p.style?.preset || 'signal';
  const want: Record<string, string[]> = {
    signal: ['confident', 'classy', 'deep', 'professional', 'social_media'], editorial: ['narrative', 'storyteller', 'warm', 'mature', 'british'],
    neon: ['energetic', 'hyped', 'young', 'social_media', 'confident'], swiss: ['formal', 'crisp', 'broadcaster', 'informative', 'professional'],
    brutal: ['energetic', 'hyped', 'deep', 'dominant', 'firm', 'young'], blueprint: ['calm', 'informative', 'neutral', 'educational', 'steady'],
    cinematic: ['storyteller', 'deep', 'resonant', 'narrative', 'mature', 'wise'], terminal: ['calm', 'neutral', 'informative', 'relaxed'],
    pop: ['bright', 'playful', 'warm', 'young', 'cute', 'enthusiast'], magazine: ['velvety', 'confident', 'classy', 'british', 'charming'],
  };
  const tone = (p.intake.tone || '').toLowerCase().split(/\W+/);
  const keys = [...(want[preset] || want.signal), ...tone];
  const score = (v: V) => { const hay = `${v.name} ${Object.values(v.labels || {}).join(' ')} ${v.description || ''}`.toLowerCase(); return keys.reduce((a, k) => a + (k && hay.includes(k) ? 1 : 0), 0) + (/advert|narrat|informative|social/.test(v.labels?.use_case || '') ? 0.5 : 0); };
  const ranked = [...voices].sort((a, b) => score(b) - score(a));
  const lead = ranked[0];
  const energy = ['brutal', 'neon', 'pop'].includes(preset) ? 'energetic' : ['editorial', 'blueprint', 'cinematic', 'terminal'].includes(preset) ? 'calm' : 'balanced';
  const members: any[] = [{ role: 'Narrator', voiceId: lead.id, why: `Fits the ${DIRECTIONS[preset]?.label || preset} direction`, energy }];
  const assign: any[] = lineIdx.map((i) => ({ scene: i + 1, role: 'Narrator' }));
  const quotes = lineIdx.filter((i) => p.scenes[i].type === 'quote');
  if (quotes.length && quotes.length < lineIdx.length / 2) {
    const other = ranked.find((v) => v.id !== lead.id && v.labels?.gender && v.labels.gender !== lead.labels?.gender) || ranked[1];
    if (other) { members.push({ role: 'Quoted line', voiceId: other.id, why: 'A different voice so the quote reads as someone else speaking', energy: 'balanced' }); for (const a of assign) if (quotes.includes(a.scene - 1)) a.role = 'Quoted line'; }
  }
  return { members, assign, music: { genre: DIRECTIONS[preset]?.music.genre, why: 'The direction’s own score' }, why: 'Picked by matching the voice library to the visual direction and tone.' };
}
