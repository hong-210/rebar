import { RebarDiameter } from '../types';

// 엑셀의 직경/강종 표기를 하나의 기준으로 맞춘다.
// 내진용 철근 표시 'S'가 실행 물량은 강종(SD600S, S)에, SHOP 물량은 직경(D22S, 22S)에 붙어 오므로
// 직경은 'D22'로, S는 강종 쪽으로 모아야 실행과 SHOP이 같은 항목으로 비교된다.
// 강종 숫자가 없으면 지어내지 않고 '미기재'로 두되, 내진 여부는 '미기재(S)'로 남긴다.
//   직경 22,   강종 SD600S -> D22 / SD600S
//   직경 D22S, 강종 SD600  -> D22 / SD600S
//   직경 22,   강종 S      -> D22 / 미기재(S)
//   직경 22S,  강종 빈칸   -> D22 / 미기재(S)
//   직경 22,   강종 빈칸   -> D22 / 미기재
export const UNKNOWN_GRADE = '미기재';

export function normalizeRebarSpec(
    diaRaw: unknown,
    strengthRaw: unknown
): { diameter?: RebarDiameter; strength: string } {
    const diaStr = String(diaRaw ?? '').toUpperCase().replace(/\s/g, '');
    const sizeStr = diaStr.replace(/[^0-9]/g, '');
    const diameter = sizeStr
        ? Object.values(RebarDiameter).find(d => d === `D${sizeStr}`)
        : undefined;

    const written = String(strengthRaw ?? '').toUpperCase().replace(/\s/g, '');
    const seismic = /\dS$/.test(diaStr) || written.endsWith('S'); // D22S, 22S / SD600S, S
    const grade = written.replace(/S$/, ''); // 'SD600S' -> 'SD600', 'S' -> ''

    const strength = grade
        ? `${grade}${seismic ? 'S' : ''}`
        : `${UNKNOWN_GRADE}${seismic ? '(S)' : ''}`;
    return { diameter, strength };
}
