// Phase 4/6: per-platform updater fragment builder.
// Run: node --test scripts/test/build-updater-fragment.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildScript = join(scriptDir, 'build-updater-fragment.mjs');

let work;
beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'frag-'));
});
afterEach(() => {
    rmSync(work, { recursive: true, force: true });
});

function run(args) {
    return execFileSync('node', [buildScript, ...args], { encoding: 'utf8' });
}

test('builds a valid single-platform fragment from a .sig file', () => {
    const sig = join(work, 'app.tar.gz.sig');
    writeFileSync(sig, 'SIGNATURE_CONTENT==\n');
    const out = join(work, 'frag.json');

    run([
        '--platform', 'darwin-aarch64',
        '--version', '1.2.3',
        '--sig', sig,
        '--url', 'https://example/download/app.tar.gz',
        '--out', out,
    ]);

    const frag = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(frag.version, '1.2.3');
    assert.deepEqual(Object.keys(frag.platforms), ['darwin-aarch64']);
    assert.equal(frag.platforms['darwin-aarch64'].signature, 'SIGNATURE_CONTENT==');
    assert.equal(frag.platforms['darwin-aarch64'].url, 'https://example/download/app.tar.gz');
});

test('rejects an invalid platform key', () => {
    const sig = join(work, 'x.sig');
    writeFileSync(sig, 'sig==');
    assert.throws(
        () => run(['--platform', 'plan9-sparc', '--version', '1.0.0', '--sig', sig, '--url', 'u', '--out', join(work, 'o.json')]),
        /invalid --platform/,
    );
});

test('rejects an empty signature file', () => {
    const sig = join(work, 'empty.sig');
    writeFileSync(sig, '   \n');
    assert.throws(
        () => run(['--platform', 'linux-x86_64', '--version', '1.0.0', '--sig', sig, '--url', 'u', '--out', join(work, 'o.json')]),
        /empty/,
    );
});

test('fragments from all 4 platforms merge into a complete manifest', () => {
    const mergeScript = join(scriptDir, 'merge-updater-manifest.mjs');
    const fragDir = join(work, 'frags');
    const platforms = ['darwin-aarch64', 'darwin-x86_64', 'linux-x86_64', 'windows-x86_64'];
    // build each fragment
    for (const p of platforms) {
        const sig = join(work, `${p}.sig`);
        writeFileSync(sig, `sig-${p}==`);
        run([
            '--platform', p,
            '--version', '0.1.0',
            '--sig', sig,
            '--url', `https://example/${p}`,
            '--out', join(work, 'frags', `latest-${p}.json`),
        ]);
    }
    const out = join(work, 'latest.json');
    execFileSync('node', [mergeScript, fragDir, out], { encoding: 'utf8' });

    assert.ok(existsSync(out));
    const merged = JSON.parse(readFileSync(out, 'utf8'));
    assert.deepEqual(Object.keys(merged.platforms).sort(), [...platforms].sort());
});
