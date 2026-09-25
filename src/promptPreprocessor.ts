import { setCurrentConversationHistory, getCurrentConversationHistory } from "./conversationHistoryCache";
import { getMemorySeedsPool, updateMemorySeedsSelected, addMemorySeedToSelected, getMemorySeedsSelected } from "./memorySession";
import { isEligibleAssistantMessage } from "./conversationReader";
import { memoryStore } from "./memoryStore";
import { removeMemorySeeds } from "./removeMemorySeeds";
import { join, basename } from "node:path";
import { processMessage } from "./triggerSaveMemory"
import { multiEditCoordinator } from "./multiEditCoordinator";
import path from "node:path";

import {
    addConversationOperation,
    getPreviousTurnSavingState,
    getPendingSaveMemory,
    setController,
    configSchematics,
    setConfigSchematics,
    setLockFileOriginatesFromThisPlugin,
    setPreviousTurnSavingState,
} from "./config";

import { 
    readFile, 
    writeFile, 
    access, 
    readdir, 
    stat,
    open,
    unlink
} from "node:fs/promises";

import type {
    ChatMessage,
    PromptPreprocessorController,
} from "@lmstudio/sdk";

let injectedMemorySeeds: string[] | null = null;
let cleanupAllSeeds: boolean;
let internalChatID = "";
const relationshipsLimit = 15;
const LOCK_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 100;

