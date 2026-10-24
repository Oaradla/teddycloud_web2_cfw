import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image, Trash2 } from "lucide-react";
import { tc } from "../../api/tc";
import type { CustomModel } from "../../api/types";
import { useAccess } from "../../lib/access";
import { t } from "../../lib/i18n";
import { keys } from "../../lib/queries";
import { Empty, ErrorBox, Loading, Row, useUi } from "../../ui/kit";
import { TonieImage } from "../../ui/TonieImage";

/** the pictures in custom_img, with the custom tonies showing them; deletable as the server allows */
export function PicturesList({ models }: { models: CustomModel[] }) {
    const files = useQuery({ queryKey: ["files", "custom_img"], queryFn: () => tc.files("", "custom_img") });
    const access = useAccess();
    const ui = useUi();
    const qc = useQueryClient();

    const remove = async (name: string, users: CustomModel[]) => {
        const yes = await ui.confirm({
            title: t("deletePicture"),
            text: users.length ? t("deletePictureShown", { name, n: users.length }) : t("deleteText", { name }),
            confirm: t("delete"),
            danger: true,
        });
        if (!yes) return;
        await ui.run(() => tc.deleteCustomImage(name), t("deleted"));
        qc.invalidateQueries({ queryKey: ["files", "custom_img"] });
        qc.invalidateQueries({ queryKey: keys.customModels });
        qc.invalidateQueries({ queryKey: ["aclMine"] });
    };

    if (files.isLoading) return <Loading />;
    if (files.error) return <ErrorBox error={files.error} retry={() => files.refetch()} />;
    const pictures = (files.data ?? []).filter((f) => !f.isDir && f.name !== "." && f.name !== "..");
    if (!pictures.length) return <Empty icon={<Image size={28} />} title={t("noPictures")} />;
    return (
        <div className="list">
            {pictures.map((f) => {
                const users = models.filter((m) => m.pic === `/custom_img/${f.name}`);
                return (
                    <Row
                        key={f.name}
                        leading={<TonieImage src={`/custom_img/${f.name}`} size={46} />}
                        title={f.name}
                        sub={users.length ? users.map((m) => m.series || m.model).join(", ") : t("pictureUnused")}
                        right={
                            access.mayDeleteImage(f.name) && (
                                <button className="icon-btn" onClick={() => remove(f.name, users)} aria-label={t("delete")}>
                                    <Trash2 size={18} />
                                </button>
                            )
                        }
                    />
                );
            })}
        </div>
    );
}
