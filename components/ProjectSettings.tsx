
import React, { useState, useEffect } from 'react';
import { Project, BuildingConfig, User } from '../types';
import { Save, Building2, PlusCircle, RefreshCcw, Calendar, Shield, Lock } from 'lucide-react';

interface ProjectSettingsProps {
    currentProject: Project;
    user: User;
    onUpdateProject: (project: Project) => void;
}

export const ProjectSettings: React.FC<ProjectSettingsProps> = ({ currentProject, user, onUpdateProject }) => {
    const [formData, setFormData] = useState<Project>(currentProject);
    const [dongInput, setDongInput] = useState('');
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        setFormData(currentProject);
    }, [currentProject]);

    // Check Permissions
    const currentUserRole = currentProject.members.find(m => m.userId === user.email)?.role || 'Guest';
    const isAdmin = currentUserRole === 'Admin';
    // Participants can also edit project settings (excluding member management which is on a separate page)
    const canEdit = currentUserRole === 'Admin' || currentUserRole === 'Participant';

    // Logic to parse "101~103, 201" into Building Configs
    const handleParseDongs = () => {
        if (!dongInput.trim()) return;

        const parts = dongInput.split(',').map(s => s.trim());
        const newBuildings: BuildingConfig[] = [...formData.buildings];

        parts.forEach(part => {
            if (part.includes('~')) {
                // Range parsing: 101~103
                const [start, end] = part.split('~').map(s => parseInt(s.replace(/\D/g, '')));
                if (!isNaN(start) && !isNaN(end)) {
                    for (let i = start; i <= end; i++) {
                        const name = `${i}동`;
                        if (!newBuildings.find(b => b.name === name)) {
                            newBuildings.push({ name, groundFloors: 20, basementFloors: 2 });
                        }
                    }
                }
            } else {
                // Single building
                const name = part.endsWith('동') ? part : isNaN(Number(part)) ? part : `${part}동`;
                if (!newBuildings.find(b => b.name === name)) {
                    newBuildings.push({ name, groundFloors: 20, basementFloors: 2 });
                }
            }
        });

        setFormData({ ...formData, buildings: newBuildings });
        setDongInput('');
    };

    const updateBuildingConfig = (index: number, field: keyof BuildingConfig, value: any) => {
        const newBuildings = [...formData.buildings];
        newBuildings[index] = { ...newBuildings[index], [field]: value };
        setFormData({ ...formData, buildings: newBuildings });
    };

    const removeBuilding = (index: number) => {
        const newBuildings = formData.buildings.filter((_, i) => i !== index);
        setFormData({ ...formData, buildings: newBuildings });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canEdit) return;
        onUpdateProject(formData);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 3000);
    };

    return (
        <div className="space-y-8 max-w-4xl animate-in fade-in slide-in-from-bottom-4">
             <div>
                <h2 className="text-2xl font-bold text-slate-800">프로젝트 설정 (Project Settings)</h2>
                <p className="text-slate-500">프로젝트 기본 정보, 동(Building) 구성 및 현장 정보를 관리합니다.</p>
                <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-slate-100 rounded text-xs font-medium text-slate-600">
                    <Shield size={14} />
                    Current Role: <span className={`font-bold ${isAdmin ? 'text-blue-600' : currentUserRole === 'Participant' ? 'text-green-600' : 'text-slate-500'}`}>{currentUserRole}</span>
                </div>
            </div>

            {!canEdit && (
                <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg flex items-center gap-3 text-yellow-800 text-sm">
                    <Lock size={18} />
                    <span>게스트는 프로젝트 설정을 변경할 수 없습니다. 관리자에게 문의하세요.</span>
                </div>
            )}

            <div className={`bg-white p-8 rounded-xl shadow-sm border border-slate-100 ${!canEdit ? 'opacity-70 pointer-events-none grayscale' : ''}`}>
                <div className="flex items-start gap-4 mb-8 pb-8 border-b border-slate-100">
                    <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
                        <Building2 size={32} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">{formData.name}</h3>
                        <p className="text-slate-500">Project ID: {formData.id}</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 mb-1">프로젝트 명</label>
                            <input 
                                required
                                type="text" 
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.name}
                                onChange={e => setFormData({...formData, name: e.target.value})}
                                disabled={!canEdit}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">현장 위치</label>
                            <input 
                                type="text" 
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.location}
                                onChange={e => setFormData({...formData, location: e.target.value})}
                                disabled={!canEdit}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">진행 상태</label>
                            <select 
                                className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={formData.status}
                                onChange={e => setFormData({...formData, status: e.target.value as any})}
                                disabled={!canEdit}
                            >
                                <option value="Planning">Planning (계획)</option>
                                <option value="Active">Active (진행중)</option>
                                <option value="Completed">Completed (완료)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">착공일 (Start Date)</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                                <input 
                                    type="date" 
                                    required
                                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={formData.startDate}
                                    onChange={e => setFormData({...formData, startDate: e.target.value})}
                                    disabled={!canEdit}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">준공 예정일 (Completion)</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                                <input 
                                    type="date" 
                                    required
                                    className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={formData.endDate || ''}
                                    onChange={e => setFormData({...formData, endDate: e.target.value})}
                                    disabled={!canEdit}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-slate-100 pt-8"></div>

                    {/* 1. Building Definition */}
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs">1</span>
                            동(Building) 정의
                        </h3>
                        <p className="text-sm text-slate-500 mb-4">
                            프로젝트에 포함된 동을 입력하세요. (예: 101~103, 201, 커뮤니티센터)
                        </p>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={dongInput}
                                onChange={e => setDongInput(e.target.value)}
                                placeholder="예: 101~105, 201, 부재동"
                                className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                disabled={!canEdit}
                            />
                            <button 
                                type="button"
                                onClick={handleParseDongs}
                                className="bg-slate-800 text-white px-6 py-3 rounded-lg hover:bg-slate-700 flex items-center gap-2 font-medium disabled:opacity-50"
                                disabled={!canEdit}
                            >
                                <PlusCircle size={18} /> 생성
                            </button>
                        </div>
                    </div>

                    {/* 2. Floor Configuration per Building */}
                    {formData.buildings.length > 0 && (
                        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">2</span>
                                동별 층수 설정 (Floor Config)
                            </h3>
                            
                            <div className="space-y-3">
                                {formData.buildings.map((building, idx) => (
                                    <div key={idx} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center gap-4">
                                        <div className="flex-1">
                                            <label className="text-xs text-slate-400 font-bold uppercase">Building Name</label>
                                            <input 
                                                type="text" 
                                                value={building.name}
                                                onChange={e => updateBuildingConfig(idx, 'name', e.target.value)}
                                                className="w-full font-bold text-slate-800 border-b border-slate-200 focus:border-blue-500 focus:outline-none py-1"
                                                disabled={!canEdit}
                                            />
                                        </div>
                                        <div className="w-full md:w-32">
                                            <label className="text-xs text-slate-400 font-bold uppercase">지상층 (Ground)</label>
                                            <div className="relative">
                                                <input 
                                                    type="number" 
                                                    min={1}
                                                    value={building.groundFloors}
                                                    onChange={e => updateBuildingConfig(idx, 'groundFloors', Math.max(1, Number(e.target.value)))}
                                                    className="w-full pl-3 pr-8 py-2 border border-slate-200 rounded text-right font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                    disabled={!canEdit}
                                                />
                                                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-slate-400">F</span>
                                            </div>
                                        </div>
                                        <div className="w-full md:w-32">
                                            <label className="text-xs text-slate-400 font-bold uppercase">지하층 (Base)</label>
                                            <div className="relative">
                                                <input 
                                                    type="number" 
                                                    min={0}
                                                    value={building.basementFloors}
                                                    onChange={e => updateBuildingConfig(idx, 'basementFloors', Math.max(0, Number(e.target.value)))}
                                                    className="w-full pl-3 pr-8 py-2 border border-slate-200 rounded text-right font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                                    disabled={!canEdit}
                                                />
                                                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-slate-400">F</span>
                                            </div>
                                        </div>
                                        <div className="flex items-end h-full pb-1">
                                             <button 
                                                type="button"
                                                onClick={() => removeBuilding(idx)}
                                                className="text-slate-300 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors disabled:opacity-0"
                                                title="동 삭제"
                                                disabled={!canEdit}
                                             >
                                                 <RefreshCcw size={16} className="rotate-45" />
                                             </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="pt-4 flex items-center justify-end gap-4">
                        {isSaved && <span className="text-green-600 font-medium text-sm">설정이 저장되었습니다.</span>}
                        {canEdit && (
                            <button 
                                type="submit" 
                                className="flex items-center gap-2 bg-blue-600 text-white font-medium py-3 px-8 rounded-lg hover:bg-blue-700 transition-colors shadow-md"
                            >
                                <Save size={18} /> 설정 저장 완료
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
};
