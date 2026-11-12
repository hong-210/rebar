import { MaterialEntry, MemberClass } from '../types';

// 층별 SHOP / 실행 철근 진척 (3D 진척 모델과 대시보드가 같은 기준을 쓴다)

export interface FloorProgress {
    planned: number; // kg
    shop: number;    // kg
}

// 한 층의 물량을 수평재 / 수직재 / 구분 없음으로 나눠 둔다
export interface FloorSplit {
    H: FloorProgress;
    V: FloorProgress;
    none: FloorProgress;
    all: FloorProgress;
}

export type ClassFilter = 'all' | MemberClass;

export const hasAmount = (p: FloorProgress) => p.planned > 0 || p.shop > 0;

// 구분 없는 물량이 섞인 층은 수평/수직으로 나눌 수 없어 층 전체 진척을 쓴다
export const progressOf = (split: FloorSplit | undefined, cls: ClassFilter): { p: FloorProgress | undefined; merged: boolean } => {
    if (!split) return { p: undefined, merged: false };
    if (cls === 'all') return { p: split.all, merged: false };
    return hasAmount(split.none) ? { p: split.all, merged: true } : { p: split[cls], merged: false };
};

// 동 → 층 → 수평/수직별 실행·SHOP 철근 물량 (커플러 제외, 업로드할 때 이미 SHOP 층 기준으로 맞춰져 있다)
export function floorSplitsByDong(materials: MaterialEntry[], projectId: string): Map<string, Map<string, FloorSplit>> {
    const byDong = new Map<string, Map<string, FloorSplit>>();
    const empty = () => ({ planned: 0, shop: 0 });
    for (const m of materials) {
        if (m.projectId !== projectId || m.itemType === 'Coupler') continue;
        let floors = byDong.get(m.dong);
        if (!floors) { floors = new Map(); byDong.set(m.dong, floors); }
        let split = floors.get(m.floor);
        if (!split) { split = { H: empty(), V: empty(), none: empty(), all: empty() }; floors.set(m.floor, split); }
        const isShop = (m.dataSource ?? 'Design') === 'Shop';
        const kg = (isShop ? m.shopWeight : m.plannedWeight) || 0;
        for (const p of [split[m.memberClass ?? 'none'], split.all]) {
            if (isShop) p.shop += kg; else p.planned += kg;
        }
    }
    return byDong;
}

// --- 진척 색 ---
export const COLOR_NO_DATA = '#e2e8f0';    // 실행·SHOP 물량 모두 없음
export const COLOR_NOT_STARTED = '#94a3b8'; // 실행만 있음 (0%)
export const COLOR_OVER = '#ef4444';        // 실행 초과
export const COLOR_SHOP_ONLY = '#a855f7';   // 실행 없이 SHOP만 있음
export const COLOR_DIM = '#f1f5f9';         // 층을 골랐을 때 나머지 층
export const PROGRESS_STOPS = ['#fbbf24', '#a3e635', '#16a34a']; // 0% → 50% → 100%

export const PROGRESS_LEGEND: [string, string][] = [
    [COLOR_NOT_STARTED, '실행만 (0%)'],
    [PROGRESS_STOPS[0], '진행 중'],
    [PROGRESS_STOPS[2], '완료 (100%)'],
    [COLOR_OVER, '실행 초과 (105%↑)'],
    [COLOR_SHOP_ONLY, 'SHOP만 있음'],
    [COLOR_NO_DATA, '물량 없음'],
];

const mix = (a: string, b: string, t: number) => {
    const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    return '#' + [0, 1, 2].map(i => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('');
};

export function progressColor(p: FloorProgress | undefined): string {
    if (!p || (p.planned <= 0 && p.shop <= 0)) return COLOR_NO_DATA;
    if (p.planned <= 0) return COLOR_SHOP_ONLY;
    const r = p.shop / p.planned;
    if (r <= 0) return COLOR_NOT_STARTED;
    if (r > 1.05) return COLOR_OVER;
    if (r >= 0.995) return PROGRESS_STOPS[2];
    return r < 0.5
        ? mix(PROGRESS_STOPS[0], PROGRESS_STOPS[1], r / 0.5)
        : mix(PROGRESS_STOPS[1], PROGRESS_STOPS[2], (r - 0.5) / 0.5);
}

export const floorOrder = (f: string) => (f.startsWith('B') ? -parseInt(f.slice(1)) : parseInt(f));
export const toTon = (kg: number) => (kg / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 });
export const percent = (p: FloorProgress | undefined) =>
    p && p.planned > 0 ? `${Math.round((p.shop / p.planned) * 100)}%` : p && p.shop > 0 ? 'SHOP만' : '-';
