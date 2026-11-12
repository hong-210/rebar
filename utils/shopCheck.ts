import { MaterialEntry, MemberClass } from '../types';

// SHOP 도면 한 장 단위로 적정성을 본다. 층 전체가 끝나기 전이라도, 같은 종류 도면끼리 비교하면
// 강종·직경 구성·커플러 밀도가 튀는 도면을 도면이 올라오는 즉시 잡을 수 있다.
// 도면명은 정해진 형식이 없어서 [구역] [층] [부재] [꼬리표] 순서의 낱말을 키워드로 뽑는다.

export const MEMBER_GROUPS = ['기초', 'EV PIT 기초', '다월', '기둥·벽체', '기둥', '벽체', '보·슬래브', '보', '슬래브', '계단', '미분류'] as const;
export type MemberGroup = typeof MEMBER_GROUPS[number];

export interface DrawingInfo {
    member: MemberGroup;
    memberGuessed: boolean;  // 도면명에 부재 낱말이 없어 층·수평/수직으로 짐작함
    areas: string[];         // 구역 (7-1번구간, 205동 주변, 201동, 발전기실 ...)
    tags: string[];          // 추가, 누락, 연장, 보강, 설계변경, 2차 ...
    supplement: boolean;     // 본도면이 아닌 추가·누락·연장·보강·설계변경분
}

const SUPPLEMENT_TAGS: [RegExp, string][] = [
    [/설계\s*변경/, '설계변경'],
    [/추가/, '추가'],
    [/누락/, '누락'],
    [/연장/, '연장'],
    [/보강/, '보강'],
];

// 실(室)·특수 구역 이름: 도면명에 있으면 구역으로 쓴다
const ROOM_WORDS = ['발전기실', '비상발전기실', '오염 PIT', '오염PIT', '램프', '저수조', '전기실', '기계실', '정화조'];

export function parseDrawingName(name: string, memberClass: MemberClass | undefined, isLowestFloor: boolean, dong: string): DrawingInfo {
    const text = name.replace(/배근도/g, ' ').replace(/\s+/g, ' ').trim();
    const tags: string[] = [];
    for (const [re, tag] of SUPPLEMENT_TAGS) if (re.test(text)) tags.push(tag);
    const order = text.match(/(\d+)\s*차/);
    if (order) tags.push(`${order[1]}차`);
    const supplement = tags.some(t => SUPPLEMENT_TAGS.some(([, s]) => s === t));

    // 부재: '보강'의 '보'를 보로 읽지 않도록 지우고 본다
    const w = text.replace(/보강/g, '').replace(/파일/g, '');
    const has = (re: RegExp) => re.test(w);
    const column = has(/기둥|후프/);
    const wall = has(/벽|띠철근|전단근/);
    const beam = has(/(^|[\s,(])보(?=[\s,)]|$)|이어치기/);
    const slab = has(/슬래브|슬라브/);
    let member: MemberGroup | undefined;
    if (has(/다월/)) member = '다월';
    else if (has(/EV\s*PIT/i) && has(/기초/)) member = 'EV PIT 기초';
    else if (has(/기초|매트/)) member = '기초';
    else if (column && wall) member = '기둥·벽체';
    else if (column) member = '기둥';
    else if (wall) member = '벽체';
    else if (beam && slab) member = '보·슬래브';
    else if (slab) member = '슬래브';
    else if (beam) member = '보';
    else if (has(/계단/)) member = '계단';
    let memberGuessed = false;
    if (!member) {
        memberGuessed = true;
        member = memberClass === 'V' ? '기둥·벽체' : memberClass === 'H' ? (isLowestFloor ? '기초' : '보·슬래브') : '미분류';
    }

    // 구역: 구간 → 'N동 주변' → 'N동' → 실 이름 순. 업로드한 동 이름과 같으면 동 전체라 구역이 아니다
    const areas: string[] = [];
    const add = (a: string) => { if (a && a !== dong && !areas.includes(a)) areas.push(a); };
    for (const m of text.matchAll(/(\d+(?:-\d+)?(?:\s*,\s*\d+(?:-\d+)?)*)\s*번\s*구간/g)) add(`${m[1].replace(/\s/g, '')}번구간`);
    for (const m of text.matchAll(/(\d+)\s*동\s*주변/g)) add(`${m[1]}동 주변`);
    for (const m of text.matchAll(/(\d+)\s*동(?!\s*주변)/g)) add(`${m[1]}동`);
    // 실 이름: 긴 이름부터 찾고, 이미 잡힌 이름에 포함되는 짧은 이름(발전기실 ⊂ 비상발전기실, 전기실 ⊂ 발전기실)은 건너뛴다
    const flat = text.replace(/\s/g, '');
    const rooms: string[] = [];
    for (const r of [...ROOM_WORDS].sort((a, b) => b.length - a.length)) {
        const key = r.replace(/\s/g, '');
        if (flat.includes(key) && !rooms.some(x => x.replace(/\s/g, '').includes(key))) rooms.push(r === '오염PIT' ? '오염 PIT' : r);
    }
    rooms.forEach(add);

    return { member, memberGuessed, areas, tags, supplement };
}

