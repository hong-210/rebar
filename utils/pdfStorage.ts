import { supabase } from './supabase';
import { isLocalMode } from './localMode';

// PDF 원본 파일은 Supabase Storage의 비공개 버킷에 저장한다.
// 경로의 첫 폴더가 프로젝트 id라서, 저장소 권한 규칙이 프로젝트 멤버 여부를 확인할 수 있다.
// 도면 메타데이터(핀, 진행률 등)는 shop_drawings 테이블에 저장한다.
// 로컬 모드에서는 용량 문제로 localStorage 대신 브라우저 IndexedDB에 도면 id를 키로 저장한다.

const BUCKET = 'drawings';

const filePath = (projectId: string, id: string) => `${projectId}/${id}.pdf`;

// --- 로컬 모드 (IndexedDB, Supabase 연동 이전 버전과 같은 저장소) ---

const LOCAL_DB_NAME = 'rbm_v2_files';
const LOCAL_STORE = 'pdfs';

function openLocalDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(LOCAL_DB_NAME, 1);
        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains(LOCAL_STORE)) {
                request.result.createObjectStore(LOCAL_STORE);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function localRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await openLocalDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(LOCAL_STORE, mode);
        const req = run(tx.objectStore(LOCAL_STORE));
        tx.oncomplete = () => resolve(req.result as T);
        tx.onerror = () => reject(tx.error);
    });
}

// --- 공개 함수 ---

export async function savePdfFile(projectId: string, id: string, file: Blob): Promise<void> {
    if (isLocalMode) {
        await localRequest('readwrite', store => store.put(file, id));
        return;
    }
    const { error } = await supabase.storage
        .from(BUCKET)
        .upload(filePath(projectId, id), file, { contentType: 'application/pdf' });
    if (error) throw error;
}

export async function getPdfFile(projectId: string, id: string): Promise<Blob | null> {
    if (isLocalMode) {
        return (await localRequest<Blob | undefined>('readonly', store => store.get(id))) ?? null;
    }
    const { data, error } = await supabase.storage.from(BUCKET).download(filePath(projectId, id));
    if (error) return null;
    return data;
}

export async function deletePdfFile(projectId: string, id: string): Promise<void> {
    if (isLocalMode) {
        await localRequest('readwrite', store => store.delete(id));
        return;
    }
    const { error } = await supabase.storage.from(BUCKET).remove([filePath(projectId, id)]);
    if (error) throw error;
}
