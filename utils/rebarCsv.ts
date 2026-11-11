import * as XLSX from 'xlsx';
import { MemberClass } from '../types';
import { classifyMember } from './floorBasis';

// 빌더허브 물량 내보내기 `*_rebar.csv`나 산출서 엑셀의 rebar 시트를 부재(객체ID)별 실행 물량으로 묶는다.
// 한 행 = 한 부재의 철근 1종. '구성'이 철근이면 '값'은 ton, 커플러면 개수다.

export interface MemberQtyItem {
    dia: string;      // 철근직경 (예: '22')
    strength: string; // 철근강종 (예: 'SD600')
    ton: number;      // 철근 중량
    ea: number;       // 커플러 개수
}

export interface ModelMember {
    msId: number;
    floorNo: number;            // 빌더허브 층 번호 (-1 = B1F)
    floorName: string;          // 빌더허브 층 이름 (B1F, RF, PHF ...)
    memberClass?: MemberClass;  // 위치분류 수평/수직
    kind: string;               // 부재구분 (보, 슬래브, 벽, 기둥, 계단 ...)
    name: string;               // 부재명 (예: 2~18_G5)
    items: MemberQtyItem[];
}

// CSV 한 파일의 결과: 부재별 물량 + 동 이름과 층 목록 (프로젝트 동 설정에 쓴다)
export interface RebarCsvResult {
    members: ModelMember[];
    buildingName: string;
    floors: { no: number; name: string }[];
}

// 따옴표 안의 쉼표·줄바꿈을 처리하는 CSV 파서
function parseCsv(text: string, onRow: (cells: string[]) => void) {
    let cells: string[] = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        if (quoted) {
            if (ch === 34) {
                if (text.charCodeAt(i + 1) === 34) { cell += '"'; i++; }
                else quoted = false;
            } else {
                cell += text[i];
            }
        } else if (ch === 34) {
            quoted = true;
        } else if (ch === 44) {
            cells.push(cell); cell = '';
        } else if (ch === 10 || ch === 13) {
            if (ch === 13 && text.charCodeAt(i + 1) === 10) i++;
            cells.push(cell); cell = '';
            onRow(cells);
            cells = [];
        } else {
            cell += text[i];
        }
    }
    if (cell || cells.length) { cells.push(cell); onRow(cells); }
}

// 빌더허브 철근 물량 행(CSV 또는 산출서 엑셀 rebar 시트)을 부재별로 묶는다.
// 엑셀 산출서에는 위치분류·부재구분 칸이 없어서 '부재' 글자(보, 일반슬래브, 내력벽 ...)로 수평/수직을 가린다.
class RebarRowCollector {
    private col: Record<string, number> | null = null;
    private members = new Map<number, ModelMember>();
    private floors = new Map<number, string>();
    private buildingNames = new Map<string, number>();

    constructor(private sourceLabel: string) {}

    addRow(cells: unknown[]) {
        if (!this.col) {
            this.col = Object.fromEntries(cells.map((name, i) => [String(name ?? '').trim(), i]));
            const missing = REQUIRED_COLUMNS.filter(k => this.col![k] === undefined);
            if (missing.length) throw new Error(`빌더허브 철근 물량 ${this.sourceLabel}이(가) 아닙니다 (없는 칸: ${missing.join(', ')})`);
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
        if (isNaN(msId) || !(value > 0)) return;

        let m = this.members.get(msId);
        if (!m) {
            const cls = get('위치분류');
            const kind = get('부재구분') || get('부재');
            m = {
                msId,
                floorNo,
                floorName: get('층이름'),
                memberClass: cls === '수평' ? 'H' : cls === '수직' ? 'V' : classifyMember(`${kind} ${get('부재명')}`),
                kind,
                name: get('부재명'),
                items: []
            };
            this.members.set(msId, m);
        }
        const dia = get('철근직경');
        const strength = get('철근강종');
        let item = m.items.find(it => it.dia === dia && it.strength === strength);
        if (!item) { item = { dia, strength, ton: 0, ea: 0 }; m.items.push(item); }
        if (/커플러|coupler/i.test(get('구성'))) item.ea += value;
        else item.ton += value;
    }

    result(): RebarCsvResult {
        if (!this.col) throw new Error(`${this.sourceLabel}이(가) 비어 있습니다.`);
        const buildingName = Array.from(this.buildingNames.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
        return {
            members: Array.from(this.members.values()),
            buildingName,
            floors: Array.from(this.floors.entries()).map(([no, name]) => ({ no, name }))
        };
    }
}

const REQUIRED_COLUMNS = ['객체ID', '층번호', '구성', '값', '철근직경', '철근강종'];

export function parseRebarCsv(text: string): RebarCsvResult {
    const collector = new RebarRowCollector('CSV');
    parseCsv(text.replace(/^﻿/, ''), cells => collector.addRow(cells));
    return collector.result();
}

// 빌더허브 산출서 엑셀: 'rebar' 시트(없으면 철근 물량 칸이 있는 첫 시트)를 읽는다
export function parseRebarXlsx(data: ArrayBuffer): RebarCsvResult {
    const names = XLSX.read(data, { type: 'array', bookSheets: true }).SheetNames;
    const hasColumns = (ws: XLSX.WorkSheet) => {
        const header = (XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, range: 0 })[0] ?? []).map(v => String(v ?? '').trim());
        return REQUIRED_COLUMNS.every(k => header.includes(k));
    };
    const preferred = names.find(n => n.trim().toLowerCase() === 'rebar') ?? names.find(n => /철근|rebar/i.test(n));
    let ws: XLSX.WorkSheet | undefined;
    for (const name of [preferred, ...names].filter((n): n is string => !!n)) {
        const candidate = XLSX.read(data, { type: 'array', sheets: name, dense: true }).Sheets[name];
        if (candidate && hasColumns(candidate)) { ws = candidate; break; }
    }
    if (!ws) throw new Error(`엑셀에서 철근 물량 시트를 찾지 못했습니다 (필요한 칸: ${REQUIRED_COLUMNS.join(', ')}). 빌더허브 산출서의 rebar 시트가 있는지 확인하세요.`);
    const collector = new RebarRowCollector('엑셀 rebar 시트');
    for (const row of XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' })) collector.addRow(row);
    return collector.result();
}
