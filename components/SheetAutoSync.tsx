import { useEffect, useRef } from 'react';
import { BatchUploadResult, MaterialEntry, Project, SyncOptions, UploadMode } from '../types';
import { buildMaterialUpload } from '../utils/materialImport';
import { AUTO_MINUTES, dueLinks, runSheetSync } from '../utils/sheetSyncCore';

interface SheetAutoSyncProps {
    project: Project;
    materials: MaterialEntry[];
    canEdit: boolean;
    onBatchAddMaterials: (entries: MaterialEntry[], mode: UploadMode, sync?: SyncOptions) => BatchUploadResult;
}

// 화면 없이 앱 전체에서 돈다: 플랫폼의 어느 화면이든 열려 있으면, 자동 동기화가 켜진 구글 시트를
// 열 때(마지막 동기화가 10분보다 오래됐으면) 한 번, 그 뒤 10분마다 다시 읽는다. 묻는 창은 띄우지 않는다.
export function SheetAutoSync({ project, materials, canEdit, onBatchAddMaterials }: SheetAutoSyncProps) {
    const latest = useRef({ project, materials, onBatchAddMaterials });
    latest.current = { project, materials, onBatchAddMaterials };
    const running = useRef(false);

    useEffect(() => {
        if (!canEdit) return;
        const run = async () => {
            if (running.current) return;
            running.current = true;
            try {
                for (const link of dueLinks(project.id)) {
                    try {
                        await runSheetSync(link, {
                            projectId: project.id,
                            getMaterials: () => latest.current.materials,
                            build: (rows, key) => buildMaterialUpload(rows, key, {
                                project: latest.current.project, materials: latest.current.materials, dataSource: link.dataSource
                            }, { lenient: true }),
                            apply: (entries, sync) => { latest.current.onBatchAddMaterials(entries, 'sync', sync); },
                        });
                    } catch { /* 결과는 연결 정보(lastResult)에 남는다 */ }
                }
            } finally {
                running.current = false;
            }
        };
        const first = setTimeout(run, 3000);
        const timer = setInterval(run, AUTO_MINUTES * 60000);
        return () => { clearTimeout(first); clearInterval(timer); };
    }, [project.id, canEdit]);

    return null;
}