// 같은 종류 도면끼리 비교하려면 부재뿐 아니라 '어디의' 부재인지도 같아야 한다.
// 동 하부 기초(매트, D19 위주)와 주차장 구간 기초(D16·D13 위주)는 배근이 전혀 다르다.
export const areaKindOf = (info: DrawingInfo) =>
    info.areas.length === 0 ? '' : info.areas.every(a => /^\d+동$/.test(a)) ? '동 하부' : '주차장 구역';

export const peerLabel = (info: DrawingInfo) => [areaKindOf(info), info.member].filter(Boolean).join(' ');

// 추가·누락분을 본도면과 맞출 때 쓰는 부재 계열 (기둥 후프 추가분 ↔ 기둥·벽체 본도면)
export const familyOf = (m: MemberGroup) =>
    m === '기둥' || m === '벽체' || m === '기둥·벽체' ? '수직'
        : m === '보' || m === '슬래브' || m === '보·슬래브' ? '보·슬래브'
            : m === '기초' || m === 'EV PIT 기초' || m === '다월' ? '기초' : m;

// --- 도면 분류 수정값 (SHOP 점검 화면에서 고친 부재·구역, 이 브라우저에 프로젝트별로 기억) ---

export type DrawingOverrides = Record<string, Partial<Pick<DrawingInfo, 'member' | 'areas'>>>;
const OVERRIDE_KEY = 'rbm_v2_shopDrawingOverrides';
export const loadDrawingOverrides = (projectId: string): DrawingOverrides => {
    try { return JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}')[projectId] ?? {}; } catch { return {}; }
};
export const saveDrawingOverrides = (projectId: string, value: DrawingOverrides) => {
    try {
        const all = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}');
        all[projectId] = value;
        localStorage.setItem(OVERRIDE_KEY, JSON.stringify(all));
    } catch { /* 저장 못 해도 화면은 동작한다 */ }
};

// --- 도면 묶기 ---

export interface DrawingStat {
    key: string;          // 동|도면명
    dong: string;
    name: string;
    floors: string[];
    memberClass?: MemberClass;
    info: DrawingInfo;
    ton: number;
    ea: number;
    byDia: Map<string, number>; // 'D22 SD600' → ton
}

export const specKey = (m: MaterialEntry) => `${m.diameter} ${m.strength}`.trim();
const diaOf = (spec: string) => spec.split(' ')[0];

export function collectDrawings(
    materials: MaterialEntry[], projectId: string, lowestFloorOfDong: (dong: string) => string | undefined,
    overrides: DrawingOverrides = {}
): DrawingStat[] {
    const map = new Map<string, DrawingStat>();
    for (const m of materials) {
        if (m.projectId !== projectId || m.dataSource !== 'Shop') continue;
        const key = `${m.dong}|${m.zone}`;
        let d = map.get(key);
        if (!d) {
            d = { key, dong: m.dong, name: m.zone, floors: [], memberClass: m.memberClass, info: undefined as unknown as DrawingInfo, ton: 0, ea: 0, byDia: new Map() };
            map.set(key, d);
        }
        if (!d.floors.includes(m.floor)) d.floors.push(m.floor);
        if (m.memberClass && d.memberClass !== m.memberClass) d.memberClass = d.memberClass ? undefined : m.memberClass;
        if (m.itemType === 'Coupler') d.ea += m.shopQuantity || 0;
        else {
            const t = (m.shopWeight || 0) / 1000;
            d.ton += t;
            d.byDia.set(specKey(m), (d.byDia.get(specKey(m)) ?? 0) + t);
        }
    }
    for (const d of map.values()) {
        const lowest = lowestFloorOfDong(d.dong);
        d.info = parseDrawingName(d.name, d.memberClass, !!lowest && d.floors.every(f => f === lowest), d.dong);
        const o = overrides[d.key];
        if (o?.member) d.info = { ...d.info, member: o.member, memberGuessed: false };
        if (o?.areas) d.info = { ...d.info, areas: o.areas };
    }
    return Array.from(map.values());
}

// --- 점검 ---

export type FindingLevel = 'warn' | 'info';
export interface Finding { level: FindingLevel; kind: string; text: string }

