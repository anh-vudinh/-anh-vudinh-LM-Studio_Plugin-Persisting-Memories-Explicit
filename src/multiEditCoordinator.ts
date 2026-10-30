import { memoryStore } from "./memoryStore";
import { tryAppendSaveMemoryTextAtEndOfConversationJsonFunction } from "./triggerSaveMemory";
import { tryRemoveMemorySeedsTimeoutFunction } from "./removeMemorySeeds";
import { acquireLock, releaseLock } from "./acquireLockFile";
import { promptProcessorConstructMessageNumberTag, scanForConversationFileThruFullConversationDirectoryScan } from "./promptPreprocessor";
import { tryAppendCompactionSummaryFunction, tryAppendTOCTrailFunction } from "./tableOfCompactions";
import { tryAppendTableOfMemoriesContentFunction, tryRetractOldTomsFunction } from "./tableOfMemories";
import { join } from "node:path";

import { 
    readFile, 
    writeFile,
    open,
    unlink,
    readdir,
    stat
} from "node:fs/promises";

import {
    resetPendingSaveMemory,
    getConversationFileName, 
    setPendingTomCommand,
    takeConversationOperations,
    getConversationOperations,
    getValidatedConversationRootDirectory,
    setContextCleanupPluginInUse,
    // setContextCleanupConversationName,
    // getContextCleanupConversationName,
} from "./config";

const multiEditCoordinatorWriteQueue: string[] = [];
let multiEditCoordinatorIndex = 0;
let inMemoryConversation: any | null = null;
let stabalized: boolean = false;
let resolveMecStateChange: (() => void) | null = null;
let mecStateChanged = new Promise<void>((resolve) => {
    resolveMecStateChange = resolve;
});

