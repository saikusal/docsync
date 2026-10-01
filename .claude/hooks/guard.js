// PreToolUse guard for Write/Edit/MultiEdit.
// 1. No production code or tests before docs/impl-plan.md is Approved.
// 2. No .env files and no obvious secrets in written content.
// Exit code 2 blocks the tool call and shows stderr to Claude.
const fs = require('fs');
const path = require('path');

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const SECRET_PATTERNS = [
  [/gh[pousr]_[A-Za-z0-9]{36,}/, 'GitHub token'],
  [/github_pat_[A-Za-z0-9_]{50,}/, 'GitHub fine-grained token'],
  [/sk-[A-Za-z0-9_-]{32,}/, 'API secret key'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
];

function block(message) {
  process.stderr.write(message + '\n');
  process.exit(2);
}

let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  const { tool_input: toolInput = {} } = JSON.parse(input || '{}');
  if (!toolInput.file_path) return;

  const rel = path.relative(root, path.resolve(root, toolInput.file_path)).split(path.sep).join('/');
  const fileName = path.basename(rel);

  if (/^\.env(\..+)?$/.test(fileName) && fileName !== '.env.example') {
    block(`Blocked: writing ${rel}. Secrets must not be created by the agent — ask the human to create it from .env.example.`);
  }

  if (/^(src|tests)\//.test(rel)) {
    const plan = path.join(root, 'docs', 'impl-plan.md');
    const approved = fs.existsSync(plan) && /\*\*Status:\*\*\s*Approved/.test(fs.readFileSync(plan, 'utf8'));
    if (!approved) {
      block(`Blocked: ${rel} is production code/tests, but docs/impl-plan.md is not Approved yet. Finish phases 1–4 first (run /sdlc-status).`);
    }
  }

  const content = [toolInput.content, toolInput.new_string, ...(toolInput.edits || []).map((e) => e.new_string)]
    .filter(Boolean)
    .join('\n');
  for (const [pattern, label] of SECRET_PATTERNS) {
    if (pattern.test(content)) block(`Blocked: content written to ${rel} looks like a ${label}. Read secrets from environment variables instead.`);
  }
});
