import earcut from 'earcut';

// 빌더허브(RebarHub) `.rhb.Data/Models/*.sab` (ACIS 35.0 바이너리) 판독기.
// Builderhub_check의 sab.py / mesh.py를 브라우저용으로 옮긴 것이다.
//
// 부재마다 독립된 body이고 면은 전부 평면, 모서리는 전부 직선(다면체)이라
// body → lump → shell → face → loop → coedge → edge → vertex → point 위상만 따라가면 형상이 나온다.
// 부재는 ORIGINAL(접합 전 원본)과 가공본 두 벌이 저장돼 있어서 가공본만 쓴다.
//
// 바이너리 토큰:
//   0x02 char  0x03 short  0x04 int32  0x05 float  0x06 double  0x07 str(len1)  0x08 str(len2)  0x09 str(len4)
//   0x0A true  0x0B false  0x0C 포인터(int32, -1=null)
//   0x0D/0x0E 엔티티 타입명 — "이름%<int32>"로 번호를 정의하고 이후엔 "%<int32>"로 참조 (번호 표는 body마다 초기화)
//   0x0F '{'  0x10 '}'  0x11 레코드 끝  0x12/0x13/0x14 3중 실수(위치/벡터)  0x15 enum(int32)

const T_PTR = 0x0c, T_TRUE = 0x0a, T_INT = 0x04, T_DOUBLE = 0x06, T_STR = 0x07;
const T_POINT = 0x13, T_VECTOR = 0x14;

interface Entity {
    kind: string;
    sub: string[];
    tags: number[];
    vals: any[];
}

export interface SabBody {
    msId: number;
    type: string;    // Slab, Beam, Wall, Column, Stair, LowWall, IsoFoot, Pit ...
    floor: number;   // 빌더허브 층 번호 (-1 = B1F, 1 = 1F ...)
    v0: number;      // positions에서 이 부재의 첫 꼭짓점 번호
    vn: number;      // 꼭짓점 수 (삼각형 수 × 3)
}

export interface SabModel {
    bodies: SabBody[];
    positions: Float32Array; // 삼각형 꼭짓점 xyz (면마다 독립, Z가 위)
    skippedOriginal: number;
    faceErrors: number;
}

export interface SabProgress {
    ratio: number;  // 0~1, 파일에서 읽은 위치
    bodies: number;
}

const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8');
const STR_REF = /^(.*?)%(\d+)$/;

