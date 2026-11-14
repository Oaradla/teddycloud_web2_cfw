import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/i18n", () => ({ t: (key: string) => key, textsOf: () => undefined }));
vi.stubGlobal("window", {
    location: { pathname: "/web/v2/index.html" },
    dispatchEvent: () => true,
});
const { postForm, setReauthHandler } = await import("./client");

/** answers the uploads in turn with the given status and body */
const fakeXhr = (answers: [number, string][]) =>
    class {
        status = 0;
        statusText = "";
        responseText = "";
        withCredentials = false;
        upload = {};
        onload = () => {};
        onerror = () => {};
        open() {}
        send() {
            [this.status, this.responseText] = answers.shift()!;
            this.onload();
        }
    };

describe("postForm", () => {
    it("asks for the password and sends again when the server wants it", async () => {
        vi.stubGlobal(
            "XMLHttpRequest",
            fakeXhr([
                [403, '{"error":"reauth_required"}'],
                [200, "ok"],
            ]),
        );
        const ask = vi.fn(async () => true);
        setReauthHandler(ask);
        expect(await postForm("/api/plugins/upload", new FormData())).toBe("ok");
        expect(ask).toHaveBeenCalledOnce();
    });

    it("throws the server's message of a refused upload", async () => {
        vi.stubGlobal("XMLHttpRequest", fakeXhr([[400, '{"message":"too big"}']]));
        await expect(postForm("/api/plugins/upload", new FormData())).rejects.toMatchObject({
            message: "too big",
            status: 400,
        });
    });
});
