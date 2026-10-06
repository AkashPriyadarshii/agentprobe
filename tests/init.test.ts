import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { scaffoldAgentManifests } from '../src/scaffolder/init.js';

describe('Scaffolder (init)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentprobe-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('scaffolds llms.txt and robots.txt in empty dir', () => {
    const { createdFiles } = scaffoldAgentManifests({
      dir: tmpDir,
      name: 'TestProject',
      description: 'Test description',
    });

    expect(createdFiles.length).toBe(2);
    expect(fs.existsSync(path.join(tmpDir, 'llms.txt'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, 'robots.txt'))).toBe(true);

    const llms = fs.readFileSync(path.join(tmpDir, 'llms.txt'), 'utf-8');
    expect(llms).toContain('# TestProject');
    expect(llms).toContain('> Test description');

    const robots = fs.readFileSync(path.join(tmpDir, 'robots.txt'), 'utf-8');
    expect(robots).toContain('User-agent: GPTBot');
    expect(robots).toContain('Allow: /');
  });

  it('scaffolds into public/ folder when public/ exists', () => {
    const publicDir = path.join(tmpDir, 'public');
    fs.mkdirSync(publicDir);

    const { createdFiles } = scaffoldAgentManifests({
      dir: tmpDir,
      name: 'ViteApp',
    });

    expect(fs.existsSync(path.join(publicDir, 'llms.txt'))).toBe(true);
    expect(fs.existsSync(path.join(publicDir, 'robots.txt'))).toBe(true);
  });
});