function* iterBodies(buf: Uint8Array, onProgress?: (p: SabProgress) => void): Generator<Entity[]> {
    const header = latin1.decode(buf.subarray(0, 15));
    if (header !== 'ACIS BinaryFile') throw new Error('ACIS BinaryFile(.sab) 형식이 아닙니다.');
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const n = buf.length;

    let i = 31;
    for (let k = 0; k < 3; k++) i += 2 + buf[i + 1]; // 제품 정보 문자열 3개
    i += 27;                                         // 실수 3개

    let table = new Map<number, string>();
    const ident = (start: number, len: number): string => {
        let k = -1;
        for (let j = start; j < start + len; j++) if (buf[j] === 0x25) { k = j; break; }
        if (k < 0) return latin1.decode(buf.subarray(start, start + len));
        const name = latin1.decode(buf.subarray(start, k));
        const num = start + len >= k + 5 ? view.getInt32(k + 1, true) : -1;
        if (name) { table.set(num, name); return name; }
        return table.get(num) ?? '';
    };
    const str = (s: string): string => {
        const m = STR_REF.exec(s);
        if (!m) return s;
        const num = Number(m[2]);
        if (m[1]) { table.set(num, m[1]); return m[1]; }
        return table.get(num) ?? '';
    };

    let ents: Entity[] = [];
    let cur: Entity | null = null;
    let sub: string[] = [];
    let count = 0;
    while (i < n) {
        const t = buf[i++];
        if (t === 0x0e) {
            const ln = buf[i++];
            sub.push(ident(i, ln)); i += ln;
        } else if (t === 0x0d) {
            const ln = buf[i++];
            const kind = ident(i, ln); i += ln;
            if (kind === 'End-of-ACIS-data') break;
            cur = { kind, sub, tags: [], vals: [] };
            sub = [];
        } else if (t === 0x11) {
            if (cur) { ents.push(cur); cur = null; }
        } else if (!cur) {
            // body 경계 헤더: 04 a 04 b 04 c 0A (또는 파일 머리의 0A 07 str 04 04 04 0A)
            if (t === 0x04) {
                if (ents.length) {
                    yield ents;
                    ents = [];
                    table = new Map();
                    if (++count % 200 === 0) onProgress?.({ ratio: i / n, bodies: count });
                }
                i += 4;
                while (buf[i] === 0x04) i += 5;
                if (buf[i] === 0x0a) i++;
            } else if (t === 0x0a) {
                if (buf[i] === 0x07) {
                    i += 2 + buf[i + 1];
                    while (buf[i] === 0x04) i += 5;
                    if (buf[i] === 0x0a) i++;
                }
            } else {
                throw new Error(`레코드 밖 예상치 못한 토큰 0x${t.toString(16)} @ ${i - 1}`);
            }
        } else if (t === 0x0c || t === 0x04 || t === 0x15) {
            cur.tags.push(t); cur.vals.push(view.getInt32(i, true)); i += 4;
        } else if (t === 0x06) {
            cur.tags.push(t); cur.vals.push(view.getFloat64(i, true)); i += 8;
        } else if (t === 0x12 || t === 0x13 || t === 0x14) {
            cur.tags.push(t);
            cur.vals.push([view.getFloat64(i, true), view.getFloat64(i + 8, true), view.getFloat64(i + 16, true)]);
            i += 24;
        } else if (t === 0x0a || t === 0x0b || t === 0x0f || t === 0x10) {
            cur.tags.push(t); cur.vals.push(null);
        } else if (t === 0x07) {
            const ln = buf[i++];
            cur.tags.push(t); cur.vals.push(str(utf8.decode(buf.subarray(i, i + ln)))); i += ln;
        } else if (t === 0x08) {
            const ln = view.getUint16(i, true); i += 2;
            cur.tags.push(t); cur.vals.push(str(utf8.decode(buf.subarray(i, i + ln)))); i += ln;
        } else if (t === 0x09) {
            const ln = view.getInt32(i, true); i += 4;
            cur.tags.push(t); cur.vals.push(utf8.decode(buf.subarray(i, i + ln))); i += ln;
        } else if (t === 0x02) {
            cur.tags.push(t); cur.vals.push(buf[i]); i += 1;
        } else if (t === 0x03) {
            cur.tags.push(t); cur.vals.push(view.getInt16(i, true)); i += 2;
        } else if (t === 0x05) {
            cur.tags.push(t); cur.vals.push(view.getFloat32(i, true)); i += 4;
        } else {
            throw new Error(`알 수 없는 토큰 0x${t.toString(16)} @ ${i - 1} (${cur.kind})`);
        }
    }
    if (ents.length) yield ents;
}

const ptr = (e: Entity, idx: number): number => (e.tags[idx] === T_PTR ? e.vals[idx] : -1);

function firstOf(e: Entity, tag: number) {
    const k = e.tags.indexOf(tag);
    return k < 0 ? undefined : e.vals[k];
}

// body에 달린 attrib 들 → TYPE, MS_ID, MS_FL_ID, ORIGINAL
function bodyAttributes(ents: Entity[]) {
    const out: { TYPE?: string; MS_ID?: number; MS_FL_ID?: number; ORIGINAL?: number } = {};
    for (const e of ents) {
        if (e.kind !== 'attrib') continue;
        const strs = e.vals.filter((_, k) => e.tags[k] === T_STR) as string[];
        if (!strs.length) continue;
        const ints = e.vals.filter((_, k) => e.tags[k] === T_INT) as number[];
        const name = strs[0];
        if (name === 'MS_ID' || name === 'MS_FL_ID' || name === 'ORIGINAL') out[name] = ints[ints.length - 1];
        else if (name === 'TYPE' && strs.length > 1) out.TYPE = strs[1];
    }
    return out;
}

type Vec3 = [number, number, number];

function vertexPoint(ents: Entity[], vtx: number): Vec3 | undefined {
    const v = ents[vtx];
    for (let k = 0; k < v.tags.length; k++) {
        const target = v.vals[k];
        if (v.tags[k] === T_PTR && target >= 0 && target < ents.length && ents[target].kind === 'point') {
            const p = firstOf(ents[target], T_POINT);
            if (p) return p;
        }
    }
    return undefined;
}

