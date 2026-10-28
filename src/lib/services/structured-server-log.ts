/**
 * UNIT34-A — structured server error logging (no secrets / PII / bodies).
 */

export type StructuredServerError = {
    requestId: string;
    method: string;
    path: string;
    status: number;
    durationMs: number;
    errorCode: string;
    /** Short, redacted summary only — never raw request bodies. */
    detail?: string;
};

const SENSITIVE =
    /(password|passwd|token|cookie|authorization|bearer|iban|sessionid|secret|api[_-]?key)/i;

function redact(text: string): string {
    if (!text) return '';
    let out = text.slice(0, 240);
    if (SENSITIVE.test(out)) return '[redacted]';
    out = out.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]');
    return out;
}

export function logStructuredServerError(event: StructuredServerError): void {
    const payload = {
        type: 'server_error',
        requestId: event.requestId,
        method: event.method,
        path: event.path,
        status: event.status,
        durationMs: event.durationMs,
        errorCode: event.errorCode,
        detail: event.detail ? redact(event.detail) : undefined,
    };
    console.error(JSON.stringify(payload));
}
