// One-off: copy projects from the old file store (data/projects/<id>/project.json) into Postgres.
// The media files stay where they are (data/projects/<id>/…), which is the local working folder.
// Safe to re-run: existing rows are updated in place.
//   npm run db:import            # every project under TRUECUT_DATA
//   npm run db:import -- <id>…   # just these
import fs from 'node:fs';
import path from 'node:path';
import { config } from '@truecut/config';
import { importProject, closeDb } from '@truecut/db';
import { runMigrations } from '@truecut/db/migrate';
import { projectsDir } from '@truecut/storage';

async function main() {
  await runMigrations();
  const dir = projectsDir();
  const want = process.argv.slice(2);
  const ids = (fs.existsSync(dir) ? fs.readdirSync(dir) : []).filter((d) => fs.existsSync(path.join(dir, d, 'project.json')) && (!want.length || want.includes(d)));
  if (!ids.length) { console.log(`No project.json files under ${dir}`); return; }
  let ok = 0;
  for (const id of ids) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, id, 'project.json'), 'utf8'));
      raw.agentBusy = false;
      await importProject(raw);
      ok++; console.log(`✓ ${id}  ${raw.name}`);
    } catch (e: any) { console.error(`✗ ${id}: ${e.message}`); }
  }
  console.log(`Imported ${ok}/${ids.length} projects from ${path.relative(process.cwd(), config.dataDir) || config.dataDir}.`);
}
main().finally(() => closeDb());
