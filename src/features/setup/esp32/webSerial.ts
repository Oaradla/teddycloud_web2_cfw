// Taken over from teddycloud_web src/utils/browser/webSerial.ts (revision 5227a59); maintained here since.
export const isWebSerialSupported = (): boolean => {
    return typeof navigator !== "undefined" && "serial" in navigator;
};