function loopPoints(ents: Entity[], loopIdx: number): Vec3[] | null {
    const start = ptr(ents[loopIdx], 5);
    const pts: Vec3[] = [];
    let c = start;
    for (let guard = 0; c >= 0 && guard < 10000; guard++) {
        const co = ents[c];
        const reversed = co.tags[8] === T_TRUE;
        const edge = ents[ptr(co, 7)];
        const p = vertexPoint(ents, ptr(edge, reversed ? 6 : 4));
        if (!p) return null;
        pts.push(p);
        c = ptr(co, 4);
        if (c === start) break;
    }
    return pts;
}

// 평면 다각형(구멍 포함)을 삼각형으로 나눠 out에 꼭짓점을 넣는다. 감김은 바깥 법선에 맞춘다.
function triangulate(outer: Vec3[], holes: Vec3[][], normal: Vec3, out: number[]) {
    const pool = holes.length ? outer.concat(...holes) : outer;
    let tris: number[];
    if (!holes.length && outer.length === 3) {
        tris = [0, 1, 2];
    } else {
        const ax = Math.abs(normal[0]) >= Math.abs(normal[1]) && Math.abs(normal[0]) >= Math.abs(normal[2]) ? 0
            : Math.abs(normal[1]) >= Math.abs(normal[2]) ? 1 : 2;
        const a = ax === 0 ? 1 : 0, b = ax === 2 ? 1 : 2;
        const flat: number[] = [];
        for (const p of pool) flat.push(p[a], p[b]);
        const holeIdx: number[] = [];
        let at = outer.length;
        for (const h of holes) { holeIdx.push(at); at += h.length; }
        tris = earcut(flat, holeIdx.length ? holeIdx : undefined, 2);
    }
    for (let k = 0; k < tris.length; k += 3) {
        const pa = pool[tris[k]];
        let pb = pool[tris[k + 1]], pc = pool[tris[k + 2]];
        const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2];
        const vx = pc[0] - pa[0], vy = pc[1] - pa[1], vz = pc[2] - pa[2];
        const dot = (uy * vz - uz * vy) * normal[0] + (uz * vx - ux * vz) * normal[1] + (ux * vy - uy * vx) * normal[2];
        if (dot < 0) [pb, pc] = [pc, pb];
        out.push(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2], pc[0], pc[1], pc[2]);
    }
}

function bodyToMesh(ents: Entity[], out: number[]): number {
    let errors = 0;
    let lump = ptr(ents[0], 5);
    while (lump >= 0) {
        let shell = ptr(ents[lump], 5);
        while (shell >= 0) {
            let f = ptr(ents[shell], 6);
            while (f >= 0) {
                const fe = ents[f];
                try {
                    const surf = ents[ptr(fe, 8)];
                    if (surf.sub.includes('plane')) {
                        const nvec = firstOf(surf, T_VECTOR) as Vec3;
                        const s = fe.tags[9] === T_TRUE ? -1 : 1;
                        const normal: Vec3 = [nvec[0] * s, nvec[1] * s, nvec[2] * s];
                        const loops: Vec3[][] = [];
                        let li = ptr(fe, 5);
                        while (li >= 0) {
                            const pts = loopPoints(ents, li);
                            if (pts && pts.length >= 3) loops.push(pts);
                            li = ptr(ents[li], 4);
                        }
                        if (loops.length) triangulate(loops[0], loops.slice(1), normal, out);
                    }
                } catch {
                    errors++;
                }
                f = ptr(fe, 4);
            }
            shell = ptr(ents[shell], 3);
        }
        lump = ptr(ents[lump], 3);
    }
    return errors;
}

export function parseSab(buf: Uint8Array, onProgress?: (p: SabProgress) => void): SabModel {
    const bodies: SabBody[] = [];
    const chunks: Float32Array[] = [];
    let total = 0, skippedOriginal = 0, faceErrors = 0;

    for (const ents of iterBodies(buf, onProgress)) {
        const attr = bodyAttributes(ents);
        if (attr.ORIGINAL) { skippedOriginal++; continue; }
        const verts: number[] = [];
        faceErrors += bodyToMesh(ents, verts);
        if (!verts.length) continue;
        const vn = verts.length / 3;
        bodies.push({ msId: attr.MS_ID ?? -1, type: attr.TYPE ?? '?', floor: attr.MS_FL_ID ?? 0, v0: total, vn });
        chunks.push(new Float32Array(verts));
        total += vn;
    }

    const positions = new Float32Array(total * 3);
    let at = 0;
    for (const c of chunks) { positions.set(c, at); at += c.length; }
    return { bodies, positions, skippedOriginal, faceErrors };
}
