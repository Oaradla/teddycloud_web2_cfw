// The data of TeddyStudio: the labels to print, the settings of the sheet and of each label.

/** what a single label may set differently from the sheet */
export interface LabelSettings {
    mode: "both" | "image" | "text";
    text: "title" | "tracks";
    background: string;
    font: string;
    fontSize: number;
    imageScale: number;
    imageAlign: "center" | "top" | "bottom" | "left" | "right";
    imageOffsetX: number;
    imageOffsetY: number;
    seriesOnImage: boolean;
    rotateSeries: boolean;
    seriesFontSize: number;
    padding: number;
    showModel: boolean;
    flag: boolean;
}

export interface StudioSettings extends LabelSettings {
    shape: "round" | "square";
    diameter: number;
    width: number;
    height: number;
    paper: "A4" | "A5" | "Letter";
    marginTop: number;
    marginLeft: number;
    gapX: number;
    gapY: number;
    bleed: number;
    border: boolean;
}

export interface StudioItem {
    id: string;
    title: string;
    episode: string;
    pic: string;
    tracks: string[];
    model: string;
    language?: string;
    overrides?: Partial<LabelSettings>;
}

export const DEFAULTS: StudioSettings = {
    shape: "round",
    diameter: 40,
    width: 50,
    height: 30,
    mode: "both",
    text: "title",
    paper: "A4",
    marginTop: 10,
    marginLeft: 10,
    gapX: 5,
    gapY: 5,
    bleed: 0,
    font: "sans-serif",
    fontSize: 11,
    background: "#ffffff",
    imageScale: 100,
    imageAlign: "center",
    imageOffsetX: 0,
    imageOffsetY: 0,
    seriesOnImage: false,
    rotateSeries: false,
    seriesFontSize: 9,
    padding: 2,
    border: true,
    showModel: false,
    flag: false,
};

export const PAPER_MM = { A4: [210, 297], A5: [148, 210], Letter: [216, 279] } as const;

export const effective = (s: StudioSettings, item: StudioItem): StudioSettings => ({ ...s, ...item.overrides });

/**
 * how many labels fit on a sheet: columns and rows between the margins (the right and bottom
 * margin taken as the left and top one), at least one of each
 */
export const sheetGrid = (s: StudioSettings) => {
    const [pw, ph] = PAPER_MM[s.paper];
    const w = s.shape === "round" ? s.diameter : s.width;
    const h = s.shape === "round" ? s.diameter : s.height;
    const cols = Math.max(1, Math.floor((pw - 2 * s.marginLeft + s.gapX + 0.01) / (w + s.gapX)));
    const rows = Math.max(1, Math.floor((ph - 2 * s.marginTop + s.gapY + 0.01) / (h + s.gapY)));
    return { pw, ph, w, h, cols, rows };
};

/** the labels in print order: per item its picture and/or its text label */
export const labelList = (items: StudioItem[], s: StudioSettings) =>
    items.flatMap((item) => {
        const e = effective(s, item);
        return [
            ...(e.mode !== "text" ? [{ item, e, kind: "image" as const }] : []),
            ...(e.mode !== "image" ? [{ item, e, kind: "text" as const }] : []),
        ];
    });

/** position factors of object-position */
export const ALIGN: Record<LabelSettings["imageAlign"], [number, number]> = {
    center: [0.5, 0.5],
    top: [0.5, 0],
    bottom: [0.5, 1],
    left: [0, 0.5],
    right: [1, 0.5],
};

/** black or white, whichever reads better on the background */
export const textOn = (hex: string) => {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return "#000";
    const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
    return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#000" : "#fff";
};
