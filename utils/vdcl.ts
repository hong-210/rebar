// 빌더허브 층별 참조 도면(.rhb.Data/DrawingData/{건물}_{층번호}_{이름}.vdcl)을 선분·글자로 펼친다.
// .vdcl은 gzip으로 압축한 VectorDraw XML이고, 층별로 잘라 둔 도면은 좌표(mm)가 모델 좌표(m)×1000과 같다.
// 그래서 /1000만 하면 구역 평면에 그대로 겹쳐진다.

export interface DrawingText { s: string; x: number; y: number; h: number; l: number }

export interface ParsedDrawing {
    name: string;        // 'B3F 끊어치기'
    fileName: string;
    floorNo: number;     // 빌더허브 층 번호 (-3 = B3F)
    layers: string[];
    segs: Float32Array;  // x1,y1,x2,y2 (m)
    segLayer: Uint16Array;
    texts: DrawingText[];
}

// '2단지_지하주차장_-3_B3F 끊어치기.vdcl' → 층 -3, 이름 'B3F 끊어치기'. 층 번호가 없는 파일은 원본 도면 전체라 좌표가 모델과 다르다
export function drawingFileInfo(fileName: string): { floorNo: number; name: string } | null {
    const m = fileName.replace(/\.vdcl$/i, '').match(/_(-?\d+)_(.+)$/);
    return m ? { floorNo: Number(m[1]), name: m[2] } : null;
}

// --- 최소 XML 파서 (워커에는 DOMParser가 없다) ---
interface XNode { tag: string; F?: string; T?: string; V?: string; children: XNode[] }

const decodeEntities = (s: string) => s.indexOf('&') < 0 ? s
    : s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e: string) =>
        e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'amp' ? '&' : e === 'quot' ? '"' : e === 'apos' ? "'"
            : String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));

function parseXml(text: string): XNode {
    const root: XNode = { tag: '#root', children: [] };
    const stack: XNode[] = [root];
    const re = /<(\/?)([A-Za-z_][\w.:-]*)([^>]*?)(\/?)>/g;
    const attrRe = /(\w+)="([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        const [, close, tag, attrs, selfClose] = m;
        if (close) { if (stack.length > 1) stack.pop(); continue; }
        const node: XNode = { tag, children: [] };
        let a: RegExpExecArray | null;
        attrRe.lastIndex = 0;
        while ((a = attrRe.exec(attrs))) {
            if (a[1] === 'F') node.F = a[2];
            else if (a[1] === 'T') node.T = a[2];
            else if (a[1] === 'V') node.V = decodeEntities(a[2]);
        }
        stack[stack.length - 1].children.push(node);
        if (!selfClose) stack.push(node);
    }
    return root;
}

const child = (n: XNode, f: string) => n.children.find(c => c.F === f);
const num = (n: XNode, f: string, d = 0) => { const c = child(n, f); return c?.V !== undefined ? parseFloat(c.V) : d; };
const point = (n: XNode, f: string): [number, number] | null => {
    const c = child(n, f);
    if (!c?.V) return null;
    const p = c.V.split(',');
    return [parseFloat(p[0]), parseFloat(p[1])];
};

type M = [number, number, number, number, number, number]; // x' = a x + b y + e, y' = c x + d y + f
const tf = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[1] * y + m[4], m[2] * x + m[3] * y + m[5]];
const mul = (p: M, q: M): M => [
    p[0] * q[0] + p[1] * q[2], p[0] * q[1] + p[1] * q[3],
    p[2] * q[0] + p[3] * q[2], p[2] * q[1] + p[3] * q[3],
    p[0] * q[4] + p[1] * q[5] + p[4], p[2] * q[4] + p[3] * q[5] + p[5],
];

