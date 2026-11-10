-- RebarMaster Pro - 2단계 스키마 (물량, 발주, 이슈, 검측, 샵도면, 변경 이력, PDF 파일)
-- schema.sql 을 먼저 실행한 뒤, Supabase 대시보드 > SQL Editor 에 전체를 붙여넣고 실행한다.
-- 여러 번 실행해도 안전하다.
--
-- 컬럼 이름은 types.ts 필드명을 snake_case로 바꾼 것이다 (utils/dataApi.ts가 자동 변환).
-- id는 화면에서 만든 문자열을 그대로 쓰고, 날짜 문자열도 화면 형식 그대로 text로 저장한다.
-- inserted_at은 목록 정렬용이며 화면으로는 내려가지 않는다.

-- ---------------------------------------------------------------------------
-- 테이블
-- ---------------------------------------------------------------------------

create table if not exists public.materials (
    id text primary key,
    project_id uuid not null references public.projects (id) on delete cascade,
    dong text not null,
    floor text not null,
    zone text not null,
    diameter text not null,
    strength text not null,
    length_mm double precision not null default 0,
    data_source text,
    planned_versions jsonb not null default '{}'::jsonb,
    planned_quantity double precision not null default 0,
    planned_weight double precision not null default 0,
    shop_quantity double precision not null default 0,
    shop_weight double precision not null default 0,
    last_updated text,
    inserted_at timestamptz not null default now()
);

create table if not exists public.concretes (
    id text primary key,
    project_id uuid not null references public.projects (id) on delete cascade,
    dong text not null,
    floor text not null,
    zone text not null,
    strength text not null,
    type text not null,
    slump text,
    data_source text,
    planned_volume double precision not null default 0,
    construction_volume double precision not null default 0,
    last_updated text,
    inserted_at timestamptz not null default now()
);

create table if not exists public.orders (
    id text primary key,
    project_id uuid not null references public.projects (id) on delete cascade,
    title text not null,
    dong text,
    floor text,
    diameter text,
    strength text,
    quantity_weight double precision not null default 0,
    order_date text,
    delivery_date text,
    status text not null,
    inserted_at timestamptz not null default now()
);

create table if not exists public.issues (
    id text primary key,
    project_id uuid not null references public.projects (id) on delete cascade,
    title text not null,
    content text,
    author text,
    assignee text,
    status text not null,
    priority text not null,
    created_at text,
    attachment text,
    is_deleted boolean not null default false,
    inserted_at timestamptz not null default now()
);

create table if not exists public.inspections (
    id text primary key,
    project_id uuid not null references public.projects (id) on delete cascade,
    dong text,
    floor text,
    zone text,
    type text not null,
    inspector text,
    inspection_date text,
    result text not null,
    note text,
    attachment text,
    created_at text,
    is_deleted boolean not null default false,
    inserted_at timestamptz not null default now()
);

create table if not exists public.shop_drawings (
    id text primary key, -- Storage의 PDF 파일 이름으로도 쓰인다 (drawings/<project_id>/<id>.pdf)
    project_id uuid not null references public.projects (id) on delete cascade,
    dong text,
    floor text,
    title text not null,
    file_name text not null,
    total_pages integer not null default 0,
    pins jsonb not null default '[]'::jsonb,
    uploaded_by text,
    uploaded_at text,
    completed boolean,
    completed_by text,
    completed_at text,
    inserted_at timestamptz not null default now()
);

create table if not exists public.history_logs (
    id text primary key,
    project_id uuid not null references public.projects (id) on delete cascade,
    action text not null,
    description text,
    user_name text,
    logged_at text,
    inserted_at timestamptz not null default now()
);

create index if not exists materials_project_id_idx on public.materials (project_id);
create index if not exists concretes_project_id_idx on public.concretes (project_id);
create index if not exists orders_project_id_idx on public.orders (project_id);
create index if not exists issues_project_id_idx on public.issues (project_id);
create index if not exists inspections_project_id_idx on public.inspections (project_id);
create index if not exists shop_drawings_project_id_idx on public.shop_drawings (project_id);
create index if not exists history_logs_project_id_idx on public.history_logs (project_id);

-- ---------------------------------------------------------------------------
-- 접근 권한: 프로젝트 멤버는 조회, Admin/Participant는 등록/수정/삭제
-- ---------------------------------------------------------------------------

do $$
declare
    t text;
begin
    foreach t in array array['materials', 'concretes', 'orders', 'issues', 'inspections', 'shop_drawings']
    loop
        execute format('alter table public.%I enable row level security', t);
        execute format('grant select, insert, update, delete on public.%I to authenticated', t);

        execute format('drop policy if exists %I on public.%I', t || '_select', t);
        execute format(
            'create policy %I on public.%I for select to authenticated
                using (public.is_system_admin() or public.project_role(project_id) is not null)',
            t || '_select', t);

        execute format('drop policy if exists %I on public.%I', t || '_insert', t);
        execute format(
            'create policy %I on public.%I for insert to authenticated
                with check (public.is_system_admin() or public.project_role(project_id) in (''Admin'', ''Participant''))',
            t || '_insert', t);

        execute format('drop policy if exists %I on public.%I', t || '_update', t);
        execute format(
            'create policy %I on public.%I for update to authenticated
                using (public.is_system_admin() or public.project_role(project_id) in (''Admin'', ''Participant''))
                with check (public.is_system_admin() or public.project_role(project_id) in (''Admin'', ''Participant''))',
            t || '_update', t);

        execute format('drop policy if exists %I on public.%I', t || '_delete', t);
        execute format(
            'create policy %I on public.%I for delete to authenticated
                using (public.is_system_admin() or public.project_role(project_id) in (''Admin'', ''Participant''))',
            t || '_delete', t);
    end loop;
end;
$$;

-- 변경 이력은 추가만 가능하다 (수정/삭제 정책 없음).
alter table public.history_logs enable row level security;
grant select, insert on public.history_logs to authenticated;

drop policy if exists history_logs_select on public.history_logs;
create policy history_logs_select on public.history_logs for select to authenticated
    using (public.is_system_admin() or public.project_role(project_id) is not null);

drop policy if exists history_logs_insert on public.history_logs;
create policy history_logs_insert on public.history_logs for insert to authenticated
    with check (public.is_system_admin() or public.project_role(project_id) is not null);

-- ---------------------------------------------------------------------------
-- 샵도면 PDF 저장소 (비공개 버킷, 경로: <project_id>/<drawing_id>.pdf)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('drawings', 'drawings', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists drawings_files_select on storage.objects;
create policy drawings_files_select on storage.objects for select to authenticated
    using (
        bucket_id = 'drawings'
        and (public.is_system_admin() or public.project_role(((storage.foldername(name))[1])::uuid) is not null)
    );

drop policy if exists drawings_files_insert on storage.objects;
create policy drawings_files_insert on storage.objects for insert to authenticated
    with check (
        bucket_id = 'drawings'
        and (public.is_system_admin() or public.project_role(((storage.foldername(name))[1])::uuid) in ('Admin', 'Participant'))
    );

drop policy if exists drawings_files_delete on storage.objects;
create policy drawings_files_delete on storage.objects for delete to authenticated
    using (
        bucket_id = 'drawings'
        and (public.is_system_admin() or public.project_role(((storage.foldername(name))[1])::uuid) in ('Admin', 'Participant'))
    );
