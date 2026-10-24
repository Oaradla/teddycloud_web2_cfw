/** hands the data to the browser as a file to save */
export const saveFile = (name: string, data: BlobPart, type: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data], { type }));
    a.download = name;
    // in the page, and the URL alive for a while: some browsers fetch it only later
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
};
