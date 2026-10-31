import { Disc3 } from "lucide-react";
import { useState } from "react";
import { picUrl } from "../lib/format";

/** a tonie picture with a placeholder when there is none or it fails to load */
export function TonieImage({
    src,
    size,
    className = "",
    alt = "",
}: {
    src?: string;
    size?: number;
    className?: string;
    alt?: string;
}) {
    const [failedSrc, setFailedSrc] = useState<string>();
    const style = size ? { width: size, height: size } : undefined;
    if (!src || src === failedSrc)
        return (
            <div className={`tonie-pic-fallback ${className}`} style={style}>
                <Disc3 size={size ? Math.round(size * 0.5) : 40} />
            </div>
        );
    return (
        <img
            src={picUrl(src)}
            alt={alt}
            className={className}
            style={size ? { ...style, objectFit: "contain" } : undefined}
            loading={
                className.includes("hero-pic") || className.includes("cover") ? "eager" : "lazy"
            }
            decoding="async"
            onError={() => setFailedSrc(src)}
            draggable={false}
        />
    );
}
