import * as fs from 'node:fs';
import * as path from 'node:path';

import { GIT_DIR_SEARCH_MAX_DEPTH } from './constants.js';

/** Characters of a detached HEAD's SHA shown as the "branch". */
const DETACHED_SHA_LENGTH = 7;

/**
 * Locate the `.git` directory governing `dir`, walking up to the filesystem
 * root. A `.git` FILE (worktree, submodule) holds `gitdir: <path>` and is
 * followed once, so a worktree reports its own HEAD, not the main checkout's.
 *
 * No subprocess: reading two small files is what `git rev-parse` would do
 * anyway, works the same on Windows, and keeps the 30 s refresh free.
 */
export function findGitDir(dir: string): string | undefined {
  let current = path.resolve(dir);
  for (let depth = 0; depth < GIT_DIR_SEARCH_MAX_DEPTH; depth++) {
    const candidate = path.join(current, '.git');
    let stat: fs.Stats | undefined;
    try {
      stat = fs.statSync(candidate);
    } catch {
      stat = undefined;
    }
    if (stat?.isDirectory()) return candidate;
    if (stat?.isFile()) return resolveGitDirFile(candidate, current);
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return undefined;
}

function resolveGitDirFile(file: string, base: string): string | undefined {
  try {
    const match = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(file, 'utf8'));
    if (!match) return undefined;
    const target = match[1].trim();
    return path.isAbsolute(target) ? target : path.resolve(base, target);
  } catch {
    return undefined;
  }
}

/**
 * The branch checked out at `dir`, or the short SHA when HEAD is detached.
 * Undefined when `dir` is not inside a repository or HEAD cannot be read.
 */
export function readGitBranch(dir: string): string | undefined {
  const gitDir = findGitDir(dir);
  if (!gitDir) return undefined;
  let head: string;
  try {
    head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
  } catch {
    return undefined;
  }
  const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
  if (ref) return ref[1].trim();
  if (/^[0-9a-f]{40}$/i.test(head)) return head.slice(0, DETACHED_SHA_LENGTH);
  return undefined;
}
