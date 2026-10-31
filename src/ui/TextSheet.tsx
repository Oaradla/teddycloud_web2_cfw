import { Copy } from "lucide-react";
import { t } from "../lib/i18n";
import { Sheet } from "./Sheet";
import { useUi } from "./kit";

/** a text to read and copy, e.g. JSON */
export function TextSheet({
    title,
    text,
    hint,
    onClose,
}: {
    title: string;
    text: string | null;
    hint?: string;
    onClose: () => void;
}) {
    const ui = useUi();
    return (
        <Sheet
            open={text !== null}
            onClose={onClose}
            title={title}
            full
            footer={
                <>
                    <button
                        className="btn"
                        onClick={() =>
                            navigator.clipboard
                                .writeText(text ?? "")
                                .then(() => ui.toast("ok", t("common.copied")))
                        }
                    >
                        <Copy size={16} />
                        {t("common.copy")}
                    </button>
                    <button className="btn primary" onClick={onClose}>
                        {t("common.done")}
                    </button>
                </>
            }
        >
            {hint && <p className="small muted">{hint}</p>}
            <pre className="code-block selectable">{text}</pre>
        </Sheet>
    );
}
