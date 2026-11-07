import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { flattenSections, loadMachine, normalize, SOURCE_LABELS, type Machine, type Section, type SourceKey } from './data';
import { useFavorites, useModel, useRecent, useStored, type Model } from './storage';

interface Props { id: string; sectionId: string | null }

export default function MachineView({ id, sectionId }: Props) {
    const [machine, setMachine] = useState<Machine | null>(null);
    const [error, setError] = useState('');
    const [favorites, setFavorites] = useFavorites();
    const [, setRecent] = useRecent();
    const [preferred, setPreferred] = useStored<SourceKey>('source', 'prs');
    const [picked, setPicked] = useState<string | null>(null);
    const [model, setModel] = useModel(id);
    const [open, setOpen] = useState<Set<string>>(new Set());
    const [query, setQuery] = useState('');
    const [showToc, setShowToc] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    // Section to scroll to once it has rendered open.
    const [scrollTarget, setScrollTarget] = useState<{ id: string; smooth: boolean } | null>(null);

    useEffect(() => {
        if (!scrollTarget) return;
        const el = document.getElementById(`s-${scrollTarget.id}`);
        if (!el) return;
        // Leave room for the sticky top bar.
        const top = el.getBoundingClientRect().top + scrollY - 60;
        scrollTo({ top, behavior: scrollTarget.smooth ? 'smooth' : 'auto' });
        setScrollTarget(null);
    });

    useEffect(() => {
        scrollTo(0, 0);
        loadMachine(id).then(setMachine, e => setError(e.message));
        setRecent(r => [id, ...r.filter(x => x !== id)].slice(0, 30));
    }, [id, setRecent]);

    const sheets = useMemo(() => machine?.sheets.filter(s => s.sections?.length) ?? [], [machine]);
    const externals = useMemo(() => machine?.sheets.filter(s => !s.sections?.length) ?? [], [machine]);
    const sheet = sheets.find(s => s.url === picked) ?? sheets.find(s => s.source === preferred) ?? sheets[0];
    const sections = useMemo(() => sheet?.sections ?? [], [sheet]);
    const flat = useMemo(() => flattenSections(sections), [sections]);
    const hasModels = useMemo(() => flat.some(s => s.html.includes('class="model')), [flat]);
    const quick = machine?.quick && machine.quick.source !== sheet?.source ? machine.quick : null;

    // Plain text per section for in-sheet search.
    const texts = useMemo(() => {
        const parser = new DOMParser();
        return new Map(flat.map(s => [s.id, normalize(s.title + ' ' + parser.parseFromString(s.html, 'text/html').body.textContent)]));
    }, [flat]);

    const q = normalize(query);
    const matches = useMemo(() => {
        if (!q) return null;
        const hit = new Set<string>();
        const visit = (s: Section): boolean => {
            const childHit = s.children.map(visit).some(Boolean);
            const self = texts.get(s.id)?.includes(q) ?? false;
            if (self || childHit) hit.add(s.id);
            return self || childHit;
        };
        sections.forEach(visit);
        return hit;
    }, [q, sections, texts]);

    // Default open state: first section, or the deep-linked one (and its ancestors).
    useEffect(() => {
        if (!sections.length) return;
        const target = sectionId && flat.find(s => s.id === sectionId);
        // Otherwise: the first section plus the overview the quick card would show.
        const overview = flat.find(s => s.html === machine?.quick?.html);
        const initial = target ? ancestorsOf(sections, target.id) : [sections[0].id, ...(overview ? ancestorsOf(sections, overview.id) : [])];
        setOpen(new Set(initial));
        if (target) setScrollTarget({ id: target.id, smooth: false });
    }, [sections, flat, sectionId, machine]);

    // Highlight search matches where the browser supports the CSS Custom Highlight API.
    useEffect(() => {
        const registry = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights;
        if (!registry) return;
        registry.delete('search');
        if (!q || !contentRef.current) return;
        const ranges: Range[] = [];
        const needle = query.trim().toLowerCase();
        const walker = document.createTreeWalker(contentRef.current, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node && ranges.length < 500; node = walker.nextNode()) {
            const text = node.textContent!.toLowerCase();
            for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + needle.length)) {
                const r = new Range();
                r.setStart(node, i);
                r.setEnd(node, i + needle.length);
                ranges.push(r);
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        registry.set('search', new (window as any).Highlight(...ranges));
    });

    const isOpen = (sid: string) => (matches ? matches.has(sid) : open.has(sid));
    const toggle = (sid: string) => setOpen(o => {
        const n = new Set(o);
        if (n.has(sid)) n.delete(sid); else n.add(sid);
        return n;
    });

    const jumpTo = (sid: string) => {
        setQuery('');
        setShowToc(false);
        setOpen(o => new Set([...o, ...ancestorsOf(sections, sid)]));
        history.replaceState(null, '', `#/m/${encodeURIComponent(id)}/${encodeURIComponent(sid)}`);
        setScrollTarget({ id: sid, smooth: true });
    };

    // In-page anchors from the original rulesheet (e.g. href="#herman") would clobber our hash route.
    const onContentClick = (e: MouseEvent) => {
        const a = (e.target as HTMLElement).closest('a');
        const href = a?.getAttribute('href');
        if (!href?.startsWith('#') || href.startsWith('#/')) return;
        e.preventDefault();
        const sid = href.slice(1);
        if (flat.some(s => s.id === sid)) jumpTo(sid);
    };

    if (error) return <div className="page"><TopBar /><p className="notice">{error}</p></div>;
    if (!machine) return <div className="page"><TopBar /><p className="notice">Loading…</p></div>;

    const fav = favorites.includes(id);
    const search = (site: string) => `https://www.google.com/search?q=${encodeURIComponent(`${machine.title} pinball rules site:${site}`)}`;

    return (
        <div className="page">
            <TopBar>
                <h1 className="top-title">{machine.title}</h1>
                <button className={`star ${fav ? 'on' : ''}`} aria-label={fav ? 'Remove from favorites' : 'Add to favorites'}
                    onClick={() => setFavorites(f => (fav ? f.filter(x => x !== id) : [...f, id]))}>
                    {fav ? '★' : '☆'}
                </button>
            </TopBar>

            <p className="machine-meta">
                {[machine.manufacturer, machine.year, machine.type, machine.designer && `Design: ${machine.designer}`].filter(Boolean).join(' · ')}
            </p>

            {sheets.length > 1 && (
                <div className="tabs source-tabs" role="tablist">
                    {sheets.map(s => (
                        <button key={s.url} role="tab" aria-selected={s === sheet} className={s === sheet ? 'on' : ''}
                            onClick={() => { setPicked(s.url); setPreferred(s.source); }}>
                            {s.label ? `${SOURCE_LABELS[s.source]}: ${s.label}` : SOURCE_LABELS[s.source]}
                        </button>
                    ))}
                </div>
            )}

            {sheet && (
                <div className="toolbar">
                    <input className="search small" type="search" placeholder="Find in rules…" value={query} onChange={e => setQuery(e.target.value)} />
                    <button className="btn" onClick={() => setShowToc(t => !t)} aria-expanded={showToc}>Contents</button>
                </div>
            )}

            {hasModels && (
                <div className="model-toggle" role="radiogroup" aria-label="Machine model">
                    {(['all', 'pro', 'prem'] as Model[]).map(m => (
                        <button key={m} role="radio" aria-checked={model === m} className={model === m ? 'on' : ''} onClick={() => setModel(m)}>
                            {m === 'all' ? 'All models' : m === 'pro' ? 'Pro' : 'Prem / LE'}
                        </button>
                    ))}
                </div>
            )}

            {showToc && (
                <nav className="toc">
                    {flat.map(s => (
                        <button key={s.id} className={`toc-item lvl-${s.level}`} onClick={() => jumpTo(s.id)}>{s.title}</button>
                    ))}
                </nav>
            )}

            {quick && !q && (
                <aside className="quick">
                    <h2>Quick strategy <span className="quick-src">from {SOURCE_LABELS[quick.source]}</span></h2>
                    <div className="rules" dangerouslySetInnerHTML={{ __html: quick.html }} />
                </aside>
            )}

            {matches && matches.size === 0 && <p className="notice">No matches for “{query}”.</p>}

            <div ref={contentRef} className={`sheet show-${model}`} onClick={onContentClick}>
                {sections.map(s => (
                    <SectionView key={s.id} s={s} isOpen={isOpen} toggle={toggle} matches={matches} />
                ))}
            </div>

            {!sheet && <p className="notice">No rules could be loaded for this machine. Try the links below.</p>}

            <footer className="sheet-footer">
                {sheet && (
                    <p>
                        From <a href={sheet.url} target="_blank" rel="noopener">{sheet.sourceName}</a>
                        {sheet.codeRev && <> · code rev {sheet.codeRev}</>}
                        {sheet.credits && <> · rules by {sheet.credits}</>}
                        {' '}· fetched {new Date(machine.scrapedAt).toLocaleDateString()}
                    </p>
                )}
                {externals.map(s => (
                    <p key={s.url}><a href={s.url} target="_blank" rel="noopener">{s.sourceName} (opens externally)</a></p>
                ))}
                <p className="also">
                    Also try: <a href={search('kineticist.com')} target="_blank" rel="noopener">Kineticist</a> ·{' '}
                    <a href={search('tiltforums.com')} target="_blank" rel="noopener">Tilt Forums</a> ·{' '}
                    <a href={search('pinside.com')} target="_blank" rel="noopener">Pinside</a>
                </p>
            </footer>
        </div>
    );
}