/**
* https://github.com/anh-vudinh
* Main function that directs the flow of the plugin
*/
export async function promptPreprocessor(
    ctl: PromptPreprocessorController,
    userMessage: ChatMessage,
): Promise<string | ChatMessage> {

    // Establish directories
    const memoriesDirectory = await memoryStore.getMemoriesDirectory();

    // Establish initial variable values
    const config = ctl.getPluginConfig(configSchematics);
    const memorySeedsPool = getMemorySeedsPool();
    const memorySeedsSelected = config.get("memorySeedsSelected") as string[];
    let conversationFileName = config.get("conversationFileName") as string;
    const history = await ctl.pullHistory();
    await setCurrentConversationHistory(history);
    const messages = (await getCurrentConversationHistory()).getMessagesArray();
    const userText = userMessage.getText();
    const workingDirectory = ctl.getWorkingDirectory();
    let createNewInternalChatID = false;
    setController(ctl);

    // Assume values can be lost during future runs because of random plugin reinitialization
    const foundHistoryChatID = await promptProcessorScanHistoryForID(messages);

    // ICID exist in history still
    if (foundHistoryChatID !== "") {
        internalChatID = foundHistoryChatID;
    }

    // ICID not in memory or history
    if (internalChatID === "" &&
        foundHistoryChatID === ""
    ) {
        // Try to recover ICID through the relationship file.
        // ICID will still be blank at this point
        internalChatID = await promptProcessorRecoverChatID(
            internalChatID,
            normalizeJsonFileName(conversationFileName),
            workingDirectory,
            userText,
        );

        if (internalChatID !== "") {
            createNewInternalChatID = true;
        }
    }

    // If we still do not know InternalChatID after the recovery
    // We must create a new one
    if (internalChatID === "") {
        internalChatID = Math.floor(Date.now() / 1000).toString();
        createNewInternalChatID = true;
    }

    // Use the pre-existing InternalChatID found
    // to find the matching conversation file
    // Skip if we already know the conversation file
    if (conversationFileName === "") {

        conversationFileName = await promptProcessorScanForConversationFile(
            userText, 
            workingDirectory,
        );

        conversationFileName = normalizeJsonFileName(conversationFileName);
    }
    
    // testing userText if it's a memory command and extracting key variables,
    // taking the power away from unreliable tools from determining this.
    await processMessage(userText);

    const pendingSaveMemoryState = getPendingSaveMemory();
    
    // Model appends message # at the end of the it's response
    // prerequisite to instructing to save memory
    const assistantIndex = messages.filter(isEligibleAssistantMessage).length + 1;

    const previousTurnState =  getPreviousTurnSavingState();

    if((pendingSaveMemoryState.active === false &&
        previousTurnState === false) ||
        previousTurnState === null
    ) {
        await promptProcessorAppendNewAssistantMessageToEndOfConversationJson(assistantIndex);

        setPreviousTurnSavingState(null);
    }

    // Cleaning up whitespaces only, not misspellings
    const normalizedMemorySeedsSelected =
        memorySeedsSelected.map(
            (memorySeed) =>
                memorySeed
                    .trim()
                    .replace(
                        /\.json.*$/i,
                        ".json",
                    ),
        );

    // Compare selected seeds stored in .config to see if they're
    // actually from the available memory pool
    const validMemorySeedsSelected = [
        ...new Set(
            normalizedMemorySeedsSelected.filter(
                (memorySeed) =>
                    memorySeedsPool.includes(
                        memorySeed,
                    ),
            ),
        ),
    ];

    // Scan file first for injected seeds
    // Check on first initialzation, and skip checks later if nothing changed
    // Still works if plugin randomly reinitializes, IMS will be set to null again. 
    // So the current states either
    // matches, doesn't match, or was reset by random initialization.
    if (
        injectedMemorySeeds === null ||
        !areStringArraysEqualAsSets(injectedMemorySeeds, validMemorySeedsSelected)
    ) {

        injectedMemorySeeds = await promptProcessorConversationFileScanForPreviousSeeds(conversationFileName, [...memorySeedsPool]);
    }

    // Determine only new memory seeds to inject
    // This means new additions from config memorySeedsSelected
    const newMemorySeeds =
        validMemorySeedsSelected.filter(
            (memorySeed) =>
                !injectedMemorySeeds!.includes(
                    memorySeed,
                ),
        );

    // New valid seeds waiting to be injected
    let injectedContext = "";

    if (newMemorySeeds.length > 0) {

        injectedContext = await promptProcessorConstructMemoriesToInject(newMemorySeeds, memoriesDirectory);
    }

    // Remove all memory seeds
    const areSeedsDetectedInHistory = await promptProcessorHistorySimpleScanForSeeds(messages);

    if(
        memorySeedsSelected.length === 0 && 
        areSeedsDetectedInHistory === true
    ) {

        cleanupAllSeeds = true;

        await promptProcessorRemoveSeeds(
            injectedMemorySeeds, 
            validMemorySeedsSelected, 
            cleanupAllSeeds
        );

        injectedMemorySeeds = [];

    }

    // Remove specific memory seeds the user no longer wants
    // after the model has finished responding
    if(memorySeedsSelected.length > 0) {

        cleanupAllSeeds = false;

        injectedMemorySeeds = await promptProcessorRemoveSeeds(
            injectedMemorySeeds, 
            validMemorySeedsSelected, 
            cleanupAllSeeds
        );
    }

    await multiEditCoordinator(false);

    // MESSAGE WITH MEMORIES
    if (injectedContext) {
        // Sending prompt to model during saving memory active phase. This way it does not waste tokens and time
        // pretending to play along and fake a save.
        if(pendingSaveMemoryState.active === true) {
            return (
                `${userText}.                          ` +
                `${injectedContext}[END OF MEMORIES] ` +
                "System: the user is trying to save a memory, ignore what is between the [BEGINNING OF MEMORIES] and [END OF MEMORIES TAG], give a short reply 'pending save memory...'." +
                `${createNewInternalChatID? `[ICID: ${internalChatID}] Ignore this ICID tag. ` : ""}`
            )
        };

        return (
            `${userText}.` +
            `${injectedContext}[END OF MEMORIES] ` +
            `${createNewInternalChatID? `[ICID: ${internalChatID}] Ignore this ICID tag. ` : ""}`
        );
    }

    // NORMAL MESSAGE
    // Sending prompt to model during saving memory active phase. This way it does not waste tokens and time
    // pretending to play along and fake a save.
    if(pendingSaveMemoryState.active === true) {
        return (
            `${userText}.                          ` +
            "System: the user is trying to save a memory, give a short reply 'pending save memory...'." +
            `${createNewInternalChatID? `[ICID: ${internalChatID}] Ignore this ICID tag. ` : ""}`
        );
    }

    return (
        `${userText}.` +
        `${createNewInternalChatID? `[ICID: ${internalChatID}] Ignore this ICID tag. ` : ""}`
    );
}

/**
 * Try to recover InternalChatID tag if the users deleted it from chat.
 */
interface ChatSessionConversationRelationship {
    internalChatID: string;
    conversationFile: string;
}

