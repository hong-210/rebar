import { MemberClass } from '../types';
import { MemberGroup, familyOf } from './shopCheck';

// 지하주차장처럼 층 안을 구역(구간, 'N동 주변' ...)으로 나눠 관리하는 동을 위한 구역 정의.
// 구역은 층(SHOP 기준 층)마다 따로, 평면 좌표(모델 좌표, m)의 닫힌 다각형으로 저장한다.

export type Pt = [number, number];

export interface ZoneArea {
    id: string;
    floor: string;   // 'B3', 'B4' ... (SHOP 기준 층)
    name: string;    // '7-1번구간', '205동 주변' ('/'로 다른 이름을 함께 적을 수 있다: '4번구간 / 214동 주변')
    points: Pt[];
}

// 이 브라우저에 프로젝트·동별로 저장 (서버 연동 전까지)
const KEY = 'rbm_v2_zones';
export function loadZones(projectId: string, dong: string): ZoneArea[] {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}')[projectId]?.[dong] ?? []; } catch { return []; }
}
export function saveZones(projectId: string, dong: string, zones: ZoneArea[]) {
    try {
        const all = JSON.parse(localStorage.getItem(KEY) || '{}');
        all[projectId] = { ...(all[projectId] ?? {}), [dong]: zones };
        localStorage.setItem(KEY, JSON.stringify(all));
    } catch { /* 저장 공간이 없어도 화면은 동작한다 */ }
}

// --- 기하 ---

export function pointInPolygon([x, y]: Pt, poly: Pt[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

export function polygonArea(poly: Pt[]): number {
    let a = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
    return a / 2;
}

// 이름표를 놓을 위치 (면적 중심, 면적이 0이면 꼭짓점 평균)
export function polygonCenter(poly: Pt[]): Pt {
    const a = polygonArea(poly);
    if (Math.abs(a) < 1e-9) return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
    let cx = 0, cy = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
        cx += (poly[j][0] + poly[i][0]) * f;
        cy += (poly[j][1] + poly[i][1]) * f;
    }
    return [cx / (6 * a), cy / (6 * a)];
}

// 선분 위에서 p에 가장 가까운 점
export function closestOnSegment(p: Pt, a: Pt, b: Pt): Pt {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    const t = len > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
    return [a[0] + t * dx, a[1] + t * dy];
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// --- 이름 맞추기 (SHOP 도면명에서 뽑은 구역 ↔ 그린 구역 이름) ---

// '주차장 7-1번구간' = '7-1 구간', '213동 주변주차장' = '213동 주변'
export const normalizeAreaName = (s: string) =>
    s.replace(/\s+/g, '').replace(/주차장/g, '').replace(/번구간/g, '구간').replace(/[()]/g, '').toLowerCase();

export const zoneAliases = (zone: ZoneArea) => zone.name.split(/[\/,]/).map(normalizeAreaName).filter(Boolean);

export const zoneMatchesArea = (zone: ZoneArea, area: string) => zoneAliases(zone).includes(normalizeAreaName(area));

// --- 부재 계열 (실행 모델 부재 ↔ SHOP 도면 부재) ---

export type Family = '기초' | '수직' | '보·슬래브' | '기타';
export const FAMILIES: Family[] = ['기초', '수직', '보·슬래브', '기타'];

export function modelFamily(kind: string, cls: MemberClass | undefined): Family {
    if (/기초|매트|피트|pit|footing/i.test(kind)) return '기초';
    if (cls === 'V') return '수직';
    if (cls === 'H') return '보·슬래브';
    return '기타';
}

export function shopFamily(member: MemberGroup): Family {
    const f = familyOf(member);
    if (f === '기초' || f === '수직' || f === '보·슬래브') return f;
    if (f === '계단') return '수직';
    return '기타';
}

export const ZONE_COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#be123c', '#a16207'];
