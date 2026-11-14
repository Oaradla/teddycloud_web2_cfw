let last = 0;

/** the highest of count new custom audio ids (Unix time minus 0x50000000); the files take
 *  top, top - 1, ... and none of them was given out before on this page */
export const newAudioIds = (count = 1) => {
    last = Math.max(Math.floor(Date.now() / 1000) - 0x50000000, last + count);
    return last;
};
