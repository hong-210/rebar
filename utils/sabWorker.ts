import { parseSab } from './sabParser';
import { parseRebarCsv, parseRebarXlsx } from './rebarCsv';
import { parseConcCsv, parseConcXlsx } from './concreteModel';

// .sab 판독은 수백 MB를 읽으므로 화면이 멈추지 않게 워커에서 돌린다.
// 형상(.sab), 철근 물량(_rebar.csv), 콘크리트 물량(_conc.csv), 산출서 엑셀(rebar·conc 시트)은 어떤 조합으로든 올 수 있다.
self.onmessage = async (e: MessageEvent<{ sab?: File; csv?: File; conc?: File }>) => {
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
        self.postMessage({ type: 'done', model, quantities, concrete }, { transfer: model ? [model.positions.buffer] : [] });
    } catch (err) {
        self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
};
