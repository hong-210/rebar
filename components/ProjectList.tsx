
import React, { useState } from 'react';
import { Project, User, MaterialEntry } from '../types';
import { Plus, MapPin, Building2, Trash2, LogOut, ChevronRight, Clock, Package, Key, Shield, CalendarDays, Search, RotateCcw, AlertTriangle, XCircle, Lock } from 'lucide-react';

interface ProjectListProps {
    projects: Project[];
    materials: MaterialEntry[];
    user: User;
    onSelectProject: (project: Project) => void;
    onCreateProject: (project: Project) => void;
    onJoinProject: (code: string) => Promise<boolean>;
    onSoftDeleteProject: (id: string) => void;
    onRestoreProject: (id: string) => void;
    onPermanentDeleteProject: (id: string) => void;
    onLogout?: () => void; // 없으면 로그아웃 버튼을 숨긴다 (로컬 모드)
}

export const ProjectList: React.FC<ProjectListProps> = ({ 
    projects, materials, user, 
    onSelectProject, onCreateProject, onJoinProject, 
    onSoftDeleteProject, onRestoreProject, onPermanentDeleteProject,
    onLogout 
}) => {
    const [isCreating, setIsCreating] = useState(false);
    const [isJoining, setIsJoining] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'active' | 'trash'>('active');
    
    // Check if current user is System Admin (The "admin" account)
    const isSystemAdmin = user.role === 'admin';

    // Create Form State
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectLocation, setNewProjectLocation] = useState('');
    
    // Join Form State
    const [joinCode, setJoinCode] = useState('');

    const handleCreate = (e: React.FormEvent) => {
        e.preventDefault();
        if (newProjectName) {
            const today = new Date();
            const endDate = new Date();
            endDate.setFullYear(today.getFullYear() + 2); // Default to 2 years
            
            const todayStr = today.toISOString().split('T')[0];

            const newProject: Project = {
                id: Math.random().toString(36).substr(2, 9),
                name: newProjectName,
                location: newProjectLocation || '미지정',
                buildings: [], 
                startDate: todayStr,
                endDate: endDate.toISOString().split('T')[0],
                status: 'Planning',
                inviteCode: '', // Will be generated in App.tsx
                members: [], // Populated in App.tsx
                versions: [],
                activeVersion: {},
                isDeleted: false
            };
            onCreateProject(newProject);
            setIsCreating(false);
            setNewProjectName('');
            setNewProjectLocation('');
        }
    };

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (joinCode) {
            const success = await onJoinProject(joinCode.toUpperCase());
            if (success) {
                setIsJoining(false);
                setJoinCode('');
            } else {
                alert('유효하지 않은 초대 코드입니다. 다시 확인해주세요.');
            }
        }
    };

    const handleSoftDelete = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent card click
        if (window.confirm('이 프로젝트를 휴지통으로 이동하시겠습니까?\n이동 후에는 프로젝트 목록에서 숨겨지며, 시스템 관리자만 복구할 수 있습니다.')) {
            onSoftDeleteProject(id);
        }
    };

    const handleRestore = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.confirm('프로젝트를 복구하시겠습니까?')) {
            onRestoreProject(id);
        }
    };

    const handlePermanentDelete = (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (window.confirm('정말로 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없으며 모든 데이터가 사라집니다.')) {
            onPermanentDeleteProject(id);
        }
    };

    // Helper to calculate stats for card
    const getProjectStats = (project: Project) => {
        // Material Progress
        const projMats = materials.filter(m => m.projectId === project.id);
        const planned = projMats.reduce((acc, c) => acc + c.plannedWeight, 0);
        const shop = projMats.reduce((acc, c) => acc + c.shopWeight, 0);
        const matProgress = planned > 0 ? (shop / planned) * 100 : 0;

        // Time Progress
        let timeProgress = 0;
        if (project.startDate && project.endDate) {
            const start = new Date(project.startDate).getTime();
            const end = new Date(project.endDate).getTime();
            const now = new Date().getTime();
            const total = end - start;
            const elapsed = now - start;
            if (total > 0) {
                timeProgress = Math.max(0, Math.min(100, (elapsed / total) * 100));
            }
        }

        return { matProgress, timeProgress };
    };

    const filteredProjects = projects.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              p.location.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = viewMode === 'trash' ? p.isDeleted : !p.isDeleted;
        return matchesSearch && matchesStatus;
    });

    // Handle case where non-admin is in trash mode (should not happen, but safe fallback)
    if (!isSystemAdmin && viewMode === 'trash') {
        setViewMode('active');
    }

    return (
        <div className="min-h-screen bg-slate-100 p-6 md:p-12 font-sans">
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
                            <div className="bg-blue-600 p-2 rounded-lg text-white">
                                <Building2 size={24} />
                            </div>
                            RebarMaster Pro
                        </h1>
                        <p className="text-slate-500 mt-2 text-sm">
                            <span className="font-semibold text-slate-800">{user.name}</span>님, 관리할 프로젝트를 선택하세요.
                        </p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <div className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-medium text-slate-500 flex items-center gap-2">
                            <Shield size={12} className={isSystemAdmin ? 'text-blue-600' : 'text-slate-400'} />
                            System Role: {isSystemAdmin ? 'Administrator' : 'User'}
                        </div>
                        {onLogout && (
                            <button
                                onClick={onLogout}
                                className="flex items-center gap-2 text-slate-500 hover:text-red-600 transition-colors px-4 py-2 rounded-lg hover:bg-slate-200 text-sm font-medium"
                            >
                                <LogOut size={18} /> 로그아웃
                            </button>
                        )}
                    </div>
                </div>

                {/* View Toggle Tabs (Only visible to System Admin) */}
                <div className="flex gap-2 border-b border-slate-200">
                    <button 
                        onClick={() => setViewMode('active')}
                        className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${
                            viewMode === 'active' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        활성 프로젝트 (Active)
                    </button>
                    {isSystemAdmin && (
                        <button 
                            onClick={() => setViewMode('trash')}
                            className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                                viewMode === 'trash' ? 'border-red-500 text-red-500' : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <Trash2 size={16} /> 휴지통 (Recycle Bin)
                        </button>
                    )}
                </div>

                {/* Action Bar (Only for Active View) */}
                {viewMode === 'active' && (
                    <div className="flex flex-col md:flex-row gap-4 items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200 animate-in fade-in slide-in-from-top-2">
                        <div className="flex-1 w-full md:w-auto relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                type="text" 
                                placeholder="프로젝트 검색..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all"
                            />
                        </div>
                        <div className="flex gap-3 w-full md:w-auto">
                            <button 
                                onClick={() => setIsCreating(true)}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-lg shadow-sm transition-all text-sm font-bold"
                            >
                                <Plus size={18} /> 새 프로젝트
                            </button>
                            <button 
                                onClick={() => setIsJoining(true)}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg shadow-sm transition-all text-sm font-bold"
                            >
                                <Key size={18} /> 초대 코드 입장
                            </button>
                        </div>
                    </div>
                )}

                {/* Trash View Header */}
                {viewMode === 'trash' && (
                    <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center gap-3 text-red-800 animate-in fade-in slide-in-from-top-2">
                        <AlertTriangle size={24} />
                        <div>
                            <h3 className="font-bold">휴지통 (Deleted Projects)</h3>
                            <p className="text-sm opacity-80">삭제된 프로젝트 목록입니다. 시스템 관리자만 복구하거나 영구적으로 삭제할 수 있습니다.</p>
                        </div>
                    </div>
                )}

                {/* Project Grid */}
                <div>
                    <h3 className="text-slate-500 font-bold text-sm mb-4 uppercase tracking-wide">
                        {viewMode === 'active' ? `Project List (${filteredProjects.length})` : `Deleted Items (${filteredProjects.length})`}
                    </h3>
                    
                    {filteredProjects.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300">
                            {viewMode === 'active' ? (
                                <>
                                    <Building2 className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                                    <p className="text-slate-500">프로젝트가 없습니다. 새로 만들거나 초대 코드로 입장하세요.</p>
                                </>
                            ) : (
                                <>
                                    <Trash2 className="mx-auto h-12 w-12 text-slate-300 mb-3" />
                                    <p className="text-slate-500">휴지통이 비어있습니다.</p>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                            {filteredProjects.map(project => {
                                const stats = getProjectStats(project);
                                const userRole = project.members.find(m => m.userId === user.email)?.role || 'Guest';
                                const isProjectAdmin = userRole === 'Admin';
                                
                                // Logic: System Admin OR Project Creator(Admin) can delete.
                                // Logic: Only System Admin can access trash/restore.
                                const canDelete = isSystemAdmin || isProjectAdmin;

                                return (
                                    <div 
                                        key={project.id}
                                        onClick={() => viewMode === 'active' && onSelectProject(project)} 
                                        className={`bg-white rounded-xl shadow-sm border transition-all flex flex-col overflow-hidden ${
                                            viewMode === 'active' 
                                            ? 'border-slate-200 hover:border-blue-400 hover:shadow-md cursor-pointer group' 
                                            : 'border-red-100 bg-red-50/10 opacity-90'
                                        }`}
                                    >
                                        {/* Card Header */}
                                        <div className="p-5 border-b border-slate-50 relative">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                                    project.status === 'Active' ? 'bg-green-100 text-green-700' : 
                                                    project.status === 'Completed' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {project.status}
                                                </span>
                                                
                                                {/* Action Buttons */}
                                                <div className="flex gap-1 -mr-2 -mt-1 relative z-10" onClick={(e) => e.stopPropagation()}>
                                                    {viewMode === 'active' && canDelete && (
                                                        <button 
                                                            onClick={(e) => handleSoftDelete(e, project.id)}
                                                            className="text-slate-300 hover:text-red-500 p-1.5 rounded transition-colors"
                                                            title="휴지통으로 이동"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    )}
                                                    {viewMode === 'trash' && isSystemAdmin && (
                                                        <>
                                                            <button 
                                                                onClick={(e) => handleRestore(e, project.id)}
                                                                className="text-green-500 hover:text-green-700 hover:bg-green-50 p-1.5 rounded transition-colors"
                                                                title="복구"
                                                            >
                                                                <RotateCcw size={16} />
                                                            </button>
                                                            <button 
                                                                onClick={(e) => handlePermanentDelete(e, project.id)}
                                                                className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded transition-colors"
                                                                title="영구 삭제"
                                                            >
                                                                <XCircle size={16} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <h3 className={`text-lg font-bold text-slate-800 mb-1 truncate transition-colors ${viewMode === 'active' ? 'group-hover:text-blue-600' : ''}`}>
                                                {project.name}
                                            </h3>
                                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                                <MapPin size={12} />
                                                <span className="truncate">{project.location}</span>
                                            </div>
                                        </div>

                                        {/* Card Stats */}
                                        <div className="p-5 bg-slate-50/50 flex-1 flex flex-col justify-end space-y-4">
                                            <div className="space-y-3">
                                                {/* Time Progress */}
                                                <div>
                                                    <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1">
                                                        <span className="flex items-center gap-1"><Clock size={10}/> TIME</span>
                                                        <span>{stats.timeProgress.toFixed(0)}%</span>
                                                    </div>
                                                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                        <div className="h-full bg-slate-400 rounded-full" style={{ width: `${stats.timeProgress}%` }}></div>
                                                    </div>
                                                </div>
                                                {/* Material Progress */}
                                                <div>
                                                    <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1">
                                                        <span className="flex items-center gap-1"><Package size={10}/> MATERIAL</span>
                                                        <span className={stats.matProgress > 100 ? 'text-red-500' : 'text-blue-600'}>{stats.matProgress.toFixed(0)}%</span>
                                                    </div>
                                                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                        <div className={`h-full rounded-full ${stats.matProgress > 100 ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(stats.matProgress, 100)}%` }}></div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                                <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 bg-white px-2 py-1 rounded border border-slate-100">
                                                    <Shield size={10} className={isProjectAdmin ? 'text-blue-500' : 'text-green-500'} />
                                                    {userRole}
                                                </div>
                                                {viewMode === 'active' && (
                                                    <span className="text-xs font-medium text-slate-400 group-hover:text-blue-600 flex items-center gap-0.5 transition-colors">
                                                        Open <ChevronRight size={14} />
                                                    </span>
                                                )}
                                                {viewMode === 'trash' && (
                                                    <span className="text-xs font-bold text-red-400 flex items-center gap-0.5">
                                                        Deleted
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Create Modal */}
            {isCreating && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-800">새 프로젝트 생성</h3>
                            <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-slate-600">
                                <Plus size={24} className="rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleCreate} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">프로젝트 명</label>
                                <input 
                                    required
                                    autoFocus
                                    type="text" 
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={newProjectName}
                                    onChange={e => setNewProjectName(e.target.value)}
                                    placeholder="예: 강남 파이낸스 센터"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">현장 위치</label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                                    <input 
                                        required
                                        type="text" 
                                        className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={newProjectLocation}
                                        onChange={e => setNewProjectLocation(e.target.value)}
                                        placeholder="예: 서울시 강남구"
                                    />
                                </div>
                            </div>
                            <button 
                                type="submit" 
                                className="w-full bg-slate-800 text-white font-bold py-3 rounded-lg hover:bg-slate-900 transition-all mt-2"
                            >
                                생성하기
                            </button>
                        </form>
                    </div>
                </div>
            )}
            
            {/* Join Modal */}
             {isJoining && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in zoom-in duration-200">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-800">초대 코드로 입장</h3>
                            <button onClick={() => setIsJoining(false)} className="text-slate-400 hover:text-slate-600">
                                <Plus size={24} className="rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleJoin} className="p-6 space-y-4">
                            <div className="bg-green-50 p-4 rounded-lg flex gap-3 items-start border border-green-100">
                                <Key className="text-green-600 mt-0.5 flex-shrink-0" size={20} />
                                <p className="text-xs text-green-800 leading-relaxed">
                                    관리자에게 공유받은 6자리 초대 코드를 입력하세요.<br/>
                                    입장 시 '참여자' 권한이 부여됩니다.
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">초대 코드 (Invite Code)</label>
                                <input 
                                    required
                                    autoFocus
                                    type="text" 
                                    className="w-full px-3 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-center text-xl tracking-widest uppercase font-mono"
                                    value={joinCode}
                                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                                    placeholder="XXXXXX"
                                    maxLength={6}
                                />
                            </div>
                            <button 
                                type="submit" 
                                className="w-full bg-green-600 text-white font-bold py-3 rounded-lg hover:bg-green-700 transition-all mt-2"
                            >
                                프로젝트 입장
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
