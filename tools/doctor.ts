import { doctor } from '@truecut/core/system/doctor';
const r = await doctor({ launch: true });
for (const c of r.checks) console.log(`${c.ok ? '✓' : '✗'} ${c.label}${c.ok ? '' : ' — ' + (c.hint || '')}`);
console.log(`Models: analysis ${r.models.analysis} · creative ${r.models.creative}`);
process.exit(r.ok ? 0 : 1);