/**
* Try and recover InternalChatID from in memory InternalChatID
* or using the fallback of the scanForConversationFileThruBaseNameOfWorkingDirectory() scan
* WD is not a guarantee, I've seen an empty.conversation file name with an empty-a611d49f33fc Working directory basename
* If either is impossible than there's no choice but to assign a new ICID
*/
async function promptProcessorRecoverChatID(
    internalChatID: string,
    conversationFileName: string,
    workingDirectory: string,
    userText: string,
): Promise<string> {

    // If already available in memory, use it.
    if (internalChatID !== "") {
        return internalChatID;
    }

    const rootDirectory = await memoryStore.getRootDirectory();

    // Construct the path to the conversation file
    const conversationDirectory = join(
        rootDirectory,
        "conversations",
    );

    const relationshipFile = join(
        conversationDirectory,
        "ChatSessionConversationRelationship.json",
    );

    // Cannot perform relationship lookup without a filename.
    if (conversationFileName === "") {
        // Attempt a reverse lookup first using the basename of working directory
        conversationFileName = await scanForConversationFileThruBaseNameOfWorkingDirectory(
            workingDirectory,
            conversationDirectory,
            conversationFileName,
            userText,
        );

        // Conversation File Name still unknown, cannot resume with recovery
        if(conversationFileName === "") {
            return "";
        }
    }

    try {
        
        const relationshipJson = await readFile(
            relationshipFile,
            "utf-8",
        );

        const relationships: ChatSessionConversationRelationship[] =
            JSON.parse(relationshipJson);

        // Search from newest to oldest.
        // Grab the newest relationship that matches the coversation file name
        // There cannot be two conversations files with the same exact name in a folder
        // At worst we are repurposing an abandoned ICID rather than making a new one
        for (
            let i = relationships.length - 1;
            i >= 0;
            i--
        ) {

            const relationship = relationships[i];
            
            if (relationship.conversationFile === conversationFileName) {

                return relationship.internalChatID;
            }
        }

    } catch (error: any) {

        if (error instanceof SyntaxError) {

            console.error(
                `Relationship file JSON is corrupted: ${error.message}`,
            );

        } else if (error.code === "ENOENT") {

            console.error(
                "Relationship file not found.",
            );

        } else {

            console.error(
                `Relationship lookup failed: ${error}`,
            );
        }
    }

    return "";
}

/**
* Scan history for InternalChatID tag.
* Cheaper than scanning the conversation file, if
* The conversation file name is still unknown, or the
* plugin reinitializes during an ongoing conversation.
* Note: history will always be missing the newest user+assistant message,
* so it's useless during the very first user message in chat.
*/
async function promptProcessorScanHistoryForID(
    messages: ChatMessage[],
): Promise<string> {

    let searchedInternalChatID = "";

    for (const message of messages) {
        if ((message as any).data.role !== "user") {
            continue;
        }

        for (const content of (message as any).data.content ?? []) {
            if (content.type !== "text" || !content.text) {
                continue;
            }

            const match = content.text.match(
                /\[ICID:\s*(\d+)\]/
            );

            if (match) {
                searchedInternalChatID = match[1];
                break;
            }
        }

        if (searchedInternalChatID !== "") {
            break;
        }
    }

    return searchedInternalChatID;
}

