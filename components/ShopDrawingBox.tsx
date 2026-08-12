
import React, { useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ShopDrawing, Project, User } from '../types';
import { savePdfFile, getPdfFile, deletePdfFile } from '../utils/pdfStorage';
import { getDrawingProgress, getDrawingStatus } from '../utils/shopDrawing';
import { DrawingViewer } from './DrawingViewer';
import { Plus, FileText, Download, Trash2, Loader2, MapPinned, Eye, X, UploadCloud, CheckCircle2, RotateCcw } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface ShopDrawingBoxProps {
    currentProject: Project;
    user: User;
    drawings: ShopDrawing[];
    onAddDrawing: (drawing: ShopDrawing) => void;
    onUpdateDrawing: (updated: ShopDrawing) => void;
    onDeleteDrawing: (id: string) => void;
}

export const ShopDrawingBox: React.FC<ShopDrawingBoxProps> = ({
    currentProject, user, drawings, onAddDrawing, onUpdateDrawing, onDeleteDrawing
}) => {
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [viewingId, setViewingId] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);

    // Form State
    const [dong, setDong] = useState(currentProject.buildings[0]?.name || '');
    const [floor, setFloor] = useState('');
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const userRole = currentProject.members.find(m => m.userId === user.email)?.role || 'Guest';
    const canEdit = userRole === 'Admin' || userRole === 'Participant';

    const projectDrawings = drawings.filter(d => d.projectId === currentProject.id);
    const viewingDrawing = viewingId ? projectDrawings.find(d => d.id === viewingId) || null : null;

    const resetForm = () => {
        setDong(currentProject.buildings[0]?.name || '');
        setFloor('');
        setPendingFiles([]);
        setUploadProgress(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const addFiles = (files: FileList | File[]) => {
        const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
        if (pdfFiles.length === 0) return;
        setPendingFiles(prev => {
            const existingKeys = new Set(prev.map(f => `${f.name}_${f.size}`));
            const merged = [...prev];
            for (const f of pdfFiles) {
                const key = `${f.name}_${f.size}`;
                if (!existingKeys.has(key)) {
                    existingKeys.add(key);
                    merged.push(f);
                }
            }
            return merged;
        });
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) addFiles(e.target.files);
        e.target.value = '';
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
    };

    const removeFile = (idx: number) => {
        setPendingFiles(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pendingFiles.length === 0) return;

        setUploading(true);
        setUploadProgress({ done: 0, total: pendingFiles.length });
        const failed: string[] = [];

        for (let i = 0; i < pendingFiles.length; i++) {
            const file = pendingFiles[i];
            try {
                const buf = await file.arrayBuffer();
                const doc = await pdfjsLib.getDocument({ data: buf }).promise;
                const id = `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`;
                await savePdfFile(id, file);

                const newDrawing: ShopDrawing = {
                    id,
                    projectId: currentProject.id,
                    dong,
                    floor: floor || undefined,
                    title: file.name.replace(/\.pdf$/i, ''),
                    fileName: file.name,
                    totalPages: doc.numPages,
                    pins: [],
                    uploadedBy: user.name,
                    uploadedAt: new Date().toISOString()
                };

                onAddDrawing(newDrawing);
            } catch {
                failed.push(file.name);
            }
            setUploadProgress({ done: i + 1, total: pendingFiles.length });
        }

        setUploading(false);
        setIsUploadModalOpen(false);
        resetForm();

        if (failed.length > 0) {
            alert(`${failed.length}개 파일 업로드에 실패했습니다. (올바른 PDF 파일인지 확인해주세요)\n\n${failed.join('\n')}`);
        }
    };

    const handleDownload = async (drawing: ShopDrawing) => {
        const blob = await getPdfFile(drawing.id);
        if (!blob) { alert('저장된 파일을 찾을 수 없습니다.'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = drawing.fileName;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleDelete = async (drawing: ShopDrawing) => {
        if (!window.confirm(`'${drawing.title}' 도면을 삭제하시겠습니까? 등록된 검측 항목이 모두 삭제됩니다.`)) return;
        await deletePdfFile(drawing.id);
        onDeleteDrawing(drawing.id);
    };

    const handleToggleComplete = (drawing: ShopDrawing) => {
        if (drawing.completed) {
            onUpdateDrawing({ ...drawing, completed: false, completedBy: undefined, completedAt: undefined });
        } else {
            onUpdateDrawing({ ...drawing, completed: true, completedBy: user.name, completedAt: new Date().toISOString() });
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">샵도면함 (Shop Drawings)</h2>
                    <p className="text-slate-500">PDF 샵도면을 여러 개 한번에 업로드하고, 태블릿으로 현장 확인 후 진행율을 관리합니다.</p>
                </div>
                {canEdit && (
                    <button
                        onClick={() => setIsUploadModalOpen(true)}
                        className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-all shadow-md font-medium"
                    >
                        <Plus size={20} /> 도면 업로드
                    </button>
                )}
            </div>

            {/* List */}
            {projectDrawings.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300">
                    <FileText className="mx-auto h-12 w-12 text-slate-300 mb-4" />
                    <p className="text-slate-500 font-medium">업로드된 샵도면이 없습니다.</p>
                    {canEdit && <p className="text-sm text-slate-400">PDF 도면을 업로드하고 현장 검측 항목을 등록해보세요.</p>}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {projectDrawings.map(drawing => {
                        const progress = getDrawingProgress(drawing);
                        const status = getDrawingStatus(drawing);
                        return (
                            <div key={drawing.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col">
                                <div className="p-5 flex-1">
                                    <div className="flex justify-between items-start mb-3">
                                        <span className={`px-2.5 py-1 rounded text-xs font-bold border ${status.className}`}>{status.label}</span>
                                        <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-1 rounded">{drawing.dong} {drawing.floor}</span>
                                    </div>

                                    <h3 className="text-lg font-bold text-slate-800 mb-1 truncate" title={drawing.title}>{drawing.title}</h3>
                                    <p className="text-xs text-slate-400 truncate mb-4">{drawing.fileName} · {drawing.totalPages}p</p>

                                    <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                                        <span className="flex items-center gap-1"><MapPinned size={12} /> 검측 항목 {drawing.pins.length}개</span>
                                        <span className="font-bold text-slate-700">{progress}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden mb-4">
                                        <div
                                            className={`h-full ${progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>

                                    <div className="text-xs text-slate-400 border-t border-slate-100 pt-3">
                                        업로드: {drawing.uploadedBy} · {new Date(drawing.uploadedAt).toLocaleDateString()}
                                        {drawing.completed && (
                                            <div className="text-green-600 mt-1">
                                                검측완료: {drawing.completedBy} · {drawing.completedAt && new Date(drawing.completedAt).toLocaleDateString()}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="bg-slate-50 px-5 py-3 border-t border-slate-100 space-y-2">
                                    <div className="flex justify-between items-center">
                                        <button
                                            onClick={() => setViewingId(drawing.id)}
                                            className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 transition-colors"
                                        >
                                            <Eye size={14} /> 도면 열기
                                        </button>
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => handleDownload(drawing)} className="text-slate-400 hover:text-blue-600 p-1.5 rounded hover:bg-blue-50 transition-colors" title="다운로드">
                                                <Download size={16} />
                                            </button>
                                            {canEdit && (
                                                <button onClick={() => handleDelete(drawing)} className="text-slate-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors" title="삭제">
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {canEdit && (
                                        <button
                                            onClick={() => handleToggleComplete(drawing)}
                                            className={`w-full flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded transition-colors ${
                                                drawing.completed
                                                    ? 'bg-white border border-green-300 text-green-700 hover:bg-green-50'
                                                    : 'bg-green-600 text-white hover:bg-green-700'
                                            }`}
                                        >
                                            {drawing.completed ? <><RotateCcw size={14} /> 검측완료 취소</> : <><CheckCircle2 size={14} /> 검측완료 처리</>}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Upload Modal */}
            {isUploadModalOpen && canEdit && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg animate-in fade-in zoom-in duration-200">
                        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800">샵도면 업로드</h3>
                                <p className="text-xs text-slate-400 mt-0.5">분할된 도면을 여러 개 한번에 선택하거나 끌어다 놓을 수 있습니다.</p>
                            </div>
                            <button onClick={() => { setIsUploadModalOpen(false); resetForm(); }} className="text-slate-400 hover:text-slate-600 disabled:opacity-30" disabled={uploading}>
                                <Plus size={24} className="rotate-45" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">동 (Dong)</label>
                                    <select
                                        required
                                        value={dong}
                                        onChange={e => setDong(e.target.value)}
                                        disabled={uploading}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                    >
                                        <option value="" disabled>선택</option>
                                        {currentProject.buildings.map(b => (
                                            <option key={b.name} value={b.name}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-slate-700 mb-1">층 (선택, 전체 파일 공통)</label>
                                    <input
                                        type="text"
                                        value={floor}
                                        onChange={e => setFloor(e.target.value)}
                                        disabled={uploading}
                                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        placeholder="예: 3F"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-1">PDF 파일 (여러 개 선택 가능)</label>
                                <div
                                    onClick={() => !uploading && fileInputRef.current?.click()}
                                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={handleDrop}
                                    className={`w-full px-4 py-6 border-2 border-dashed rounded-lg text-sm text-slate-600 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
                                        isDragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:bg-slate-50'
                                    } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
                                >
                                    <UploadCloud size={24} className="text-slate-400" />
                                    <span>클릭하거나 PDF 파일을 끌어다 놓으세요</span>
                                    <span className="text-xs text-slate-400">각 파일명이 도면명으로 자동 등록됩니다</span>
                                </div>
                                <input
                                    type="file"
                                    accept="application/pdf"
                                    multiple
                                    ref={fileInputRef}
                                    onChange={handleFileSelect}
                                    className="hidden"
                                />

                                {pendingFiles.length > 0 && (
                                    <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden">
                                        <div className="flex items-center justify-between px-3 py-2 bg-slate-50 text-xs font-medium text-slate-500 border-b border-slate-200">
                                            <span>선택된 파일 {pendingFiles.length}개</span>
                                            {!uploading && (
                                                <button type="button" onClick={() => setPendingFiles([])} className="text-red-500 hover:underline">
                                                    전체 삭제
                                                </button>
                                            )}
                                        </div>
                                        <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                                            {pendingFiles.map((f, idx) => (
                                                <div key={`${f.name}_${f.size}_${idx}`} className="flex items-center justify-between px-3 py-2 text-xs">
                                                    <span className="flex items-center gap-1.5 truncate">
                                                        <FileText size={12} className="text-slate-400 shrink-0" />
                                                        <span className="truncate">{f.name}</span>
                                                    </span>
                                                    {!uploading && (
                                                        <button type="button" onClick={() => removeFile(idx)} className="text-slate-400 hover:text-red-500 shrink-0 ml-2">
                                                            <X size={14} />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="pt-4">
                                <button
                                    type="submit"
                                    disabled={pendingFiles.length === 0 || uploading}
                                    className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {uploading
                                        ? <><Loader2 size={18} className="animate-spin" /> 업로드 중... ({uploadProgress?.done ?? 0}/{uploadProgress?.total ?? 0})</>
                                        : `${pendingFiles.length > 0 ? pendingFiles.length + '개 ' : ''}업로드`}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Viewer */}
            {viewingDrawing && (
                <DrawingViewer
                    drawing={viewingDrawing}
                    user={user}
                    canEdit={canEdit}
                    onUpdateDrawing={onUpdateDrawing}
                    onClose={() => setViewingId(null)}
                />
            )}
        </div>
    );
};
