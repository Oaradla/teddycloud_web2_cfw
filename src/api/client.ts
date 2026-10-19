// Thin fetch layer for the teddyCloud API.
//
// The app lives at <prefix>/web/v2/index.html. <prefix> is empty for a plain installation and
// set when teddyCloud sits behind a reverse proxy below a sub path (e.g. Home Assistant ingress).
// All backend paths are root-absolute ("/api/...") and get the prefix in front.

const detectPrefix = (): string => {
    const path = window.location.pathname;
    const at = path.indexOf("/web/");
    return at > 0 ? path.slice(0, at) : "";
};

export const PREFIX = detectPrefix();

/** URL of a backend path (/api/..., /content/..., /cache/...); absolute URLs stay as they are */
export const backendUrl = (path: string | undefined | null): string => {
    if (!path) return "";
    if (/^([a-z][a-z\d+.-]*:|\/\/)/i.test(path)) return path;
    if (!path.startsWith("/")) return path;
    if (PREFIX && path.startsWith(PREFIX + "/")) return path;
    return PREFIX + path;
};

/** the classic web UI of teddyCloud */

export class ApiError extends Error {
    status: number;
    code: string;
    data: unknown;
    constructor(message: string, status: number, code = "", data: unknown = undefined) {
        super(message);
        this.status = status;
        this.code = code;
        this.data = data;
    }
}

type ReauthHandler = () => Promise<boolean>;
let reauthHandler: ReauthHandler | null = null;
let reauthPending: Promise<boolean> | null = null;

/** sensitive changes answer 403 reauth_required: the handler asks for the password again */
export const setReauthHandler = (handler: ReauthHandler | null) => {
    reauthHandler = handler;
};

const askReauth = () => {
    if (!reauthHandler) return Promise.resolve(false);
    if (!reauthPending) {
        reauthPending = reauthHandler().finally(() => {
            reauthPending = null;
        });
    }
    return reauthPending;
};

const needsReauth = async (response: Response) => {
    if (response.status !== 403) return false;
    try {
        const data = await response.clone().json();
        return data?.error === "reauth_required";
    } catch {
        return false;
    }
};

export const AUTH_REQUIRED_EVENT = "tc-auth-required";

export async function request(path: string, init: RequestInit = {}): Promise<Response> {
    const url = backendUrl(path);
    const send = () => fetch(url, { credentials: "same-origin", ...init });
    let response = await send();
    if (await needsReauth(response)) {
        if (await askReauth()) response = await send();
    }
    if (response.status === 401 && !path.startsWith("/api/auth/")) {
        window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
    }
    return response;
}

const errorFrom = async (response: Response): Promise<ApiError> => {
    const text = await response.text().catch(() => "");
    let data: any = undefined;
    try {
        data = text ? JSON.parse(text) : undefined;
    } catch {
        /* plain text */
    }
    const message =
        (data && (data.message || data.error)) || text || `${response.status} ${response.statusText}`;
    return new ApiError(String(message), response.status, data?.error ?? "", data);
};

export async function getText(path: string): Promise<string> {
    const response = await request(path);
    if (!response.ok) throw await errorFrom(response);
    return response.text();
}

export async function getJson<T>(path: string): Promise<T> {
    const response = await request(path);
    if (!response.ok) throw await errorFrom(response);
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
}

/** POST with a plain text body (the classic teddyCloud style, e.g. "live=true") */
export async function postText(path: string, body = ""): Promise<Response> {
    const response = await request(path, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body,
    });
    if (!response.ok) throw await errorFrom(response);
    return response;
}

export async function postJson<T = any>(path: string, body: unknown): Promise<T> {
    const response = await request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) throw await errorFrom(response);
    const text = await response.text();
    try {
        return (text ? JSON.parse(text) : {}) as T;
    } catch {
        return { message: text } as T;
    }
}

/** POST of form data with upload progress (fetch can not report it) */
export function postForm(
    path: string,
    form: FormData,
    onProgress?: (fraction: number) => void,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", backendUrl(path));
        xhr.withCredentials = true;
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
            else {
                if (xhr.status === 401) window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
                reject(new ApiError(xhr.responseText || `HTTP ${xhr.status}`, xhr.status));
            }
        };
        xhr.onerror = () => reject(new ApiError("Netzwerkfehler", 0));
        xhr.send(form);
    });
}

export const q = (params: Record<string, string | number | boolean | undefined | null>) => {
    const parts = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    return parts.length ? "?" + parts.join("&") : "";
};
