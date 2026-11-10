-- RebarMaster Pro - 1단계 스키마 (로그인 + 프로젝트 + 멤버)
-- Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 실행한다. 여러 번 실행해도 안전하다.

-- ---------------------------------------------------------------------------
-- 테이블
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text not null,
    name text not null,
    role text not null default 'viewer' check (role in ('admin', 'viewer')), -- 시스템 권한
    created_at timestamptz not null default now()
);

create table if not exists public.projects (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    location text not null default '미지정',
    buildings jsonb not null default '[]'::jsonb,
    start_date date,
    end_date date,
    status text not null default 'Planning' check (status in ('Planning', 'Active', 'Completed')),
    invite_code text not null unique,
    is_deleted boolean not null default false,
    versions jsonb not null default '[]'::jsonb,
    active_version jsonb not null default '{}'::jsonb,
    created_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now()
);

create table if not exists public.project_members (
    project_id uuid not null references public.projects (id) on delete cascade,
    user_id uuid not null references public.profiles (id) on delete cascade,
    role text not null default 'Participant' check (role in ('Admin', 'Participant', 'Guest')),
    joined_at timestamptz not null default now(),
    primary key (project_id, user_id)
);

create index if not exists project_members_user_id_idx on public.project_members (user_id);

-- ---------------------------------------------------------------------------
-- 권한 확인용 함수 (RLS 정책에서 사용, 정책 재귀를 피하려고 security definer)
-- ---------------------------------------------------------------------------

create or replace function public.is_system_admin()
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'
    );
$$;

create or replace function public.project_role(pid uuid)
returns text language sql stable security definer set search_path = '' as $$
    select role from public.project_members
    where project_id = pid and user_id = (select auth.uid());
$$;

create or replace function public.shares_project_with(other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
    select exists (
        select 1
        from public.project_members a
        join public.project_members b on a.project_id = b.project_id
        where a.user_id = (select auth.uid()) and b.user_id = other
    );
$$;

create or replace function public.generate_invite_code()
returns text language plpgsql security definer set search_path = '' as $$
declare
    chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 헷갈리는 0/O, 1/I 제외
    code text;
begin
    loop
        code := '';
        for i in 1..6 loop
            code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
        end loop;
        exit when not exists (select 1 from public.projects where invite_code = code);
    end loop;
    return code;
end;
$$;

-- ---------------------------------------------------------------------------
-- 회원가입 시 프로필 자동 생성 (+ 가입 폼에 입력한 초대 코드로 바로 입장)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
    pid uuid;
begin
    insert into public.profiles (id, email, name)
    values (
        new.id,
        new.email,
        coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1))
    )
    on conflict (id) do nothing;

    select id into pid from public.projects
    where invite_code = upper(trim(new.raw_user_meta_data ->> 'invite_code')) and not is_deleted;

    if pid is not null then
        insert into public.project_members (project_id, user_id, role)
        values (pid, new.id, 'Participant')
        on conflict do nothing;
    end if;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 프로젝트 수정 보호: 초대 코드/생성자는 변경 불가, 휴지통 이동/복구는 권한 확인
-- ---------------------------------------------------------------------------

create or replace function public.guard_project_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    new.id := old.id;
    new.invite_code := old.invite_code;
    new.created_by := old.created_by;
    new.created_at := old.created_at;

    -- auth.uid()가 없는 경우(SQL Editor 등 서버 측 작업)는 검사하지 않는다.
    if new.is_deleted is distinct from old.is_deleted
        and auth.uid() is not null
        and not public.is_system_admin() then
        if not new.is_deleted then
            raise exception '프로젝트 복구는 시스템 관리자만 가능합니다.';
        elsif coalesce(public.project_role(old.id), '') <> 'Admin' then
            raise exception '프로젝트 삭제는 프로젝트 관리자만 가능합니다.';
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists guard_project_update on public.projects;
create trigger guard_project_update
    before update on public.projects
    for each row execute function public.guard_project_update();

-- ---------------------------------------------------------------------------
-- 앱에서 호출하는 함수 (RPC)
-- ---------------------------------------------------------------------------

