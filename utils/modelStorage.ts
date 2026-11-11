import type { SabBody, SabModel } from './sabParser';
import type { ModelMember } from './rebarCsv';

// 변환한 3D 모델은 동마다 이 브라우저의 IndexedDB에 저장한다 (서버 연동 전까지 공유되지 않음).
// 목록은 가벼운 meta 저장소에서 읽고, 형상(꼭짓점)은 gzip으로 압축해 data 저장소에 따로 둔다.
// 형상(.sab)과 물량(_rebar.csv)은 따로 올릴 수 있어서, 올린 쪽만 바꾸고 다른 쪽은 그대로 둔다.

const DB_NAME = 'rbm_v2_models';
const META = 'meta';
const DATA = 'data';

export interface StoredModelMeta {
    key: string;
    projectId: string;
    dong: string;
    uploadedAt: string;
    // 형상(.sab)을 올렸을 때
    fileName?: string;
    bodyCount: number;
    triangleCount: number;
    storedBytes: number;
    // 물량 CSV를 올렸을 때 (부재별 실행 물량)
    csvFileName?: string;
    designTon?: number;
    couplerEa?: number;
}

interface StoredModelData {
    bodies: SabBody[];
    positions?: Blob; // gzip 압축된 Float32Array (형상이 없으면 비어 있다)
    members?: ModelMember[];
}

export interface LoadedModel {
    bodies: SabBody[];
    positions: Float32Array;
    members?: ModelMember[];
}

const modelKey = (projectId: string, dong: string) => `${projectId}|${dong}`;

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
            if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function run<T>(stores: string[], mode: IDBTransactionMode, body: (tx: IDBTransaction) => IDBRequest | void): Promise<T> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(stores, mode);
        const req = body(tx);
        tx.oncomplete = () => resolve((req ? req.result : undefined) as T);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('저장이 취소되었습니다. 브라우저 저장 공간을 확인하세요.'));
    });
}

const hasCompression = typeof CompressionStream !== 'undefined';

async function compress(data: Float32Array): Promise<Blob> {
    const blob = new Blob([data]);
    if (!hasCompression) return blob;
    return new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
}

async function decompress(blob: Blob): Promise<Float32Array> {
    // gzip 머리(1f 8b)로 압축 여부를 판단한다
    const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    const raw = head[0] === 0x1f && head[1] === 0x8b
        ? await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
        : await blob.arrayBuffer();
    return new Float32Array(raw);
}

export async function listModels(projectId: string): Promise<StoredModelMeta[]> {
    const all = await run<StoredModelMeta[]>([META], 'readonly', tx => tx.objectStore(META).getAll());
    return all.filter(m => m.projectId === projectId);
}

// 형상(sab)과 물량(csv) 중 올린 것만 바꿔 저장한다
export async function saveModelParts(
    projectId: string, dong: string,
    parts: { sab?: { fileName: string; model: SabModel }; csv?: { fileName: string; members: ModelMember[] } }
): Promise<StoredModelMeta> {
    const key = modelKey(projectId, dong);
    const [oldMeta, oldData] = await Promise.all([
        run<StoredModelMeta | undefined>([META], 'readonly', tx => tx.objectStore(META).get(key)),
        run<StoredModelData | undefined>([DATA], 'readonly', tx => tx.objectStore(DATA).get(key)),
    ]);
    const meta: StoredModelMeta = oldMeta
        ? { ...oldMeta, uploadedAt: new Date().toISOString() }
        : { key, projectId, dong, uploadedAt: new Date().toISOString(), bodyCount: 0, triangleCount: 0, storedBytes: 0 };
    const data: StoredModelData = oldData ?? { bodies: [] };

    if (parts.sab) {
        data.bodies = parts.sab.model.bodies;
        data.positions = await compress(parts.sab.model.positions);
        Object.assign(meta, {
            fileName: parts.sab.fileName,
            bodyCount: parts.sab.model.bodies.length,
            triangleCount: parts.sab.model.positions.length / 9,
            storedBytes: data.positions.size,
        });
    }
    if (parts.csv) {
        const members = parts.csv.members;
        data.members = members;
        Object.assign(meta, {
            csvFileName: parts.csv.fileName,
            designTon: members.reduce((a, m) => a + m.items.reduce((b, it) => b + it.ton, 0), 0),
            couplerEa: members.reduce((a, m) => a + m.items.reduce((b, it) => b + it.ea, 0), 0),
        });
    }
    await run([META, DATA], 'readwrite', tx => {
        tx.objectStore(META).put(meta);
        tx.objectStore(DATA).put(data, key);
    });
    return meta;
}

export async function loadModel(projectId: string, dong: string): Promise<LoadedModel | null> {
    const data = await run<StoredModelData | undefined>([DATA], 'readonly', tx => tx.objectStore(DATA).get(modelKey(projectId, dong)));
    if (!data) return null;
    return {
        bodies: data.bodies,
        positions: data.positions ? await decompress(data.positions) : new Float32Array(0),
        members: data.members
    };
}

export async function deleteModel(projectId: string, dong: string): Promise<void> {
    const key = modelKey(projectId, dong);
    await run([META, DATA], 'readwrite', tx => {
        tx.objectStore(META).delete(key);
        tx.objectStore(DATA).delete(key);
    });
}