export function parseVdcl(xml: string, fileName: string): ParsedDrawing {
    const info = drawingFileInfo(fileName) ?? { floorNo: 0, name: fileName };
    const root = parseXml(xml);

    // 핸들 → 요소, 레이어 이름
    const handles = new Map<string, XNode>();
    const layerNames = new Map<string, string>();
    let modelEntities: XNode | undefined;
    let biggest: XNode | undefined;
    const visit = (n: XNode) => {
        const h = n.children.find(c => c.F === 'Handle' && c.T === 'vdHandle');
        if (h?.V) handles.set(h.V, n);
        if (n.T === 'vdLayer') { const nm = child(n, 'Name'); if (h?.V && nm?.V !== undefined) layerNames.set(h.V, nm.V); }
        if (n.T === 'vdLayout' && child(n, 'Name')?.V === 'Model') modelEntities = child(n, 'Entities');
        if (n.F === 'Entities' && (!biggest || n.children.length > biggest.children.length)) biggest = n;
        for (const c of n.children) visit(c);
    };
    visit(root);
    const entities = modelEntities ?? biggest;

    const layers: string[] = [];
    const layerIndex = new Map<string, number>();
    const li = (name: string) => {
        let i = layerIndex.get(name);
        if (i === undefined) { i = layers.length; layers.push(name); layerIndex.set(name, i); }
        return i;
    };
    const segs: number[] = [];
    const segLayer: number[] = [];
    const texts: DrawingText[] = [];
    const add = (l: number, a: [number, number], b: [number, number]) => {
        segs.push(a[0] / 1000, a[1] / 1000, b[0] / 1000, b[1] / 1000);
        segLayer.push(l);
    };
    const arc = (l: number, m: M, c: [number, number], r: number, a0: number, a1: number) => {
        let sweep = a1 - a0;
        while (sweep <= 0) sweep += Math.PI * 2;
        const n = Math.max(2, Math.ceil((sweep / (Math.PI * 2)) * 16));
        let prev = tf(m, c[0] + r * Math.cos(a0), c[1] + r * Math.sin(a0));
        for (let i = 1; i <= n; i++) {
            const t = a0 + (sweep * i) / n;
            const p = tf(m, c[0] + r * Math.cos(t), c[1] + r * Math.sin(t));
            add(l, prev, p);
            prev = p;
        }
    };

    const walk = (list: XNode[], m: M, inherit: string | null, depth: number) => {
        if (depth > 10) return;
        for (const el of list) {
            const layerRef = child(el, 'Layer');
            let lay = layerRef?.V ? layerNames.get(layerRef.V) ?? '?' : '?';
            if (lay === '0' && inherit) lay = inherit; // 블록 안 0 레이어는 삽입한 레이어를 따른다
            switch (el.T) {
                case 'vdLine': {
                    const a = point(el, 'StartPoint'), b = point(el, 'EndPoint');
                    if (a && b) add(li(lay), tf(m, ...a), tf(m, ...b));
                    break;
                }
                case 'vdPolyline': {
                    const vl = child(el, 'VertexList');
                    const pts = (vl?.children ?? []).filter(v => v.T === 'Vertex' && v.V).map(v => {
                        const p = v.V!.split(',');
                        return tf(m, parseFloat(p[0]), parseFloat(p[1]));
                    });
                    const l = li(lay);
                    for (let i = 0; i < pts.length - 1; i++) add(l, pts[i], pts[i + 1]);
                    if (child(el, 'Flag')?.V === '1' && pts.length > 2) add(l, pts[pts.length - 1], pts[0]);
                    break;
                }
                case 'vdCircle': {
                    const c = point(el, 'Center');
                    if (c) arc(li(lay), m, c, num(el, 'Radius'), 0, Math.PI * 2);
                    break;
                }
                case 'vdArc': {
                    const c = point(el, 'Center');
                    if (c) arc(li(lay), m, c, num(el, 'Radius'), num(el, 'StartAng'), num(el, 'EndAng'));
                    break;
                }
                case 'vdText':
                case 'vdMText': {
                    const p = point(el, 'InsertionPoint');
                    const s = child(el, 'TextString')?.V;
                    if (p && s) {
                        const [x, y] = tf(m, ...p);
                        const scale = Math.hypot(m[0], m[2]);
                        texts.push({ s: s.replace(/\\P/g, ' ').replace(/\{\\[^;]*;|\}/g, ''), x: x / 1000, y: y / 1000, h: (num(el, 'Height') * scale) / 1000, l: li(lay) });
                    }
                    break;
                }
                case 'vdInsert': {
                    const ref = child(el, 'Block');
                    const block = ref ? (ref.tag === 'H' ? handles.get(ref.V ?? '') : ref) : undefined;
                    const ents = block && child(block, 'Entities');
                    if (!ents) break;
                    const ins = point(el, 'InsertionPoint') ?? [0, 0];
                    const sx = num(el, 'Xscale', 1), sy = num(el, 'Yscale', 1), r = num(el, 'Rotation', 0);
                    const origin = point(block, 'Origin') ?? [0, 0];
                    const cr = Math.cos(r), sr = Math.sin(r);
                    const local = mul([cr * sx, -sr * sy, sr * sx, cr * sy, ins[0], ins[1]], [1, 0, 0, 1, -origin[0], -origin[1]]);
                    walk(ents.children, mul(m, local), lay, depth + 1);
                    break;
                }
            }
        }
    };
    if (entities) walk(entities.children, [1, 0, 0, 1, 0, 0], null, 0);

    return {
        name: info.name, fileName, floorNo: info.floorNo, layers,
        segs: new Float32Array(segs), segLayer: new Uint16Array(segLayer), texts
    };
}

export async function readVdclFile(file: File): Promise<ParsedDrawing> {
    const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    return parseVdcl(text.replace(/^﻿/, ''), file.name);
}

// 레이어 이름 줄이기: 'XREF_송파_2BL_지하주차장 지하3층$0$A-COL' → 'A-COL (지하주차장 지하3층)'
export function shortLayerName(name: string): string {
    const m = name.match(/^XREF_(.+?)\$\d+\$(.+)$/);
    if (!m) return name;
    const src = m[1].replace(/^송파_2BL_/, '');
    return `${m[2]} (${src})`;
}
