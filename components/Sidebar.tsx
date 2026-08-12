
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, HardHat, ClipboardList, History, Sparkles, Settings, ArrowLeft, AlertCircle, Truck, CornerDownRight, Users, Box, Component, ClipboardCheck, FileText } from 'lucide-react';
import { Project, User } from '../types';

interface SidebarProps {
    currentProject: Project;
    user: User;
    onExitProject: () => void;
}

const NavItem = ({ to, icon: Icon, label, isActive }: { to: string, icon: any, label: string, isActive: boolean }) => (
    <Link
        to={to}
        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
            isActive 
            ? 'bg-blue-600 text-white shadow-md' 
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`}
    >
        <Icon size={20} />
        <span className="font-medium">{label}</span>
    </Link>
);

export const Sidebar: React.FC<SidebarProps> = ({ currentProject, user, onExitProject }) => {
    const location = useLocation();
    
    // Check if we are in any rebar section
    const isRebarSection = location.pathname === '/input' || location.pathname.startsWith('/input/');
    const isRebarOverviewActive = location.pathname === '/input';
    const isRebarDesignActive = location.pathname === '/input/design';
    const isRebarShopActive = location.pathname === '/input/shop';

    // Check if we are in any concrete section
    const isConcreteSection = location.pathname === '/concrete' || location.pathname.startsWith('/concrete/');
    const isConcreteOverviewActive = location.pathname === '/concrete';
    const isConcreteDesignActive = location.pathname === '/concrete/design';
    const isConcreteConstructionActive = location.pathname === '/concrete/construction';

    // Check if we are in any inspection section
    const isInspectionSection = location.pathname === '/inspection' || location.pathname.startsWith('/inspection/');
    const isInspectionRecordsActive = location.pathname === '/inspection';
    const isInspectionDrawingsActive = location.pathname === '/inspection/drawings';

    // Check Project Admin Role
    const userProjectRole = currentProject.members.find(m => m.userId === user.email)?.role || 'Guest';
    const isAdmin = userProjectRole === 'Admin';

    return (
        <div className="w-64 bg-slate-900 h-screen flex flex-col text-slate-300 fixed left-0 top-0 z-10 shadow-xl">
            <div className="p-6 border-b border-slate-800">
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
                        <HardHat size={20} className="text-white" />
                    </div>
                    <h1 className="text-xl font-bold text-white">RebarMaster</h1>
                </div>
                
                <div className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                    <p className="text-xs text-slate-400 mb-1">Current Project</p>
                    <h2 className="text-sm font-bold text-white truncate">{currentProject.name}</h2>
                </div>
            </div>

            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
                {/* 1. 대시보드 */}
                <NavItem to="/" icon={LayoutDashboard} label="대시보드" isActive={location.pathname === '/'} />
                
                {/* 2. 프로젝트 설정 */}
                <NavItem to="/projects" icon={Settings} label="프로젝트 설정" isActive={location.pathname === '/projects'} />
                
                {/* 3. 철근 물량 관리 (Rebar) */}
                <div className="space-y-1">
                    {/* Parent Item (Overview) */}
                    <Link
                        to="/input"
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                            isRebarOverviewActive 
                            ? 'bg-blue-600 text-white shadow-md' 
                            : isRebarSection 
                                ? 'text-blue-400 bg-slate-800/50' // Active parent style
                                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                        }`}
                    >
                        <ClipboardList size={20} />
                        <span className="font-medium">철근 물량 관리</span>
                    </Link>

                    {/* Sub Menu */}
                    {isRebarSection && (
                        <div className="ml-8 border-l-2 border-slate-700 pl-2 space-y-1 animate-in slide-in-from-top-2 duration-200">
                            <Link 
                                to="/input/design" 
                                className={`flex items-center gap-2 py-2 px-3 text-sm rounded-md transition-colors ${
                                    isRebarDesignActive 
                                    ? 'bg-slate-800 text-white font-semibold' 
                                    : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                <CornerDownRight size={14} className="opacity-50" />
                                실행 물량
                            </Link>
                            <Link 
                                to="/input/shop" 
                                className={`flex items-center gap-2 py-2 px-3 text-sm rounded-md transition-colors ${
                                    isRebarShopActive 
                                    ? 'bg-slate-800 text-white font-semibold' 
                                    : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                <CornerDownRight size={14} className="opacity-50" />
                                SHOP 물량
                            </Link>
                        </div>
                    )}
                </div>

                {/* 4. 콘크리트 물량 관리 (Concrete) */}
                <div className="space-y-1">
                    {/* Parent Item (Overview) */}
                    <Link
                        to="/concrete"
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                            isConcreteOverviewActive 
                            ? 'bg-blue-600 text-white shadow-md' 
                            : isConcreteSection 
                                ? 'text-blue-400 bg-slate-800/50' // Active parent style
                                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                        }`}
                    >
                        <Component size={20} />
                        <span className="font-medium">콘크리트 물량 관리</span>
                    </Link>

                    {/* Sub Menu */}
                    {isConcreteSection && (
                        <div className="ml-8 border-l-2 border-slate-700 pl-2 space-y-1 animate-in slide-in-from-top-2 duration-200">
                            <Link 
                                to="/concrete/design" 
                                className={`flex items-center gap-2 py-2 px-3 text-sm rounded-md transition-colors ${
                                    isConcreteDesignActive 
                                    ? 'bg-slate-800 text-white font-semibold' 
                                    : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                <CornerDownRight size={14} className="opacity-50" />
                                실행 물량
                            </Link>
                            <Link 
                                to="/concrete/construction" 
                                className={`flex items-center gap-2 py-2 px-3 text-sm rounded-md transition-colors ${
                                    isConcreteConstructionActive 
                                    ? 'bg-slate-800 text-white font-semibold' 
                                    : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                <CornerDownRight size={14} className="opacity-50" />
                                시공 물량
                            </Link>
                        </div>
                    )}
                </div>
                
                {/* 5. 검측 관리 */}
                <div className="space-y-1">
                    {/* Parent Item (Records) */}
                    <Link
                        to="/inspection"
                        className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                            isInspectionRecordsActive
                            ? 'bg-blue-600 text-white shadow-md'
                            : isInspectionSection
                                ? 'text-blue-400 bg-slate-800/50' // Active parent style
                                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                        }`}
                    >
                        <ClipboardCheck size={20} />
                        <span className="font-medium">검측 관리</span>
                    </Link>

                    {/* Sub Menu */}
                    {isInspectionSection && (
                        <div className="ml-8 border-l-2 border-slate-700 pl-2 space-y-1 animate-in slide-in-from-top-2 duration-200">
                            <Link
                                to="/inspection"
                                className={`flex items-center gap-2 py-2 px-3 text-sm rounded-md transition-colors ${
                                    isInspectionRecordsActive
                                    ? 'bg-slate-800 text-white font-semibold'
                                    : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                <CornerDownRight size={14} className="opacity-50" />
                                검측 기록
                            </Link>
                            <Link
                                to="/inspection/drawings"
                                className={`flex items-center gap-2 py-2 px-3 text-sm rounded-md transition-colors ${
                                    isInspectionDrawingsActive
                                    ? 'bg-slate-800 text-white font-semibold'
                                    : 'text-slate-500 hover:text-slate-300'
                                }`}
                            >
                                <FileText size={14} className="opacity-50" />
                                샵도면함
                            </Link>
                        </div>
                    )}
                </div>

                {/* 6. 이슈 관리 */}
                <NavItem to="/issues" icon={AlertCircle} label="이슈 관리" isActive={location.pathname === '/issues'} />

                {/* 7. 발주 관리 */}
                <NavItem to="/orders" icon={Truck} label="발주 관리" isActive={location.pathname === '/orders'} />

                {/* 8. 이력 관리 */}
                <NavItem to="/history" icon={History} label="이력 관리" isActive={location.pathname === '/history'} />

                {/* 9. 3D 뷰어 (Beta) */}
                <NavItem to="/3d-viewer" icon={Box} label="3D 모델 뷰어 (Beta)" isActive={location.pathname === '/3d-viewer'} />

                {/* 10. 구성원 관리 (Admin Only) - Moved to bottom */}
                {isAdmin && (
                    <>
                        <div className="h-px bg-slate-800 mx-2 my-2"></div>
                        <NavItem to="/members" icon={Users} label="구성원 관리" isActive={location.pathname === '/members'} />
                    </>
                )}
            </nav>

            <div className="p-4 border-t border-slate-800 space-y-4">
                <button 
                    onClick={onExitProject}
                    className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2 rounded-lg transition-colors text-sm"
                >
                    <ArrowLeft size={16} /> 프로젝트 목록으로
                </button>

                <div className="flex items-center gap-3 pt-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-xs">
                        {user.name.substring(0, 2)}
                    </div>
                    <div>
                        <p className="text-sm font-medium text-white">{user.name}</p>
                        <p className="text-xs text-slate-500 capitalize">{userProjectRole}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};
