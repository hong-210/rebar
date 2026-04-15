
import React, { useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { ProjectSettings } from './components/ProjectSettings';
import { MaterialInput } from './components/MaterialInput';
import { ConcreteInput } from './components/ConcreteInput';
import { HistoryLogViewer } from './components/HistoryLog';
import { Login, UserAccount } from './components/Login';
import { ProjectList } from './components/ProjectList';
import { IssueTracker } from './components/IssueTracker';
import { OrderManagement } from './components/OrderManagement';
import { MemberManagement } from './components/MemberManagement';
import { ThreeDViewer } from './components/ThreeDViewer';
import { Project, MaterialEntry, ConcreteEntry, HistoryLog, RebarDiameter, User, Issue, IssueStatus, Order, OrderStatus, ProjectRole } from './types';

// Default Admin Account
const INITIAL_USERS: UserAccount[] = [
    { id: 'admin', email: 'admin', password: '000000', name: '관리자(Admin)', role: 'admin' }
];

// Initial Mock Data
const INITIAL_PROJECTS: Project[] = [
    { 
        id: 'p1', 
        name: '서울 숲 오피스 신축', 
        location: '서울 성동구', 
        buildings: [
            { name: 'A동 (Office)', groundFloors: 20, basementFloors: 5 },
            { name: 'B동 (Retail)', groundFloors: 5, basementFloors: 2 }
        ],
        startDate: '2024-03-01', 
        endDate: '2026-02-28',
        status: 'Active',
        inviteCode: 'SEOUL1',
        members: [
            { userId: 'admin', userName: '관리자(Admin)', role: 'Admin', joinedAt: '2024-03-01' }
        ],
        versions: [
            { name: 'Rev.0', date: '2024-03-01', description: 'Initial Design', dong: 'A동 (Office)' },
            { name: 'Rev.0', date: '2024-03-01', description: 'Initial Design', dong: 'B동 (Retail)' }
        ],
        activeVersion: {
            'A동 (Office)': 'Rev.0',
            'B동 (Retail)': 'Rev.0'
        },
        isDeleted: false
    },
    { 
        id: 'p2', 
        name: '부산 해운대 리조트', 
        location: '부산 해운대구', 
        buildings: [
            { name: '101동', groundFloors: 45, basementFloors: 3 },
            { name: '102동', groundFloors: 45, basementFloors: 3 },
            { name: 'Community', groundFloors: 3, basementFloors: 1 }
        ],
        startDate: '2024-06-15', 
        endDate: '2027-05-30',
        status: 'Planning',
        inviteCode: 'BUSAN2',
        members: [
            { userId: 'admin', userName: '관리자(Admin)', role: 'Admin', joinedAt: '2024-06-15' }
        ],
        versions: [
            { name: 'Rev.0', date: '2024-06-15', dong: '101동' },
            { name: 'Rev.0', date: '2024-06-15', dong: '102동' },
            { name: 'Rev.0', date: '2024-06-15', dong: 'Community' }
        ],
        activeVersion: {
            '101동': 'Rev.0',
            '102동': 'Rev.0',
            'Community': 'Rev.0'
        },
        isDeleted: false
    }
];

// Decoupled Design and Shop Entries
const INITIAL_MATERIALS: MaterialEntry[] = [
    // Design Data
    { 
        id: 'm1_d', projectId: 'p1', dong: 'A동 (Office)', floor: 'B2', zone: 'Mat Foundation', diameter: RebarDiameter.D25, strength: 'SD400', lengthMm: 0, 
        dataSource: 'Design',
        plannedQuantity: 500, plannedWeight: 15920, 
        shopQuantity: 0, shopWeight: 0, 
        plannedVersions: { 'Rev.0': 15920 },
        lastUpdated: '2024-05-01' 
    },
    // Shop Data (Matched conceptually but separate entry)
    { 
        id: 'm1_s', projectId: 'p1', dong: 'A동 (Office)', floor: 'B2', zone: 'Mat Foundation (Pour 1)', diameter: RebarDiameter.D25, strength: 'SD400', lengthMm: 0, 
        dataSource: 'Shop',
        plannedQuantity: 0, plannedWeight: 0, 
        shopQuantity: 510, shopWeight: 16238.4, 
        plannedVersions: {},
        lastUpdated: '2024-05-15' 
    },
    { 
        id: 'm2_d', projectId: 'p1', dong: 'A동 (Office)', floor: 'B2', zone: 'Columns', diameter: RebarDiameter.D29, strength: 'SD500', lengthMm: 0, 
        dataSource: 'Design',
        plannedQuantity: 200, plannedWeight: 6048, 
        shopQuantity: 0, shopWeight: 0, 
        plannedVersions: { 'Rev.0': 6048 },
        lastUpdated: '2024-05-02' 
    },
    { 
        id: 'm2_s', projectId: 'p1', dong: 'A동 (Office)', floor: 'B2', zone: 'Columns (Zone A)', diameter: RebarDiameter.D29, strength: 'SD500', lengthMm: 0, 
        dataSource: 'Shop',
        plannedQuantity: 0, plannedWeight: 0, 
        shopQuantity: 195, shopWeight: 5896.8, 
        plannedVersions: {},
        lastUpdated: '2024-05-18' 
    },
    { 
        id: 'm3_d', projectId: 'p1', dong: 'A동 (Office)', floor: '1F', zone: 'Slab', diameter: RebarDiameter.D13, strength: 'SD400', lengthMm: 0, 
        dataSource: 'Design',
        plannedQuantity: 1200, plannedWeight: 4776, 
        shopQuantity: 0, shopWeight: 0, 
        plannedVersions: { 'Rev.0': 4776 },
        lastUpdated: '2024-05-10' 
    }
];

const INITIAL_CONCRETES: ConcreteEntry[] = [
    {
        id: 'c1', projectId: 'p1', dong: 'A동 (Office)', floor: 'B2', zone: 'Mat Foundation', strength: '270', type: '기초',
        dataSource: 'Design', plannedVolume: 1200, constructionVolume: 0, lastUpdated: '2024-05-01'
    },
    {
        id: 'c2', projectId: 'p1', dong: 'A동 (Office)', floor: 'B2', zone: 'Pour 1', strength: '270', type: '기초',
        dataSource: 'Construction', plannedVolume: 0, constructionVolume: 1250, lastUpdated: '2024-05-15'
    }
];

const INITIAL_LOGS: HistoryLog[] = [
    { id: 'l1', projectId: 'p1', action: 'IMPORT', description: '기초 물량 데이터 일괄 업로드', user: '김현장', timestamp: '2024-05-01T09:00:00' },
    { id: 'l2', projectId: 'p1', action: 'UPDATE', description: 'A동 1층 슬래브 물량 수정', user: '이공무', timestamp: '2024-05-10T14:30:00' }
];

const INITIAL_ISSUES: Issue[] = [
    {
        id: 'i1', projectId: 'p1', title: 'B2층 기초 물량 불일치 확인 요망',
        content: '원설계 대비 샵 물량이 10% 이상 증가했습니다. 정착 길이 산정 기준 확인 부탁드립니다.',
        author: '김현장', assignee: '이구조', status: 'Open', priority: 'High',
        createdAt: '2024-05-12T10:00:00', attachment: '기초물량산출서_v2.pdf'
    },
    {
        id: 'i2', projectId: 'p1', title: '안전 교육 일정 공지',
        content: '다음 주 월요일 오전 8시 전 직원 안전 교육 실시합니다.',
        author: '박안전', assignee: '전직원', status: 'Resolved', priority: 'Medium',
        createdAt: '2024-05-15T09:00:00'
    }
];

const INITIAL_ORDERS: Order[] = [
    { 
        id: 'o1', projectId: 'p1', title: 'B2층 기초 철근 발주', dong: 'A동 (Office)', floor: 'B2', 
        diameter: RebarDiameter.D25, strength: 'SD400', quantityWeight: 25000, 
        orderDate: '2024-05-10', deliveryDate: '2024-05-25', status: 'Ordered' 
    },
    { 
        id: 'o2', projectId: 'p1', title: '1F 기둥 및 벽체', dong: 'A동 (Office)', floor: '1F', 
        diameter: RebarDiameter.D19, strength: 'SD500', quantityWeight: 15000, 
        orderDate: '2024-05-20', deliveryDate: '2024-06-05', status: 'RequestApproval' 
    }
];

export default function App() {
    // Auth State
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [registeredUsers, setRegisteredUsers] = useState<UserAccount[]>(INITIAL_USERS);
    
    // Data State
    const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
    const [currentProject, setCurrentProject] = useState<Project | null>(null);
    const [materials, setMaterials] = useState<MaterialEntry[]>(INITIAL_MATERIALS);
    const [concretes, setConcretes] = useState<ConcreteEntry[]>(INITIAL_CONCRETES);
    const [logs, setLogs] = useState<HistoryLog[]>(INITIAL_LOGS);
    const [issues, setIssues] = useState<Issue[]>(INITIAL_ISSUES);
    const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);

    const handleLogin = (user: User) => {
        setCurrentUser(user);
    };

    const handleRegister = (newUser: UserAccount, inviteCode?: string) => {
        setRegisteredUsers([...registeredUsers, newUser]);
        
        // Auto login
        const userSession: User = {
            email: newUser.email,
            name: newUser.name,
            role: newUser.role
        };
        setCurrentUser(userSession);

        // Handle Invite Code Joining
        if (inviteCode) {
            handleJoinProject(inviteCode, userSession);
        }
    };

    const handleLogout = () => {
        setCurrentUser(null);
        setCurrentProject(null);
    };

    const handleSelectProject = (project: Project) => {
        setCurrentProject(project);
    };

    // Allow joining existing projects via code
    const handleJoinProject = (code: string, userToJoin: User = currentUser!) => {
        const project = projects.find(p => p.inviteCode === code);
        if (project) {
            // Check if already a member
            const isMember = project.members.some(m => m.userId === userToJoin.email);
            if (!isMember) {
                const updatedProject = {
                    ...project,
                    members: [
                        ...project.members,
                        {
                            userId: userToJoin.email,
                            userName: userToJoin.name,
                            role: 'Participant' as ProjectRole, // Default role
                            joinedAt: new Date().toISOString()
                        }
                    ]
                };
                setProjects(prev => prev.map(p => p.id === project.id ? updatedProject : p));
                if (!currentProject) setCurrentProject(updatedProject);
                else if (currentProject.id === project.id) setCurrentProject(updatedProject);
                
                alert(`'${project.name}' 프로젝트에 '참여자(Participant)' 권한으로 입장했습니다.`);
            } else {
                if (!currentProject) setCurrentProject(project);
                alert(`이미 '${project.name}' 프로젝트의 멤버입니다.`);
            }
            return true;
        }
        return false;
    };

    const handleExitProject = () => {
        setCurrentProject(null);
    };

    const handleCreateProject = (newProject: Project) => {
        // Generate a random 6-character invite code
        newProject.inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        newProject.activeVersion = {}; 
        newProject.isDeleted = false;
        // Assign Creator as Admin
        if (currentUser) {
            newProject.members = [{
                userId: currentUser.email,
                userName: currentUser.name,
                role: 'Admin',
                joinedAt: new Date().toISOString()
            }];
        }
        setProjects([...projects, newProject]);
    };

    // --- Soft Delete, Restore, Permanent Delete Logic ---

    // Soft Delete (Move to Trash)
    const handleMoveToTrash = (id: string) => {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, isDeleted: true } : p));
        if (currentProject?.id === id) setCurrentProject(null);
    };

    // Restore from Trash
    const handleRestoreProject = (id: string) => {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, isDeleted: false } : p));
    };

    // Permanent Delete
    const handlePermanentDeleteProject = (id: string) => {
        setProjects(prev => prev.filter(p => p.id !== id));
        // Note: Ideally, clean up materials/issues/logs here too, but for now we remove the project entry.
    };

    const handleUpdateProject = (updatedProject: Project) => {
        setProjects(projects.map(p => p.id === updatedProject.id ? updatedProject : p));
        setCurrentProject(updatedProject);
        addLog(updatedProject.id, 'UPDATE', `프로젝트 정보 수정: ${updatedProject.name}`);
    };

    const handleUpdateMemberRole = (projectId: string, userId: string, newRole: ProjectRole) => {
        const project = projects.find(p => p.id === projectId);
        if (!project) return;

        const updatedMembers = project.members.map(m => 
            m.userId === userId ? { ...m, role: newRole } : m
        );
        
        const updatedProject = { ...project, members: updatedMembers };
        setProjects(prev => prev.map(p => p.id === projectId ? updatedProject : p));
        if (currentProject?.id === projectId) setCurrentProject(updatedProject);
        
        addLog(projectId, 'UPDATE', `멤버 권한 변경 (${userId} -> ${newRole})`);
    };

    const handleRemoveMember = (projectId: string, userId: string) => {
        const project = projects.find(p => p.id === projectId);
        if (!project) return;
        
        const member = project.members.find(m => m.userId === userId);
        if (!member) return;

        const updatedMembers = project.members.filter(m => m.userId !== userId);
        const updatedProject = { ...project, members: updatedMembers };
        
        setProjects(prev => prev.map(p => p.id === projectId ? updatedProject : p));
        if (currentProject?.id === projectId) setCurrentProject(updatedProject);
        
        addLog(projectId, 'UPDATE', `멤버 삭제: ${member.userName} (${userId})`);
    };

    // --- Version Control Logic ---

    const handleCreateVersion = (projectId: string, versionName: string, versionDate: string, dong: string) => {
        const project = projects.find(p => p.id === projectId);
        if (!project) return;

        // 1. Update Project Version List
        const newVersionEntry = { name: versionName, date: versionDate, dong: dong };
        const updatedProject: Project = {
            ...project,
            versions: [...project.versions, newVersionEntry],
            activeVersion: {
                ...project.activeVersion,
                [dong]: versionName
            }
        };

        setProjects(projects.map(p => p.id === projectId ? updatedProject : p));
        if (currentProject?.id === projectId) setCurrentProject(updatedProject);

        // 2. Snapshot Materials
        const updatedMaterials = materials.map(m => {
            if (m.projectId === projectId && m.dong === dong && m.dataSource !== 'Shop') {
                return {
                    ...m,
                    plannedVersions: {
                        ...m.plannedVersions,
                        [versionName]: m.plannedWeight 
                    }
                };
            }
            return m;
        });
        setMaterials(updatedMaterials);

        addLog(projectId, 'VERSION', `새 버전 생성 (${dong}): ${versionName} (${versionDate})`);
    };

    const handleSwitchVersion = (projectId: string, versionName: string, dong: string) => {
        const project = projects.find(p => p.id === projectId);
        if (!project) return;

        // 1. Update Project Active Version for this Dong
        const updatedProject = { 
            ...project, 
            activeVersion: {
                ...project.activeVersion,
                [dong]: versionName
            }
        };
        setProjects(projects.map(p => p.id === projectId ? updatedProject : p));
        if (currentProject?.id === projectId) setCurrentProject(updatedProject);

        // 2. Restore Material Weights
        const updatedMaterials = materials.map(m => {
            if (m.projectId === projectId && m.dong === dong && m.dataSource !== 'Shop') {
                const historicWeight = m.plannedVersions[versionName] || 0;
                return {
                    ...m,
                    plannedWeight: historicWeight
                };
            }
            return m;
        });
        setMaterials(updatedMaterials);
    };

    // --- Material Logic (Rebar) ---

    const handleAddMaterial = (entry: MaterialEntry) => {
        const activeVer = currentProject?.activeVersion[entry.dong] || 'Rev.0';
        
        const entryWithVersion = {
            ...entry,
            plannedVersions: entry.dataSource !== 'Shop' ? {
                ...entry.plannedVersions,
                [activeVer]: entry.plannedWeight
            } : {}
        };

        const existingIndex = materials.findIndex(m => 
            m.projectId === entryWithVersion.projectId && 
            m.dong === entryWithVersion.dong &&
            m.floor === entryWithVersion.floor && 
            m.zone === entryWithVersion.zone && 
            m.diameter === entryWithVersion.diameter &&
            m.strength === entryWithVersion.strength &&
            m.dataSource === entryWithVersion.dataSource 
        );

        if (existingIndex >= 0) {
             const updatedMaterials = [...materials];
             const existing = updatedMaterials[existingIndex];
             updatedMaterials[existingIndex] = {
                 ...entryWithVersion,
                 plannedVersions: { ...existing.plannedVersions, ...entryWithVersion.plannedVersions },
                 plannedQuantity: existing.plannedQuantity + entryWithVersion.plannedQuantity,
                 plannedWeight: existing.plannedWeight + entryWithVersion.plannedWeight,
                 shopQuantity: existing.shopQuantity + entryWithVersion.shopQuantity,
                 shopWeight: existing.shopWeight + entryWithVersion.shopWeight,
             };
             setMaterials(updatedMaterials);
             addLog(entry.projectId, 'UPDATE', `${entry.dong} ${entry.floor} ${entry.zone} [${entry.dataSource}] 철근 물량 업데이트`);
        } else {
            setMaterials([...materials, entryWithVersion]);
            addLog(entry.projectId, 'CREATE', `${entry.dong} ${entry.floor} ${entry.zone} [${entry.dataSource}] 철근 물량 추가`);
        }
    };

    const handleBatchAddMaterials = (entries: MaterialEntry[]) => {
        if (entries.length === 0) return;
        
        const newMaterials = [...materials];
        const affectedDongs = new Set<string>();

        entries.forEach(entry => {
            const activeVer = currentProject?.activeVersion[entry.dong] || 'Rev.0';
            if (entry.dataSource !== 'Shop') {
                entry.plannedVersions = { [activeVer]: entry.plannedWeight };
            }
            newMaterials.push(entry);
            affectedDongs.add(entry.dong);
        });

        setMaterials(newMaterials);
        const dongList = Array.from(affectedDongs).join(', ');
        addLog(entries[0].projectId, 'IMPORT', `철근 엑셀 데이터 일괄 업로드 (${entries.length}건) - ${dongList}`);
    };

    const handleDeleteMaterial = (id: string) => {
        const target = materials.find(m => m.id === id);
        if (target) {
            setMaterials(materials.filter(m => m.id !== id));
            addLog(target.projectId, 'DELETE', `${target.dong} ${target.floor} ${target.zone} 철근 물량 삭제`);
        }
    };

    // --- Concrete Logic ---

    const handleAddConcrete = (entry: ConcreteEntry) => {
        const existingIndex = concretes.findIndex(c => 
            c.projectId === entry.projectId &&
            c.dong === entry.dong &&
            c.floor === entry.floor &&
            c.zone === entry.zone &&
            c.strength === entry.strength &&
            c.type === entry.type &&
            c.dataSource === entry.dataSource
        );

        if (existingIndex >= 0) {
            const updated = [...concretes];
            updated[existingIndex].plannedVolume += entry.plannedVolume;
            updated[existingIndex].constructionVolume += entry.constructionVolume;
            setConcretes(updated);
            addLog(entry.projectId, 'UPDATE', `${entry.dong} ${entry.floor} 콘크리트 업데이트`);
        } else {
            setConcretes([...concretes, entry]);
            addLog(entry.projectId, 'CREATE', `${entry.dong} ${entry.floor} 콘크리트 추가`);
        }
    };

    const handleBatchAddConcrete = (entries: ConcreteEntry[]) => {
        const newConcretes = [...concretes];
        let updatedCount = 0;
        let createdCount = 0;

        entries.forEach(entry => {
            const existingIndex = newConcretes.findIndex(c => 
                c.projectId === entry.projectId &&
                c.dong === entry.dong &&
                c.floor === entry.floor &&
                c.zone === entry.zone &&
                c.strength === entry.strength &&
                c.type === entry.type &&
                c.dataSource === entry.dataSource
            );

            if (existingIndex >= 0) {
                // Merge Volumes
                newConcretes[existingIndex] = {
                    ...newConcretes[existingIndex],
                    plannedVolume: newConcretes[existingIndex].plannedVolume + entry.plannedVolume,
                    constructionVolume: newConcretes[existingIndex].constructionVolume + entry.constructionVolume,
                    lastUpdated: new Date().toLocaleDateString()
                };
                updatedCount++;
            } else {
                newConcretes.push(entry);
                createdCount++;
            }
        });

        setConcretes(newConcretes);
        addLog(entries[0].projectId, 'IMPORT', `콘크리트 일괄 업로드 (신규: ${createdCount}, 병합: ${updatedCount})`);
    };

    const handleDeleteConcrete = (id: string) => {
        setConcretes(concretes.filter(c => c.id !== id));
    };

    // Issue Handlers
    const handleAddIssue = (issue: Issue) => {
        setIssues([issue, ...issues]);
        addLog(issue.projectId, 'CREATE', `이슈 등록: ${issue.title}`);
    };

    const handleUpdateIssueStatus = (id: string, status: IssueStatus) => {
        setIssues(issues.map(i => i.id === id ? { ...i, status } : i));
    };

    const handleDeleteIssue = (id: string) => {
        setIssues(issues.map(i => i.id === id ? { ...i, isDeleted: true } : i));
        const issue = issues.find(i => i.id === id);
        if (issue) addLog(issue.projectId, 'DELETE', `이슈 삭제 (휴지통 이동): ${issue.title}`);
    };

    const handleRestoreIssue = (id: string) => {
        setIssues(issues.map(i => i.id === id ? { ...i, isDeleted: false } : i));
        const issue = issues.find(i => i.id === id);
        if (issue) addLog(issue.projectId, 'UPDATE', `이슈 복구: ${issue.title}`);
    };

    const handlePermanentDeleteIssue = (id: string) => {
        setIssues(issues.filter(i => i.id !== id));
    };

    // Order Handlers
    const handleAddOrder = (order: Order) => {
        setOrders([order, ...orders]);
        addLog(order.projectId, 'CREATE', `철근 발주 등록: ${order.title}`);
    };

    const handleUpdateOrder = (updatedOrder: Order) => {
        setOrders(orders.map(o => o.id === updatedOrder.id ? updatedOrder : o));
        addLog(updatedOrder.projectId, 'UPDATE', `발주 내역 수정: ${updatedOrder.title}`);
    };

    const handleUpdateOrderStatus = (id: string, status: OrderStatus) => {
        const order = orders.find(o => o.id === id);
        if (order) {
            setOrders(orders.map(o => o.id === id ? { ...o, status } : o));
            addLog(order.projectId, 'UPDATE', `발주 상태 변경 (${order.title}): ${status}`);
        }
    };

    const handleDeleteOrder = (id: string) => {
        const order = orders.find(o => o.id === id);
        if (order) {
            setOrders(orders.filter(o => o.id !== id));
            addLog(order.projectId, 'DELETE', `발주 내역 삭제: ${order.title}`);
        }
    };

    const addLog = (projectId: string, action: HistoryLog['action'], description: string) => {
        if (!currentUser) return;
        const newLog: HistoryLog = {
            id: Date.now().toString(),
            projectId,
            action,
            description,
            user: currentUser.name,
            timestamp: new Date().toISOString()
        };
        setLogs(prev => [newLog, ...prev]);
    };

    if (!currentUser) {
        return <Login onLogin={handleLogin} registeredUsers={registeredUsers} onRegister={handleRegister} />;
    }

    if (!currentProject) {
        return (
            <ProjectList 
                projects={projects}
                materials={materials} 
                user={currentUser}
                onSelectProject={handleSelectProject}
                onCreateProject={handleCreateProject}
                onJoinProject={(code) => handleJoinProject(code)}
                onSoftDeleteProject={handleMoveToTrash}
                onRestoreProject={handleRestoreProject}
                onPermanentDeleteProject={handlePermanentDeleteProject}
                onLogout={handleLogout}
            />
        );
    }

    return (
        <Router>
            <div className="flex bg-slate-50 min-h-screen font-sans">
                <Sidebar 
                    currentProject={currentProject} 
                    user={currentUser}
                    onExitProject={handleExitProject}
                />
                
                <main className="flex-1 ml-64 p-8 overflow-x-hidden">
                    <Routes>
                        <Route path="/" element={<Dashboard currentProject={currentProject} materials={materials} />} />
                        <Route 
                            path="/projects" 
                            element={
                                <ProjectSettings 
                                    currentProject={currentProject} 
                                    user={currentUser}
                                    onUpdateProject={handleUpdateProject} 
                                />
                            } 
                        />
                         <Route 
                            path="/members" 
                            element={
                                <MemberManagement 
                                    currentProject={currentProject} 
                                    user={currentUser}
                                    onUpdateRole={handleUpdateMemberRole}
                                    onRemoveMember={handleRemoveMember}
                                />
                            } 
                        />
                        
                        {/* Rebar Material Input Sub-routes */}
                        <Route path="/input" 
                            element={
                                <MaterialInput 
                                    currentProject={currentProject} 
                                    user={currentUser}
                                    materials={materials} 
                                    onAddMaterial={handleAddMaterial}
                                    onBatchAddMaterials={handleBatchAddMaterials}
                                    onDeleteMaterial={handleDeleteMaterial}
                                    onCreateVersion={handleCreateVersion}
                                    onSwitchVersion={handleSwitchVersion}
                                    defaultTab="overview"
                                />
                            } 
                        />
                        <Route path="/input/design" 
                            element={
                                <MaterialInput 
                                    currentProject={currentProject} 
                                    user={currentUser}
                                    materials={materials} 
                                    onAddMaterial={handleAddMaterial}
                                    onBatchAddMaterials={handleBatchAddMaterials}
                                    onDeleteMaterial={handleDeleteMaterial}
                                    onCreateVersion={handleCreateVersion}
                                    onSwitchVersion={handleSwitchVersion}
                                    defaultTab="design"
                                />
                            } 
                        />
                        <Route path="/input/shop" 
                            element={
                                <MaterialInput 
                                    currentProject={currentProject} 
                                    user={currentUser}
                                    materials={materials} 
                                    onAddMaterial={handleAddMaterial}
                                    onBatchAddMaterials={handleBatchAddMaterials}
                                    onDeleteMaterial={handleDeleteMaterial}
                                    onCreateVersion={handleCreateVersion}
                                    onSwitchVersion={handleSwitchVersion}
                                    defaultTab="shop"
                                />
                            } 
                        />

                        {/* Concrete Material Routes */}
                        <Route path="/concrete" 
                            element={
                                <ConcreteInput 
                                    currentProject={currentProject} 
                                    user={currentUser}
                                    concretes={concretes}
                                    onAddConcrete={handleAddConcrete}
                                    onBatchAddConcrete={handleBatchAddConcrete}
                                    onDeleteConcrete={handleDeleteConcrete}
                                    defaultTab="overview"
                                />
                            } 
                        />
                        <Route path="/concrete/design" 
                            element={
                                <ConcreteInput 
                                    currentProject={currentProject} 
                                    user={currentUser}
                                    concretes={concretes}
                                    onAddConcrete={handleAddConcrete}
                                    onBatchAddConcrete={handleBatchAddConcrete}
                                    onDeleteConcrete={handleDeleteConcrete}
                                    defaultTab="design"
                                />
                            } 
                        />
                        <Route path="/concrete/construction" 
                            element={
                                <ConcreteInput 
                                    currentProject={currentProject} 
                                    user={currentUser}
                                    concretes={concretes}
                                    onAddConcrete={handleAddConcrete}
                                    onBatchAddConcrete={handleBatchAddConcrete}
                                    onDeleteConcrete={handleDeleteConcrete}
                                    defaultTab="construction"
                                />
                            } 
                        />

                        <Route path="/orders"
                            element={
                                <OrderManagement
                                    currentProject={currentProject}
                                    user={currentUser}
                                    orders={orders}
                                    onAddOrder={handleAddOrder}
                                    onUpdateOrder={handleUpdateOrder}
                                    onUpdateStatus={handleUpdateOrderStatus}
                                    onDeleteOrder={handleDeleteOrder}
                                />
                            }
                        />
                        <Route path="/issues" 
                            element={
                                <IssueTracker 
                                    currentProject={currentProject} 
                                    user={currentUser}
                                    issues={issues}
                                    onAddIssue={handleAddIssue}
                                    onUpdateStatus={handleUpdateIssueStatus}
                                    onDeleteIssue={handleDeleteIssue}
                                    onRestoreIssue={handleRestoreIssue}
                                    onPermanentDeleteIssue={handlePermanentDeleteIssue}
                                />
                            } 
                        />
                        <Route path="/history" element={<HistoryLogViewer logs={logs.filter(l => l.projectId === currentProject.id)} />} />
                        
                        <Route path="/3d-viewer" element={<ThreeDViewer />} />

                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </main>
            </div>
        </Router>
    );
}
