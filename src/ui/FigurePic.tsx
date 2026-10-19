import type { Tag } from "../api/types";
import { figureInfo, linkedContent } from "../lib/format";
import { TonieImage } from "./TonieImage";

/** the figure of a tag, with the picture of linked other content small in the corner */
export function FigurePic({ tag, className = "" }: { tag: Tag; className?: string }) {
    const linked = linkedContent(tag);
    return (
        <div className={`figure-pic ${className}`}>
            <TonieImage src={figureInfo(tag).picture || linked?.picture} />
            {linked && figureInfo(tag).picture && linked.picture && (
                <div className="linked">
                    <TonieImage src={linked.picture} />
                </div>
            )}
        </div>
    );
}
