import { MemberClass } from '../types';

// 빌더허브 물량 내보내기 `*_rebar.csv`를 부재(객체ID)별 실행 물량으로 묶는다.
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

export function parseRebarCsv(text: string): ModelMember[] {
    let col: Record<string, number> | null = null;
    const members = new Map<number, ModelMember>();
    const required = ['객체ID', '층번호', '구성', '값', '철근직경', '철근강종'];

    parseCsv(text.replace(/^﻿/, ''), cells => {
        if (!col) {
            col = Object.fromEntries(cells.map((name, i) => [name.trim(), i]));
            const missing = required.filter(k => col![k] === undefined);
            if (missing.length) throw new Error(`빌더허브 철근 물량 CSV가 아닙니다 (없는 칸: ${missing.join(', ')})`);
            return;
        }
        const get = (k: string) => (col![k] === undefined ? '' : (cells[col![k]] ?? '').trim());
        const msId = parseInt(get('객체ID'));
        const value = parseFloat(get('값'));
        if (isNaN(msId) || !(value > 0)) return;

        let m = members.get(msId);
        if (!m) {
            const cls = get('위치분류');
            m = {
                msId,
                floorNo: parseInt(get('층번호')),
                floorName: get('층이름'),
                memberClass: cls === '수평' ? 'H' : cls === '수직' ? 'V' : undefined,
                kind: get('부재구분') || get('부재'),
                name: get('부재명'),
                items: []
            };
            members.set(msId, m);
        }
        const dia = get('철근직경');
        const strength = get('철근강종');
        let item = m.items.find(it => it.dia === dia && it.strength === strength);
        if (!item) { item = { dia, strength, ton: 0, ea: 0 }; m.items.push(item); }
        if (/커플러|coupler/i.test(get('구성'))) item.ea += value;
        else item.ton += value;
    });

    if (!col) throw new Error('CSV가 비어 있습니다.');
    return Array.from(members.values());
}
