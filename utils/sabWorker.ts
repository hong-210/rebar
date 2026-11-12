import { parseSab } from './sabParser';
import { parseRebarCsv, parseRebarXlsx } from './rebarCsv';
import { parseConcCsv, parseConcXlsx } from './concreteModel';
import { readVdclFile, drawingFileInfo } from './vdcl';

// .sab 판독은 수백 MB를 읽으므로 화면이 멈추지 않게 워커에서 돌린다.
// 형상(.sab), 철근 물량(_rebar.csv), 콘크리트 물량(_conc.csv), 산출서 엑셀(rebar·conc 시트)은 어떤 조합으로든 올 수 있다.
self.onmessage = async (e: MessageEvent<{ sab?: File; csv?: File; conc?: File; drawings?: File[] }>) => {
    try {
        let model = undefined;
        if (e.data.sab) {
            const buf = new Uint8Array(await e.data.sab.arrayBuffer());
            model = parseSab(buf, p => self.postMessage({ type: 'progress', ...p }));
        }
        let quantities = undefined;
        let concrete = undefined;
        if (e.data.csv || e.data.conc) self.postMessage({ type: 'progress', ratio: 1, bodies: model?.bodies.length ?? 0, stage: 'csv' });
        if (e.data.csv) {
            const qty = e.data.csv;
            if (/\.xlsx?$/i.test(qty.name)) {
                const buf = await qty.arrayBuffer();
                quantities = parseRebarXlsx(buf);
                concrete = parseConcXlsx(buf);
            } else {
                quantities = parseRebarCsv(await qty.text());
            }
        }
        if (e.data.conc) concrete = parseConcCsv(await e.data.conc.text());
        // 층별 참조 도면: 층 번호가 없는 원본 도면과 빈 도면은 건너뛴다
        const drawings = [];
        const skippedDrawings: string[] = [];
        for (const f of e.data.drawings ?? []) {
            if (!drawingFileInfo(f.name)) { skippedDrawings.push(`${f.name} (층 번호 없음: 원본 도면)`); continue; }
            self.postMessage({ type: 'progress', ratio: 1, bodies: model?.bodies.length ?? 0, stage: 'drawing', name: f.name });
            const d = await readVdclFile(f);
            if (d.segs.length === 0) { skippedDrawings.push(`${f.name} (빈 도면)`); continue; }
            drawings.push(d);
        }
        const transfer: Transferable[] = model ? [model.positions.buffer] : [];
        drawings.forEach(d => transfer.push(d.segs.buffer, d.segLayer.buffer));
        self.postMessage({ type: 'done', model, quantities, concrete, drawings, skippedDrawings }, { transfer });
    } catch (err) {
        self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
};
