import { Project, ProjectRole } from '../types';
import { LOCAL_ADMIN, readLocal, writeLocal } from './localMode';
import { newId } from './id';

// projectApi.ts 의 로컬 모드 구현. 멤버는 프로젝트 안에 함께 저장한다.
// 키 이름은 Supabase 연동 이전 버전과 같아서, 그때 만든 테스트 데이터를 그대로 불러온다.
const KEY = 'rbm_v2_projects';

// 이전 버전 데이터에는 멤버 uid가 없으므로 이메일(userId)로 채운다.
const load = (): Project[] =>
    readLocal<Project[]>(KEY, []).map(p => ({
        ...p,
        members: (p.members ?? []).map(m => ({ ...m, uid: m.uid ?? m.userId }))
    }));

const save = (projects: Project[]) => writeLocal(KEY, projects);

const update = (id: string, change: (p: Project) => Project) => {
    const projects = load();
    if (!projects.some(p => p.id === id)) throw new Error('대상을 찾을 수 없습니다.');
    save(projects.map(p => p.id === id ? change(p) : p));
};

const newInviteCode = (taken: Set<string>) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code: string;
    do {
        code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    } while (taken.has(code));
    return code;
};

export async function fetchProjects(): Promise<Project[]> {
    return load();
}

export async function createProject(input: Pick<Project, 'name' | 'location' | 'startDate' | 'endDate'>): Promise<Project> {
    const projects = load();
    const project: Project = {
        id: newId(),
        name: input.name,
        location: input.location || '미지정',
        buildings: [],
        startDate: input.startDate,
        endDate: input.endDate,
        status: 'Planning',
        inviteCode: newInviteCode(new Set(projects.map(p => p.inviteCode))),
        isDeleted: false,
        members: [{
            uid: LOCAL_ADMIN.id,
            userId: LOCAL_ADMIN.email,
            userName: LOCAL_ADMIN.name,
            role: 'Admin',
            joinedAt: new Date().toISOString()
        }],
        versions: [],
        activeVersion: {}
    };
    save([...projects, project]);
    return project;
}

export async function joinProject(code: string): Promise<{ project: Project; alreadyMember: boolean } | null> {
    const project = load().find(p => p.inviteCode === code.trim().toUpperCase() && !p.isDeleted);
    if (!project) return null;
    const alreadyMember = project.members.some(m => m.userId === LOCAL_ADMIN.email);
    if (alreadyMember) return { project, alreadyMember };

    const joined: Project = {
        ...project,
        members: [...project.members, {
            uid: LOCAL_ADMIN.id,
            userId: LOCAL_ADMIN.email,
            userName: LOCAL_ADMIN.name,
            role: 'Participant',
            joinedAt: new Date().toISOString()
        }]
    };
    update(project.id, () => joined);
    return { project: joined, alreadyMember };
}

export async function updateProject(project: Project): Promise<void> {
    // 초대 코드와 멤버는 이 경로로 바꾸지 않는다 (Supabase 구현과 동일)
    update(project.id, p => ({ ...project, inviteCode: p.inviteCode, members: p.members, isDeleted: p.isDeleted }));
}

export async function setProjectDeleted(id: string, isDeleted: boolean): Promise<void> {
    update(id, p => ({ ...p, isDeleted }));
}

export async function deleteProject(id: string): Promise<void> {
    const projects = load();
    if (!projects.some(p => p.id === id)) throw new Error('대상을 찾을 수 없습니다.');
    save(projects.filter(p => p.id !== id));
}

export async function updateMemberRole(projectId: string, uid: string, role: ProjectRole): Promise<void> {
    update(projectId, p => ({ ...p, members: p.members.map(m => m.uid === uid ? { ...m, role } : m) }));
}

export async function removeMember(projectId: string, uid: string): Promise<void> {
    update(projectId, p => ({ ...p, members: p.members.filter(m => m.uid !== uid) }));
}