/**
* Scan conversation folder to link the real-time chat to
* it's associated conversation file. This enables the user to
* not have to manually make the link for the plugin.
* Trade off: more resources expended for great ease of use
* 1st scan is ideal, later scans are fallbacks, each has it's early ending.
* 1st scan: cheap - check the relationship file for an exisiting relationship.
* 2nd scan: cheap - check the basename of workingdirectory, which usually matches the conversation file name,
* reliability is uncertain but it's quick to see if the convo file is found and has the matching ICID
* 3rd scan: expensive - scan each conversation file starting from newest to oldest until
* we find the matching InternalChatID.
* 4th scan: fuzzy match user's latest input, check for the userInput text that matches what was
* just typed into prompt preprocessor. Logically when this code is executed happens only when users
* sent a fresh text through to the assistant, meaning it's the only real-time user input
*/
async function promptProcessorScanForConversationFile(
    userText: string,
    workingDirectory: string,
): Promise<string> {
    const rootDirectory = await memoryStore.getRootDirectory();
    let relationships: any[] = [];
    let foundConversationFileName = "";

    // Construct the path to the conversation file
    const conversationDirectory = join(
        rootDirectory,
        "conversations"
    );

    const relationshipFile = join(
        conversationDirectory,
        "ChatSessionConversationRelationship.json",
    );

    // Read the relationship file
    try {
        const relationshipJson = await readFile(
            relationshipFile,
            "utf-8",
        );

        relationships = JSON.parse(relationshipJson);

    } catch {
        // File doesn't exist yet, so we'll create it in a later step.
    }

    // We've already found or assigned an InternalChatID.
    // Check if there is an existing relationship in the relationship JSON.
    const existingRelationship = relationships.find(
        (relationship) =>
            relationship.internalChatID === internalChatID,
    );

    // 1st SCAN:
    // STEP 1: If there is a current relationship, check if the
    // conversation file still exists. If the file does not exist,

    if (existingRelationship) {

        foundConversationFileName = await scanForConversationFileThruRelationshipFile(
            existingRelationship,
            conversationDirectory,
            foundConversationFileName,
            relationships,
            relationshipFile,
        )

        if(foundConversationFileName !== "") {

            return foundConversationFileName
        }

    } else {
        // Nothing matched the InternalChatID
        // Lets check to see if the current WD name is present
        const directoryBaseNameFromWD = basename(workingDirectory);

        const conversationFileName = `${directoryBaseNameFromWD}.conversation.json`;

        const existingConversationRelationship = relationships.find(
            (relationship) =>
                relationship.conversationFile === conversationFileName,
        );

        if (existingConversationRelationship) {
            
            const lockFile = `${relationshipFile}.lock`;

            await acquireLock(lockFile);

            try {
                // This conversation file name already has a relationship,
                // update the InternalChatID in the relationship file.

                const relationshipData = {
                    internalChatID,
                    conversationFile: conversationFileName,
                };

                // Remove the old copy of this relationship.
                relationships = relationships.filter(
                    (relationship) =>
                        relationship.conversationFile !== conversationFileName,
                );

                // Reinsert it at the bottom so the newest relationship
                // is always the last entry.
                relationships.push(relationshipData);

                // Keep only the newest relationships.
                if (relationships.length > relationshipsLimit) {
                    relationships = relationships.slice(-relationshipsLimit);
                }

                await writeFile(
                    relationshipFile,
                    JSON.stringify(relationships, null, 2),
                    "utf-8",
                );

                // Update InternalChatID outer scope variable with what we just wrote in
                internalChatID = relationshipData.internalChatID;
                setConfigSchematics({conversationFileName: normalizeJsonFileName(conversationFileName)});
                return conversationFileName;
            } finally {
                try {
                    await unlink(lockFile);
                } catch {
                    // ignore
                } finally {
                    setLockFileOriginatesFromThisPlugin(lockFile, null);
                }
            }
        }
    }

    // 2nd SCAN:
    // STEP 3: Check if the basename of WD is a match for the conversation file.
    // Brand new ICID was generated, this will link that new ICID to the foundConvversationFileName
    if (foundConversationFileName === "") {

        foundConversationFileName = await scanForConversationFileThruBaseNameOfWorkingDirectory(
            workingDirectory,
            conversationDirectory,
            foundConversationFileName,
            userText,
        )
    }

    // 3rd SCAN:
    // STEP 4: Scan each conversation file starting from the newest.
    if (foundConversationFileName === "") {

        foundConversationFileName = await scanForConversationFileThruFullConversationDirectoryScan(
            conversationDirectory,
            foundConversationFileName,
            userText,
        )
    }

    // FINAL STEP:
    // If we found a conversation file through STEP 3 or STEP 4,
    // create/update the relationship in ChatSessionConversationRelationship.json.
    if (foundConversationFileName !== "") {
        updateRelationshipFile(
            relationships,
            rootDirectory,
            foundConversationFileName,
        );
    }

    // Set config state after scanning and relationship persistence.
    setConfigSchematics({conversationFileName: normalizeJsonFileName(foundConversationFileName)});

    return foundConversationFileName;
}

/**
* Scan conversation file for past seeds injected. This allows users
* to start the session with the correct injectedMemorySeeds + memorySeedsSelected state.
* Trade off over using history scan: more resources expended for accuracy and reliability
*/
async function promptProcessorConversationFileScanForPreviousSeeds(
    conversationFileName: string,
    memorySeedsPool: string[],
): Promise<string[]> {

    const rootDirectory = await memoryStore.getRootDirectory();

    const conversationDirectory = join(
        rootDirectory,
        "conversations",
    );

    const conversationFilePath = join(
        conversationDirectory,
        conversationFileName,
    );

    let foundPastInjectedMemorySeed: string[] = [];

    try {
        const conversationContent = await readFile(
            conversationFilePath,
            "utf-8",
        );

        const matches = conversationContent.matchAll(
            /\[BEGIN ([^\]]+)\]/g,
        );

        for (const match of matches) {
            const memorySeed = match[1].trim();

            // Only track memory seeds found in the conversation
            // that exist in the current memory pool.
            if (
                memorySeedsPool.includes(memorySeed) &&
                // Avoid tracking the same memory seed more than once.
                !foundPastInjectedMemorySeed.includes(memorySeed)
            ) {
                foundPastInjectedMemorySeed.push(memorySeed);
            }
        }

        updateMemorySeedsSelected(foundPastInjectedMemorySeed);

        setConfigSchematics({
            memorySeedsSelected: foundPastInjectedMemorySeed,
        });

        return foundPastInjectedMemorySeed;

    } catch (error: any) {
        console.error(`promptProcessorConversationFileScanForPreviousSeeds error: ${error}`)
    }

    return foundPastInjectedMemorySeed;
}

