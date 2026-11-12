import type { ParsedDrawing } from './vdcl';
import type { Pt } from './zones';

// 구역 평면 배경 도면: 켜진 레이어의 선분을 격자로 나눠 두고, 커서 근처 선분만 빠르게 찾아 스냅한다.

export interface DrawingIndex {
    drawing: ParsedDrawing;
    visible: Uint8Array;        // 레이어별 켜짐
    paths: Map<number, Path2D>; // 레이어별 선 (모델 좌표, m)
    cell: number;
    grid: Map<string, number[]>;
}

const CELL = 4; // m

export function buildDrawingIndex(drawing: ParsedDrawing, hidden: Set<string>): DrawingIndex {
    const visible = new Uint8Array(drawing.layers.length);
    drawing.layers.forEach((l, i) => { visible[i] = hidden.has(l) ? 0 : 1; });
    const paths = new Map<number, Path2D>();
    const grid = new Map<string, number[]>();
    const s = drawing.segs;
    for (let i = 0; i < drawing.segLayer.length; i++) {
        const l = drawing.segLayer[i];
        if (!visible[l]) continue;
        const x1 = s[i * 4], y1 = s[i * 4 + 1], x2 = s[i * 4 + 2], y2 = s[i * 4 + 3];
        let p = paths.get(l);
        if (!p) { p = new Path2D(); paths.set(l, p); }
        p.moveTo(x1, y1); p.lineTo(x2, y2);
        const cx0 = Math.floor(Math.min(x1, x2) / CELL), cx1 = Math.floor(Math.max(x1, x2) / CELL);
        const cy0 = Math.floor(Math.min(y1, y2) / CELL), cy1 = Math.floor(Math.max(y1, y2) / CELL);
        if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > 400) continue; // 아주 긴 대각선은 스냅에서 뺀다
        for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
            const k = `${cx},${cy}`;
            const list = grid.get(k);
            if (list) list.push(i); else grid.set(k, [i]);
        }
    }
    return { drawing, visible, paths, cell: CELL, grid };
}

// 커서 근처(tol, m) 선분 번호
function nearbySegments(idx: DrawingIndex, p: Pt, tol: number): number[] {
    const out = new Set<number>();
    const c = idx.cell;
    for (let cx = Math.floor((p[0] - tol) / c); cx <= Math.floor((p[0] + tol) / c); cx++)
        for (let cy = Math.floor((p[1] - tol) / c); cy <= Math.floor((p[1] + tol) / c); cy++)
            idx.grid.get(`${cx},${cy}`)?.forEach(i => out.add(i));
    return Array.from(out);
}

const segOf = (s: Float32Array, i: number): [Pt, Pt] => [[s[i * 4], s[i * 4 + 1]], [s[i * 4 + 2], s[i * 4 + 3]]];

function closest(p: Pt, a: Pt, b: Pt): Pt {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = dx * dx + dy * dy;
    const t = len > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
    return [a[0] + t * dx, a[1] + t * dy];
}

function intersect(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
    const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
    const den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-12) return null;
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
    const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
    return [a[0] + t * r[0], a[1] + t * r[1]];
}

export type DrawingSnap = { p: Pt; kind: 'intersection' | 'endpoint' | 'edge' };

// 우선순위: 교차점(축선 교점 등) → 끝점 → 선 위
export function snapToDrawing(idx: DrawingIndex, p: Pt, tol: number): DrawingSnap | null {
    const near = nearbySegments(idx, p, tol);
    if (!near.length) return null;
    const s = idx.drawing.segs;
    const close: { i: number; d: number }[] = [];
    for (const i of near) {
        const [a, b] = segOf(s, i);
        const q = closest(p, a, b);
        const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (d < tol) close.push({ i, d });
    }
    if (!close.length) return null;
    close.sort((x, y) => x.d - y.d);
    const cand = close.slice(0, 30);
    let best: DrawingSnap | null = null, bestD = tol;
    for (let x = 0; x < cand.length; x++) for (let y = x + 1; y < cand.length; y++) {
        const [a, b] = segOf(s, cand[x].i), [c, d] = segOf(s, cand[y].i);
        const q = intersect(a, b, c, d);
        if (!q) continue;
        const dd = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (dd < bestD) { bestD = dd; best = { p: q, kind: 'intersection' }; }
    }
    if (best) return best;
    bestD = tol;
    for (const { i } of cand) for (const e of segOf(s, i)) {
        const dd = Math.hypot(e[0] - p[0], e[1] - p[1]);
        if (dd < bestD) { bestD = dd; best = { p: e, kind: 'endpoint' }; }
    }
    if (best) return best;
    const [a, b] = segOf(s, cand[0].i);
    return { p: closest(p, a, b), kind: 'edge' };
}

// 처음 켤 때 숨길 레이어 (주차 구획·휠체어·보조선처럼 선이 많고 기준으로 쓰기 어려운 것)
export const DEFAULT_HIDDEN = /PARK|휠체어|Defpoint|SH_GR|HATCH|해치|TOIL|LEAD|DIM|치수/i;

// 기준층 중 '주요' 레이어 (기둥·벽·축선·끊어치기 선)
export const KEY_LAYERS = /A-COL|A-CON|A-CEN|CEN|GRID|주심|S-STR|기준층벽체|Tau|ZUKEI|^0$|A_TXT|S-COL/i;
