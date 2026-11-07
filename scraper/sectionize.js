// Turns a rulesheet's content HTML into a tree of sections with sanitized HTML.
// The heading heuristics (paragraph-style subheadings, <strong>-only headers,
// leftover {#anchor} markup) are ported from the Discord bot's rules.js.
import * as cheerio from 'cheerio';

const ALLOWED_ATTRS = {
    h1: ['id'], h2: ['id'], h3: ['id'], h4: ['id'],
    a: ['href'],
    img: ['src', 'alt'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
};
const ALLOWED_TAGS = new Set([
    'p', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'strong', 'b', 'em', 'i',
    'a', 'img', 'br', 'blockquote', 'code', 'pre', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'sup', 'sub', 'span',
]);
const DROP_TAGS = 'script, style, iframe, noscript, form, button, input';

export function titleToId(title) {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Strips leftover markdown anchors like "Chattering Teeth {#heading–herman}".
export function cleanTitle(text) {
    return text.replace(/\s*\{#[^}]*\}/g, '').replace(/\s+/g, ' ').replace(/:$/, '').trim();
}

const SMALL_WORDS = new Set(['a', 'an', 'and', 'of', 'the', 'or', 'to', 'in', 'on', 'at', 'for', 'vs', 'with', 'a-ball']);

// "Munster Madness", "Add-A-Ball", "Spot" → true; "Hit the ramp twice" → false.
function looksLikeTitle(text) {
    const words = text.split(' ');
    if (words.length > 6) return false;
    return words.every((w, i) => /^[A-Z0-9(“"']/.test(w) || (i > 0 && SMALL_WORDS.has(w.toLowerCase())));
}

// Some rulesheets (e.g. The Munsters) lost their subheading markup, so subheadings
// show up as short standalone paragraphs like <p>Spot</p> followed by their content.
function isParagraphHeading($, el, tocLevels) {
    if (el.name !== 'p') return false;
    if ($(el).children('img').length) return false;
    const raw = $(el).text().trim();
    const text = cleanTitle(raw);
    if (!text || text.length > 40) return false;
    if (/^[(\[\-•*]/.test(text) || /[.,;!?]$/.test(raw)) return false;
    if (!$(el).next().length) return false;
    return tocLevels.has(titleToId(text)) || looksLikeTitle(text);
}

// A paragraph whose only content is one <strong>/<b> element, e.g. <p><strong>Modes:</strong></p>
function isStrongHeading($, el) {
    if (el.name !== 'p') return false;
    const strong = $(el).children('strong, b');
    if (strong.length !== 1) return false;
    const text = $(el).text().trim();
    return text.length > 0 && text.length <= 60 && strong.text().trim() === text;
}

// Reads a leading table-of-contents list (all links are #fragments) into
// levels { titleId → depth } and anchors { fragment → titleId }, then removes it.
function extractToc($, root) {
    const levels = new Map();
    const anchors = new Map();
    const first = root.children().first();
    if (!first.is('ul, ol')) return { levels, anchors };
    const links = first.find('a');
    if (!links.length || links.toArray().some(a => !($(a).attr('href') || '').startsWith('#'))) return { levels, anchors };
    links.each((_, a) => {
        const id = titleToId(cleanTitle($(a).text()));
        const depth = $(a).parents('ul, ol').length; // 1 = top level
        levels.set(id, depth + 1); // top level ↔ h2
        anchors.set($(a).attr('href').slice(1), id);
    });
    first.remove();
    return { levels, anchors };
}

const MODEL_RE = /\(\s*(Pro|Prem(?:ium)?\s*\/\s*LE|Prem(?:ium)?|LE)\s*(?:only|version)?\s*\)/gi;

function modelOf(token) {
    return /^\(\s*pro\b/i.test(token) ? 'pro' : 'prem';
}

// Wraps "(Pro)" / "(Prem/LE)" markers in badges, and tags list items / paragraphs
// whose markers all point at one model so the app can dim them for the other.
function tagModels($, root) {
    root.find('*').contents().each((_, node) => {
        if (node.type !== 'text' || !MODEL_RE.test(node.data)) return;
        MODEL_RE.lastIndex = 0;
        const html = node.data
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(MODEL_RE, m => `<span class="model model-${modelOf(m)}">${m}</span>`);
        $(node).replaceWith(html);
    });
    root.find('li, p').each((_, el) => {
        // Only look at markers that belong to this element, not to nested list items.
        const own = $(el).find('span.model').filter((_, s) => $(s).closest('li, p')[0] === el);
        const kinds = new Set(own.toArray().map(s => ($(s).attr('class').includes('model-pro') ? 'pro' : 'prem')));
        if (kinds.size === 1) $(el).attr('data-model', [...kinds][0]);
    });
}

function sanitize($, root, baseUrl) {
    root.find(DROP_TAGS).remove();
    root.contents().filter((_, n) => n.type === 'comment').remove();
    // Deepest elements first so unwrapping never skips children.
    root.find('*').toArray().reverse().forEach(el => {
        const tag = el.name;
        if (!ALLOWED_TAGS.has(tag)) {
            $(el).replaceWith($(el).contents());
            return;
        }
        const keep = ALLOWED_ATTRS[tag] || [];
        const isModel = tag === 'span' && /\bmodel\b/.test($(el).attr('class') || '');
        for (const name of Object.keys(el.attribs)) {
            if (keep.includes(name) || (isModel && name === 'class') || name === 'data-model') continue;
            $(el).removeAttr(name);
        }
        if (tag === 'span' && !isModel) { $(el).replaceWith($(el).contents()); return; }
        for (const attr of ['href', 'src']) {
            const v = $(el).attr(attr);
            if (!v || v.startsWith('#')) continue;
            try {
                const u = new URL(v, baseUrl);
                if (['http:', 'https:', 'mailto:'].includes(u.protocol)) $(el).attr(attr, u.href);
                else $(el).removeAttr(attr);
            } catch { $(el).removeAttr(attr); }
        }
        if (tag === 'a' && $(el).attr('href') && !$(el).attr('href').startsWith('#')) {
            $(el).attr('target', '_blank').attr('rel', 'noopener');
        }
    });
}

// html: the rulesheet body (title already removed). Returns a nested section tree.
export function sectionize(html, baseUrl) {
    const $ = cheerio.load(`<div id="root">${html}</div>`, null, false);
    const root = $('#root');
    const { levels: tocLevels, anchors: tocAnchors } = extractToc($, root);
    tagModels($, root);
    sanitize($, root, baseUrl);

    // Unwrap generic wrappers so headings sit directly under root.
    let wrapper;
    while ((wrapper = root.children('div, section, article, main')).length) {
        wrapper.each((_, el) => { $(el).replaceWith($(el).contents()); });
    }

    const children = root.children().toArray();
    const hasHeadings = children.some(el => /^h[2-4]$/.test(el.name));
    const headingLevels = children.filter(el => /^h[1-4]$/.test(el.name)).map(el => +el.name[1]);
    const minHeading = headingLevels.length ? Math.min(...headingLevels) : 2;

    const flat = [];
    let current = null;
    let lastLevel = 2;
    const push = (title, level, anchor, guess = false) => {
        current = { id: titleToId(title) || 'section', anchor, title, level, html: '', guess };
        flat.push(current);
    };

    for (const el of children) {
        if (/^h[1-4]$/.test(el.name)) {
            const title = cleanTitle($(el).text());
            if (!title) continue;
            lastLevel = +el.name[1] - minHeading + 2;
            push(title, lastLevel, $(el).attr('id'));
            continue;
        }
        if (hasHeadings && isParagraphHeading($, el, tocLevels)) {
            const title = cleanTitle($(el).text());
            const tocLevel = tocLevels.get(titleToId(title));
            push(title, tocLevel ?? Math.max(3, lastLevel), undefined, !tocLevel && tocLevels.size > 0);
            continue;
        }
        if (!hasHeadings && isStrongHeading($, el)) {
            push(cleanTitle($(el).text()), 2);
            continue;
        }
        const piece = $.html(el).trim();
        if (!piece) continue;
        if (!current) push('Introduction', 2);
        current.html += piece + '\n';
    }

    // Paragraph headings missing from the page's TOC: an empty one is a parent of what
    // follows (e.g. "Other Scoring"); otherwise it's a child of the previous heading.
    flat.forEach((s, i) => {
        if (!s.guess) return;
        const next = flat[i + 1];
        const prev = flat.slice(0, i).reverse().find(p => !p.guess);
        if (!s.html.trim() && next && !next.guess) s.level = Math.max(2, next.level - 1);
        else if (prev) s.level = Math.min(4, prev.level + 1);
    });

    // Unique ids, then nest by level.
    const seen = new Map();
    for (const s of flat) {
        const n = seen.get(s.id) || 0;
        seen.set(s.id, n + 1);
        if (n) s.id += `-${n + 1}`;
    }
    // Map original #anchors (e.g. #heading--teeth) to our section ids.
    const anchorMap = new Map();
    const byTitleId = new Map(flat.map(s => [titleToId(s.title), s.id]));
    for (const [anchor, titleId] of tocAnchors) {
        if (byTitleId.has(titleId)) anchorMap.set(anchor, byTitleId.get(titleId));
    }
    for (const s of flat) if (s.anchor) anchorMap.set(s.anchor, s.id);
    for (const s of flat) {
        s.html = s.html.replace(/href="#([^"]+)"/g, (m, a) => (anchorMap.has(a) ? `href="#${anchorMap.get(a)}"` : m));
    }

    const tree = [];
    const stack = [];
    for (const { anchor, guess, ...s } of flat) {
        const node = { ...s, children: [] };
        while (stack.length && stack.at(-1).level >= node.level) stack.pop();
        (stack.length ? stack.at(-1).children : tree).push(node);
        stack.push(node);
    }
    return tree;
}

// Total characters of visible text in a section tree (used for quality reports).
export function textLength(sections) {
    return sections.reduce((n, s) => n + cheerio.load(s.html).text().trim().length + textLength(s.children), 0);
}
