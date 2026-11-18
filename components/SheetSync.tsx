import React, { useEffect, useState } from 'react';
import { Link2, RefreshCw, Trash2, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { BatchUploadResult, MaterialEntry, SyncOptions } from '../types';
import { SheetLink, fetchSheetTabs, loadSheetLinks, parseSheetUrl, saveSheetLinks, sheetSourceKey } from '../utils/googleSheet';
import { AUTO_MINUTES, SHEET_SYNC_EVENT, runSheetSync } from '../utils/sheetSyncCore';
import type { BuildResult } from '../utils/materialImport';

interface SheetSyncProps {
    projectId: string;
    dataSource: 'Design' | 'Shop';
    materials: MaterialEntry[];
    canEdit: boolean;
    buildUpload: (rows: any[], source: string, opts?: { lenient?: boolean }) => BuildResult;
    onApply: (entries: MaterialEntry[], sync: SyncOptions) => BatchUploadResult;
}

// 구글 시트 연결 화면: 연결·탭 선택·지금 동기화. 자동 동기화는 앱 전체(SheetAutoSync)에서 돈다
export const SheetSync: React.FC<SheetSyncProps> = ({ projectId, dataSource, materials, canEdit, buildUpload, onApply }) => {
    const [links, setLinks] = useState<SheetLink[]>(() => loadSheetLinks(projectId));
    useEffect(() => {
        const reload = () => setLinks(loadSheetLinks(projectId));
        reload();
        window.addEventListener(SHEET_SYNC_EVENT, reload);
        return () => window.removeEventListener(SHEET_SYNC_EVENT, reload);
    }, [projectId]);
    const mine = links.filter(l => l.dataSource === dataSource);
    const [url, setUrl] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
    const [open, setOpen] = useState(mine.length > 0);

    const store = (next: SheetLink[]) => { setLinks(next); saveSheetLinks(projectId, next); };
    const update = (id: string, patch: Partial<SheetLink>) =>
        store(loadSheetLinks(projectId).map(l => (l.spreadsheetId === id && l.dataSource === dataSource ? { ...l, ...patch } : l)));

    const sync = async (link: SheetLink) => {
        setMessage(null);
        try {
            const r = await runSheetSync(link, {
                projectId,
                getMaterials: () => materials,
                build: (rows, key) => buildUpload(rows, key, { lenient: true }),
                apply: (entries, s) => onApply(entries, s),
                confirmClearOthers: ({ dongs, count, sources }) => confirm(
                    `같은 동(${dongs.join(', ')})에 엑셀로 올렸거나 예전에 올린 ${dataSource === 'Shop' ? 'SHOP' : '실행'} 물량 ${count}건이 있습니다.\n` +
                    `출처: ${sources.join(', ')}\n\n시트를 원본으로 쓰려면 지워야 두 번 집계되지 않습니다. 지울까요?\n(취소하면 그대로 두고 시트 물량을 더합니다)`
                ),
                onProgress: setBusy,
            });
            setMessage({ ok: true, text: `${r.title}: ${r.summary}\n${r.lines.join('\n')}` });
        } catch (e) {
            setMessage({ ok: false, text: `${link.title}: ${e instanceof Error ? e.message : String(e)}` });
        } finally {
            setBusy(null);
            setLinks(loadSheetLinks(projectId));
        }
    };

    const add = async () => {
        const parsed = parseSheetUrl(url.trim());
        if (!parsed) { setMessage({ ok: false, text: '구글 시트 주소(https://docs.google.com/spreadsheets/d/...)를 넣어 주세요.' }); return; }
        if (mine.some(l => l.spreadsheetId === parsed.id)) { setMessage({ ok: false, text: '이미 연결된 시트입니다.' }); return; }
        setBusy('시트 확인 중');
        try {
            const { title, tabs } = await fetchSheetTabs(parsed.id);
            const link: SheetLink = { spreadsheetId: parsed.id, url: url.trim(), title, dataSource, tabs, skippedGids: [], auto: true };
            store([...loadSheetLinks(projectId), link]);
            setUrl('');
            await sync(link);
        } catch (e) {
            setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
            setBusy(null);
        }
    };

    const remove = (link: SheetLink) => {
        if (!confirm(`'${link.title}' 연결을 끊을까요?\n\n연결만 끊고 시트에서 들어온 물량은 그대로 둡니다.\n(물량까지 지우려면 연결을 끊기 전에 시트를 비우고 동기화하세요)`)) return;
        store(loadSheetLinks(projectId).filter(l => !(l.spreadsheetId === link.spreadsheetId && l.dataSource === dataSource)));
    };

    const count = (link: SheetLink, gid: string) =>
        materials.filter(m => m.projectId === projectId && m.sourceFile === sheetSourceKey(link.spreadsheetId, gid)).length;

    return (
        <div className="bg-white rounded-xl border border-slate-200 mb-4">
            <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-700">
                <Link2 size={16} className="text-emerald-600" /> 구글 시트 연결
                <span className="text-xs font-normal text-slate-500">{mine.length ? `${mine.length}개 연결됨` : '시트에 계속 쌓으면 자동으로 반영'}</span>
                {busy && <span className="ml-auto text-xs font-normal text-blue-600 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {busy}</span>}
            </button>
            {open && (
                <div className="px-4 pb-4 space-y-3 text-sm">
                    <p className="text-xs text-slate-500">
                        엑셀 업로드 양식과 같은 머리글(동, 층, 도면명, 직경, 강종, 구성, 중량, 구분, 날짜)의 시트를 연결하면 탭마다 따로 동기화합니다.
                        시트는 '링크가 있는 모든 사용자 - 뷰어'로 공유해야 합니다. 플랫폼의 아무 화면이나 열려 있으면 {AUTO_MINUTES}분마다 다시 읽습니다 (시트 화면은 열 필요 없음).
                        탭 하나에 여러 동이 섞여도 행마다 동 칸대로 나뉘고, 실행이 없는 지하층 행은 지하주차장 동으로 갑니다.
                    </p>
                    {canEdit && (
                        <div className="flex gap-2">
                            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm" />
                            <button onClick={add} disabled={!!busy || !url.trim()} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">연결</button>
                        </div>
                    )}
                    {mine.map(link => (
                        <div key={link.spreadsheetId} className="border border-slate-200 rounded-lg p-3 space-y-2">
                            <div className="flex items-center gap-2">
                                <a href={link.url} target="_blank" rel="noreferrer" className="font-bold text-slate-800 hover:text-blue-600 truncate">{link.title}</a>
                                <span className="text-xs text-slate-400">{link.lastSync ? `마지막 동기화 ${new Date(link.lastSync).toLocaleString()}` : '아직 동기화 안 함'}</span>
                                {canEdit && (
                                    <div className="ml-auto flex items-center gap-2">
                                        <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={link.auto} onChange={e => update(link.spreadsheetId, { auto: e.target.checked })} /> 자동</label>
                                        <button onClick={() => sync(link)} disabled={!!busy} className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded text-xs disabled:opacity-50"><RefreshCw size={12} /> 지금 동기화</button>
                                        <button onClick={() => remove(link)} className="text-slate-400 hover:text-red-600" title="연결 끊기"><Trash2 size={14} /></button>
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {link.tabs.map(t => {
                                    const skipped = link.skippedGids.includes(t.gid);
                                    return (
                                        <label key={t.gid} className={`flex items-center gap-1 text-xs px-2 py-1 rounded border ${skipped ? 'border-slate-200 text-slate-400' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                                            <input
                                                type="checkbox"
                                                checked={!skipped}
                                                disabled={!canEdit}
                                                onChange={e => update(link.spreadsheetId, { skippedGids: e.target.checked ? link.skippedGids.filter(g => g !== t.gid) : [...link.skippedGids, t.gid] })}
                                            />
                                            {t.name} <span className="text-slate-400">{count(link, t.gid)}건</span>
                                        </label>
                                    );
                                })}
                            </div>
                            {link.lastResult && <pre className="text-[11px] text-slate-500 whitespace-pre-wrap font-sans">{link.lastResult}</pre>}
                        </div>
                    ))}
                    {message && (
                        <div className={`text-xs rounded-lg px-3 py-2 whitespace-pre-wrap flex gap-2 ${message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
                            {message.ok ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="shrink-0 mt-0.5" />}
                            {message.text}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