/**
* Shortcut to trigger a quick cleanup of all the memory seeds in conversation file
* when user has removed all seeds in Memories to Inject.
* Rather than the more expensive route of mathcing and removing seeds one by one.
*/
async function promptProcessorHistorySimpleScanForSeeds(
    messages: ChatMessage[],
): Promise<boolean> {

    for (const message of messages) {
        if (/\[BEGIN .*\.json\]/.test(message.getText())) {
            return true;
        }
    }

    return false;
}

async function updateRelationshipFile(
    relationships: any[],
    rootDirectory: string,
    conversationFileName: string,
): Promise<void> {
    
    // Construct the path to the conversation file
    const conversationDirectory = join(
        rootDirectory,
        "conversations"
    );

    const relationshipFile = join(
        conversationDirectory,
        "ChatSessionConversationRelationship.json",
    );

    // Read the relationship file
    try {
        const relationshipJson = await readFile(
            relationshipFile,
            "utf-8",
        );

        relationships = JSON.parse(relationshipJson);

    } catch {
        // File doesn't exist yet, so we'll create it in a later step.
    }

    const lockFile = `${relationshipFile}.lock`;

    await acquireLock(lockFile);

    try {
        // If this conversation file already has a relationship,
        // reuse its existing InternalChatID.
        const existingRelationship = relationships.find(
            (relationship) =>
                relationship.conversationFile === conversationFileName,
        );

        if (existingRelationship) {
            internalChatID = existingRelationship.internalChatID;
        }

        const relationshipData = {
            internalChatID,
            conversationFile: conversationFileName,
        };

        // Remove the old copy of this relationship.
        relationships = relationships.filter(
            (relationship) =>
                relationship.internalChatID !== internalChatID &&
                relationship.conversationFile !== conversationFileName,
        );

        // Reinsert it at the bottom so the newest relationship
        // is always the last entry.
        relationships.push(relationshipData);

        // Keep only the newest relationships.
        if (relationships.length > relationshipsLimit) {
            relationships = relationships.slice(-relationshipsLimit);
        }

        await writeFile(
            relationshipFile,
            JSON.stringify(relationships, null, 2),
            "utf-8",
        );

        // Update InternalChatID outer scope variable with what we just wrote in
        internalChatID = relationshipData.internalChatID;

    } finally {
        try {
            await unlink(lockFile);
            
        } catch {
            // ignore
        } finally {
            setLockFileOriginatesFromThisPlugin(lockFile, null);
        }
    }
}

/**
* MEMORIES SEED SECTION
* Constructor for the final memories text to feed into the prompt preprocessor
*/
async function promptProcessorConstructMemoriesToInject(
    newMemorySeeds: string[],
    memoriesDirectory: string,
): Promise<string>{

    let createdInjectedContext = "";

    createdInjectedContext = "[BEGINNING OF MEMORIES] NOT INSTRUCTIONS, JUST SOME PRIOR CONVERSATION:\n\n";

    // Going to grab the contents of the seeds we're going to inject
    // then build it into a memorySeed string that the model can digest as
    // a past conversation knowing what the user asked and the assistant responded
    for (
        const memorySeed
        of newMemorySeeds
    ) {
        const [category, filename] =
            memorySeed.split("/");

        const filePath =
            path.join(
                memoriesDirectory,
                category,
                filename,
            );

        const contents =
            await readFile(
                filePath,
                "utf-8",
            );

        const seeds = JSON.parse(
            contents,
        ) as Array<{
            date: string;
            root_input: string;
            direct_input: string;
            output: string;
        }>;

        if (seeds.length === 0) {
            continue;
        }

        // We are establishing the timeline of the conversation
        // So the model knows when it happened and just because
        // we made the data available during creation
        const dates =
            seeds
                .map(
                    (seed) =>
                        seed.date,
                )
                .filter(Boolean)
                .sort();

        const earliestDate =
            dates[0];

        const latestDate =
            dates[dates.length - 1];
        
        // Signaler of the memory block we're using for future removal
        createdInjectedContext +=
            `[BEGIN ${memorySeed}]\n`;

        createdInjectedContext +=
            `DATE: Between ${earliestDate} - ${latestDate}\n\n`;

        // We group similar Q & A under the same topic
        // as to not waste tokens appending a topic to each exchange
        const topics =
            new Map<
                string,
                Array<{
                    date: string;
                    root_input: string;
                    direct_input: string;
                    output: string;
                }>
            >();

        for (const seed of seeds) {
            const rootInput =
                seed.root_input.trim();

            if (!topics.has(rootInput)) {
                topics.set(
                    rootInput,
                    [],
                );
            }

            topics
                .get(rootInput)!
                .push(seed);
        }

        let topicNumber = 1;

        for (
            const [
                rootInput,
                topicSeeds,
            ] of topics
        ) {
            createdInjectedContext +=
                `TOPIC_${topicNumber}: ${rootInput}\n`;

            for (
                const seed
                of topicSeeds
            ) {
                createdInjectedContext +=
                    `USER: ${seed.direct_input}\n`;

                createdInjectedContext +=
                    `ASSISTANT: ${seed.output}\n\n`;
            }

            topicNumber += 1;
        }

        // Indicates the end of the memory block
        createdInjectedContext +=
            `[END ${memorySeed}]\n\n`;

        // Before this time injectedMemorySeeds will no longer be null
        // It needed to start as null for a prior if check
        if(injectedMemorySeeds !== null){
            injectedMemorySeeds.push(
                memorySeed,
            );
        }

        addMemorySeedToSelected(memorySeed);
    }

    setConfigSchematics({memorySeedsSelected: getMemorySeedsSelected()});

    return createdInjectedContext;
}

