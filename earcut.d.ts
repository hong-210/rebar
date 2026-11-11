// earcut 3.x는 타입 선언을 포함하지 않는다
declare module 'earcut' {
    export default function earcut(data: ArrayLike<number>, holeIndices?: ArrayLike<number>, dim?: number): number[];
}
