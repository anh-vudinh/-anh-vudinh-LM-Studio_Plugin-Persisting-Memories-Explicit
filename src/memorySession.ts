let memorySeedsPool: readonly string[] = [];

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