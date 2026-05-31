#!/usr/bin/env node
// Re-verify already-placed sidecar binaries against the manifest. No network.
// Binaries land EXTRACTED in --out (download-sidecar extracts tgz before placing),
// so verify hashes each placed file as-is against the manifest sha256.
//
// Usage:
//   node scripts/verify-sidecar.mjs --all
//   node scripts/verify-sidecar.mjs --target <triple>
//   node scripts/verify-sidecar.mjs --all --manifest <path> --out <dir>
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadManifest, verifyHash } from './lib/manifest.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');

function parseArgs(argv) {
    const args = { manifest: join(scriptDir, 'sidecar-manifest.json'), out: join(repoRoot, 'src-tauri', 'binaries') };
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--all') args.all = true;
        else if (a === '--target') args.target = argv[++i];
        else if (a === '--manifest') args.manifest = argv[++i];
        else if (a === '--out') args.out = argv[++i];
        else throw new Error(`unknown argument "${a}"`);
    }
    return args;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const manifest = loadManifest(args.manifest);

    // --target takes precedence over --all so that `npm run verify-sidecar -- --target X`
    // (which expands to `--all --target X` via the package.json default) verifies only X.
    let targets;
    if (args.target) {
        if (!manifest.targets[args.target]) {
            throw new Error(`unknown target "${args.target}"; valid: ${Object.keys(manifest.targets).join(', ')}`);
        }
        targets = [args.target];
    } else if (args.all) {
        targets = Object.keys(manifest.targets);
    } else {
        throw new Error('specify --all or --target <triple>');
    }

    let failures = 0;
    for (const t of targets) {
        const entry = manifest.targets[t];
        const path = join(args.out, entry.outName);
        if (!existsSync(path)) {
            console.error(`MISSING ${t}: ${path}`);
            failures += 1;
            continue;
        }
        if (verifyHash(path, entry.sha256)) {
            console.log(`ok ${t}: ${entry.outName}`);
        } else {
            console.error(`FAIL ${t}: ${entry.outName} hash mismatch (expected ${entry.sha256})`);
            failures += 1;
        }
    }

    if (failures > 0) {
        console.error(`${failures} target(s) failed verification`);
        process.exit(1);
    }
}

main();
