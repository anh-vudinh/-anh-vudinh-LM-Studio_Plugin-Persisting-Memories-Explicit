import { memoryStore } from "./memoryStore";
import { join } from "node:path";
import { tryAppendSaveMemoryTextAtEndOfConversationJsonTimeoutFunction } from "./triggerSaveMemory";
import { tryRemoveMemorySeedsTimeoutFunction } from "./removeMemorySeeds";
import { acquireLock, releaseLock } from "./acquireLockFile";
import { promptProcessorConstructMessageNumberTag } from "./promptPreprocessor";

import { 
    readFile, 
    writeFile,
    open,
    unlink,
} from "node:fs/promises";

import {
    clearConversationOperations,
    getPreviousTurnSavingState,
    getConversationOperations,
    setPreviousTurnSavingState,
    resetPendingSaveMemory,
    getPendingSaveMemory, 
    getConversationFileName 
} from "./config";

export async function multiEditCoordinator(
    exitRequested: boolean,
): Promise<void>{
    // console.log("========RUNNING MEC======",Date.now())
    const rootDirectory = await memoryStore.getRootDirectory();

    const conversationFileName = getConversationFileName();

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
        const originalAssistantLastMessagedAt = conversation.assistantLastMessagedAt;

        // Lock created after we did the first read to establish the originalAssistantLastMessagedAt
        const lockFile = `${conversationFile}.lock`;

        const functionName = "multiEditCoordinator";

        await acquireLock(lockFile, functionName);

        // console.log("========PM Conversation file read===", Date.now())
        // Coordinating Logic with Context-Cleanup Plugin
        // This plugin is ready after context cleanup is ready by around 8ms(my computer), instead of hard coding
        // it, this method will coordinate context-cleanup to create it's lock only after Presisting Memories plugin has been
        // forced to be the winner.
        const shouldCoordinateWithContextCleanup = await createACoordinationReadyFile(conversation, conversationFile);

        const pollInterval = shouldCoordinateWithContextCleanup === true
                ? 100   // interval when another plugin created the lock file, shorter interval to act timely
                : 500;  // interval when this plugin created the lock file, longer interval to save resources

        const conversationOperations = getConversationOperations();

        // Initiated polling until assistantLastMessagedAt value changes
        // then initiate the conversation json overwrite
        const pollForAssistantUpdate = setInterval(async () => {
            try {
                const latestJson = await readFile(
                    conversationFile,
                    "utf-8",
                );

                const latestConversation = JSON.parse(latestJson);
    
                if (latestConversation.assistantLastMessagedAt !== originalAssistantLastMessagedAt) {
                    clearInterval(pollForAssistantUpdate);

                    // If we're coordinating with the context cleanup plugin this plugin is expected to wait the 2000ms
                    // If we're running any function that needs to edit the conversation file, we also need to wait the 2000ms,
                    // which currently is every function.
                    const delay = 2000;
                
                    // This timeout is to circumvent LM Studio's behavior
                    setTimeout(async () => {
                        // console.log("=====PM OPERATION COMMENCED======", Date.now())
                        try {
                            const latestJson = await readFile(
                                conversationFile,
                                "utf-8",
                            );

                            const latestConversation = JSON.parse(latestJson);

                            for (const operation of conversationOperations) {

                                // ============================================================
                                // Save Memory Path
                                // ============================================================
                                if (operation.name === "tryAppendSaveMemoryTextAtEndOfConversationJsonTimeoutFunction") {

                                    await tryAppendSaveMemoryTextAtEndOfConversationJsonTimeoutFunction(
                                        operation.params.exitRequested,
                                        latestConversation,
                                        operation.params.pendingSaveMemory
                                    );
                                }

                                // ============================================================
                                // Normal Path
                                // ============================================================
                                if (operation.name === "promptProcessorAppendNewAssistantMessageToEndOfConversationJson") {

                                    const pendingSaveMemoryState = getPendingSaveMemory();
                                    
                                    const previousTurnState =  getPreviousTurnSavingState();

                                    if((pendingSaveMemoryState.active === false &&
                                        previousTurnState === false) ||
                                        previousTurnState === null
                                    ) {
                                        promptProcessorConstructMessageNumberTag(
                                            latestConversation,
                                            operation.params.assistantIndex,
                                        );
                                        setPreviousTurnSavingState(null);
                                    }
                                }

                                // ============================================================
                                // Remove Memory Seeds Path
                                // ============================================================
                                if (operation.name === "tryRemoveMemorySeedsTimeoutFunction") {

                                    await tryRemoveMemorySeedsTimeoutFunction(
                                        operation.params.cleanupAllSeeds,
                                        latestConversation,
                                        operation.params.memorySeedsToRemove,
                                        operation.params.validMemorySeedsSelected,
                                    );
                                }
                            }

                            await writeFile(
                                conversationFile,
                                JSON.stringify(latestConversation, null, 2),
                                "utf-8",
                            );
                            // console.log("=====PM OPERATION FINISHED======", Date.now())
                        } catch (error) {
                            console.error(
                                "Error during delayed memory seed cleanup:",
                                error,
                            );
                        } finally {
                            try {
                                // Break the cycle, Exit memory save state by resetting to defaults
                                if(exitRequested === true) {
                                    resetPendingSaveMemory();
                                }
                            } catch {
                                // ignore
                            } finally {
                                releaseLock(lockFile, functionName);

                                for (const operation of conversationOperations) {
                                    if (operation.name === "tryAppendSaveMemoryTextAtEndOfConversationJsonTimeoutFunction") {
                                        setPreviousTurnSavingState(true);
                                    }
                                }
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
            } finally {
                // Resetting after conversation file first becomes available to read/write.
                // Otherwise sometimes an operation will duplicate because it hasn't cleared out yet if waiting for the timeout.
                clearConversationOperations();
            }
        }, pollInterval);

    } catch (error) {
        
        throw new Error(`Error modifying conversation file: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// Returning a boolean indicating whether the context cleanup plugin is being used
async function createACoordinationReadyFile(
    conversation: any,
    conversationFile: string,
): Promise<boolean> {
    const enabledPluginsArray = conversation.plugins;

    const hasContextCleanup = enabledPluginsArray.some(
        (plugin: string) => plugin.includes("context-cleanup"),
    );

    const hasPersistingMemories = enabledPluginsArray.some(
        (plugin: string) => plugin.includes("persisting-memories"),
    );

    const shouldCoordinateWithContextCleanup =
        hasContextCleanup && hasPersistingMemories;

    const readyFile = `${conversationFile}.persisting-memories-final-write.ready`;

    if (shouldCoordinateWithContextCleanup) {
        try {
            const handle = await open(readyFile, "wx");
            await handle.close();

            // console.log(
            //     "===== PM final-write ready file created =====",
            //     readyFile,
            //     Date.now()
            // );
        } catch (error) {
            const fsError = error as NodeJS.ErrnoException;

            if (fsError.code !== "EEXIST") {
                throw error;
            }

            await unlink(readyFile);

            // console.log(
            //     "===== stale PM final-write ready file removed =====",
            //     readyFile,
            //     Date.now()
            // );

            const handle = await open(readyFile, "wx");
            await handle.close();

            // console.log(
            //     "===== PM final-write ready file recreated =====",
            //     readyFile,
            //     Date.now()
            // );
        }
    }
    return shouldCoordinateWithContextCleanup;
}