interface SectionProps { s: Section; isOpen: (id: string) => boolean; toggle: (id: string) => void; matches: Set<string> | null }

function SectionView({ s, isOpen, toggle, matches }: SectionProps) {
    if (matches && !matches.has(s.id)) return null;
    const open = isOpen(s.id);
    const empty = !s.html.trim() && !s.children.length;
    // "Enlarging Ray (Pro)" / "Grandpa's Laboratory (Prem/LE)": the whole section is model-specific.
    const tag = s.title.match(/\(\s*(Pro|Prem(?:ium)?(?:\s*\/\s*LE)?|LE)\s*\)\s*$/i);
    const titleModel = tag ? (/^pro$/i.test(tag[1]) ? 'pro' : 'prem') : undefined;
    return (
        <section id={`s-${s.id}`} className={`sec lvl-${Math.min(s.level, 4)}`} data-model={titleModel}>
            <button className="sec-head" aria-expanded={open} onClick={() => toggle(s.id)} disabled={empty}>
                <span className="chev" aria-hidden>{open ? '▾' : '▸'}</span>
                <span>
                    {tag ? s.title.slice(0, tag.index).trim() : s.title}
                    {tag && <> <span className={`model model-${titleModel}`}>{tag[0].trim()}</span></>}
                </span>
            </button>
            {open && (
                <div className="sec-body">
                    {s.html.trim() && <div className="rules" dangerouslySetInnerHTML={{ __html: s.html }} />}
                    {s.children.map(c => (
                        <SectionView key={c.id} s={c} isOpen={isOpen} toggle={toggle} matches={matches} />
                    ))}
                </div>
            )}
        </section>
    );
}

function TopBar({ children }: { children?: React.ReactNode }) {
    return (
        <header className="topbar">
            <a href="#/" className="back" aria-label="Back to machine list">‹</a>
            {children}
        </header>
    );
}

function ancestorsOf(sections: Section[], target: string, path: string[] = []): string[] {
    for (const s of sections) {
        if (s.id === target) return [...path, s.id];
        const found = ancestorsOf(s.children, target, [...path, s.id]);
        if (found.length) return found;
    }
    return [];
}
