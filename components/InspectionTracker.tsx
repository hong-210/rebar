
import React, { useState, useRef } from 'react';
import { Inspection, InspectionResult, InspectionType, Project, User } from '../types';
import { Plus, ClipboardCheck, CheckCircle, XCircle, Clock, Paperclip, Trash2, User as UserIcon, Filter, LayoutGrid, List, RotateCcw, Archive, Lock, MapPin } from 'lucide-react';

interface InspectionTrackerProps {
    currentProject: Project;
    user: User;
    inspections: Inspection[];
    onAddInspection: (inspection: Inspection) => void;
    onUpdateResult: (id: string, result: InspectionResult) => void;
    onDeleteInspection: (id: string) => void;
    onRestoreInspection: (id: string) => void;
    onPermanentDeleteInspection: (id: string) => void;
}

const typeLabel: Record<InspectionType, string> = {
    Rebar: '철근',
    Concrete: '콘크리트',
    Formwork: '거푸집',
    Other: '기타'
};

export const InspectionTracker: React.FC<InspectionTrackerProps> = ({
    currentProject, user, inspections,
    onAddInspection, onUpdateResult, onDeleteInspection, onRestoreInspection, onPermanentDeleteInspection
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [filterResult, setFilterResult] = useState<'All' | InspectionResult | 'Deleted'>('All');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

    // Check Permissions
    const userRole = currentProject.members.find(m => m.userId === user.email)?.role || 'Guest';
    const canEdit = userRole === 'Admin' || userRole === 'Participant';
    const canManage = userRole === 'Admin';

    // Form State
    const [dong, setDong] = useState(currentProject.buildings[0]?.name || '');
    const [floor, setFloor] = useState('');
    const [zone, setZone] = useState('');
    const [type, setType] = useState<InspectionType>('Rebar');
    const [inspector, setInspector] = useState('');
    const [inspectionDate, setInspectionDate] = useState(new Date().toISOString().slice(0, 10));
    const [note, setNote] = useState('');
    const [attachmentName, setAttachmentName] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Filter Logic
    const projectInspections = inspections.filter(i => i.projectId === currentProject.id);

    const filteredInspections = projectInspections.filter(i => {
        if (filterResult === 'Deleted') return i.isDeleted;
        if (i.isDeleted) return false;
        if (filterResult === 'All') return true;
        return i.result === filterResult;
    });

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setAttachmentName(file.name);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const newInspection: Inspection = {
            id: Date.now().toString(),
            projectId: currentProject.id,
            dong,
            floor,
            zone,
            type,
            inspector: inspector || user.name,
            inspectionDate,
            result: 'Pending',
            note: note || undefined,
            attachment: attachmentName || undefined,
            createdAt: new Date().toISOString()
        };

        onAddInspection(newInspection);
        setIsModalOpen(false);
        // Reset form
        setFloor('');
        setZone('');
        setType('Rebar');
        setInspector('');
        setInspectionDate(new Date().toISOString().slice(0, 10));
        setNote('');
        setAttachmentName(null);
    };

    const getResultColor = (result: InspectionResult) => {
        switch (result) {
            case 'Pending': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
            case 'Pass': return 'bg-green-100 text-green-700 border-green-200';
            case 'Fail': return 'bg-red-100 text-red-700 border-red-200';
            default: return 'bg-slate-100 text-slate-700';
        }
    };

    const resultText = (result: InspectionResult) =>
        result === 'Pending' ? '검측 대기' : result === 'Pass' ? '합격' : '불합격';

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">검측 관리 (Inspection)</h2>
                    <p className="text-slate-500">철근/콘크리트 시공 전 검측 기록 및 합격 여부 관리</p>
                </div>
                <div className="flex gap-2">
                    <div className="flex bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 rounded transition-all ${viewMode === 'grid' ? 'bg-slate-100 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                            title="그리드 뷰 (Grid View)"
                        >
                            <LayoutGrid size={20} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 rounded transition-all ${viewMode === 'list' ? 'bg-slate-100 text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
                            title="리스트 뷰 (List View)"
                        >
                            <List size={20} />
                        </button>
                    </div>
                    {canEdit && (
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-all shadow-md font-medium"
                        >
                            <Plus size={20} /> 검측 등록
                        </button>
                    )}
                </div>
            </div>

            {/* Stats & Filter */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-end md:items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex gap-4 text-sm">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-50 text-yellow-700">
                        <Clock size={16} />
                        <span className="font-bold">{projectInspections.filter(i => !i.isDeleted && i.result === 'Pending').length}</span> 대기
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 text-green-700">
                        <CheckCircle size={16} />
                        <span className="font-bold">{projectInspections.filter(i => !i.isDeleted && i.result === 'Pass').length}</span> 합격
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 text-red-700">
                        <XCircle size={16} />
                        <span className="font-bold">{projectInspections.filter(i => !i.isDeleted && i.result === 'Fail').length}</span> 불합격
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Filter size={16} className="text-slate-400" />
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        {(['All', 'Pending', 'Pass', 'Fail'] as const).map(s => (
                            <button
                                key={s}
                                onClick={() => setFilterResult(s)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                                    filterResult === s ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                {s === 'All' ? '전체' : s === 'Pending' ? '대기' : s === 'Pass' ? '합격' : '불합격'}
                            </button>
                        ))}
                        {canManage && (
                            <>
                                <div className="w-px bg-slate-300 mx-1 my-1"></div>
                                <button
                                    onClick={() => setFilterResult('Deleted')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                                        filterResult === 'Deleted' ? 'bg-red-50 text-red-600 shadow' : 'text-slate-500 hover:text-red-600'
                                    }`}
                                >
                                    <Trash2 size={12} /> 휴지통
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Content Area */}
            {filterResult === 'Deleted' && (
                <div className="bg-red-50 border border-red-100 p-3 rounded-lg text-sm text-red-700 flex items-center gap-2">
                    <Archive size={16} />
                    <span>삭제된 검측 기록입니다. 복구하거나 영구 삭제할 수 있습니다.</span>
                </div>
            )}

            {filteredInspections.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300">
                    <ClipboardCheck className="mx-auto h-12 w-12 text-slate-300 mb-4" />
                    <p className="text-slate-500 font-medium">
                        {filterResult === 'Deleted' ? '삭제된 검측 기록이 없습니다.' : '등록된 검측 기록이 없습니다.'}
                    </p>
                    {filterResult !== 'Deleted' && canEdit && <p className="text-sm text-slate-400">새로운 검측을 등록해보세요.</p>}
                </div>
            ) : viewMode === 'grid' ? (
                /* GRID VIEW */
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filteredInspections.map(insp => (
                        <div key={insp.id} className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col ${insp.isDeleted ? 'border-red-100 bg-red-50/30' : 'border-slate-200'}`}>
                            <div className="p-5 flex-1">
                                <div className="flex justify-between items-start mb-3">
                                    <div className={`px-2.5 py-1 rounded text-xs font-bold border ${getResultColor(insp.result)}`}>
                                        {resultText(insp.result)}
                                    </div>
                                    <div className="text-xs text-slate-400 flex items-center gap-1">
                                        <Clock size={12} />
                                        {insp.inspectionDate}
                                    </div>
                                </div>

                                <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
                                    <MapPin size={16} className="text-slate-400" />
                                    {insp.dong} {insp.floor} {insp.zone}
                                    <span className="ml-auto text-xs font-medium bg-slate-100 text-slate-600 px-2 py-1 rounded">
                                        {typeLabel[insp.type]}
                                    </span>
                                </h3>

                                {insp.note && (
                                    <p className="text-slate-600 text-sm mb-4 whitespace-pre-wrap leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                                        {insp.note}
                                    </p>
                                )}

                                {insp.attachment && (
                                    <div className="flex items-center gap-2 text-xs text-slate-500 bg-blue-50 px-3 py-2 rounded border border-blue-100 mb-4">
                                        <Paperclip size={14} className="text-blue-500" />
                                        <span className="truncate font-medium text-blue-700 underline cursor-pointer">{insp.attachment}</span>
                                    </div>
                                )}

                                <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-4 mt-auto">
                                    <div className="flex items-center gap-1">
                                        <UserIcon size={14} />
                                        검측자: <span className="font-medium text-slate-700">{insp.inspector}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            {canEdit && (
                                <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 flex justify-between items-center">
                                    {filterResult === 'Deleted' ? (
                                        <div className="flex gap-2 w-full justify-end">
                                            <button
                                                onClick={() => onRestoreInspection(insp.id)}
                                                className="flex items-center gap-1 text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 transition-colors"
                                            >
                                                <RotateCcw size={14} /> 복구
                                            </button>
                                            <button
                                                onClick={() => { if (window.confirm('영구적으로 삭제하시겠습니까?')) onPermanentDeleteInspection(insp.id); }}
                                                className="flex items-center gap-1 text-xs font-medium bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 transition-colors"
                                            >
                                                <Trash2 size={14} /> 영구 삭제
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex gap-2">
                                                {insp.result !== 'Pass' && (
                                                    <button
                                                        onClick={() => onUpdateResult(insp.id, 'Pass')}
                                                        className="text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 transition-colors"
                                                    >
                                                        합격 처리
                                                    </button>
                                                )}
                                                {insp.result !== 'Fail' && (
                                                    <button
                                                        onClick={() => onUpdateResult(insp.id, 'Fail')}
                                                        className="text-xs font-medium bg-white border border-red-300 text-red-600 px-3 py-1.5 rounded hover:bg-red-50 transition-colors"
                                                    >
                                                        불합격 처리
                                                    </button>
                                                )}
                                                {insp.result !== 'Pending' && (
                                                    <button
                                                        onClick={() => onUpdateResult(insp.id, 'Pending')}
                                                        className="text-xs font-medium bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded hover:bg-slate-50 transition-colors"
                                                    >
                                                        재검측 대기
                                                    </button>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => {
                                                    if (window.confirm('검측 기록을 삭제하시겠습니까? (휴지통으로 이동)')) onDeleteInspection(insp.id)
                                                }}
                                                className="text-slate-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors"
                                                title="삭제 (휴지통으로 이동)"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                /* LIST VIEW */
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-500 font-medium">
                            <tr>
                                <th className="px-6 py-3 text-left w-28">결과</th>
                                <th className="px-6 py-3 text-left">위치 / 구분</th>
                                <th className="px-6 py-3 text-left w-32">검측자</th>
                                <th className="px-6 py-3 text-left w-32">검측일</th>
                                <th className="px-6 py-3 text-right w-40">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredInspections.map(insp => (
                                <tr key={insp.id} className="hover:bg-slate-50 group">
                                    <td className="px-6 py-4">
                                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${getResultColor(insp.result)}`}>
                                            {resultText(insp.result)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-slate-800">{insp.dong} {insp.floor} {insp.zone}</div>
                                        <div className="text-xs text-slate-400">
                                            {typeLabel[insp.type]}
                                            {insp.note && <span className="ml-2 truncate">{insp.note}</span>}
                                        </div>
                                        {insp.attachment && <div className="text-xs text-blue-500 flex items-center gap-1 mt-1"><Paperclip size={10} />{insp.attachment}</div>}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-xs">
                                                {insp.inspector.substring(0, 1)}
                                            </div>
                                            <span className="text-slate-700">{insp.inspector}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-500 text-xs">
                                        {insp.inspectionDate}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {canEdit ? (
                                            filterResult === 'Deleted' ? (
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => onRestoreInspection(insp.id)} className="text-green-600 hover:bg-green-50 p-1 rounded" title="복구"><RotateCcw size={16} /></button>
                                                    <button onClick={() => { if (window.confirm('영구삭제?')) onPermanentDeleteInspection(insp.id); }} className="text-red-600 hover:bg-red-50 p-1 rounded" title="영구 삭제"><Trash2 size={16} /></button>
                                                </div>
                                            ) : (
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {insp.result !== 'Pass' && (
                                                        <button onClick={() => onUpdateResult(insp.id, 'Pass')} className="text-green-600 hover:bg-green-50 p-1 rounded" title="합격"><CheckCircle size={16} /></button>
                                                    )}
                                                    {insp.result !== 'Fail' && (
                                                        <button onClick={() => onUpdateResult(insp.id, 'Fail')} className="text-red-600 hover:bg-red-50 p-1 rounded" title="불합격"><XCircle size={16} /></button>
                                                    )}
                                                    <button onClick={() => { if (window.confirm('삭제?')) onDeleteInspection(insp.id); }} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1 rounded" title="삭제"><Trash2 size={16} /></button>
                                                </div>
                                            )
                                        ) : (
                                            <span className="text-xs text-slate-300 flex items-center justify-end gap-1"><Lock size={12} /> View Only</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Create Modal */}
            {isModalOpen && canEdit && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg animate-in fade-in zoom-in duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-800">검측 등록</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <Plus size={24} className="rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">동 (Dong)</label>
                                    <select
                                        required
                                        value={dong}
                                        onChange={e => setDong(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    >
                                        <option value="" disabled>선택</option>
                                        {currentProject.buildings.map(b => (
                                            <option key={b.name} value={b.name}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">층 (Floor)</label>
                                    <input
                                        required
                                        type="text"
                                        value={floor}
                                        onChange={e => setFloor(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        placeholder="예: 3F"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">구역 (Zone)</label>
                                    <input
                                        type="text"
                                        value={zone}
                                        onChange={e => setZone(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        placeholder="예: A구역"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">검측 구분</label>
                                    <select
                                        value={type}
                                        onChange={e => setType(e.target.value as InspectionType)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    >
                                        <option value="Rebar">철근</option>
                                        <option value="Concrete">콘크리트</option>
                                        <option value="Formwork">거푸집</option>
                                        <option value="Other">기타</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">검측일</label>
                                    <input
                                        required
                                        type="date"
                                        value={inspectionDate}
                                        onChange={e => setInspectionDate(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">검측자 (Inspector)</label>
                                <input
                                    type="text"
                                    value={inspector}
                                    onChange={e => setInspector(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    placeholder={`기본값: ${user.name}`}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">비고 (Note)</label>
                                <textarea
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none h-24 resize-none"
                                    placeholder="검측 관련 특이사항을 작성하세요."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">사진 첨부 (Attachment)</label>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2"
                                    >
                                        <Paperclip size={16} /> 파일 선택
                                    </button>
                                    <span className="text-sm text-slate-400 truncate flex-1">
                                        {attachmentName || '선택된 파일 없음'}
                                    </span>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileSelect}
                                        className="hidden"
                                    />
                                </div>
                            </div>

                            <div className="pt-4">
                                <button
                                    type="submit"
                                    className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-all"
                                >
                                    등록 완료
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
