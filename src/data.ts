// Shapes written by scraper/build.js, plus loading helpers.

export type SourceKey = 'prs' | 'primer';

export interface MachineSummary {
    id: string;
    title: string;
    manufacturer: string | null;
    year: number | null;
    type: string | null;
    summary: string | null;
    sources: SourceKey[];
}

export interface Section {
    id: string;
    title: string;
    level: number;
    html: string;
    children: Section[];
}

export interface Sheet {
    source: SourceKey;
    sourceName: string;
    url: string;
    credits: string | null;
    label: string | null; // set when one source has several pages for this machine
    external?: boolean;
    codeRev?: string | null;
    sections?: Section[];
}

export interface Machine {
    id: string;
    title: string;
    manufacturer: string | null;
    year: number | null;
    type: string | null;
    designer: string | null;
    quick: { source: SourceKey; html: string } | null;
    sheets: Sheet[];
    scrapedAt: string;
}

export const SOURCE_LABELS: Record<SourceKey, string> = {
    prs: 'Rule Sheets wiki',
    primer: 'Primer',
};

let indexPromise: Promise<{ generatedAt: string; machines: MachineSummary[] }> | null = null;

export function loadIndex() {
    indexPromise ??= fetch('data/index.json').then(r => {
        if (!r.ok) throw new Error('Could not load machine list');
        return r.json();
    });
    return indexPromise;
}

export async function loadMachine(id: string): Promise<Machine> {
    const r = await fetch(`data/m/${encodeURIComponent(id)}.json`);
    if (!r.ok) throw new Error(r.status === 404 ? 'Machine not found' : 'Could not load rules (offline?)');
    return r.json();
}

// Fetch every machine file so the service worker caches them for offline use.
export async function saveAllOffline(ids: string[], onProgress: (done: number) => void) {
    let done = 0;
    const queue = [...ids];
    const worker = async () => {
        for (let id = queue.shift(); id; id = queue.shift()) {
            try { await fetch(`data/m/${encodeURIComponent(id)}.json`); } catch { /* keep going */ }
            onProgress(++done);
        }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
}

export function normalize(s: string) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, ' ').trim().toLowerCase();
}

export function flattenSections(sections: Section[]): Section[] {
    return sections.flatMap(s => [s, ...flattenSections(s.children)]);
}
