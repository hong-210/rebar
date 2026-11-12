import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MousePointer2, PenLine, Trash2, Copy, Maximize, AlertTriangle, Link2Off, X } from 'lucide-react';
import { BuildingConfig, MaterialEntry, MemberClass, Project } from '../types';
import type { LoadedModel } from '../utils/modelStorage';
import { floorLabel, lowestFloorOf } from '../utils/floorBasis';
import { floorOrder } from '../utils/progress';
import { collectDrawings, loadDrawingOverrides } from '../utils/shopCheck';
import {
    FAMILIES, Family, Pt, ZONE_COLORS, ZoneArea, closestOnSegment, dist, loadZones, modelFamily, pointInPolygon,
    polygonCenter, saveZones, shopFamily, zoneMatchesArea
} from '../utils/zones';
import { newId } from '../utils/id';

interface ZoneEditorProps {
    project: Project;
    building: BuildingConfig | undefined;
    dong: string;
    model: LoadedModel;
    bodyFloors: string[];        // 부재마다 SHOP 기준 층
    bodyClasses: MemberClass[];  // 부재마다 수평/수직
    materials: MaterialEntry[];
    canEdit: boolean;
}

// 평면 보기: 화면 = (x·scale + ox, −y·scale + oy)
interface View { scale: number; ox: number; oy: number }

const SNAP_PX = 12;
const COLOR_FREE = '#94a3b8';     // 실행 물량이 있는데 구역에 안 든 부재
const COLOR_OVERLAP = '#dc2626';  // 두 구역 이상에 든 부재
const COLOR_EMPTY = '#e2e8f0';    // 실행 물량이 없는 부재

type Mode = 'select' | 'draw';

interface FloorBody {
    index: number;
    msId: number;
    path: Path2D;     // 윗면 삼각형 (모델 좌표)
    center: Pt;
    vertical: boolean;
    ton: number;      // 실행 철근 (부재 ID당 한 번만)
    family: Family;
}

const fmtT = (t: number) => (t >= 100 ? t.toFixed(0) : t.toFixed(1));
const pct = (shop: number, plan: number) => (plan > 0 ? `${Math.round((shop / plan) * 100)}%` : shop > 0 ? 'SHOP만' : '-');

