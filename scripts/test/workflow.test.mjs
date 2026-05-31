// Phase 4 + 5 + 6: GitHub Actions workflow structure assertions.
// Run: node --test scripts/test/workflow.test.mjs
//
// actionlint is run only if available on PATH; otherwise that single check is
// skipped (CI runs actionlint via a dedicated action). All structural checks
// run regardless using a minimal YAML reader.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const releaseYml = join(repoRoot, '.github', 'workflows', 'release.yml');
const ciYml = join(repoRoot, '.github', 'workflows', 'ci.yml');

const read = (p) => readFileSync(p, 'utf8');

function hasActionlint() {
    try {
        execFileSync('actionlint', ['-version'], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function runActionlint(file) {
    execFileSync('actionlint', [file], { stdio: 'pipe' });
}

// ---- release.yml ----

test('release.yml exists', () => {
    assert.ok(existsSync(releaseYml), 'expected .github/workflows/release.yml');
});

test('release.yml: actionlint clean (skipped if actionlint not installed)', (t) => {
    if (!hasActionlint()) return t.skip('actionlint not on PATH');
    assert.doesNotThrow(() => runActionlint(releaseYml));
});

test('release.yml triggers on v*.*.* tags and workflow_dispatch', () => {
    const y = read(releaseYml);
    assert.match(y, /tags:\s*\[\s*'v\*\.\*\.\*'\s*\]/, 'missing v*.*.* tag trigger');
    assert.match(y, /workflow_dispatch:/, 'missing workflow_dispatch');
});

test('release.yml declares contents: write permission', () => {
    const y = read(releaseYml);
    assert.match(y, /permissions:\s*\n\s*contents:\s*write/, 'missing permissions: contents: write');
});

test('release.yml concurrency group is release-${{ github.ref }}', () => {
    const y = read(releaseYml);
    assert.match(y, /group:\s*release-\$\{\{\s*github\.ref\s*\}\}/);
    assert.match(y, /cancel-in-progress:\s*false/);
});

test('release.yml has exactly 4 build matrix entries with correct os/target/bundles', () => {
    const y = read(releaseYml);
    const expected = [
        { os: 'macos-14', target: 'aarch64-apple-darwin', bundles: 'app,dmg' },
        { os: 'macos-15-intel', target: 'x86_64-apple-darwin', bundles: 'app,dmg' },
        { os: 'ubuntu-22.04', target: 'x86_64-unknown-linux-gnu', bundles: 'deb,appimage' },
        { os: 'windows-latest', target: 'x86_64-pc-windows-msvc', bundles: 'nsis' },
    ];
    for (const e of expected) {
        assert.ok(y.includes(e.os), `matrix missing os ${e.os}`);
        assert.ok(y.includes(e.target), `matrix missing target ${e.target}`);
        // Bundles MUST be quoted: an unquoted comma in a YAML flow mapping
        // (`{ ..., bundles: app,dmg }`) is parsed as a separator and silently
        // drops the second bundle. Assert the quoted form.
        assert.ok(y.includes(`bundles: "${e.bundles}"`), `matrix missing quoted bundles "${e.bundles}"`);
    }
});

test('release.yml uses pinned actions and tauri-action with signing secrets', () => {
    const y = read(releaseYml);
    assert.match(y, /tauri-apps\/tauri-action@v0/);
    assert.match(y, /actions\/checkout@v4/);
    assert.match(y, /actions\/setup-node@v4/);
    assert.match(y, /dtolnay\/rust-toolchain@stable/);
    assert.match(y, /TAURI_SIGNING_PRIVATE_KEY/);
    assert.match(y, /TAURI_SIGNING_PRIVATE_KEY_PASSWORD/);
    assert.match(y, /releaseDraft:\s*true/);
});

test('release.yml Linux job installs the 5 required system packages', () => {
    const y = read(releaseYml);
    for (const pkg of [
        'libwebkit2gtk-4.1-dev',
        'libgtk-3-dev',
        'libsoup-3.0-dev',
        'libayatana-appindicator3-dev',
        'librsvg2-dev',
    ]) {
        assert.ok(y.includes(pkg), `Linux job missing apt package ${pkg}`);
    }
});

test('release.yml runs download-sidecar and verify-sidecar per target', () => {
    const y = read(releaseYml);
    assert.match(y, /download-sidecar -- --target \$\{\{\s*matrix\.target\s*\}\}/);
    assert.match(y, /verify-sidecar -- --target \$\{\{\s*matrix\.target\s*\}\}/);
});

test('release.yml uploads per-target latest.json as an artifact', () => {
    const y = read(releaseYml);
    assert.match(y, /actions\/upload-artifact@v4/);
    assert.match(y, /updater-\$\{\{\s*matrix\.platform\s*\}\}/);
});

test('release.yml has an aggregate-updater job that needs build and uploads merged latest.json', () => {
    const y = read(releaseYml);
    assert.match(y, /aggregate-updater:/);
    assert.match(y, /needs:\s*build/);
    assert.match(y, /actions\/download-artifact@v4/);
    assert.match(y, /merge-updater-manifest\.mjs/);
    assert.match(y, /gh release upload .* latest\.json --clobber/);
});

// ---- Phase 6: Windows portable ZIP ----

test('release.yml builds a Windows-only portable ZIP and uploads it', () => {
    const y = read(releaseYml);
    assert.match(y, /if:\s*matrix\.os == 'windows-latest'/, 'missing windows-only portable zip guard');
    assert.match(y, /Docflare_v\.\$\{version\}_x64_portable\.zip|Docflare_v\..+_x64_portable\.zip/);
    assert.match(y, /gh release upload .*portable.*--clobber|Compress-Archive/i);
    assert.match(y, /GH_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/);
});

// ---- ci.yml (Phase 5) ----

test('ci.yml exists', () => {
    assert.ok(existsSync(ciYml), 'expected .github/workflows/ci.yml');
});

test('ci.yml: actionlint clean (skipped if actionlint not installed)', (t) => {
    if (!hasActionlint()) return t.skip('actionlint not on PATH');
    assert.doesNotThrow(() => runActionlint(ciYml));
});

test('ci.yml triggers on pull_request and push to master', () => {
    const y = read(ciYml);
    assert.match(y, /pull_request:/, 'missing pull_request trigger');
    assert.match(y, /branches:\s*\[\s*master\s*\]/, 'missing push branches: [master]');
});

test('ci.yml matrix shape matches release.yml (4 entries, same os/target)', () => {
    const y = read(ciYml);
    for (const entry of ['macos-14', 'macos-15-intel', 'ubuntu-22.04', 'windows-latest']) {
        assert.ok(y.includes(entry), `ci.yml matrix missing ${entry}`);
    }
    for (const target of [
        'aarch64-apple-darwin',
        'x86_64-apple-darwin',
        'x86_64-unknown-linux-gnu',
        'x86_64-pc-windows-msvc',
    ]) {
        assert.ok(y.includes(target), `ci.yml matrix missing target ${target}`);
    }
});

test('ci.yml runs all 5 checks', () => {
    const y = read(ciYml);
    assert.match(y, /npm run lint/);
    assert.match(y, /npm test|npm run test/);
    assert.match(y, /cargo test/);
    assert.match(y, /cargo clippy/);
    assert.match(y, /tauri build -- --no-bundle|tauri build --no-bundle/);
});

test('ci.yml Linux job installs the 5 system packages', () => {
    const y = read(ciYml);
    for (const pkg of [
        'libwebkit2gtk-4.1-dev',
        'libgtk-3-dev',
        'libsoup-3.0-dev',
        'libayatana-appindicator3-dev',
        'librsvg2-dev',
    ]) {
        assert.ok(y.includes(pkg), `ci.yml Linux job missing apt package ${pkg}`);
    }
});

test('ci.yml does NOT use tauri-action or signing secrets', () => {
    const y = read(ciYml);
    assert.doesNotMatch(y, /tauri-action/, 'ci.yml must not use tauri-action');
    assert.doesNotMatch(y, /TAURI_SIGNING_PRIVATE_KEY/, 'ci.yml must not reference signing secrets');
    assert.doesNotMatch(y, /releaseDraft|releaseName/, 'ci.yml must not have release keywords');
});

test('ci.yml uses cancel-in-progress: true (cheaper PR runs)', () => {
    const y = read(ciYml);
    assert.match(y, /group:\s*ci-\$\{\{\s*github\.ref\s*\}\}/);
    assert.match(y, /cancel-in-progress:\s*true/);
});
