import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { loadIndex, normalize, saveAllOffline, SOURCE_LABELS, type MachineSummary } from './data';
import { useFavorites, useRecent } from './storage';

type Tab = 'all' | 'favorites' | 'recent';

// Survives navigating into a machine and back.
const memory = { query: '', tab: 'all' as Tab, maker: '', wikiOnly: false, scroll: 0 };

export default function MachineList() {
    const [machines, setMachines] = useState<MachineSummary[] | null>(null);
    const [generatedAt, setGeneratedAt] = useState('');
    const [error, setError] = useState('');
    const [query, setQuery] = useState(memory.query);
    const [tab, setTab] = useState<Tab>(memory.tab);
    const [maker, setMaker] = useState(memory.maker);
    const [wikiOnly, setWikiOnly] = useState(memory.wikiOnly);
    const [favorites, setFavorites] = useFavorites();
    const [recent] = useRecent();
    const [saving, setSaving] = useState<number | null>(null);

    useEffect(() => {
        loadIndex().then(d => { setMachines(d.machines); setGeneratedAt(d.generatedAt); }, e => setError(e.message));
    }, []);

    Object.assign(memory, { query, tab, maker, wikiOnly });

    useLayoutEffect(() => {
        if (machines) scrollTo(0, memory.scroll);
        const onScroll = () => { memory.scroll = scrollY; };
        addEventListener('scroll', onScroll, { passive: true });
        return () => removeEventListener('scroll', onScroll);
    }, [machines]);

    const makers = useMemo(() => {
        const counts = new Map<string, number>();
        machines?.forEach(m => m.manufacturer && counts.set(m.manufacturer, (counts.get(m.manufacturer) || 0) + 1));
        return [...counts].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    }, [machines]);

    const shown = useMemo(() => {
        if (!machines) return [];
        let list = machines;
        if (tab === 'favorites') list = list.filter(m => favorites.includes(m.id));
        if (tab === 'recent') list = recent.map(id => machines.find(m => m.id === id)).filter((m): m is MachineSummary => !!m);
        if (maker) list = list.filter(m => m.manufacturer === maker);
        if (wikiOnly) list = list.filter(m => m.sources.includes('prs'));
        const q = normalize(query);
        if (q) {
            const words = q.split(' ');
            list = list
                .filter(m => { const t = normalize(m.title); return words.every(w => t.includes(w)); })
                .sort((a, b) => +!normalize(a.title).startsWith(q) - +!normalize(b.title).startsWith(q));
        }
        return list;
    }, [machines, tab, maker, wikiOnly, query, favorites, recent]);

    const toggleFav = (id: string) =>
        setFavorites(f => (f.includes(id) ? f.filter(x => x !== id) : [...f, id]));

    const saveAll = async () => {
        if (!machines) return;
        setSaving(0);
        await saveAllOffline(machines.map(m => m.id), setSaving);
        setTimeout(() => setSaving(null), 2500);
    };

    return (
        <div className="page">
            <header className="list-header">
                <h1>Pocket Rules</h1>
                <input
                    className="search"
                    type="search"
                    placeholder={machines ? `Search ${machines.length} machines…` : 'Loading…'}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    autoComplete="off"
                    enterKeyHint="search"
                />
                <div className="tabs" role="tablist">
                    {(['all', 'favorites', 'recent'] as Tab[]).map(t => (
                        <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
                            {t === 'all' ? 'All' : t === 'favorites' ? `★ Favorites${favorites.length ? ` (${favorites.length})` : ''}` : 'Recent'}
                        </button>
                    ))}
                </div>
                <div className="filters">
                    <select value={maker} onChange={e => setMaker(e.target.value)} aria-label="Manufacturer">
                        <option value="">All makers</option>
                        {makers.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <label className="check">
                        <input type="checkbox" checked={wikiOnly} onChange={e => setWikiOnly(e.target.checked)} />
                        Full wiki rules only
                    </label>
                </div>
            </header>

            {error && <p className="notice">{error}</p>}
            {machines && shown.length === 0 && (
                <p className="notice">
                    {tab === 'favorites' && !query ? 'Tap ☆ on a machine to add it here.' : tab === 'recent' && !query ? 'Machines you open show up here.' : 'No machines match.'}
                </p>
            )}

            <ul className="machine-list">
                {shown.map(m => (
                    <li key={m.id}>
                        <a href={`#/m/${encodeURIComponent(m.id)}`} className="machine-row">
                            <span className="row-title">{m.title}</span>
                            <span className="row-meta">
                                {[m.manufacturer, m.year, m.type].filter(Boolean).join(' · ')}
                                {m.sources.map(s => <span key={s} className={`src-tag src-${s}`}>{SOURCE_LABELS[s]}</span>)}
                            </span>
                        </a>
                        <button
                            className={`star ${favorites.includes(m.id) ? 'on' : ''}`}
                            onClick={() => toggleFav(m.id)}
                            aria-label={favorites.includes(m.id) ? `Remove ${m.title} from favorites` : `Add ${m.title} to favorites`}
                        >
                            {favorites.includes(m.id) ? '★' : '☆'}
                        </button>
                    </li>
                ))}
            </ul>

            {machines && (
                <footer className="list-footer">
                    <button className="btn" onClick={saveAll} disabled={saving !== null}>
                        {saving === null ? 'Save all for offline' : saving < machines.length ? `Saving… ${saving}/${machines.length}` : 'Saved ✓'}
                    </button>
                    <p>
                        Rules from <a href="https://pinballrulesheets.com" target="_blank" rel="noopener">Pinball Rule Sheets</a> and{' '}
                        <a href="https://pinballprimer.github.io" target="_blank" rel="noopener">Pinball Primer</a>.
                        Updated {new Date(generatedAt).toLocaleDateString()}.
                    </p>
                </footer>
            )}
        </div>
    );
}
