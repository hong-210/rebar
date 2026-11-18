import { BuildingConfig, MaterialEntry, Project } from '../types';
import { normalizeRebarSpec } from './rebarSpec';
import { getFloorAbove, lowestFloorOf, classifyMember, isFoundationMember, isFloorInBuilding, resolveNamedFloor, roofFloorsOf } from './floorBasis';
import { normalizeDate } from './googleSheet';

// 엑셀·구글 시트의 물량 행을 프로젝트 기준(동·층·직경·강종·수평/수직)에 맞춰 물량 항목으로 묶는다.
// 화면(철근 물량 관리)과 백그라운드 시트 동기화가 같이 쓴다. 반영(저장)은 하지 않는다.

export interface PendingUpload {
    entries: MaterialEntry[];
    dataSource: 'Design' | 'Shop';
    dongs: string[];
    dongRowCounts: Record<string, number>;
    affectedFloors: string[];
    processedCount: number;
    couplerRowCount: number;
    shiftedRowCount: number; // 실행 수평재 중 한 층 위로 옮긴 행 수
    classCounts: { H: number; V: number; none: number }; // 수평/수직/구분 없음 행 수
    existingCount: number; // 파일에 든 동들의 같은 구분 기존 물량 건수
    source: string;        // 출처 키 (파일 이름 또는 구글 시트 탭)
    sourceCounts: { key: string; count: number }[]; // 같은 구분 기존 물량의 출처별 건수 (같은 출처 먼저)
    untaggedCount: number; // 파일에 든 동들의 출처 기록 없는 기존 물량 (예전 업로드)
    dateRowCount: number;  // 날짜가 적힌 행
    rerouted: Record<string, number>; // '201동 → 2단지 지하주차장': 지하주차장으로 보낸 지하층 행 수
    rejected: { reason: string; count: number }[]; // 너그럽게 읽을 때(구글 시트) 건너뛴 행
}

export interface BuildResult { upload?: PendingUpload; error?: string; empty?: boolean }

export interface ImportContext {
    project: Project;
    materials: MaterialEntry[];
    dataSource: 'Design' | 'Shop';
    defaultDong?: string; // 동 칸이 없을 때 쓸 동 (화면에서 고른 동)
}

// 엑셀의 동 이름을 프로젝트 기준 설정의 동과 맞춘다 ('101' / '101 동' -> '101동')
function findBuilding(project: Project, rawDong: string): BuildingConfig | undefined {
    const normalize = (s: string) => s.replace(/\s/g, '').replace(/동$/, '').toUpperCase();
    return project.buildings.find(b => b.name === rawDong)
        ?? project.buildings.find(b => normalize(b.name) === normalize(rawDong));
}

// 지하층 SHOP을 보낼 지하주차장 동: 이름에 '지하'/'주차장'이 든 동. 여럿이면 동 번호 첫 자리와 같은 'N단지'
export function undergroundTarget(project: Project, b: BuildingConfig): BuildingConfig | undefined {
    const garages = project.buildings.filter(x => x !== b && /지하|주차장/.test(x.name));
    if (/지하|주차장/.test(b.name) || garages.length === 0) return undefined;
    if (garages.length === 1) return garages[0];
    const digit = b.name.match(/(\d)\d{2}\s*동/)?.[1];
    const same = digit ? garages.filter(g => g.name.includes(`${digit}단지`)) : [];
    return same.length === 1 ? same[0] : undefined;
}

