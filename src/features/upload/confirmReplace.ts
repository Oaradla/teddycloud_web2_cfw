import { tc } from "../../api/tc";
import { t } from "../../lib/i18n";
import type { useUi } from "../../ui/kit";

/** asks before files of these names in the folder are replaced; true: go on */
export async function confirmReplace(
    ui: ReturnType<typeof useUi>,
    folder: string,
    names: string[],
): Promise<boolean> {
    const existing = new Set((await tc.files(folder).catch(() => [])).map((f) => f.name));
    const found = names.filter((n) => existing.has(n));
    if (!found.length) return true;
    return ui.confirm({
        title: t("upload.replace"),
        text:
            found.length === 1
                ? t("upload.exists", { name: found[0] })
                : t("upload.existsMany", { names: found.join(", ") }),
        confirm: t("upload.replace"),
        danger: true,
    });
}
