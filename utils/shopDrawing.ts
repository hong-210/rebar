import { ShopDrawing } from '../types';

// A drawing can be marked complete manually (whole-document sign-off) regardless
// of whether individual pins exist/are confirmed, or it reaches 100% by having
// every placed pin confirmed.
export const getDrawingProgress = (d: ShopDrawing): number => {
    if (d.completed) return 100;
    if (d.pins.length === 0) return 0;
    return Math.round((d.pins.filter(p => p.status === 'Confirmed').length / d.pins.length) * 100);
};

export const getDrawingStatus = (d: ShopDrawing): { label: string; className: string } => {
    if (d.completed || getDrawingProgress(d) === 100) {
        return { label: '완료', className: 'bg-green-100 text-green-700 border-green-200' };
    }
    if (d.pins.length === 0) {
        return { label: '미착수', className: 'bg-slate-100 text-slate-600 border-slate-200' };
    }
    return { label: '진행중', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
};
