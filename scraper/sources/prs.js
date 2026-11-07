// Pinball Rule Sheets (pinballrulesheets.com): community wiki, ~100 modern games.
// Master-list parsing and #main_content extraction come from the Discord bot.
import * as cheerio from 'cheerio';
import { fetchCached } from '../fetch.js';

const BASE = 'https://pinballrulesheets.com';
const MASTER_LIST_URL = `${BASE}/rulesheet-master-list`;

export const name = 'Pinball Rule Sheets';
export const key = 'prs';

// → [{ title, url, manufacturer, year, designer, credits }]
export async function list() {
    const $ = cheerio.load(await fetchCached(MASTER_LIST_URL));
    const entries = [];
    $('h2').each((_, h2) => {
        const manufacturer = $(h2).text().replace(/:\s*$/, '').trim();
        const table = $(h2).nextUntil('h2', 'table').first();
        table.find('tbody tr').each((_, tr) => {
            const cells = $(tr).find('td').toArray().map(td => $(td).text().trim());
            const a = $(tr).find('td:first-child a').first();
            const href = a.attr('href');
            if (!href) return;
            const url = new URL(href, BASE).href;
            entries.push({
                title: a.text().trim(),
                url,
                external: !url.startsWith(BASE),
                manufacturer,
                year: +(cells[1]?.match(/\b(19|20)\d{2}\b/)?.[0]) || null,
                designer: cells[2] || null,
                credits: cells[3] || null,
            });
        });
    });
    return entries;
}

// → { title, html, meta }
export async function page(url) {
    const $ = cheerio.load(await fetchCached(url));
    const content = $('#main_content').first();
    const title = content.find('h1').first().text().trim();
    content.find('h1').first().remove();
    const codeRev = content.text().match(/Code Rev(?:ision)?:?\s*([\w.]+)/i)?.[1] || null;
    return { title, html: content.html() || '', meta: { codeRev } };
}
