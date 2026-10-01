// PreToolUse guard for Bash: run the test suite before any `git commit`.
// A failing suite blocks the commit (exit code 2).
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  const command = (JSON.parse(input || '{}').tool_input || {}).command || '';
  if (!/\bgit\s+commit\b/.test(command)) return;

  const pkgPath = path.join(root, 'package.json');
  if (!fs.existsSync(pkgPath)) return;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (!pkg.scripts || !pkg.scripts.test) return;

  const result = spawnSync('npm', ['test', '--silent'], { cwd: root, encoding: 'utf8', shell: true });
  if (result.status !== 0) {
    process.stderr.write(`Blocked: tests fail, so this commit was not made.\n${(result.stdout || '') + (result.stderr || '')}`.slice(0, 4000));
    process.exit(2);
  }
});
