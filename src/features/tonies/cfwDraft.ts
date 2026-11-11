import type { CfwTag } from "../../api/types";

/** what the user edits; the reported positions are not part of it */
export const settingsOf = (tag: CfwTag) => JSON.stringify([tag.kind, tag.profile, tag.event]);

/** the draft after the tag was read again: unsaved edits of the one read before stay */
export const nextDraft = (draft: CfwTag | null, before: CfwTag | undefined, read: CfwTag) =>
    draft && before && settingsOf(draft) !== settingsOf(before) ? draft : read;
