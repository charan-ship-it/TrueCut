// Render an existing project:  npm run render -- <projectId> [--formats 4x5,9x16,1x1] [--voice]
import { getProject, projectPath } from '../lib/store';
import { renderProject } from '../lib/render';
import { voiceAll } from '../lib/voice';
import { checkScenes } from '../lib/facts';
import { config } from '../lib/env';

const args = process.argv.slice(2);
const id = args[0];
if (!id) { console.error('Usage: npm run render -- <projectId> [--formats 4x5,9x16] [--voice] [--force]'); process.exit(1); }
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const p = getProject(id);
const formats = (flag('--formats') || p.intake.formats.join(',')).split(',') as any;
const log = (m: string, pct?: number) => console.log(`${pct != null ? `[${String(Math.round(pct)).padStart(3)}%] ` : ''}${m}`);
const errors = checkScenes(p).filter((i) => i.level === 'error');
if (errors.length && !args.includes('--force')) { console.error('Fact check failed:\n' + errors.map((e) => ' - ' + e.message).join('\n') + '\nFix the storyboard or pass --force.'); process.exit(2); }
if (args.includes('--voice')) { if (config.elevenKey) await voiceAll(id, log); else console.warn('No ELEVENLABS_API_KEY — rendering without voice.'); }
const outs = await renderProject(id, formats, log);
for (const o of outs) console.log('OUTPUT', projectPath(id, o.file));
