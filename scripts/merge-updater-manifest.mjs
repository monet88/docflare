#!/usr/bin/env node
// Merge per-target `latest.json` fragments (one per build job) into a single
// multi-platform updater manifest. Each fragment carries one platform; the
// release endpoint needs all four. Fails fast if versions disagree or fewer
// than 4 platform keys result (guards a silently-missing platform).
//
// Usage: node scripts/merge-updater-manifest.mjs <fragmentsDir> <outFile>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const EXPECTED_PLATFORMS = ['darwin-aarch64', 'darwin-x86_64', 'linux-x86_64', 'windows-x86_64'];

function main() {
    const [fragmentsDir, outFile] = process.argv.slice(2);
    if (!fragmentsDir || !outFile) {
        throw new Error('usage: merge-updater-manifest.mjs <fragmentsDir> <outFile>');
    }

    const files = readdirSync(fragmentsDir).filter((f) => f.endsWith('.json'));
    if (files.length === 0) {
        throw new Error(`no .json fragments found in ${fragmentsDir}`);
    }

    let version = null;
    let pubDate = null;
    let notes = null;
    const platforms = {};

    for (const file of files) {
        const frag = JSON.parse(readFileSync(join(fragmentsDir, file), 'utf8'));

        if (!frag.version) throw new Error(`fragment ${file} missing "version"`);
        if (version === null) {
            version = frag.version;
            pubDate = frag.pub_date;
            notes = frag.notes;
        } else if (frag.version !== version) {
            throw new Error(
                `fragment version mismatch: ${file} has "${frag.version}", expected "${version}"`,
            );
        }

        for (const [key, value] of Object.entries(frag.platforms || {})) {
            if (platforms[key]) {
                throw new Error(`duplicate platform key "${key}" across fragments (in ${file})`);
            }
            platforms[key] = value;
        }
    }

    const platformKeys = Object.keys(platforms);
    const missing = EXPECTED_PLATFORMS.filter((k) => !platformKeys.includes(k));
    if (missing.length > 0) {
        throw new Error(
            `merged manifest is missing platform key(s): ${missing.join(', ')}. ` +
            `Got [${platformKeys.join(', ')}], expected all ${EXPECTED_PLATFORMS.length}: ${EXPECTED_PLATFORMS.join(', ')}`,
        );
    }

    const merged = { version, notes, pub_date: pubDate, platforms };
    writeFileSync(outFile, `${JSON.stringify(merged, null, 2)}\n`);
    console.log(`merged ${files.length} fragment(s) -> ${outFile} (${platformKeys.length} platforms)`);
}

try {
    main();
} catch (err) {
    console.error(`error: ${err.message}`);
    process.exit(1);
}
