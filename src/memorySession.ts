let memorySeedsPool: readonly string[] = [];
let memorySeedsSelected: readonly string[] = [];

export function initializeMemorySeedsPool(
    pool: string[],
): void {
    memorySeedsPool = Object.freeze([...pool]);
}

export function getMemorySeedsPool(): readonly string[] {
    return memorySeedsPool;
}

export function removeMemorySeedFromPool(
    memorySeed: string,
): void {

    memorySeedsPool = memorySeedsPool.filter(
        (seed) => seed !== memorySeed,
    );
}

export function setMemorySeedsSelected(
    selected: string[],
): void {
    memorySeedsSelected = Object.freeze([...selected]);
}