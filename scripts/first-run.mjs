// What this computer is missing, found before setup and not halfway through it.
//
// A true beginner has Claude Code and nothing else. Without git, "I want yesterday's version
// back" has nothing to go back to, and the gate cannot tell which turn changed what. Without
// a name and email in git, the first commit fails with "Please tell me who you are", which
// names nothing a beginner knows. Both used to surface only when something needed them.
//
// session-start.mjs asks this once per session, and only while the project is not set up, so
// a set-up project pays nothing for it. Node.js itself cannot be checked here: this file runs
// on it. kickoff checks for Node.js when it is started without the session opener.
//
// No dependencies: node: builtins only, same rule as validate.mjs.
import { spawnSync } from 'node:child_process';

const INSTALL_GIT = {
  win32: 'install Git for Windows from https://git-scm.com/download/win (or run ' +
    '`winget install --id Git.Git -e`), then close and reopen Claude',
  darwin: 'run `xcode-select --install`, which installs Apple\'s developer tools with Git ' +
    'in them, then close and reopen Claude',
  linux: 'install it with the system\'s package manager, for example `sudo apt install git`',
};

// One line per missing thing, each written for Claude to put into plain words: what the user
// loses, and the fix. An empty list means nothing is missing.
export function missingTools(root, { spawn = spawnSync, platform = process.platform } = {}) {
  const git = (args) => spawn('git', args, { cwd: root, encoding: 'utf8', timeout: 10_000 });

  const version = git(['--version']);
  if (version.error || version.status !== 0) {
    // Everything below needs git, so one line says it all.
    return ['Git is not installed. Without it there are no saved versions to go back to, and ' +
      `nothing can be published. The fix: ${INSTALL_GIT[platform] ?? INSTALL_GIT.linux}.`];
  }

  const missing = [];
  const unset = ['user.name', 'user.email'].filter((key) => {
    const r = git(['config', key]);
    return r.error || r.status !== 0 || !r.stdout.trim();
  });
  if (unset.length) {
    missing.push('Git has no name and email to sign saved versions with, so saving a version ' +
      'fails. The fix: ask the user which name and email to use, then run `git config --global ' +
      'user.name "<name>"` and `git config --global user.email "<email>"`. Do not guess them.');
  }
  return missing;
}
