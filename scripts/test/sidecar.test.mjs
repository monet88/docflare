// Phase 2: sidecar manifest parsing + hash-source verification.
// Run: node --test scripts/test/sidecar.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    loadManifest,
    resolveAsset,
    verifyHash,
    hashTarget,
} from '../lib/manifest.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, 'fixtures');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

let workDir;
let rawFile;
let rawHash;
let tgzFile;
let innerHash;

before(() => {
    workDir = mkdtempSync(join(tmpdir(), 'sidecar-test-'));

    // Raw-binary fixture: hash of the downloaded file itself.
    const rawBytes = Buffer.from('raw cloudflared binary contents\n');
    rawFile = join(workDir, 'cloudflared-linux-amd64');
    writeFileSync(rawFile, rawBytes);
    rawHash = sha256(rawBytes);

    // tgz fixture: archive contains a file named `cloudflared`; the published
    // checksum is the hash of that EXTRACTED file, not the archive.
    const innerBytes = Buffer.from('extracted darwin binary contents\n');
    innerHash = sha256(innerBytes);
    const stageDir = join(workDir, 'stage');
    mkdirSync(stageDir);
    writeFileSync(join(stageDir, 'cloudflared'), innerBytes);
    tgzFile = join(workDir, 'cloudflared-darwin-arm64.tgz');
    execFileSync('tar', ['-czf', tgzFile, '-C', stageDir, 'cloudflared']);
});

after(() => {
    rmSync(workDir, { recursive: true, force: true });
});

test('loadManifest rejects manifest missing cloudflaredVersion', () => {
    const tmp = join(workDir, 'no-version.json');
    writeFileSync(tmp, JSON.stringify({ targets: {} }));
    assert.throws(() => loadManifest(tmp), /cloudflaredVersion/);
});

test('loadManifest rejects a target entry missing required fields', () => {
    const tmp = join(workDir, 'bad-target.json');
    writeFileSync(
        tmp,
        JSON.stringify({
            cloudflaredVersion: '2026.5.2',
            downloadUrlTemplate: 'https://example/{version}/{asset}',
            targets: { 'x86_64-unknown-linux-gnu': { asset: 'x' } }, // missing sha256/outName/hashOf
        }),
    );
    assert.throws(() => loadManifest(tmp), /x86_64-unknown-linux-gnu/);
});

test('loadManifest accepts the valid fixture', () => {
    const m = loadManifest(join(fixturesDir, 'manifest-valid.json'));
    assert.equal(m.cloudflaredVersion, '2026.5.2');
    assert.equal(Object.keys(m.targets).length, 4);
});

test('resolveAsset returns the correct URL for each of the 4 targets', () => {
    const m = loadManifest(join(fixturesDir, 'manifest-valid.json'));
    const cases = {
        'x86_64-pc-windows-msvc': 'cloudflared-windows-amd64.exe',
        'x86_64-unknown-linux-gnu': 'cloudflared-linux-amd64',
        'aarch64-apple-darwin': 'cloudflared-darwin-arm64.tgz',
        'x86_64-apple-darwin': 'cloudflared-darwin-amd64.tgz',
    };
    for (const [target, asset] of Object.entries(cases)) {
        const url = resolveAsset(m, target);
        assert.ok(url.endsWith(`/2026.5.2/${asset}`), `${target} -> ${url}`);
        assert.ok(url.startsWith('https://github.com/cloudflare/cloudflared/'), url);
    }
});

test('resolveAsset throws on an unknown target', () => {
    const m = loadManifest(join(fixturesDir, 'manifest-valid.json'));
    assert.throws(() => resolveAsset(m, 'bogus-triple'), /bogus-triple/);
});

test('verifyHash returns true on match and false on mismatch', () => {
    assert.equal(verifyHash(rawFile, rawHash), true);
    assert.equal(verifyHash(rawFile, 'deadbeef'), false);
});

test('hashTarget hashes the DOWNLOADED file for raw-binary targets', () => {
    const entry = { extract: null, hashOf: 'download' };
    assert.equal(hashTarget(rawFile, entry), rawHash);
});

test('hashTarget hashes the EXTRACTED binary for tgz targets', () => {
    const entry = { extract: 'tgz:cloudflared', hashOf: 'extracted' };
    const got = hashTarget(tgzFile, entry);
    assert.equal(got, innerHash);
    // Proves it is NOT hashing the archive itself.
    assert.notEqual(got, sha256(execFileSync('cat', [tgzFile])));
});

test('verify-sidecar: --target takes precedence over --all (regression: package.json default --all)', () => {
    // package.json runs `verify-sidecar.mjs --all`; workflows append `-- --target X`,
    // yielding argv `--all --target X`. The script MUST verify only X, not all 4,
    // because CI only downloads the single matrix target.
    const verifyScript = join(here, '..', 'verify-sidecar.mjs');

    // Build a temp manifest with 2 targets, but only place the binary for ONE.
    const innerBytes = Buffer.from('only-one-target-present\n');
    const innerHash = createHash('sha256').update(innerBytes).digest('hex');
    const present = 'x86_64-unknown-linux-gnu';
    const absent = 'x86_64-pc-windows-msvc';

    const tmpManifest = join(workDir, 'precedence-manifest.json');
    writeFileSync(
        tmpManifest,
        JSON.stringify({
            cloudflaredVersion: '2026.5.2',
            downloadUrlTemplate: 'https://github.com/cloudflare/cloudflared/releases/download/{version}/{asset}',
            targets: {
                [present]: { asset: 'a', sha256: innerHash, outName: 'cloudflared-present', extract: null, hashOf: 'download' },
                [absent]: { asset: 'b', sha256: 'deadbeef', outName: 'cloudflared-absent.exe', extract: null, hashOf: 'download' },
            },
        }),
    );

    const outDir = join(workDir, 'bins-precedence');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'cloudflared-present'), innerBytes); // absent target's file deliberately missing

    // `--all --target present` must succeed (verify only the present target).
    const args = ['--all', '--target', present, '--manifest', tmpManifest, '--out', outDir];
    assert.doesNotThrow(
        () => execFileSync('node', [verifyScript, ...args], { stdio: 'pipe' }),
        'verify-sidecar with --all --target <present> must verify only that target and pass',
    );

    // Sanity: plain `--all` (both targets) must FAIL because the absent one is missing.
    assert.throws(
        () => execFileSync('node', [verifyScript, '--all', '--manifest', tmpManifest, '--out', outDir], { stdio: 'pipe' }),
        'verify-sidecar --all must fail when a target binary is missing',
    );
});
