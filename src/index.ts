import { PluginContext } from "@lmstudio/sdk";
import { promptPreprocessor } from "./promptPreprocessor";
import { toolsProvider } from "./toolsProvider";
import { memoryStore } from "./memoryStore";
import { readdir } from "fs/promises";
import { initializeMemorySeedsPool } from "./memorySession";
import fs from "node:fs/promises";
import path from "path";
import os from "os";

import {
    setConfigSchematics,
    configSchematics,
    setValidatedLMSRootDirectory,
    setValidatedConversationRootDirectory,
    setValidatedMemoriesRootDirectory,
} from "./config";

/**
 * Populating the config starts here rather than
 * the default of starting in config.ts
 */
export async function main(context: PluginContext) {

    const lmStudioRoot = await resolveLMStudioRoot();

    // checking memories directory to populate initial memory seed pool
    await memoryStore.setRootDirectory(lmStudioRoot);

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

        if (category.name === "compactions") {
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

    // first population of the config values
    setConfigSchematics({memorySeedsPool: memorySeedsPool});

    context.withConfigSchematics(configSchematics);
    context.withPromptPreprocessor(promptPreprocessor);
    context.withToolsProvider(toolsProvider);

    console.log("Persisting Memories(explicit) Plugin initialized");
}

export async function resolveLMStudioRoot(): Promise<string> {
    // First choice: default LM Studio location
    const defaultRoot = path.join(
        os.homedir(), 
        ".lmstudio"
    );

    const memoriesRoot = path.join(
        defaultRoot, 
        "memories"
    );

    try {
        const conversationsPath = path.join(
            defaultRoot, 
            "conversations"
        );

        if ((await fs.stat(conversationsPath)).isDirectory()) {

            setValidatedLMSRootDirectory(defaultRoot);
            setValidatedConversationRootDirectory(conversationsPath);
            setValidatedMemoriesRootDirectory(memoriesRoot);

            // console.log("Using default LM Studio root:", defaultRoot);
            return defaultRoot;
        }
    } catch {
        // Default location is missing or inaccessible; try cwd.
    }

    // Fallback: derive the root from the plugin's working directory
    const cwdRoot = path.resolve(process.cwd(), "..", "..", "..","..");
    const cwdConversationsRoot = path.join(
        cwdRoot, 
        "conversations"
    );
    
    const cwdMemoriesRoot = path.join(
        cwdRoot, 
        "memories"
    );

    try {
        if ((await fs.stat(cwdConversationsRoot)).isDirectory()) {

            setValidatedLMSRootDirectory(cwdRoot);
            setValidatedConversationRootDirectory(cwdConversationsRoot);
            setValidatedMemoriesRootDirectory(cwdMemoriesRoot);
            
            // console.log("Using cwd-derived LM Studio root:", cwdRoot);
            return cwdRoot;
        }
    } catch {
        // Fallback location is also invalid.
    }

    throw new Error(
        "Could not find a valid LM Studio root: neither the default location nor the cwd-derived location contains a conversations directory.",
    );
}