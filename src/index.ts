import { PluginContext } from "@lmstudio/sdk";
import { toolsProvider } from "./toolsProvider";
import { promptPreprocessor } from "./promptPreprocessor";
import { memoryStore } from "./memoryStore";
import { readdir } from "fs/promises";
import path from "path";
import os from "os";

import {
    setConfigSchematics,
    configSchematics,
} from "./config";

import {
    initializeMemorySeedsPool,
} from "./memorySession";

export async function main(context: PluginContext) {
    await memoryStore.setRootDirectory(
        path.join(
            os.homedir(),
            ".lmstudio",
        ),
    );

    await memoryStore.initialize();

    const memoriesDirectory =
        await memoryStore.getMemoriesDirectory();

    const categories = await readdir(
        memoriesDirectory,
        {
            withFileTypes: true,
        },
    );

    const memorySeedsPool: string[] = [];

    for (const category of categories) {
        if (!category.isDirectory()) {
            continue;
        }

        const categoryPath = path.join(
            memoriesDirectory,
            category.name,
        );

        const files = await readdir(
            categoryPath,
            {
                withFileTypes: true,
            },
        );

        for (const file of files) {
            if (
                file.isFile() &&
                file.name
                    .toLowerCase()
                    .endsWith(".json")
            ) {
                memorySeedsPool.push(
                    `${category.name}/${file.name}`,
                );
            }
        }
    }

    memorySeedsPool.sort();

    initializeMemorySeedsPool(memorySeedsPool);

    setConfigSchematics(
        memorySeedsPool,
        [],
    );

    context.withConfigSchematics(
        configSchematics,
    );

    context.withToolsProvider(toolsProvider);
    context.withPromptPreprocessor(promptPreprocessor);

    console.log(
        "Memory Store Root:",
        await memoryStore.getRootDirectory(),
    );

    console.log(
        "Memory Seeds Directory:",
        memoriesDirectory,
    );

    console.log(
        "Memory Seeds Pool:",
        memorySeedsPool,
    );

    console.log(
        "Memory Seeds Selected: []",
    );

    console.log("Memory Seed Plugin initialized");
}