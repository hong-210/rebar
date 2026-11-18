import { MaterialEntry, SyncOptions } from '../types';
import { SheetLink, fetchSheetRows, fetchSheetTabs, loadSheetLinks, saveSheetLinks, sheetSourceKey } from './googleSheet';
import type { BuildResult } from './materialImport';

// 구글 시트 한 개(여러 탭)를 읽어 '탭 = 출처' 단위로 동기화한다.
// 화면의 '지금 동기화'와 앱 전체 백그라운드 자동 동기화가 같이 쓴다.

export const AUTO_MINUTES = 10;
export const SHEET_SYNC_EVENT = 'rbm-sheet-sync'; // 동기화 결과가 저장되면 화면이 다시 읽도록

// 같은 내용인지 비교 (다시 읽었는데 바뀐 게 없으면 저장을 건너뛴다)
const signature = (list: MaterialEntry[]) => list
    .map(m => [m.dong, m.floor, m.zone, m.diameter, m.strength, m.itemType ?? 'Rebar', m.memberClass ?? '', m.date ?? '',
        Math.round((m.dataSource === 'Shop' ? m.shopWeight : m.plannedWeight) * 10), Math.round(m.dataSource === 'Shop' ? m.shopQuantity : m.plannedQuantity)].join('|'))
    .sort().join('\n');

export interface SheetSyncDeps {
    projectId: string;
    getMaterials: () => MaterialEntry[];                      // 항상 최신 물량
    build: (rows: any[], source: string) => BuildResult;      // 행 → 물량 항목 (너그럽게)
    apply: (entries: MaterialEntry[], sync: SyncOptions) => void;
    // 처음 연결할 때 같은 동의 엑셀·예전 업로드 물량을 지울지 (없으면 묻지 않고 두기)
    confirmClearOthers?: (info: { dongs: string[]; count: number; sources: string[] }) => boolean;
    onProgress?: (text: string) => void;
}

export interface SheetSyncResult { title: string; changed: number; lines: string[]; summary: string }

export async function runSheetSync(link: SheetLink, deps: SheetSyncDeps): Promise<SheetSyncResult> {
    const { projectId, dataSource } = { projectId: deps.projectId, dataSource: link.dataSource };
    try {
        deps.onProgress?.(`${link.title} 읽는 중`);
        const { title, tabs } = await fetchSheetTabs(link.spreadsheetId);
        const entries: MaterialEntry[] = [];
        const replaceSources: string[] = [];
        const lines: string[] = [];
        const dongs = new Set<string>();
        let changed = 0;
        for (const tab of tabs) {
            if (link.skippedGids.includes(tab.gid)) continue;
            deps.onProgress?.(`${title} / ${tab.name} 읽는 중`);
            const key = sheetSourceKey(link.spreadsheetId, tab.gid);
            const rows = await fetchSheetRows(link.spreadsheetId, tab.gid);
            const r = deps.build(rows, key);
            const before = deps.getMaterials().filter(m => m.projectId === projectId && m.sourceFile === key && (m.dataSource ?? 'Design') === dataSource);
            if (!r.upload) {
                if (r.empty || rows.length === 0) {
                    // 탭을 비웠으면 그 탭에서 온 물량도 지운다
                    if (before.length) { replaceSources.push(key); changed++; lines.push(`· ${tab.name}: 비어 있음 → 이전 ${before.length}건 정리`); }
                    else lines.push(`· ${tab.name}: 물량 없음`);
                } else {
                    lines.push(`· ${tab.name}: 건너뜀 - ${r.error?.split('\n').slice(0, 4).join(' ')}`);
                }
                continue;
            }
            r.upload.dongs.forEach(d => dongs.add(d));
            // 탭에 여러 동이 섞여 있으면 동별 행 수, 지하주차장으로 보낸 행, 건너뛴 행을 함께 알려 준다
            const detail = [
                Object.entries(r.upload.dongRowCounts).map(([d, c]) => `${d} ${c}행`).join(', '),
                ...Object.entries(r.upload.rerouted).map(([k, c]) => `지하층 ${c}행 ${k}`),
                ...r.upload.rejected.map(x => `건너뜀 ${x.count}행: ${x.reason}`),
            ].filter(Boolean).join(' / ');
            const issues = r.upload.rejected.length ? ' ⚠' : '';
            if (signature(before) === signature(r.upload.entries)) {
                lines.push(`· ${tab.name}: 변경 없음 (${before.length}건)${issues}${r.upload.rejected.length ? ` - ${detail}` : ''}`);
                continue;
            }
            entries.push(...r.upload.entries);
            replaceSources.push(key);
            changed++;
            lines.push(`· ${tab.name}: ${r.upload.processedCount}행 → ${r.upload.entries.length}건 (이전 ${before.length}건)${issues} - ${detail}`);
        }

        // 처음 연결할 때: 같은 동에 엑셀로 올렸거나 출처 기록 없이 예전에 올린 물량이 있으면 지울지 묻는다 (중복 방지)
        let clearOtherDongs: string[] = [];
        if (!link.lastSync && deps.confirmClearOthers && dongs.size) {
            const others = deps.getMaterials().filter(m => m.projectId === projectId && dongs.has(m.dong) &&
                (m.dataSource ?? 'Design') === dataSource && (!m.sourceFile || m.sourceFile.startsWith('file:')));
            if (others.length) {
                const sources = Array.from(new Set(others.map(m => m.sourceFile ? m.sourceFile.slice(5) : '출처 기록 없는 예전 업로드')));
                if (deps.confirmClearOthers({ dongs: Array.from(dongs), count: others.length, sources })) {
                    clearOtherDongs = Array.from(dongs);
                    lines.push(`· 같은 동의 엑셀·예전 업로드 물량 ${others.length}건 정리 (시트를 원본으로)`);
                    changed++;
                }
            }
        }

        if (changed) deps.apply(entries, { replaceSources, clearOtherDongs, projectId, dataSource });
        const summary = `${changed ? `${changed}개 탭 반영` : '변경 없음'} · ${new Date().toLocaleString()}`;
        updateLink(projectId, link, { title, tabs, lastSync: new Date().toISOString(), lastResult: `${summary}\n${lines.join('\n')}` });
        return { title, changed, lines, summary };
    } catch (e) {
        const text = e instanceof Error ? e.message : String(e);
        updateLink(projectId, link, { lastResult: `실패: ${text} · ${new Date().toLocaleString()}` });
        throw e;
    }
}

function updateLink(projectId: string, link: SheetLink, patch: Partial<SheetLink>) {
    saveSheetLinks(projectId, loadSheetLinks(projectId).map(l =>
        l.spreadsheetId === link.spreadsheetId && l.dataSource === link.dataSource ? { ...l, ...patch } : l));
    window.dispatchEvent(new Event(SHEET_SYNC_EVENT));
}

// 자동 동기화할 차례인 연결 (자동 켜짐 + 마지막 동기화가 10분보다 오래됨)
export const dueLinks = (projectId: string) => loadSheetLinks(projectId).filter(l =>
    l.auto && (!l.lastSync || Date.now() - new Date(l.lastSync).getTime() > AUTO_MINUTES * 60000));
