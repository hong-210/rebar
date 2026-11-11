
import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react'; // eslint-disable-line @typescript-eslint/no-unused-vars
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useLocalStorage } from './hooks/useLocalStorage';
import { supabase, isSupabaseConfigured } from './utils/supabase';
import { isLocalMode, LOCAL_ADMIN } from './utils/localMode';
import { newId } from './utils/id';
import * as projectApi from './utils/projectApi';
import { materialsTable, concretesTable, logsTable, issuesTable, ordersTable, inspectionsTable, drawingsTable } from './utils/dataApi';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { ProjectSettings } from './components/ProjectSettings';
import { MaterialInput } from './components/MaterialInput';
import { ConcreteInput } from './components/ConcreteInput';
import { HistoryLogViewer } from './components/HistoryLog';
import { Login } from './components/Login';
import { ProjectList } from './components/ProjectList';
import { IssueTracker } from './components/IssueTracker';
import { InspectionTracker } from './components/InspectionTracker';
import { ShopDrawingBox } from './components/ShopDrawingBox';
import { OrderManagement } from './components/OrderManagement';
import { MemberManagement } from './components/MemberManagement';
// three.js가 커서 3D 화면을 열 때만 불러온다
const ThreeDViewer = lazy(() => import('./components/ThreeDViewer').then(m => ({ default: m.ThreeDViewer })));
import { Project, MaterialEntry, ConcreteEntry, HistoryLog, User, Issue, IssueStatus, Order, OrderStatus, ProjectRole, Inspection, InspectionResult, ShopDrawing, BatchUploadResult, UploadMode } from './types';

const errorMessage = (err: unknown) =>
    err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : String(err);

const FullScreenMessage: React.FC<{ title: string; children?: React.ReactNode }> = ({ title, children }) => (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8 text-center space-y-4">
            <h1 className="text-lg font-bold text-slate-800">{title}</h1>
            {children}
        </div>
    </div>
);


