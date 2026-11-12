
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ConcreteEntry, Project, User } from '../types';
import { Plus, Trash2, Calculator, FileSpreadsheet, UploadCloud, Building, ChevronDown, ChevronUp, Component, Droplets, HardHat, Download, BarChart3 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { normalizeConcreteType } from '../utils/concreteModel';

interface ConcreteInputProps {
    currentProject: Project;
    user: User;
    concretes: ConcreteEntry[];
    onAddConcrete: (concrete: ConcreteEntry) => void;
    onBatchAddConcrete: (concretes: ConcreteEntry[]) => void;
    onDeleteConcrete: (id: string) => void;
    defaultTab?: 'overview' | 'design' | 'construction';
}

// 1. 표준 부재 목록 정의 (Standard Concrete Types)
const STANDARD_CONCRETE_TYPES = ['피트', '기초', '슬래브', '기둥', '보', '벽', '계단'];

// Data Aggregation Helper
const aggregateByStrength = (items: ConcreteEntry[]) => {
    const map = new Map<string, { strength: string, type: string, planned: number, construction: number }>();
    
    items.forEach(item => {
        // Handle empty type for grouping key (display as (미지정))
        const safeType = item.type || '(미지정)';
        const key = `${item.strength}-${safeType}`;
        
        if (!map.has(key)) {
            map.set(key, { strength: item.strength, type: safeType, planned: 0, construction: 0 });
        }
        const current = map.get(key)!;
        current.planned += item.plannedVolume;
        current.construction += item.constructionVolume;
    });

    return Array.from(map.values())
        .sort((a, b) => {
            const strCompare = a.strength.localeCompare(b.strength);
            if (strCompare !== 0) return strCompare;
            return a.type.localeCompare(b.type);
        })
        .map((data) => ({
            strength: data.strength,
            type: data.type,
            planned: data.planned,
            construction: data.construction,
            delta: data.construction - data.planned,
            progress: data.planned > 0 ? (data.construction / data.planned) * 100 : 0
        }));
};

// Summary Table Component
const ConcreteSummaryTable: React.FC<{ data: ReturnType<typeof aggregateByStrength>, title: string }> = ({ data, title }) => {
    if (data.length === 0) return <div className="p-4 text-center text-slate-400 italic bg-slate-50 rounded-lg border border-slate-100">데이터가 없습니다.</div>;
    const totalPlanned = data.reduce((acc, curr) => acc + curr.planned, 0);
    const totalConstruction = data.reduce((acc, curr) => acc + curr.construction, 0);
    const totalDelta = totalConstruction - totalPlanned;

    return (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h4 className="font-bold text-slate-700 flex items-center gap-2 text-sm"><Calculator size={16} /> {title}</h4>
                <div className="text-sm font-mono">Total Delta: <span className={totalDelta > 0 ? 'text-red-500 font-bold' : totalDelta < 0 ? 'text-blue-500 font-bold' : 'text-slate-500'}>{totalDelta > 0 ? '+' : ''}{totalDelta.toFixed(2)} m³</span></div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                        <tr>
                            <th className="px-4 py-2 text-left">Strength (MPa)</th>
                            <th className="px-4 py-2 text-center">Type</th>
                            <th className="px-4 py-2 text-slate-600">실행물량 (m³)</th>
                            <th className="px-4 py-2 text-blue-600">시공물량 (m³)</th>
                            <th className="px-4 py-2">차이 (m³)</th>
                            <th className="px-4 py-2 text-center">진행률</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {data.map((row) => (
                            <tr key={`${row.strength}-${row.type}`} className="hover:bg-slate-50">
                                <td className="px-4 py-3 text-left font-bold text-slate-700">{row.strength}</td>
                                <td className="px-4 py-3 text-center text-slate-500 text-xs">{row.type}</td>
                                <td className="px-4 py-3 text-slate-600 font-medium">{row.planned.toFixed(2)}</td>
                                <td className="px-4 py-3 text-blue-700 font-bold bg-blue-50/10">{row.construction.toFixed(2)}</td>
                                <td className={`px-4 py-3 font-bold ${row.delta > 0 ? 'text-red-500' : row.delta < 0 ? 'text-blue-500' : 'text-slate-300'}`}>{row.delta > 0 ? '+' : ''}{row.delta.toFixed(2)}</td>
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
                            <td className="px-4 py-3">{totalPlanned.toFixed(2)}</td>
                            <td className="px-4 py-3 text-blue-700">{totalConstruction.toFixed(2)}</td>
                            <td className={`px-4 py-3 ${totalDelta > 0 ? 'text-red-600' : totalDelta < 0 ? 'text-blue-600' : 'text-slate-400'}`}>{totalDelta > 0 ? '+' : ''}{totalDelta.toFixed(2)}</td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export const ConcreteInput: React.FC<ConcreteInputProps> = ({ 
    currentProject, user, concretes, 
    onAddConcrete, onBatchAddConcrete, onDeleteConcrete,
    defaultTab = 'overview'
}) => {
    // Permissions
    const userRole = currentProject.members.find(m => m.userId === user.email)?.role || 'Guest';
    const canEdit = userRole === 'Admin' || userRole === 'Participant';

    const [selectedDong, setSelectedDong] = useState<string>('');
    const [activeTab, setActiveTab] = useState<'overview' | 'design' | 'construction'>(defaultTab);
    const [expandedFloors, setExpandedFloors] = useState<Set<string>>(new Set());
    
    useEffect(() => {
        setActiveTab(defaultTab);
    }, [defaultTab]);

    useEffect(() => {
        if (currentProject.buildings.length > 0 && !selectedDong) {
            setSelectedDong(currentProject.buildings[0].name);
        } else if (currentProject.buildings.length > 0 && !currentProject.buildings.find(b => b.name === selectedDong)) {
            setSelectedDong(currentProject.buildings[0].name);
        }
    }, [currentProject, selectedDong]);

    const currentBuildingConfig = useMemo(() => 
        currentProject.buildings.find(b => b.name === selectedDong), 
    [currentProject, selectedDong]);

    const dongConcretes = useMemo(() => 
        concretes.filter(c => c.projectId === currentProject.id && c.dong === selectedDong), 
    [concretes, currentProject.id, selectedDong]);

    const displayFloorList = useMemo(() => {
        const floorSet = new Set<string>();
        if (currentBuildingConfig) {
            for (let i = currentBuildingConfig.basementFloors; i >= 1; i--) floorSet.add(`B${i}`);
            for (let i = 1; i <= currentBuildingConfig.groundFloors; i++) floorSet.add(`${i}F`);
        }
        dongConcretes.forEach(c => floorSet.add(c.floor));
        return Array.from(floorSet).sort((a, b) => {
            const getVal = (s: string) => {
                if (s.startsWith('B')) return -parseInt(s.replace(/[^0-9]/g, ''));
                if (s.endsWith('F')) return parseInt(s.replace(/[^0-9]/g, ''));
                return 9999;
            };
            return getVal(a) - getVal(b); 
        });
    }, [currentBuildingConfig, dongConcretes]);

    const designSummary = useMemo(() => {
        const entries = dongConcretes.filter(c => c.dataSource === 'Design');
        const volume = entries.reduce((acc, c) => acc + c.plannedVolume, 0);
        return { count: entries.length, volume };
    }, [dongConcretes]);

    const constructionSummary = useMemo(() => {
        const entries = dongConcretes.filter(c => c.dataSource === 'Construction');
        const volume = entries.reduce((acc, c) => acc + c.constructionVolume, 0);
        return { count: entries.length, volume };
    }, [dongConcretes]);

    const totalProgress = designSummary.volume > 0 ? (constructionSummary.volume / designSummary.volume) * 100 : 0;

    // Input States
    const [targetFloor, setTargetFloor] = useState(displayFloorList[0] || '1F');
    const [zone, setZone] = useState('');
    const [strength, setStrength] = useState('240');
    const [type, setType] = useState(''); // Default empty string
    const [manualVolume, setManualVolume] = useState<number>(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (displayFloorList.length > 0 && !displayFloorList.includes(targetFloor)) {
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
        if (manualVolume <= 0) {
            alert('유효한 물량(Volume)을 입력해주세요.');
            return;
        }

        const dataSource = activeTab === 'design' ? 'Design' : 'Construction';
        const currentZone = zone.trim() || 'Default';

        const newEntry: ConcreteEntry = {
            id: Math.random().toString(36).substr(2, 9),
            projectId: currentProject.id,
            dong: selectedDong,
            floor: targetFloor,
            zone: currentZone,
            strength,
            type: type, // Can be empty
            dataSource,
            plannedVolume: dataSource === 'Design' ? manualVolume : 0,
            constructionVolume: dataSource === 'Construction' ? manualVolume : 0,
            lastUpdated: new Date().toLocaleDateString()
        };

        onAddConcrete(newEntry);
        setManualVolume(0);
        setZone('');
        setExpandedFloors(prev => new Set(prev).add(targetFloor));
        alert(`${dataSource === 'Design' ? '실행 물량' : '시공 물량'}이 추가되었습니다.`);
    };

    const handleDownloadTemplate = () => {
        // Headers matching the logic in processExcelData
        const headers = ['동', '층', '타설부위(Zone)', '규격(강도)', '부재(Type)', '타설량(m3)'];
        const sampleRow = [selectedDong || '101동', '1F', '1구간 슬래브', '240', '슬래브', 150.5];
        
        const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow]);
        
        // Enhance column width
        ws['!cols'] = [
            { wch: 10 }, // 동
            { wch: 8 },  // 층
            { wch: 20 }, // 타설부위
            { wch: 12 }, // 규격
            { wch: 12 }, // 부재
            { wch: 12 }  // 타설량
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "시공물량_입력양식");
        XLSX.writeFile(wb, `콘크리트_시공물량_양식_${new Date().toISOString().slice(0,10)}.xlsx`);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!canEdit) return;
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const bstr = event.target?.result;
            const wb = XLSX.read(bstr, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data = XLSX.utils.sheet_to_json(ws);
            processExcelData(data);
            if (fileInputRef.current) fileInputRef.current.value = '';
        };
        reader.readAsBinaryString(file);
    };

    const processExcelData = (data: any[]) => {
        let processedCount = 0;
        const affectedFloors = new Set<string>();
        const isDesignMode = activeTab === 'design';
        const dataSource = isDesignMode ? 'Design' : 'Construction';

        const config = {
            floor: ['층번호', '층', 'Floor'],
            zone: isDesignMode ? ['시공존', '부위', '부위명', 'Zone'] : ['도면명', '타설부위', 'Zone', 'Mark'],
            volume: ['값', '물량', '타설량', '실행물량', 'Volume', 'm3'],
            strength: ['Conc_강도', '강도', 'Strength', '규격'],
            type: ['부재', '타입', 'Type', '종류'],
            dong: ['동', 'Dong']
        };

        // Aggregation Map to merge duplicates within Excel file
        // Key: Dong|Floor|Zone|Strength|Type
        const aggregationMap = new Map<string, ConcreteEntry>();

        data.forEach((row: any) => {
            const getValue = (keywords: string[]) => {
                const rowKeys = Object.keys(row);
                for (const keyword of keywords) {
                    const match = rowKeys.find(k => k.trim().toLowerCase() === keyword.toLowerCase());
                    if (match && row[match] !== undefined) return row[match];
                }
                return null;
            };

            let dongStr = getValue(config.dong);
            if (!dongStr && selectedDong) dongStr = selectedDong;

            const floorRaw = getValue(config.floor);
            let floor = '';
            if (floorRaw !== null) {
                const fStr = String(floorRaw).trim().toUpperCase();
                const numVal = parseInt(fStr);
                if (!isNaN(numVal) && String(numVal) === fStr) {
                    floor = numVal < 0 ? `B${Math.abs(numVal)}` : `${numVal}F`;
                } else {
                    const numbers = fStr.replace(/[^0-9]/g, '');
                    floor = (fStr.includes('B') || fStr.includes('-')) ? `B${numbers}` : `${numbers}F`;
                }
            }

            const zone = getValue(config.zone) || 'Default';
            const strengthVal = getValue(config.strength) || '240';
            const rawType = getValue(config.type);
            
            // Normalize Type using strict rules
            const cleanType = normalizeConcreteType(String(rawType || ''));
            
            const rawVol = getValue(config.volume);
            let volVal = 0;
            if (rawVol !== null) {
                volVal = parseFloat(String(rawVol).replace(/,/g, '').trim());
            }

            if (floor && volVal > 0) {
                const cleanDong = String(dongStr);
                const cleanFloor = String(floor);
                const cleanZone = String(zone);
                const cleanStrength = String(strengthVal);

                const key = `${cleanDong}|${cleanFloor}|${cleanZone}|${cleanStrength}|${cleanType}`;

                if (aggregationMap.has(key)) {
                    const existing = aggregationMap.get(key)!;
                    if (isDesignMode) existing.plannedVolume += volVal;
                    else existing.constructionVolume += volVal;
                    
                    // Rounding
                    if (isDesignMode) existing.plannedVolume = Math.round(existing.plannedVolume * 100) / 100;
                    else existing.constructionVolume = Math.round(existing.constructionVolume * 100) / 100;
                } else {
                    aggregationMap.set(key, {
                        id: Math.random().toString(36).substr(2, 9),
                        projectId: currentProject.id,
                        dong: cleanDong,
                        floor: cleanFloor,
                        zone: cleanZone,
                        strength: cleanStrength,
                        type: cleanType,
                        dataSource,
                        plannedVolume: isDesignMode ? volVal : 0,
                        constructionVolume: !isDesignMode ? volVal : 0,
                        lastUpdated: new Date().toLocaleDateString()
                    });
                }

                processedCount++;
                if (cleanDong === selectedDong) affectedFloors.add(cleanFloor);
            }
        });

        const newEntries = Array.from(aggregationMap.values());

        if (newEntries.length > 0) {
            onBatchAddConcrete(newEntries);
            setExpandedFloors(prev => {
                const next = new Set(prev);
                affectedFloors.forEach(f => next.add(f));
                return next;
            });
            alert(`[${dataSource} 모드] 처리 완료! 총 ${processedCount}행이 ${newEntries.length}개 항목으로 집계되었습니다.\n(부재명 자동 매핑 적용됨)`);
        } else {
            alert('유효한 데이터를 찾지 못했습니다. 엑셀 컬럼명(층, 강도, 물량/m3)을 확인해주세요.');
        }
    };

    const toggleFloor = (floor: string) => {
        setExpandedFloors(prev => {
            const next = new Set(prev);
            if (next.has(floor)) next.delete(floor);
            else next.add(floor);
            return next;
        });
    };

    const renderInputControls = (mode: 'design' | 'construction') => (
        <div className="flex-none bg-white p-5 rounded-xl shadow-sm border border-slate-100 mb-6 animate-in slide-in-from-top-2">
            <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                <Droplets size={16} className={mode === 'design' ? 'text-slate-500' : 'text-blue-500'} />
                {mode === 'design' ? '실행 물량 수기 입력' : '시공 물량 수기 입력'}
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 items-end p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="col-span-2 md:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">FLOOR</label>
                    <select value={targetFloor} onChange={e => setTargetFloor(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm font-bold text-slate-800">
                        {displayFloorList.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                </div>
                <div className="col-span-2 md:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Zone</label>
                    <input type="text" value={zone} onChange={e => setZone(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm" placeholder="Slab 1" />
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-500 mb-1">Strength</label>
                    <select value={strength} onChange={e => setStrength(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm">
                        {['18', '21', '24', '27', '30', '35', '40', '45', '50', '60'].map(s => <option key={s} value={s}>{s} MPa</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-500 mb-1">Type</label>
                    <select value={type} onChange={e => setType(e.target.value)} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm">
                        <option value="">(부재 미지정)</option>
                        {STANDARD_CONCRETE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Volume (m³)</label>
                    <input type="number" value={manualVolume} onChange={e => setManualVolume(Number(e.target.value))} className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm" placeholder="0" />
                </div>
                <button onClick={handleAdd} className={`col-span-2 md:col-span-1 text-white py-1.5 px-3 rounded text-sm font-medium shadow-sm transition-all ${mode === 'design' ? 'bg-slate-700 hover:bg-slate-800' : 'bg-blue-600 hover:bg-blue-700'}`}>
                    <Plus size={14} className="inline mr-1" /> 추가
                </button>
            </div>
        </div>
    );

    const headerContent = {
        overview: { title: '콘크리트 종합 현황', color: 'text-slate-800' },
        design: { title: '실행 물량 (Design)', color: 'text-slate-800' },
        construction: { title: '시공 물량 (Construction)', color: 'text-blue-600' }
    }[activeTab];

    if (currentProject.buildings.length === 0) return <div className="p-8 text-center text-slate-400">동 설정이 필요합니다.</div>;

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex-none flex justify-between items-start">
                <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg bg-white border border-slate-200 shadow-sm`}>
                        <Component size={24} className={headerContent.color} />
                    </div>
                    <div>
                        <h2 className={`text-2xl font-bold ${headerContent.color}`}>{headerContent.title}</h2>
                        <div className="flex items-center gap-2 mt-1">
                            <span className="text-slate-500 text-sm">Concrete Management</span>
                            <span className="text-slate-300">|</span>
                            <span className="text-blue-600 font-semibold text-sm">{currentProject.name}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Building Tabs */}
            <div className="flex-none border-b border-slate-200 overflow-x-auto pb-1 flex gap-1">
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

            <div className="flex-1 overflow-y-auto">
                {/* OVERVIEW */}
                {activeTab === 'overview' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
                            <div>
                                <p className="text-xs text-slate-400 uppercase font-bold mb-1">Building Total</p>
                                <p className="text-lg font-bold text-slate-800">{selectedDong}</p>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 text-slate-500 text-sm font-medium mb-1">
                                    <span className="w-2 h-2 bg-slate-300 rounded-full"></span> Total Planned
                                </div>
                                <p className="text-2xl font-bold text-slate-700">{designSummary.volume.toFixed(2)} <span className="text-sm text-slate-400 font-normal">m³</span></p>
                            </div>
                            <div>
                                <div className="flex items-center gap-2 text-slate-500 text-sm font-medium mb-1">
                                    <span className="w-2 h-2 bg-blue-500 rounded-full"></span> Total Construction
                                </div>
                                <p className="text-2xl font-bold text-blue-600">{constructionSummary.volume.toFixed(2)} <span className="text-sm text-slate-400 font-normal">m³</span></p>
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
                        
                        <ConcreteSummaryTable data={aggregateByStrength(dongConcretes)} title={`${selectedDong} 강도별 집계`} />

                        {/* Floor Progress List */}
                        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-slate-700 text-sm">층별 타설 진행 현황 (Floor Progress)</div>
                            <div className="divide-y divide-slate-100">
                                {displayFloorList.map(floor => {
                                    const fm = dongConcretes.filter(c => c.floor === floor);
                                    const fp = fm.reduce((acc, c) => acc + c.plannedVolume, 0); // Planned
                                    const fc = fm.reduce((acc, c) => acc + c.constructionVolume, 0); // Construction
                                    const pg = fp > 0 ? (fc / fp) * 100 : 0;

                                    // Skip if no data
                                    if (fp === 0 && fc === 0) return null;

                                    return (
                                        <div key={floor} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50">
                                            <div className="flex items-center gap-4 w-1/3">
                                                <div className={`w-8 h-8 rounded flex items-center justify-center text-sm font-bold ${floor.startsWith('B') ? 'bg-slate-200 text-slate-700' : 'bg-slate-700 text-white'}`}>
                                                    {floor}
                                                </div>
                                                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className={`h-full ${pg > 100 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(pg, 100)}%` }}></div>
                                                </div>
                                            </div>
                                            <div className="text-sm font-medium text-slate-600">{pg.toFixed(1)}%</div>
                                            <div className="flex gap-6 text-xs w-1/3 justify-end">
                                                <div><span className="text-slate-400">P:</span> {fp.toFixed(1)}m³</div>
                                                <div><span className="text-slate-400">C:</span> <span className="font-bold text-blue-600">{fc.toFixed(1)}m³</span></div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {/* DESIGN & CONSTRUCTION TABS */}
                {(activeTab === 'design' || activeTab === 'construction') && (
                    <div className="animate-in slide-in-from-right-4 duration-300">
                        {/* Summary Card */}
                        <div className={`bg-white rounded-xl p-6 border shadow-sm mb-6 flex items-center justify-between ${activeTab === 'design' ? 'border-slate-200' : 'border-blue-200'}`}>
                            <div>
                                <p className={`text-sm font-bold mb-1 flex items-center gap-2 ${activeTab === 'design' ? 'text-slate-500' : 'text-blue-500'}`}>
                                    {activeTab === 'design' ? <Component size={16} /> : <HardHat size={16} />} 
                                    {selectedDong} {activeTab === 'design' ? '실행 물량 총계 (Total Design)' : '시공 물량 총계 (Total Construction)'}
                                </p>
                                <div className="flex items-baseline gap-2">
                                    <h3 className={`text-3xl font-bold ${activeTab === 'design' ? 'text-slate-800' : 'text-blue-700'}`}>
                                        {(activeTab === 'design' ? designSummary.volume : constructionSummary.volume).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                    </h3>
                                    <span className={`${activeTab === 'design' ? 'text-slate-500' : 'text-blue-500'} font-medium`}>m³</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className={`${activeTab === 'design' ? 'bg-slate-100 border-slate-100' : 'bg-blue-50 border-blue-100'} px-4 py-2 rounded-lg border`}>
                                    <p className={`text-xs font-bold uppercase mb-1 ${activeTab === 'design' ? 'text-slate-500' : 'text-blue-500'}`}>Entries</p>
                                    <p className={`text-xl font-bold ${activeTab === 'design' ? 'text-slate-700' : 'text-blue-700'}`}>
                                        {activeTab === 'design' ? designSummary.count : constructionSummary.count}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {canEdit && (
                            <div className="flex justify-end gap-2 mb-4">
                                {activeTab === 'construction' && (
                                    <button onClick={handleDownloadTemplate} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 shadow-sm text-xs font-medium">
                                        <Download size={14} /> 양식 다운로드
                                    </button>
                                )}
                                <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx, .xls" className="hidden" />
                                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 shadow-sm text-xs font-medium">
                                    <UploadCloud size={14} /> Excel Upload
                                </button>
                            </div>
                        )}
                        {canEdit && renderInputControls(activeTab)}

                        <div className="space-y-4">
                            {displayFloorList.map(floor => {
                                const mode = activeTab === 'design' ? 'Design' : 'Construction';
                                const fm = dongConcretes.filter(c => c.floor === floor && c.dataSource === mode);
                                const totalVol = fm.reduce((a, c) => a + (mode === 'Design' ? c.plannedVolume : c.constructionVolume), 0);
                                const isExpanded = expandedFloors.has(floor);

                                return (
                                    <div key={floor} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                        <div 
                                            onClick={() => toggleFloor(floor)}
                                            className={`px-4 py-3 border-b border-slate-200 flex justify-between items-center cursor-pointer hover:bg-slate-50 ${mode === 'Design' ? 'bg-slate-50' : 'bg-blue-50/50'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded flex items-center justify-center text-sm font-bold ${floor.startsWith('B') ? 'bg-slate-200 text-slate-700' : 'bg-slate-700 text-white'}`}>
                                                    {floor}
                                                </div>
                                                <span className="text-sm font-bold text-slate-700">{mode === 'Design' ? '실행 물량' : '시공 물량'} ({fm.length})</span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-sm font-bold text-slate-800">{totalVol.toFixed(2)} m³</span>
                                                {isExpanded ? <ChevronUp size={20} className="text-slate-400"/> : <ChevronDown size={20} className="text-slate-400"/>}
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className="border-t border-slate-100">
                                                {fm.length > 0 ? (
                                                    <table className="w-full text-xs text-left">
                                                        <thead className="bg-white text-slate-500 border-b border-slate-100">
                                                            <tr>
                                                                <th className="px-4 py-2">Zone</th>
                                                                <th className="px-4 py-2 text-center">Strength</th>
                                                                <th className="px-4 py-2 text-center">Type</th>
                                                                <th className="px-4 py-2 text-right">Volume (m³)</th>
                                                                <th className="px-4 py-2 text-center">Action</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-50">
                                                            {fm.map((item) => (
                                                                <tr key={item.id} className="hover:bg-slate-50">
                                                                    <td className="px-4 py-2 font-medium text-slate-700">{item.zone}</td>
                                                                    <td className="px-4 py-2 text-center text-slate-600">{item.strength}</td>
                                                                    <td className="px-4 py-2 text-center text-slate-500">{item.type || '-'}</td>
                                                                    <td className="px-4 py-2 text-right text-blue-700 font-bold">
                                                                        {mode === 'Design' ? item.plannedVolume.toFixed(2) : item.constructionVolume.toFixed(2)}
                                                                    </td>
                                                                    <td className="px-4 py-2 text-center">
                                                                        {canEdit && (
                                                                            <button onClick={() => onDeleteConcrete(item.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={14}/></button>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                ) : <div className="py-4 text-center text-slate-400 text-xs">데이터 없음</div>}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
