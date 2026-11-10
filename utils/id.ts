// crypto.randomUUID는 https나 localhost에서만 제공되므로, 같은 네트워크의 다른 기기에서
// http://192.168.x.x 로 접속할 때를 위해 getRandomValues(어디서나 사용 가능)로 UUID v4를 만든다.
export function newId(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
