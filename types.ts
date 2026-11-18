
export enum RebarDiameter {
    D10 = 'D10',
    D13 = 'D13',
    D16 = 'D16',
    D19 = 'D19',
    D22 = 'D22',
    D25 = 'D25',
    D29 = 'D29',
    D32 = 'D32'
}

// Standard unit weights (kg/m) for rebar
export const UNIT_WEIGHTS: Record<RebarDiameter, number> = {
    [RebarDiameter.D10]: 0.56,
    [RebarDiameter.D13]: 0.995,
    [RebarDiameter.D16]: 1.56,
    [RebarDiameter.D19]: 2.25,
    [RebarDiameter.D22]: 3.04,
    [RebarDiameter.D25]: 3.98,
    [RebarDiameter.D29]: 5.04,
    [RebarDiameter.D32]: 6.23
};

export interface User {
    id?: string; // Supabase auth user id
    email: string; // Used as ID
    name: string;
    role: 'admin' | 'viewer'; // System level role
}

export type ProjectRole = 'Admin' | 'Participant' | 'Guest';

export interface ProjectMember {
    uid?: string; // Supabase auth user id
    userId: string; // User email
    userName: string;
    role: ProjectRole;
    joinedAt: string;
}

export interface BuildingConfig {
    name: string;
    groundFloors: number;
    basementFloors: number;
    // 지상층 위의 지붕층 이름 (지상층수+1층부터 차례로, 예: ['RF', 'PHF', 'PHRF']). 없으면 ['RF']
    roofFloors?: string[];
    modelFile?: string; // 층 정보를 가져온 모델 파일
}

export interface ProjectVersion {
    name: string;
    date: string;
    description?: string;
    dong: string; // The building this version belongs to
}

export interface Project {
    id: string;
    name: string;
    location: string;
    buildings: BuildingConfig[];
    startDate: string;
    endDate: string; 
    status: 'Planning' | 'Active' | 'Completed';
    inviteCode: string; // Unique code for sharing/joining
    isDeleted?: boolean; // Soft delete flag
    
    // Member Management
    members: ProjectMember[];

    // Version Control
    versions: ProjectVersion[];
    // Map of Building Name -> Active Version Name
    // e.g., { '101동': 'Rev.2', '102동': 'Rev.0' }
    activeVersion: Record<string, string>; 
}

// 엑셀 일괄 업로드 결과 (같은 물량은 누적하지 않고 덮어쓴다. 교체 업로드는 기존 물량을 비우고 새로 채운다)
export type MemberClass = 'H' | 'V';

// 엑셀 업로드 방식: 교체(동 전체 비우고 새로) / 덮어쓰기(같은 항목은 새 값으로) / 추가(같은 항목은 기존 값에 더함)
// sync: 같은 출처(파일·구글 시트 탭)에서 온 물량만 새 내용으로 맞춘다 (누적 파일을 통째로 다시 올릴 때)
export type UploadMode = 'replace' | 'overwrite' | 'add' | 'sync';

export interface SyncOptions {
    replaceSources?: string[];   // 함께 지울 이전 출처 (파일 이름이 바뀐 갱신본)
    clearUntaggedDongs?: string[]; // 출처 기록이 없는 예전 업로드 물량도 이 동들에서 지운다
    clearOtherDongs?: string[];    // 이 동들의 엑셀(file:)·출처 없는 물량도 지운다 (구글 시트를 원본으로 처음 연결할 때)
    projectId?: string;            // 반영할 물량이 없을 때(시트 탭을 비운 경우) 쓰는 프로젝트·구분
    dataSource?: 'Design' | 'Shop';
}

export interface BatchUploadResult {
    created: number;           // 새로 추가된 물량
    replaced: number;          // 기존 물량을 새 값으로 덮어쓴 건수
    merged: number;            // 추가 모드에서 기존 물량에 더한 건수
    duplicatesRemoved: number; // 이전 업로드로 중복 저장되어 있다가 정리된 행
    cleared: number;           // 교체·동기화 업로드로 먼저 지운 기존 물량
}

export interface MaterialEntry {
    id: string;
    projectId: string;
    dong: string;
    floor: string;
    zone: string;
    diameter: RebarDiameter;
    strength: string;
    lengthMm: number;
    
