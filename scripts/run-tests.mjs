#!/usr/bin/env node
// Portable test runner: discovers scripts/test/**/*.test.mjs explicitly and runs
// them via the Node test runner. Avoids relying on `node --test` glob support
// (added in Node 21) or shell glob expansion (differs on Windows), and FAILS
// LOUDLY if zero test files are found (a bare glob would exit 0 — false green).
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const testDir = join(dirname(fileURLToPath(import.meta.url)), 'test');

function findTests(dir) {
    const out = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            out.push(...findTests(full));
        } else if (entry.endsWith('.test.mjs')) {
            out.push(full);
        }
    }
    return out;
}

const files = findTests(testDir);
if (files.length === 0) {
    console.error(`error: no *.test.mjs files found under ${testDir}`);
    process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
