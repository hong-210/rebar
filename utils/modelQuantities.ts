import { BuildingConfig, MaterialEntry } from '../types';
import type { ModelMember } from './rebarCsv';
import { getFloorAbove, lowestFloorOf, isFoundationMember, isFloorInBuilding, modelFloorName } from './floorBasis';
import { normalizeRebarSpec } from './rebarSpec';
import { newId } from './id';

export interface ModelDesignImport {
    entries: MaterialEntry[];
    ton: number;        // 반영되는 철근
    ea: number;         // 반영되는 커플러
    shiftedTon: number; // 한 층 위로 옮긴 수평재 철근
    skipped: { reason: string; ton: number; ea: number }[]; // 기준 설정 밖 층, 인식 못 한 직경
}

// 모델의 부재별 실행 물량을 엑셀 업로드와 같은 규칙으로 실행 물량 항목으로 만든다.
// 수평재는 한 층 위(SHOP 기준)로, 최하층·기초는 그대로. Zone은 부재구분(보, 슬래브, 벽 ...)으로 둔다.
export function buildDesignEntries(members: ModelMember[], building: BuildingConfig, projectId: string): ModelDesignImport {
    const lowest = lowestFloorOf(building);
    const byKey = new Map<string, MaterialEntry>();
    const skipped = new Map<string, { ton: number; ea: number }>();
    let ton = 0, ea = 0, shiftedTon = 0;
    const skip = (reason: string, t: number, e: number) => {
        const s = skipped.get(reason) ?? { ton: 0, ea: 0 };
        s.ton += t; s.ea += e;
        skipped.set(reason, s);
    };

    for (const m of members) {
        let floor = modelFloorName(m.floorNo);
        const shifted = m.memberClass === 'H' && !isFoundationMember(`${m.kind} ${m.name}`) && floor !== lowest;
        if (shifted) floor = getFloorAbove(floor);
        const zone = m.kind || '모델';

        for (const it of m.items) {
            if (!isFloorInBuilding(building, floor)) {
                skip(`${m.floorName || modelFloorName(m.floorNo)}${shifted ? ` 수평재(→${floor})` : ''}: 기준 설정 층 범위 밖`, it.ton, it.ea);
                continue;
            }
            const { diameter, strength } = normalizeRebarSpec(it.dia, it.strength);
            if (!diameter) {
                skip(`직경 '${it.dia}': 인식할 수 없는 직경`, it.ton, it.ea);
                continue;
            }
            for (const isCoupler of [false, true]) {
                const amount = isCoupler ? it.ea : it.ton;
                if (!(amount > 0)) continue;
                const key = [floor, zone, diameter, strength, isCoupler ? 'C' : 'R', m.memberClass ?? ''].join('|');
                let e = byKey.get(key);
                if (!e) {
                    e = {
                        id: newId(), projectId, dong: building.name, floor, zone, diameter, strength, lengthMm: 0,
                        dataSource: 'Design',
                        ...(isCoupler ? { itemType: 'Coupler' as const } : {}),
                        ...(m.memberClass ? { memberClass: m.memberClass } : {}),
                        plannedVersions: {}, plannedQuantity: 0, plannedWeight: 0, shopQuantity: 0, shopWeight: 0,
                        lastUpdated: new Date().toLocaleDateString()
                    };
                    byKey.set(key, e);
                }
                if (isCoupler) { e.plannedQuantity += amount; ea += amount; }
                else {
                    e.plannedWeight += amount * 1000; // ton → kg
                    ton += amount;
                    if (shifted) shiftedTon += amount;
                }
            }
        }
    }

    const entries = Array.from(byKey.values());
    entries.forEach(e => { e.plannedWeight = Math.round(e.plannedWeight * 100) / 100; });
    return {
        entries, ton, ea, shiftedTon,
        skipped: Array.from(skipped.entries()).map(([reason, v]) => ({ reason, ...v }))
    };
}
