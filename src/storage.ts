// Per-device preferences in localStorage. Every access is guarded: storage can be
// unavailable (private mode, cleared data) and the app must still work.
import { useCallback, useEffect, useState } from 'react';

function read<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
        return fallback;
    }
}

function write(key: string, value: unknown) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

const listeners = new Map<string, Set<() => void>>();

export function useStored<T>(key: string, fallback: T): [T, (v: T | ((old: T) => T)) => void] {
    const [value, setValue] = useState<T>(() => read(key, fallback));
    useEffect(() => {
        const sync = () => setValue(read(key, fallback));
        if (!listeners.has(key)) listeners.set(key, new Set());
        listeners.get(key)!.add(sync);
        return () => { listeners.get(key)!.delete(sync); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    const set = useCallback((v: T | ((old: T) => T)) => {
        const next = typeof v === 'function' ? (v as (old: T) => T)(read(key, fallback)) : v;
        write(key, next);
        listeners.get(key)?.forEach(fn => fn());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return [value, set];
}

export type Model = 'all' | 'pro' | 'prem';

export const useFavorites = () => useStored<string[]>('favorites', []);
export const useModel = (machineId: string) => useStored<Model>(`model:${machineId}`, 'all');
export const useRecent = () => useStored<string[]>('recent', []);
