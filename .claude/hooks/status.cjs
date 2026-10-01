// Prints the SDLC pipeline status. Used by the SessionStart hook and /sdlc-status.
const fs = require('fs');
const path = require('path');

const root = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..');

const phases = [
  ['1 Requirements', 'docs/requirements.md'],
  ['2 Architecture', 'docs/architecture.md'],
  ['3 Design review', 'docs/design-review.md'],
  ['4 Implementation plan', 'docs/impl-plan.md'],
  ['6 Code review', 'docs/code-review.md'],
  ['7 Verification', 'docs/verification.md'],
];

function artifactStatus(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return 'Missing';
  const match = fs.readFileSync(file, 'utf8').match(/\*\*Status:\*\*\s*(\w+)/);
  return match ? match[1] : 'Draft';
}

const rows = phases.map(([name, rel]) => ({ name, rel, status: artifactStatus(rel) }));
const next = rows.find((r) => r.status !== 'Approved');

console.log('SDLC pipeline status:');
for (const r of rows) console.log(`  [${r.status === 'Approved' ? 'x' : ' '}] ${r.name.padEnd(24)} ${r.rel} — ${r.status}`);
console.log(next ? `Current phase: ${next.name} (${next.rel} is ${next.status}).` : 'All artifacts approved — ready for /sdlc-pr.');
