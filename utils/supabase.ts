import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

// 환경변수가 없으면 createClient가 예외를 던져 화면이 통째로 죽으므로 자리표시 값을 넣고,
// App에서 isSupabaseConfigured로 안내 화면을 대신 보여준다.
export const supabase = createClient(url || 'http://localhost', anonKey || 'missing-anon-key');
