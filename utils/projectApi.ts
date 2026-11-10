import { supabase } from './supabase';
import { Project, ProjectMember, ProjectRole, User } from '../types';
import { isLocalMode, LOCAL_ADMIN } from './localMode';
import * as local from './projectApiLocal';

const PROJECT_SELECT = '*, project_members(user_id, role, joined_at, profiles(email, name))';

// DB 행(snake_case, 멤버는 별도 테이블) -> 화면에서 쓰는 Project 형태
const toProject = (row: any): Project => ({
    id: row.id,
    name: row.name,
    location: row.location,
    buildings: row.buildings ?? [],
    startDate: row.start_date ?? '',
    endDate: row.end_date ?? '',
    status: row.status,
    inviteCode: row.invite_code,
    isDeleted: row.is_deleted,
    versions: row.versions ?? [],
    activeVersion: row.active_version ?? {},
    members: (row.project_members ?? [])
        .map((m: any): ProjectMember => ({
            uid: m.user_id,
            userId: m.profiles?.email ?? m.user_id,
            userName: m.profiles?.name ?? '(알 수 없음)',
            role: m.role,
            joinedAt: m.joined_at
        }))
        .sort((a: ProjectMember, b: ProjectMember) => a.joinedAt.localeCompare(b.joinedAt))
});

// RLS에 막힌 수정/삭제는 오류 없이 0건 처리되므로, 반영된 행이 없으면 실패로 본다.
const assertChanged = (rows: unknown[] | null) => {
    if (!rows || rows.length === 0) throw new Error('권한이 없거나 대상을 찾을 수 없습니다.');
};

export async function fetchProfile(userId: string): Promise<User> {
    if (isLocalMode) return LOCAL_ADMIN;
    const { data, error } = await supabase
        .from('profiles')
        .select('id, email, name, role')
        .eq('id', userId)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('사용자 프로필을 찾을 수 없습니다.');
    return { id: data.id, email: data.email, name: data.name, role: data.role };
}

export async function fetchProjects(): Promise<Project[]> {
    if (isLocalMode) return local.fetchProjects();
    const { data, error } = await supabase
        .from('projects')
        .select(PROJECT_SELECT)
        .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(toProject);
}

export async function fetchProject(id: string): Promise<Project> {
    const { data, error } = await supabase.from('projects').select(PROJECT_SELECT).eq('id', id).single();
    if (error) throw error;
    return toProject(data);
}

export async function createProject(input: Pick<Project, 'name' | 'location' | 'startDate' | 'endDate'>): Promise<Project> {
    if (isLocalMode) return local.createProject(input);
    const { data, error } = await supabase.rpc('create_project', {
        p_name: input.name,
        p_location: input.location,
        p_start_date: input.startDate || null,
        p_end_date: input.endDate || null
    });
    if (error) throw error;
    return fetchProject(data as string);
}

// 초대 코드가 유효하지 않으면 null
export async function joinProject(code: string): Promise<{ project: Project; alreadyMember: boolean } | null> {
    if (isLocalMode) return local.joinProject(code);
    const { data, error } = await supabase.rpc('join_project', { p_code: code });
    if (error) throw error;
    if (!data) return null;
    const project = await fetchProject(data.project_id);
    return { project, alreadyMember: data.already_member };
}

export async function updateProject(project: Project): Promise<void> {
    if (isLocalMode) return local.updateProject(project);
    const { data, error } = await supabase
        .from('projects')
        .update({
            name: project.name,
            location: project.location,
            buildings: project.buildings,
            start_date: project.startDate || null,
            end_date: project.endDate || null,
            status: project.status,
            versions: project.versions,
            active_version: project.activeVersion
        })
        .eq('id', project.id)
        .select('id');
    if (error) throw error;
    assertChanged(data);
}

export async function setProjectDeleted(id: string, isDeleted: boolean): Promise<void> {
    if (isLocalMode) return local.setProjectDeleted(id, isDeleted);
    const { data, error } = await supabase
        .from('projects')
        .update({ is_deleted: isDeleted })
        .eq('id', id)
        .select('id');
    if (error) throw error;
    assertChanged(data);
}

export async function deleteProject(id: string): Promise<void> {
    if (isLocalMode) return local.deleteProject(id);
    const { data, error } = await supabase.from('projects').delete().eq('id', id).select('id');
    if (error) throw error;
    assertChanged(data);
}

export async function updateMemberRole(projectId: string, uid: string, role: ProjectRole): Promise<void> {
    if (isLocalMode) return local.updateMemberRole(projectId, uid, role);
    const { data, error } = await supabase
        .from('project_members')
        .update({ role })
        .eq('project_id', projectId)
        .eq('user_id', uid)
        .select('user_id');
    if (error) throw error;
    assertChanged(data);
}

export async function removeMember(projectId: string, uid: string): Promise<void> {
    if (isLocalMode) return local.removeMember(projectId, uid);
    const { data, error } = await supabase
        .from('project_members')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', uid)
        .select('user_id');
    if (error) throw error;
    assertChanged(data);
}
