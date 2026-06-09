const fs = require("node:fs");
const path = require("node:path");

const repoRoot = process.cwd();

const readFile = (relativePath) => {
  const absolutePath = path.join(repoRoot, relativePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }

  return fs.readFileSync(absolutePath, "utf8");
};

const expectPattern = (content, pattern, message) => {
  if (!pattern.test(content)) {
    throw new Error(message);
  }
};

const checkClaudeImport = () => {
  const claude = readFile("CLAUDE.md");

  expectPattern(
    claude,
    /(^|\r?\n)@AGENTS\.md(\r?\n|$)/,
    "CLAUDE.md must import @AGENTS.md on its own line.",
  );
};

const checkCodexReference = () => {
  const codex = readFile(".codex/AGENTS.md");

  expectPattern(
    codex,
    /\.\.\/AGENTS\.md/,
    ".codex/AGENTS.md must reference ../AGENTS.md as the canonical policy.",
  );
};

const checkGitignoreException = () => {
  const gitignore = readFile(".gitignore");

  expectPattern(
    gitignore,
    /^!\.codex\/AGENTS\.md$/m,
    ".gitignore must explicitly unignore .codex/AGENTS.md.",
  );
};

const checkRootAgents = () => {
  readFile("AGENTS.md");
};

const main = () => {
  checkRootAgents();
  checkClaudeImport();
  checkCodexReference();
  checkGitignoreException();
  console.log("Agent instruction spine check passed.");
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Agent instruction spine check failed: ${message}`);
  process.exitCode = 1;
}
