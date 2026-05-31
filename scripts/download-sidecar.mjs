#!/usr/bin/env node
// Download + verify the pinned cloudflared sidecar for one or all Tauri targets.
// Cross-platform (Windows/macOS/Linux), Node 20+ stdlib + system `tar`.
//
// Usage:
//   node scripts/download-sidecar.mjs --target <triple>
//   node scripts/download-sidecar.mjs --all
//   node scripts/download-sidecar.mjs --target <triple> --manifest <path> --out <dir>
import { writeFileSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';

import { loadManifest, resolveAsset, hashTarget, extractTgzBinary } from './lib/manifest.mjs';

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

const ALLOWED_HOSTS = new Set([
    'github.com',
    'objects.githubusercontent.com',
    'release-assets.githubusercontent.com',
]);

async function fetchToBuffer(url) {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) {
        throw new Error(`download failed: ${res.status} ${res.statusText} for ${url}`);
    }
    const finalHost = new URL(res.url).hostname;
    if (!ALLOWED_HOSTS.has(finalHost)) {
        throw new Error(`refusing asset from unexpected host "${finalHost}" (${res.url})`);
    }
    return Buffer.from(await res.arrayBuffer());
}

async function downloadOne(manifest, target, outDir) {
    const entry = manifest.targets[target];
    if (!entry) throw new Error(`unknown target "${target}"`);
    if (!entry.sha256 || entry.sha256.includes('TODO')) {
        throw new Error(`manifest hash for ${target} is TODO; populate before CI`);
    }

    const url = resolveAsset(manifest, target);
    const buf = await fetchToBuffer(url);

    const tmpDir = mkdtempSync(join(tmpdir(), 'sidecar-dl-'));
    try {
        const tmpFile = join(tmpDir, entry.asset);
        writeFileSync(tmpFile, buf);

        const actual = hashTarget(tmpFile, entry);
        if (actual !== entry.sha256.toLowerCase()) {
            throw new Error(
                `SHA256 mismatch for ${target}\n  expected: ${entry.sha256}\n  actual:   ${actual}\n  (refusing to place a bad binary)`,
            );
        }

        // Determine the bytes to place: extracted inner binary for tgz, file as-is otherwise.
        const placedBytes =
            entry.hashOf === 'extracted' ? extractTgzBinary(tmpFile, entry.extract) : buf;

        mkdirSync(outDir, { recursive: true });
        const finalPath = join(outDir, entry.outName);
        const stagePath = `${finalPath}.part`;
        writeFileSync(stagePath, placedBytes);
        renameSync(stagePath, finalPath); // atomic-ish within same dir
        return finalPath;
    } finally {
        rmSync(tmpDir, { recursive: true, force: true });
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const manifest = loadManifest(args.manifest);

    let targets;
    // --target takes precedence over --all for symmetry with verify-sidecar.
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

    for (const t of targets) {
        const placed = await downloadOne(manifest, t, args.out);
        console.log(`ok ${t} -> ${placed}`);
    }
}

main().catch((err) => {
    console.error(`error: ${err.message}`);
    process.exit(1);
});
