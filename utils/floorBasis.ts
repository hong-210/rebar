import { BuildingConfig, MemberClass } from '../types';

// 엑셀의 구분/부재/Zone 글자로 수평재·수직재를 가린다. 알 수 없으면 undefined.
export const classifyMember = (text: string): MemberClass | undefined => {
    if (/수직|vertical/i.test(text)) return 'V';
    if (/수평|horizontal|슬래브|slab|beam|girder|거더|기초|footing|매트|deck|데크|(?:^|[^가-힣])(?:큰|작은)?보(?![가-힣])/i.test(text)) return 'H';
    if (/벽|wall|기둥|column|계단|stair|난간|parapet/i.test(text)) return 'V';
    return undefined;
};
export const isFoundationMember = (text: string) => /기초|footing|매트|mat(?![a-z])/i.test(text);

// 실행(n형)은 바닥판을 아래층 천장으로, SHOP(u형)은 위층 바닥으로 본다.
// 실행 수평재를 한 층 위로 올려 SHOP 기준에 맞춘다 (B3 -> B2, B1 -> 1F, 4F -> 5F)
export const getFloorAbove = (floor: string): string => {
    const basement = floor.match(/^B(\d+)$/);
    if (basement) return Number(basement[1]) === 1 ? '1F' : `B${Number(basement[1]) - 1}`;
    const ground = floor.match(/^(\d+)F$/);
    if (ground) return `${Number(ground[1]) + 1}F`;
    return floor;
};

// 동의 최하층 (기초가 놓이는 층, SHOP의 PIT)
export const lowestFloorOf = (building: BuildingConfig): string =>
    building.basementFloors > 0 ? `B${building.basementFloors}` : '1F';

// 기준 설정의 층 범위(B{지하층수}~B1, 1F~{지상층수}F, 지붕 {지상층수+1}F) 안에 있는지
export const isFloorInBuilding = (building: BuildingConfig, floor: string) => {
    const basement = floor.match(/^B(\d+)$/);
    if (basement) return Number(basement[1]) >= 1 && Number(basement[1]) <= building.basementFloors;
    const ground = floor.match(/^(\d+)F$/);
    if (ground) return Number(ground[1]) >= 1 && Number(ground[1]) <= building.groundFloors + 1;
    return false; // PH, R 등 기준 설정에 없는 층
};

// 빌더허브 모델 층 번호 → 층 이름 (-1 -> B1, 1 -> 1F)
export const modelFloorName = (floorNo: number): string => (floorNo < 0 ? `B${-floorNo}` : `${floorNo}F`);

// 빌더허브 모델 부재 종류 (슬래브·보만 층을 옮기고, 기초는 수평재지만 최하층 그대로)
const HORIZONTAL_TYPES = new Set(['Slab', 'Beam']);
const isFoundationType = (type: string) => /foot|pit|mat/i.test(type);
export const modelBodyClass = (type: string): MemberClass =>
    HORIZONTAL_TYPES.has(type) || isFoundationType(type) ? 'H' : 'V';

// 모델 부재가 SHOP 기준으로 몇 층 물량에 해당하는지 (업로드할 때 실행 물량에 쓰는 규칙과 같다)
export const modelBodyCompareFloor = (type: string, floorNo: number, building: BuildingConfig): string => {
    const floor = modelFloorName(floorNo);
    if (HORIZONTAL_TYPES.has(type) && !isFoundationType(type) && floor !== lowestFloorOf(building)) {
        return getFloorAbove(floor);
    }
    return floor;
};

export const isHorizontalModelType = (type: string) => HORIZONTAL_TYPES.has(type);
