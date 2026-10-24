import { getLang, pick } from "../../lib/i18n";

/** German texts of the fixed messages of the server's /api/cfw answers */
const DE: Record<string, string> = {
    "box not found": "Box nicht gefunden",
    "image not found": "Image nicht gefunden",
    "the image is for another box platform": "Das Image ist für eine andere Box-Generation",
    "the box checks for an update now": "Die Box sucht jetzt nach einem Update",
    "port out of range": "Port außerhalb des gültigen Bereichs",
    "out of memory": "Kein Speicher mehr",
    "could not store the settings": "Einstellungen konnten nicht gespeichert werden",
    "could not save": "Konnte nicht speichern",
    "channel must be release, beta or alpha": "Kanal muss Release, Beta oder Alpha sein",
    "assignment removed": "Zuweisung entfernt",
    "assigned; the box checks for the update now": "Zugewiesen – die Box holt das Update jetzt",
    "assigned; the box takes it at its next start": "Zugewiesen – die Box holt es beim nächsten Start",
    "unknown command": "Unbekannter Befehl",
    "remote control is switched off for this box": "Fernsteuerung ist für diese Box ausgeschaltet",
    "the box is not connected with the custom firmware": "Die Box ist nicht mit der Custom-Firmware verbunden",
    "the firmware of the box has no remote control": "Die Firmware der Box kann keine Fernsteuerung",
    "too many commands waiting": "Zu viele Befehle in der Warteschlange",
    "no image received": "Kein Image empfangen",
    "CFW support is off (cfw.enabled)": "CFW-Unterstützung ist ausgeschaltet (cfw.enabled)",
};

export const CFW_MESSAGES = Object.keys(DE);

export const cfwMessage = (message: string) => (DE[message] && getLang() !== "en" ? pick([DE[message], message], `cfw.${message}`) : message);
