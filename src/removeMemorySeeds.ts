import { memoryStore } from "./memoryStore";
import { join } from "node:path";
import { writeFile, readFile } from "node:fs/promises";
import { removeMemorySeedFromSelected, updateMemorySeedsSelected } from "./memorySession";
import { setConfigSchematics } from "./config";

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

        // Initiated polling until assistantLastMessagedAt value changes
        // then initiate the conversation json overwrite
        const pollForAssistantUpdate = setInterval(async () => {
            try {
                console.log("ran polling");

                const latestJson = await readFile(
                    conversationFile,
                    "utf-8",
                );

                const latestConversation = JSON.parse(latestJson);

                if (latestConversation.assistantLastMessagedAt !== originalAssistantLastMessagedAt) {
                    clearInterval(pollForAssistantUpdate);
                
                    // This timeout is to circumvent LM Studio's behavior
                    // Currently through test: User initiates seeds removal -> we snap shot conversation.json after the assistant finished responding -> remove the seeds
                    // -> overwrite conversation.json -> LM Studio seems to be working on something invisible -> user types a new message -> LM Studio brings up old conversation with seeds
                    // still present. If the overwrite is delayed by 2 seconds that gives enough time for LM Studio to finish whatever it's doing and lets us properly overwrites the
                    // conversation.json. An unfortunate side effect is that if user starts typing before the 2 seconds elapses it will revive the uncleaned version.
                    // But with the current logic it's self correcting and will clean up the seeds eventually during a future turn if the user leaves a 2 second window open.
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
                        }
                    }, 2000);   // CANNOT BE LESS THAN 2000ms, if you go lower than this something LM Studio is doing on the backend is caching an older version with the seeds still present.
                }
            } catch (error) {
                clearInterval(pollForAssistantUpdate);

                console.error(
                    "Error polling for assistant update:",
                    error,
                );
            }
        }, 800);

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