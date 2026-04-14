import { beforeEach, describe, expect, it, vi } from 'vitest';
import { otsUtil } from './otsUtils';
import { otsProtocol } from './otsProtocol';

type NodeEntry =
  | { kind: 'dir'; children: Set<string> }
  | { kind: 'file'; content: Uint8Array };

function makeFs(initialFiles: Record<string, Uint8Array | string> = {}) {
  const nodes = new Map<string, NodeEntry>();
  const mkdir = vi.fn(async (path: string) => {
    const existing = nodes.get(path);
    if (existing) throw new Error('EEXIST');
    ensureParent(path);
    nodes.set(path, { kind: 'dir', children: new Set() });
    linkChild(path);
  });

  const readdir = vi.fn(async (path: string) => {
    const node = nodes.get(path);
    if (!node || node.kind !== 'dir') throw new Error('ENOENT');
    return Array.from(node.children);
  });

  const stat = vi.fn(async (path: string) => {
    const node = nodes.get(path);
    if (!node) throw new Error('ENOENT');
    return { type: node.kind };
  });

  const readFile = vi.fn(async (path: string, encoding?: string) => {
    const node = nodes.get(path);
    if (!node || node.kind !== 'file') throw new Error('ENOENT');
    if (encoding === 'utf8') return new TextDecoder().decode(node.content);
    return node.content;
  });

  const writeFile = vi.fn(async (path: string, data: Uint8Array | string) => {
    ensureParent(path);
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    nodes.set(path, { kind: 'file', content: bytes });
    linkChild(path);
  });

  function ensureParent(path: string) {
    const parts = path.split('/').filter(Boolean);
    let current = '';
    if (!nodes.has('/')) nodes.set('/', { kind: 'dir', children: new Set() });
    for (let i = 0; i < parts.length - 1; i += 1) {
      current += `/${parts[i]}`;
      if (!nodes.has(current)) nodes.set(current, { kind: 'dir', children: new Set() });
      if (i === 0) {
        const root = nodes.get('/') as { kind: 'dir'; children: Set<string> };
        root.children.add(parts[i]);
      } else {
        const parent = nodes.get(current.slice(0, current.lastIndexOf('/')) || '/') as {
          kind: 'dir';
          children: Set<string>;
        };
        parent.children.add(parts[i]);
      }
    }
  }

  function linkChild(path: string) {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return;
    const name = parts[parts.length - 1];
    const parentPath = parts.length === 1 ? '/' : `/${parts.slice(0, -1).join('/')}`;
    const parent = nodes.get(parentPath);
    if (parent && parent.kind === 'dir') parent.children.add(name);
  }

  nodes.set('/', { kind: 'dir', children: new Set() });
  for (const [path, data] of Object.entries(initialFiles)) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    ensureParent(path);
    nodes.set(path, { kind: 'file', content: bytes });
    linkChild(path);
  }

  return {
    promises: { mkdir, readdir, stat, readFile, writeFile },
    _nodes: nodes,
  } as any;
}

describe('otsUtil', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('getAllFilesRecursive: excludes .git and /.tool/settings/ots', async () => {
    const fs = makeFs({
      '/app.txt': 'app',
      '/.git/config': 'x',
      '/.tool/settings/ots/pending.json': '{}',
      '/src/main.ts': 'console.log(1)',
    });

    const files = await otsUtil.getAllFilesRecursive(fs, '/');
    expect(files.sort()).toEqual(['/app.txt', '/src/main.ts']);
  });

  it('generateRepoHash: produces protocol-equivalent hash', async () => {
    const fs = makeFs({
      '/b.txt': 'b',
      '/a.txt': 'a',
      '/.tool/settings/ots/pending.json': '{}',
    });

    const actual = await otsUtil.generateRepoHash(fs, '/');

    const entries = [
      { path: 'a.txt', content: new TextEncoder().encode('a') },
      { path: 'b.txt', content: new TextEncoder().encode('b') },
    ];
    const expected = await otsProtocol.calculateHash(otsProtocol.generateTlvBytes(entries));

    expect(otsProtocol.bytesToHex(actual)).toBe(otsProtocol.bytesToHex(expected));
  });

  it('upgradeAll: returns empty when pending registry does not exist', async () => {
    const fs = makeFs();
    const result = await otsUtil.upgradeAll(fs);
    expect(result).toEqual({ confirmedHashes: [] });
  });

  it('upgradeAll: upgrades stale entry, rewrites ots, and removes registry record', async () => {
    const detached = {
      serializeToBytes: vi.fn(() => new Uint8Array([9, 9, 9])),
    };
    const ots = {
      DetachedTimestampFile: {
        deserialize: vi.fn(() => detached),
      },
      upgrade: vi.fn(async () => true),
    };
    (window as any).OpenTimestamps = ots;

    const fs = makeFs({
      '/.tool/settings/ots/pending.json': JSON.stringify({ abc123: null }),
      '/.tool/settings/ots/abc123.ots': new Uint8Array([1, 2, 3]),
    });

    const result = await otsUtil.upgradeAll(fs);
    expect(result).toEqual({ confirmedHashes: ['abc123'] });

    const pendingRaw = await fs.promises.readFile('/.tool/settings/ots/pending.json', 'utf8');
    expect(JSON.parse(pendingRaw)).toEqual({});

    const rewritten = await fs.promises.readFile('/.tool/settings/ots/abc123.ots');
    expect(Array.from(rewritten)).toEqual([9, 9, 9]);
    expect(ots.upgrade).toHaveBeenCalledTimes(1);
  });

  it('stampHash/getInfo: delegates to OpenTimestamps object', async () => {
    const detachedForStamp = {
      serializeToBytes: vi.fn(() => new Uint8Array([7, 7])),
    };
    const detachedForInfo = {};

    const stamp = vi.fn(async () => undefined);
    const info = vi.fn(() => 'ok');

    (window as any).OpenTimestamps = {
      DetachedTimestampFile: {
        fromHash: vi.fn(() => detachedForStamp),
        deserialize: vi.fn(() => detachedForInfo),
      },
      Ops: {
        OpSHA256: class {},
      },
      stamp,
      info,
    };

    const stamped = await otsUtil.stampHash(new Uint8Array([1, 2]));
    expect(Array.from(stamped)).toEqual([7, 7]);

    const text = otsUtil.getInfo(new Uint8Array([1]));
    expect(text).toBe('ok');
    expect(stamp).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(detachedForInfo);
  });
});
