import '../tests/env.js';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeDeepTool } from './tools.js';

let sandboxRoot: string;

beforeEach(async () => {
  // Create a fresh isolated sandbox for each test
  sandboxRoot = await mkdtemp(join(tmpdir(), 'nexus-tools-test-'));
  // Populate with a small set of known files
  await writeFile(join(sandboxRoot, 'hello.txt'), 'hello world');
  await mkdir(join(sandboxRoot, 'subdir'));
  await writeFile(join(sandboxRoot, 'subdir', 'nested.txt'), 'nested content');
});

afterEach(async () => {
  await rm(sandboxRoot, { recursive: true, force: true });
});

// ──────────────────────────────────────────────
// read_file – directory traversal
// ──────────────────────────────────────────────
describe('executeDeepTool – read_file sandbox enforcement', () => {
  it('reads a legitimate file inside the sandbox', async () => {
    const result = await executeDeepTool('read_file', { file_path: 'hello.txt' }, sandboxRoot);
    expect(result).toBe('hello world');
  });

  it('rejects a basic ../ traversal attempt', async () => {
    const result = await executeDeepTool('read_file', { file_path: '../etc/passwd' }, sandboxRoot);
    expect(result).toBe('Error: invalid path');
  });

  it('rejects a multi-step traversal attempt', async () => {
    const result = await executeDeepTool('read_file', { file_path: '../../etc/shadow' }, sandboxRoot);
    expect(result).toBe('Error: invalid path');
  });

  it('rejects an absolute path outside the sandbox', async () => {
    const result = await executeDeepTool('read_file', { file_path: '/etc/passwd' }, sandboxRoot);
    expect(result).toBe('Error: invalid path');
  });

  it('rejects a path that resolves exactly to the sandbox root (not a file)', async () => {
    const result = await executeDeepTool('read_file', { file_path: '.' }, sandboxRoot);
    expect(result).toBe('Error: not a file');
  });

  it('rejects subdir/../.. traversal that escapes sandbox', async () => {
    const result = await executeDeepTool('read_file', { file_path: 'subdir/../../etc/hostname' }, sandboxRoot);
    expect(result).toBe('Error: invalid path');
  });

  it('rejects URL-encoded traversal (%2e%2e)', async () => {
    // Node resolve() decodes percent-encoding; the resolved path must still be rejected
    const result = await executeDeepTool('read_file', { file_path: '%2e%2e/etc/passwd' }, sandboxRoot);
    // The file won't exist with that literal name, so we expect either invalid path or an error
    expect(result).toMatch(/Error/i);
  });

  it('rejects a path targeting a sensitive .env file name pattern', async () => {
    await writeFile(join(sandboxRoot, '.env'), 'SECRET=x');
    const result = await executeDeepTool('read_file', { file_path: '.env' }, sandboxRoot);
    expect(result).toBe('Error: invalid path');
  });

  it('rejects a path targeting .env.local', async () => {
    await writeFile(join(sandboxRoot, '.env.local'), 'SECRET=local');
    const result = await executeDeepTool('read_file', { file_path: '.env.local' }, sandboxRoot);
    expect(result).toBe('Error: invalid path');
  });

  it('returns an error when file_path is not provided', async () => {
    const result = await executeDeepTool('read_file', {}, sandboxRoot);
    expect(result).toBe('Error: file_path is required');
  });
});

// ──────────────────────────────────────────────
// list_directory – directory traversal
// ──────────────────────────────────────────────
describe('executeDeepTool – list_directory sandbox enforcement', () => {
  it('lists a legitimate directory inside the sandbox', async () => {
    const result = await executeDeepTool('list_directory', { directory_path: '.' }, sandboxRoot);
    expect(result).toContain('hello.txt');
  });

  it('rejects a ../ traversal for directory listing', async () => {
    const result = await executeDeepTool('list_directory', { directory_path: '../' }, sandboxRoot);
    expect(result).toBe('Error: invalid path');
  });

  it('rejects an absolute path outside the sandbox', async () => {
    const result = await executeDeepTool('list_directory', { directory_path: '/tmp' }, sandboxRoot);
    expect(result).toBe('Error: invalid path');
  });

  it('does not expose .git contents even if present', async () => {
    await mkdir(join(sandboxRoot, '.git'));
    await writeFile(join(sandboxRoot, '.git', 'config'), '[core]');
    const result = await executeDeepTool('list_directory', { directory_path: '.' }, sandboxRoot);
    expect(result).not.toContain('.git');
  });

  it('does not expose node_modules even if present', async () => {
    await mkdir(join(sandboxRoot, 'node_modules'));
    const result = await executeDeepTool('list_directory', { directory_path: '.' }, sandboxRoot);
    expect(result).not.toContain('node_modules');
  });
});

// ──────────────────────────────────────────────
// file_info – directory traversal
// ──────────────────────────────────────────────
describe('executeDeepTool – file_info sandbox enforcement', () => {
  it('returns metadata for a file inside the sandbox', async () => {
    const result = await executeDeepTool('file_info', { file_path: 'hello.txt' }, sandboxRoot);
    expect(result).toContain('Size:');
    expect(result).toContain('Modified:');
  });

  it('rejects a ../ traversal for file_info', async () => {
    const result = await executeDeepTool('file_info', { file_path: '../etc/passwd' }, sandboxRoot);
    expect(result).toBe('Error: invalid path');
  });

  it('rejects an absolute path for file_info', async () => {
    const result = await executeDeepTool('file_info', { file_path: '/etc/passwd' }, sandboxRoot);
    expect(result).toBe('Error: invalid path');
  });
});

// ──────────────────────────────────────────────
// git_blame – directory traversal
// ──────────────────────────────────────────────
describe('executeDeepTool – git_blame sandbox enforcement', () => {
  it('rejects a traversal path in git_blame', async () => {
    const result = await executeDeepTool('git_blame', { file_path: '../../etc/passwd' }, sandboxRoot);
    expect(result).toBe('Error: invalid path');
  });
});

// ──────────────────────────────────────────────
// unknown tool
// ──────────────────────────────────────────────
describe('executeDeepTool – unknown tool', () => {
  it('returns an error for an unknown tool name', async () => {
    const result = await executeDeepTool('rm_rf', { path: '/' }, sandboxRoot);
    expect(result).toBe('Unknown tool: rm_rf');
  });
});
