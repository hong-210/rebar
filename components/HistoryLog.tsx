import React from 'react';
import { HistoryLog } from '../types';
import { Clock, FileSpreadsheet, Edit3, Trash } from 'lucide-react';

interface HistoryLogProps {
    logs: HistoryLog[];
}

export const HistoryLogViewer: React.FC<HistoryLogProps> = ({ logs }) => {
    const getIcon = (action: string) => {
        switch (action) {
            case 'CREATE': return <FileSpreadsheet size={16} />;
            case 'UPDATE': return <Edit3 size={16} />;
            case 'DELETE': return <Trash size={16} />;
            default: return <Clock size={16} />;
        }
    };

    const sortedLogs = [...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return (
        <div className="space-y-6">
             <div>
                <h2 className="text-2xl font-bold text-slate-800">이력 관리 (History)</h2>
                <p className="text-slate-500">데이터 변경 및 재고 이동 로그</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                <div className="relative border-l-2 border-slate-200 ml-3 space-y-8">
                    {sortedLogs.map((log) => (
                        <div key={log.id} className="relative pl-8">
                            <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white ${
                                log.action === 'CREATE' ? 'bg-green-500' : 
                                log.action === 'DELETE' ? 'bg-red-500' : 'bg-blue-500'
                            }`}></div>
                            
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <div>
                                    <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded bg-slate-100 text-slate-500`}>
                                            {getIcon(log.action)}
                                        </span>
                                        {log.description}
                                    </h4>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Project ID: {log.projectId} • User: <span className="font-medium text-slate-700">{log.user}</span>
                                    </p>
                                </div>
                                <time className="text-xs text-slate-400 font-mono whitespace-nowrap">
                                    {new Date(log.timestamp).toLocaleString()}
                                </time>
                            </div>
                        </div>
                    ))}

                    {sortedLogs.length === 0 && (
                        <div className="pl-8 py-4 text-slate-400 text-sm italic">
                            기록된 이력이 없습니다.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};