    dataSource?: 'Design' | 'Shop'; // 'Design' = Planned/Original, 'Shop' = Actual/Fabrication

    // 'Coupler'는 개수(EA)로 관리한다: 개수는 plannedQuantity/shopQuantity, 중량은 0.
    // 값이 없으면 철근(ton)이다.
    itemType?: 'Rebar' | 'Coupler';

    // 부재 구분: 'H' 수평(슬래브·보·기초) / 'V' 수직(벽체·기둥·계단 등). 엑셀에서 알 수 없으면 비어 있다.
    memberClass?: MemberClass;

    // 어느 파일·구글 시트 탭에서 올라왔는지 (동기화 업로드의 기준). 예: 'file:1공구 지하주차장_SHOP', 'gsheet:<id>:<gid>'
    sourceFile?: string;
    // 엑셀 '날짜' 칸 (YYYY-MM-DD). 같은 도면·직경이라도 날짜가 다르면 따로 둔다
    date?: string;

    // Version Control for Planned Quantity
    // Map of Version Name -> Weight (e.g., { 'Rev.0': 1000, 'Rev.1': 1200 })
    plannedVersions: Record<string, number>;

    // Comparison Data (Display values for active version)
    plannedQuantity: number;
    plannedWeight: number;
    
    shopQuantity: number;
    shopWeight: number;
    
    lastUpdated: string;
}

export interface ConcreteEntry {
    id: string;
    projectId: string;
    dong: string;
    floor: string;
    zone: string;
    strength: string; // e.g., "240", "270"
    type: string; // e.g., "Regular", "High Strength", "Lean"
    slump?: string; // e.g., "150"
    
    dataSource?: 'Design' | 'Construction'; // 'Construction' instead of 'Shop'

    // Volume in m3
    plannedVolume: number;
    constructionVolume: number;
    
    lastUpdated: string;
}

export interface HistoryLog {
    id: string;
    projectId: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT' | 'VERSION';
    description: string;
    user: string;
    timestamp: string;
}

export type IssueStatus = 'Open' | 'InProgress' | 'Resolved';
export type IssuePriority = 'High' | 'Medium' | 'Low';

export interface Issue {
    id: string;
    projectId: string;
    title: string;
    content: string;
    author: string;
    assignee: string; 
    status: IssueStatus;
    priority: IssuePriority;
    createdAt: string;
    attachment?: string; 
    isDeleted?: boolean; 
}

export type InspectionResult = 'Pending' | 'Pass' | 'Fail';
export type InspectionType = 'Rebar' | 'Concrete' | 'Formwork' | 'Other';

export interface Inspection {
    id: string;
    projectId: string;
    dong: string;
    floor: string;
    zone: string;
    type: InspectionType;
    inspector: string; // 검측자
    inspectionDate: string; // YYYY-MM-DD
    result: InspectionResult;
    note?: string;
    attachment?: string;
    createdAt: string;
    isDeleted?: boolean;
}

export type PinStatus = 'Pending' | 'Confirmed';

export interface DrawingPin {
    id: string;
    page: number; // 1-based page number
    xPct: number; // 0-100, position on the page
    yPct: number; // 0-100, position on the page
    label: string;
    status: PinStatus;
    confirmedBy?: string;
    confirmedAt?: string;
}

export interface ShopDrawing {
    id: string; // Also used as the key for the PDF blob in IndexedDB
    projectId: string;
    dong: string;
    floor?: string;
    title: string;
    fileName: string;
    totalPages: number;
    pins: DrawingPin[];
    uploadedBy: string;
    uploadedAt: string;

    // Manual whole-document sign-off, independent of individual pin checks
    completed?: boolean;
    completedBy?: string;
    completedAt?: string;
}

export type OrderStatus = 'RequestApproval' | 'Approved' | 'Rejected' | 'Ordered' | 'Delivered';

export interface Order {
    id: string;
    projectId: string;
    title: string;
    dong: string;
    floor: string;
    diameter: RebarDiameter;
    strength: string; // Grade (e.g., SD400)
    quantityWeight: number; // kg
    orderDate: string; // YYYY-MM-DD
    deliveryDate: string; // YYYY-MM-DD
    status: OrderStatus;
}

export interface ChatMessage {
    id: string;
    role: 'user' | 'model';
    text: string;
    timestamp: number;
    isThinking?: boolean;
}