/**
* Simple middleman to figure out which valid memories the user chose to remove
*/
async function promptProcessorRemoveSeeds(
    injectedMemorySeeds: string[],
    validMemorySeedsSelected: string[],
    cleanupAllSeeds: boolean,
): Promise<string[]> {

    // Here we check if there were actually seeds removed by the user
    const memorySeedsToRemove =
        injectedMemorySeeds.filter(
            (memorySeed) =>
                !validMemorySeedsSelected.includes(
                    memorySeed,
                ),
        );
    
    // Second check to make sure there's actually something to remove
    if(memorySeedsToRemove.length > 0) {

        await removeMemorySeeds(validMemorySeedsSelected, memorySeedsToRemove, cleanupAllSeeds);
    }

    return validMemorySeedsSelected;
}

/**
* Helpers
*/
function areStringArraysEqualAsSets(
    a: string[],
    b: string[],
): boolean {
    const aSet = new Set(a);
    const bSet = new Set(b);

    if (aSet.size !== bSet.size) {
        return false;
    }

    return [...aSet].every((value) => bSet.has(value));
}

export function normalizeJsonFileName(jsonFileName: string){

    return jsonFileName.replace(/(\.json).*$/, "$1");
}

/**
 * Three States for lock
 * Null = no one claims ownership, abandoned file
 * True = lock was successfully acquired by this plugin
 * False = there was another lock exisiting before this plugin could acquire it
 * This will help regulate the timings of multiple polling plugins.
 * Needed to play with my context cleanup plugin.
 * https://github.com/anh-vudinh/LM-Studio_Context-Cleanup
 * 
 * MAKE SURE WHERE EVER YOU USE THIS ACQUIRELOCK FUNCTION YOU TRY CATCH FINALLY AND IN FINALLY ALWAYS UNLINK THE CORRESPONDING LOCKFILE CREATED
 * This acquirelock getter and checker cannot tolerate duplicate lockfiles originating from itself. It will error out to the saftey terminate timeout
 * There is tolerance for lock files with dupe names originating from other plugins and unique lockfile names.
 */
export async function acquireLock(
    lockFile: string,
): Promise<void> {

    const startedAt = Date.now();

    while (true) {

        if (Date.now() - startedAt >= 20_000) {
            throw new Error(
                `Timed out waiting for lock: ${lockFile}`,
            );
        }

        try {
            const handle = await open(lockFile, "wx");

            setLockFileOriginatesFromThisPlugin(lockFile, true);

            await handle.close();

            return;
        } catch (error) {
            const fsError = error as NodeJS.ErrnoException;

            if (fsError.code !== "EEXIST") {
                throw error;
            }

            setLockFileOriginatesFromThisPlugin(lockFile, false);

            try {
                const stats = await stat(lockFile);
                const lockAge = Date.now() - stats.mtimeMs;

                if (lockAge >= LOCK_TIMEOUT_MS) {
                    await unlink(lockFile);
                    continue;
                }
            } catch (error) {
                const fsError = error as NodeJS.ErrnoException;

                if (fsError.code !== "ENOENT") {
                    throw error;
                }

                continue;
            }

            await new Promise<void>((resolve) =>
                setTimeout(resolve, POLL_INTERVAL_MS),
            );
        }
    }
}

/**
 * Flow is prompt preprocessor → promptProcessorAppendNewAssistantMessageToEndOfConversationJson → multiEditCoordinator
 * → promptProcessorConstructMessageNumberTag → multiEditCoordinator(conversation.json write)
 */
