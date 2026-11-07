// Pinball Primer (pinballprimer.github.io): ~1000 games, each opening with a
// "Quick strategy synopsis". Link text format: "Game Name (Manufacturer, Type, Year)".
import * as cheerio from 'cheerio';
import { fetchCached } from '../fetch.js';

const BASE = 'https://pinballprimer.github.io';

export const name = 'Pinball Primer';
export const key = 'primer';

// "30's, The (Playmatic, EM, 1977)" → { title: "The 30's", manufacturer, type, year }
export function parseLinkText(text) {
    const m = text.trim().match(/^(.*)\(([^()]*)\)\s*$/);
    let title = (m ? m[1] : text).trim();
    const parts = m ? m[2].split(',').map(s => s.trim()) : [];
    // "30's, The" → "The 30's"
    const article = title.match(/^(.*),\s*(The|A|An)$/i);
    if (article) title = `${article[2]} ${article[1]}`;
    const year = parts.map(p => p.match(/^(19|20)\d{2}$/)?.[0]).find(Boolean);
    return {
        title,
        manufacturer: parts[0] || null,
        type: parts.length >= 3 ? parts[1] : null,
        year: year ? +year : null,
    };
}

export async function list() {
    const $ = cheerio.load(await fetchCached(`${BASE}/gamelist.html`));
    const entries = [];
    const seen = new Set();
    $('a[href$=".html"]').each((_, a) => {
        const href = $(a).attr('href');
        if (href === 'index.html' || href === 'gamelist.html' || href.includes('/')) return;
        const url = `${BASE}/${href}`;
        if (seen.has(url)) return;
        seen.add(url);
        entries.push({ url, external: false, ...parseLinkText($(a).text()) });
    });
    return entries;
}

export async function page(url) {
    const raw = await fetchCached(url);
    const $ = cheerio.load(raw);
    const title = $('h1').first().text().trim();
    $('h1').first().remove();
    $('iframe').remove();
    let html = $('body').html() || '';
    const end = html.indexOf('<!-- end of content -->');
    if (end !== -1) html = html.slice(0, end);
    return { title, html, meta: {} };
}
