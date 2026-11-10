import { supabase } from './supabase';
import { MaterialEntry, ConcreteEntry, Order, Issue, Inspection, ShopDrawing, HistoryLog } from '../types';
import { isLocalMode, readLocal, writeLocal } from './localMode';

// 프로젝트 하위 데이터(물량, 발주, 이슈 등) 공용 저장 계층.
// DB 컬럼은 types.ts 필드명을 snake_case로 바꾼 이름이라 최상위 키만 변환한다
// (plannedVersions, pins 같은 jsonb 값의 내부 키는 건드리지 않는다).

const camelToSnake = (key: string) => key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
const snakeToCamel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

const PAGE_SIZE = 1000; // PostgREST 기본 응답 한도
const WRITE_CHUNK = 500;
const DELETE_CHUNK = 200;

interface TableOptions {
    newestFirst: boolean;
    // DB 예약어 등으로 필드명을 그대로 쓸 수 없는 경우: { 필드명: 컬럼명 }
    rename?: Record<string, string>;
}

// 로컬 모드: 테이블 하나를 localStorage 키 하나에 배열로 저장한다.
// 키 이름은 Supabase 연동 이전 버전과 같아서, 그때 만든 테스트 데이터를 그대로 불러온다.
function createLocalTable<T extends { id: string }>(key: string, newestFirst: boolean) {
    const load = () => readLocal<T[]>(key, []);

    return {
        async fetchAll(): Promise<T[]> {
            return load();
        },

        async insert(items: T[]): Promise<void> {
            const rows = load();
            writeLocal(key, newestFirst ? [...[...items].reverse(), ...rows] : [...rows, ...items]);
        },

        async upsert(items: T[]): Promise<void> {
            const byId = new Map(items.map(item => [item.id, item]));
            const rows = load().map(row => {
                const item = byId.get(row.id);
                if (!item) return row;
                byId.delete(row.id);
                return item;
            });
            const added = [...byId.values()];
            writeLocal(key, newestFirst ? [...added.reverse(), ...rows] : [...rows, ...added]);
        },

        async remove(id: string): Promise<void> {
            writeLocal(key, load().filter(row => row.id !== id));
        },

        async removeMany(ids: string[]): Promise<void> {
            const targets = new Set(ids);
            writeLocal(key, load().filter(row => !targets.has(row.id)));
        }
    };
}

function createTable<T extends { id: string }>(name: string, localKey: string, { newestFirst, rename = {} }: TableOptions) {
    if (isLocalMode) return createLocalTable<T>(localKey, newestFirst);

    const columnToField = Object.fromEntries(Object.entries(rename).map(([field, column]) => [column, field]));

    // undefined는 null로 보내야 수정 시 기존 값이 지워진다 (예: 도면 완료 해제).
    const toRow = (item: T) => Object.fromEntries(
        Object.entries(item).map(([key, value]) => [rename[key] ?? camelToSnake(key), value ?? null])
    );

    const fromRow = (row: Record<string, unknown>) => Object.fromEntries(
        Object.entries(row)
            .filter(([column, value]) => column !== 'inserted_at' && value !== null)
            .map(([column, value]) => [columnToField[column] ?? snakeToCamel(column), value])
    ) as unknown as T;

    const write = async (items: T[], mode: 'insert' | 'upsert') => {
        for (let i = 0; i < items.length; i += WRITE_CHUNK) {
            const rows = items.slice(i, i + WRITE_CHUNK).map(toRow);
            const { error } = mode === 'insert'
                ? await supabase.from(name).insert(rows)
                : await supabase.from(name).upsert(rows);
            if (error) throw error;
        }
    };

    return {
        async fetchAll(): Promise<T[]> {
            const result: T[] = [];
            for (let from = 0; ; from += PAGE_SIZE) {
                const { data, error } = await supabase
                    .from(name)
                    .select('*')
                    .order('inserted_at', { ascending: !newestFirst })
                    .order('id')
                    .range(from, from + PAGE_SIZE - 1);
                if (error) throw error;
                result.push(...(data ?? []).map(fromRow));
                if (!data || data.length < PAGE_SIZE) break;
            }
            return result;
        },

        insert: (items: T[]) => write(items, 'insert'),

        // 있으면 수정, 없으면 추가
        upsert: (items: T[]) => write(items, 'upsert'),

        async remove(id: string): Promise<void> {
            const { error } = await supabase.from(name).delete().eq('id', id);
            if (error) throw error;
        },

        async removeMany(ids: string[]): Promise<void> {
            // id 목록이 URL에 실리므로 나눠서 보낸다
            for (let i = 0; i < ids.length; i += DELETE_CHUNK) {
                const { error } = await supabase.from(name).delete().in('id', ids.slice(i, i + DELETE_CHUNK));
                if (error) throw error;
            }
        }
    };
}

export const materialsTable = createTable<MaterialEntry>('materials', 'rbm_v2_materials', { newestFirst: false });
export const concretesTable = createTable<ConcreteEntry>('concretes', 'rbm_v2_concretes', { newestFirst: false });
export const ordersTable = createTable<Order>('orders', 'rbm_v2_orders', { newestFirst: true });
export const issuesTable = createTable<Issue>('issues', 'rbm_v2_issues', { newestFirst: true });
export const inspectionsTable = createTable<Inspection>('inspections', 'rbm_v2_inspections', { newestFirst: true });
export const drawingsTable = createTable<ShopDrawing>('shop_drawings', 'rbm_v2_drawings', { newestFirst: true });
export const logsTable = createTable<HistoryLog>('history_logs', 'rbm_v2_logs', {
    newestFirst: true,
    rename: { user: 'user_name', timestamp: 'logged_at' }
});
