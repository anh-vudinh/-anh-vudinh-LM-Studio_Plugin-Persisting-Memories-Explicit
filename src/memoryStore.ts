import { updateTableOfCompactionsIncrementally, updateTocCollectionsIncrementally } from "./tableOfCompactions";
import { addMemorySeedToPool, getMemorySeedsPool } from "./memorySession";
import { resetPendingSaveMemory, setConfigSchematics } from "./config";
import { updateTableOfMemoriesIncrementally } from "./tableOfMemories";
import fs from "node:fs/promises";
import path from "node:path";

export interface MemorySeed {
    date: string;
    root_input: string;
    direct_input: string;
    output: string;
}

export interface MemorySeedInfo {
    name: string;
    category: string;
    filename: string;
    seed: MemorySeed;
}

export class MemoryStore {
    private rootDirectory: string | null = null;
    private memoriesDirectory: string | null = null;

    /**
     * Configure where Memory Seeds are stored.
     * The directory is supplied by LM Studio's plugin working directory.
     */
    async setRootDirectory(rootDirectory: string): Promise<void> {
        if (!rootDirectory || !rootDirectory.trim()) {
            throw new Error(
                "Memory Store root directory cannot be empty.",
            );
        }

        this.rootDirectory = rootDirectory;

        this.memoriesDirectory = path.join(
            this.rootDirectory,
            "memories",
        );
    }

    /**
     * Return the root directory used by the memory store.
     */
    async getRootDirectory(): Promise<string> {
        if (!this.rootDirectory) {
            throw new Error(
                "Memory Store has not been initialized with a root directory.",
            );
        }

        return this.rootDirectory;
    }

    /**
     * Make sure the root memories directory exists.
     */
    async initialize(): Promise<void> {
        const directory = await this.getMemoriesDirectory();

        await fs.mkdir(directory, {
            recursive: true,
        });
    }

    /**
     * Return the configured memories directory.
     */
    async getMemoriesDirectory(): Promise<string> {
        if (!this.memoriesDirectory) {
            throw new Error(
                "Memory Store has not been initialized with a root directory.",
            );
        }

        return this.memoriesDirectory;
    }

    /**
     * Save a Memory Seed.
     *
     * Creates:
     *
     *   memories/
     *     Rust Game/
     *       game-architecture.json
     */
    async saveSeed(
        category: string,
        name: string,
        seed: MemorySeed,
        saveMemoryNumber: number,
    ): Promise<boolean> {
        const directory = await this.initializeAndGetDirectory();

        const safeCategory = sanitizePathPart(category);
        const safeName = sanitizeFilename(name);

        if (saveMemoryNumber === null) {
            return false;
        }

        if (!safeCategory) {
            return false;
        }

        if (!safeName) {
            return false;
        }

        if (!seed.root_input.trim()) {
            return false;
        }

        if (!seed.direct_input.trim()) {
            return false;
        }

        if (!seed.output.trim()) {
            return false;
        }

        try {
            const categoryPath = path.join(
                directory,
                safeCategory,
            );

            await fs.mkdir(categoryPath, {
                recursive: true,
            });

            const filePath = path.join(
                categoryPath,
                `${safeName}.json`,
            );

            let seeds: MemorySeed[] = [];

            try {
                const existing = await fs.readFile(
                    filePath,
                    "utf-8",
                );

                const parsed = JSON.parse(existing);

                if (Array.isArray(parsed)) {
                    seeds = parsed;
                } else if (parsed && typeof parsed === "object") {
                    seeds = [parsed as MemorySeed];
                } else {
                    return false;
                }
            } catch (error: any) {
                if (error.code !== "ENOENT") {
                    return false;
                }
            }

            seeds.push(seed);

            await fs.writeFile(
                filePath,
                JSON.stringify(seeds, null, 2),
                "utf-8",
            );

            const memorySeedName = `${safeCategory}/${safeName}.json`;

            await updateTableOfMemoriesIncrementally(
                directory,
                safeCategory,
                safeName,
                [seed],
            );

            const memorySeedsPool = getMemorySeedsPool();

            if (!memorySeedsPool.includes(memorySeedName)) {
                setConfigSchematics({
                    memorySeedsPool: [
                        ...memorySeedsPool,
                        memorySeedName,
                    ],
                });
                addMemorySeedToPool(memorySeedName);
            }
            resetPendingSaveMemory();
            return true;
        } catch {
            return false;
        }
    }

