let memorySeedsPool: readonly string[] = [];
let memorySeedsSelected: readonly string[] = [];

/*
* MemorySeedsPool Getters and Setters
*/
export function initializeMemorySeedsPool(
    pool: readonly string[],
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

export function updateMemorySeedsPool(
    pool: readonly string[],
): void {
    memorySeedsPool = Object.freeze([...pool]);
}

export function addMemorySeedToPool(
    memorySeed: string,
): void {
    memorySeedsPool = Object.freeze([
        ...memorySeedsPool,
        memorySeed,
    ]);
}

/*
* SelectedMemorySeeds Getters and Setters
*/
export function getMemorySeedsSelected(): readonly string[] {
    return memorySeedsSelected;
}

export function updateMemorySeedsSelected(
    selected: readonly string[],
): void {
    memorySeedsSelected = Object.freeze([...selected]);
}

export function addMemorySeedToSelected(
    memorySeed: string,
): void {
    memorySeedsSelected = Object.freeze([
        ...memorySeedsSelected,
        memorySeed,
    ]);
}

export function removeMemorySeedFromSelected(
    memorySeed: string,
): void {
    memorySeedsSelected = memorySeedsSelected.filter(
        (seed) => seed !== memorySeed,
    );
}