import { User } from '../types';

// 테스트용 로컬 모드: Supabase 대신 브라우저 저장소(localStorage, PDF는 IndexedDB)에 저장하고
// 로그인 없이 관리자 계정으로 바로 들어간다.
// .env.local 에 VITE_DATA_MODE=supabase 를 넣으면 Supabase 연동(로그인 포함)으로 동작한다.
export const isLocalMode = import.meta.env.VITE_DATA_MODE !== 'supabase';

export const LOCAL_ADMIN: User = {
    id: 'local-admin',
    email: 'admin',
    name: '관리자(Admin)',
    role: 'admin'
};

export function readLocal<T>(key: string, fallback: T): T {
    try {
        const stored = localStorage.getItem(key);
        return stored !== null ? JSON.parse(stored) : fallback;
    } catch {
        return fallback;
    }
}

// 용량 초과 등 저장 실패는 화면에서 알릴 수 있도록 예외를 그대로 던진다.
export function writeLocal<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
}
