
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MaterialEntry, Project, RebarDiameter, User, BuildingConfig, BatchUploadResult, UploadMode, SyncOptions } from '../types';
import { fileSourceKey, normalizeDate, sourceLabel, loadSheetLinks } from '../utils/googleSheet';
import { SheetSync } from './SheetSync';
import { BuildResult, PendingUpload, buildMaterialUpload } from '../utils/materialImport';
import { Plus, Trash2, Calculator, FileSpreadsheet, UploadCloud, Building, GitBranch, ArrowRightLeft, X, Calendar, Download, BarChart3, Truck, Info, ChevronDown, ChevronRight, ChevronUp, Scale, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { CouplerSummaryTable, isCoupler, formatEntryAmount } from './CouplerSummary';
import { normalizeRebarSpec } from '../utils/rebarSpec';
import { getFloorAbove, lowestFloorOf, classifyMember, isFoundationMember, isFloorInBuilding, resolveNamedFloor, roofFloorsOf, topFloorOf, floorLabel } from '../utils/floorBasis';

// 엑셀을 읽은 뒤 교체/덮어쓰기 선택을 기다리는 업로드
interface MaterialInputProps {
    currentProject: Project;
    user: User;
    materials: MaterialEntry[];
    onAddMaterial: (material: MaterialEntry) => void;
    onBatchAddMaterials: (materials: MaterialEntry[], mode: UploadMode, sync?: SyncOptions) => BatchUploadResult;
    onDeleteMaterial: (id: string) => void;
    onDeleteAllMaterials: (projectId: string, dataSource: 'Design' | 'Shop', dong: string) => void;
    onCreateVersion: (projectId: string, versionName: string, versionDate: string, dong: string) => void;
    onSwitchVersion: (projectId: string, versionName: string, dong: string) => void;
    defaultTab?: 'overview' | 'design' | 'shop';
}

// Helper to aggregate data by Diameter + Strength (Floor Level Summary)
const aggregateByDiameter = (items: MaterialEntry[]) => {
    const map = new Map<string, { diameter: RebarDiameter, strength: string, planned: number, shop: number }>();
    
    // 커플러는 개수(EA)라 ton 집계에 넣지 않는다 (CouplerSummaryTable에서 따로 집계)
    items.filter(item => !isCoupler(item)).forEach(item => {
        const key = `${item.diameter}-${item.strength}`;
        if (!map.has(key)) {
            map.set(key, { diameter: item.diameter, strength: item.strength, planned: 0, shop: 0 });
        }
        const current = map.get(key)!;
        current.planned += item.plannedWeight;
        current.shop += item.shopWeight;
    });

    return Array.from(map.values())
        .sort((a, b) => {
            const diaCompare = a.diameter.localeCompare(b.diameter);
            if (diaCompare !== 0) return diaCompare;
            return a.strength.localeCompare(b.strength);
        })
        .map((data) => ({
            diameter: data.diameter,
            strength: data.strength,
            planned: data.planned,
            shop: data.shop,
            delta: data.shop - data.planned,
            progress: data.planned > 0 ? (data.shop / data.planned) * 100 : 0
        }));
};

// Summary Table Component
const DiameterSummaryTable: React.FC<{ data: ReturnType<typeof aggregateByDiameter>, title: string }> = ({ data, title }) => {
    if (data.length === 0) return <div className="p-4 text-center text-slate-400 italic bg-slate-50 rounded-lg border border-slate-100">데이터가 없습니다.</div>;
    const totalPlanned = data.reduce((acc, curr) => acc + curr.planned, 0);
    const totalShop = data.reduce((acc, curr) => acc + curr.shop, 0);
    const totalDelta = totalShop - totalPlanned;

    return (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h4 className="font-bold text-slate-700 flex items-center gap-2 text-sm"><Calculator size={16} /> {title}</h4>
                <div className="text-sm font-mono">Total Delta: <span className={totalDelta > 0 ? 'text-red-500 font-bold' : totalDelta < 0 ? 'text-blue-500 font-bold' : 'text-slate-500'}>{totalDelta > 0 ? '+' : ''}{(totalDelta / 1000).toLocaleString(undefined, {minimumFractionDigits: 3})} ton</span></div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                        <tr>
                            <th className="px-4 py-2 text-left">Diameter</th>
                            <th className="px-4 py-2 text-center">Strength</th>
                            <th className="px-4 py-2 text-slate-600">실행물량 (ton)</th>
                            <th className="px-4 py-2 text-blue-600">SHOP물량 (ton)</th>
                            <th className="px-4 py-2">차이 (ton)</th>
                            <th className="px-4 py-2 text-center">진행률</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {data.map((row) => (
                            <tr key={`${row.diameter}-${row.strength}`} className="hover:bg-slate-50">
                                <td className="px-4 py-3 text-left font-bold text-slate-700">{row.diameter}</td>
                                <td className="px-4 py-3 text-center text-slate-500 text-xs">{row.strength}</td>
                                <td className="px-4 py-3 text-slate-600 font-medium">{(row.planned / 1000).toLocaleString(undefined, {minimumFractionDigits: 3})}</td>
                                <td className="px-4 py-3 text-blue-700 font-bold bg-blue-50/10">{(row.shop / 1000).toLocaleString(undefined, {minimumFractionDigits: 3})}</td>
                                <td className={`px-4 py-3 font-bold ${row.delta > 0 ? 'text-red-500' : row.delta < 0 ? 'text-blue-500' : 'text-slate-300'}`}>{row.delta > 0 ? '+' : ''}{(row.delta / 1000).toLocaleString(undefined, {minimumFractionDigits: 3})}</td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center justify-end gap-2">
                                        <div className="w-16 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full ${row.progress > 100 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min(row.progress, 100)}%` }}></div>
                                        </div>
                                        <span className="text-xs text-slate-400 w-8">{row.progress.toFixed(0)}%</span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        <tr className="font-bold bg-slate-100/50 border-t border-slate-200">
                            <td className="px-4 py-3 text-left" colSpan={2}>합계 (Total)</td>
                            <td className="px-4 py-3">{(totalPlanned / 1000).toLocaleString(undefined, {minimumFractionDigits: 3})}</td>
                            <td className="px-4 py-3 text-blue-700">{(totalShop / 1000).toLocaleString(undefined, {minimumFractionDigits: 3})}</td>
                            <td className={`px-4 py-3 ${totalDelta > 0 ? 'text-red-600' : totalDelta < 0 ? 'text-blue-600' : 'text-slate-400'}`}>{totalDelta > 0 ? '+' : ''}{(totalDelta / 1000).toLocaleString(undefined, {minimumFractionDigits: 3})}</td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export const MaterialInput: React.FC<MaterialInputProps> = ({ 
    currentProject, user, materials, 
    onAddMaterial, onBatchAddMaterials, onDeleteMaterial, onDeleteAllMaterials,
    onCreateVersion, onSwitchVersion,
    defaultTab = 'overview'
}) => {
    const navigate = useNavigate();
    // Check Permissions
    const userRole = currentProject.members.find(m => m.userId === user.email)?.role || 'Guest';
    const canEdit = userRole === 'Admin' || userRole === 'Participant';

    // State for Building (Dong) Selection
    const [selectedDong, setSelectedDong] = useState<string>('');
    const [activeTab, setActiveTab] = useState<'overview' | 'design' | 'shop'>(defaultTab);
    const [expandedFloors, setExpandedFloors] = useState<Set<string>>(new Set());
    
    // Sync tab state with props
    useEffect(() => {
        setActiveTab(defaultTab);
    }, [defaultTab]);

    // Version Control UI State
    const [isCreateVerOpen, setIsCreateVerOpen] = useState(false);
    const [isCompareVerOpen, setIsCompareVerOpen] = useState(false);
    const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
    const [newVersionName, setNewVersionName] = useState('');
    const [newVersionDate, setNewVersionDate] = useState(new Date().toISOString().split('T')[0]);
    
    // Determine current active version for selected Dong
    const activeVerForDong = useMemo(() => {
        return (selectedDong && currentProject.activeVersion[selectedDong]) || 'Rev.0';
    }, [currentProject.activeVersion, selectedDong]);

    const [baseVersion, setBaseVersion] = useState(activeVerForDong);
    const [targetVersion, setTargetVersion] = useState(activeVerForDong);

    // Initialize selectedDong
    useEffect(() => {
        if (currentProject.buildings.length > 0 && !selectedDong) {
            setSelectedDong(currentProject.buildings[0].name);
        } else if (currentProject.buildings.length > 0 && !currentProject.buildings.find(b => b.name === selectedDong)) {
            setSelectedDong(currentProject.buildings[0].name);
        }
    }, [currentProject, selectedDong]);

    // Update compare selectors when active version changes
    useEffect(() => {
        setBaseVersion(activeVerForDong);
        setTargetVersion(activeVerForDong);
    }, [activeVerForDong]);

    // Get Current Building Configuration
    const currentBuildingConfig = useMemo(() => 
        currentProject.buildings.find(b => b.name === selectedDong), 
    [currentProject, selectedDong]);

    // Filter materials for this project AND selected Dong
    const dongMaterials = useMemo(() => 
        materials.filter(m => m.projectId === currentProject.id && m.dong === selectedDong), 
    [materials, currentProject.id, selectedDong]);

    // Generate Display Floor List (Configured Floors + Actual Data Floors)
    const displayFloorList = useMemo(() => {
        const floorSet = new Set<string>();
        
        // 1. Add Configured Floors
        if (currentBuildingConfig) {
            for (let i = currentBuildingConfig.basementFloors; i >= 1; i--) {
                floorSet.add(`B${i}`);
            }
            // 모델에서 가져온 지붕층(RF, PHF ...)이 있으면 함께 보여준다
            const top = currentBuildingConfig.roofFloors?.length ? topFloorOf(currentBuildingConfig) : currentBuildingConfig.groundFloors;
            for (let i = 1; i <= top; i++) {
                floorSet.add(`${i}F`);
            }
        }

        // 2. Add Floors present in Data (handle out-of-bounds floors like PH)
        dongMaterials.forEach(m => floorSet.add(m.floor));

        // 3. Sort Floors Correctly (B3...B1, 1F...100F, Others)
        return Array.from(floorSet).sort((a, b) => {
            const getVal = (s: string) => {
                if (s.startsWith('B')) return -parseInt(s.replace(/[^0-9]/g, ''));
                if (s.endsWith('F')) return parseInt(s.replace(/[^0-9]/g, ''));
                return 9999; // Unknown floors (like PH) go to top/bottom
            };
            return getVal(a) - getVal(b); 
        });
    }, [currentBuildingConfig, dongMaterials]);


    // Separate counts and weights for Summary Cards
    const designSummary = useMemo(() => {
        const entries = dongMaterials.filter(m => m.dataSource === 'Design');
        const weight = entries.reduce((acc, m) => acc + m.plannedWeight, 0);
        return { count: entries.length, weight };
    }, [dongMaterials]);

    const shopSummary = useMemo(() => {
        const entries = dongMaterials.filter(m => m.dataSource === 'Shop');
        const weight = entries.reduce((acc, m) => acc + m.shopWeight, 0);
        return { count: entries.length, weight };
    }, [dongMaterials]);

    // 선택한 동의 실행 또는 SHOP 물량만 모두 지운다 (다른 동, 다른 구분은 그대로)
    const handleDeleteAll = (dataSource: 'Design' | 'Shop') => {
        const summary = dataSource === 'Design' ? designSummary : shopSummary;
        const label = dataSource === 'Design' ? '실행 물량' : 'SHOP 물량';
        if (summary.count === 0) {
            alert(`${selectedDong}에 등록된 ${label}이 없습니다.`);
            return;
        }
        const otherLabel = dataSource === 'Design' ? 'SHOP' : '실행';
        const versionNote = dataSource === 'Design' ? '\n버전별(Rev) 물량 기록도 함께 삭제됩니다.' : '';
        if (!confirm(`${selectedDong}의 ${label} ${summary.count.toLocaleString()}건을 모두 삭제합니다.\n다른 동과 ${otherLabel} 물량은 그대로 유지됩니다.${versionNote}\n\n삭제한 물량은 되돌릴 수 없습니다. 계속할까요?`)) return;
        onDeleteAllMaterials(currentProject.id, dataSource, selectedDong);
    };

    // Get Versions available for the Selected Dong
    const dongVersions = useMemo(() => {
        const specific = currentProject.versions.filter(v => v.dong === selectedDong);
        if (specific.length === 0) return [{ name: 'Rev.0', date: currentProject.startDate, dong: selectedDong }];
        return specific;
    }, [currentProject.versions, selectedDong, currentProject.startDate]);

    // Form state
    const [targetFloor, setTargetFloor] = useState(displayFloorList[0] || '1F');
    const [zone, setZone] = useState('');
    const [diameter, setDiameter] = useState<RebarDiameter>(RebarDiameter.D10);
    const [strength, setStrength] = useState<string>('SD400');
    const [manualWeight, setManualWeight] = useState<number>(0);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Update target floor default if list changes
    useEffect(() => {
        if (displayFloorList.length > 0 && !displayFloorList.includes(targetFloor)) {
            // Try to find 1F or default to first
            const f1 = displayFloorList.find(f => f === '1F');
            setTargetFloor(f1 || displayFloorList[0]);
        }
    }, [displayFloorList]); 

    const handleAdd = () => {
        if (!canEdit) return;
        if (!selectedDong) {
            alert('동(Building)이 선택되지 않았습니다.');
            return;
        }
        
        if (manualWeight <= 0) {
            alert('유효한 중량(Weight)을 입력해주세요.');
            return;
        }
        
        // Convert Input Ton to KG for internal storage
        const weightKg = manualWeight * 1000;
        
        const dataSource = activeTab === 'design' ? 'Design' : 'Shop'; 
        
        // For Shop, default to General if empty. For Design, user input or General.
        const currentZone = zone.trim() || 'General';
        
        // Find existing entry ONLY matching the same DataSource
        const existing = materials.find(m => 
            m.projectId === currentProject.id && 
            m.dong === selectedDong &&
            m.floor === targetFloor && 
            m.zone === currentZone && 
            m.diameter === diameter &&
            m.strength === strength &&
            m.dataSource === dataSource
        );

        let newEntry: MaterialEntry;
        if (existing) {
            newEntry = {
                ...existing,
                lastUpdated: new Date().toLocaleDateString(),
                dataSource: dataSource,
                ...(dataSource === 'Design'
                    ? { plannedQuantity: 0, plannedWeight: existing.plannedWeight + Number(weightKg.toFixed(2)) }
                    : { shopQuantity: 0, shopWeight: existing.shopWeight + Number(weightKg.toFixed(2)) }
                )
            };
        } else {
            newEntry = {
                id: Math.random().toString(36).substr(2, 9),
                projectId: currentProject.id,
                dong: selectedDong,
                floor: targetFloor,
                zone: currentZone,
                diameter,
                strength,
                lengthMm: 0,
                dataSource: dataSource,
                plannedQuantity: 0,
                plannedWeight: dataSource === 'Design' ? Number(weightKg.toFixed(2)) : 0,
                shopQuantity: 0,
                shopWeight: dataSource === 'Shop' ? Number(weightKg.toFixed(2)) : 0,
                plannedVersions: {}, // Will be populated by App.tsx
                lastUpdated: new Date().toLocaleDateString()
            };
        }
        onAddMaterial(newEntry);
        setManualWeight(0);
        setZone('');
        
        setExpandedFloors(prev => new Set(prev).add(targetFloor));
        
        alert(`${dataSource === 'Design' ? '실행 물량' : 'SHOP 물량'}이 추가되었습니다.\n(${targetFloor} - ${currentZone} - ${diameter} - ${manualWeight} ton)`);
    };

    // Excel Upload Logic
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!canEdit) return;
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const bstr = event.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws);
            if (fileInputRef.current) fileInputRef.current.value = '';
            const r = buildUpload(data, fileSourceKey(file.name));
            if (!r.upload) { alert(r.error); return; }
            // 처음 올리는 동이면 바로 반영(동기화로 출처를 남긴다), 기존 물량이 있으면 방식을 고르게 한다
            if (r.upload.existingCount > 0) openPending(r.upload);
            else applyUpload(r.upload, 'sync');
        };
        reader.readAsBinaryString(file);
    };

    const handleDownloadTemplate = () => {
        const isShop = activeTab === 'shop';
        const dong = selectedDong || '101동';
        // Shop일 경우 '구분' 컬럼 추가 (수평재/수직재)
        // '구성'이 커플러인 행은 값을 개수(EA)로 읽는다
        const headers = ['동', '층', isShop ? '도면명(Zone)' : 'Zone', '직경', '강종', '구성(철근/커플러)', isShop ? '샵중량(ton) / 커플러(EA)' : '실행중량(ton) / 커플러(EA)', '구분(수평/수직)', '날짜'];
        const today = new Date().toISOString().slice(0, 10);

        const examples = isShop
            ? [
                [dong, '4F', 'S1-Slab', '25', 'SD400', '철근', 0.5, '수평', today],
                [dong, '4F', 'C1-Column', '25', 'SD400', '커플러', 120, '수직', today]
            ]
            : [
                [dong, '4F', 'Slab', '25', 'SD400', '철근', 0.5, '수평', ''],
                [dong, '4F', 'Column', '25', 'SD400', '커플러', 120, '수직', '']
            ];

        const ws = XLSX.utils.aoa_to_sheet([headers, ...examples]);
        ws['!cols'] = [{wch: 10}, {wch: 6}, {wch: 14}, {wch: 6}, {wch: 8}, {wch: 18}, {wch: 26}, {wch: 16}, {wch: 12}];
        const guide = XLSX.utils.aoa_to_sheet([
            ['항목', '작성 방법'],
            ['구성', "철근이면 '철근', 커플러면 '커플러'로 적습니다. 비워 두면 철근으로 봅니다."],
            ['중량 / 개수', '철근은 중량(ton), 커플러는 개수(EA)를 같은 칸에 적습니다.'],
            ['동 / 층', "프로젝트 설정에 있는 동 이름과 층 범위 안이어야 업로드됩니다. (예: 4F, B1) 'PIT'는 최하층(지하층수), 'RF'·'PHF' 등 지붕층은 프로젝트 설정의 지붕층 이름 순서대로 지상층수+1층부터 반영됩니다."],
            ['직경', '커플러도 직경(예: 25)을 적어야 합니다. 직경이 없는 행은 건너뜁니다.'],
            ['내진(S)', "직경에 S를 붙이거나(D22S) 강종에 붙이면(SD600S) 모두 'D22 / SD600S'로 같게 반영됩니다. 강종 숫자 없이 S만 적거나(강종 'S') 직경에만 S가 있으면(22S) '미기재(S)'로 반영됩니다."],
            ['강종', "적으면 철근·커플러 모두 그대로 반영됩니다. 비워 두면 '미기재'로 표시됩니다."],
            ['날짜', "SHOP 반입일·작성일 등 (예: 2026-11-05). 같은 도면·직경이라도 날짜가 다르면 따로 저장됩니다. 비워도 됩니다."],
            ['누적 관리', "한 파일에 날짜를 적어 아래로 계속 추가하고, 파일 전체를 다시 올리면서 '파일 기준 동기화'를 고르면 새로 추가·수정된 행만 반영되고 중복되지 않습니다. 구글 시트를 연결해도 같은 방식으로 반영됩니다."],
            ['구분', isShop
                ? "SHOP 물량은 적힌 층 그대로 집계됩니다. (슬래브는 그 층 바닥 기준)"
                : "슬래브·보·기초 등은 '수평', 기둥·벽체·계단 등은 '수직'으로 적습니다. 실행의 수평재는 천장 기준이라 한 층 위로 올려 SHOP과 같은 기준으로 집계됩니다. (B3F 수평 → B2F, 최하층·기초는 그대로)"]
        ]);
        guide['!cols'] = [{wch: 14}, {wch: 70}];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Input Template");
        XLSX.utils.book_append_sheet(wb, guide, "작성 방법");
        XLSX.writeFile(wb, `물량입력양식_${isShop ? 'SHOP' : 'DESIGN'}.xlsx`);
    };

    // 읽어 둔 엑셀 물량을 반영한다. replace면 파일에 든 동들의 같은 구분 기존 물량을 비우고 새로 채우고, add면 기존 값에 더한다.
    const applyUpload = (upload: PendingUpload, mode: UploadMode, sync?: SyncOptions) => {
        setPendingUpload(null);
        const result = onBatchAddMaterials(upload.entries, mode, sync);
        setExpandedFloors(prev => {
            const next = new Set(prev);
            upload.affectedFloors.forEach(f => next.add(f));
            return next;
        });

        const label = upload.dataSource === 'Design' ? '실행' : 'SHOP';
        const dongSummary = Object.entries(upload.dongRowCounts).map(([d, c]) => `${d}: ${c}건`).join(', ');
        const logicInfo = upload.dataSource === 'Design'
            ? (upload.shiftedRowCount > 0
                ? `\n(수평재 ${upload.shiftedRowCount}행: 실행 n형 → SHOP 기준으로 한 층 위로 반영, 최하층·기초는 그대로)`
                : "\n(주의: 수평재로 인식된 행이 없어 층 변환을 하지 않았습니다. '구분' 칸에 수평/슬래브/보/기초 등이 적혀 있는지 확인하세요.)")
            : '';
        const { H, V, none } = upload.classCounts;
        const classInfo = `\n(부재 구분: 수평 ${H}행 / 수직 ${V}행${none > 0 ? ` / 구분 없음 ${none}행 → 3D 모델에서 층 전체 진척으로 표시` : ''})`;
        const couplerInfo = upload.couplerRowCount > 0 ? `\n(그중 커플러 ${upload.couplerRowCount}행: '구성' 칸 기준, 개수(EA)로 따로 저장)` : '';
        const applied = mode === 'sync'
            ? `- 동기화 (${sourceLabel(upload.source)}): 같은 출처 기존 ${label} 물량 ${result.cleared}건을 정리하고 ${result.created}건 반영\n- 다른 파일·시트에서 온 물량은 그대로`
            : mode === 'replace'
            ? `- 교체: 기존 ${label} 물량 ${result.cleared}건 삭제 후 ${result.created}건 새로 반영`
            : (mode === 'add'
                ? `- 신규 ${result.created}건\n- 기존 물량에 더하기 ${result.merged}건 (같은 동/층/Zone/직경/강종은 기존 값 + 파일 값)`
                : `- 신규 ${result.created}건\n- 기존 물량 덮어쓰기 ${result.replaced}건 (같은 동/층/Zone/직경/강종은 누적하지 않음)`)
                + (result.duplicatesRemoved > 0 ? `\n- 이전 업로드로 중복 저장된 물량 ${result.duplicatesRemoved}건 정리` : '');
        const dateInfo = (upload.dateRowCount > 0 ? `\n(날짜 칸이 있는 행 ${upload.dateRowCount}행: 날짜별로 따로 저장)` : '')
            + Object.entries(upload.rerouted).map(([k, c]) => `\n(지하층 ${c}행: ${k} - 그 동에 해당 층 실행 물량이 없어 지하주차장 실행과 비교되도록 보냄)`).join('');
        alert(`[${upload.dataSource} 모드] 처리 완료!${logicInfo}${classInfo}${dateInfo}\n\n총 ${upload.processedCount}행 유효 데이터 -> ${upload.entries.length}개 항목으로 집계됨.${couplerInfo}\n(중량 단위: TON -> 내부 KG 변환 저장)\n\n[반영]\n${applied}\n\n[결과]\n${dongSummary}`);
    };

    // 엑셀·구글 시트 행을 물량 항목으로 묶는다 (공용 함수, 반영은 applyUpload / 시트 동기화)
    const buildUpload = (data: any[], source: string, opts: { lenient?: boolean } = {}): BuildResult =>
        buildMaterialUpload(data, source, { project: currentProject, materials, dataSource: activeTab === 'design' ? 'Design' : 'Shop', defaultDong: selectedDong }, opts);

    // 업로드 방식 창: 동기화 기준(이전 출처)과 예전 업로드 정리 여부를 정해 둔다
    const [syncPrev, setSyncPrev] = useState('');
    const [clearUntagged, setClearUntagged] = useState(false);
    const openPending = (upload: PendingUpload) => {
        setSyncPrev('');
        // 출처 기록이 아직 하나도 없는 동이면(예전 방식으로만 올렸으면) 정리를 기본으로
        const taggedInDongs = materials.some(m => m.projectId === currentProject.id && m.sourceFile && upload.dongs.includes(m.dong) && (m.dataSource ?? 'Design') === upload.dataSource);
        setClearUntagged(upload.untaggedCount > 0 && !taggedInDongs);
        setPendingUpload(upload);
    };

    // Version Comparision Logic
    const getVersionComparison = () => {
        const diffs: any[] = [];
        let totalBase = 0;
        let totalTarget = 0;

        const comparisonMaterials = materials.filter(m => m.projectId === currentProject.id && m.dong === selectedDong && m.dataSource !== 'Shop');
        
        const map = new Map<string, { floor: string, diameter: string, base: number, target: number }>();

        comparisonMaterials.forEach(m => {
            const key = `${m.floor}-${m.diameter}`;
            if (!map.has(key)) {
                map.set(key, { floor: m.floor, diameter: m.diameter, base: 0, target: 0 });
            }
            const entry = map.get(key)!;
            const baseVal = m.plannedVersions[baseVersion] || 0;
            const targetVal = m.plannedVersions[targetVersion] || 0;
            
            entry.base += baseVal;
            entry.target += targetVal;
            totalBase += baseVal;
            totalTarget += targetVal;
        });

        const rows = Array.from(map.values()).filter(r => Math.abs(r.target - r.base) > 1);
        rows.sort((a, b) => a.floor.localeCompare(b.floor) || a.diameter.localeCompare(b.diameter));

        return { rows, totalBase, totalTarget };
    };

    const { rows: diffRows, totalBase, totalTarget } = getVersionComparison();

    const totalPlanned = dongMaterials.reduce((acc, m) => acc + m.plannedWeight, 0);
    const totalShop = dongMaterials.reduce((acc, m) => acc + m.shopWeight, 0);
    const totalProgress = totalPlanned > 0 ? (totalShop / totalPlanned) * 100 : 0;

    const toggleFloor = (floor: string) => {
        setExpandedFloors(prev => {
            const next = new Set(prev);
            if (next.has(floor)) next.delete(floor);
            else next.add(floor);
            return next;
        });
    };

    // Header Content based on active tab
    const getHeaderContent = () => {
        switch(activeTab) {
            case 'overview': return { title: '종합 물량 현황', subtitle: 'Project Material Overview', icon: BarChart3, color: 'text-slate-800' };
            case 'design': return { title: '실행 물량 관리', subtitle: 'Design (Execution) Quantity Management', icon: FileSpreadsheet, color: 'text-slate-800' };
            case 'shop': return { title: 'SHOP 물량 관리', subtitle: 'Actual Shop Drawing Material Log', icon: Truck, color: 'text-blue-600' };
            default: return { title: '물량 관리', subtitle: 'Material Management', icon: Calculator, color: 'text-slate-800' };
        }
    };

    const header = getHeaderContent();
    const HeaderIcon = header.icon;

    if (currentProject.buildings.length === 0) {
        return (
             <div className="flex flex-col items-center justify-center h-full text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
                <Building size={48} className="mb-4 opacity-20" />
                <p>설정된 동(Building)이 없습니다.</p>
                <p className="text-sm">프로젝트 설정 메뉴에서 동을 먼저 정의해주세요.</p>
             </div>
        );
    }

    // --- Render Content Based on Active Tab ---

    const renderInputControls = (type: 'design' | 'shop') => (
        <div className="flex-none bg-white p-5 rounded-xl shadow-sm border border-slate-100 mb-6 animate-in slide-in-from-top-2">
            <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                {type === 'design' ? <FileSpreadsheet size={16} className="text-slate-500" /> : <Truck size={16} className="text-blue-500" />}
                {type === 'design' ? '실행 물량 수기 입력 (Design Input)' : 'SHOP 물량 수기 입력 (Shop Input)'}
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="col-span-2 md:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">FLOOR</label>
                    <select value={targetFloor} onChange={e => setTargetFloor(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-bold text-slate-800">
                        {displayFloorList.map(f => <option key={f} value={f}>{floorLabel(currentBuildingConfig, f)}</option>)}
                    </select>
                </div>
                <div className="col-span-2 md:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                        {type === 'shop' ? '도면명 (Drawing/Zone)' : 'Zone'}
                    </label>
                    <input type="text" value={zone} onChange={e => setZone(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm" placeholder={type === 'shop' ? 'S1-Slab (선택)' : 'Slab (선택)'} />
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-500 mb-1">DIA</label>
                    <select value={diameter} onChange={e => setDiameter(e.target.value as RebarDiameter)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm">
                        {Object.values(RebarDiameter).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>
                    <div>
                    <label className="block text-sm font-bold text-slate-500 mb-1">GRADE</label>
                    <select value={strength} onChange={e => setStrength(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm">
                        {['SD300','SD400','SD500','SD600'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                    <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">WEIGHT(ton)</label>
                    <input type="number" value={manualWeight} onChange={e => setManualWeight(Number(e.target.value))} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm" placeholder="0" />
                </div>
                <button onClick={handleAdd} className={`col-span-2 md:col-span-1 text-white py-1.5 px-3 rounded text-sm font-medium shadow-sm transition-all ${type === 'design' ? 'bg-slate-700 hover:bg-slate-800' : 'bg-blue-600 hover:bg-blue-700'}`}>
                    <Plus size={14} className="inline mr-1" /> 추가
                </button>
            </div>
        </div>
    );

    return (
        <div className="space-y-6 h-full flex flex-col relative">
            {/* Page Header */}
             <div className="flex-none flex justify-between items-start">
                <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg bg-white border border-slate-200 shadow-sm ${header.color}`}>
                        <HeaderIcon size={24} />
                    </div>
                    <div>
                        <h2 className={`text-2xl font-bold ${header.color}`}>{header.title}</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-slate-500 text-sm">{header.subtitle}</span>
                            <span className="text-slate-300">|</span>
                            <span className="text-slate-500 text-sm">Project:</span>
                            <span className="text-blue-600 font-semibold text-sm">{currentProject.name}</span>
                        </div>
                    </div>
                </div>
                
                {/* Version Control Toolbar (Visible on all tabs but mostly relevant to Design) */}
                <div className="flex items-center gap-3 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm">
                    <div className="px-2 text-xs font-bold text-slate-400 uppercase tracking-tighter">
                        {selectedDong} Ver.
                    </div>
                    <div className="flex items-center px-3 gap-2 border-r border-slate-200">
                        <GitBranch size={16} className="text-slate-400" />
                        <select 
                            value={activeVerForDong}
                            onChange={(e) => onSwitchVersion(currentProject.id, e.target.value, selectedDong)}
                            className="text-sm font-bold text-slate-700 bg-transparent outline-none cursor-pointer hover:text-blue-600"
                        >
                            {dongVersions.map(v => (
                                <option key={v.name} value={v.name}>{v.name} ({v.date})</option>
                            ))}
                        </select>
                    </div>
                    {canEdit && (
                        <button 
                            onClick={() => setIsCreateVerOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded transition-colors"
                        >
                            <Plus size={14} /> New Version
                        </button>
                    )}
                    <button 
                        onClick={() => setIsCompareVerOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                    >
                        <ArrowRightLeft size={14} /> Compare
                    </button>
                </div>
            </div>

            {/* Building Selector (Horizontal Tab Style) */}
            <div className="flex-none border-b border-slate-200 overflow-x-auto pb-1 flex justify-between items-end">
                <div className="flex gap-1">
                    {currentProject.buildings.map(b => (
                        <button
                            key={b.name}
                            onClick={() => setSelectedDong(b.name)}
                            className={`px-5 py-2.5 rounded-t-lg font-medium text-sm whitespace-nowrap transition-all ${
                                selectedDong === b.name 
                                ? 'bg-slate-800 text-white shadow-sm transform -translate-y-0.5' 
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <Building size={14} className={selectedDong === b.name ? 'text-blue-400' : 'text-slate-400'}/>
                                {b.name}
                            </div>
                        </button>
                    ))}
                </div>
                {activeTab !== 'overview' && !canEdit && (
                     <div className="flex items-center gap-2 text-xs text-orange-500 font-medium pb-2 pr-2">
                        <Lock size={14} />
                        <span>읽기 전용 (Read Only)</span>
                    </div>
                )}
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 overflow-y-auto">
                {/* 1. OVERVIEW TAB */}
                {activeTab === 'overview' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        {/* Summary Cards */}
                        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
                            <div>
                                <p className="text-xs text-slate-400 uppercase font-bold mb-1">Building Total</p>
                                <p className="text-lg font-bold text-slate-800">{selectedDong}</p>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 text-slate-500 text-sm font-medium mb-1">
                                    <span className="w-2 h-2 bg-slate-300 rounded-full"></span> Total Planned
                                </div>
                                <p className="text-2xl font-bold text-slate-700">{(totalPlanned / 1000).toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 2})} <span className="text-sm text-slate-400 font-normal">ton</span></p>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 text-slate-500 text-sm font-medium mb-1">
                                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span> Total Shop
                                </div>
                                <p className="text-2xl font-bold text-blue-600">{(totalShop / 1000).toLocaleString(undefined, {minimumFractionDigits: 1, maximumFractionDigits: 2})} <span className="text-sm text-slate-400 font-normal">ton</span></p>
                            </div>
                            
                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                <div className="flex justify-between items-end mb-1">
                                    <p className="text-xs text-slate-500 font-bold">PROGRESS</p>
                                    <span className={`text-sm font-bold ${totalProgress >= 100 ? 'text-green-600' : 'text-blue-600'}`}>{totalProgress.toFixed(1)}%</span>
                                </div>
                                <div className="w-full bg-slate-200 rounded-full h-1.5">
                                    <div className={`h-1.5 rounded-full ${totalProgress > 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(totalProgress, 100)}%` }}></div>
                                </div>
                            </div>
                        </div>

                        {/* Diameter Summary */}
                        <DiameterSummaryTable data={aggregateByDiameter(dongMaterials)} title={`${selectedDong} 전체 직경별 집계`} />
                        <CouplerSummaryTable items={dongMaterials} title={`${selectedDong} 커플러 직경·강종별 집계`} />

                        {/* Floor Progress List */}
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 text-sm">층별 진행 현황</div>
                            <div className="divide-y divide-slate-100">
                                {displayFloorList.map(floor => {
                                    const fm = dongMaterials.filter(m => m.floor === floor);
                                    const fp = fm.reduce((acc, m) => acc + m.plannedWeight, 0);
                                    const fs = fm.reduce((acc, m) => acc + m.shopWeight, 0);
                                    const pg = fp > 0 ? (fs / fp) * 100 : 0;
                                    
                                    // Skip empty floors in overview to keep it clean, but keep in edit mode
                                    if (fp === 0 && fs === 0) return null;

                                    return (
                                        <div key={floor} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                                            <div className="flex items-center gap-4 w-1/3">
                                                <div className={`w-8 h-8 rounded flex items-center justify-center text-sm font-bold ${floor.startsWith('B') ? 'bg-slate-200 text-slate-700' : 'bg-blue-100 text-blue-700'}`} title={floorLabel(currentBuildingConfig, floor)}>{floorLabel(currentBuildingConfig, floor).split(' (')[0]}</div>
                                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className={`h-full ${pg > 100 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(pg, 100)}%` }}></div>
                                                </div>
                                            </div>
                                            <div className="text-sm font-medium text-slate-600">{pg.toFixed(1)}%</div>
                                            <div className="flex gap-6 text-xs w-1/3 justify-end">
                                                <div><span className="text-slate-400">P:</span> {(fp/1000).toFixed(1)}t</div>
                                                <div><span className="text-slate-400">S:</span> <span className="font-bold text-blue-600">{(fs/1000).toFixed(1)}t</span></div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. DESIGN / EXECUTION TAB */}
                {activeTab === 'design' && (
                    <div className="animate-in slide-in-from-right-4 duration-300">
                        {/* Total Summary Card for Design */}
                        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm mb-6 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold text-slate-500 mb-1 flex items-center gap-2">
                                    <Building size={16} /> {selectedDong} 실행 물량 총계 (Total Design)
                                </p>
                                <div className="flex items-baseline gap-2">
                                    <h3 className="text-3xl font-bold text-slate-800">{(designSummary.weight / 1000).toLocaleString(undefined, {minimumFractionDigits: 2})}</h3>
                                    <span className="text-slate-500 font-medium">ton</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="bg-slate-100 px-4 py-2 rounded-lg">
                                    <p className="text-xs text-slate-500 font-bold uppercase mb-1">Entries</p>
                                    <p className="text-xl font-bold text-slate-700">{designSummary.count}</p>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        {canEdit && (
                            <div className="flex justify-end gap-2 mb-4">
                                <button onClick={() => handleDeleteAll('Design')} className="flex items-center gap-2 bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 shadow-sm text-xs font-medium">
                                    <Trash2 size={14} /> {selectedDong} 전체 삭제
                                </button>
                                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls" className="hidden" />
                                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 shadow-sm text-xs font-medium">
                                    <FileSpreadsheet size={14} /> Excel Upload (Design)
                                </button>
                            </div>
                        )}

                        <SheetSync
                            projectId={currentProject.id}
                            dataSource="Design"
                            materials={materials}
                            canEdit={canEdit}
                            buildUpload={buildUpload}
                            onApply={(entries, sync) => onBatchAddMaterials(entries, 'sync', sync)}
                        />

                        <div className="mb-6"><CouplerSummaryTable items={dongMaterials} title={`${selectedDong} 커플러 (실행 / SHOP 비교)`} /></div>

                        {canEdit && renderInputControls('design')}

                        {/* Detailed List */}
                        <div className="space-y-4">
                            {displayFloorList.map(floor => {
                                const fm = dongMaterials.filter(m => m.floor === floor && m.dataSource === 'Design');
                                const totalWeight = fm.reduce((a,c)=>a+c.plannedWeight,0);
                                const couplerEa = fm.filter(isCoupler).reduce((a,c)=>a+c.plannedQuantity,0);
                                const isExpanded = expandedFloors.has(floor);
                                
                                return (
                                    <div key={floor} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                        {/* Header - Always Visible */}
                                        <div 
                                            onClick={() => toggleFloor(floor)}
                                            className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center cursor-pointer hover:bg-slate-100 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded flex items-center justify-center text-sm font-bold ${floor.startsWith('B') ? 'bg-slate-200 text-slate-700' : 'bg-slate-700 text-white'}`}>
                                                    {floor}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-slate-700">실행 물량 (Design)</span>
                                                    <span className="text-xs text-slate-400">
                                                        {fm.length > 0 ? `${fm.length} entries` : 'No data'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                     <span className="text-xs text-slate-400 uppercase font-bold block">Total Weight</span>
                                                     <span className={`text-sm font-bold ${totalWeight > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                                                        {(totalWeight/1000).toFixed(2)} t
                                                     </span>
                                                     {couplerEa > 0 && <span className="block text-[11px] font-bold text-violet-600">커플러 {Math.round(couplerEa).toLocaleString()} EA</span>}
                                                </div>
                                                {isExpanded ? <ChevronUp size={20} className="text-slate-400"/> : <ChevronDown size={20} className="text-slate-400"/>}
                                            </div>
                                        </div>

                                        {/* Content - Collapsible */}
                                        {isExpanded && (
                                            <div className="border-t border-slate-100">
                                                {fm.length > 0 ? (
                                                    <table className="w-full text-xs text-left">
                                                        <thead className="bg-white text-slate-500 border-b border-slate-100">
                                                            <tr>
                                                                <th className="px-4 py-2">Zone</th>
                                                                <th className="px-4 py-2 text-center">DIA</th>
                                                                <th className="px-4 py-2 text-center">GRADE</th>
                                                                <th className="px-4 py-2 text-right">Weight (ton / 커플러 EA)</th>
                                                                <th className="px-4 py-2 text-right">Updated</th>
                                                                <th className="px-4 py-2 text-center">Action</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-50">
                                                            {fm.map((item) => (
                                                                <tr key={item.id} className="hover:bg-slate-50">
                                                                    <td className="px-4 py-2 font-medium text-slate-700">{item.zone}{isCoupler(item) && <span className="ml-2 px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[10px] font-bold">커플러</span>}</td>
                                                                    <td className="px-4 py-2 text-center text-slate-600 font-mono">{item.diameter}</td>
                                                                    <td className="px-4 py-2 text-center text-slate-500 text-xs">{item.strength}</td>
                                                                    <td className={`px-4 py-2 text-right ${isCoupler(item) ? 'text-violet-700 font-bold' : 'text-slate-800'}`}>{formatEntryAmount(item)}</td>
                                                                    <td className="px-4 py-2 text-right text-slate-400">{item.lastUpdated}</td>
                                                                    <td className="px-4 py-2 text-center">
                                                                        {canEdit && (
                                                                            <button onClick={() => onDeleteMaterial(item.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={14}/></button>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                ) : (
                                                    <div className="py-6 text-center text-slate-400 flex flex-col items-center gap-2">
                                                        <span className="text-sm">등록된 실행 물량이 없습니다.</span>
                                                        {canEdit && (
                                                            <button 
                                                                onClick={() => {
                                                                    setTargetFloor(floor);
                                                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                                                }}
                                                                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                                            >
                                                                <Plus size={12} /> 상단 폼에서 입력하기
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {/* 3. SHOP TAB (History Log Style) */}
                {activeTab === 'shop' && (
                    <div className="animate-in slide-in-from-right-4 duration-300">
                        {/* Total Summary Card for Shop */}
                        <div className="bg-white rounded-xl p-6 border border-blue-200 shadow-sm mb-6 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-bold text-blue-500 mb-1 flex items-center gap-2">
                                    <Scale size={16} /> {selectedDong} SHOP 물량 총계 (Total Shop)
                                </p>
                                <div className="flex items-baseline gap-2">
                                    <h3 className="text-3xl font-bold text-blue-700">{(shopSummary.weight / 1000).toLocaleString(undefined, {minimumFractionDigits: 2})}</h3>
                                    <span className="text-blue-500 font-medium">ton</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="bg-blue-50 px-4 py-2 rounded-lg border border-blue-100">
                                    <p className="text-xs text-blue-500 font-bold uppercase mb-1">Entries</p>
                                    <p className="text-xl font-bold text-blue-700">{shopSummary.count}</p>
                                </div>
                            </div>
                        </div>

                         {/* Actions */}
                        {canEdit && (
                            <div className="flex justify-end gap-2 mb-4">
                                <button onClick={() => handleDeleteAll('Shop')} className="flex items-center gap-2 bg-white border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 shadow-sm text-xs font-medium">
                                    <Trash2 size={14} /> {selectedDong} 전체 삭제
                                </button>
                                <button onClick={handleDownloadTemplate} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 shadow-sm text-xs font-medium">
                                    <Download size={14} /> 양식 다운로드
                                </button>
                                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls" className="hidden" />
                                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 shadow-sm text-xs font-medium">
                                    <UploadCloud size={14} /> Excel Upload (Shop)
                                </button>
                            </div>
                        )}

                        <SheetSync
                            projectId={currentProject.id}
                            dataSource="Shop"
                            materials={materials}
                            canEdit={canEdit}
                            buildUpload={buildUpload}
                            onApply={(entries, sync) => onBatchAddMaterials(entries, 'sync', sync)}
                        />

                        <div className="mb-6"><CouplerSummaryTable items={dongMaterials} title={`${selectedDong} 커플러 (실행 / SHOP 비교)`} /></div>

                        {canEdit && renderInputControls('shop')}

                         <div className="space-y-4">
                            {displayFloorList.map(floor => {
                                const fm = dongMaterials.filter(m => m.floor === floor && m.dataSource === 'Shop');
                                const totalWeight = fm.reduce((a,c)=>a+c.shopWeight,0);
                                const couplerEa = fm.filter(isCoupler).reduce((a,c)=>a+c.shopQuantity,0);
                                const isExpanded = expandedFloors.has(floor);

                                return (
                                    <div key={floor} className="bg-white rounded-lg border border-blue-100 overflow-hidden shadow-sm">
                                        {/* Header */}
                                        <div 
                                            onClick={() => toggleFloor(floor)}
                                            className="px-4 py-3 bg-blue-50/50 border-b border-blue-100 flex justify-between items-center cursor-pointer hover:bg-blue-50 transition-colors"
                                        >
                                            <div className="flex items-center gap-3">
                                                 <div className={`w-8 h-8 rounded flex items-center justify-center text-sm font-bold ${floor.startsWith('B') ? 'bg-slate-200 text-slate-700' : 'bg-blue-600 text-white'}`}>
                                                    {floor}
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-blue-800">SHOP 물량 (Actual)</span>
                                                    <span className="text-xs text-blue-400">
                                                         {fm.length > 0 ? `${fm.length} entries` : 'No data'}
                                                    </span>
                                                </div>
                                            </div>
                                             <div className="flex items-center gap-4">
                                                <div className="text-right">
                                                     <span className="text-xs text-blue-300 uppercase font-bold block">Total Weight</span>
                                                     <span className={`text-sm font-bold ${totalWeight > 0 ? 'text-blue-700' : 'text-slate-300'}`}>
                                                        {(totalWeight/1000).toFixed(2)} t
                                                     </span>
                                                     {couplerEa > 0 && <span className="block text-[11px] font-bold text-violet-600">커플러 {Math.round(couplerEa).toLocaleString()} EA</span>}
                                                </div>
                                                {isExpanded ? <ChevronUp size={20} className="text-blue-400"/> : <ChevronDown size={20} className="text-blue-400"/>}
                                            </div>
                                        </div>

                                        {/* Content */}
                                        {isExpanded && (
                                            <div className="border-t border-blue-100">
                                                {fm.length > 0 ? (
                                                    <table className="w-full text-xs text-left">
                                                        <thead className="bg-white text-slate-500 border-b border-slate-100">
                                                            <tr>
                                                                <th className="px-4 py-2">날짜 (없으면 입력일)</th>
                                                                <th className="px-4 py-2">도면명 (Drawing/Zone)</th>
                                                                <th className="px-4 py-2 text-center">DIA</th>
                                                                <th className="px-4 py-2 text-center">GRADE</th>
                                                                <th className="px-4 py-2 text-right">Shop Weight (ton / 커플러 EA)</th>
                                                                <th className="px-4 py-2 text-center">Action</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-50">
                                                            {fm.map((item) => (
                                                                <tr key={item.id} className="hover:bg-blue-50/10">
                                                                    <td className="px-4 py-2 text-slate-500 font-mono" title={item.sourceFile ? `출처: ${sourceLabel(item.sourceFile, loadSheetLinks(currentProject.id))}` : undefined}>{item.date ?? item.lastUpdated}</td>
                                                                    <td className="px-4 py-2 font-bold text-slate-700">{item.zone}{isCoupler(item) && <span className="ml-2 px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 text-[10px] font-bold">커플러</span>}</td>
                                                                    <td className="px-4 py-2 text-center text-slate-600 font-mono">{item.diameter}</td>
                                                                    <td className="px-4 py-2 text-center text-slate-500 text-xs">{item.strength}</td>
                                                                    <td className={`px-4 py-2 text-right font-bold ${isCoupler(item) ? 'text-violet-700' : 'text-blue-700'}`}>{formatEntryAmount(item)}</td>
                                                                    <td className="px-4 py-2 text-center">
                                                                        {canEdit && (
                                                                            <button onClick={() => onDeleteMaterial(item.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={14}/></button>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                ) : (
                                                    <div className="py-6 text-center text-slate-400 flex flex-col items-center gap-2">
                                                        <span className="text-sm">등록된 SHOP 물량 이력이 없습니다.</span>
                                                        {canEdit && (
                                                            <button 
                                                                onClick={() => {
                                                                    setTargetFloor(floor);
                                                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                                                }}
                                                                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                                                            >
                                                                <Plus size={12} /> 상단 폼에서 입력하기
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Create Version Modal */}
            {pendingUpload && canEdit && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <UploadCloud size={18} className="text-blue-600" />
                                {pendingUpload.dataSource === 'Design' ? '실행 물량' : 'SHOP 물량'} 업로드 방식 선택
                            </h3>
                            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 mb-4 space-y-1">
                                <p><span className="font-bold">파일에 든 동:</span> {pendingUpload.dongs.join(', ')}</p>
                                <p><span className="font-bold">파일 물량:</span> {pendingUpload.entries.length.toLocaleString()}개 항목</p>
                                <p><span className="font-bold">이 동들의 기존 {pendingUpload.dataSource === 'Design' ? '실행' : 'SHOP'} 물량:</span> {pendingUpload.existingCount.toLocaleString()}건</p>
                            </div>
                            <div className="space-y-2">
                                <div className="rounded-lg border-2 border-blue-600 p-3 space-y-2">
                                    <button
                                        onClick={() => applyUpload(pendingUpload, 'sync', {
                                            replaceSources: syncPrev ? [syncPrev] : [],
                                            clearUntaggedDongs: clearUntagged ? pendingUpload.dongs : []
                                        })}
                                        className="w-full text-left px-4 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                                    >
                                        <span className="block font-bold text-sm">파일 기준 동기화 (누적 파일을 다시 올릴 때 추천)</span>
                                        <span className="block text-xs text-blue-100">이 파일에서 전에 올라온 물량만 새 내용으로 맞춥니다. 새 행은 추가되고, 같은 행은 중복되지 않으며, 고친 행은 바로잡힙니다. 다른 파일·시트에서 온 물량은 그대로입니다.</span>
                                    </button>
                                    <p className="text-[11px] text-slate-600">
                                        출처: <b>{sourceLabel(pendingUpload.source)}</b>
                                        {pendingUpload.sourceCounts.find(c => c.key === pendingUpload.source)
                                            ? ` · 이전에 올린 ${pendingUpload.sourceCounts.find(c => c.key === pendingUpload.source)!.count}건을 새 내용으로 바꿉니다`
                                            : ' · 처음 올리는 파일입니다'}
                                    </p>
                                    {pendingUpload.sourceCounts.some(c => c.key !== pendingUpload.source) && (
                                        <label className="block text-[11px] text-slate-600">
                                            이름이 바뀐 갱신본이면 이전 파일도 함께 바꾸기:
                                            <select value={syncPrev} onChange={e => setSyncPrev(e.target.value)} className="mt-1 w-full px-2 py-1 border border-slate-300 rounded text-xs">
                                                <option value="">(없음)</option>
                                                {pendingUpload.sourceCounts.filter(c => c.key !== pendingUpload.source).map(c => (
                                                    <option key={c.key} value={c.key}>{sourceLabel(c.key, loadSheetLinks(currentProject.id))} · {c.count}건</option>
                                                ))}
                                            </select>
                                        </label>
                                    )}
                                    {pendingUpload.untaggedCount > 0 && (
                                        <label className="flex items-start gap-1.5 text-[11px] text-slate-600">
                                            <input type="checkbox" checked={clearUntagged} onChange={e => setClearUntagged(e.target.checked)} className="mt-0.5" />
                                            <span>출처 기록이 없는 예전 업로드 물량 {pendingUpload.untaggedCount.toLocaleString()}건({pendingUpload.dongs.join(', ')})도 지우기. 같은 내용을 예전 방식으로 올렸다면 켜야 중복되지 않습니다.</span>
                                        </label>
                                    )}
                                </div>
                                <button
                                    onClick={() => applyUpload(pendingUpload, 'replace')}
                                    className="w-full text-left px-4 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                                >
                                    <span className="block font-bold text-sm">교체</span>
                                    <span className="block text-xs text-blue-100">위 동들의 기존 {pendingUpload.dataSource === 'Design' ? '실행' : 'SHOP'} 물량을 모두 지우고 파일 내용으로 새로 채웁니다. 커플러 구분 등 이전 데이터를 바로잡을 때 사용하세요.</span>
                                    {pendingUpload.dataSource === 'Design' && (
                                        <span className="block text-xs text-amber-200 mt-1">버전별(Rev) 물량 기록도 함께 지워집니다.</span>
                                    )}
                                </button>
                                <button
                                    onClick={() => applyUpload(pendingUpload, 'add')}
                                    className="w-full text-left px-4 py-3 rounded-lg border border-emerald-300 text-slate-700 hover:bg-emerald-50"
                                >
                                    <span className="block font-bold text-sm text-emerald-700">추가</span>
                                    <span className="block text-xs text-slate-500">기존 물량은 그대로 두고 파일 물량을 더합니다. 같은 동/층/Zone/직경/강종은 기존 값에 합산됩니다. 새로 나온 물량만 담은 파일을 올릴 때 사용하세요. 같은 파일을 두 번 올리면 두 번 더해집니다.</span>
                                </button>
                                <button
                                    onClick={() => applyUpload(pendingUpload, 'overwrite')}
                                    className="w-full text-left px-4 py-3 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                                >
                                    <span className="block font-bold text-sm">덮어쓰기</span>
                                    <span className="block text-xs text-slate-500">같은 동/층/Zone/직경/강종 물량만 새 값으로 바꾸고, 파일에 없는 기존 물량은 그대로 둡니다.</span>
                                </button>
                            </div>
                            <div className="flex justify-end mt-4">
                                <button onClick={() => setPendingUpload(null)} className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-sm">
                                    취소 (반영하지 않음)
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isCreateVerOpen && canEdit && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-slate-800 mb-4">Create New Version</h3>
                            <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded text-xs font-bold mb-4">
                                Target Building: {selectedDong}
                            </div>
                            <p className="text-sm text-slate-500 mb-4">
                                Current planned quantities for <span className="font-bold">{selectedDong}</span> will be saved as a snapshot.
                            </p>
                            
                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Version Name</label>
                                    <input 
                                        type="text" 
                                        autoFocus
                                        value={newVersionName}
                                        onChange={e => setNewVersionName(e.target.value)}
                                        className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="e.g. Rev.1 (Foundation Change)"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Revision Date (도면 날짜)</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                                        <input 
                                            type="date" 
                                            value={newVersionDate}
                                            onChange={e => setNewVersionDate(e.target.value)}
                                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2 justify-end">
                                <button 
                                    onClick={() => setIsCreateVerOpen(false)} 
                                    className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-lg text-sm"
                                >
                                    Cancel
                                </button>
                                <button 
                                    onClick={() => {
                                        if(newVersionName && newVersionDate) {
                                            onCreateVersion(currentProject.id, newVersionName, newVersionDate, selectedDong);
                                            setNewVersionName('');
                                            setNewVersionDate(new Date().toISOString().split('T')[0]);
                                            setIsCreateVerOpen(false);
                                        } else {
                                            alert('버전 이름과 날짜를 모두 입력해주세요.');
                                        }
                                    }}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                                >
                                    Create Version
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Compare Version Modal */}
            {isCompareVerOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <ArrowRightLeft className="text-blue-500" /> Version Comparison ({selectedDong})
                            </h3>
                            <button onClick={() => setIsCompareVerOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
                        </div>
                        
                        <div className="p-6 bg-slate-50 border-b border-slate-100 flex gap-4 items-center justify-center">
                            <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col gap-1 w-48">
                                <span className="text-xs font-bold text-slate-400 uppercase">Base Version</span>
                                <select 
                                    value={baseVersion} 
                                    onChange={e => setBaseVersion(e.target.value)}
                                    className="font-bold text-slate-700 outline-none"
                                >
                                    {dongVersions.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                                </select>
                            </div>
                            <div className="text-slate-300"><ArrowRightLeft size={20} /></div>
                            <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-col gap-1 w-48">
                                <span className="text-xs font-bold text-blue-400 uppercase">Target Version</span>
                                <select 
                                    value={targetVersion} 
                                    onChange={e => setTargetVersion(e.target.value)}
                                    className="font-bold text-blue-600 outline-none"
                                >
                                    {dongVersions.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">
                             <div className="grid grid-cols-3 gap-4 mb-6">
                                <div className="bg-slate-100 p-4 rounded-lg text-center">
                                    <div className="text-xs text-slate-500 mb-1">Base Total</div>
                                    <div className="text-lg font-bold text-slate-700">{(totalBase/1000).toFixed(2)} t</div>
                                </div>
                                <div className="bg-blue-50 p-4 rounded-lg text-center">
                                    <div className="text-xs text-blue-500 mb-1">Target Total</div>
                                    <div className="text-lg font-bold text-blue-700">{(totalTarget/1000).toFixed(2)} t</div>
                                </div>
                                <div className="bg-white border border-slate-200 p-4 rounded-lg text-center">
                                    <div className="text-xs text-slate-400 mb-1">Difference</div>
                                    <div className={`text-lg font-bold ${totalTarget - totalBase > 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                        {totalTarget - totalBase > 0 ? '+' : ''}{((totalTarget - totalBase)/1000).toFixed(2)} t
                                    </div>
                                </div>
                            </div>

                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 font-medium sticky top-0">
                                    <tr>
                                        <th className="px-4 py-3">Floor</th>
                                        <th className="px-4 py-3">Diameter</th>
                                        <th className="px-4 py-3 text-right">Base (kg)</th>
                                        <th className="px-4 py-3 text-right">Target (kg)</th>
                                        <th className="px-4 py-3 text-right">Delta (kg)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {diffRows.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 font-medium text-slate-800">{row.floor}</td>
                                            <td className="px-4 py-3 font-mono text-slate-600">{row.diameter}</td>
                                            <td className="px-4 py-3 text-right text-slate-500">{row.base.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right text-blue-600 font-medium">{row.target.toLocaleString()}</td>
                                            <td className={`px-4 py-3 text-right font-bold ${row.target - row.base > 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                                {row.target - row.base > 0 ? '+' : ''}{(row.target - row.base).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                    {diffRows.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="text-center py-10 text-slate-400">
                                                No differences found between these versions for {selectedDong}.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
