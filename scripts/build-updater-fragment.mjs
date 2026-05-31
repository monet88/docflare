#!/usr/bin/env node
// Build a single-platform updater fragment (latest.json shape) from a signed
// Tauri updater artifact's .sig file. Deterministic and independent of whether
// tauri-action wrote/uploaded its own latest.json.
//
// Usage:
//   node scripts/build-updater-fragment.mjs \
//     --platform <darwin-aarch64|darwin-x86_64|linux-x86_64|windows-x86_64> \
//     --version <X.Y.Z> \
//     --sig <path/to/artifact.sig> \
//     --url <download URL of the updater artifact> \
//     --out <fragment.json>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const VALID_PLATFORMS = new Set([
    'darwin-aarch64',
    'darwin-x86_64',
    'linux-x86_64',
    'windows-x86_64',
]);

function parseArgs(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === '--platform') args.platform = argv[++i];
        else if (a === '--version') args.version = argv[++i];
        else if (a === '--sig') args.sig = argv[++i];
        else if (a === '--url') args.url = argv[++i];
        else if (a === '--out') args.out = argv[++i];
        else if (a === '--notes') args.notes = argv[++i];
        else throw new Error(`unknown argument "${a}"`);
    }
    for (const k of ['platform', 'version', 'sig', 'url', 'out']) {
        if (!args[k]) throw new Error(`missing required --${k}`);
    }
    if (!VALID_PLATFORMS.has(args.platform)) {
        throw new Error(`invalid --platform "${args.platform}"; expected one of ${[...VALID_PLATFORMS].join(', ')}`);
    }
    return args;
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const signature = readFileSync(args.sig, 'utf8').trim();
    if (!signature) throw new Error(`signature file is empty: ${args.sig}`);

    const fragment = {
        version: args.version,
        notes: args.notes || `Docflare ${args.version}`,
        pub_date: new Date().toISOString(),
        platforms: {
            [args.platform]: { signature, url: args.url },
        },
    };

    mkdirSync(dirname(args.out), { recursive: true });
    writeFileSync(args.out, `${JSON.stringify(fragment, null, 2)}\n`);
    console.log(`wrote ${args.platform} fragment -> ${args.out}`);
}

try {
    main();
} catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(1);
}
