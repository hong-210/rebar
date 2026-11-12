import * as XLSX from 'xlsx';
import { BuildingConfig, ConcreteEntry, MemberClass } from '../types';
import { classifyMember, getFloorAbove, isFloorInBuilding, isFoundationMember, lowestFloorOf, modelFloorName } from './floorBasis';
import { parseCsv } from './rebarCsv';
import { newId } from './id';

// 빌더허브 콘크리트 물량 `*_conc.csv`나 산출서 엑셀의 conc 시트를 부재(객체ID)별 실행 체적으로 묶는다.
// 한 행 = 한 부재의 체적 일부(m³). 산출식에 따라 한 부재가 여러 행이고, 공제(욕실 등)는 음수 값이다.

export interface ConcQtyItem {
    strength: string; // Conc_강도 (예: '30'), 없으면 재질명
    volume: number;   // m³ (공제가 있으면 음수일 수 있다)
}

export interface ModelConcMember {
    msId: number;
    floorNo: number;
    floorName: string;
    memberClass?: MemberClass;
    kind: string;  // 부재구분 (슬래브, 보, 벽, 기둥 ...) 또는 부재
    name: string;  // 부재명
    items: ConcQtyItem[];
}

export interface ConcCsvResult {
    members: ModelConcMember[];
    buildingName: string;
    floors: { no: number; name: string }[];
}

const REQUIRED_COLUMNS = ['객체ID', '층번호', '값'];
const STRENGTH_COLUMNS = ['Conc_강도', '재질명'];

class ConcRowCollector {
    private col: Record<string, number> | null = null;
    private members = new Map<number, ModelConcMember>();
    private floors = new Map<number, string>();
    private buildingNames = new Map<string, number>();

    constructor(private sourceLabel: string) {}

    addRow(cells: unknown[]) {
        if (!this.col) {
            this.col = Object.fromEntries(cells.map((name, i) => [String(name ?? '').trim(), i]));
            const missing = REQUIRED_COLUMNS.filter(k => this.col![k] === undefined);
            if (!STRENGTH_COLUMNS.some(k => this.col![k] !== undefined)) missing.push('Conc_강도');
            if (missing.length) throw new Error(`빌더허브 콘크리트 물량 ${this.sourceLabel}이(가) 아닙니다 (없는 칸: ${missing.join(', ')})`);
            return;
        }
        const col = this.col;
        const get = (k: string) => (col[k] === undefined ? '' : String(cells[col[k]] ?? '').trim());
        const floorNo = parseInt(get('층번호'));
        if (!isNaN(floorNo) && !this.floors.has(floorNo)) this.floors.set(floorNo, get('층이름'));
        const bName = get('건물명');
        if (bName) this.buildingNames.set(bName, (this.buildingNames.get(bName) ?? 0) + 1);

        const msId = parseInt(get('객체ID'));
        const value = parseFloat(get('값'));
        if (isNaN(msId) || isNaN(floorNo) || !value) return;

        let m = this.members.get(msId);
        if (!m) {
            // 위치분류(CSV) → 시공존 'Default CZone(H)/(V)'(엑셀) → 부재 이름 순으로 수평/수직을 가린다
            const cls = get('위치분류');
            const czone = get('시공존').match(/\((H|V)\)\s*$/i)?.[1]?.toUpperCase();
            const kind = get('부재구분') || get('부재');
            m = {
                msId,
                floorNo,
                floorName: get('층이름'),
                memberClass: cls === '수평' ? 'H' : cls === '수직' ? 'V' : czone === 'H' || czone === 'V' ? czone : classifyMember(`${kind} ${get('부재명')}`),
                kind,
                name: get('부재명'),
                items: []
            };
            this.members.set(msId, m);
        }
        const strength = get('Conc_강도') || get('재질명') || '-';
        let item = m.items.find(it => it.strength === strength);
        if (!item) { item = { strength, volume: 0 }; m.items.push(item); }
        item.volume += value;
    }

