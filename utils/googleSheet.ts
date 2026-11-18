import * as XLSX from 'xlsx';

// 구글 시트를 물량 원본으로 연결한다. '링크가 있는 사용자 보기 가능'으로 공유된 시트는
// 로그인 없이 브라우저에서 바로 읽을 수 있다 (탭 목록: htmlview, 탭 내용: gviz CSV).

export interface SheetTab { gid: string; name: string }

export interface SheetLink {
    spreadsheetId: string;
    url: string;
    title: string;
    dataSource: 'Design' | 'Shop';
    tabs: SheetTab[];           // 마지막으로 읽은 탭 목록
    skippedGids: string[];      // 동기화하지 않을 탭
    auto: boolean;              // 화면을 열어 두면 주기적으로 동기화
    lastSync?: string;          // ISO
    lastResult?: string;        // 마지막 동기화 요약
}

export function parseSheetUrl(url: string): { id: string; gid?: string } | null {
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,})/);
    if (!m) return null;
    const g = url.match(/[#&?]gid=(\d+)/);
    return { id: m[1], gid: g?.[1] };
}

export const sheetSourceKey = (id: string, gid: string) => `gsheet:${id}:${gid}`;

const base = (id: string) => `https://docs.google.com/spreadsheets/d/${id}`;

const shareHint = '시트가 "링크가 있는 모든 사용자 - 뷰어"로 공유되어 있는지 확인하세요.';

// 탭 이름·번호와 문서 제목
export async function fetchSheetTabs(id: string): Promise<{ title: string; tabs: SheetTab[] }> {
    let html: string;
    try {
        const res = await fetch(`${base(id)}/htmlview`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        html = await res.text();
    } catch (e) {
        throw new Error(`구글 시트를 열 수 없습니다 (${e instanceof Error ? e.message : e}). ${shareHint}`);
    }
    const tabs: SheetTab[] = [];
    const re = /items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)"[^}]*?gid:\s*"(\d+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) tabs.push({ name: JSON.parse(`"${m[1]}"`), gid: m[2] });
    const title = (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '구글 시트').replace(/\s*-\s*(Google\s*(Sheets|Drive|스프레드시트|드라이브)|Google\s*Docs).*$/i, '').trim();
    if (tabs.length === 0) {
        if (/accounts\.google\.com|ServiceLogin/.test(html)) throw new Error(`로그인이 필요한 시트입니다. ${shareHint}`);
        tabs.push({ gid: '0', name: '시트1' });
    }
    return { title, tabs };
}

// 탭 하나를 엑셀 업로드와 같은 행 목록(머리글 → 값)으로
export async function fetchSheetRows(id: string, gid: string): Promise<Record<string, unknown>[]> {
    const res = await fetch(`${base(id)}/gviz/tq?tqx=out:csv&gid=${gid}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`탭을 읽지 못했습니다 (HTTP ${res.status}). ${shareHint}`);
    const csv = await res.text();
    if (/^\s*<!DOCTYPE html/i.test(csv)) throw new Error(`탭을 읽지 못했습니다. ${shareHint}`);
    // 날짜·숫자를 자동 변환하지 않고 글자 그대로 읽는다 (날짜는 normalizeDate로 맞춤)
    const wb = XLSX.read(csv, { type: 'string', raw: true });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
}

// --- 연결 목록 (이 브라우저에 프로젝트별로) ---
const KEY = 'rbm_v2_sheetLinks';
export function loadSheetLinks(projectId: string): SheetLink[] {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}')[projectId] ?? []; } catch { return []; }
}
export function saveSheetLinks(projectId: string, links: SheetLink[]) {
    try {
        const all = JSON.parse(localStorage.getItem(KEY) || '{}');
        all[projectId] = links;
        localStorage.setItem(KEY, JSON.stringify(all));
    } catch { /* 무시 */ }
}

// --- 날짜·출처 ---

// 엑셀 일련번호(45000), Date, '2026-11-05', '2026.11.5', '26/11/05' → 'YYYY-MM-DD'
export function normalizeDate(v: unknown): string | undefined {
    if (v === null || v === undefined || v === '') return undefined;
    const pad = (n: number) => String(n).padStart(2, '0');
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (v instanceof Date && !isNaN(v.getTime())) return fmt(v);
    if (typeof v === 'number' || /^\d{5}(\.\d+)?$/.test(String(v).trim())) {
        const n = Number(v);
        if (n > 20000 && n < 80000) return fmt(new Date(Math.round((n - 25569) * 86400000) + new Date().getTimezoneOffset() * 60000));
    }
    const s = String(v).trim();
    const m = s.match(/^(\d{2,4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
    if (m) {
        const y = m[1].length === 2 ? 2000 + Number(m[1]) : Number(m[1]);
        return `${y}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
    }
    return undefined;
}

// 파일 이름 → 출처 키. 확장자·리비전(_R02)·끝의 날짜/번호는 떼어 '같은 파일의 갱신본'을 알아본다
export function fileSourceKey(fileName: string): string {
    const stem = fileName.replace(/\.[^.]+$/, '')
        .replace(/[\s_-]*\(\d+\)$/, '')
        .replace(/[\s_-]*R\d+$/i, '')
        .replace(/[\s_-]*\d{6,8}$/, '')
        .replace(/[\s_-]*v?\d{1,3}$/i, '')
        .trim();
    return `file:${stem || fileName}`;
}

export const sourceLabel = (key: string, links: SheetLink[] = []): string => {
    if (key.startsWith('file:')) return `${key.slice(5)} (엑셀)`;
    if (key.startsWith('gsheet:')) {
        const [, id, gid] = key.split(':');
        const link = links.find(l => l.spreadsheetId === id);
        const tab = link?.tabs.find(t => t.gid === gid);
        return `${link?.title ?? '구글 시트'} / ${tab?.name ?? `탭 ${gid}`}`;
    }
    return key;
};
