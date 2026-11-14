/** the unheard files after and before the current one; without it in the list the first unheard one is next */
export const siblingEpisodes = <T extends { name: string; listened?: boolean }>(
    episodes: T[],
    current: string,
) => {
    const at = episodes.findIndex((f) => f.name === current);
    const unheard = (list: T[]) => list.find((f) => !f.listened);
    return at < 0
        ? { next: unheard(episodes), prev: undefined }
        : {
              next: unheard(episodes.slice(at + 1)),
              prev: unheard(episodes.slice(0, at).reverse()),
          };
};
