import { parseSab } from './sabParser';
import { parseRebarCsv } from './rebarCsv';

// .sab 판독은 수백 MB를 읽으므로 화면이 멈추지 않게 워커에서 돌린다.
// 같은 폴더의 물량 CSV가 함께 오면 부재별 실행 물량도 읽는다.
self.onmessage = async (e: MessageEvent<{ sab: File; csv?: File }>) => {
    try {
        const buf = new Uint8Array(await e.data.sab.arrayBuffer());
        const model = parseSab(buf, p => self.postMessage({ type: 'progress', ...p }));
        let members = undefined;
        if (e.data.csv) {
            self.postMessage({ type: 'progress', ratio: 1, bodies: model.bodies.length, stage: 'csv' });
            members = parseRebarCsv(await e.data.csv.text());
        }
        self.postMessage({ type: 'done', model, members }, { transfer: [model.positions.buffer] });
    } catch (err) {
        self.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
};
