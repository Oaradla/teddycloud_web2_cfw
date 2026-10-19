import { FileKey, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { tc } from "../../api/tc";
import { t } from "../../lib/i18n";
import { useBoxes } from "../../lib/queries";
import { Notice, Page, Row, Section, useUi } from "../../ui/kit";

/** the client certificates (*.der) teddyCloud uses towards the cloud, for all boxes or one */
export function CertificatesPage() {
    const ui = useUi();
    const boxes = useBoxes();
    const [overlay, setOverlay] = useState("");
    const [done, setDone] = useState<string[]>([]);
    const input = useRef<HTMLInputElement>(null);

    const upload = async (files: FileList | null) => {
        const list = [...(files ?? [])];
        if (!list.length) return;
        const wrong = list.filter((f) => !f.name.toLowerCase().endsWith(".der"));
        if (wrong.length) {
            ui.toast("error", t("certsDerOnly"), wrong.map((f) => f.name).join(", "));
            return;
        }
        const ok = await ui.run(async () => {
            await tc.uploadCerts(list, overlay || undefined);
            return true;
        }, t("certsUploaded"));
        if (ok) setDone(list.map((f) => f.name));
        if (input.current) input.current.value = "";
    };

    return (
        <Page title={t("certificates")} subtitle={t("certificatesHint")} back="/system" narrow>
            <Notice info>{t("certificatesInfo")}</Notice>
            <Section title={t("certsFor")}>
                <div style={{ padding: "12px 16px" }}>
                    <select className="select" value={overlay} onChange={(e) => setOverlay(e.target.value)}>
                        <option value="">{t("certsForServer")}</option>
                        {(boxes.data ?? []).map((b) => (
                            <option key={b.ID} value={b.ID}>
                                {b.boxName || b.commonName}
                            </option>
                        ))}
                    </select>
                </div>
            </Section>
            <Section footer={t("certsUploadHint")}>
                <Row icon={<UploadCloud size={17} />} title={t("certsUpload")} accent onClick={() => input.current?.click()} chevron={false} />
                {done.map((name) => (
                    <Row key={name} icon={<FileKey size={17} />} title={name} sub={t("certsUploaded")} />
                ))}
            </Section>
            <input ref={input} type="file" accept=".der" multiple hidden onChange={(e) => upload(e.target.files)} />
        </Page>
    );
}
