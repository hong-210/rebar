
import React from 'react';
import { Box, Hammer } from 'lucide-react';

export const ThreeDViewer = () => {
    return (
        <div className="h-full flex flex-col space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                    <Box className="text-blue-600" /> 3D 모델 뷰어 (Beta)
                </h2>
                <p className="text-slate-500">IFC 파일을 업로드하여 3D 형상을 검토합니다.</p>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-xl border-2 border-dashed border-slate-200 p-12 text-center">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                    <Hammer size={40} className="text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-700 mb-2">기능 준비 중 (Coming Soon)</h3>
                <p className="text-slate-500 max-w-md">
                    3D 모델링 뷰어 기능은 현재 구축 중입니다.<br/>
                    추후 업데이트를 통해 IFC 파일 로드 및 시각화 기능을 제공할 예정입니다.
                </p>
            </div>
        </div>
    );
};
