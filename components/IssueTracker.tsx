
import React, { useState, useRef } from 'react';
import { Issue, IssueStatus, Project, User, IssuePriority } from '../types';
import { Plus, AlertCircle, CheckCircle, Clock, FileText, Paperclip, Trash2, User as UserIcon, ArrowRight, Filter, LayoutGrid, List, RotateCcw, Archive, Lock } from 'lucide-react';

interface IssueTrackerProps {
    currentProject: Project;
    user: User;
    issues: Issue[];
    onAddIssue: (issue: Issue) => void;
    onUpdateStatus: (id: string, status: IssueStatus) => void;
    onDeleteIssue: (id: string) => void;
    onRestoreIssue: (id: string) => void;
    onPermanentDeleteIssue: (id: string) => void;
}

export const IssueTracker: React.FC<IssueTrackerProps> = ({ 
    currentProject, user, issues, 
    onAddIssue, onUpdateStatus, onDeleteIssue, onRestoreIssue, onPermanentDeleteIssue 
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [filterStatus, setFilterStatus] = useState<'All' | IssueStatus | 'Deleted'>('All');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
    
    // Check Permissions
    const userRole = currentProject.members.find(m => m.userId === user.email)?.role || 'Guest';
    const canEdit = userRole === 'Admin' || userRole === 'Participant';
    const canManage = userRole === 'Admin'; // Only Admin can see deleted items or permanently delete

    // Form State
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [assignee, setAssignee] = useState('');
    const [priority, setPriority] = useState<IssuePriority>('Medium');
    const [attachmentName, setAttachmentName] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Filter Logic
    const projectIssues = issues.filter(i => i.projectId === currentProject.id);
    
    const filteredIssues = projectIssues.filter(i => {
        if (filterStatus === 'Deleted') return i.isDeleted;
        if (i.isDeleted) return false; // Don't show deleted in normal views
        if (filterStatus === 'All') return true;
        return i.status === filterStatus;
    });

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setAttachmentName(file.name);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const newIssue: Issue = {
            id: Date.now().toString(),
            projectId: currentProject.id,
            title,
            content,
            author: user.name,
            assignee: assignee || '담당자 미지정',
            status: 'Open',
            priority,
            createdAt: new Date().toISOString(),
            attachment: attachmentName || undefined
        };

        onAddIssue(newIssue);
        setIsModalOpen(false);
        // Reset form
        setTitle('');
        setContent('');
        setAssignee('');
        setPriority('Medium');
        setAttachmentName(null);
    };

    const getStatusColor = (status: IssueStatus) => {
        switch (status) {
            case 'Open': return 'bg-red-100 text-red-700 border-red-200';
            case 'InProgress': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
            case 'Resolved': return 'bg-green-100 text-green-700 border-green-200';
            default: return 'bg-slate-100 text-slate-700';
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">이슈 및 공지사항 (Issue Tracker)</h2>
                    <p className="text-slate-500">현장 이슈, 물량 확인 요청 및 소통 창구</p>
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
                            <Plus size={20} /> 새 이슈 등록
                        </button>
                    )}
                </div>
            </div>

            {/* Stats & Filter */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-end md:items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex gap-4 text-sm">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 text-red-700">
                        <AlertCircle size={16} />
                        <span className="font-bold">{projectIssues.filter(i => !i.isDeleted && i.status === 'Open').length}</span> Open
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-50 text-green-700">
                        <CheckCircle size={16} />
                        <span className="font-bold">{projectIssues.filter(i => !i.isDeleted && i.status === 'Resolved').length}</span> Resolved
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <Filter size={16} className="text-slate-400" />
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                        {(['All', 'Open', 'InProgress', 'Resolved'] as const).map(s => (
                            <button
                                key={s}
                                onClick={() => setFilterStatus(s)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                                    filterStatus === s ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                {s === 'All' ? '전체' : s === 'Open' ? '대기' : s === 'InProgress' ? '진행' : '완료'}
                            </button>
                        ))}
                         {canManage && (
                             <>
                                <div className="w-px bg-slate-300 mx-1 my-1"></div>
                                <button
                                    onClick={() => setFilterStatus('Deleted')}
                                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${
                                        filterStatus === 'Deleted' ? 'bg-red-50 text-red-600 shadow' : 'text-slate-500 hover:text-red-600'
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
            {filterStatus === 'Deleted' && (
                 <div className="bg-red-50 border border-red-100 p-3 rounded-lg text-sm text-red-700 flex items-center gap-2">
                    <Archive size={16} />
                    <span>삭제된 이슈 목록입니다. 복구하거나 영구 삭제할 수 있습니다.</span>
                 </div>
            )}

            {filteredIssues.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300">
                    <AlertCircle className="mx-auto h-12 w-12 text-slate-300 mb-4" />
                    <p className="text-slate-500 font-medium">
                        {filterStatus === 'Deleted' ? '삭제된 이슈가 없습니다.' : '등록된 이슈가 없습니다.'}
                    </p>
                    {filterStatus !== 'Deleted' && canEdit && <p className="text-sm text-slate-400">새로운 이슈나 공지사항을 등록해보세요.</p>}
                </div>
            ) : viewMode === 'grid' ? (
                /* GRID VIEW */
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {filteredIssues.map(issue => (
                        <div key={issue.id} className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col ${issue.isDeleted ? 'border-red-100 bg-red-50/30' : 'border-slate-200'}`}>
                            <div className="p-5 flex-1">
                                <div className="flex justify-between items-start mb-3">
                                    <div className={`px-2.5 py-1 rounded text-xs font-bold border ${getStatusColor(issue.status)}`}>
                                        {issue.status === 'Open' ? '확인 대기' : issue.status === 'InProgress' ? '진행중' : '조치 완료'}
                                    </div>
                                    <div className="text-xs text-slate-400 flex items-center gap-1">
                                        <Clock size={12} />
                                        {new Date(issue.createdAt).toLocaleDateString()}
                                    </div>
                                </div>

                                <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-start gap-2">
                                    {issue.title}
                                    {issue.priority === 'High' && <span className="w-2 h-2 rounded-full bg-red-500 mt-2"></span>}
                                </h3>
                                <p className="text-slate-600 text-sm mb-4 whitespace-pre-wrap leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    {issue.content}
                                </p>

                                {issue.attachment && (
                                    <div className="flex items-center gap-2 text-xs text-slate-500 bg-blue-50 px-3 py-2 rounded border border-blue-100 mb-4">
                                        <Paperclip size={14} className="text-blue-500" />
                                        <span className="truncate font-medium text-blue-700 underline cursor-pointer">{issue.attachment}</span>
                                    </div>
                                )}

                                <div className="flex items-center justify-between text-xs text-slate-500 border-t border-slate-100 pt-4 mt-auto">
                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-1">
                                            <UserIcon size={14} />
                                            작성자: <span className="font-medium text-slate-700">{issue.author}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <ArrowRight size={12} className="text-slate-300" />
                                            대상: <span className="font-medium text-slate-700 bg-yellow-100 px-1.5 rounded">{issue.assignee}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            {canEdit && (
                                <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 flex justify-between items-center">
                                    {filterStatus === 'Deleted' ? (
                                        <div className="flex gap-2 w-full justify-end">
                                            <button 
                                                onClick={() => onRestoreIssue(issue.id)}
                                                className="flex items-center gap-1 text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 transition-colors"
                                            >
                                                <RotateCcw size={14} /> 복구
                                            </button>
                                            <button 
                                                onClick={() => { if(window.confirm('영구적으로 삭제하시겠습니까?')) onPermanentDeleteIssue(issue.id); }}
                                                className="flex items-center gap-1 text-xs font-medium bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 transition-colors"
                                            >
                                                <Trash2 size={14} /> 영구 삭제
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex gap-2">
                                                {issue.status !== 'Resolved' && (
                                                    <button 
                                                        onClick={() => onUpdateStatus(issue.id, 'Resolved')}
                                                        className="text-xs font-medium bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700 transition-colors"
                                                    >
                                                        완료 처리
                                                    </button>
                                                )}
                                                {issue.status === 'Open' && (
                                                    <button 
                                                        onClick={() => onUpdateStatus(issue.id, 'InProgress')}
                                                        className="text-xs font-medium bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded hover:bg-slate-50 transition-colors"
                                                    >
                                                        진행중 표시
                                                    </button>
                                                )}
                                                {issue.status === 'Resolved' && (
                                                    <button 
                                                        onClick={() => onUpdateStatus(issue.id, 'Open')}
                                                        className="text-xs font-medium bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded hover:bg-slate-50 transition-colors"
                                                    >
                                                        다시 열기
                                                    </button>
                                                )}
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    if(window.confirm('이슈를 삭제하시겠습니까? (휴지통으로 이동)')) onDeleteIssue(issue.id)
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
                                <th className="px-6 py-3 text-left w-32">Status</th>
                                <th className="px-6 py-3 text-left">Title</th>
                                <th className="px-6 py-3 text-center w-24">Priority</th>
                                <th className="px-6 py-3 text-left w-32">Assignee</th>
                                <th className="px-6 py-3 text-left w-32">Date</th>
                                <th className="px-6 py-3 text-right w-32">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredIssues.map(issue => (
                                <tr key={issue.id} className="hover:bg-slate-50 group">
                                    <td className="px-6 py-4">
                                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold border ${getStatusColor(issue.status)}`}>
                                             {issue.status === 'Open' ? '대기' : issue.status === 'InProgress' ? '진행' : '완료'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-slate-800">{issue.title}</div>
                                        <div className="text-xs text-slate-400 truncate max-w-md">{issue.content}</div>
                                        {issue.attachment && <div className="text-xs text-blue-500 flex items-center gap-1 mt-1"><Paperclip size={10} />{issue.attachment}</div>}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`text-xs font-bold ${
                                            issue.priority === 'High' ? 'text-red-600' : 
                                            issue.priority === 'Medium' ? 'text-yellow-600' : 'text-blue-600'
                                        }`}>
                                            {issue.priority}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-xs">
                                                {issue.assignee.substring(0, 1)}
                                            </div>
                                            <span className="text-slate-700">{issue.assignee}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-500 text-xs">
                                        {new Date(issue.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        {canEdit ? (
                                            filterStatus === 'Deleted' ? (
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => onRestoreIssue(issue.id)} className="text-green-600 hover:bg-green-50 p-1 rounded" title="복구"><RotateCcw size={16} /></button>
                                                    <button onClick={() => { if(window.confirm('영구삭제?')) onPermanentDeleteIssue(issue.id); }} className="text-red-600 hover:bg-red-50 p-1 rounded" title="영구 삭제"><Trash2 size={16} /></button>
                                                </div>
                                            ) : (
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                     {issue.status !== 'Resolved' && (
                                                        <button onClick={() => onUpdateStatus(issue.id, 'Resolved')} className="text-green-600 hover:bg-green-50 p-1 rounded" title="완료"><CheckCircle size={16} /></button>
                                                     )}
                                                    <button onClick={() => { if(window.confirm('삭제?')) onDeleteIssue(issue.id); }} className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1 rounded" title="삭제"><Trash2 size={16} /></button>
                                                </div>
                                            )
                                        ) : (
                                            <span className="text-xs text-slate-300 flex items-center justify-end gap-1"><Lock size={12}/> View Only</span>
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
                            <h3 className="text-lg font-bold text-slate-800">새 이슈 등록</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <Plus size={24} className="rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">제목 (Title)</label>
                                <input 
                                    required
                                    type="text" 
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    placeholder="이슈 사항 요약"
                                />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">확인 대상 (Assignee)</label>
                                    <input 
                                        type="text" 
                                        value={assignee}
                                        onChange={e => setAssignee(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        placeholder="예: 김공무, 전체"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">중요도 (Priority)</label>
                                    <select 
                                        value={priority}
                                        onChange={e => setPriority(e.target.value as IssuePriority)}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    >
                                        <option value="Low">낮음 (Low)</option>
                                        <option value="Medium">보통 (Medium)</option>
                                        <option value="High">긴급 (High)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">상세 내용</label>
                                <textarea 
                                    required
                                    value={content}
                                    onChange={e => setContent(e.target.value)}
                                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none h-32 resize-none"
                                    placeholder="이슈에 대한 상세 내용을 작성하세요."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">첨부 파일 (Attachment)</label>
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
