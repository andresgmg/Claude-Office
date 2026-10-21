import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findGitDir, readGitBranch } from '../src/gitBranch.js';

describe('readGitBranch', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-office-git-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeHead(gitDir: string, content: string): void {
    fs.mkdirSync(gitDir, { recursive: true });
    fs.writeFileSync(path.join(gitDir, 'HEAD'), content);
  }

  it('returns the checked-out branch from .git/HEAD', () => {
    writeHead(path.join(root, '.git'), 'ref: refs/heads/main\n');
    expect(readGitBranch(root)).toBe('main');
  });

  it('keeps slashes in branch names', () => {
    writeHead(path.join(root, '.git'), 'ref: refs/heads/feature/detail-panel\n');
    expect(readGitBranch(root)).toBe('feature/detail-panel');
  });

  it('walks up from a subdirectory to the repository root', () => {
    writeHead(path.join(root, '.git'), 'ref: refs/heads/develop\n');
    const deep = path.join(root, 'server', 'src', 'providers');
    fs.mkdirSync(deep, { recursive: true });
    expect(readGitBranch(deep)).toBe('develop');
    expect(findGitDir(deep)).toBe(path.join(root, '.git'));
  });

  it('reports a detached HEAD as the short commit SHA', () => {
    writeHead(path.join(root, '.git'), 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678\n');
    expect(readGitBranch(root)).toBe('a1b2c3d');
  });

  it('follows a .git file (worktree) to its gitdir', () => {
    const worktreeGitDir = path.join(root, 'main', '.git', 'worktrees', 'wt');
    writeHead(worktreeGitDir, 'ref: refs/heads/wt-branch\n');
    const worktree = path.join(root, 'wt');
    fs.mkdirSync(worktree, { recursive: true });
    fs.writeFileSync(path.join(worktree, '.git'), `gitdir: ${worktreeGitDir}\n`);
    expect(readGitBranch(worktree)).toBe('wt-branch');
  });

  it('resolves a relative gitdir against the directory holding the .git file', () => {
    const worktreeGitDir = path.join(root, 'main', '.git', 'worktrees', 'wt');
    writeHead(worktreeGitDir, 'ref: refs/heads/relative\n');
    const worktree = path.join(root, 'wt');
    fs.mkdirSync(worktree, { recursive: true });
    fs.writeFileSync(path.join(worktree, '.git'), 'gitdir: ../main/.git/worktrees/wt\n');
    expect(readGitBranch(worktree)).toBe('relative');
  });

  it('returns undefined outside a repository', () => {
    const plain = path.join(root, 'not-a-repo');
    fs.mkdirSync(plain);
    expect(readGitBranch(plain)).toBeUndefined();
    expect(findGitDir(plain)).toBeUndefined();
  });

  it('returns undefined when HEAD is missing or unparseable', () => {
    fs.mkdirSync(path.join(root, '.git'));
    expect(readGitBranch(root)).toBeUndefined();
    fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'garbage\n');
    expect(readGitBranch(root)).toBeUndefined();
  });

  it('returns undefined for a directory that does not exist', () => {
    expect(readGitBranch(path.join(root, 'missing', 'deeper'))).toBeUndefined();
  });
});
