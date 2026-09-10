import { memoryStore } from "./memoryStore";
import { join } from "node:path";
import { readdir, unlink, rmdir } from "node:fs/promises";
import { removeMemorySeedFromPool } from "./memorySession";

export async function deleteMemorySeedFile(
    memorySeed: string,
): Promise<string> {

    const normalizedMemorySeed = memorySeed
    .trim()
    .split(".json")[0] + ".json";

    const [category, filename] = normalizedMemorySeed.split("/");

    try{
        const memoriesDirectory =
            await memoryStore.getMemoriesDirectory();

        const memoryFile = join(
            memoriesDirectory,
            category,
            filename,
        );

        // Delete the file if it exist
        try {
            await unlink(memoryFile);
            removeMemorySeedFromPool(normalizedMemorySeed);
        } catch (error: any) {
            if (error.code === "ENOENT") {
                return `Error: Memory seed "${normalizedMemorySeed}" was not found.`;
            }

            throw error;
        }
        
        // Check if folder is empty
        // Delete folder if empty
        const categoryDirectory = join(
            memoriesDirectory,
            category,
        );

        const remainingFiles = await readdir(
            categoryDirectory,
        );

        if (remainingFiles.length === 0) {
            try {
                await rmdir(categoryDirectory);
            } catch (error: any) {
                if (error.code !== "EPERM" && error.code !== "ENOTEMPTY") {
                    throw error;
                }
            }
        }
        return `Memory seed "${normalizedMemorySeed}" deleted successfully.`;

    } catch (error: any) {
        if (error.code === "ENOENT") {
            return `Error: Memory seed "${normalizedMemorySeed}" was not found.`;
        }

        throw error;
    }
}