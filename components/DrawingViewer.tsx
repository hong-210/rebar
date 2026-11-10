
import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ShopDrawing, DrawingPin, PinStatus, User } from '../types';
import { getPdfFile } from '../utils/pdfStorage';
import { getDrawingProgress } from '../utils/shopDrawing';
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, MapPin, Loader2, Crosshair, CheckCircle2, RotateCcw } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface DrawingViewerProps {
    drawing: ShopDrawing;
    user: User;
    canEdit: boolean;
    onUpdateDrawing: (updated: ShopDrawing) => void;
    onClose: () => void;
}

export const DrawingViewer: React.FC<DrawingViewerProps> = ({ drawing, user, canEdit, onUpdateDrawing, onClose }) => {
    const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
    const [pageNum, setPageNum] = useState(1);
    const [scale, setScale] = useState(1.2);
    const [pinMode, setPinMode] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Load the PDF document from storage when the drawing changes
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        setPageNum(1);

        (async () => {
            const blob = await getPdfFile(drawing.projectId, drawing.id);
            if (!blob) {
                if (!cancelled) { setError('PDF 파일을 찾을 수 없습니다.'); setLoading(false); }
                return;
            }
            const buf = await blob.arrayBuffer();
            const doc = await pdfjsLib.getDocument({ data: buf }).promise;
            if (!cancelled) { setPdfDoc(doc); setLoading(false); }
        })().catch(() => {
            if (!cancelled) { setError('PDF 파일을 불러오는 중 오류가 발생했습니다.'); setLoading(false); }
        });

        return () => { cancelled = true; };
    }, [drawing.id]);

    // Render the current page onto the canvas
    useEffect(() => {
        if (!pdfDoc) return;
        let cancelled = false;

        (async () => {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale });
            const canvas = canvasRef.current;
            if (!canvas || cancelled) return;

            const outputScale = window.devicePixelRatio || 1;
            canvas.width = Math.floor(viewport.width * outputScale);
            canvas.height = Math.floor(viewport.height * outputScale);
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
            await page.render({ canvasContext: ctx, canvas, viewport, transform }).promise;
        })();

        return () => { cancelled = true; };
    }, [pdfDoc, pageNum, scale]);

    const pinsOnPage = drawing.pins.filter(p => p.page === pageNum);
    const totalConfirmed = drawing.pins.filter(p => p.status === 'Confirmed').length;
    const progress = getDrawingProgress(drawing);

    const handleToggleComplete = () => {
        if (drawing.completed) {
            onUpdateDrawing({ ...drawing, completed: false, completedBy: undefined, completedAt: undefined });
        } else {
            onUpdateDrawing({ ...drawing, completed: true, completedBy: user.name, completedAt: new Date().toISOString() });
        }
    };

    const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!pinMode || !canEdit) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const xPct = ((e.clientX - rect.left) / rect.width) * 100;
        const yPct = ((e.clientY - rect.top) / rect.height) * 100;
        const label = window.prompt('검측 항목 이름을 입력하세요. (예: 주철근 간격 확인)');
        if (!label) return;

        const newPin: DrawingPin = {
            id: Date.now().toString(),
            page: pageNum,
            xPct,
            yPct,
            label,
            status: 'Pending'
        };
        onUpdateDrawing({ ...drawing, pins: [...drawing.pins, newPin] });
    };

    const handlePinClick = (e: React.MouseEvent, pin: DrawingPin) => {
        e.stopPropagation();
        if (!canEdit) return;

        if (pinMode) {
            if (window.confirm(`'${pin.label}' 항목을 삭제하시겠습니까?`)) {
                onUpdateDrawing({ ...drawing, pins: drawing.pins.filter(p => p.id !== pin.id) });
            }
            return;
        }

        const updatedPins = drawing.pins.map(p => {
            if (p.id !== pin.id) return p;
            if (p.status === 'Pending') {
                return { ...p, status: 'Confirmed' as PinStatus, confirmedBy: user.name, confirmedAt: new Date().toISOString() };
            }
            return { ...p, status: 'Pending' as PinStatus, confirmedBy: undefined, confirmedAt: undefined };
        });
        onUpdateDrawing({ ...drawing, pins: updatedPins });
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
            {/* Header */}
            <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                    <h3 className="font-bold truncate flex items-center gap-2">
                        {drawing.title}
                        {drawing.completed && (
                            <span className="text-xs font-bold bg-green-500/20 text-green-400 px-2 py-0.5 rounded shrink-0">검측완료</span>
                        )}
                    </h3>
                    <p className="text-xs text-slate-400 truncate">{drawing.dong} {drawing.floor} · {drawing.fileName}</p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-xs">
                        <div className="w-28 h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="font-bold">{progress}%</span>
                        <span className="text-slate-400">({totalConfirmed}/{drawing.pins.length})</span>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg" title="닫기">
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            <div className="bg-slate-800 text-slate-200 px-4 py-2 flex items-center justify-between gap-4 flex-wrap text-sm">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setPageNum(p => Math.max(1, p - 1))}
                        disabled={pageNum <= 1}
                        className="p-1.5 rounded hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <span>{pageNum} / {drawing.totalPages}</span>
                    <button
                        onClick={() => setPageNum(p => Math.min(drawing.totalPages, p + 1))}
                        disabled={pageNum >= drawing.totalPages}
                        className="p-1.5 rounded hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={() => setScale(s => Math.max(0.4, s - 0.2))} className="p-1.5 rounded hover:bg-slate-700" title="축소">
                        <ZoomOut size={18} />
                    </button>
                    <span className="w-12 text-center">{Math.round(scale * 100)}%</span>
                    <button onClick={() => setScale(s => Math.min(3, s + 0.2))} className="p-1.5 rounded hover:bg-slate-700" title="확대">
                        <ZoomIn size={18} />
                    </button>

                    {canEdit && (
                        <>
                            <button
                                onClick={() => setPinMode(m => !m)}
                                className={`ml-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                                    pinMode ? 'bg-blue-600 text-white' : 'bg-slate-700 hover:bg-slate-600'
                                }`}
                            >
                                <Crosshair size={16} /> {pinMode ? '항목 추가 모드 (도면 클릭)' : '검측 항목 편집'}
                            </button>
                            <button
                                onClick={handleToggleComplete}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-colors ${
                                    drawing.completed
                                        ? 'bg-white/10 border border-green-500 text-green-400 hover:bg-white/20'
                                        : 'bg-green-600 text-white hover:bg-green-700'
                                }`}
                            >
                                {drawing.completed ? <><RotateCcw size={16} /> 검측완료 취소</> : <><CheckCircle2 size={16} /> 검측완료 처리</>}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 overflow-auto p-6 flex items-start justify-center">
                {loading && (
                    <div className="text-white flex flex-col items-center gap-3 mt-20">
                        <Loader2 size={32} className="animate-spin" />
                        <span>도면을 불러오는 중...</span>
                    </div>
                )}
                {error && (
                    <div className="text-red-300 mt-20">{error}</div>
                )}
                {!loading && !error && (
                    <div
                        className={`relative inline-block bg-white shadow-2xl ${pinMode ? 'cursor-crosshair' : ''}`}
                        onClick={handleCanvasClick}
                    >
                        <canvas ref={canvasRef} className="block" />
                        {pinsOnPage.map((pin, idx) => (
                            <button
                                key={pin.id}
                                onClick={(e) => handlePinClick(e, pin)}
                                title={pin.label}
                                style={{ left: `${pin.xPct}%`, top: `${pin.yPct}%` }}
                                className={`absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-lg border-2 border-white transition-transform hover:scale-110 ${
                                    pin.status === 'Confirmed' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                                }`}
                            >
                                {pin.status === 'Confirmed' ? <MapPin size={14} /> : idx + 1}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