export default function App() {
    // Auth State (Supabase 세션)
    const [authUserId, setAuthUserId] = useState<string | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    // Data State (Supabase DB에 저장, 로그인 시 불러온다)
    const [projects, setProjects] = useState<Project[]>([]);
    const [materials, setMaterials] = useState<MaterialEntry[]>([]);
    const [concretes, setConcretes] = useState<ConcreteEntry[]>([]);
    const [logs, setLogs] = useState<HistoryLog[]>([]);
    const [issues, setIssues] = useState<Issue[]>([]);
    const [orders, setOrders] = useState<Order[]>([]);
    const [inspections, setInspections] = useState<Inspection[]>([]);
    const [drawings, setDrawings] = useState<ShopDrawing[]>([]);

    // 마지막으로 연 프로젝트만 브라우저에 기억한다
    const [currentProjectId, setCurrentProjectId] = useLocalStorage<string | null>('rbm_v2_currentProjectId', null);

    // currentProject는 projects 배열에서 파생 (항상 최신 상태 반영)
    // 휴지통에 있는 프로젝트는 열 수 없다 (다른 멤버가 삭제한 경우 포함)
    const currentProject = projects.find(p => p.id === currentProjectId && !p.isDeleted) ?? null;

    // 세션 변화 구독. 콜백 안에서 supabase를 다시 호출하면 교착될 수 있어 id만 저장하고,
    // 실제 데이터 로딩은 아래 effect에서 한다.
    // 로컬 모드는 로그인 없이 관리자 계정으로 바로 들어간다.
    useEffect(() => {
        if (isLocalMode) {
            setAuthUserId(LOCAL_ADMIN.id!);
            setAuthReady(true);
            return;
        }
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            setAuthUserId(session?.user.id ?? null);
            setAuthReady(true);
        });
        return () => data.subscription.unsubscribe();
    }, []);

    const loadUserData = useCallback(async (userId: string) => {
        const [
            profile, projectList, materialList, concreteList, logList, issueList, orderList, inspectionList, drawingList
        ] = await Promise.all([
            projectApi.fetchProfile(userId),
            projectApi.fetchProjects(),
            materialsTable.fetchAll(),
            concretesTable.fetchAll(),
            logsTable.fetchAll(),
            issuesTable.fetchAll(),
            ordersTable.fetchAll(),
            inspectionsTable.fetchAll(),
            drawingsTable.fetchAll()
        ]);
        setProjects(projectList);
        setMaterials(materialList);
        setConcretes(concreteList);
        setLogs(logList);
        setIssues(issueList);
        setOrders(orderList);
        setInspections(inspectionList);
        setDrawings(drawingList);
        setCurrentUser(profile);
    }, []);

    useEffect(() => {
        setLoadError(null);
        if (!authUserId) {
            setCurrentUser(null);
            setProjects([]);
            setMaterials([]);
            setConcretes([]);
            setLogs([]);
            setIssues([]);
            setOrders([]);
            setInspections([]);
            setDrawings([]);
            return;
        }
        let cancelled = false;
        loadUserData(authUserId).catch(err => {
            if (!cancelled) setLoadError(errorMessage(err));
        });
        return () => { cancelled = true; };
    }, [authUserId, loadUserData]);

    // 화면은 먼저 바꾸고(낙관적 갱신) DB에 저장한다. 실패하면 알리고 DB 기준으로 되돌린다.
    const persist = (save: Promise<void>) => {
        save.catch(err => {
            alert(`저장에 실패했습니다.\n${errorMessage(err)}`);
            if (authUserId) loadUserData(authUserId).catch(() => {});
        });
    };

    const handleLogout = () => {
        setCurrentProjectId(null);
        supabase.auth.signOut();
    };

    const handleSelectProject = (project: Project) => {
        setCurrentProjectId(project.id);
    };

    // Allow joining existing projects via code
    const handleJoinProject = async (code: string) => {
        try {
            const result = await projectApi.joinProject(code);
            if (!result) return false;

            const { project, alreadyMember } = result;
            setProjects(prev => prev.some(p => p.id === project.id)
                ? prev.map(p => p.id === project.id ? project : p)
                : [...prev, project]);
            setCurrentProjectId(project.id);

            alert(alreadyMember
                ? `이미 '${project.name}' 프로젝트의 멤버입니다.`
                : `'${project.name}' 프로젝트에 '참여자(Participant)' 권한으로 입장했습니다.`);
            return true;
        } catch (err) {
            alert(`프로젝트 입장에 실패했습니다.\n${errorMessage(err)}`);
            return true; // 코드 오류 안내가 중복으로 뜨지 않도록
        }
    };

    const handleExitProject = () => {
        setCurrentProjectId(null);
    };

    // 초대 코드 발급과 생성자 Admin 등록은 DB(create_project)에서 처리한다.
    const handleCreateProject = async (newProject: Project) => {
        try {
            const created = await projectApi.createProject(newProject);
            setProjects(prev => [...prev, created]);
        } catch (err) {
            alert(`프로젝트 생성에 실패했습니다.\n${errorMessage(err)}`);
        }
    };

    // --- Soft Delete, Restore, Permanent Delete Logic ---

    // Soft Delete (Move to Trash)
    const handleMoveToTrash = (id: string) => {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, isDeleted: true } : p));
        if (currentProjectId === id) setCurrentProjectId(null);
        persist(projectApi.setProjectDeleted(id, true));
    };

    // Restore from Trash
    const handleRestoreProject = (id: string) => {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, isDeleted: false } : p));
        persist(projectApi.setProjectDeleted(id, false));
    };

    // Permanent Delete
    const handlePermanentDeleteProject = (id: string) => {
        setProjects(prev => prev.filter(p => p.id !== id));
        persist(projectApi.deleteProject(id));
        // Note: Ideally, clean up materials/issues/logs here too, but for now we remove the project entry.
    };

    const handleUpdateProject = (updatedProject: Project) => {
        setProjects(projects.map(p => p.id === updatedProject.id ? updatedProject : p));
        persist(projectApi.updateProject(updatedProject));
        addLog(updatedProject.id, 'UPDATE', `프로젝트 정보 수정: ${updatedProject.name}`);
    };

    const handleUpdateMemberRole = (projectId: string, userId: string, newRole: ProjectRole) => {
        const project = projects.find(p => p.id === projectId);
        if (!project) return;

        const member = project.members.find(m => m.userId === userId);
        if (!member?.uid) return;

        const updatedMembers = project.members.map(m =>
            m.userId === userId ? { ...m, role: newRole } : m
        );

        const updatedProject = { ...project, members: updatedMembers };
        setProjects(prev => prev.map(p => p.id === projectId ? updatedProject : p));
        persist(projectApi.updateMemberRole(projectId, member.uid, newRole));
        addLog(projectId, 'UPDATE', `멤버 권한 변경 (${userId} -> ${newRole})`);
    };

    const handleRemoveMember = (projectId: string, userId: string) => {
        const project = projects.find(p => p.id === projectId);
        if (!project) return;

        const member = project.members.find(m => m.userId === userId);
        if (!member?.uid) return;

        const updatedMembers = project.members.filter(m => m.userId !== userId);
        const updatedProject = { ...project, members: updatedMembers };
        setProjects(prev => prev.map(p => p.id === projectId ? updatedProject : p));
        persist(projectApi.removeMember(projectId, member.uid));
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
        persist(projectApi.updateProject(updatedProject));

        // 2. Snapshot Materials
        const changed: MaterialEntry[] = [];
        const updatedMaterials = materials.map(m => {
            if (m.projectId === projectId && m.dong === dong && m.dataSource !== 'Shop') {
                const updated = {
                    ...m,
                    plannedVersions: {
                        ...m.plannedVersions,
                        [versionName]: m.plannedWeight
                    }
                };
                changed.push(updated);
                return updated;
            }
            return m;
        });
        setMaterials(updatedMaterials);
        persist(materialsTable.upsert(changed));

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
        persist(projectApi.updateProject(updatedProject));

        // 2. Restore Material Weights
        const changed: MaterialEntry[] = [];
        const updatedMaterials = materials.map(m => {
            if (m.projectId === projectId && m.dong === dong && m.dataSource !== 'Shop') {
                const historicWeight = m.plannedVersions[versionName] || 0;
                const updated = {
                    ...m,
                    plannedWeight: historicWeight
                };
                changed.push(updated);
                return updated;
            }
            return m;
        });
        setMaterials(updatedMaterials);
        persist(materialsTable.upsert(changed));
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
            m.dataSource === entryWithVersion.dataSource &&
            (m.itemType ?? 'Rebar') === (entryWithVersion.itemType ?? 'Rebar') // 수기 입력 철근이 커플러 행에 더해지지 않도록
        );

        if (existingIndex >= 0) {
             const updatedMaterials = [...materials];
             const existing = updatedMaterials[existingIndex];
             updatedMaterials[existingIndex] = {
                 ...entryWithVersion,
                 id: existing.id, // 기존 행을 수정하는 것이므로 id는 유지해야 DB에 중복 행이 생기지 않는다
                 plannedVersions: { ...existing.plannedVersions, ...entryWithVersion.plannedVersions },
                 plannedQuantity: existing.plannedQuantity + entryWithVersion.plannedQuantity,
                 plannedWeight: existing.plannedWeight + entryWithVersion.plannedWeight,
                 shopQuantity: existing.shopQuantity + entryWithVersion.shopQuantity,
                 shopWeight: existing.shopWeight + entryWithVersion.shopWeight,
             };
             setMaterials(updatedMaterials);
             persist(materialsTable.upsert([updatedMaterials[existingIndex]]));
             addLog(entry.projectId, 'UPDATE', `${entry.dong} ${entry.floor} ${entry.zone} [${entry.dataSource}] 철근 물량 업데이트`);
        } else {
            setMaterials([...materials, entryWithVersion]);
            persist(materialsTable.upsert([entryWithVersion]));
            addLog(entry.projectId, 'CREATE', `${entry.dong} ${entry.floor} ${entry.zone} [${entry.dataSource}] 철근 물량 추가`);
        }
    };

    // 엑셀 일괄 업로드. 같은 파일을 다시 올려도 물량이 누적되지 않도록
    // 동/층/Zone/직경/강종/구분이 같은 기존 물량은 더하지 않고 새 값으로 덮어쓴다.
    // 이전 업로드로 같은 키의 행이 여러 개 쌓여 있었다면 하나만 남기고 정리한다.
    // replaceDongs를 주면(교체 업로드) 그 동들의 같은 구분(실행/SHOP) 기존 물량을 모두 비우고 파일 내용으로 새로 채운다.
    const handleBatchAddMaterials = (entries: MaterialEntry[], mode: UploadMode): BatchUploadResult => {
        const result: BatchUploadResult = { created: 0, replaced: 0, merged: 0, duplicatesRemoved: 0, cleared: 0 };
        if (entries.length === 0) return result;

        const source = entries[0].dataSource ?? 'Design';
        // 교체면 파일에 든 동들의 같은 구분 기존 물량을 먼저 비운다
        const clearDongs = new Set(mode === 'replace' ? entries.map(e => e.dong) : []);
        const isCleared = (m: MaterialEntry) =>
            m.projectId === entries[0].projectId && clearDongs.has(m.dong) && (m.dataSource ?? 'Design') === source;
        const clearedIds = materials.filter(isCleared).map(m => m.id);
        result.cleared = clearedIds.length;
        const base = materials.filter(m => !isCleared(m));

        const keyOf = (m: MaterialEntry) =>
            [m.projectId, m.dong, m.floor, m.zone, m.diameter, m.strength, m.dataSource ?? 'Design', m.itemType ?? 'Rebar', m.memberClass ?? ''].join('|');

        const existingByKey = new Map<string, MaterialEntry[]>();
        base.forEach(m => {
            const key = keyOf(m);
            existingByKey.set(key, [...(existingByKey.get(key) ?? []), m]);
        });

        const replacements = new Map<string, MaterialEntry>(); // 덮어쓸 기존 행 id -> 새 행
        const removedIds: string[] = [];
        const added: MaterialEntry[] = [];
        const affectedDongs = new Set<string>();

        entries.forEach(entry => {
            const activeVer = currentProject?.activeVersion[entry.dong] || 'Rev.0';
            if (entry.dataSource !== 'Shop') {
                entry.plannedVersions = { [activeVer]: entry.plannedWeight };
            }
            affectedDongs.add(entry.dong);

            const [first, ...extras] = existingByKey.get(keyOf(entry)) ?? [];
            if (!first) {
                added.push(entry);
                result.created++;
                return;
            }
            if (mode === 'add') {
                // 기존 값에 파일 값을 더한다 (현재 버전의 실행 물량 기록도 함께 더함)
                const sum = (a?: number, b?: number) => Number(((a ?? 0) + (b ?? 0)).toFixed(2));
                const activeVersions = entry.dataSource !== 'Shop'
                    ? { [activeVer]: sum(first.plannedVersions?.[activeVer], entry.plannedWeight) }
                    : {};
                replacements.set(first.id, {
                    ...first,
                    plannedWeight: sum(first.plannedWeight, entry.plannedWeight),
                    shopWeight: sum(first.shopWeight, entry.shopWeight),
                    plannedQuantity: sum(first.plannedQuantity, entry.plannedQuantity),
                    shopQuantity: sum(first.shopQuantity, entry.shopQuantity),
                    plannedVersions: { ...first.plannedVersions, ...activeVersions },
                    lastUpdated: entry.lastUpdated
                });
                result.merged++;
            } else {
                // 기존 행 id를 유지하고, 다른 버전(Rev)의 실행 물량 기록은 보존한다
                replacements.set(first.id, {
                    ...entry,
                    id: first.id,
                    plannedVersions: { ...first.plannedVersions, ...entry.plannedVersions }
                });
                result.replaced++;
            }
            extras.forEach(m => removedIds.push(m.id));
            result.duplicatesRemoved += extras.length;
        });

        const removed = new Set(removedIds);
        setMaterials([
            ...base.filter(m => !removed.has(m.id)).map(m => replacements.get(m.id) ?? m),
            ...added
        ]);
        persist((async () => {
            const toRemove = [...clearedIds, ...removedIds];
            if (toRemove.length > 0) await materialsTable.removeMany(toRemove);
            await materialsTable.upsert([...replacements.values(), ...added]);
        })());

        const dongList = Array.from(affectedDongs).join(', ');
        const duplicateInfo = result.duplicatesRemoved > 0 ? `, 중복 ${result.duplicatesRemoved}건 정리` : '';
        const label = source === 'Design' ? '실행' : 'SHOP';
        const summary = mode === 'replace'
            ? `교체 업로드 - 기존 ${label} ${result.cleared}건 삭제 후 ${result.created}건 반영`
            : mode === 'add'
                ? `추가 업로드 - 신규 ${result.created}건, 기존 물량에 더하기 ${result.merged}건${duplicateInfo}`
                : `신규 ${result.created}건, 덮어쓰기 ${result.replaced}건${duplicateInfo}`;
        addLog(entries[0].projectId, 'IMPORT', `철근 엑셀 데이터 일괄 업로드 (${summary}) - ${dongList}`);
        return result;
    };

    const handleDeleteMaterial = (id: string) => {
        const target = materials.find(m => m.id === id);
        if (target) {
            setMaterials(materials.filter(m => m.id !== id));
            persist(materialsTable.remove(id));
            addLog(target.projectId, 'DELETE', `${target.dong} ${target.floor} ${target.zone} 철근 물량 삭제`);
        }
    };

    // 한 동의 실행 또는 SHOP 물량 전체 삭제 (다른 동, 다른 구분은 그대로)
    const handleDeleteAllMaterials = (projectId: string, dataSource: 'Design' | 'Shop', dong: string) => {
        // 구분이 없는 예전 데이터는 실행 물량으로 본다
        const isTarget = (m: MaterialEntry) =>
            m.projectId === projectId && m.dong === dong && (m.dataSource ?? 'Design') === dataSource;
        const ids = materials.filter(isTarget).map(m => m.id);
        if (ids.length === 0) return;

        setMaterials(materials.filter(m => !isTarget(m)));
        persist(materialsTable.removeMany(ids));
        const label = dataSource === 'Design' ? '실행' : 'SHOP';
        addLog(projectId, 'DELETE', `${dong} ${label} 철근 물량 전체 삭제 (${ids.length}건)`);
    };

    // 한 동의 실행 + SHOP 물량을 모두 지운다 (기준 설정에 없는 동으로 잘못 들어간 물량 정리용)
    const handleDeleteMaterialsOfDong = (projectId: string, dong: string) => {
        const isTarget = (m: MaterialEntry) => m.projectId === projectId && m.dong === dong;
        const ids = materials.filter(isTarget).map(m => m.id);
        if (ids.length === 0) return;

        setMaterials(materials.filter(m => !isTarget(m)));
        persist(materialsTable.removeMany(ids));
        addLog(projectId, 'DELETE', `설정에 없는 동 '${dong}' 철근 물량 삭제 (${ids.length}건)`);
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
            updated[existingIndex] = {
                ...updated[existingIndex],
                plannedVolume: updated[existingIndex].plannedVolume + entry.plannedVolume,
                constructionVolume: updated[existingIndex].constructionVolume + entry.constructionVolume
            };
            setConcretes(updated);
            persist(concretesTable.upsert([updated[existingIndex]]));
            addLog(entry.projectId, 'UPDATE', `${entry.dong} ${entry.floor} 콘크리트 업데이트`);
        } else {
            setConcretes([...concretes, entry]);
            persist(concretesTable.upsert([entry]));
            addLog(entry.projectId, 'CREATE', `${entry.dong} ${entry.floor} 콘크리트 추가`);
        }
    };

    const handleBatchAddConcrete = (entries: ConcreteEntry[]) => {
        const newConcretes = [...concretes];
        const touched = new Map<string, ConcreteEntry>(); // DB에 반영할 행 (신규 + 병합된 기존 행)
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
                touched.set(newConcretes[existingIndex].id, newConcretes[existingIndex]);
                updatedCount++;
            } else {
                newConcretes.push(entry);
                touched.set(entry.id, entry);
                createdCount++;
            }
        });

        setConcretes(newConcretes);
        persist(concretesTable.upsert([...touched.values()]));
        addLog(entries[0].projectId, 'IMPORT', `콘크리트 일괄 업로드 (신규: ${createdCount}, 병합: ${updatedCount})`);
    };

    const handleDeleteConcrete = (id: string) => {
        setConcretes(concretes.filter(c => c.id !== id));
        persist(concretesTable.remove(id));
    };

    // Issue Handlers
    const handleAddIssue = (issue: Issue) => {
        setIssues([issue, ...issues]);
        persist(issuesTable.upsert([issue]));
        addLog(issue.projectId, 'CREATE', `이슈 등록: ${issue.title}`);
    };

    // 일부 필드만 바꿔 화면과 DB에 반영하고, 바뀐 이슈를 돌려준다 (없으면 undefined)
    const patchIssue = (id: string, patch: Partial<Issue>) => {
        const issue = issues.find(i => i.id === id);
        if (!issue) return undefined;
        const updated = { ...issue, ...patch };
        setIssues(issues.map(i => i.id === id ? updated : i));
        persist(issuesTable.upsert([updated]));
        return updated;
    };

    const handleUpdateIssueStatus = (id: string, status: IssueStatus) => {
        patchIssue(id, { status });
    };

    const handleDeleteIssue = (id: string) => {
        const issue = patchIssue(id, { isDeleted: true });
        if (issue) addLog(issue.projectId, 'DELETE', `이슈 삭제 (휴지통 이동): ${issue.title}`);
    };

    const handleRestoreIssue = (id: string) => {
        const issue = patchIssue(id, { isDeleted: false });
        if (issue) addLog(issue.projectId, 'UPDATE', `이슈 복구: ${issue.title}`);
    };

    const handlePermanentDeleteIssue = (id: string) => {
        setIssues(issues.filter(i => i.id !== id));
        persist(issuesTable.remove(id));
    };

    // Inspection Handlers
    const handleAddInspection = (inspection: Inspection) => {
        setInspections([inspection, ...inspections]);
        persist(inspectionsTable.upsert([inspection]));
        addLog(inspection.projectId, 'CREATE', `검측 등록: ${inspection.dong} ${inspection.floor} ${inspection.zone}`);
    };

    const patchInspection = (id: string, patch: Partial<Inspection>) => {
        const inspection = inspections.find(i => i.id === id);
        if (!inspection) return undefined;
        const updated = { ...inspection, ...patch };
        setInspections(inspections.map(i => i.id === id ? updated : i));
        persist(inspectionsTable.upsert([updated]));
        return updated;
    };

    const handleUpdateInspectionResult = (id: string, result: InspectionResult) => {
        patchInspection(id, { result });
    };

    const handleDeleteInspection = (id: string) => {
        const inspection = patchInspection(id, { isDeleted: true });
        if (inspection) addLog(inspection.projectId, 'DELETE', `검측 삭제 (휴지통 이동): ${inspection.dong} ${inspection.floor} ${inspection.zone}`);
    };

    const handleRestoreInspection = (id: string) => {
        const inspection = patchInspection(id, { isDeleted: false });
        if (inspection) addLog(inspection.projectId, 'UPDATE', `검측 복구: ${inspection.dong} ${inspection.floor} ${inspection.zone}`);
    };

    const handlePermanentDeleteInspection = (id: string) => {
        setInspections(inspections.filter(i => i.id !== id));
        persist(inspectionsTable.remove(id));
    };

    // Shop Drawing Handlers
    // NOTE: uses the functional setState form (not `[drawing, ...drawings]`) because
    // batch uploads call this in a tight loop without a re-render in between --
    // a closure over the outer `drawings` would drop all but the last call.
    const handleAddDrawing = (drawing: ShopDrawing) => {
        setDrawings(prev => [drawing, ...prev]);
        persist(drawingsTable.upsert([drawing]));
        addLog(drawing.projectId, 'CREATE', `샵도면 업로드: ${drawing.title}`);
    };

    const handleUpdateDrawing = (updated: ShopDrawing) => {
        setDrawings(prev => prev.map(d => d.id === updated.id ? updated : d));
        persist(drawingsTable.upsert([updated]));
    };

    const handleDeleteDrawing = (id: string) => {
        const drawing = drawings.find(d => d.id === id);
        setDrawings(prev => prev.filter(d => d.id !== id));
        persist(drawingsTable.remove(id));
        if (drawing) addLog(drawing.projectId, 'DELETE', `샵도면 삭제: ${drawing.title}`);
    };

    // Order Handlers
    const handleAddOrder = (order: Order) => {
        setOrders([order, ...orders]);
        persist(ordersTable.upsert([order]));
        addLog(order.projectId, 'CREATE', `철근 발주 등록: ${order.title}`);
    };

    const handleUpdateOrder = (updatedOrder: Order) => {
        setOrders(orders.map(o => o.id === updatedOrder.id ? updatedOrder : o));
        persist(ordersTable.upsert([updatedOrder]));
        addLog(updatedOrder.projectId, 'UPDATE', `발주 내역 수정: ${updatedOrder.title}`);
    };

    const handleUpdateOrderStatus = (id: string, status: OrderStatus) => {
        const order = orders.find(o => o.id === id);
        if (order) {
            const updated = { ...order, status };
            setOrders(orders.map(o => o.id === id ? updated : o));
            persist(ordersTable.upsert([updated]));
            addLog(order.projectId, 'UPDATE', `발주 상태 변경 (${order.title}): ${status}`);
        }
    };

    const handleDeleteOrder = (id: string) => {
        const order = orders.find(o => o.id === id);
        if (order) {
            setOrders(orders.filter(o => o.id !== id));
            persist(ordersTable.remove(id));
            addLog(order.projectId, 'DELETE', `발주 내역 삭제: ${order.title}`);
        }
    };

    const addLog = (projectId: string, action: HistoryLog['action'], description: string) => {
        if (!currentUser) return;
        const newLog: HistoryLog = {
            // 일괄 업로드처럼 같은 밀리초에 여러 건이 기록될 수 있어 시간 기반 id는 쓰지 않는다
            id: newId(),
            projectId,
            action,
            description,
            user: currentUser.name,
            timestamp: new Date().toISOString()
        };
        setLogs(prev => [newLog, ...prev]);
        // 이력 저장 실패는 본 작업을 막거나 되돌리지 않는다
        logsTable.insert([newLog]).catch(err => console.error('변경 이력 저장 실패', err));
    };

    if (!isLocalMode && !isSupabaseConfigured) {
        return (
            <FullScreenMessage title="Supabase 설정이 필요합니다">
                <p className="text-sm text-slate-500 leading-relaxed">
                    <code>.env.local</code> 파일에 <code>VITE_SUPABASE_URL</code>과 <code>VITE_SUPABASE_ANON_KEY</code>를
                    입력한 뒤 개발 서버를 다시 시작하세요.
                </p>
            </FullScreenMessage>
        );
    }

    if (!authReady) {
        return <FullScreenMessage title="불러오는 중..." />;
    }

    if (!authUserId) {
        return <Login />;
    }

    if (loadError) {
        return (
            <FullScreenMessage title="데이터를 불러오지 못했습니다">
                <p className="text-sm text-slate-500 break-words">{loadError}</p>
                <div className="flex gap-3 justify-center">
                    <button
                        onClick={() => {
                            setLoadError(null);
                            loadUserData(authUserId).catch(err => setLoadError(errorMessage(err)));
                        }}
                        className="bg-blue-600 text-white font-bold px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                        다시 시도
                    </button>
                    {!isLocalMode && <button
                        onClick={handleLogout}
                        className="bg-slate-100 text-slate-600 font-bold px-5 py-2.5 rounded-lg hover:bg-slate-200 transition-colors text-sm"
                    >
                        로그아웃
                    </button>}
                </div>
            </FullScreenMessage>
        );
    }

    if (!currentUser) {
        return <FullScreenMessage title="불러오는 중..." />;
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
                onLogout={isLocalMode ? undefined : handleLogout}
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
                        <Route path="/" element={<Dashboard currentProject={currentProject} user={currentUser} materials={materials} onDeleteMaterialsOfDong={handleDeleteMaterialsOfDong} />} />
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
                                    onDeleteAllMaterials={handleDeleteAllMaterials}
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
                                    onDeleteAllMaterials={handleDeleteAllMaterials}
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
                                    onDeleteAllMaterials={handleDeleteAllMaterials}
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
                        
                        <Route path="/3d-viewer" element={<Suspense fallback={<div className="p-8 text-slate-500">3D 화면 불러오는 중...</div>}><ThreeDViewer currentProject={currentProject} user={currentUser} materials={materials} onBatchAddMaterials={handleBatchAddMaterials} /></Suspense>} />

                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </main>
            </div>
        </Router>
    );
}
