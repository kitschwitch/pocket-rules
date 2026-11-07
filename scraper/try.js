// Dev helper: node scraper/try.js <prs|primer> <url>  → prints the section outline
import { sectionize } from './sectionize.js';
const [src, url] = process.argv.slice(2);
const mod = await import(`./sources/${src}.js`);
const p = await mod.page(url);
const tree = sectionize(p.html, url);
const show = (t, d = 0) => t.forEach(s => { console.log('  '.repeat(d) + '- ' + s.title + ' [' + s.id + '] ' + s.html.length + 'ch'); show(s.children, d + 1); });
console.log(p.title, p.meta);
show(tree);
const htmls = []; (function walk(t) { t.forEach(s => { htmls.push(s.html); walk(s.children); }); })(tree);
const all = htmls.join('');
console.log('model badges:', (all.match(/class="model/g) || []).length, '| tagged blocks:', (all.match(/data-model/g) || []).length);
console.log('internal links:', [...new Set(all.match(/href="#[\w-]+"/g) || [])].slice(0, 10).join(' '));
