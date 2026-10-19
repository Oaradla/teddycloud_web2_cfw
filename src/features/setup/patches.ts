// Patches of the HackieboxNG bootloader for the original CC3200 firmware, made in the browser.

type PatchByte = number | null;

const hex = (list: PatchByte[]) => list.map((b) => (b === null ? '"??"' : `"${b.toString(16).padStart(2, "0")}"`)).join(", ");
const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));
const bytes = (pattern: string): PatchByte[] => pattern.split(" ").map((b) => (b === "??" ? null : parseInt(b, 16)));

const patchFile = (desc: string, fwVer: string, items: { desc: string; search: PatchByte[]; replace: PatchByte[] }[]) => `{
    "general": {
        "_desc": "${desc}",
        "_memPos": "",
        "_fwVer": "${fwVer}"
    },
    "searchAndReplace": [
${items
    .map(
        (i) => `    {
        "_desc": "${i.desc}",
        "search":  [${hex(i.search)}],
        "replace": [${hex(i.replace)}]
    }`,
    )
    .join(",\n")}
    ]
}
`;

/** the host name fits where the shortest replaced name was (12 characters and the terminating zero) */
export const ALT_URL_MAX = 12;

/** altUrl.custom.305.json: the box asks host instead of the Boxine servers (API and RTNL) */
export const altUrlPatch = (host: string): string => {
    const replace = (length: number): PatchByte[] => {
        const out: PatchByte[] = [...ascii(host), 0];
        while (out.length < length) out.push(null);
        return out;
    };
    const servers = ["prod.de.tbs.toys", "rtnl.bxcl.de"];
    return patchFile(
        "Changes Boxine URLs to custom ones.",
        "3.0.5+",
        servers.map((server) => {
            const search = [...ascii(server), 0];
            return { desc: `${server} to ${host}`, search, replace: replace(search.length) };
        }),
    );
};

/* altPort: the same patch as sd-bootloader-ng/tools/altport.py of hackiebox_cfw_ng */

const thumbMovw = (rd: number, value: number): number[] => {
    const hw1 = 0xf240 | (((value >> 11) & 1) << 10) | (value >> 12);
    const hw2 = (((value >> 8) & 7) << 12) | (rd << 8) | (value & 0xff);
    return [hw1 & 0xff, hw1 >> 8, hw2 & 0xff, hw2 >> 8];
};
const htons = (port: number) => ((port & 0xff) << 8) | (port >> 8);

export const validPort = (port: number) => Number.isInteger(port) && port >= 1 && port <= 65535;

/** altPort.custom.json: the box connects to port instead of 443 (firmware 3.1.0 BF2, 3.3.0, 3.4.0) */
export const altPortPatch = (port: number): string => {
    const entries: { desc: string; search: PatchByte[]; offset: number; replace: number[] }[] = [
        {
            desc: "connect 3.1.0 BF2: movw r3, #htons(port)",
            search: bytes("02 23 ad f8 10 30 ?? ?? 4b f6 01 33 ad f8 0c 30 ad f8 12 30"),
            offset: 8,
            replace: thumbMovw(3, htons(port)),
        },
        { desc: "connect 3.3.0/3.4.0: sockaddr literal AF_INET:port", search: bytes("02 00 01 bb"), offset: 2, replace: [port >> 8, port & 0xff] },
        {
            desc: "log BF2/3.3.0/3.4.0: connect failed, movw r3, #port",
            search: bytes("8b 48 87 4a 40 f2 bb 13 ?? ?? ?? ?? 89 49 b4 f9 00 00"),
            offset: 4,
            replace: thumbMovw(3, port),
        },
        {
            desc: "log BF2/3.3.0/3.4.0: cloud request, movw sl, #port",
            search: bytes("40 f2 bb 1a 02 46 cd f8 04 a0 40 f2 11 30 cd f8 00 80 ?? ?? ?? ?? 1c 22 00 21 11 a8 ?? ?? ?? ?? ?? 4a 4e f6 60 23"),
            offset: 0,
            replace: thumbMovw(10, port),
        },
    ];
    return patchFile(
        `Changes the port the box connects to (API and RTNL) from 443 to ${port}.`,
        "3.1.0+",
        entries.map((e) => {
            const replace: PatchByte[] = e.search.map(() => null);
            e.replace.forEach((b, i) => (replace[e.offset + i] = b));
            return { desc: e.desc, search: e.search, replace };
        }),
    );
};

export const download = (name: string, text: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
