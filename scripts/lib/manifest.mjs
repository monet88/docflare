// Shared sidecar-manifest parser + hash-source resolver.
// Pure Node 20+ stdlib. System `tar` is the only external dependency
// (used for macOS .tgz extraction).
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REQUIRED_TARGET_FIELDS = ['asset', 'sha256', 'outName', 'extract', 'hashOf'];
const VALID_HASH_OF = new Set(['download', 'extracted']);

/**
 * Load and validate a sidecar manifest.
 * @param {string} path manifest file path
 * @returns {object} parsed, validated manifest
 */
export function loadManifest(path) {
    let raw;
    try {
        raw = readFileSync(path, 'utf8');
    } catch (err) {
        throw new Error(`cannot read manifest "${path}": ${err.message}`);
    }

    let manifest;
    try {
        manifest = JSON.parse(raw);
    } catch (err) {
        throw new Error(`manifest "${path}" is not valid JSON: ${err.message}`);
    }

    if (!manifest.cloudflaredVersion || typeof manifest.cloudflaredVersion !== 'string') {
        throw new Error('manifest missing required string field "cloudflaredVersion"');
    }
    if (!manifest.downloadUrlTemplate || !manifest.downloadUrlTemplate.includes('{version}')) {
        throw new Error('manifest "downloadUrlTemplate" must include the {version} placeholder');
    }
    if (!manifest.targets || typeof manifest.targets !== 'object') {
        throw new Error('manifest missing "targets" object');
    }

    for (const [triple, entry] of Object.entries(manifest.targets)) {
        for (const field of REQUIRED_TARGET_FIELDS) {
            if (!(field in entry)) {
                throw new Error(`target "${triple}" missing required field "${field}"`);
            }
        }
        if (!VALID_HASH_OF.has(entry.hashOf)) {
            throw new Error(`target "${triple}" has invalid hashOf "${entry.hashOf}" (expected download|extracted)`);
        }
        if (entry.hashOf === 'extracted' && !String(entry.extract || '').startsWith('tgz:')) {
            throw new Error(`target "${triple}" hashOf=extracted requires an "extract" directive like "tgz:<entry>"`);
        }
    }

    return manifest;
}

/**
 * Resolve the absolute download URL for one target.
 * @param {object} manifest validated manifest
 * @param {string} target Tauri target triple
 * @returns {string} download URL
 */
export function resolveAsset(manifest, target) {
    const entry = manifest.targets[target];
    if (!entry) {
        throw new Error(`unknown target "${target}"; valid targets: ${Object.keys(manifest.targets).join(', ')}`);
    }
    return manifest.downloadUrlTemplate
        .replaceAll('{version}', manifest.cloudflaredVersion)
        .replaceAll('{asset}', entry.asset);
}

/** SHA256 hex of a file on disk. */
function hashFile(filePath) {
    return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/**
 * Extract a named entry from a .tgz into a temp dir and return its on-disk path.
 * Uses system `tar`. Caller is responsible for nothing — temp dir cleaned here.
 * @returns {Buffer} extracted entry bytes
 */
function readTgzEntry(tgzPath, entryName) {
    const dir = mkdtempSync(join(tmpdir(), 'sidecar-extract-'));
    try {
        execFileSync('tar', ['-xzf', tgzPath, '-C', dir, entryName]);
        return readFileSync(join(dir, entryName));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

/**
 * Hash the artifact the manifest expects for this target.
 * - hashOf=download  -> hash the downloaded file as-is.
 * - hashOf=extracted -> extract the `tgz:<entry>` member and hash THAT.
 * @param {string} downloadedPath path to the fetched file
 * @param {object} targetEntry manifest target entry
 * @returns {string} sha256 hex
 */
export function hashTarget(downloadedPath, targetEntry) {
    if (targetEntry.hashOf === 'extracted') {
        const directive = String(targetEntry.extract || '');
        if (!directive.startsWith('tgz:')) {
            throw new Error(`extracted hashOf requires a "tgz:<entry>" extract directive, got "${directive}"`);
        }
        const entryName = directive.slice('tgz:'.length);
        return createHash('sha256').update(readTgzEntry(downloadedPath, entryName)).digest('hex');
    }
    return hashFile(downloadedPath);
}

/**
 * Verify a file's SHA256 against an expected hex string.
 * @returns {boolean} true on match
 */
export function verifyHash(filePath, expected) {
    return hashFile(filePath) === String(expected).toLowerCase();
}

/** Extract the inner binary bytes for a tgz target (used by download script). */
export function extractTgzBinary(tgzPath, extractDirective) {
    const entryName = String(extractDirective).slice('tgz:'.length);
    return readTgzEntry(tgzPath, entryName);
}
