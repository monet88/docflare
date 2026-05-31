// Phase 4: merge per-target latest.json fragments into one multi-platform manifest.
// Run: node --test scripts/test/merge-updater.test.mjs
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const mergeScript = join(scriptDir, 'merge-updater-manifest.mjs');

let work;
beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'merge-updater-'));
});
afterEach(() => {
    rmSync(work, { recursive: true, force: true });
});

function fragment(platformKey, version = '0.1.0') {
    return {
        version,
        notes: 'test',
        pub_date: '2026-05-31T00:00:00Z',
        platforms: {
            [platformKey]: {
                signature: `sig-${platformKey}`,
                url: `https://example/download/${platformKey}.tar.gz`,
            },
        },
    };
}

function writeFragments(dir, fragments) {
    mkdirSync(dir, { recursive: true });
    fragments.forEach((f, i) => {
        writeFileSync(join(dir, `latest-${i}.json`), JSON.stringify(f));
    });
}

function runMerge(fragmentsDir, outFile) {
    return execFileSync('node', [mergeScript, fragmentsDir, outFile], { encoding: 'utf8' });
}

test('merges 4 single-platform fragments into one manifest with 4 platform keys', () => {
    const fragDir = join(work, 'frags');
    const out = join(work, 'latest.json');
    writeFragments(fragDir, [
        fragment('darwin-aarch64'),
        fragment('darwin-x86_64'),
        fragment('linux-x86_64'),
        fragment('windows-x86_64'),
    ]);

    runMerge(fragDir, out);
    const merged = JSON.parse(readFileSync(out, 'utf8'));

    assert.equal(merged.version, '0.1.0');
    assert.deepEqual(
        Object.keys(merged.platforms).sort(),
        ['darwin-aarch64', 'darwin-x86_64', 'linux-x86_64', 'windows-x86_64'],
    );
    assert.equal(merged.platforms['linux-x86_64'].signature, 'sig-linux-x86_64');
});

test('fails when fewer than 4 platform keys result', () => {
    const fragDir = join(work, 'frags');
    const out = join(work, 'latest.json');
    writeFragments(fragDir, [fragment('darwin-aarch64'), fragment('linux-x86_64')]);

    assert.throws(
        () => runMerge(fragDir, out),
        /platform/i,
        'merge should reject a manifest with < 4 platform keys',
    );
});

test('fails when fragment versions disagree', () => {
    const fragDir = join(work, 'frags');
    const out = join(work, 'latest.json');
    writeFragments(fragDir, [
        fragment('darwin-aarch64', '0.1.0'),
        fragment('darwin-x86_64', '0.1.0'),
        fragment('linux-x86_64', '0.1.0'),
        fragment('windows-x86_64', '0.2.0'),
    ]);

    assert.throws(() => runMerge(fragDir, out), /version/i, 'merge should reject mismatched versions');
});
