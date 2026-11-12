import React, { useMemo, useState } from 'react';
import { Building2 } from 'lucide-react';
import { BuildingConfig, MaterialEntry, Project } from '../types';
import { floorLabel, topFloorOf } from '../utils/floorBasis';
import {
    ClassFilter, FloorProgress, floorSplitsByDong, progressOf, progressColor, percent, toTon, PROGRESS_LEGEND
} from '../utils/progress';

interface FloorProgressMapProps {
    project: Project;
    materials: MaterialEntry[];
    onOpenDong: (dong: string) => void;
}

const COLUMN_WIDTH = 60;

// 동의 층 목록: 지상(위에서부터) / 지하(B1부터 아래로). 설정 밖 층에 물량이 있으면 그 층까지 넓힌다
function floorsOf(building: BuildingConfig, dataFloors: string[]) {
    let top = building.roofFloors?.length ? topFloorOf(building) : building.groundFloors;
    let bottom = building.basementFloors;
    for (const f of dataFloors) {
        const g = f.match(/^(\d+)F$/);
        if (g) top = Math.max(top, Number(g[1]));
        const b = f.match(/^B(\d+)$/);
        if (b) bottom = Math.max(bottom, Number(b[1]));
    }
    return {
        above: Array.from({ length: top }, (_, i) => `${top - i}F`),
        below: Array.from({ length: bottom }, (_, i) => `B${i + 1}`)
    };
}

// 단지 전체를 동별 층 기둥으로 그려 층마다 SHOP / 실행 진척을 색으로 보여준다
export const FloorProgressMap: React.FC<FloorProgressMapProps> = ({ project, materials, onOpenDong }) => {
    const [classFilter, setClassFilter] = useState<ClassFilter>('all');
    const splits = useMemo(() => floorSplitsByDong(materials, project.id), [materials, project.id]);

    const columns = useMemo(() => project.buildings.map(b => {
        const floorMap = splits.get(b.name);
        const { above, below } = floorsOf(b, floorMap ? Array.from(floorMap.keys()) : []);
        const total: FloorProgress = { planned: 0, shop: 0 };
        let done = 0, started = 0, withPlan = 0;
        for (const f of [...above, ...below]) {
            const p = progressOf(floorMap?.get(f), classFilter).p;
            if (!p) continue;
            total.planned += p.planned;
            total.shop += p.shop;
            if (p.planned > 0) {
                withPlan++;
                if (p.shop / p.planned >= 0.995) done++;
                else if (p.shop > 0) started++;
            }
        }
        return { building: b, floorMap, above, below, total, done, started, withPlan };
    }), [project.buildings, splits, classFilter]);

    if (columns.length === 0) return null;

    const maxAbove = Math.max(...columns.map(c => c.above.length));
    const maxBelow = Math.max(0, ...columns.map(c => c.below.length));
    const floorCount = maxAbove + maxBelow;
    const cellH = floorCount > 45 ? 9 : floorCount > 30 ? 12 : 16;

    const sum = columns.reduce((a, c) => ({
        planned: a.planned + c.total.planned, shop: a.shop + c.total.shop,
        done: a.done + c.done, started: a.started + c.started, withPlan: a.withPlan + c.withPlan
    }), { planned: 0, shop: 0, done: 0, started: 0, withPlan: 0 });

    const cell = (c: typeof columns[number], f: string) => {
        const { p, merged } = progressOf(c.floorMap?.get(f), classFilter);
        const tip = [
            `${c.building.name} ${floorLabel(c.building, f)}`,
            p ? `실행 ${toTon(p.planned)} t / SHOP ${toTon(p.shop)} t (${percent(p)})` : '물량 없음',
            merged ? '수평/수직 구분 없는 물량이 있어 층 전체 기준' : ''
        ].filter(Boolean).join('\n');
        return (
            <div
                key={f}
                title={tip}
                className="w-full border-b border-white last:border-b-0 hover:brightness-90"
                style={{ height: cellH, background: progressColor(p) }}
            />
        );
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-5">
                <div>
                    <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                        <Building2 size={20} className="text-slate-600" />
                        단지 전체 층별 진척 현황
                    </h3>
                    <p className="text-sm text-slate-500">
                        층마다 SHOP ÷ 실행 철근 물량(커플러 제외)으로 색을 칠했습니다. 칸에 마우스를 올리면 물량이, 동을 누르면 3D 진척 모델이 열립니다.
                    </p>
                    <p className="text-sm text-slate-700 mt-2">
                        전체 <span className="font-bold">{percent(sum)}</span>
                        <span className="text-slate-500"> (SHOP {toTon(sum.shop)} t / 실행 {toTon(sum.planned)} t)</span>
                        <span className="text-slate-500"> · 완료 {sum.done}개 층 · 진행 중 {sum.started}개 층 · 실행 물량 있는 층 {sum.withPlan}개</span>
                    </p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-lg text-sm shrink-0">
                    {([['all', '전체'], ['H', '수평재'], ['V', '수직재']] as [ClassFilter, string][]).map(([key, label]) => (
                        <button
                            key={key}
                            onClick={() => setClassFilter(key)}
                            className={`px-4 py-1.5 rounded-md font-medium transition-all ${classFilter === key ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="overflow-x-auto pb-2">
                <div className="relative inline-flex gap-5 px-2 min-w-full">
                    {/* 지면 선 */}
                    <div className="absolute left-0 right-0 bg-slate-600" style={{ top: maxAbove * cellH, height: 2 }} />
                    {columns.map(c => (
                        <button
                            key={c.building.name}
                            onClick={() => onOpenDong(c.building.name)}
                            className="flex flex-col items-stretch shrink-0 group"
                            style={{ width: COLUMN_WIDTH }}
                            title={`${c.building.name} 3D 진척 모델 열기`}
                        >
                            <div style={{ height: (maxAbove - c.above.length) * cellH }} />
                            {/* 칸 높이가 테두리를 포함해 고정이라 모든 동의 지면 선이 같은 높이에 온다 */}
                            <div className="flex flex-col outline outline-1 -outline-offset-1 outline-slate-500">{c.above.map(f => cell(c, f))}</div>
                            <div style={{ height: 2 }} />
                            {c.below.length > 0 && (
                                <div className="flex flex-col outline outline-1 -outline-offset-1 outline-slate-500">{c.below.map(f => cell(c, f))}</div>
                            )}
                            <div style={{ height: (maxBelow - c.below.length) * cellH }} />
                            <div className="mt-2 text-center">
                                <p className="text-xs font-bold text-slate-700 group-hover:text-blue-600 leading-tight break-keep">{c.building.name}</p>
                                <p className="text-[11px] text-slate-500">{percent(c.total)}</p>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-4 text-xs text-slate-600">
                {PROGRESS_LEGEND.map(([color, label]) => (
                    <span key={label} className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-sm border border-slate-300" style={{ background: color }} />
                        {label}
                    </span>
                ))}
            </div>
        </div>
    );
};