export async function multiEditCoordinator(
    // exitRequested: boolean,
    userText: string,
    // messages: ChatMessage[],
): Promise<void>{

    if (getConversationOperations().length === 0) {
        return;
    }

    const rootDirectory = await memoryStore.getRootDirectory();

    const conversationFileName = getConversationFileName();

    try{
        // Construct the path to the conversation file
        const conversationDirectory = getValidatedConversationRootDirectory();

        const conversationFile = join(
            conversationDirectory,
            conversationFileName,
        );

        // Prepare json file to be readable and assign to variable
        // with an attempted recovery.
        const conversation = await readConversationWithRecovery(
            conversationDirectory, 
            conversationFileName, 
            rootDirectory, 
            userText
        );

        // Conversation was unusable exit this function,
        // this turn to WRITE the conversation file is lost.
        if (conversation === null) {
            return;
        }

        const conversationOperations = takeConversationOperations();

        // Snapshotting assistantLastMessagedAt field (so watcher knows when model is finished with it's response)
        const originalAssistantLastMessagedAt = conversation.assistantLastMessagedAt;

        // Lock created after we did the first read to establish the originalAssistantLastMessagedAt
        const lockFile = `${conversationFile}.lock`;
        
        const functionName = "multiEditCoordinator";

        let lockOwnerName: string | undefined;

        const pollInterval = 200;

        let assistantUpdateHandled = false;

        // Assigning each MEC a unique name and putting it in the wait queue.
        // A new MEC needs a fresh stability check.
        const coordinatorName = `multiEditCoordinator_${++multiEditCoordinatorIndex}`;
        multiEditCoordinatorWriteQueue.push(coordinatorName);
        stabalized = false;
        notifyMecStateChanged();

        // console.log(
        //     `[MEC Queue] ${coordinatorName} added`,
        //     [...multiEditCoordinatorWriteQueue]
        // );

        // Initiated polling until assistantLastMessagedAt value changes
        // then initiate the conversation json overwrite
        const pollForAssistantUpdate = setInterval(async () => {
            try {
                let latestConversation: any;

                // Json for some reason has parse error Unterminated string in JSON at position 3144179 (line 13347 column 17443)
                // which corresponds to this parse. I suspect it might just still be in some limbo state being written by
                // the assistant so we will attempt to parse it a few more times to see if it will give us something usable.
                // so we do not lose this turn. This one allows for continued polling.
                latestConversation = await readConversationWithParseRetries(
                    conversationFile,
                    3,          // max parse attempts
                    100,        // retry delay
                    "return",   // error handling action
                );

                if (latestConversation === null) {
                    return; // Skip this poll tick; keep the interval running.
                }

                // Capturing the index each MEC should target during their own instance
                const targetAssistantMessageIndex = findLastAssistantMessageIndex(latestConversation);
                
                // Assistant has finished responding for this turn
                if (latestConversation.assistantLastMessagedAt !== originalAssistantLastMessagedAt) {
                    
                    // Prevents async polls from redeclaring timing conflict states or running the rest of these functions.
                    // Only the winner will proceed through so there is only one instance.
                    if (assistantUpdateHandled) {
                        return;
                    }

                    assistantUpdateHandled = true;

                    // if (targetAssistantMessageIndex === -1) {
                    //     console.error("[MEC] No assistant message found for this update.");
                    //     return;
                    // }

                    clearInterval(pollForAssistantUpdate);

                    // Initiate Polling until USER STOPS TYPING during the 2 second wait period to edit the conversation file.
                    void (async () => {
                        // console.log("[MEC] Client input stability polling started:", {
                        //     time: new Date().toISOString(),
                        // });
                        
                        // Need to add some extra delay time if user spams messages then follows it with a loaded command message: save memory, TOM commands
                        const extendedDelay = [...multiEditCoordinatorWriteQueue].length < 2;
                        const requiredStableDuration = extendedDelay? 2300 : 2500;
                        
                        try {
                            await waitForStableClientInput(
                                conversationFile, 
                                100,      // stabilityPollInterval
                                requiredStableDuration,
                                coordinatorName
                            );
                            // console.log(`${coordinatorName} has exited the stability loop`)

                            // The last MEC instance will exit first and previous MEC will follow after.
                            // This forces the MEC to execute in order of when they first joined the write queue.
                            while (multiEditCoordinatorWriteQueue[0] !== coordinatorName) {
                                await new Promise(resolve => setTimeout(resolve, pollInterval));
                            }
                            
                            // Snapshot the last MEC in the writequeue now that the clientinput has stablized.
                            // We will then use this to know when to create the ready file for Context Cleanup Plugin.
                            const finalCoordinatorName = multiEditCoordinatorWriteQueue[multiEditCoordinatorWriteQueue.length - 1];

                            // We've stablized and added the stabalized conversation file to memory,
                            // We will apply all our edits to the memory conversation to perform only a single write
                            // let inMemoryConversation: any
                            if (inMemoryConversation === null) {
                                // If latestJson has a parse error try a couple parse attempts before we consider this edit turn lost
                                inMemoryConversation = await readConversationWithParseRetries(
                                    conversationFile,
                                    3,          // max parse attempts
                                    100,        // retry delay
                                    "throw",    // error handling action
                                );
                            }

                            let protectSaveMemoryTurn = false;
                            let lastMesageAppendOperation: any;

                            for (const operation of conversationOperations) {

                                // ============================================================
                                // Save Memory Path
                                // ============================================================
                                if (operation.name === "tryAppendSaveMemoryTextAtEndOfConversationJsonFunction") {

                                    await tryAppendSaveMemoryTextAtEndOfConversationJsonFunction(
                                        operation.params.exitRequested,
                                        inMemoryConversation,
                                        operation.params.pendingSaveMemory,
                                        targetAssistantMessageIndex,
                                        operation.params.savedMemoryStatus,
                                    );

                                    protectSaveMemoryTurn = true;
                                }

                                // ============================================================
                                // Table of Memories Lookup Path
                                // ============================================================
                                if (
                                    operation.name === "tryAppendTableOfMemoriesContentFunction" &&
                                    protectSaveMemoryTurn === false
                                ) {
                                    await tryAppendTableOfMemoriesContentFunction(
                                        inMemoryConversation,
                                        operation.params.constructedTableString,
                                        targetAssistantMessageIndex,
                                    );
                                }

                                // ============================================================
                                // Compaction Summary Path
                                // ============================================================
                                if (
                                    operation.name === "tryAppendCompactionSummaryFunction" &&
                                    protectSaveMemoryTurn === false
                                ) {
                                    await tryAppendCompactionSummaryFunction(
                                        inMemoryConversation,
                                        operation.params.constructedSummaryString,
                                        targetAssistantMessageIndex,
                                    );
                                }

                                // ============================================================
                                // Append Message Number Path
                                // ============================================================
                                if (operation.name === "promptProcessorAppendMessageNumberToLastAssistantMessage") {

                                    promptProcessorConstructMessageNumberTag(
                                        inMemoryConversation,
                                        operation.params.assistantIndex,
                                        targetAssistantMessageIndex,
                                    );

                                    if (
                                        coordinatorName === finalCoordinatorName &&
                                        multiEditCoordinatorWriteQueue[0] === coordinatorName
                                    ) {
                                        lastMesageAppendOperation = operation;
                                    }
                                }

                                // ============================================================
                                // (only performed by the last queued MEC)
                                // ============================================================
                                if (
                                    coordinatorName === finalCoordinatorName &&
                                    multiEditCoordinatorWriteQueue[0] === coordinatorName
                                ) {
                                    // ============================================================
                                    // Old Table of Memories Retraction Path
                                    // ============================================================
                                    if (operation.name === "tryRetractOldTomsFunction") {
                                        await tryRetractOldTomsFunction(
                                            inMemoryConversation,
                                            targetAssistantMessageIndex,
                                            operation.params.retractOldToms,
                                            operation.params.enableToolsMode,
                                        );
                                    }
                                    
                                    // ============================================================
                                    // Remove Memory Seeds Path
                                    // ============================================================
                                    if (operation.name === "tryRemoveMemorySeedsTimeoutFunction") {

                                        await tryRemoveMemorySeedsTimeoutFunction(
                                            operation.params.cleanupAllSeeds,
                                            inMemoryConversation,
                                            operation.params.memorySeedsToRemove,
                                            operation.params.validMemorySeedsSelected,
                                        );
                                    }

                                    // ============================================================
                                    // Table of Compaction Visual Trail Path (Needs to query the model so goes last)
                                    // ============================================================
                                    if (operation.name === "tryAppendTOCTrailFunction") {

                                        await tryAppendTOCTrailFunction(
                                            inMemoryConversation,
                                            operation.params.matchingFilesAndNewAdditions,
                                            targetAssistantMessageIndex,
                                        );
                                    }
                                }
                            }
                            
                            // Acquire lock, each MEC instance will have their own lock and release their own lock
                            // releaseLock function will unlink the lock file once the lock queue has vacated.
                            lockOwnerName = await acquireLock(lockFile, functionName);

                            // This is the last queued MEC, create the readyfile for Context Cleanup.
                            // Checks that the MEC name matches who was registered as the last MEC in the write queue
                            // Then checks if they have reached the first position of the queue.
                            if (
                                coordinatorName === finalCoordinatorName &&
                                multiEditCoordinatorWriteQueue[0] === coordinatorName
                            ) {
                                // Replace the conversation file with the one in memory where we've applied all MEC operations to.
                                // We triple check that the lastMesageAppendOperation.params message number has stuck to the actual
                                // conversation file, if not we retry up to 3 times.
                                await writeVerifiyWithReassurance(
                                    conversationFile,
                                    inMemoryConversation,
                                    lastMesageAppendOperation,
                                    targetAssistantMessageIndex,
                                );

                                const contextCleanupPluginInUse = await createACoordinationReadyFile(
                                    conversation, 
                                    conversationFile,
                                );

                                setContextCleanupPluginInUse(contextCleanupPluginInUse);

                                // if (contextCleanupPluginInUse) {
                                //     const currentCCName = getContextCleanupConversationName();

                                //     if(currentCCName === "") {
                                //         setContextCleanupConversationName(inMemoryConversation.name);
                                //     }
                                // }

                                inMemoryConversation = null;

                                await cleanupStaleReadyFiles();
                                // if (
                                //     contextCleanupPluginInUse && 
                                //     // getChatHistory() === null
                                // ) {
                                //     await storeAndPrepareHistoryMessagesForModel(messages);
                                // }
                            }
                            // console.log("========PM Conversation file ready===", Date.now())
                        } catch (error) {
                            console.error(
                                "multiEditCoordinator Error during delayed memory seed cleanup:",
                                error,
                            );
                        } finally {
                            // Release Lock first so subsequent MECs can acquire a new lock to protect their write turn
                            if (lockOwnerName !== undefined) {
                                await releaseLock(lockFile, lockOwnerName);
                                lockOwnerName = undefined;
                            }

                            // Removes this MEC_INSTANCE from the WRITE Queue
                            const queueIndex = multiEditCoordinatorWriteQueue.indexOf(coordinatorName);

                            if (queueIndex !== -1) {
                                multiEditCoordinatorWriteQueue.splice(queueIndex, 1);
                            }

                            for (const operation of conversationOperations) {
                                // Both tables cannt exist at the same time, just borrowing the logic
                                // to pass the pending message to the assistant.
                                if (
                                    operation.name === "tryAppendTableOfMemoriesContentFunction" ||
                                    operation.name === "tryAppendCompactionSummaryFunction"
                                ) {
                                    setPendingTomCommand("null");
                                }
                                if (operation.name === "tryAppendSaveMemoryTextAtEndOfConversationJsonFunction") {
                                    // Break the cycle, Exit memory save state by resetting to defaults
                                    if(operation.params.exitRequested === true) {
                                        resetPendingSaveMemory();
                                    }
                                }
                            }

                            notifyMecStateChanged();
                            // console.log(
                            //     `[MEC Queue] ${coordinatorName} finished`,
                            //     [...multiEditCoordinatorWriteQueue]
                            // );
                        }
                    })();
                }
            } catch (error) {

                clearInterval(pollForAssistantUpdate);

                console.error(
                    "multiEditCoordinator Error polling for assistant update:",
                    error,
                );

                try {
                    if (lockOwnerName !== undefined) {
                        await releaseLock(lockFile, lockOwnerName);
                        lockOwnerName = undefined;
                    }

                } catch (releaseError) {
                    console.error(
                        "multiEditCoordinator Error releasing lock after polling failure:",
                        releaseError,
                    );
                }
            }
        }, pollInterval);

    } catch (error) {

        const fsError = error as NodeJS.ErrnoException;

        if (fsError.code === "EISDIR") {
           throw new Error(`
                This is a known unresolvable error. Scans pulled in an empty string as the conversation file name. 
            `);
        }

        throw new Error(`multiEditCoordinator Error: ${error instanceof Error ? error.message : String(error)}`);
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

    const readyFile = `${conversationFile}.persisting-memories-final-write.ready`;

    if (hasContextCleanup) {
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
    
    return hasContextCleanup;
}

/**
 * Allows return to main prompt preprocessor function without throwing
 * Performs one full directory scan to try and recover this attempt for a unknown CFN
 */
async function readConversationWithRecovery(
    conversationDirectory: string,
    conversationFileName2: string,
    rootDirectory: string,
    userText: string,
): Promise<any | null> {
    const readConversation = async (fileName: string) => {
        const filePath = join(conversationDirectory, fileName);

        return readConversationWithParseRetries(
            filePath,
            2,
            200,
            "throw",
        );
    };

    try {
        return await readConversation(conversationFileName2);
    } catch (error) {
        const fsError = error as NodeJS.ErrnoException;

        if (
            fsError.code !== "EISDIR" &&
            !(error instanceof SyntaxError)
        ) {
            console.error("Failed to read conversation file:", error);
            return null;
        }

        console.warn(
            "Original conversation read failed; attempting full-directory recovery:",
            error,
        );
    }

    return new Promise((resolve) => {
        setTimeout(async () => {
            try {
                await scanForConversationFileThruFullConversationDirectoryScan(
                    rootDirectory,
                    userText,
                );

                const recoveredFileName = getConversationFileName();

                if (!recoveredFileName?.trim()) {
                    console.error(
                        "Unable to recover conversation file: filename is empty.",
                    );
                    resolve(null);
                    return;
                }

                resolve(await readConversation(recoveredFileName));
            } catch (error) {
                console.error(
                    "Failed to recover or read conversation file:",
                    error,
                );
                resolve(null);
            }
        }, 200);
    });
}

async function waitForStableClientInput(
    conversationFile: string,
    stabilityPollInterval: number,
    requiredStableDuration: number,
    coordinatorName: string,
): Promise<boolean> {
    let previousClientInput: string | undefined;
    let stableSince: number | null = null;

    while (true) {
        if (stabalized) {
            // console.log(
            //     `[MEC ${coordinatorName}] Shared stability flag is TRUE`,
            // );
            return true;
        }

        const stateChangePromise = mecStateChanged;

        const finalCoordinatorName =
            multiEditCoordinatorWriteQueue[
                multiEditCoordinatorWriteQueue.length - 1
            ];

        // Only the last MEC polls the conversation file.
        // All other MECs wait for the shared stability flag.
        if (coordinatorName !== finalCoordinatorName) {
            // Sleep until the queue changes or stability is declared.
            // console.log(`[MEC ${coordinatorName}] Went to sleep`)
            await stateChangePromise;
            continue;
        }

        let stabilityConversation: { clientInput?: string };

        try {
            const stabilityJson = await readFile(
                conversationFile,
                "utf-8",
            );

            stabilityConversation = JSON.parse(stabilityJson);
        } catch (error) {
            if (error instanceof SyntaxError) {
                await new Promise<void>(resolve =>
                    setTimeout(resolve, stabilityPollInterval),
                );
                continue;
            }

            return false;
        }

        if (stabalized) {
            return true;
        }

        const currentClientInput = stabilityConversation.clientInput;
        const now = Date.now();

        if (stableSince === null) {
            previousClientInput = currentClientInput;
            stableSince = now;
        } else if (currentClientInput !== previousClientInput) {
            previousClientInput = currentClientInput;
            stableSince = now;
        }

        const inputIsStable =
            now - stableSince >= requiredStableDuration;

        // console.log(`[MEC ${coordinatorName}] Stability check`, {
        //     stabalized,
        //     inputIsStable,
        //     finalCoordinatorName,
        //     stableDuration: now - stableSince,
        //     requiredStableDuration,
        // });

        if (inputIsStable) {
            // console.log(
            //     `[MEC ${coordinatorName}] Declaring stability`,
            // );

            stabalized = true;
            notifyMecStateChanged();
            return true;
        }

        await new Promise<void>(resolve =>
            setTimeout(resolve, stabilityPollInterval),
        );
    }
}

export async function readFileWithRetries(
    filePath: string,
    maxAttempts: number,
    retryDelay: number,
): Promise<string> {
    let attempts = 0;

    while (true) {
        try {
            return await readFile(filePath, "utf-8");
        } catch (error) {
            attempts++;

            if (attempts >= maxAttempts) {
                console.error("readFileWithRetries error during read of:", filePath);
            }

            await new Promise(resolve =>
                setTimeout(resolve, retryDelay),
            );
        }
    }
}

export async function readConversationWithParseRetries(
    conversationFile: string,
    maxParseAttempts: number,
    retryDelay: number,
    onParseFailure: "return" | "throw" = "throw",
): Promise<any | null> {
    let parseAttempts = 0;

    while (true) {
        try {
            const latestJson = await readFile(
                conversationFile,
                "utf-8",
            );

            return JSON.parse(latestJson);
        } catch (error) {
            if (!(error instanceof SyntaxError)) {
                throw error;
            }

            parseAttempts++;

            if (parseAttempts >= maxParseAttempts) {
                if (onParseFailure === "return") {
                    return null;
                }

                throw error;
            }

            await new Promise(resolve =>
                setTimeout(resolve, retryDelay),
            );
        }
    }
}

function findLastAssistantMessageIndex(conversation: any): number {
    for (let i = conversation.messages.length - 1; i >= 0; i--) {
        const message = conversation.messages[i];
        const selectedVersion =
            message.versions?.[message.currentlySelected ?? 0];

        if (selectedVersion?.role === "assistant") {
            return i;
        }
    }

    return -1;
}

function notifyMecStateChanged(): void {
    const resolve = resolveMecStateChange;

    // Create the next notification before waking current waiters.
    mecStateChanged = new Promise<void>((resolveNext) => {
        resolveMecStateChange = resolveNext;
    });

    resolve?.();
}

async function writeVerifiyWithReassurance(
    conversationFile: string,
    inMemoryConversation: any,
    operation: any,
    targetAssistantMessageIndex: number,
): Promise<void> {
    const maxAttempts = 3;
    const expectedMessageNumber = operation.params.assistantIndex;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await writeFile(
            conversationFile,
            JSON.stringify(inMemoryConversation, null, 2),
            "utf-8",
        );

        const writtenContent = await readFile(conversationFile, "utf-8");
        const writtenConversation = JSON.parse(writtenContent);

        const targetMessage = writtenConversation.messages?.[targetAssistantMessageIndex];

        const selectedVersion =
            targetMessage?.versions?.[
                targetMessage.currentlySelected ?? 0
            ];
        
        const hasExpectedMessageNumber =
            selectedVersion?.role === "assistant" &&
            selectedVersion?.steps?.some((step: any) =>
                step.content?.some(
                    (block: any) =>
                        typeof block.text === "string" &&
                        block.text.includes(`***message ${expectedMessageNumber}***`),
                ),
            );
        // console.log(
            // `==========write attempt: ${attempt}, 
            // excpected message # ${expectedMessageNumber}, 
            // has expected #: ${hasExpectedMessageNumber}`,
        // )
        if (hasExpectedMessageNumber) {
            return;
        }
        
        if (attempt === maxAttempts) {
            console.error(
                `Write verification failed after ${maxAttempts} attempts: ` +
                `assistant message at index ${targetAssistantMessageIndex} ` +
                `does not contain the expected message number ${expectedMessageNumber}.`,
            );
        }
    }
}

/**
 * Ready File bugeted auto cleanup
 * Cleans up stale ready files through a scan of the conversations folder.
 * Only runs during the first 1 minute of every 30 minutes throughout 24hrs.
 */
export async function cleanupStaleReadyFiles(): Promise<void> {

    const conversationsDirectory = getValidatedConversationRootDirectory();

    const now = new Date();
    const minute = now.getMinutes();
    const second = now.getSeconds();
    // console.log(conversationsDirectory, now, minute)
    // Run only during 00:00–00:59 and 30:00–30:59 each hour.
    if (
        !(
            (minute === 0 || minute === 30) &&
            second < 60
        )
    ) {
        return;
    }

    const cutoffTime = Date.now() - 10_000;

    async function scanDirectory(directory: string): Promise<void> {
        let entries;

        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch (error) {
            console.error(`Failed to read directory ${directory}:`, error);
            return;
        }

        for (const entry of entries) {
            const fullPath = join(directory, entry.name);

            if (entry.isDirectory()) {
                await scanDirectory(fullPath);
                continue;
            }

            if (!entry.isFile() || !entry.name.endsWith(".ready")) {
                continue;
            }

            try {
                const fileStats = await stat(fullPath);

                if (fileStats.mtimeMs < cutoffTime) {
                    await unlink(fullPath);
                }
            } catch (error) {
                // The file may have disappeared or changed during the scan.
                console.error(`Failed to process ready file ${fullPath}:`, error);
            }
        }
    }

    await scanDirectory(conversationsDirectory);
}