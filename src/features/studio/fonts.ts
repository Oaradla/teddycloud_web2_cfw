// Label fonts of TeddyStudio: the system families and fonts bundled under the SIL Open Font
// License 1.1 (fonts/LICENSES.md), taken over from the classic UI.
const files = import.meta.glob("./fonts/*.woff2", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

const LATIN =
    "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD";
const LATIN_EXT =
    "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF";

/** label and CSS font-family; file: the bundled woff2 files are <file>-latin(-ext).woff2 */
export const FONTS: { label: string; css: string; file?: string }[] = [
    { label: "Sans-serif", css: "sans-serif" },
    { label: "Serif", css: "serif" },
    { label: "Comic Sans MS", css: '"Comic Sans MS", "Comic Sans", cursive' },
    { label: "Courier New", css: '"Courier New", Courier, monospace' },
    { label: "Inter", css: '"Inter", sans-serif', file: "inter" },
    { label: "Roboto", css: '"Roboto", sans-serif', file: "roboto" },
    { label: "Open Sans", css: '"Open Sans", sans-serif', file: "open-sans" },
    { label: "Merriweather", css: '"Merriweather", serif', file: "merriweather" },
    { label: "Atkinson Hyperlegible", css: '"Atkinson Hyperlegible", sans-serif', file: "atkinson-hyperlegible" },
    { label: "Fredoka", css: '"Fredoka", sans-serif', file: "fredoka" },
    { label: "Bubblegum Sans", css: '"Bubblegum Sans", cursive', file: "bubblegum-sans" },
    { label: "Patrick Hand", css: '"Patrick Hand", cursive', file: "patrick-hand" },
    { label: "Indie Flower", css: '"Indie Flower", cursive', file: "indie-flower" },
    { label: "Schoolbell", css: '"Schoolbell", cursive', file: "schoolbell" },
];

/** @font-face rules with absolute URLs, for the page and for the print frame */
export const fontFaces = () =>
    FONTS.flatMap((f) =>
        [
            ["latin", LATIN],
            ["latin-ext", LATIN_EXT],
        ]
            .map(([subset, range]) => [files[`./fonts/${f.file}-${subset}.woff2`], range])
            .filter(([url]) => f.file && url)
            .map(([url, range]) => `@font-face{font-family:${f.css.split(",")[0]};font-weight:400 700;src:url("${new URL(url!, location.href).href}") format("woff2");unicode-range:${range}}`),
    ).join("\n");

/** loads the fonts so the canvas of the PDF can use them */
export const loadFonts = (families: string[]) => Promise.all([...new Set(families)].map((f) => document.fonts.load(`16px ${f}`).catch(() => [])));
