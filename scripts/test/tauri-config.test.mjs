// Phase 3: tauri.conf.json bundle + updater + capability assertions.
// Run: node --test scripts/test/tauri-config.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (rel) => JSON.parse(readFileSync(join(repoRoot, rel), 'utf8'));

const EXPECTED_TARGETS = ['app', 'appimage', 'deb', 'dmg', 'nsis'];
const REQUIRED_DEB_DEPS = ['libwebkit2gtk-4.1-0', 'libgtk-3-0', 'libayatana-appindicator3-1'];

test('bundle is active', () => {
    const conf = readJson('src-tauri/tauri.conf.json');
    assert.equal(conf.bundle.active, true);
});

test('bundle creates updater artifacts (required for latest.json generation)', () => {
    const conf = readJson('src-tauri/tauri.conf.json');
    assert.equal(
        conf.bundle.createUpdaterArtifacts,
        true,
        'bundle.createUpdaterArtifacts must be true or tauri-action cannot produce latest.json',
    );
});

test('bundle targets are exactly the 5 expected (order-independent)', () => {
    const conf = readJson('src-tauri/tauri.conf.json');
    assert.ok(Array.isArray(conf.bundle.targets), 'bundle.targets must be an array');
    assert.deepEqual([...conf.bundle.targets].sort(), EXPECTED_TARGETS);
});

test('externalBin references binaries/cloudflared', () => {
    const conf = readJson('src-tauri/tauri.conf.json');
    assert.ok(
        (conf.bundle.externalBin || []).includes('binaries/cloudflared'),
        'bundle.externalBin must include "binaries/cloudflared"',
    );
});

test('linux deb depends lists the 3 required packages', () => {
    const conf = readJson('src-tauri/tauri.conf.json');
    const depends = conf.bundle?.linux?.deb?.depends || [];
    for (const pkg of REQUIRED_DEB_DEPS) {
        assert.ok(depends.includes(pkg), `deb.depends missing "${pkg}"`);
    }
});

test('macOS minimumSystemVersion is set', () => {
    const conf = readJson('src-tauri/tauri.conf.json');
    assert.equal(conf.bundle?.macOS?.minimumSystemVersion, '10.15');
});

test('updater plugin is active with a valid endpoint and pubkey', () => {
    const conf = readJson('src-tauri/tauri.conf.json');
    const updater = conf.plugins?.updater;
    assert.ok(updater, 'plugins.updater missing');
    assert.equal(updater.active, true);
    assert.ok(Array.isArray(updater.endpoints) && updater.endpoints.length > 0, 'no updater endpoints');
    assert.ok(
        updater.endpoints[0].endsWith('/releases/latest/download/latest.json'),
        `unexpected endpoint: ${updater.endpoints[0]}`,
    );
    assert.doesNotMatch(updater.endpoints[0], /<owner>/, 'updater endpoint still has <owner> placeholder');
    assert.ok(updater.pubkey && updater.pubkey !== '<TODO>', 'updater pubkey empty or TODO');
});

test('default capability grants updater:default', () => {
    const cap = readJson('src-tauri/capabilities/default.json');
    assert.ok((cap.permissions || []).includes('updater:default'), 'capability missing updater:default');
});