    result(): ConcCsvResult {
        if (!this.col) throw new Error(`${this.sourceLabel}이(가) 비어 있습니다.`);
        const buildingName = Array.from(this.buildingNames.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
        return {
            members: Array.from(this.members.values()),
            buildingName,
            floors: Array.from(this.floors.entries()).map(([no, name]) => ({ no, name }))
        };
    }
}

export function parseConcCsv(text: string): ConcCsvResult {
    const collector = new ConcRowCollector('CSV');
    parseCsv(text.replace(/^﻿/, ''), cells => collector.addRow(cells));
    return collector.result();
}

// 산출서 엑셀의 'conc' 시트 (없으면 undefined: 철근 시트만 있는 엑셀도 받는다)
export function parseConcXlsx(data: ArrayBuffer): ConcCsvResult | undefined {
    const names = XLSX.read(data, { type: 'array', bookSheets: true }).SheetNames;
    const name = names.find(n => n.trim().toLowerCase() === 'conc') ?? names.find(n => /콘크리트|conc/i.test(n));
    if (!name) return undefined;
    const ws = XLSX.read(data, { type: 'array', sheets: name, dense: true }).Sheets[name];
    if (!ws) return undefined;
    const collector = new ConcRowCollector('엑셀 conc 시트');
    for (const row of XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' })) collector.addRow(row);
    return collector.result();
}

// 콘크리트 관리 화면의 부재 이름(피트, 기초, 슬래브, 기둥, 보, 벽, 계단)으로 맞춘다
export const normalizeConcreteType = (raw: string): string => {
    if (!raw) return '';
    const lower = raw.trim().toLowerCase();
    if (lower.includes('계단') || lower.includes('stair') || lower.includes('step')) return '계단';
    if (lower.includes('피트') || lower.includes('pit')) return '피트';
    if (lower.includes('슬래브') || lower.includes('slab') || lower.includes('slb') || lower.includes('바닥') || lower.includes('매트')) return '슬래브';
    if (lower.includes('기초') || lower.includes('foundation') || lower.includes('footing')) return '기초';
    if (lower.includes('기둥') || lower.includes('column') || lower.includes('col') || lower.includes('piloti')) return '기둥';
    if (lower.includes('girder') || lower.includes('beam') || lower.endsWith('보') || lower.startsWith('보 ') || lower === '보') return '보';
    if (lower.includes('벽') || lower.includes('wall') || lower.includes('parapet') || lower.includes('난간') || lower.includes('옹벽')) return '벽';
    return '';
};

export const memberVolume = (m: ModelConcMember) => m.items.reduce((a, it) => a + it.volume, 0);

export interface ModelConcreteImport {
    entries: ConcreteEntry[];
    volume: number;        // 반영되는 체적
    shiftedVolume: number; // 한 층 위로 옮긴 수평재 체적
    skipped: { reason: string; volume: number }[];
}

// 모델의 부재별 체적을 콘크리트 실행 물량으로 만든다. 층 규칙은 철근과 같다:
// 수평재(슬래브·보)는 한 층 위(SHOP·시공 기준)로, 최하층·기초는 그대로. Zone은 부재구분, Type은 표준 부재 이름.
export function buildConcreteEntries(members: ModelConcMember[], building: BuildingConfig, projectId: string): ModelConcreteImport {
    const lowest = lowestFloorOf(building);
    const byKey = new Map<string, ConcreteEntry>();
    const skipped = new Map<string, number>();
    const skip = (reason: string, v: number) => skipped.set(reason, (skipped.get(reason) ?? 0) + v);
    let shiftedVolume = 0;

    for (const m of members) {
        let floor = modelFloorName(m.floorNo);
        const shifted = m.memberClass === 'H' && !isFoundationMember(`${m.kind} ${m.name}`) && floor !== lowest;
        if (shifted) floor = getFloorAbove(floor);
        if (!isFloorInBuilding(building, floor)) {
            skip(`${m.floorName || modelFloorName(m.floorNo)}${shifted ? ` 수평재(→${floor})` : ''}: 기준 설정 층 범위 밖`, memberVolume(m));
            continue;
        }
        const zone = m.kind || '모델';
        const type = normalizeConcreteType(m.kind) || normalizeConcreteType(m.name);
        for (const it of m.items) {
            const key = [floor, zone, it.strength, type].join('|');
            let e = byKey.get(key);
            if (!e) {
                e = {
                    id: newId(), projectId, dong: building.name, floor, zone, strength: it.strength, type,
                    dataSource: 'Design', plannedVolume: 0, constructionVolume: 0,
                    lastUpdated: new Date().toLocaleDateString()
                };
                byKey.set(key, e);
            }
            e.plannedVolume += it.volume;
            if (shifted) shiftedVolume += it.volume;
        }
    }

    // 공제만 모인 묶음(예: 무근 욕실 공제)은 음수라 실행 물량으로 넣지 않고 알려 준다
    const entries: ConcreteEntry[] = [];
    for (const e of byKey.values()) {
        e.plannedVolume = Math.round(e.plannedVolume * 1000) / 1000;
        if (e.plannedVolume > 0) entries.push(e);
        else if (e.plannedVolume < 0) skip(`${e.zone} 강도 ${e.strength} 공제(음수 체적, 욕실 공제 등)`, e.plannedVolume);
    }
    const volume = entries.reduce((a, e) => a + e.plannedVolume, 0);
    return {
        entries, volume, shiftedVolume,
        skipped: Array.from(skipped.entries()).map(([reason, v]) => ({ reason, volume: v }))
    };
}