// lenient: 기준 설정과 안 맞는 행이 있어도 맞는 행은 반영하고 건너뛴 행을 알려 준다 (계속 쌓이는 구글 시트용)
export function buildMaterialUpload(data: any[], source: string, ctx: ImportContext, opts: { lenient?: boolean } = {}): BuildResult {
    const project = ctx.project;
    let processedCount = 0;
    let dateRowCount = 0;
    const rerouted: Record<string, number> = {};
    // 동별로 실행 물량이 있는 층 (실행이 없는 지하층의 SHOP은 지하주차장 동으로 보낸다)
    const designFloors = new Map<string, Set<string>>();
    ctx.materials.forEach(m => {
        if (m.projectId !== project.id || (m.dataSource ?? 'Design') !== 'Design' || !(m.plannedWeight > 0 || m.plannedQuantity > 0)) return;
        const set = designFloors.get(m.dong) ?? new Set<string>();
        set.add(m.floor);
        designFloors.set(m.dong, set);
    });
    const affectedFloors = new Set<string>();

    // 실행 / SHOP은 화면(탭) 또는 시트 연결에서 정한 구분을 엄격히 따른다
    const isDesignMode = ctx.dataSource === 'Design';
    const dataSource = ctx.dataSource;

    // 같은 동·층·Zone·직경·강종(·구성·구분·날짜)은 한 항목으로 합친다
    const aggregationMap = new Map<string, MaterialEntry>();

    const config = isDesignMode ? {
        // 실행 물량: [층번호, 시공존, 값, 철근강종, 철근직경]
        floor: ['층번호', '층', 'Floor'],
        zone: ['시공존', '부위', '부위명', 'Zone'],
        weight: ['값', '실행물량', '설계물량', '설계중량', '내역중량', '총중량', '중량', 'Weight', '실행중량(ton)'], // '값' 우선
        dia: ['철근직경', '직경', 'Dia', '규격'],
        strength: ['철근강종', '강종', 'Grade'],
        dong: ['동', 'Dong'],
        standard: ['위치분류', '구분', '부재구분', '부재', '부재명', 'MemberType'],
        component: ['구성'],
        date: ['날짜', '일자', '작성일', '입고일', 'Date']
    } : {
        // SHOP 물량: [동, 층, 도면명, 직경, 강종, 샵중량, 구분]
        floor: ['층', '층번호', 'Floor'],
        zone: ['도면명', '샵도면명', 'DrawingName', 'Mark', 'Zone', '부위'],
        weight: ['샵중량', '샵중량(ton)', '샵중량(kg)', '중량', 'Weight', 'ShopWeight'], // '샵중량' 우선
        dia: ['직경', '철근직경', 'Dia', '규격'],
        strength: ['강종', '철근강종', 'Grade'],
        dong: ['동', 'Building', 'Dong'],
        standard: ['구분', '기준', 'Classification', 'MemberType', 'Type'],
        component: ['구성'],
        date: ['날짜', '일자', '작성일', '입고일', '반입일', 'Date']
    };

    const targetDongCounts: Record<string, number> = {};
    let couplerRowCount = 0;
    let shiftedRowCount = 0;
    const classCounts = { H: 0, V: 0, none: 0 };

    // 기준 설정과 맞지 않는 행 (사유 -> 행 수). 엑셀은 하나라도 있으면 업로드 전체를 막고, 시트(lenient)는 그 행만 건너뛴다
    const rejected = new Map<string, number>();
    const rejectRow = (reason: string) => rejected.set(reason, (rejected.get(reason) ?? 0) + 1);

    data.forEach((row: any) => {
        const getValue = (keywords: string[]) => {
            if (keywords.length === 0) return null;
            const rowKeys = Object.keys(row);
            // 1. 정확히 같은 머리글 (대소문자·앞뒤 공백 무시)
            for (const keyword of keywords) {
                const match = rowKeys.find(k => k.trim().toLowerCase() === keyword.toLowerCase());
                if (match && row[match] !== undefined) return row[match];
            }
            // 2. 공백·괄호를 뺀 부분 일치
            for (const keyword of keywords) {
                const cleanKeyword = keyword.toLowerCase().replace(/[\s()]/g, '');
                const match = rowKeys.find(k => k.toLowerCase().replace(/[\s()]/g, '').includes(cleanKeyword));
                if (match && row[match] !== undefined) return row[match];
            }
            return null;
        };

        // 동
        let dongStr = getValue(config.dong);
        if (!dongStr && ctx.defaultDong) dongStr = ctx.defaultDong;

        // 층 (-1 -> B1, 1 -> 1F)
        const floorRaw = getValue(config.floor);
        let floor = '';

        if (floorRaw !== null) {
            const fStr = String(floorRaw).trim().toUpperCase();
            const numVal = parseInt(fStr);

            // PIT·RF·PHF처럼 이름으로 적힌 층은 동을 찾은 뒤 기준 설정의 지붕층 이름으로 바꾼다
            if (!isNaN(numVal) && String(numVal) === fStr) {
                if (numVal < 0) floor = `B${Math.abs(numVal)}`;
                else if (numVal > 0) floor = `${numVal}F`;
                else floor = '1F'; // 0 -> 1F
            } else {
                // "지하1층" => "B1"
                const numbers = fStr.replace(/[^0-9]/g, '');
                if (numbers) {
                    if (fStr.includes('B') || fStr.includes('-') || fStr.includes('지하') || fStr.includes('BASE')) {
                        floor = `B${numbers}`;
                    } else {
                        floor = `${numbers}F`;
                    }
                }
            }
        }

        // Zone (SHOP은 도면명)
        const zoneRaw = getValue(config.zone);
        const zone = zoneRaw || 'General';

        // '구성' 칸에 커플러라고 적힌 행은 철근이 아니라 커플러이고, 값은 개수(EA)다
        // SHOP 업체가 커플러를 '구분' 칸에 적는 경우도 함께 본다
        const isCouplerRow = /커플러|coupler/i.test(`${getValue(config.component) ?? ''} ${getValue(config.standard) ?? ''}`);
        const itemType = isCouplerRow ? 'Coupler' : 'Rebar';

        // 'D22S'처럼 직경에 붙은 내진 표시 S는 강종으로 옮긴다 (SHOP D22S + SD600 -> D22 / SD600S, 실행과 같은 기준)
        const { diameter: diaEnum, strength: cleanStrength } =
            normalizeRebarSpec(getValue(config.dia), getValue(config.strength));

        // 중량 ("1,200" 같은 쉼표 처리)
        const rawWeight = getValue(config.weight);
        let valueWeight = 0;
        if (rawWeight !== null) {
            const weightStr = String(rawWeight).replace(/,/g, '').trim();
            valueWeight = parseFloat(weightStr);
            if (isNaN(valueWeight)) valueWeight = 0;
        }

        // 직경이나 중량이 없는 행(빈 행, 합계 행 등)은 물량이 아니므로 건너뛴다
        if (!diaEnum || !(valueWeight > 0)) return;

        // 동/층이 프로젝트 기준 설정과 맞는지 확인한다
        const rawDong = String(dongStr ?? '').trim();
        let building = findBuilding(project, rawDong);
        if (!building) {
            rejectRow(`동 '${rawDong || '(빈칸)'}': 기준 설정에 없는 동`);
            return;
        }
        // SHOP의 지하층(B*·PIT·기초) 행인데 그 동에 그 층 실행 물량이 없으면, 실행이 들어 있는 지하주차장 동으로 보낸다
        // (예: '201동' 탭에 지하 기초·B3F 벽체가 섞여 있어도 지하주차장 실행과 비교되게)
        if (dataSource === 'Shop') {
            const rawFloorText = String(floorRaw ?? '').trim().toUpperCase();
            const underground = /^B\d|^-\d|지하|PIT|기초|^FT$/.test(rawFloorText) || (!!floor && floor.startsWith('B'));
            const target = underground ? undergroundTarget(project, building) : undefined;
            if (target) {
                const ownFloor = resolveNamedFloor(building, rawFloorText) ?? floor;
                const hasDesign = !!ownFloor && designFloors.get(building.name)?.has(ownFloor) && isFloorInBuilding(building, ownFloor);
                if (!hasDesign) {
                    const k = `${building.name} → ${target.name}`;
                    rerouted[k] = (rerouted[k] ?? 0) + 1;
                    building = target;
                }
            }
        }
        const namedFloor = resolveNamedFloor(building, String(floorRaw ?? ''));
        if (!floor && !namedFloor) {
            rejectRow(`${building.name} 층 '${floorRaw ?? '(빈칸)'}': 인식할 수 없는 층 표기 (지붕층 이름: ${roofFloorsOf(building).join(', ')})`);
            return;
        }

        const cleanDong = building.name;
        const cleanZone = String(zone);

        // PIT는 최하층(B{지하층수}), RF·PHF 등은 기준 설정의 지붕층 순서대로 지상층수 + 1층부터
        let cleanFloor = namedFloor ?? String(floor);
        const lowestFloor = lowestFloorOf(building);

        // 수평재(슬래브·보·기초) / 수직재(벽체·기둥·계단) 구분은 3D 모델 색칠에도 쓴다
        const memberText = `${getValue(config.standard) ?? ''} ${zone}`;
        const memberClass = classifyMember(memberText);

        // SHOP 층은 그대로 두고, 실행 수평재만 한 층 위로 올린다 (최하층·기초는 그대로)
        if (dataSource === 'Design') {
            if (memberClass === 'H' && !isFoundationMember(memberText) && cleanFloor !== lowestFloor) {
                cleanFloor = getFloorAbove(cleanFloor);
                shiftedRowCount++;
            }
        }

        if (!isFloorInBuilding(building, cleanFloor)) {
            const shiftNote = cleanFloor !== floor ? ` (엑셀 ${floor} → ${cleanFloor})` : '';
            rejectRow(`${cleanDong} ${cleanFloor}${shiftNote}: 기준 설정 범위(지하 ${building.basementFloors}층 ~ 지상 ${building.groundFloors}층 + 지붕 ${roofFloorsOf(building).join(', ')}) 밖`);
            return;
        }

        // 톤 → kg (커플러는 개수 그대로)
        const weightKg = isCouplerRow ? 0 : valueWeight * 1000;
        const count = isCouplerRow ? valueWeight : 0;

        // '날짜' 칸이 있으면 날짜별로 따로 둔다 (같은 도면·직경이라도 반입일이 다르면 다른 행)
        const rowDate = normalizeDate(getValue(config.date));
        if (rowDate) dateRowCount++;
        const uniqueKey = `${cleanDong}|${cleanFloor}|${cleanZone}|${diaEnum}|${cleanStrength}|${itemType}|${memberClass ?? ''}|${rowDate ?? ''}`;

        if (aggregationMap.has(uniqueKey)) {
            const existingEntry = aggregationMap.get(uniqueKey)!;
            if (isCouplerRow) {
                if (dataSource === 'Design') existingEntry.plannedQuantity += count;
                else existingEntry.shopQuantity += count;
            } else if (dataSource === 'Design') {
                existingEntry.plannedWeight += weightKg;
            } else {
                existingEntry.shopWeight += weightKg;
            }
            // 소수 둘째 자리로 맞춰 부동소수 오차를 없앤다
            existingEntry.plannedWeight = Math.round(existingEntry.plannedWeight * 100) / 100;
            existingEntry.shopWeight = Math.round(existingEntry.shopWeight * 100) / 100;
        } else {
            let pWeight = 0; let sWeight = 0;
            if (dataSource === 'Design') pWeight = weightKg;
            else sWeight = weightKg;

            const newEntry: MaterialEntry = {
                id: Math.random().toString(36).substr(2, 9),
                projectId: project.id,
                dong: cleanDong,
                floor: cleanFloor,
                zone: cleanZone,
                diameter: diaEnum,
                strength: cleanStrength,
                lengthMm: 0,
                dataSource: dataSource,
                ...(isCouplerRow ? { itemType: 'Coupler' as const } : {}),
                ...(memberClass ? { memberClass } : {}),
                ...(rowDate ? { date: rowDate } : {}),
                sourceFile: source,
                plannedQuantity: dataSource === 'Design' ? count : 0,
                plannedWeight: Number(pWeight.toFixed(2)),
                shopQuantity: dataSource === 'Shop' ? count : 0,
                shopWeight: Number(sWeight.toFixed(2)),
                plannedVersions: {},
                lastUpdated: new Date().toLocaleDateString()
            };
            aggregationMap.set(uniqueKey, newEntry);
        }

        processedCount++;
        classCounts[memberClass ?? 'none']++;
        if (isCouplerRow) couplerRowCount++;
        if (cleanDong === ctx.defaultDong) affectedFloors.add(cleanFloor);

        if (!targetDongCounts[cleanDong]) targetDongCounts[cleanDong] = 0;
        targetDongCounts[cleanDong]++;
    });

    if (rejected.size > 0 && !opts.lenient) {
        const total = Array.from(rejected.values()).reduce((a, c) => a + c, 0);
        const lines = Array.from(rejected.entries()).map(([reason, count]) => `- ${reason} (${count}행)`);
        const shown = lines.slice(0, 15).join('\n') + (lines.length > 15 ? `\n... 외 ${lines.length - 15}종류` : '');
        return { error: `업로드를 중단했습니다. 이 파일의 물량은 하나도 반영되지 않았습니다.\n\n프로젝트 기준 설정과 맞지 않는 행이 ${total}행 있습니다.\n${shown}\n\n프로젝트 설정에서 동/층수를 맞추거나 엑셀을 수정한 뒤 다시 올려주세요.` };
    }

    const newEntries = Array.from(aggregationMap.values());

    if (newEntries.length > 0) {
        const upload: PendingUpload = {
            entries: newEntries,
            dataSource,
            dongs: Object.keys(targetDongCounts),
            dongRowCounts: targetDongCounts,
            affectedFloors: Array.from(affectedFloors),
            processedCount,
            couplerRowCount,
            shiftedRowCount,
            classCounts,
            existingCount: 0,
            source,
            sourceCounts: [],
            untaggedCount: 0,
            dateRowCount,
            rerouted,
            rejected: Array.from(rejected.entries()).map(([reason, count]) => ({ reason, count }))
        };
        const sameKind = ctx.materials.filter(m => m.projectId === project.id && (m.dataSource ?? 'Design') === dataSource);
        const inDongs = sameKind.filter(m => upload.dongs.includes(m.dong));
        upload.existingCount = inDongs.length;
        upload.untaggedCount = inDongs.filter(m => !m.sourceFile).length;
        const counts = new Map<string, number>();
        sameKind.forEach(m => { if (m.sourceFile) counts.set(m.sourceFile, (counts.get(m.sourceFile) ?? 0) + 1); });
        upload.sourceCounts = Array.from(counts.entries())
            .map(([key, count]) => ({ key, count }))
            .sort((a, b) => Number(b.key === source) - Number(a.key === source) || b.count - a.count);
        return { upload };
    }

    const requiredKeys = `필수 컬럼: ${config.zone[0]}, ${config.weight[0]}, ${config.floor[0]}, ${config.dia[0]}`;
    return {
        empty: data.length === 0,
        error: `데이터 처리 실패: 유효한 데이터를 찾지 못했습니다.\n\n[현재 모드: ${dataSource}]\n엑셀 파일을 확인해주세요.\n\n${requiredKeys}\n\n*중량 값은 0보다 커야 하며, 공란일 경우 제외됩니다.`
    };
}
