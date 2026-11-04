import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(import.meta.url);

function walk(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    if (['node_modules', '.git', 'backups', '.freebuff'].includes(entry)) continue;
    const full = join(directory, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) files.push(...walk(full));
    else if (entry.endsWith('.js') || entry.endsWith('.mjs')) files.push(full);
  }
  return files;
}

const files = walk(root).sort();
let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures += 1;
    console.error(`SYNTAX FAIL ${relative(root, file)}\n${result.stderr}`);
  }
}
console.log(`Syntax checked ${files.length} JavaScript files.`);

// Loading each route catches missing imports and top-level errors without
// requiring DATABASE_URL or any production secret.
const apiFiles = files.filter(file => file.includes(`${'api'}`) && file.endsWith('.js'));
for (const file of apiFiles) {
  try {
    require(file);
  } catch (error) {
    failures += 1;
    console.error(`LOAD FAIL ${relative(root, file)}\n${error.stack || error.message}`);
  }
}
console.log(`Loaded ${apiFiles.length} API modules.`);

if (failures) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log('All checks passed.');
