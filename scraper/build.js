// Scrapes every source, merges entries for the same game, and writes:
//   public/data/index.json        – the machine list (small, loaded at startup)
//   public/data/m/<id>.json       – one file per machine with every source's sections
//   scraper/report.txt            – pages that failed or parsed poorly
// Usage: npm run scrape [-- --refresh] [-- --only <text>]
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import * as prs from './sources/prs.js';
import * as primer from './sources/primer.js';
import { sectionize, textLength, titleToId } from './sectionize.js';

const SOURCES = [prs, primer]; // order = display priority
const OUT = path.join(import.meta.dirname, '..', 'public', 'data');
const onlyIdx = process.argv.indexOf('--only');
const ONLY = onlyIdx !== -1 ? process.argv[onlyIdx + 1].toLowerCase() : null;

// Accent-folding normalize from the Discord bot, plus title-matching tweaks.
function normalize(str) {
    return str
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

// "Walking Dead, The (Pro Edition)", "KISS (Stern)", "Walking Dead - Pro" → base title.
function matchKey(title) {
    return normalize(title.replace(/\([^)]*\)/g, '').replace(/\s+-\s+(pro|premium|le|limited edition)\b.*$/i, ''))
        .replace(/^the | the$/g, '')
        .replace(/ (pinball|rulesheet)$/, '');
}

// m: merged machine so far, e: new source entry. Two pages from the same source are
// usually different games (Dragon: Interflip 1977 vs Gottlieb 1978) – unless they're
// model variants (Walking Dead Pro / Premium pages on Primer), so require maker + year too.
function sameGame(m, e, src) {
    if (matchKey(m.title) !== matchKey(e.title)) return false;
    const fromSameSource = m.entries.filter(x => x.src === src);
    if (fromSameSource.length) {
        return fromSameSource.every(x => x.manufacturer === e.manufacturer && x.year === e.year);
    }
    return !m.year || !e.year || Math.abs(m.year - e.year) <= 1;
}

function firstText(html, max = 220) {
    const text = cheerio.load(html).text().replace(/\s+/g, ' ').trim();
    return text.length > max ? text.slice(0, max).replace(/\s+\S*$/, '') + '…' : text;
}

function findSection(sections, re) {
    for (const s of sections) {
        if (re.test(s.title)) return s;
        const hit = findSection(s.children, re);
        if (hit) return hit;
    }
    return null;
}

async function main() {
    // 1. Catalog: every entry from every source, merged by game.
    const machines = [];
    for (const src of SOURCES) {
        const entries = await src.list();
        console.log(`${src.name}: ${entries.length} entries`);
        for (const e of entries) {
            if (ONLY && !e.title.toLowerCase().includes(ONLY)) continue;
            let m = machines.find(x => sameGame(x, e, src));
            if (!m) {
                m = { title: e.title, manufacturer: e.manufacturer, year: e.year, type: null, designer: null, entries: [] };
                machines.push(m);
            }
            m.year ??= e.year;
            m.type ??= e.type ?? null;
            m.designer ??= e.designer ?? null;
            m.entries.push({ src, ...e });
        }
    }

    // Stable, unique ids: "the-munsters", or "godzilla-2021" when titles collide.
    const byId = new Map();
    for (const m of machines) {
        const base = titleToId(m.title);
        const dupes = machines.filter(x => titleToId(x.title) === base);
        m.id = dupes.length > 1 && m.year ? `${base}-${m.year}` : base;
        while (byId.has(m.id)) m.id += '-2';
        byId.set(m.id, m);
    }

    // 2. Fetch + parse every page.
    if (!ONLY) await rm(OUT, { recursive: true, force: true });
    await mkdir(path.join(OUT, 'm'), { recursive: true });
    const report = [];
    let done = 0;

    await Promise.all(machines.map(async m => {
        const sheets = [];
        for (const e of m.entries) {
            const sheet = { source: e.src.key, sourceName: e.src.name, url: e.url, credits: e.credits ?? null, label: null };
            if (m.entries.filter(x => x.src === e.src).length > 1) sheet.label = e.title.match(/\(([^)]+)\)\s*$/)?.[1] ?? e.title;
            if (e.external) {
                sheet.external = true;
                sheets.push(sheet);
                continue;
            }
            try {
                const page = await e.src.page(e.url);
                sheet.sections = sectionize(page.html, e.url);
                sheet.codeRev = page.meta.codeRev ?? null;
                const chars = textLength(sheet.sections);
                if (chars < 300) report.push(`THIN    ${m.id} (${e.src.key}): ${chars} chars – ${e.url}`);
                else if (sheet.sections.length <= 1 && chars > 3000) report.push(`FLAT    ${m.id} (${e.src.key}): one section, ${chars} chars – ${e.url}`);
            } catch (err) {
                report.push(`FAILED  ${m.id} (${e.src.key}): ${err.message}`);
                sheet.external = true;
            }
            sheets.push(sheet);
        }

        // Quick card: Primer's synopsis, else a PRS overview section.
        let quick = null;
        for (const s of sheets) {
            if (!s.sections) continue;
            const hit = findSection(s.sections, /quick strategy|synopsis|rules overview|^overview|basic strategy/i);
            if (hit && hit.html.trim()) { quick = { source: s.source, html: hit.html }; break; }
        }

        const record = {
            id: m.id, title: m.title, manufacturer: m.manufacturer, year: m.year, type: m.type, designer: m.designer,
            quick, sheets, scrapedAt: new Date().toISOString(),
        };
        await writeFile(path.join(OUT, 'm', `${m.id}.json`), JSON.stringify(record));
        m.summary = quick ? firstText(quick.html) : null;
        m.sources = [...new Set(sheets.map(s => s.source))];
        if (++done % 50 === 0) console.log(`  ${done}/${machines.length}`);
    }));

    // 3. Index + report.
    const index = machines
        .map(({ id, title, manufacturer, year, type, summary, sources }) => ({ id, title, manufacturer, year, type, summary, sources }))
        .sort((a, b) => a.title.localeCompare(b.title, 'en', { numeric: true }));
    if (!ONLY) await writeFile(path.join(OUT, 'index.json'), JSON.stringify({ generatedAt: new Date().toISOString(), machines: index }));
    report.sort();
    await writeFile(path.join(import.meta.dirname, 'report.txt'), report.join('\n') + '\n');

    const multi = machines.filter(m => m.entries.length > 1).length;
    console.log(`\n${machines.length} machines (${multi} with more than one source). ${report.length} issues → scraper/report.txt`);
}

main().catch(err => { console.error(err); process.exit(1); });