async function promptProcessorAppendNewAssistantMessageToEndOfConversationJson(
    assistantIndex: number,
): Promise<void> {

    addConversationOperation(
        "promptProcessorAppendNewAssistantMessageToEndOfConversationJson",
        {
            assistantIndex,
        },
    );
}

/**
 * Constructs the Message Number Tag
 * Appends the content block after the assistant response
 */
export function promptProcessorConstructMessageNumberTag(
    conversation: any,
    assistantIndex: number,
): void {

    // Find the last assistant message
    const assistantMessage = [...conversation.messages]
        .reverse()
        .find((message: any) =>
            message.versions?.[
                message.currentlySelected ?? 0
            ]?.role === "assistant",
        );

    if (!assistantMessage) {
        throw new Error("No assistant message found.");
    }

    // Get the last version
    const assistantVersion =
        assistantMessage?.versions?.[
            assistantMessage.currentlySelected ?? 0
        ];
     
    if (!assistantVersion) {
        throw new Error("Assistant message has no versions.");
    }

    // Find debugInfoBlock
    const debugInfoIndex = assistantVersion.steps.findIndex(
        (step: any) => step.type === "debugInfoBlock",
    );

    // Create the new content block
    const markerBlock = {
        type: "contentBlock",
        stepIdentifier: String(Date.now()),
        content: [
            {
            type: "text",
            text: `\n\n***message ${assistantIndex}***`,
            fromDraftModel: false,
            tokensCount: 1,
            isStructural: false,
            },
        ],
        defaultShouldIncludeInContext: false,
        shouldIncludeInContext: false,
        };

        const markerExists = assistantVersion.steps.some(
        (step: any) =>
            step.type === "contentBlock" &&
            step.content?.some(
                (contentBlock: any) =>
                    contentBlock.type === "text" &&
                    contentBlock.text === `\n\n***message ${assistantIndex}***`,
            ),
    );

    // Try to add marker block object before debug.
    // If that doesn't exist just add after the last role: assistant content block.
    const insertIndex =
        debugInfoIndex !== -1
            ? debugInfoIndex
            : assistantVersion.steps.length;

    if (!markerExists) {
        assistantVersion.steps.splice(
            insertIndex,
            0,
            markerBlock,
        );
    }
}

/**
* Scanning options
*/
async function scanForConversationFileThruRelationshipFile(
    existingRelationship: any,
    conversationDirectory: string,
    foundConversationFileName: string,
    relationships: any[],
    relationshipFile: string,
):Promise<string> {

    const conversationFileName = existingRelationship.conversationFile;

    const conversationFilePath = join(
        conversationDirectory,
        conversationFileName,
    );

    // Check if conversation file stated in the relationship object passed in still exist.
    // If it doesn't remove the entry in the relationship file.
    try {
        await access(conversationFilePath);

        // File exists
        foundConversationFileName = conversationFileName;

    } catch {
        // Conversation file no longer exists.
        // Remove abandoned relationship.
        relationships = relationships.filter(
            (relationship) =>
                relationship.internalChatID !== internalChatID,
        );

        await writeFile(
            relationshipFile,
            JSON.stringify(relationships, null, 2),
            "utf-8",
        );
    }

    // STEP 2:
    // If the conversation file still exists, open it to confirm ICID.
    if (foundConversationFileName !== "") {

        const conversationContent = await readFile(
            conversationFilePath,
            "utf-8",
        );

        const internalChatIDPattern = new RegExp(
            `\\[ICID:\\s*${internalChatID}\\]`,
        );

        const icidMatches = internalChatIDPattern.test(conversationContent);

        // STEP 2.1:
        // Existing relationship is valid, so return immediately.
        if (icidMatches) {
            setConfigSchematics({conversationFileName: foundConversationFileName});
            return foundConversationFileName;
        }

        // Existing relationship is invalid.
        // Clear it and continue with the remaining scans.
        foundConversationFileName = "";
    }

    return foundConversationFileName;
}

