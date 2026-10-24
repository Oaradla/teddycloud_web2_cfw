// The messages the app showed (success, info, error), kept on this device to read them again.
import { useSyncExternalStore } from "react";
import { getPref, setPref } from "./prefs";

export interface Notification {
    id: number;
    kind: "ok" | "info" | "error";
    text: string;
    detail?: string;
    time: number;
    read?: boolean;
}

const MAX = 300;
let list: Notification[] = (() => {
    try {
        return JSON.parse(getPref("notifications", "[]"));
    } catch {
        return [];
    }
})();
const listeners = new Set<() => void>();

const save = (next: Notification[]) => {
    list = next;
    setPref("notifications", JSON.stringify(list));
    listeners.forEach((l) => l());
};

export const notifications = {
    add: (n: Omit<Notification, "id" | "time">) => save([{ ...n, id: Date.now() + Math.random(), time: Date.now() }, ...list].slice(0, MAX)),
    markRead: (ids?: number[]) => save(list.map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n))),
    remove: (ids?: number[]) => save(ids ? list.filter((n) => !ids.includes(n.id)) : []),
};

export const useNotifications = () =>
    useSyncExternalStore(
        (l) => {
            listeners.add(l);
            return () => listeners.delete(l);
        },
        () => list,
    );