export const ZoneEditor: React.FC<ZoneEditorProps> = ({ project, building, dong, model, bodyFloors, bodyClasses, materials, canEdit }) => {
    const [zones, setZones] = useState<ZoneArea[]>(() => loadZones(project.id, dong));
    useEffect(() => { setZones(loadZones(project.id, dong)); }, [project.id, dong]);
    const commit = (next: ZoneArea[]) => { setZones(next); saveZones(project.id, dong, next); };

    const floors = useMemo(() => Array.from(new Set(bodyFloors)).sort((a, b) => floorOrder(b) - floorOrder(a)), [bodyFloors]);
    const [floor, setFloor] = useState<string>(() => floors[floors.length - 1] ?? '');
    useEffect(() => { if (!floors.includes(floor)) setFloor(floors[floors.length - 1] ?? ''); }, [floors, floor]);

    const [mode, setMode] = useState<Mode>('select');
    const [snapOn, setSnapOn] = useState(true);
    const [drawPts, setDrawPts] = useState<Pt[]>([]);
    const [cursor, setCursor] = useState<{ p: Pt; snapped: 'vertex' | 'edge' | 'close' | null } | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [showFree, setShowFree] = useState(false);
    const [view, setView] = useState<View>({ scale: 1, ox: 0, oy: 0 });
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ w: 800, h: 600 });

    const floorZones = useMemo(() => zones.filter(z => z.floor === floor), [zones, floor]);
    const colorOf = (z: ZoneArea) => ZONE_COLORS[zones.indexOf(z) % ZONE_COLORS.length];

    // --- 이 층 부재: 평면 모양·중심·실행 물량 ---
    const memberById = useMemo(() => new Map((model.members ?? []).map(m => [m.msId, m])), [model]);
    const { bodies, bounds } = useMemo(() => {
        const pos = model.positions;
        const list: FloorBody[] = [];
        const seen = new Set<number>();
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        model.bodies.forEach((b, i) => {
            if (bodyFloors[i] !== floor) return;
            const path = new Path2D();
            let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
            for (let v = b.v0; v < b.v0 + b.vn; v += 3) {
                const ax = pos[v * 3], ay = pos[v * 3 + 1], az = pos[v * 3 + 2];
                const bx = pos[v * 3 + 3], by = pos[v * 3 + 4], bz = pos[v * 3 + 5];
                const cx = pos[v * 3 + 6], cy = pos[v * 3 + 7], cz = pos[v * 3 + 8];
                for (const [x, y] of [[ax, ay], [bx, by], [cx, cy]]) {
                    if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
                }
                // 윗면(법선이 위를 향하는 면)만 그리면 평면 모양이 된다
                const ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
                const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
                const len = Math.hypot(nx, ny, nz);
                if (len === 0 || nz / len < 0.5) continue;
                path.moveTo(ax, ay); path.lineTo(bx, by); path.lineTo(cx, cy); path.closePath();
            }
            if (!isFinite(bx0)) return;
            x0 = Math.min(x0, bx0); y0 = Math.min(y0, by0); x1 = Math.max(x1, bx1); y1 = Math.max(y1, by1);
            const member = memberById.get(b.msId);
            const first = !seen.has(b.msId);
            seen.add(b.msId);
            list.push({
                index: i, msId: b.msId, path, center: [(bx0 + bx1) / 2, (by0 + by1) / 2],
                vertical: bodyClasses[i] === 'V',
                ton: first && member ? member.items.reduce((a, it) => a + it.ton, 0) : 0,
                family: member ? modelFamily(member.kind, member.memberClass ?? bodyClasses[i]) : modelFamily(b.type, bodyClasses[i]),
            });
        });
        // 수평재를 먼저, 수직재(벽·기둥)를 위에 그린다
        list.sort((a, b) => Number(a.vertical) - Number(b.vertical));
        return { bodies: list, bounds: isFinite(x0) ? { x0, y0, x1, y1 } : null };
    }, [model, bodyFloors, bodyClasses, floor, memberById]);

    // --- 구역 배정 ---
    const assign = useMemo(() => {
        const zonesOf = new Map<number, string[]>(); // body index → zone ids
        for (const b of bodies) zonesOf.set(b.index, floorZones.filter(z => pointInPolygon(b.center, z.points)).map(z => z.id));
        return zonesOf;
    }, [bodies, floorZones]);

    // --- 실행 / SHOP 집계 ---
    const stats = useMemo(() => {
        type Row = { plan: Record<Family, number>; shop: Record<Family, number>; bodies: number; drawings: { name: string; ton: number; shared: boolean }[] };
        const empty = (): Record<Family, number> => ({ 기초: 0, 수직: 0, '보·슬래브': 0, 기타: 0 });
        const rows = new Map<string, Row>(floorZones.map(z => [z.id, { plan: empty(), shop: empty(), bodies: 0, drawings: [] }]));
        let freeTon = 0, freeCount = 0, overlapCount = 0, totalTon = 0;
        for (const b of bodies) {
            const ids = assign.get(b.index) ?? [];
            totalTon += b.ton;
            if (ids.length === 0) { if (b.ton > 0) { freeTon += b.ton; freeCount++; } continue; }
            if (ids.length > 1) overlapCount++;
            const row = rows.get(ids[0])!;
            row.plan[b.family] += b.ton;
            row.bodies++;
        }

        // SHOP: 이 동·이 층의 도면별·계열별 중량 → 도면명 구역과 이름이 맞는 구역에 (여러 구역이면 실행 비율로 나눔)
        const lowest = building ? lowestFloorOf(building) : undefined;
        const drawings = collectDrawings(materials, project.id, d => (d === dong ? lowest : undefined), loadDrawingOverrides(project.id))
            .filter(d => d.dong === dong);
        const infoByName = new Map(drawings.map(d => [d.name, d.info]));
        const shopTon = new Map<string, number>(); // 도면명 → 이 층 철근 t
        for (const m of materials) {
            if (m.projectId !== project.id || m.dataSource !== 'Shop' || m.dong !== dong || m.floor !== floor || m.itemType === 'Coupler') continue;
            shopTon.set(m.zone, (shopTon.get(m.zone) ?? 0) + (m.shopWeight || 0) / 1000);
        }
        const unlinked: { name: string; ton: number; areas: string[] }[] = [];
        let linkedTon = 0;
        shopTon.forEach((ton, name) => {
            const info = infoByName.get(name);
            if (!info) return;
            const fam = shopFamily(info.member);
            const targets = floorZones.filter(z => info.areas.some(a => zoneMatchesArea(z, a)));
            if (targets.length === 0) { unlinked.push({ name, ton, areas: info.areas }); return; }
            linkedTon += ton;
            const weights = targets.map(z => rows.get(z.id)!.plan[fam]);
            const sum = weights.reduce((a, b) => a + b, 0);
            targets.forEach((z, i) => {
                const part = sum > 0 ? ton * (weights[i] / sum) : ton / targets.length;
                const row = rows.get(z.id)!;
                row.shop[fam] += part;
                row.drawings.push({ name, ton: part, shared: targets.length > 1 });
            });
        });
        unlinked.sort((a, b) => b.ton - a.ton);
        return { rows, freeTon, freeCount, overlapCount, totalTon, unlinked, linkedTon };
    }, [bodies, assign, floorZones, materials, project.id, dong, floor, building]);

    // --- 화면 크기·맞춤 ---
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const fit = () => {
        if (!bounds) return;
        const pad = 30;
        const scale = Math.min((size.w - pad * 2) / Math.max(bounds.x1 - bounds.x0, 1), (size.h - pad * 2) / Math.max(bounds.y1 - bounds.y0, 1));
        setView({ scale, ox: size.w / 2 - ((bounds.x0 + bounds.x1) / 2) * scale, oy: size.h / 2 + ((bounds.y0 + bounds.y1) / 2) * scale });
    };
    // 층을 바꾸거나 처음 열 때 맞춤
    const fittedFor = useRef('');
    useEffect(() => {
        const key = `${floor}|${size.w > 0 && size.h > 0}`;
        if (bounds && size.w > 0 && fittedFor.current !== key) { fittedFor.current = key; fit(); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bounds, size.w, size.h, floor]);

    const toScreen = (p: Pt): Pt => [p[0] * view.scale + view.ox, -p[1] * view.scale + view.oy];
    const toWorld = (sx: number, sy: number): Pt => [(sx - view.ox) / view.scale, -(sy - view.oy) / view.scale];

    // --- 스냅: 그리는 중인 첫 점(닫기) → 기존 구역 꼭짓점 → 기존 구역 선 ---
    const snap = (raw: Pt, shift: boolean): { p: Pt; snapped: 'vertex' | 'edge' | 'close' | null } => {
        let p = raw;
        const last = drawPts[drawPts.length - 1];
        if (shift && last) {
            // 수평·수직 고정
            p = Math.abs(raw[0] - last[0]) > Math.abs(raw[1] - last[1]) ? [raw[0], last[1]] : [last[0], raw[1]];
        }
        const tol = SNAP_PX / view.scale;
        if (drawPts.length >= 3 && dist(p, drawPts[0]) < tol) return { p: drawPts[0], snapped: 'close' };
        if (!snapOn) return { p, snapped: null };
        let best: Pt | null = null, bestD = tol;
        for (const z of floorZones) for (const v of z.points) {
            const d = dist(p, v);
            if (d < bestD) { bestD = d; best = v; }
        }
        for (const v of drawPts.slice(1)) {
            const d = dist(p, v);
            if (d < bestD) { bestD = d; best = v; }
        }
        if (best) return { p: [best[0], best[1]], snapped: 'vertex' };
        bestD = tol * 0.8;
        for (const z of floorZones) {
            for (let i = 0; i < z.points.length; i++) {
                const q = closestOnSegment(p, z.points[i], z.points[(i + 1) % z.points.length]);
                const d = dist(p, q);
                if (d < bestD) { bestD = d; best = q; }
            }
        }
        if (best) {
            // 수평·수직 고정 중이면 선 위의 점 중 고정 방향과 맞는 점을 쓴다
            return { p: best, snapped: 'edge' };
        }
        return { p, snapped: null };
    };

    const finishPolygon = (pts: Pt[]) => {
        if (pts.length < 3) return;
        const n = floorZones.length + 1;
        const zone: ZoneArea = { id: newId(), floor, name: `구역 ${n}`, points: pts };
        commit([...zones, zone]);
        setDrawPts([]);
        setSelectedId(zone.id);
        setRenamingId(zone.id);
    };

    // --- 그리기 ---
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = size.w * dpr;
        canvas.height = size.h * dpr;
        const ctx = canvas.getContext('2d')!;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size.w, size.h);

        // 부재 (모델 좌표로 채우기)
        ctx.save();
        ctx.setTransform(dpr * view.scale, 0, 0, -dpr * view.scale, dpr * view.ox, dpr * view.oy);
        const zoneColor = new Map(floorZones.map(z => [z.id, colorOf(z)]));
        for (const b of bodies) {
            const ids = assign.get(b.index) ?? [];
            let color: string;
            if (ids.length > 1) color = COLOR_OVERLAP;
            else if (ids.length === 1) color = zoneColor.get(ids[0])!;
            else color = b.ton > 0 ? COLOR_FREE : COLOR_EMPTY;
            const dimmed = (selectedId && !ids.includes(selectedId)) || (showFree && ids.length > 0);
            ctx.globalAlpha = dimmed ? 0.15 : b.vertical ? 0.95 : 0.45;
            ctx.fillStyle = color;
            ctx.fill(b.path);
        }
        ctx.restore();

        // 구역 다각형
        ctx.globalAlpha = 1;
        for (const z of floorZones) {
            const color = colorOf(z);
            const sel = z.id === selectedId;
            ctx.beginPath();
            z.points.forEach((p, i) => { const [x, y] = toScreen(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
            ctx.closePath();
            ctx.fillStyle = color + (sel ? '26' : '12');
            ctx.fill();
            ctx.lineWidth = sel ? 3 : 1.5;
            ctx.strokeStyle = color;
            ctx.stroke();
            for (const p of z.points) {
                const [x, y] = toScreen(p);
                ctx.fillStyle = color;
                ctx.fillRect(x - 2, y - 2, 4, 4);
            }
            const [cx, cy] = toScreen(polygonCenter(z.points));
            ctx.font = `${sel ? 'bold ' : ''}12px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 4;
            ctx.strokeStyle = '#ffffff';
            ctx.strokeText(z.name, cx, cy);
            ctx.fillStyle = '#0f172a';
            ctx.fillText(z.name, cx, cy);
        }

        // 그리는 중인 선
        if (drawPts.length) {
            ctx.beginPath();
            drawPts.forEach((p, i) => { const [x, y] = toScreen(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
            if (cursor) { const [x, y] = toScreen(cursor.p); ctx.lineTo(x, y); }
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
            drawPts.forEach((p, i) => {
                const [x, y] = toScreen(p);
                ctx.fillStyle = i === 0 ? '#16a34a' : '#0f172a';
                ctx.beginPath(); ctx.arc(x, y, i === 0 ? 5 : 3, 0, Math.PI * 2); ctx.fill();
            });
        }
        // 스냅 표시
        if (mode === 'draw' && cursor?.snapped) {
            const [x, y] = toScreen(cursor.p);
            ctx.strokeStyle = cursor.snapped === 'close' ? '#16a34a' : cursor.snapped === 'vertex' ? '#dc2626' : '#2563eb';
            ctx.lineWidth = 2;
            ctx.beginPath();
            if (cursor.snapped === 'edge') { ctx.moveTo(x - 7, y); ctx.lineTo(x + 7, y); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7); }
            else ctx.rect(x - 6, y - 6, 12, 12);
            ctx.stroke();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [size, view, bodies, assign, floorZones, drawPts, cursor, selectedId, showFree, mode, zones]);

    // --- 마우스 ---
    const drag = useRef<{ x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
    const local = (e: React.PointerEvent) => {
        const r = canvasRef.current!.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const onPointerDown = (e: React.PointerEvent) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy, moved: false };
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const d = drag.current;
        if (d && (e.buttons & 1 || e.buttons & 2 || e.buttons & 4)) {
            const dx = e.clientX - d.x, dy = e.clientY - d.y;
            if (Math.hypot(dx, dy) > 4) d.moved = true;
            if (d.moved) { setView(v => ({ ...v, ox: d.ox + dx, oy: d.oy + dy })); return; }
        }
        if (mode === 'draw') {
            const [sx, sy] = local(e);
            setCursor(snap(toWorld(sx, sy), e.shiftKey));
        }
    };
    const onPointerUp = (e: React.PointerEvent) => {
        const d = drag.current;
        drag.current = null;
        if (!d || d.moved || e.button !== 0) return;
        const [sx, sy] = local(e);
        const world = toWorld(sx, sy);
        if (mode === 'draw' && canEdit) {
            const s = snap(world, e.shiftKey);
            if (s.snapped === 'close') finishPolygon(drawPts);
            else if (!drawPts.length || dist(s.p, drawPts[drawPts.length - 1]) > 1e-6) setDrawPts([...drawPts, s.p]);
            return;
        }
        // 선택: 작은 구역이 위에 오도록 뒤에서부터
        const hit = [...floorZones].reverse().find(z => pointInPolygon(world, z.points));
        setSelectedId(hit?.id ?? null);
    };
    // 휠 확대/축소 (페이지가 스크롤되지 않게 passive가 아닌 리스너로)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const r = canvas.getBoundingClientRect();
            const sx = e.clientX - r.left, sy = e.clientY - r.top;
            const k = Math.exp(-e.deltaY * 0.0015);
            setView(v => {
                const scale = Math.min(Math.max(v.scale * k, 0.2), 2000);
                const f = scale / v.scale;
                return { scale, ox: sx - (sx - v.ox) * f, oy: sy - (sy - v.oy) * f };
            });
        };
        canvas.addEventListener('wheel', onWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', onWheel);
    }, []);

    // 키보드: Esc 취소, Backspace 마지막 점 지우기, Enter 닫기, Delete 선택 구역 삭제
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
            if (e.key === 'Escape') { setDrawPts([]); setSelectedId(null); }
            else if (e.key === 'Backspace' && drawPts.length) { e.preventDefault(); setDrawPts(drawPts.slice(0, -1)); }
            else if (e.key === 'Enter' && drawPts.length >= 3) finishPolygon(drawPts);
            else if (e.key === 'Delete' && selectedId && canEdit) removeZone(selectedId);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    });

    const removeZone = (id: string) => {
        const z = zones.find(x => x.id === id);
        if (!z || !confirm(`'${z.name}' 구역을 삭제할까요?`)) return;
        commit(zones.filter(x => x.id !== id));
        if (selectedId === id) setSelectedId(null);
    };
    const renameZone = (id: string, name: string) => {
        const clean = name.trim();
        if (clean) commit(zones.map(z => (z.id === id ? { ...z, name: clean } : z)));
        setRenamingId(null);
    };
    const copyFrom = (src: string) => {
        const source = zones.filter(z => z.floor === src);
        if (!source.length) return;
        if (floorZones.length && !confirm(`${floorLabel(building, floor)}에 이미 구역 ${floorZones.length}개가 있습니다. ${floorLabel(building, src)} 구역 ${source.length}개를 더할까요?`)) return;
        commit([...zones, ...source.map(z => ({ ...z, id: newId(), floor, points: z.points.map(p => [p[0], p[1]] as Pt) }))]);
    };

    const otherFloorsWithZones = floors.filter(f => f !== floor && zones.some(z => z.floor === f));
    const assignedTon = stats.totalTon - stats.freeTon;

    return (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 min-h-[560px]">
            <div className="relative bg-white rounded-xl border border-slate-200 overflow-hidden min-h-[420px] flex flex-col">
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-100 text-xs">
                    <select value={floor} onChange={e => { setFloor(e.target.value); setDrawPts([]); setSelectedId(null); }} className="px-2 py-1.5 border border-slate-300 rounded-lg text-sm font-bold">
                        {floors.map(f => <option key={f} value={f}>{floorLabel(building, f)} ({zones.filter(z => z.floor === f).length})</option>)}
                    </select>
                    <div className="flex bg-slate-100 p-0.5 rounded-lg">
                        <button onClick={() => { setMode('select'); setDrawPts([]); setCursor(null); }} className={`flex items-center gap-1 px-2.5 py-1 rounded-md ${mode === 'select' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>
                            <MousePointer2 size={13} /> 선택·이동
                        </button>
                        {canEdit && (
                            <button onClick={() => setMode('draw')} className={`flex items-center gap-1 px-2.5 py-1 rounded-md ${mode === 'draw' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>
                                <PenLine size={13} /> 구역 그리기
                            </button>
                        )}
                    </div>
                    <label className="flex items-center gap-1 text-slate-600"><input type="checkbox" checked={snapOn} onChange={e => setSnapOn(e.target.checked)} /> 스냅</label>
                    <button onClick={fit} className="flex items-center gap-1 px-2 py-1 text-slate-600 hover:bg-slate-100 rounded"><Maximize size={13} /> 전체 보기</button>
                    {canEdit && otherFloorsWithZones.length > 0 && (
                        <select value="" onChange={e => e.target.value && copyFrom(e.target.value)} className="px-2 py-1 border border-slate-300 rounded text-slate-600">
                            <option value="">다른 층 구역 복사...</option>
                            {otherFloorsWithZones.map(f => <option key={f} value={f}>{floorLabel(building, f)} ({zones.filter(z => z.floor === f).length}개)</option>)}
                        </select>
                    )}
                </div>
                <div ref={wrapRef} className="relative flex-1 min-h-[400px]">
                    <canvas
                        ref={canvasRef}
                        style={{ width: size.w, height: size.h, cursor: mode === 'draw' ? 'crosshair' : 'grab' }}
                        className="absolute inset-0 touch-none"
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerLeave={() => setCursor(null)}
                        onContextMenu={e => e.preventDefault()}
                    />
                    <div className="absolute left-3 bottom-3 bg-white/90 rounded-lg border border-slate-200 px-3 py-2 text-[11px] text-slate-600 space-y-0.5 pointer-events-none">
                        {mode === 'draw' ? (
                            <>
                                <p className="font-bold text-slate-700">구역 그리기</p>
                                <p>클릭: 점 찍기 · 첫 점(초록)을 누르거나 Enter: 닫기</p>
                                <p>Shift: 수평/수직 · Backspace: 마지막 점 취소 · Esc: 취소</p>
                                <p>스냅: <span className="text-red-600">■</span> 꼭짓점 <span className="text-blue-600">+</span> 기존 선 <span className="text-green-600">■</span> 닫기</p>
                            </>
                        ) : (
                            <p>드래그: 이동 · 휠: 확대/축소 · 구역 클릭: 선택 · Delete: 선택 구역 삭제</p>
                        )}
                        <p className="pt-1 flex flex-wrap gap-x-2">
                            <span><span className="inline-block w-2.5 h-2.5 rounded-sm align-middle mr-1" style={{ background: COLOR_FREE }} />구역 없음</span>
                            <span><span className="inline-block w-2.5 h-2.5 rounded-sm align-middle mr-1" style={{ background: COLOR_OVERLAP }} />겹침</span>
                            <span><span className="inline-block w-2.5 h-2.5 rounded-sm align-middle mr-1 border border-slate-300" style={{ background: COLOR_EMPTY }} />실행 물량 없음</span>
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-100 space-y-1">
                    <p className="text-xs text-slate-500">{dong} {floorLabel(building, floor)} · 실행 철근 (SHOP 기준 층)</p>
                    <p className="text-sm text-slate-700">
                        구역에 든 실행 <b>{fmtT(assignedTon)} t</b> / 전체 {fmtT(stats.totalTon)} t
                        <span className="text-slate-400"> ({stats.totalTon > 0 ? Math.round((assignedTon / stats.totalTon) * 100) : 0}%)</span>
                    </p>
                    {stats.freeCount > 0 && (
                        <button onClick={() => { setShowFree(!showFree); setSelectedId(null); }} className={`w-full text-left text-xs rounded px-2 py-1 ${showFree ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-700'}`}>
                            구역 없는 부재 {stats.freeCount}개 · {fmtT(stats.freeTon)} t {showFree ? '(강조 중)' : '→ 평면에서 강조'}
                        </button>
                    )}
                    {stats.overlapCount > 0 && (
                        <p className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12} /> 두 구역 이상에 든 부재 {stats.overlapCount}개 (빨간색, 먼저 그린 구역에 집계)</p>
                    )}
                    {!model.members?.length && <p className="text-xs text-amber-600">모델 물량이 없어 실행 철근을 알 수 없습니다. 물량 파일(산출서)을 올려 주세요.</p>}
                </div>

                <div className="flex-1 overflow-y-auto">
                    {floorZones.length === 0 && (
                        <p className="p-4 text-sm text-slate-500">
                            이 층에 구역이 없습니다. {canEdit ? "'구역 그리기'로 SHOP 도면의 구간 경계를 따라 그려 주세요." : ''}
                        </p>
                    )}
                    {(() => {
                        // 선택한 구역 상세는 목록 위 고정 카드에 (목록이 펼쳐지며 밀리지 않게)
                        const z = floorZones.find(x => x.id === selectedId);
                        if (!z) return null;
                        const row = stats.rows.get(z.id)!;
                        return (
                            <div className="m-3 p-3 rounded-lg border-2 text-xs space-y-2" style={{ borderColor: colorOf(z) }}>
                                <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colorOf(z) }} />
                                    {renamingId === z.id ? (
                                        <input
                                            autoFocus
                                            defaultValue={z.name}
                                            onFocus={e => e.target.select()}
                                            onBlur={e => renameZone(z.id, e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenamingId(null); }}
                                            className="flex-1 min-w-0 px-1.5 py-0.5 border border-blue-400 rounded text-sm"
                                            placeholder="예: 7-1번구간 / 205동 주변"
                                        />
                                    ) : (
                                        <span className="flex-1 min-w-0 truncate text-sm font-bold text-slate-800" onDoubleClick={() => canEdit && setRenamingId(z.id)}>{z.name}</span>
                                    )}
                                    <button onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-slate-600" title="선택 해제"><X size={14} /></button>
                                </div>
                                <table className="w-full">
                                    <thead className="text-slate-400"><tr><th className="text-left font-normal">부재</th><th className="text-right font-normal">실행</th><th className="text-right font-normal">SHOP</th><th className="text-right font-normal">진척</th></tr></thead>
                                    <tbody>
                                        {FAMILIES.filter(f => row.plan[f] > 0 || row.shop[f] > 0).map(f => (
                                            <tr key={f} className="border-t border-slate-100">
                                                <td className="py-0.5">{f}</td>
                                                <td className="text-right">{fmtT(row.plan[f])} t</td>
                                                <td className="text-right">{fmtT(row.shop[f])} t</td>
                                                <td className="text-right font-bold">{pct(row.shop[f], row.plan[f])}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div>
                                    <p className="text-slate-500 mb-0.5">연결된 SHOP 도면 {row.drawings.length}장 · 부재 {row.bodies}개</p>
                                    {row.drawings.map(d => (
                                        <p key={d.name} className="text-slate-600 truncate" title={d.name}>· {d.name} <span className="text-slate-400">{d.ton.toFixed(2)} t{d.shared ? ' (나눔)' : ''}</span></p>
                                    ))}
                                </div>
                                {canEdit && (
                                    <div className="flex gap-3 pt-1">
                                        <button onClick={() => setRenamingId(z.id)} className="text-blue-600">이름 바꾸기</button>
                                        <button onClick={() => removeZone(z.id)} className="text-red-600 flex items-center gap-1"><Trash2 size={12} /> 구역 삭제</button>
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {floorZones.length > 0 && <p className="px-3 pt-2 pb-1 text-[11px] font-bold text-slate-500">구역 목록 ({floorZones.length}) · SHOP / 실행</p>}
                    {floorZones.map(z => {
                        const row = stats.rows.get(z.id)!;
                        const plan = FAMILIES.reduce((a, f) => a + row.plan[f], 0);
                        const shop = FAMILIES.reduce((a, f) => a + row.shop[f], 0);
                        const sel = z.id === selectedId;
                        return (
                            <div
                                key={z.id}
                                className={`flex items-center gap-2 px-3 py-2 border-b border-slate-100 cursor-pointer ${sel ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                                onClick={() => setSelectedId(z.id)}
                                onDoubleClick={() => { if (canEdit) { setSelectedId(z.id); setRenamingId(z.id); } }}
                                title={canEdit ? '누르면 선택, 두 번 누르면 이름 바꾸기' : z.name}
                            >
                                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: colorOf(z) }} />
                                <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-800">{z.name}</span>
                                <span className="text-xs text-slate-500 whitespace-nowrap">{fmtT(shop)}/{fmtT(plan)} t</span>
                                <span className={`text-xs font-bold w-12 text-right ${plan > 0 && shop / plan > 1.05 ? 'text-red-600' : 'text-slate-700'}`}>{pct(shop, plan)}</span>
                            </div>
                        );
                    })}

                    {stats.unlinked.length > 0 && (
                        <div className="p-3 border-t border-slate-200 bg-amber-50/40">
                            <p className="text-xs font-bold text-amber-800 flex items-center gap-1 mb-1"><Link2Off size={12} /> 구역과 연결 안 된 SHOP 도면 ({stats.unlinked.length}장 · {fmtT(stats.unlinked.reduce((a, d) => a + d.ton, 0))} t)</p>
                            <p className="text-[11px] text-slate-500 mb-1">구역 이름을 도면명의 구역과 같게 하거나('/'로 여러 이름), SHOP 점검 화면에서 도면의 구역을 고치세요.</p>
                            {stats.unlinked.map(d => (
                                <p key={d.name} className="text-xs text-slate-700 truncate" title={d.name}>
                                    · {d.name} <span className="text-slate-400">{d.ton.toFixed(2)} t · 구역 {d.areas.join(', ') || '없음'}</span>
                                </p>
                            ))}
                        </div>
                    )}
                </div>
                {canEdit && floorZones.length > 0 && (
                    <div className="p-2 border-t border-slate-100 text-[11px] text-slate-400 flex items-center gap-1">
                        <Copy size={11} /> 구역을 두 번 누르면 이름을 바꿀 수 있습니다. 구역은 이 브라우저에 저장됩니다.
                    </div>
                )}
            </div>
        </div>
    );
};
