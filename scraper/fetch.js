// Polite, cached HTTP fetcher. Raw pages are cached on disk so re-running the
// scraper only hits the network for new pages (or everything with --refresh).
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CACHE_DIR = path.join(import.meta.dirname, '.cache');
const REFRESH = process.argv.includes('--refresh');
const DELAY_MS = 400;
const CONCURRENCY = 3;

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
};

let active = 0;
const queue = [];

function acquire() {
    if (active < CONCURRENCY) { active++; return Promise.resolve(); }
    return new Promise(resolve => queue.push(resolve));
}

function release() {
    setTimeout(() => {
        const next = queue.shift();
        if (next) next(); else active--;
    }, DELAY_MS);
}

export async function fetchCached(url) {
    const file = path.join(CACHE_DIR, createHash('sha1').update(url).digest('hex') + '.html');
    if (!REFRESH) {
        try { return await readFile(file, 'utf8'); } catch { /* not cached */ }
    }

    await acquire();
    try {
        for (let attempt = 1; ; attempt++) {
            const res = await fetch(url, { headers: HEADERS });
            if (res.ok) {
                const html = await res.text();
                await mkdir(CACHE_DIR, { recursive: true });
                await writeFile(file, html);
                return html;
            }
            if (attempt >= 3 || (res.status !== 429 && res.status < 500)) {
                throw new Error(`HTTP ${res.status} for ${url}`);
            }
            await new Promise(r => setTimeout(r, 2000 * attempt));
        }
    } finally {
        release();
    }
}