export interface PeerProfile {
    count: number;              // 비교한 본도면 수
    label: string;              // 같은 종류 이름 (주차장 구역 기초 ...)
    share: Map<string, number>; // 가장 비슷한 도면의 직경별 비중 (0~1)
    nearest: string;            // 가장 비슷한 도면 이름
    couplerPerTon?: number;     // 톤당 커플러 중앙값
}

export interface DrawingCheck {
    drawing: DrawingStat;
    findings: Finding[];
    mixDiff?: number;      // 같은 종류 본도면 중 두 번째로 비슷한 도면과의 직경 구성 차이 (0~1, 총변동거리)
    couplerPerTon?: number;
    peer?: PeerProfile;
}

const median = (xs: number[]) => {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const diaShare = (d: DrawingStat) => {
    const byDia = new Map<string, number>();
    d.byDia.forEach((t, spec) => byDia.set(diaOf(spec), (byDia.get(diaOf(spec)) ?? 0) + t));
    const share = new Map<string, number>();
    byDia.forEach((t, dia) => share.set(dia, d.ton > 0 ? t / d.ton : 0));
    return share;
};

export const MIX_WARN = 0.35;          // 직경 구성 차이가 이보다 크면 경고
export const MIN_PEERS = 4;            // 같은 종류의 다른 본도면이 이보다 적으면 비교하지 않는다
export const RARE_GRADE = 0.05;        // 같은 직경 안에서 이 비율 미만인 강종은 드문 강종
export const SUPPLEMENT_WARN = 0.1;    // 구역·부재의 추가·누락분이 본도면의 이 비율을 넘으면 경고

// materials: 같은 프로젝트 전체(실행 + SHOP) — 강종 기준을 잡는다
export function checkDrawings(drawings: DrawingStat[], materials: MaterialEntry[], projectId: string): DrawingCheck[] {
    // 1. 직경별 강종 분포 (실행 + SHOP 전체 철근 중량)
    const gradeTon = new Map<string, Map<string, number>>();
    const designSpecs = new Map<string, Set<string>>(); // 동 → 실행에 있는 'D22 SD600'
    for (const m of materials) {
        if (m.projectId !== projectId || m.itemType === 'Coupler') continue;
        const kg = (m.dataSource === 'Shop' ? m.shopWeight : m.plannedWeight) || 0;
        if (kg <= 0) continue;
        const g = gradeTon.get(m.diameter) ?? new Map<string, number>();
        g.set(m.strength, (g.get(m.strength) ?? 0) + kg);
        gradeTon.set(m.diameter, g);
        if ((m.dataSource ?? 'Design') === 'Design') {
            const s = designSpecs.get(m.dong) ?? new Set<string>();
            s.add(specKey(m));
            designSpecs.set(m.dong, s);
        }
    }
    const gradeShare = (dia: string, grade: string) => {
        const g = gradeTon.get(dia);
        if (!g) return 1;
        const total = Array.from(g.values()).reduce((a, b) => a + b, 0);
        return total > 0 ? (g.get(grade) ?? 0) / total : 1;
    };

    // 2. 같은 종류(구역 종류 + 부재) 본도면 프로필 (직경 비중·커플러 밀도의 중앙값)
    const peersOf = new Map<string, DrawingStat[]>();
    for (const d of drawings) {
        if (d.info.supplement || d.ton <= 0 || d.info.member === '미분류') continue;
        const k = peerLabel(d.info);
        peersOf.set(k, [...(peersOf.get(k) ?? []), d]);
    }
    // 같은 종류 안에서도 배근 유형이 여럿일 수 있어(구간 기초: D19 위주 / D16 위주) 평균과 비교하지 않고,
    // 가장 비슷한 도면 두 장과도 다를 때만 튀는 도면으로 본다
    const mixDistance = (a: Map<string, number>, b: Map<string, number>) => {
        let diff = 0;
        new Set([...a.keys(), ...b.keys()]).forEach(k => { diff += Math.abs((a.get(k) ?? 0) - (b.get(k) ?? 0)); });
        return diff / 2;
    };
    const profileFor = (d: DrawingStat): (PeerProfile & { distance: number }) | undefined => {
        const peers = (peersOf.get(peerLabel(d.info)) ?? []).filter(p => p !== d);
        if (peers.length < MIN_PEERS) return undefined;
        const mine = diaShare(d);
        const ranked = peers.map(p => ({ p, share: diaShare(p), dist: 0 }))
            .map(x => ({ ...x, dist: mixDistance(mine, x.share) }))
            .sort((x, y) => x.dist - y.dist);
        const withCoupler = peers.filter(p => p.ea > 0);
        return {
            count: peers.length,
            label: peerLabel(d.info),
            share: ranked[0].share,
            nearest: ranked[0].p.name,
            distance: ranked[1].dist,
            couplerPerTon: withCoupler.length >= MIN_PEERS ? median(withCoupler.map(p => p.ea / p.ton)) : undefined
        };
    };

    // 3. 추가·누락분 ↔ 본도면: 같은 동, 같은 부재 계열, 겹치는 구역(둘 다 구역이 없으면 동 전체)
    const related = (a: DrawingStat, b: DrawingStat) =>
        a.dong === b.dong && familyOf(a.info.member) === familyOf(b.info.member) &&
        (a.info.areas.length === 0 && b.info.areas.length === 0 || a.info.areas.some(x => b.info.areas.includes(x)));
    const bases = drawings.filter(d => !d.info.supplement);
    const supplements = drawings.filter(d => d.info.supplement);

    return drawings.map(d => {
        const findings: Finding[] = [];
        const design = designSpecs.get(d.dong);
        d.byDia.forEach((t, spec) => {
            const [dia, grade = ''] = spec.split(' ');
            if (design?.size && !design.has(spec)) {
                findings.push({ level: 'warn', kind: '강종', text: `${spec} ${t.toFixed(2)} t: 이 동 실행 물량에 없는 직경·강종` });
            } else if (gradeShare(dia, grade) < RARE_GRADE) {
                findings.push({ level: 'warn', kind: '강종', text: `${spec} ${t.toFixed(2)} t: ${dia}는 대부분 다른 강종 (${grade} ${(gradeShare(dia, grade) * 100).toFixed(1)}%)` });
            }
        });

        const result: DrawingCheck = { drawing: d, findings };
        if (d.info.memberGuessed) findings.push({ level: 'info', kind: '분류', text: `도면명에 부재 이름이 없어 '${d.info.member}'(으)로 짐작했습니다` });
        if (d.info.supplement || d.ton <= 0) {
            if (d.info.supplement) {
                const base = bases.filter(b => related(b, d)).reduce((a, b) => a + b.ton, 0);
                findings.push({ level: 'info', kind: '추가분', text: base > 0 ? `같은 구역·부재 본도면 ${base.toFixed(1)} t 대비 ${((d.ton / base) * 100).toFixed(1)}%` : '같은 구역·부재의 본도면이 없습니다' });
            }
            return result;
        }

        const peer = profileFor(d);
        if (peer) {
            result.peer = peer;
            const share = diaShare(d);
            result.mixDiff = peer.distance;
            if (peer.distance > MIX_WARN) {
                const dias = new Set([...share.keys(), ...peer.share.keys()]);
                const top = Array.from(dias)
                    .map(k => ({ k, delta: (share.get(k) ?? 0) - (peer.share.get(k) ?? 0) }))
                    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))
                    .slice(0, 2)
                    .map(x => `${x.k} ${(x.delta > 0 ? '+' : '')}${(x.delta * 100).toFixed(0)}%p`).join(', ');
                findings.push({ level: 'warn', kind: '직경 구성', text: `같은 종류(${peer.label}) 본도면 ${peer.count}장 중 직경 구성이 비슷한 도면이 1장 이하 (두 번째로 비슷한 도면과 ${(peer.distance * 100).toFixed(0)}% 차이). 가장 비슷한 '${peer.nearest}' 대비 ${top}` });
            }
        }

        if (d.ea > 0) result.couplerPerTon = d.ea / d.ton;
        if (peer?.couplerPerTon && result.couplerPerTon) {
            const r = result.couplerPerTon / peer.couplerPerTon;
            if (r > 2 || r < 0.5) findings.push({ level: 'warn', kind: '커플러', text: `톤당 커플러 ${result.couplerPerTon.toFixed(0)}개, 같은 종류 도면 중앙값 ${peer.couplerPerTon.toFixed(0)}개의 ${r.toFixed(1)}배` });
        }

        const mainBase = (x: DrawingStat) => bases.filter(b => related(b, x)).sort((p, q) => q.ton - p.ton)[0];
        const supps = supplements.filter(x => mainBase(x) === d);
        const supp = supps.reduce((a, x) => a + x.ton, 0);
        const base = bases.filter(b => related(b, d)).reduce((a, b) => a + b.ton, 0) || d.ton;
        if (supp > 0 && supp / base > SUPPLEMENT_WARN) {
            findings.push({ level: 'warn', kind: '추가분', text: `같은 구역·부재 추가·누락분 ${supps.length}건 ${supp.toFixed(1)} t (본도면 ${base.toFixed(1)} t의 ${((supp / base) * 100).toFixed(0)}%)` });
        }
        return result;
    });
}
