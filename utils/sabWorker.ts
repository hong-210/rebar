import { parseSab } from './sabParser';
import { parseRebarCsv, parseRebarXlsx } from './rebarCsv';

// .sab 판독은 수백 MB를 읽으므로 화면이 멈추지 않게 워커에서 돌린다.
// 형상(.sab)과 물량(빌더허브 _rebar.csv 또는 산출서 엑셀)은 둘 다, 또는 하나만 올 수 있다.
self.onmessage = async (e: MessageEvent<{ sab?: File; csv?: File }>) => {
    try {
        let model = undefined;
        if (e.data.sab) {
            const buf = new Uint8Array(await e.data.sab.arrayBuffer());
            model = parseSab(buf, p => self.postMessage({ type: 'progress', ...p }));
        }
        let quantities = undefined;
        if (e.data.csv) {
            self.postMessage({ type: 'progress', ratio: 1, bodies: model?.bodies.length ?? 0, stage: 'csv' });
            const qty = e.data.csv;
            quantities = /\.xlsx?$/i.test(qty.name)
                ? parseRebarXlsx(await qty.arrayBuffer())
                : parseRebarCsv(await qty.text());
        }
        self.postMessage({ type: 'done', model, quantities }, { transfer: model ? [model.positions.buffer] : [] });
    } catch (err) {
        self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
};
