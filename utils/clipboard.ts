// navigator.clipboard도 https나 localhost에서만 제공되므로, http://192.168.x.x 접속 시에는
// 숨긴 입력란을 선택해 복사하는 예전 방식(execCommand)으로 대신한다.
export async function copyText(text: string): Promise<boolean> {
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // 권한 거부 등은 아래 방식으로 다시 시도
        }
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        document.body.removeChild(textarea);
    }
}