async function scanForConversationFileThruBaseNameOfWorkingDirectory(
    workingDirectory: string,
    conversationDirectory: string,
    foundConversationFileName: string,
    userText: string,
):Promise<string> {

    try {
        const directoryBaseNameFromWD = basename(workingDirectory);

        const conversationFileName = `${directoryBaseNameFromWD}.conversation.json`;

        const conversationFilePath = join(
            conversationDirectory,
            conversationFileName,
        );

        const conversationContent = await readFile(
            conversationFilePath,
            "utf-8",
        );

        const internalChatIDPattern = new RegExp(
            `\\[ICID:\\s*${internalChatID}\\]`,
        );

        // First check for the ICID.
        if (internalChatIDPattern.test(conversationContent)) {
            foundConversationFileName = conversationFileName;
        }

        // If ICID did not match, check clientInput.
        if (foundConversationFileName === "") {
            try {
                const conversation = JSON.parse(conversationContent);

                const normalize = (s: string): string =>
                    (s ?? "")
                        .trim()
                        .replace(/\s+/g, " ");

                const clientInput = normalize(conversation.clientInput);
                const input = normalize(userText);

                if (
                    clientInput.length > 0 &&
                    input.startsWith(clientInput)
                ) {
                    foundConversationFileName = conversationFileName;
                }

                // we now know the conversationfilename
                // reverse lookup ICID if it already exist in relationship file.
                // This will help sync the in memory ICID to what we already have on file
                // and control if a brand new ICID is actually assigned.
                if (foundConversationFileName !== "") {

                    const rootDirectory = await memoryStore.getRootDirectory();
                    let relationships: any[] = [];

                    // Construct the path to the conversation file
                    const conversationDirectory = join(
                        rootDirectory,
                        "conversations"
                    );

                    const relationshipFile = join(
                        conversationDirectory,
                        "ChatSessionConversationRelationship.json",
                    );

                    try {
                        const relationshipJson = await readFile(
                            relationshipFile,
                            "utf-8",
                        );

                        relationships = JSON.parse(relationshipJson);

                    } catch {
                        // File doesn't exist yet, so we'll create it in a later step.
                    }

                    const existingRelationship = relationships.find(
                        (relationship) =>
                            relationship.conversationFile === foundConversationFileName,
                    );

                    if (existingRelationship) {
                        internalChatID = existingRelationship.internalChatID;
                    }
                }

            } catch {
                // Ignore malformed conversation content
                // and continue to the next scan.
            }
        }

    } catch (error: any) {

        if (error?.code !== "ENOENT") {
            console.error(error);
        }

        // Just move to next scan.
    }

    setConfigSchematics({conversationFileName: foundConversationFileName});

    return foundConversationFileName;
}

async function scanForConversationFileThruFullConversationDirectoryScan(
    conversationDirectory: string,
    foundConversationFileName: string,
    userText: string,
):Promise<string> {

    const allConversationFiles = await findAllConversationFiles(conversationDirectory);

    const internalChatIDPattern = new RegExp(
        `\\[ICID:\\s*${internalChatID}\\]`,
    );

    for (const conversationFile of allConversationFiles) {

        const conversationContent = await readFile(
            conversationFile,
            "utf-8",
        );

        // First try to match the InternalChatID.
        if (internalChatIDPattern.test(conversationContent)) {
            foundConversationFileName = basename(conversationFile);

            break;
        }

        // 4th SCAN:
        // Fallback for brand-new conversations where the
        // InternalChatID has not yet been injected.
        try {
            const conversation = JSON.parse(conversationContent);

            const normalize = (s: string): string =>
                (s ?? "")
                    .trim()
                    .replace(/\s+/g, " ");

            const clientInput = normalize(conversation.clientInput);
            const input = normalize(userText);

            if (
                clientInput.length > 0 &&
                input.startsWith(clientInput)
            ) {
                foundConversationFileName = basename(conversationFile);

                break;
            }

        } catch {
            // Ignore malformed conversation files and continue scanning.
        }
    }

    return foundConversationFileName;
}

/**
* Gather all the conversation files and order them
* from newest to oldest. The main function promptProcessorScanForConversationFile
* will then start searching in that given order.
*/
async function findAllConversationFiles(
    conversationsDirectory: string,
): Promise<string[]> {

    const conversationFiles: string[] = [];

    async function searchDirectory(
        directory: string,
    ): Promise<void> {

        const entries = await readdir(directory, {
            withFileTypes: true,
        });

        for (const entry of entries) {

            const fullPath = join(
                directory,
                entry.name,
            );

            if (
                entry.isFile()
            ) {
                // exclude the relationship file
                if ( entry.name === "ChatSessionConversationRelationship.json") {
                    continue;
                }

                if ( entry.name === "ChatSessionConversationRelationship.json.lock") {
                    continue;
                }

                conversationFiles.push(fullPath);
                continue;
            }

            if (entry.isDirectory()) {
                await searchDirectory(fullPath);
            }
        }
    }
    
    await searchDirectory(conversationsDirectory);

    const filesWithModifiedTime = await Promise.all(
        conversationFiles.map(async (filePath) => {
            const fileStats = await stat(filePath);

            return {
                filePath,
                modifiedTime: fileStats.mtimeMs,
            };
        }),
    );

    filesWithModifiedTime.sort(
        (a, b) => b.modifiedTime - a.modifiedTime,
    );

    return filesWithModifiedTime.map(
        (file) => file.filePath,
    );
}