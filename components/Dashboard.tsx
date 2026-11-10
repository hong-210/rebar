
import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { MaterialEntry, Project, RebarDiameter } from '../types';
import { copyText } from '../utils/clipboard';
import { TrendingUp, Package, Share2, AlertCircle, ArrowRight, Building, CalendarClock, Timer, Layers, CircleDot, BarChart3, Key, Copy, X, Shield, Link as LinkIcon, Check, FileDown } from 'lucide-react';
import * as XLSX from 'xlsx';

interface DashboardProps {
    currentProject: Project;
    materials: MaterialEntry[];
}

const COLORS_PLANNED = '#94a3b8'; // Slate 400
const COLORS_SHOP = '#3b82f6';    // Blue 500

export const Dashboard: React.FC<DashboardProps> = ({ currentProject, materials }) => {
    const [chartView, setChartView] = useState<'building' | 'floor' | 'diameter'>('building');
    const [showInviteModal, setShowInviteModal] = useState(false);

    // Filter materials for current project only
    const projectMaterials = materials.filter(m => m.projectId === currentProject.id);

    // Calculate totals
    const totalPlannedWeight = projectMaterials.reduce((acc, curr) => acc + curr.plannedWeight, 0);
    const totalShopWeight = projectMaterials.reduce((acc, curr) => acc + curr.shopWeight, 0);
    
    // Material Progress calculation
    const weightProgress = totalPlannedWeight > 0 ? (totalShopWeight / totalPlannedWeight) * 100 : 0;

    // Time Progress Calculation
    let timeProgress = 0;
    let timeElapsedDays = 0;
    let totalDays = 0;

    if (currentProject.startDate && currentProject.endDate) {
        const start = new Date(currentProject.startDate).getTime();
        const end = new Date(currentProject.endDate).getTime();
        const now = new Date().getTime();
        
        totalDays = Math.max(1, (end - start) / (1000 * 60 * 60 * 24));
        timeElapsedDays = Math.max(0, (now - start) / (1000 * 60 * 60 * 24));
        
        if (now > end) timeProgress = 100;
        else if (now < start) timeProgress = 0;
        else timeProgress = (timeElapsedDays / totalDays) * 100;
    }

    // --- Prepare Chart Data ---

    // 1. By Floor
    const floorDataMap = projectMaterials.reduce((acc, curr) => {
        const key = curr.floor;
        if (!acc[key]) acc[key] = { name: key, planned: 0, shop: 0 };
        acc[key].planned += curr.plannedWeight;
        acc[key].shop += curr.shopWeight;
        return acc;
    }, {} as Record<string, { name: string, planned: number, shop: number }>);

    const floorData = Object.values(floorDataMap)
        .map((item: { name: string, planned: number, shop: number }) => ({
            name: item.name,
            Planned: Math.round(item.planned / 1000 * 100) / 100, // Tons
            Shop: Math.round(item.shop / 1000 * 100) / 100
        }))
        .sort((a, b) => {
            const getVal = (s: string) => {
                if (s.startsWith('B')) return -parseInt(s.replace('B', ''));
                return parseInt(s.replace('F', ''));
            };
            return getVal(a.name) - getVal(b.name);
        });

    // 2. By Building (Dong)
    const dongDataMap = projectMaterials.reduce((acc, curr) => {
        const key = curr.dong;
        if (!acc[key]) acc[key] = { name: key, planned: 0, shop: 0 };
        acc[key].planned += curr.plannedWeight;
        acc[key].shop += curr.shopWeight;
        return acc;
    }, {} as Record<string, { name: string, planned: number, shop: number }>);

    const dongData = Object.values(dongDataMap)
        .map((item: { name: string, planned: number, shop: number }) => ({
            name: item.name,
            Planned: Math.round(item.planned / 1000 * 100) / 100, // Tons
            Shop: Math.round(item.shop / 1000 * 100) / 100
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    // 3. By Diameter
    const diameterDataMap = projectMaterials.reduce((acc, curr) => {
        const key = curr.diameter;
        if (!acc[key]) acc[key] = { name: key, planned: 0, shop: 0 };
        acc[key].planned += curr.plannedWeight;
        acc[key].shop += curr.shopWeight;
        return acc;
    }, {} as Record<string, { name: string, planned: number, shop: number }>);

    const diameterData = Object.values(diameterDataMap)
        .map((item: { name: string, planned: number, shop: number }) => ({
            name: item.name,
            Planned: Math.round(item.planned / 1000 * 100) / 100, // Tons
            Shop: Math.round(item.shop / 1000 * 100) / 100
        }))
        .sort((a, b) => {
            const numA = parseInt(a.name.replace('D', ''));
            const numB = parseInt(b.name.replace('D', ''));
            return numA - numB;
        });

    // Determine current data based on view state
    const currentChartData = chartView === 'building' ? dongData 
                           : chartView === 'floor' ? floorData 
                           : diameterData;

    const handleCopyInvite = async () => {
        const inviteText = `[RebarMaster Pro] 프로젝트 초대장\n\n📌 프로젝트: ${currentProject.name}\n🔑 초대 코드: ${currentProject.inviteCode || 'N/A'}\n\n🔗 접속 링크: ${window.location.origin}\n\n* 위 링크로 접속하여 초대 코드를 입력하면 '참여자' 권한으로 프로젝트에 참여할 수 있습니다.`;
        if (!(await copyText(inviteText))) {
            alert(`복사하지 못했습니다. 아래 내용을 직접 복사하세요.

${inviteText}`);
            return;
        }
        alert('초대장이 클립보드에 복사되었습니다! 팀원에게 전달하세요.');
        setShowInviteModal(false);
    };

    const handleExportReport = () => {
        if (projectMaterials.length === 0) {
            alert('출력할 물량 데이터가 없습니다.');
            return;
        }

        // 1. Create Summary Data (Group by Dong + Floor + Diameter + Strength)
        const summaryMap = new Map<string, {
            dong: string, 
            floor: string, 
            diameter: string,
            strength: string,
            planned: number, 
            shop: number
        }>();

        projectMaterials.forEach(m => {
            const key = `${m.dong}|${m.floor}|${m.diameter}|${m.strength}`;
            if (!summaryMap.has(key)) {
                summaryMap.set(key, { 
                    dong: m.dong, 
                    floor: m.floor, 
                    diameter: m.diameter,
                    strength: m.strength,
                    planned: 0, 
                    shop: 0 
                });
            }
            const entry = summaryMap.get(key)!;
            if (m.dataSource === 'Design') entry.planned += m.plannedWeight;
            else entry.shop += m.shopWeight;
        });

        // Helper for floor sort
        const getFloorVal = (s: string) => {
            const clean = s.toUpperCase();
            if (clean.startsWith('B') || clean.startsWith('-')) return -parseInt(clean.replace(/[^0-9]/g, '') || '0');
            if (clean === 'PH' || clean === 'R') return 999;
            return parseInt(clean.replace(/[^0-9]/g, '') || '0');
        };

        const summaryData = Array.from(summaryMap.values())
            .sort((a, b) => {
                if (a.dong !== b.dong) return a.dong.localeCompare(b.dong, undefined, {numeric: true});
                const fA = getFloorVal(a.floor);
                const fB = getFloorVal(b.floor);
                if (fA !== fB) return fA - fB;
                if (a.diameter !== b.diameter) {
                    return parseInt(a.diameter.replace('D','')) - parseInt(b.diameter.replace('D',''));
                }
                return a.strength.localeCompare(b.strength);
            })
            .map(item => ({
                '동 (Building)': item.dong,
                '층 (Floor)': item.floor,
                '직경 (Dia)': item.diameter,
                '강종 (Grade)': item.strength,
                '실행 물량 (ton)': Number((item.planned / 1000).toFixed(3)),
                'SHOP 물량 (ton)': Number((item.shop / 1000).toFixed(3)),
                '차이 (ton)': Number(((item.shop - item.planned) / 1000).toFixed(3)),
                '진척률 (%)': item.planned > 0 ? Number(((item.shop / item.planned) * 100).toFixed(1)) : 0,
            }));

        // 2. Design Details (Filter dataSource === 'Design')
        const designData = projectMaterials
            .filter(m => m.dataSource === 'Design')
            .sort((a, b) => a.dong.localeCompare(b.dong) || getFloorVal(a.floor) - getFloorVal(b.floor))
            .map(m => ({
                '동': m.dong,
                '층': m.floor,
                'Zone (부위)': m.zone,
                '직경': m.diameter,
                '강종': m.strength,
                '중량 (ton)': Number((m.plannedWeight / 1000).toFixed(3)),
                '업데이트': m.lastUpdated
            }));

        // 3. Shop Details (Filter dataSource === 'Shop')
        const shopData = projectMaterials
            .filter(m => m.dataSource === 'Shop')
            .sort((a, b) => a.dong.localeCompare(b.dong) || getFloorVal(a.floor) - getFloorVal(b.floor))
            .map(m => ({
                '동': m.dong,
                '층': m.floor,
                '도면명 (Zone)': m.zone,
                '직경': m.diameter,
                '강종': m.strength,
                '중량 (ton)': Number((m.shopWeight / 1000).toFixed(3)),
                '업데이트': m.lastUpdated
            }));

        // 4. Create Workbook
        const wb = XLSX.utils.book_new();
        
        // Add Summary Sheet
        const wsSummary = XLSX.utils.json_to_sheet(summaryData);
        wsSummary['!cols'] = [{wch: 15}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 10}];
        XLSX.utils.book_append_sheet(wb, wsSummary, "종합 비교 집계");
        
        // Add Design Sheet
        const wsDesign = XLSX.utils.json_to_sheet(designData);
        wsDesign['!cols'] = [{wch: 15}, {wch: 10}, {wch: 20}, {wch: 10}, {wch: 10}, {wch: 15}, {wch: 15}];
        XLSX.utils.book_append_sheet(wb, wsDesign, "실행 물량 상세");

        // Add Shop Sheet
        const wsShop = XLSX.utils.json_to_sheet(shopData);
        wsShop['!cols'] = [{wch: 15}, {wch: 10}, {wch: 20}, {wch: 10}, {wch: 10}, {wch: 15}, {wch: 15}];
        XLSX.utils.book_append_sheet(wb, wsShop, "SHOP 물량 상세");

        // 5. Download
        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `${currentProject.name}_통합물량보고서_${dateStr}.xlsx`);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">대시보드 (Dashboard)</h2>
                    <p className="text-slate-500">프로젝트: <span className="font-semibold text-blue-600">{currentProject.name}</span> 현황판</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={handleExportReport}
                        className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 shadow-sm transition-colors font-medium"
                    >
                        <FileDown size={18} />
                        <span>보고서 출력</span>
                    </button>
                    <button 
                        onClick={() => setShowInviteModal(true)}
                        className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 shadow-sm transition-colors"
                    >
                        <Share2 size={18} />
                        <span>프로젝트 초대</span>
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* 1. Planned */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden">
                    <div className="absolute right-0 top-0 h-full w-1 bg-slate-300"></div>
                    <p className="text-sm text-slate-500 mb-1">원설계 물량 (Planned)</p>
                    <h3 className="text-3xl font-bold text-slate-600">{(totalPlannedWeight / 1000).toFixed(2)} <span className="text-lg font-normal text-slate-400">ton</span></h3>
                </div>
                
                {/* 2. Shop */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden">
                    <div className="absolute right-0 top-0 h-full w-1 bg-blue-500"></div>
                    <p className="text-sm text-slate-500 mb-1">샵 물량 (Shop)</p>
                    <h3 className="text-3xl font-bold text-blue-600">{(totalShopWeight / 1000).toFixed(2)} <span className="text-lg font-normal text-slate-400">ton</span></h3>
                </div>

                {/* 3. Material Progress */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-slate-500 flex items-center gap-1"><Package size={14}/> 물량 진척률</p>
                        <span className={`text-sm font-bold ${weightProgress > 100 ? 'text-red-500' : 'text-green-500'}`}>
                            {weightProgress.toFixed(1)}%
                        </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3">
                        <div 
                            className={`h-3 rounded-full transition-all duration-1000 ${weightProgress > 100 ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${Math.min(weightProgress, 100)}%` }}
                        ></div>
                    </div>
                    <p className="text-xs text-slate-400 mt-2 text-right">증감: {((totalShopWeight - totalPlannedWeight)/1000).toFixed(2)} ton</p>
                </div>

                {/* 4. Time Progress */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                     <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-slate-500 flex items-center gap-1"><Timer size={14}/> 공사 기간 진행률</p>
                        <span className="text-sm font-bold text-purple-600">
                            {timeProgress.toFixed(1)}%
                        </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3">
                        <div 
                            className="h-3 rounded-full bg-purple-500 transition-all duration-1000"
                            style={{ width: `${Math.min(timeProgress, 100)}%` }}
                        ></div>
                    </div>
                    <p className="text-xs text-slate-400 mt-2 text-right">
                        {timeElapsedDays.toFixed(0)} / {totalDays.toFixed(0)} Days
                    </p>
                </div>
            </div>

            {/* Combined Charts Area */}
            {projectMaterials.length > 0 ? (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                        <div>
                            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                                <BarChart3 size={20} className="text-slate-600"/>
                                상세 물량 비교 분석 (Detailed Analysis)
                            </h3>
                            <p className="text-sm text-slate-500">원설계 대비 샵 물량을 비교합니다.</p>
                        </div>
                        
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            <button 
                                onClick={() => setChartView('building')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                                    chartView === 'building' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <Building size={14} /> 동별
                            </button>
                            <button 
                                onClick={() => setChartView('floor')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                                    chartView === 'floor' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <Layers size={14} /> 층별
                            </button>
                            <button 
                                onClick={() => setChartView('diameter')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                                    chartView === 'diameter' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <CircleDot size={14} /> 직경별
                            </button>
                        </div>
                    </div>

                    <div className="h-[400px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={currentChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                <XAxis dataKey="name" stroke="#64748b" fontSize={12} tick={{ fill: '#475569' }} />
                                <YAxis stroke="#64748b" fontSize={12} unit=" t" />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    formatter={(value: number) => [`${value} ton`]}
                                    cursor={{ fill: '#f1f5f9' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                <Bar dataKey="Planned" name="원설계 (Design)" fill={COLORS_PLANNED} radius={[4, 4, 0, 0]} barSize={40} animationDuration={1000} />
                                <Bar dataKey="Shop" name="샵 (Actual)" fill={COLORS_SHOP} radius={[4, 4, 0, 0]} barSize={40} animationDuration={1000} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            ) : (
                <div className="bg-slate-50 rounded-xl border-2 border-dashed border-slate-200 p-12 text-center">
                    <p className="text-slate-500 mb-2">아직 등록된 물량 데이터가 없습니다.</p>
                    <p className="text-sm text-slate-400">좌측 메뉴의 '물량 관리'에서 데이터를 추가해주세요.</p>
                </div>
            )}
            
            {/* Project Detail Card */}
             <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                    <h3 className="text-lg font-semibold text-slate-800">프로젝트 상세 정보</h3>
                </div>
                <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <p className="text-xs text-slate-500 mb-1">현장 위치</p>
                        <p className="font-medium">{currentProject.location}</p>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 mb-1">동(Building) 구성</p>
                        <div className="flex items-center gap-1">
                            <Building size={14} className="text-slate-400"/>
                            <p className="font-medium">
                                {currentProject.buildings.length > 0 
                                    ? `총 ${currentProject.buildings.length}개 동` 
                                    : '설정 필요'}
                            </p>
                        </div>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 mb-1">공사 기간</p>
                        <div className="flex items-center gap-1">
                            <CalendarClock size={14} className="text-slate-400" />
                            <p className="font-medium text-sm">
                                {currentProject.startDate} ~ <br/>
                                {currentProject.endDate || '미정'}
                            </p>
                        </div>
                    </div>
                    <div>
                         <p className="text-xs text-slate-500 mb-1">초대 코드 (Invite Code)</p>
                         <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded w-fit">
                            <Key size={14} className="text-slate-500" />
                            <p className="font-mono font-bold text-sm tracking-wide">{currentProject.inviteCode}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Invite Modal */}
            {showInviteModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <Share2 size={18} className="text-blue-600"/> 프로젝트 초대
                            </h3>
                            <button onClick={() => setShowInviteModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            <div className="text-center space-y-2">
                                <p className="text-slate-500 text-sm">동료에게 아래 코드를 공유하세요.</p>
                                <div className="bg-slate-100 p-4 rounded-xl border border-slate-200 flex flex-col items-center gap-2">
                                    <span className="text-xs text-slate-400 font-bold uppercase tracking-widest">Invite Code</span>
                                    <span className="text-3xl font-mono font-bold text-slate-800 tracking-wider select-all">{currentProject.inviteCode}</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">접속 링크</label>
                                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm">
                                        <LinkIcon size={14} className="flex-shrink-0" />
                                        <span className="truncate">{window.location.origin}</span>
                                    </div>
                                </div>
                                
                                <div className="bg-blue-50 p-3 rounded-lg flex items-start gap-3 border border-blue-100">
                                    <Shield size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
                                    <div className="text-xs text-blue-800 leading-relaxed">
                                        <span className="font-bold">권한 안내:</span><br/>
                                        초대 코드로 입장하는 멤버는 기본적으로 <span className="font-bold underline">참여자(Participant)</span> 권한이 부여됩니다. 관리자는 추후 '프로젝트 설정'에서 권한을 변경할 수 있습니다.
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={handleCopyInvite}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2"
                            >
                                <Copy size={18} /> 초대장 복사하기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
