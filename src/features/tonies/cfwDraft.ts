import type { CfwTag } from "../../api/types";

/** what the user edits and the kind keeps; the reported positions are not part of it */
export const settingsOf = (tag: CfwTag) =>
    JSON.stringify([
        tag.kind,
        tag.kind === "profile" ? tag.profile : null,
        tag.kind === "event" ? tag.event : null,
    ]);

/** the draft after the tag was read again: unsaved edits of the one read before stay */
export const nextDraft = (draft: CfwTag | null, before: CfwTag | undefined, read: CfwTag) =>
    draft && before && settingsOf(draft) !== settingsOf(before) ? draft : read;
