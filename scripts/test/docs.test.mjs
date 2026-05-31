// Phase 1 structural checks: ADR 0007 + cross-platform doc edits.
// Run: node --test scripts/test/docs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(repoRoot, rel), 'utf8');

test('ADR 0007 exists and follows the decision template', () => {
    const decisionsDir = join(repoRoot, 'docs', 'decisions');
    const adr = readdirSync(decisionsDir).find((f) => /^0007-.*\.md$/.test(f));
    assert.ok(adr, 'expected docs/decisions/0007-*.md to exist');

    const body = read(join('docs', 'decisions', adr));
    for (const heading of ['## Status', '## Context', '## Decision', '## Consequences']) {
        assert.ok(body.includes(heading), `ADR 0007 missing heading "${heading}"`);
    }
});

test('overview.md drops Windows-only target language', () => {
    const body = read(join('docs', 'product', 'overview.md'));
    assert.doesNotMatch(body, /Target OS: Windows/, 'overview.md still pins Windows-only target');
});

test('non-functional-requirements.md drops the PowerShell sidecar script reference', () => {
    const body = read(join('docs', 'product', 'non-functional-requirements.md'));
    assert.doesNotMatch(body, /download-sidecar\.ps1/, 'NFR doc still references download-sidecar.ps1');
});

test('README has a Releases section and macOS Gatekeeper note', () => {
    const body = read('README.md');
    assert.match(body, /##\s+Releases/, 'README missing "## Releases" section');
    assert.match(body, /xattr -cr/, 'README missing macOS Gatekeeper xattr note');
});