    async saveMultipleSeeds(
        category: string,
        name: string,
        seeds: MemorySeed[],
        saveMemoryNumber: number,
        callerIsCompaction?: boolean,
        matchingFilesAndNewAdditions?: string[],
    ): Promise<boolean> {
        const directory = await this.initializeAndGetDirectory();

        const safeCategory = sanitizePathPart(category);
        const safeName = sanitizeFilename(name);

        if (saveMemoryNumber === null) {
            return false;
        }

        if (!safeCategory) {
            return false;
        }

        if (!safeName) {
            return false;
        }

        if (!seeds.length) {
            console.warn("[SAVE SKIPPED] No seeds", { name: safeName });
            return false;
        }

        for (const seed of seeds) {
            for (let index = 0; index < seeds.length; index++) {
                const seed = seeds[index];

                if (!seed.root_input.trim()) {
                    console.warn("[SAVE SKIPPED] Empty root_input", {
                        name: safeName,
                        index,
                        root_input: seed.root_input,
                    });
                    return false;
                }
            }

            if (!seed.direct_input.trim()) {
                // console.warn("[SAVE SKIPPED] Empty direct_input", {
                //     name: safeName,
                // });
                return false;
            }

            if (!seed.output.trim()) {
                // console.warn("[SAVE SKIPPED] Empty output", {
                //     name: safeName,
                // });
                return false;
            }
        }
        
        try {
            const categoryPath = callerIsCompaction
                ? path.join(directory, safeCategory, "TOC_Seeds")
                : path.join(directory, safeCategory);
                        await fs.mkdir(categoryPath, {
                            recursive: true,
                        });

            const filePath = path.join(
                categoryPath,
                `${safeName}.json`,
            );

            let existingSeeds: MemorySeed[] = [];

            try {
                const existing = await fs.readFile(
                    filePath,
                    "utf-8",
                );

                const parsed = JSON.parse(existing);

                if (Array.isArray(parsed)) {
                    existingSeeds = parsed;
                } else if (parsed && typeof parsed === "object") {
                    // Support the previous single-seed file format.
                    existingSeeds = [parsed as MemorySeed];
                } else {
                    return false;
                }
            } catch (error: any) {
                if (error.code !== "ENOENT") {
                    return false;
                }
            }

            existingSeeds.push(...seeds);

            await fs.writeFile(
                filePath,
                JSON.stringify(existingSeeds, null, 2),
                "utf-8",
            );

            // console.log("[COMPACTION FILE WRITTEN]", {
            //     name: safeName,
            //     filePath,
            //     seedCount: existingSeeds.length,
            // });

            if (callerIsCompaction) {
                await updateTableOfCompactionsIncrementally(
                    directory,
                    safeCategory,
                    safeName,
                    seeds,
                    matchingFilesAndNewAdditions,
                );

                await updateTocCollectionsIncrementally(
                    safeName,
                );

                return true;
            }

            const memorySeedName = `${safeCategory}/${safeName}.json`;

            // updating the TOM
            await updateTableOfMemoriesIncrementally(
                directory,
                safeCategory,
                safeName,
                seeds,
            );

            const memorySeedsPool = getMemorySeedsPool();

            if (!memorySeedsPool.includes(memorySeedName)) {
                setConfigSchematics({
                    memorySeedsPool: [
                        ...memorySeedsPool,
                        memorySeedName,
                    ],
                });
                addMemorySeedToPool(memorySeedName);
            }
            // Note: don't resetPendingSaveMemory(); here because this function is shared by both compaction seed and memory seed.
            // compaction does not need to reset. the memory seed caller resets it in it's own finally block.
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Initialize the store and return its directory.
     */
    private async initializeAndGetDirectory(): Promise<string> {
        await this.initialize();

        return this.getMemoriesDirectory();
    }
}

/**
 * Convert a user/model-provided category into a safe
 * directory name.
 *
 * We intentionally allow spaces because categories are
 * meant to be human-readable.
 */
function sanitizePathPart(value: string): string {
    return value
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\.+$/g, "")
        .trim();
}

/**
 * Convert a user/model-provided Memory Seed name into
 * a safe filename.
 */
function sanitizeFilename(value: string): string {
    return value
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
        .replace(/\.+$/g, "")
        .trim();
}

export const memoryStore = new MemoryStore();