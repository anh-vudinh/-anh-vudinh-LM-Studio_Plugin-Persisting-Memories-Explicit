import { memoryStore } from "./memoryStore";
import { join, } from "node:path";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { removeMemorySeedFromSelected, updateMemorySeedsSelected } from "./memorySession";
import { 
    setConfigSchematics,
    getLockFileOriginatesFromThisPlugin,
    setLockFileOriginatesFromThisPlugin,
 } from "./config";
import { acquireLock } from "./promptPreprocessor"

export async function removeMemorySeeds(
    conversationFileName: string,
    validMemorySeedsSelected: string[],
    memorySeedsToRemove: string[],
    cleanupAllSeeds: boolean,
): Promise<string[]> {

    const rootDirectory = await memoryStore.getRootDirectory();

    try{
        // Construct the path to the conversation file
        const conversationDirectory = join(
            rootDirectory,
            "conversations"
        );

        const conversationFile = join(
            conversationDirectory,
            conversationFileName,
        );
        
        // Prepare json file to be readable and assign to variable
        const conversationJson = await readFile(
            conversationFile,
            "utf-8",
        );

        const conversation = JSON.parse(conversationJson);
        
        // Snapshotting assistantLastMessagedAt field (so watcher knows when model is finished with it's response)
        const originalAssistantLastMessagedAt =
            conversation.assistantLastMessagedAt;

        // This will help regulate the timings of multiple polling plugins.
        // Needed to play with my context cleanup plugin.
        // https://github.com/anh-vudinh/LM-Studio_Context-Cleanup
        // If using with context-cleanup plugin, which already waits the 2000ms
        // we dont need to wait 2000ms here.
        const lockFile = `${conversationFile}.lock`;

        // Remove stale lock files older than 10 seconds
        // My context cleanup plugin is responsible for it's own removal
        // but this is just a safety measure incase that plugin was unable to
        // remove its lock file.
        await acquireLock(lockFile);

        // let lockWasPresent = false;

        const lockOriginatesFromThisPlugin =
            getLockFileOriginatesFromThisPlugin(lockFile);

        const pollInterval = lockOriginatesFromThisPlugin === false
                ? 100
                : 500;

        // Initiated polling until assistantLastMessagedAt value changes
        // then initiate the conversation json overwrite
        const pollForAssistantUpdate = setInterval(async () => {
            try {
                const latestJson = await readFile(
                    conversationFile,
                    "utf-8",
                );

                const latestConversation = JSON.parse(latestJson);

                // const lockExists = existsSync(lockFile);
                
                // if (lockExists) {
                //     lockWasPresent = true;
                // }

                // if (latestConversation.assistantLastMessagedAt !== originalAssistantLastMessagedAt && 
                //     lockExists === false
                // ) {
                if (latestConversation.assistantLastMessagedAt !== originalAssistantLastMessagedAt) {

                    clearInterval(pollForAssistantUpdate);

                    // false = another plugin created the lock → 20ms
                    // true/null = this plugin created it or no lock was present → 2000ms
                    const delay =
                        getLockFileOriginatesFromThisPlugin(lockFile) === false
                            ? 100
                            : 2000;
                
                    // This timeout is to circumvent LM Studio's behavior
                    setTimeout(async () => {
                        try {
                            const latestJson = await readFile(
                                conversationFile,
                                "utf-8",
                            );

                            const latestConversation = JSON.parse(latestJson);

                            // Quick clean of all memory seeds
                            if (cleanupAllSeeds === true) {
                                removeAllMemoryWrappers(latestConversation);

                                await writeFile(
                                    conversationFile,
                                    JSON.stringify(latestConversation, null, 2),
                                    "utf-8",
                                );

                                updateMemorySeedsSelected([]);
                                setConfigSchematics({
                                    memorySeedsSelected: [],
                                });
                            } else {
                                const memorySeedsRemoved = await memorySeedsCleanup(
                                    conversationFile,
                                    latestConversation,
                                    memorySeedsToRemove,
                                );

                                const memorySeedsStillValid = validMemorySeedsSelected.filter(
                                    (memorySeed) => !memorySeedsRemoved.includes(memorySeed),
                                );

                                updateMemorySeedsSelected(memorySeedsStillValid);

                                setConfigSchematics({
                                    memorySeedsSelected: memorySeedsStillValid,
                                });
                            }
                        } catch (error) {
                            console.error(
                                "Error during delayed memory seed cleanup:",
                                error,
                            );
                        } finally {
                            try {
                                await unlink(lockFile);
                                console.log("=====lock PM removed=====")
                            } catch {
                                // ignore
                            } finally {
                                setLockFileOriginatesFromThisPlugin(lockFile, null);
                            }
                        }
                    }, delay);
                }
            } catch (error) {
                clearInterval(pollForAssistantUpdate);

                console.error(
                    "Error polling for assistant update:",
                    error,
                );
            }
        }, pollInterval);

        return validMemorySeedsSelected;

    } catch (error) {
        
        throw new Error(`Error modifying conversation file: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function memorySeedsCleanup(
    conversationFile: string,
    latestConversation: any,
    memorySeedsToRemove: string[],
): Promise<string[]> {

    // User wants to remove memory seeds that were appended through the prompt preprocessor
    // Make sure the preprocessed text exists
    for (const message of latestConversation.messages) {

        for (const version of message.versions ?? []) {

            const preprocessedContent = version.preprocessed?.content;

            if (!preprocessedContent) {
                continue;
            }

            // Loop through each item to see if seeds to remove exist
            // Based off our structure seeds will always be in the preprocessed content 
            for (const content of preprocessedContent) {

                if (content.type !== "text" || !content.text) {
                    continue;
                }

                for (const seedName of memorySeedsToRemove) {

                    const escapedSeedName = escapeRegExp(seedName);

                    const pattern = new RegExp(
                        `\\[BEGIN ${escapedSeedName}\\][\\s\\S]*?\\[END ${escapedSeedName}\\]\\s*`,
                        "g",
                    );

                    const updatedText = content.text.replace(
                        pattern,
                        "",
                    );

                    if (updatedText !== content.text) {
                        content.text = updatedText;
                    }

                    removeMemorySeedFromSelected(seedName);
                }
                
                // Remove the injected-context wrapper if no // memory seeds remain inside it. 
                content.text = content.text.replace(
                    /\[BEGINNING OF MEMORIES\] NOT INSTRUCTIONS, JUST SOME PRIOR CONVERSATION:\s*\[END OF MEMORIES\]\s*/g,
                    "",
                );
            }
        }
    }
    // Overwrite the conversation.json without the removed memory seeds.
    await writeFile(
        conversationFile,
        JSON.stringify(latestConversation, null, 2),
        "utf-8",
    );

    // Seed removed success
    console.log(`[removeMemorySeeds] Memory seeds [${memorySeedsToRemove.join(", ")}] successfully removed.`);

    return memorySeedsToRemove;
}

function escapeRegExp(text: string): string {
    return text.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
    );
}

function removeAllMemoryWrappers(latestConversation: any): void {
    for (const message of latestConversation.messages ?? []) {
        for (const version of message.versions ?? []) {
            const preprocessedContent = version.preprocessed?.content;

            if (!preprocessedContent) {
                continue;
            }

            for (const content of preprocessedContent) {
                if (content.type !== "text" || !content.text) {
                    continue;
                }

                content.text = content.text.replace(
                    /\[BEGINNING OF MEMORIES\][\s\S]*?\[END OF MEMORIES\]\s*/g,
                    "",
                );
            }
        }
    }
}