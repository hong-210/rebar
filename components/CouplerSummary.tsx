import React from 'react';
import { Link2 } from 'lucide-react';
import { MaterialEntry } from '../types';

export const isCoupler = (m: MaterialEntry) => m.itemType === 'Coupler';

// 커플러는 개수(EA)로 관리하므로 철근 ton 집계와 따로 직경별로 모은다.
const aggregateCouplers = (items: MaterialEntry[]) => {
    const map = new Map<string, { diameter: string, planned: number, shop: number }>();
    items.filter(isCoupler).forEach(m => {
        const row = map.get(m.diameter) ?? { diameter: m.diameter, planned: 0, shop: 0 };
        if (m.dataSource === 'Shop') row.shop += m.shopQuantity;
        else row.planned += m.plannedQuantity;
        map.set(m.diameter, row);
    });
    return Array.from(map.values())
        .sort((a, b) => parseInt(a.diameter.replace(/\D/g, '')) - parseInt(b.diameter.replace(/\D/g, '')));
};

const formatEa = (n: number) => `${Math.round(n).toLocaleString()} EA`;

// 커플러가 없으면 아무것도 그리지 않는다.
export const CouplerSummaryTable: React.FC<{ items: MaterialEntry[], title: string }> = ({ items, title }) => {
    const rows = aggregateCouplers(items);
    if (rows.length === 0) return null;
    const totalPlanned = rows.reduce((a, r) => a + r.planned, 0);
    const totalShop = rows.reduce((a, r) => a + r.shop, 0);

    const deltaCell = (delta: number, bold = false) => (
        <td className={`px-4 py-2 ${bold ? 'py-3' : ''} ${delta > 0 ? 'text-red-500' : delta < 0 ? 'text-blue-500' : 'text-slate-300'} font-bold`}>
            {delta > 0 ? '+' : ''}{Math.round(delta).toLocaleString()}
        </td>
    );

    return (
        <div className="overflow-hidden rounded-lg border border-violet-200 bg-white shadow-sm">
            <div className="px-4 py-3 border-b border-violet-100 bg-violet-50 flex justify-between items-center">
                <h4 className="font-bold text-violet-800 flex items-center gap-2 text-sm"><Link2 size={16} /> {title}</h4>
                <span className="text-xs text-violet-500">개수 기준 (철근 ton 합계에 포함되지 않음)</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-right">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                        <tr>
                            <th className="px-4 py-2 text-left">Diameter</th>
                            <th className="px-4 py-2 text-slate-600">실행 (EA)</th>
                            <th className="px-4 py-2 text-blue-600">SHOP (EA)</th>
                            <th className="px-4 py-2">차이 (EA)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {rows.map(r => (
                            <tr key={r.diameter} className="hover:bg-slate-50">
                                <td className="px-4 py-2 text-left font-bold text-slate-700">{r.diameter}</td>
                                <td className="px-4 py-2 text-slate-600">{Math.round(r.planned).toLocaleString()}</td>
                                <td className="px-4 py-2 text-blue-700 font-bold">{Math.round(r.shop).toLocaleString()}</td>
                                {deltaCell(r.shop - r.planned)}
                            </tr>
                        ))}
                        <tr className="font-bold bg-slate-100/50 border-t border-slate-200">
                            <td className="px-4 py-3 text-left">합계 (Total)</td>
                            <td className="px-4 py-3">{formatEa(totalPlanned)}</td>
                            <td className="px-4 py-3 text-blue-700">{formatEa(totalShop)}</td>
                            {deltaCell(totalShop - totalPlanned, true)}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// 목록의 한 행에 표시할 물량: 커플러는 개수, 철근은 ton
export const formatEntryAmount = (m: MaterialEntry) => {
    if (isCoupler(m)) return formatEa(m.dataSource === 'Shop' ? m.shopQuantity : m.plannedQuantity);
    const kg = m.dataSource === 'Shop' ? m.shopWeight : m.plannedWeight;
    return (kg / 1000).toLocaleString(undefined, { minimumFractionDigits: 3 });
};
