import { q } from "../api/client";
import type { FileEntry, Tag } from "../api/types";
import type { PlayItem } from "../player/Player";
import { stripExt, tagInfo, tagSubtitle, tagTitle } from "./format";

export const canPlayTag = (tag: Tag) => tag.valid || tag.live || Boolean(tag.source);

export const tagPlayItem = (tag: Tag): PlayItem => {
    const info = tagInfo(tag);
    const chapters = tag.trackSeconds?.length ? tag.trackSeconds : undefined;
    const titles = info.tracks?.length && chapters && info.tracks.length >= chapters.length ? info.tracks : undefined;
    return {
        id: tag.ruid,
        title: tagTitle(tag),
        subtitle: tagSubtitle(tag),
        pic: info.picture,
        url: tag.audioUrl,
        chapters,
        chapterTitles: titles,
        length: tag.lengthSeconds,
    };
};

/** URL of a library file; TAF files are delivered as plain Ogg (ogg=true) for the player */
export const libraryFileUrl = (path: string, ogg = true) => {
    const clean = path.replace(/^\/+/, "");
    const encoded = clean.split("/").map(encodeURIComponent).join("/");
    return `/content/${encoded}${q({ ogg: ogg && /\.taf$/i.test(clean) ? "true" : undefined, special: "library" })}`;
};

export const filePlayItem = (path: string, file: FileEntry): PlayItem => ({
    id: "lib:" + path,
    title: file.tonieInfo?.series || stripExt(file.name),
    subtitle: file.tonieInfo?.episode || path.split("/").slice(0, -1).join("/") || undefined,
    pic: file.tonieInfo?.picture,
    url: libraryFileUrl(path),
    chapters: file.tafHeader?.trackSeconds,
    chapterTitles:
        file.tonieInfo?.tracks?.length && file.tafHeader?.trackSeconds && file.tonieInfo.tracks.length >= file.tafHeader.trackSeconds.length
            ? file.tonieInfo.tracks
            : undefined,
    length: file.tafHeader?.lengthSeconds,
});
