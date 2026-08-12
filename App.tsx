
import React from 'react'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useLocalStorage } from './hooks/useLocalStorage';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { ProjectSettings } from './components/ProjectSettings';
import { MaterialInput } from './components/MaterialInput';
import { ConcreteInput } from './components/ConcreteInput';
import { HistoryLogViewer } from './components/HistoryLog';
import { Login, UserAccount } from './components/Login';
import { ProjectList } from './components/ProjectList';
import { IssueTracker } from './components/IssueTracker';
import { InspectionTracker } from './components/InspectionTracker';
import { ShopDrawingBox } from './components/ShopDrawingBox';
import { OrderManagement } from './components/OrderManagement';
import { MemberManagement } from './components/MemberManagement';
import { ThreeDViewer } from './components/ThreeDViewer';
import { Project, MaterialEntry, ConcreteEntry, HistoryLog, User, Issue, IssueStatus, Order, OrderStatus, ProjectRole, Inspection, InspectionResult, ShopDrawing } from './types';

// Default Admin Account
const INITIAL_USERS: UserAccount[] = [
    { id: 'admin', email: 'admin', password: '000000', name: '관리자(Admin)', role: 'admin' }
];


export default function App() {
    // Auth State (localStorage 영구 저장)
    const [currentUser, setCurrentUser] = useLocalStorage<User | null>('rbm_v2_currentUser', null);
    const [registeredUsers, setRegisteredUsers] = useLocalStorage<UserAccount[]>('rbm_v2_users', INITIAL_USERS);

    // Data State (localStorage 영구 저장)
    const [projects, setProjects] = useLocalStorage<Project[]>('rbm_v2_projects', []);
    const [currentProjectId, setCurrentProjectId] = useLocalStorage<string | null>('rbm_v2_currentProjectId', null);
    const [materials, setMaterials] = useLocalStorage<MaterialEntry[]>('rbm_v2_materials', []);
    const [concretes, setConcretes] = useLocalStorage<ConcreteEntry[]>('rbm_v2_concretes', []);
    const [logs, setLogs] = useLocalStorage<HistoryLog[]>('rbm_v2_logs', []);
    const [issues, setIssues] = useLocalStorage<Issue[]>('rbm_v2_issues', []);
    const [orders, setOrders] = useLocalStorage<Order[]>('rbm_v2_orders', []);
    const [inspections, setInspections] = useLocalStorage<Inspection[]>('rbm_v2_inspections', []);
    const [drawings, setDrawings] = useLocalStorage<ShopDrawing[]>('rbm_v2_drawings', []);

    // currentProject는 projects 배열에서 파생 (항상 최신 상태 반영)
    const currentProject = projects.find(p => p.id === currentProjectId) ?? null;

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
        setCurrentProjectId(null);
    };

    const handleSelectProject = (project: Project) => {
        setCurrentProjectId(project.id);
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
                if (!currentProjectId) setCurrentProjectId(updatedProject.id);

                alert(`'${project.name}' 프로젝트에 '참여자(Participant)' 권한으로 입장했습니다.`);
            } else {
                if (!currentProjectId) setCurrentProjectId(project.id);
                alert(`이미 '${project.name}' 프로젝트의 멤버입니다.`);
            }
            return true;
        }
        return false;
    };

    const handleExitProject = () => {
        setCurrentProjectId(null);
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
        if (currentProjectId === id) setCurrentProjectId(null);
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

    // Inspection Handlers
    const handleAddInspection = (inspection: Inspection) => {
        setInspections([inspection, ...inspections]);
        addLog(inspection.projectId, 'CREATE', `검측 등록: ${inspection.dong} ${inspection.floor} ${inspection.zone}`);
    };

    const handleUpdateInspectionResult = (id: string, result: InspectionResult) => {
        setInspections(inspections.map(i => i.id === id ? { ...i, result } : i));
    };

    const handleDeleteInspection = (id: string) => {
        setInspections(inspections.map(i => i.id === id ? { ...i, isDeleted: true } : i));
        const inspection = inspections.find(i => i.id === id);
        if (inspection) addLog(inspection.projectId, 'DELETE', `검측 삭제 (휴지통 이동): ${inspection.dong} ${inspection.floor} ${inspection.zone}`);
    };

    const handleRestoreInspection = (id: string) => {
        setInspections(inspections.map(i => i.id === id ? { ...i, isDeleted: false } : i));
        const inspection = inspections.find(i => i.id === id);
        if (inspection) addLog(inspection.projectId, 'UPDATE', `검측 복구: ${inspection.dong} ${inspection.floor} ${inspection.zone}`);
    };

    const handlePermanentDeleteInspection = (id: string) => {
        setInspections(inspections.filter(i => i.id !== id));
    };

    // Shop Drawing Handlers
    // NOTE: uses the functional setState form (not `[drawing, ...drawings]`) because
    // batch uploads call this in a tight loop without a re-render in between --
    // a closure over the outer `drawings` would drop all but the last call.
    const handleAddDrawing = (drawing: ShopDrawing) => {
        setDrawings(prev => [drawing, ...prev]);
        addLog(drawing.projectId, 'CREATE', `샵도면 업로드: ${drawing.title}`);
    };

    const handleUpdateDrawing = (updated: ShopDrawing) => {
        setDrawings(prev => prev.map(d => d.id === updated.id ? updated : d));
    };

    const handleDeleteDrawing = (id: string) => {
        const drawing = drawings.find(d => d.id === id);
        setDrawings(prev => prev.filter(d => d.id !== id));
        if (drawing) addLog(drawing.projectId, 'DELETE', `샵도면 삭제: ${drawing.title}`);
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
                        <Route path="/inspection"
                            element={
                                <InspectionTracker
                                    currentProject={currentProject}
                                    user={currentUser}
                                    inspections={inspections}
                                    onAddInspection={handleAddInspection}
                                    onUpdateResult={handleUpdateInspectionResult}
                                    onDeleteInspection={handleDeleteInspection}
                                    onRestoreInspection={handleRestoreInspection}
                                    onPermanentDeleteInspection={handlePermanentDeleteInspection}
                                />
                            }
                        />
                        <Route path="/inspection/drawings"
                            element={
                                <ShopDrawingBox
                                    currentProject={currentProject}
                                    user={currentUser}
                                    drawings={drawings}
                                    onAddDrawing={handleAddDrawing}
                                    onUpdateDrawing={handleUpdateDrawing}
                                    onDeleteDrawing={handleDeleteDrawing}
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
