import { memoryStore } from "./memoryStore";
import { join } from "node:path";
import { tryAppendSaveMemoryTextAtEndOfConversationJsonTimeoutFunction } from "./triggerSaveMemory";
import { tryRemoveMemorySeedsTimeoutFunction } from "./removeMemorySeeds";

import {
    normalizeJsonFileName,
    acquireLock,
    promptProcessorConstructMessageNumberTag
} from "./promptPreprocessor";


import { 
    readFile, 
    writeFile,
    unlink
} from "node:fs/promises";

import {
    clearConversationOperations,
    getPreviousTurnSavingState,
    getConversationOperations,
    setLockFileOriginatesFromThisPlugin,
    setPreviousTurnSavingState,
    resetPendingSaveMemory,
    getLockFileOriginatesFromThisPlugin,
    getPendingSaveMemory, 
    getCurrentConversationFileName 
} from "./config";

export async function multiEditCoordinator(
    exitRequested: boolean,
): Promise<void>{

    const rootDirectory = await memoryStore.getRootDirectory();
    const conversationFileName = getCurrentConversationFileName();

    try{
        // Construct the path to the conversation file
        const conversationDirectory = join(
            rootDirectory,
            "conversations"
        );

        const conversationFile = join(
            conversationDirectory,
            normalizeJsonFileName(conversationFileName),
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

        const lockFile = `${conversationFile}.lock`;

        await acquireLock(lockFile);

        const lockOriginatesFromThisPlugin =
            getLockFileOriginatesFromThisPlugin(lockFile);

        const pollInterval = lockOriginatesFromThisPlugin === false
                ? 100
                : 500;

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

                        } catch (error) {
                            console.error(
                                "Error during delayed memory seed cleanup:",
                                error,
                            );
                        } finally {
                            try {
                                await unlink(lockFile);
                                console.log("=========lock removed by PM========")
                                // Break the cycle, Exit memory save state by resetting to defaults
                                if(exitRequested === true) {
                                    resetPendingSaveMemory();
                                }
                            } catch {
                                // ignore
                            } finally {
                                setLockFileOriginatesFromThisPlugin(lockFile, null);
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
