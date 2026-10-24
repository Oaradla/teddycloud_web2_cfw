// The expert filter of the tonie list, with the syntax of the classic UI:
//   series = "Pixi" and valid,  language in (de-de, fr-fr),  tracks ~ "lied",  trackcount > 10,
//   unique(series),  episode is empty,  !live || nocloud,  model startswith 1000
// Parsed into a predicate; nothing of the query is evaluated as code.
import type { Tag } from "../api/types";
import { tagInfo } from "./format";

type Value = string | number | boolean | string[];
type Pred = (tag: Tag) => boolean;

const FIELDS: Record<string, (tag: Tag) => Value> = {
    series: (x) => tagInfo(x).series || "",
    episode: (x) => tagInfo(x).episode || "",
    model: (x) => tagInfo(x).model || "",
    language: (x) => tagInfo(x).language || "",
    picture: (x) => tagInfo(x).picture || "",
    exists: (x) => x.exists,
    valid: (x) => x.valid,
    live: (x) => x.live,
    nocloud: (x) => x.nocloud,
    uid: (x) => x.uid || "",
    ruid: (x) => x.ruid,
    claimed: (x) => x.claimed,
    hasCloudAuth: (x) => x.hasCloudAuth,
    source: (x) => x.source || "",
    tracks: (x) => tagInfo(x).tracks ?? [],
    trackcount: (x) => (tagInfo(x).tracks ?? []).length,
    tracksecondscount: (x) => (x.trackSeconds ?? []).length,
};
export const FILTER_FIELDS = Object.keys(FIELDS);

export class FilterError extends Error {}

const tokenize = (s: string) => {
    const re = /\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|&&|\|\||==|!=|>=|<=|[()!,=~<>]|[^\s()!,=~<>"']+)/gy;
    const out: string[] = [];
    let end = 0;
    for (let m = re.exec(s); m; m = re.exec(s)) {
        out.push(m[1]);
        end = re.lastIndex;
    }
    if (s.slice(end).trim()) throw new FilterError(s.slice(end).trim());
    return out;
};

const unquote = (tok: string) => (/^["']/.test(tok) ? tok.slice(1, -1).replace(/\\(.)/g, "$1") : tok);
const lower = (v: Value) => (Array.isArray(v) ? v.join(" ") : String(v)).toLowerCase();

/** compiles the query into a predicate; throws FilterError naming the token that does not fit */
export function compileFilter(query: string, all: Tag[]): Pred {
    const toks = tokenize(query);
    let i = 0;
    const peek = () => toks[i]?.toLowerCase();
    const next = () => {
        if (i >= toks.length) throw new FilterError("…");
        return toks[i++];
    };
    const expect = (tok: string) => {
        if (peek() !== tok) throw new FilterError(toks[i] ?? "…");
        i++;
    };
    const field = () => {
        const name = next();
        const f = FIELDS[name] ?? FIELDS[Object.keys(FIELDS).find((k) => k.toLowerCase() === name.toLowerCase()) ?? ""];
        if (!f) throw new FilterError(name);
        return f;
    };
    const counts = (f: (tag: Tag) => Value) => {
        const c = new Map<string, number>();
        for (const x of all) c.set(lower(f(x)), (c.get(lower(f(x))) ?? 0) + 1);
        return c;
    };

    const condition = (): Pred => {
        if (peek() === "unique") {
            i++;
            expect("(");
            const f = field();
            expect(")");
            const c = counts(f);
            return (x) => c.get(lower(f(x))) === 1;
        }
        const name = toks[i];
        // "track" compares with each track name
        const one = name?.toLowerCase() === "track";
        const f = one ? FIELDS.tracks : field();
        if (one) i++;
        const op = peek();
        if (op === "is") {
            i++;
            const not = peek() === "not" ? (i++, true) : false;
            expect("empty");
            return (x) => (lower(f(x)) === "") !== not;
        }
        if (op === "startswith" || op === "endswith") {
            i++;
            const v = unquote(next()).toLowerCase();
            return (x) => (op === "startswith" ? lower(f(x)).startsWith(v) : lower(f(x)).endsWith(v));
        }
        if (op === "in" || (op === "not" && toks[i + 1]?.toLowerCase() === "in")) {
            const not = op === "not";
            i += not ? 2 : 1;
            expect("(");
            const list: string[] = [];
            while (peek() !== ")") {
                list.push(unquote(next()).toLowerCase());
                if (peek() === ",") i++;
            }
            i++;
            return (x) => list.includes(lower(f(x))) !== not;
        }
        if (op && ["=", "==", "!=", "~", ">", "<", ">=", "<="].includes(op)) {
            i++;
            const raw = next();
            if (op === "~") {
                let re: RegExp;
                try {
                    re = new RegExp(unquote(raw), "i");
                } catch {
                    throw new FilterError(raw);
                }
                return (x) => {
                    const v = f(x);
                    return Array.isArray(v) ? v.some((s) => re.test(s)) : re.test(String(v));
                };
            }
            // tracksecondscount = trackcount compares two fields
            const other = FIELDS[raw];
            const value = (x: Tag) => (other ? other(x) : unquote(raw));
            if (op === "=" || op === "==" || op === "!=") {
                const eq = (x: Tag) => {
                    const v = f(x);
                    const w = lower(value(x));
                    return one && Array.isArray(v) ? v.some((s) => s.toLowerCase() === w) : lower(v) === w;
                };
                return op === "!=" ? (x) => !eq(x) : eq;
            }
            return (x) => {
                const a = Number(f(x));
                const b = Number(value(x));
                return op === ">" ? a > b : op === "<" ? a < b : op === ">=" ? a >= b : a <= b;
            };
        }
        return (x) => {
            const v = f(x);
            return Array.isArray(v) ? v.length > 0 : Boolean(v);
        };
    };
    const unary = (): Pred => {
        if (peek() === "!" || peek() === "not") {
            i++;
            const p = unary();
            return (x) => !p(x);
        }
        if (peek() === "(") {
            i++;
            const p = or();
            expect(")");
            return p;
        }
        return condition();
    };
    const and = (): Pred => {
        let p = unary();
        while (peek() === "&&" || peek() === "and") {
            i++;
            const a = p;
            const b = unary();
            p = (x) => a(x) && b(x);
        }
        return p;
    };
    const or = (): Pred => {
        let p = and();
        while (peek() === "||" || peek() === "or") {
            i++;
            const a = p;
            const b = and();
            p = (x) => a(x) || b(x);
        }
        return p;
    };

    if (!toks.length) return () => true;
    const p = or();
    if (i < toks.length) throw new FilterError(toks[i]);
    return p;
}
