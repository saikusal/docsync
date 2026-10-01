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
function currentBranch() {
  try {
    const head = fs.readFileSync(path.join(root, '.git', 'HEAD'), 'utf8').trim();
    return head.startsWith('ref: refs/heads/') ? head.slice('ref: refs/heads/'.length) : null;
  } catch {
    return null;
  }
}

if (next) {
  console.log(`Current phase: ${next.name} (${next.rel} is ${next.status}).`);
} else if (['main', 'master'].includes(currentBranch())) {
  console.log('Pipeline complete: every phase artifact is approved and the work is merged into main.');
} else {
  console.log('All phase artifacts are approved. Next: run /sdlc-pr to open the pull request.');
}
