import { removeMemorySeedFromSelected, updateMemorySeedsSelected } from "./memorySession";

import {
    addConversationOperation,
    setConfigSchematics,
 } from "./config";

/**
 * Flow is prompt preprocessor → removeMemorySeeds → multiEditCoordinator
 * → tryRemoveMemorySeedsTimeoutFunction 
 * → memorySeedsCleanup (remove specific memory seeds) || removaAllMemoryWrappers (nuke all memory seeds)
 * → multiEditCoordinator(conversation.json write)
 */
export async function removeMemorySeeds(
    validMemorySeedsSelected: string[],
    memorySeedsToRemove: string[],
    cleanupAllSeeds: boolean,
): Promise<void> {

    addConversationOperation(
        "tryRemoveMemorySeedsTimeoutFunction",
        {
            cleanupAllSeeds,
            memorySeedsToRemove,
            validMemorySeedsSelected,
        },
    );

    //=================================================
    // CODE NOW RUNS FROM multiEditCoordinator.ts
    //=================================================
}

/**
 * multiEditCoordinator calls this function
 */
export async function tryRemoveMemorySeedsTimeoutFunction(
    cleanupAllSeeds: boolean,
    latestConversation: any,
    memorySeedsToRemove: string[],
    validMemorySeedsSelected: string[]
): Promise<void>{

    // Shortcut to clean all seeds.
    if (cleanupAllSeeds === true) {
        removeAllMemoryWrappers(latestConversation);

        updateMemorySeedsSelected([]);
        
        setConfigSchematics({
            memorySeedsSelected: [],
        });

    } else {
        
        // Normal Path - Iterate through all objects, locate specific seeds and remove them.
        const memorySeedsRemoved = await memorySeedsCleanup(
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
}

/**
 * All seeds have been removed from Memories to Inject in Plugin
 * Remove all memory seeds by locating BEGINNING - END MEMORIES
 * Indescriminate
 */
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

/**
 * Remove only specific seeds. Leave the ones,
 * previously injected that are still selected alone.
 */
async function memorySeedsCleanup(
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

    // Seed removed success
    console.log(`[removeMemorySeeds] Memory seeds [${memorySeedsToRemove.join(", ")}] successfully removed.`);

    return memorySeedsToRemove;
}

/**
 * Helper
 */
function escapeRegExp(text: string): string {
    return text.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
    );
}