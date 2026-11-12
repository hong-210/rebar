import React, { useMemo, useState } from 'react';
import { ShieldCheck, AlertTriangle, Info, CheckCircle2, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { MaterialEntry, Project } from '../types';
import { floorLabel, lowestFloorOf } from '../utils/floorBasis';
import {
    DrawingCheck, DrawingOverrides, MEMBER_GROUPS, loadDrawingOverrides, saveDrawingOverrides, MemberGroup, MIX_WARN, checkDrawings, collectDrawings, peerLabel
} from '../utils/shopCheck';

interface ShopCheckProps {
    currentProject: Project;
    materials: MaterialEntry[];
}

type Overrides = DrawingOverrides;
const loadOverrides = loadDrawingOverrides;
const saveOverrides = saveDrawingOverrides;

// 직경별 고정 색 (도면끼리 같은 직경은 같은 색)
const DIA_COLORS: Record<string, string> = {
    D10: '#cbd5e1', D13: '#93c5fd', D16: '#60a5fa', D19: '#2563eb', D22: '#1e3a8a',
    D25: '#7c3aed', D29: '#c026d3', D32: '#db2777', D35: '#e11d48'
};
const diaColor = (dia: string) => DIA_COLORS[dia] ?? '#94a3b8';

const DiaBar: React.FC<{ share: Map<string, number>; height?: number }> = ({ share, height = 10 }) => {
    const parts = Array.from(share.entries()).sort((a, b) => parseInt(a[0].slice(1)) - parseInt(b[0].slice(1)));
    return (
        <div className="flex w-full rounded-sm overflow-hidden bg-slate-100" style={{ height }}>
            {parts.map(([dia, v]) => (
                <div key={dia} title={`${dia} ${(v * 100).toFixed(0)}%`} style={{ width: `${v * 100}%`, background: diaColor(dia) }} />
            ))}
        </div>
    );
};

const shareOf = (c: DrawingCheck) => {
    const byDia = new Map<string, number>();
    c.drawing.byDia.forEach((t, spec) => {
        const dia = spec.split(' ')[0];
        byDia.set(dia, (byDia.get(dia) ?? 0) + t);
    });
    const share = new Map<string, number>();
    byDia.forEach((t, dia) => share.set(dia, c.drawing.ton > 0 ? t / c.drawing.ton : 0));
    return share;
};

type StatusFilter = 'all' | 'warn' | 'supplement';

export const ShopCheck: React.FC<ShopCheckProps> = ({ currentProject, materials }) => {
    const [overrides, setOverrides] = useState<Overrides>(() => loadOverrides(currentProject.id));
    const [dong, setDong] = useState('');
    const [member, setMember] = useState<MemberGroup | ''>('');
    const [status, setStatus] = useState<StatusFilter>('all');
    const [query, setQuery] = useState('');
    const [openKey, setOpenKey] = useState<string | null>(null);

    const buildingOf = (name: string) => currentProject.buildings.find(b => b.name === name);

    const checks = useMemo(() => {
        const drawings = collectDrawings(materials, currentProject.id, d => {
            const b = currentProject.buildings.find(x => x.name === d);
            return b ? lowestFloorOf(b) : undefined;
        }, overrides);
        return checkDrawings(drawings, materials, currentProject.id);
    }, [materials, currentProject, overrides]);

    const updateOverride = (key: string, patch: Overrides[string]) => {
        const next = { ...overrides, [key]: { ...overrides[key], ...patch } };
        setOverrides(next);
        saveOverrides(currentProject.id, next);
    };
    const clearOverride = (key: string) => {
        const next = { ...overrides };
        delete next[key];
        setOverrides(next);
        saveOverrides(currentProject.id, next);
    };

    const dongs = useMemo(() => Array.from(new Set(checks.map(c => c.drawing.dong))).sort(), [checks]);
    const hasWarn = (c: DrawingCheck) => c.findings.some(f => f.level === 'warn');

    const visible = useMemo(() => checks
        .filter(c => !dong || c.drawing.dong === dong)
        .filter(c => !member || c.drawing.info.member === member)
        .filter(c => status === 'all' || (status === 'warn' ? hasWarn(c) : c.drawing.info.supplement))
        .filter(c => !query.trim() || c.drawing.name.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => Number(hasWarn(b)) - Number(hasWarn(a)) || a.drawing.dong.localeCompare(b.drawing.dong) || a.drawing.name.localeCompare(b.drawing.name)),
        [checks, dong, member, status, query]);

    const scoped = checks.filter(c => !dong || c.drawing.dong === dong);
    const summary = {
        drawings: scoped.length,
        warn: scoped.filter(hasWarn).length,
        guessed: scoped.filter(c => c.drawing.info.memberGuessed).length,
        baseTon: scoped.filter(c => !c.drawing.info.supplement).reduce((a, c) => a + c.drawing.ton, 0),
        suppTon: scoped.filter(c => c.drawing.info.supplement).reduce((a, c) => a + c.drawing.ton, 0),
        suppCount: scoped.filter(c => c.drawing.info.supplement).length,
    };

    // 구역 × 부재 집계 (본도면 / 추가·누락분)
    const areaTable = useMemo(() => {
        const map = new Map<string, { dong: string; area: string; member: string; base: number; supp: number; count: number }>();
        for (const c of scoped) {
            const area = c.drawing.info.areas.join(' + ') || '(동 전체)';
            const k = `${c.drawing.dong}|${area}|${c.drawing.info.member}`;
            const row = map.get(k) ?? { dong: c.drawing.dong, area, member: c.drawing.info.member, base: 0, supp: 0, count: 0 };
            if (c.drawing.info.supplement) row.supp += c.drawing.ton; else row.base += c.drawing.ton;
            row.count++;
            map.set(k, row);
        }
        return Array.from(map.values()).sort((a, b) => a.dong.localeCompare(b.dong) || a.area.localeCompare(b.area, 'ko', { numeric: true }) || a.member.localeCompare(b.member));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [checks, dong]);

    if (checks.length === 0) {
        return (
            <div className="p-8 text-center text-slate-500">
                <ShieldCheck size={40} className="mx-auto text-slate-300 mb-3" />
                <p className="font-bold text-slate-700">점검할 SHOP 물량이 없습니다</p>
                <p className="text-sm mt-1">철근 물량 관리 → SHOP 물량에서 도면명(Zone)이 있는 SHOP 엑셀을 올리면 도면별로 점검합니다.</p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><ShieldCheck className="text-blue-600" /> SHOP 점검</h2>
                <p className="text-slate-500 text-sm">
                    SHOP 도면 한 장마다 같은 종류 도면(동 하부 기초끼리, 주차장 구역 기둥·벽체끼리 ...)과 비교해 강종·직경 구성·커플러 밀도·추가분이 튀는 도면을 찾습니다.
                    층이 다 끝나기 전에도 도면이 올라오는 즉시 볼 수 있습니다. 실행 물량과의 비교가 아니라 도면끼리의 비교입니다.
                </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <p className="text-xs text-slate-500">도면</p>
                    <p className="text-2xl font-bold text-slate-800">{summary.drawings}장</p>
                    <p className="text-xs text-slate-500">본도면 {(summary.baseTon).toFixed(1)} t</p>
                </div>
                <button onClick={() => setStatus(status === 'warn' ? 'all' : 'warn')} className={`text-left rounded-xl border p-4 ${status === 'warn' ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200 hover:border-amber-300'}`}>
                    <p className="text-xs text-slate-500">확인 필요</p>
                    <p className="text-2xl font-bold text-amber-600">{summary.warn}장</p>
                    <p className="text-xs text-slate-500">눌러서 이것만 보기</p>
                </button>
                <button onClick={() => setStatus(status === 'supplement' ? 'all' : 'supplement')} className={`text-left rounded-xl border p-4 ${status === 'supplement' ? 'bg-violet-50 border-violet-300' : 'bg-white border-slate-200 hover:border-violet-300'}`}>
                    <p className="text-xs text-slate-500">추가·누락·연장·보강분</p>
                    <p className="text-2xl font-bold text-violet-600">{summary.suppCount}장 · {summary.suppTon.toFixed(1)} t</p>
                    <p className="text-xs text-slate-500">본도면 대비 {summary.baseTon > 0 ? ((summary.suppTon / summary.baseTon) * 100).toFixed(1) : '-'}%</p>
                </button>
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                    <p className="text-xs text-slate-500">부재를 짐작한 도면</p>
                    <p className="text-2xl font-bold text-slate-800">{summary.guessed}장</p>
                    <p className="text-xs text-slate-500">도면명에 부재 이름이 없음 → 표에서 고칠 수 있음</p>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200">
                <div className="p-3 border-b border-slate-100 flex flex-wrap gap-2 items-center">
                    <select value={dong} onChange={e => setDong(e.target.value)} className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm">
                        <option value="">모든 동</option>
                        {dongs.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                    <select value={member} onChange={e => setMember(e.target.value as MemberGroup | '')} className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm">
                        <option value="">모든 부재</option>
                        {MEMBER_GROUPS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
                        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="도면명 검색" className="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm w-48" />
                    </div>
                    <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs ml-auto">
                        {([['all', '전체'], ['warn', '확인 필요'], ['supplement', '추가분']] as [StatusFilter, string][]).map(([k, label]) => (
                            <button key={k} onClick={() => setStatus(k)} className={`px-3 py-1 rounded-md font-medium ${status === k ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}>{label}</button>
                        ))}
                    </div>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-2 text-[11px] text-slate-500 border-b border-slate-100">
                    직경 구성:
                    {Object.keys(DIA_COLORS).map(d => (
                        <span key={d} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: diaColor(d) }} />{d}</span>
                    ))}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-xs">
                            <tr>
                                <th className="px-3 py-2 text-left w-8"></th>
                                <th className="px-3 py-2 text-left">도면명</th>
                                <th className="px-3 py-2 text-left">구역</th>
                                <th className="px-3 py-2 text-left">층</th>
                                <th className="px-3 py-2 text-left">부재</th>
                                <th className="px-3 py-2 text-right">중량</th>
                                <th className="px-3 py-2 text-right">커플러</th>
                                <th className="px-3 py-2 text-left w-40">직경 구성</th>
                                <th className="px-3 py-2 text-left">점검</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {visible.map(c => {
                                const d = c.drawing;
                                const warn = c.findings.filter(f => f.level === 'warn');
                                const open = openKey === d.key;
                                const b = buildingOf(d.dong);
                                return (
                                    <React.Fragment key={d.key}>
                                        <tr className={`cursor-pointer hover:bg-slate-50 ${open ? 'bg-blue-50/40' : ''}`} onClick={() => setOpenKey(open ? null : d.key)}>
                                            <td className="px-3 py-2">
                                                {warn.length ? <AlertTriangle size={16} className="text-amber-500" /> : d.info.supplement ? <Info size={16} className="text-violet-500" /> : <CheckCircle2 size={16} className="text-emerald-500" />}
                                            </td>
                                            <td className="px-3 py-2">
                                                <p className="font-medium text-slate-800">{d.name}</p>
                                                <p className="text-[11px] text-slate-400">
                                                    {d.dong}
                                                    {d.info.tags.map(t => <span key={t} className="ml-1 px-1.5 rounded bg-violet-50 text-violet-600">{t}</span>)}
                                                </p>
                                            </td>
                                            <td className="px-3 py-2 text-xs text-slate-600">{d.info.areas.join(', ') || '-'}</td>
                                            <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{d.floors.map(f => floorLabel(b, f)).join(', ')}</td>
                                            <td className="px-3 py-2 text-xs whitespace-nowrap">
                                                <span className={d.info.memberGuessed ? 'text-amber-600' : 'text-slate-700'}>{d.info.member}{d.info.memberGuessed ? ' (짐작)' : ''}</span>
                                                {overrides[d.key] && <span className="ml-1 text-[10px] text-blue-600">수정됨</span>}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{d.ton.toFixed(2)} t</td>
                                            <td className="px-3 py-2 text-right text-xs whitespace-nowrap text-slate-600">
                                                {d.ea > 0 ? <>{d.ea.toLocaleString()} EA<br /><span className="text-slate-400">{(d.ea / Math.max(d.ton, 1e-9)).toFixed(0)}/t</span></> : '-'}
                                            </td>
                                            <td className="px-3 py-2"><DiaBar share={shareOf(c)} /></td>
                                            <td className="px-3 py-2 text-xs">
                                                {warn.length
                                                    ? <span className="text-amber-700">{warn.map(f => f.kind).join(', ')}</span>
                                                    : <span className="text-slate-400">{d.info.supplement ? '추가분' : c.peer ? '이상 없음' : '비교할 도면 부족'}</span>}
                                            </td>
                                            <td className="pr-3 text-slate-400">{open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</td>
                                        </tr>
                                        {open && (
                                            <tr className="bg-slate-50/60">
                                                <td colSpan={10} className="px-6 py-4">
                                                    <div className="grid md:grid-cols-2 gap-6">
                                                        <div className="space-y-3">
                                                            <div className="space-y-1.5">
                                                                {c.findings.length === 0 && <p className="text-sm text-emerald-700">점검 항목에 걸린 내용이 없습니다.</p>}
                                                                {c.findings.map((f, i) => (
                                                                    <p key={i} className={`text-sm flex gap-2 ${f.level === 'warn' ? 'text-amber-800' : 'text-slate-600'}`}>
                                                                        {f.level === 'warn' ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <Info size={14} className="mt-0.5 shrink-0" />}
                                                                        <span><b>[{f.kind}]</b> {f.text}</span>
                                                                    </p>
                                                                ))}
                                                            </div>
                                                            <div className="text-xs text-slate-600 space-y-2 pt-2 border-t border-slate-200">
                                                                <p className="font-bold text-slate-700">분류 고치기 (이 브라우저에 기억)</p>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="w-10">부재</span>
                                                                    <select
                                                                        value={d.info.member}
                                                                        onChange={e => updateOverride(d.key, { member: e.target.value as MemberGroup })}
                                                                        className="px-2 py-1 border border-slate-300 rounded"
                                                                    >
                                                                        {MEMBER_GROUPS.map(m => <option key={m} value={m}>{m}</option>)}
                                                                    </select>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="w-10">구역</span>
                                                                    <input
                                                                        key={d.info.areas.join(',')}
                                                                        defaultValue={d.info.areas.join(', ')}
                                                                        placeholder="예: 7-1번구간, 205동 주변"
                                                                        onBlur={e => updateOverride(d.key, { areas: e.target.value.split(',').map(x => x.trim()).filter(Boolean) })}
                                                                        className="px-2 py-1 border border-slate-300 rounded flex-1"
                                                                    />
                                                                </div>
                                                                {overrides[d.key] && <button onClick={() => clearOverride(d.key)} className="text-blue-600">자동 분류로 되돌리기</button>}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <table className="w-full text-xs">
                                                                <thead className="text-slate-500">
                                                                    <tr><th className="text-left py-1">직경·강종</th><th className="text-right">중량</th><th className="text-right">비중</th>{c.peer && <th className="text-right">가장 비슷한 도면</th>}</tr>
                                                                </thead>
                                                                <tbody>
                                                                    {Array.from(d.byDia.entries()).sort((x, y) => parseInt(x[0].slice(1)) - parseInt(y[0].slice(1))).map(([spec, t]) => (
                                                                        <tr key={spec} className="border-t border-slate-100">
                                                                            <td className="py-1 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: diaColor(spec.split(' ')[0]) }} />{spec}</td>
                                                                            <td className="text-right font-mono">{t.toFixed(3)} t</td>
                                                                            <td className="text-right">{((t / d.ton) * 100).toFixed(1)}%</td>
                                                                            {c.peer && <td className="text-right text-slate-500">{(((c.peer.share.get(spec.split(' ')[0]) ?? 0)) * 100).toFixed(1)}%</td>}
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                            {c.peer && (
                                                                <div className="mt-3 text-[11px] text-slate-500 space-y-1">
                                                                    <p>비교 대상: {peerLabel(d.info)} 본도면 {c.peer.count}장 · 가장 비슷한 도면 '{c.peer.nearest}'</p>
                                                                    <div className="flex items-center gap-2"><span className="w-14">이 도면</span><DiaBar share={shareOf(c)} height={8} /></div>
                                                                    <div className="flex items-center gap-2"><span className="w-14">비슷한 도면</span><DiaBar share={c.peer.share} height={8} /></div>
                                                                    <p>직경 구성 차이 {((c.mixDiff ?? 0) * 100).toFixed(0)}% (두 번째로 비슷한 도면 기준, {(MIX_WARN * 100).toFixed(0)}% 넘으면 확인 필요)</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                    {visible.length === 0 && <p className="p-6 text-center text-sm text-slate-400">조건에 맞는 도면이 없습니다.</p>}
                </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200">
                <div className="px-4 py-3 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800">구역 × 부재 집계</h3>
                    <p className="text-xs text-slate-500">도면명에서 뽑은 구역별 본도면과 추가·누락분. 추가분 비율이 큰 구역은 원도면 확인이 필요할 수 있습니다.</p>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 text-xs">
                            <tr>
                                <th className="px-3 py-2 text-left">동</th>
                                <th className="px-3 py-2 text-left">구역</th>
                                <th className="px-3 py-2 text-left">부재</th>
                                <th className="px-3 py-2 text-right">도면</th>
                                <th className="px-3 py-2 text-right">본도면</th>
                                <th className="px-3 py-2 text-right">추가·누락분</th>
                                <th className="px-3 py-2 text-right">비율</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {areaTable.map(r => (
                                <tr key={`${r.dong}|${r.area}|${r.member}`}>
                                    <td className="px-3 py-1.5 text-xs text-slate-500">{r.dong}</td>
                                    <td className="px-3 py-1.5">{r.area}</td>
                                    <td className="px-3 py-1.5 text-slate-600">{r.member}</td>
                                    <td className="px-3 py-1.5 text-right text-slate-500">{r.count}</td>
                                    <td className="px-3 py-1.5 text-right font-mono">{r.base > 0 ? `${r.base.toFixed(2)} t` : '-'}</td>
                                    <td className="px-3 py-1.5 text-right font-mono text-violet-600">{r.supp > 0 ? `${r.supp.toFixed(2)} t` : '-'}</td>
                                    <td className={`px-3 py-1.5 text-right ${r.base > 0 && r.supp / r.base > 0.1 ? 'text-amber-600 font-bold' : 'text-slate-500'}`}>
                                        {r.base > 0 && r.supp > 0 ? `${((r.supp / r.base) * 100).toFixed(1)}%` : ''}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