-- 프로젝트 생성: 초대 코드를 발급하고 생성자를 Admin 멤버로 등록한다.
create or replace function public.create_project(
    p_name text,
    p_location text,
    p_start_date date,
    p_end_date date
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
    uid uuid := auth.uid();
    pid uuid;
begin
    if uid is null then
        raise exception '로그인이 필요합니다.';
    end if;
    if coalesce(trim(p_name), '') = '' then
        raise exception '프로젝트 명을 입력하세요.';
    end if;

    insert into public.projects (name, location, start_date, end_date, invite_code, created_by)
    values (
        trim(p_name),
        coalesce(nullif(trim(p_location), ''), '미지정'),
        p_start_date,
        p_end_date,
        public.generate_invite_code(),
        uid
    )
    returning id into pid;

    insert into public.project_members (project_id, user_id, role) values (pid, uid, 'Admin');

    return pid;
end;
$$;

-- 초대 코드로 입장: 코드가 틀리면 null, 맞으면 프로젝트 정보를 돌려준다.
create or replace function public.join_project(p_code text)
returns json language plpgsql security definer set search_path = '' as $$
declare
    uid uuid := auth.uid();
    proj record;
    was_member boolean;
begin
    if uid is null then
        raise exception '로그인이 필요합니다.';
    end if;

    select id, name into proj from public.projects
    where invite_code = upper(trim(p_code)) and not is_deleted;

    if proj.id is null then
        return null;
    end if;

    select exists (
        select 1 from public.project_members where project_id = proj.id and user_id = uid
    ) into was_member;

    if not was_member then
        insert into public.project_members (project_id, user_id, role)
        values (proj.id, uid, 'Participant');
    end if;

    return json_build_object('project_id', proj.id, 'name', proj.name, 'already_member', was_member);
end;
$$;

-- ---------------------------------------------------------------------------
-- 접근 권한
-- ---------------------------------------------------------------------------

revoke execute on function public.create_project(text, text, date, date) from public, anon;
revoke execute on function public.join_project(text) from public, anon;
revoke execute on function public.generate_invite_code() from public, anon, authenticated;
grant execute on function public.create_project(text, text, date, date) to authenticated;
grant execute on function public.join_project(text) to authenticated;

grant select on public.profiles to authenticated;
grant select, update, delete on public.projects to authenticated;
grant select, update, delete on public.project_members to authenticated;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;

-- profiles: 본인, 같은 프로젝트 멤버, 시스템 관리자만 조회. 수정 정책이 없으므로 권한(role)은 SQL로만 바꿀 수 있다.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
    using (
        id = (select auth.uid())
        or public.is_system_admin()
        or public.shares_project_with(id)
    );

-- projects: 멤버인 프로젝트만 조회. 생성/입장은 위 RPC로만 가능하다.
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
    using (public.is_system_admin() or public.project_role(id) is not null);

drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated
    using (public.is_system_admin() or public.project_role(id) in ('Admin', 'Participant'))
    with check (public.is_system_admin() or public.project_role(id) in ('Admin', 'Participant'));

drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to authenticated
    using (public.is_system_admin());

-- project_members: 같은 프로젝트 멤버끼리 조회, 권한 변경/삭제는 프로젝트 Admin만.
drop policy if exists project_members_select on public.project_members;
create policy project_members_select on public.project_members for select to authenticated
    using (public.is_system_admin() or public.project_role(project_id) is not null);

drop policy if exists project_members_update on public.project_members;
create policy project_members_update on public.project_members for update to authenticated
    using (public.is_system_admin() or public.project_role(project_id) = 'Admin')
    with check (public.is_system_admin() or public.project_role(project_id) = 'Admin');

drop policy if exists project_members_delete on public.project_members;
create policy project_members_delete on public.project_members for delete to authenticated
    using (public.is_system_admin() or public.project_role(project_id) = 'Admin');

-- ---------------------------------------------------------------------------
-- 시스템 관리자 지정 (회원가입 후 본인 이메일로 한 번 실행)
-- ---------------------------------------------------------------------------
-- update public.profiles set role = 'admin' where email = 'you@example.com';
