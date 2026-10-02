import { setCurrentConversationHistory, getCurrentConversationHistory } from "./conversationHistoryCache";
import { getMemorySeedsPool, updateMemorySeedsSelected, addMemorySeedToSelected, getMemorySeedsSelected } from "./memorySession";
import { acquireLock, releaseLock } from "./acquireLockFile";
import { isEligibleAssistantMessage } from "./conversationReader";
import { memoryStore } from "./memoryStore";
import { removeMemorySeeds } from "./removeMemorySeeds";
import { join, basename } from "node:path";
import { processMessage } from "./triggerSaveMemory"
import { multiEditCoordinator } from "./multiEditCoordinator";
import path from "node:path";
import os from "os";

import {
    addConversationOperation,
    getPreviousTurnSavingState,
    getPendingSaveMemory,
    setController,
    configSchematics,
    setConfigSchematics,
    setPreviousTurnSavingState,
    getInternalChatID,
    setInternalChatID,
    getConversationFileName,
    setConversationFileName,
} from "./config";

import { 
    readFile,
    writeFile,
    readdir,
    stat,
} from "node:fs/promises";

import type {
    ChatMessage,
    PromptPreprocessorController,
} from "@lmstudio/sdk";

let injectedMemorySeeds: string[] | null = null;
let cleanupAllSeeds: boolean;
const relationshipsLimit = 15;

/**
* https://github.com/anh-vudinh
* Main function that directs the flow of the plugin
*/
export async function promptPreprocessor(
    ctl: PromptPreprocessorController,
    userMessage: ChatMessage,
): Promise<string | ChatMessage> {

    // Establish directories
    const lmStudioRootDirectory = path.join(
        os.homedir(),
        ".lmstudio",
    );
    const memoriesDirectory = await memoryStore.getMemoriesDirectory();
    const workingDirectory = ctl.getWorkingDirectory();

    // Establish initial variable values
    const config = ctl.getPluginConfig(configSchematics);
    const memorySeedsPool = getMemorySeedsPool();
    const memorySeedsSelected = config.get("memorySeedsSelected") as string[];
    const history = await ctl.pullHistory();
    await setCurrentConversationHistory(history);
    const messages = (await getCurrentConversationHistory()).getMessagesArray();
    const userText = userMessage.getText();
    let createNewInternalChatID = false;
    setController(ctl);

    //------------------------------------
    // Maybe repair a missing relationship bond with in memory data
    //------------------------------------
    if(getInternalChatID() !== "" && getConversationFileName() !== "") {
        // Check that the relationship exists in the relationship file.
        // If it does not, add it. This is the extreme case user is deleting relationships directly from the file and their load bearing user message
        // Two available options in the function, choose which one to enable. Each has it's pros or cons.
        const relationshipReadded = await maybeRepairRelationshipFileWithKnownICIDAndConversationFile(
            lmStudioRootDirectory,
        )

        if(relationshipReadded) {
            createNewInternalChatID = true;
        }
    }

    // ICID UNKNOWN?
    if (getInternalChatID() === "") {
        // SCAN HISTORY IF FOUND ASSIGN IT TO THE INTERNAL MEMORY
        const historyICID = await promptProcessorScanHistoryForID(messages);

        //------------------------------------
        // CONVERSATION FILE NAME KNOWN IN MEMORY BUT ICID UNKNOWN IN HISTORY (USER PROBABLY DELETED LOAD BEARING USER MESSAGE)
        //------------------------------------

        if(historyICID === "") {
            // Recover ICID through the relationship file
            const icidRecovered = await recoverICIDMultiStepMaybeSetConversationFileName(
                lmStudioRootDirectory,
                workingDirectory,
                userText,
            );

            if (icidRecovered) {
                createNewInternalChatID = true;
            }
        }

        //------------------------------------
        // ICID UNKNOWN
        //------------------------------------

        // SCAN HISTORY FAILED
        if(getInternalChatID() === "") {
            // SCAN IT THROUGH THE RELATIONSHIP FILE
            // WE'VE ALSO SET THE CONVERSATION FILE NAME HERE IF WE FOUND IT ALONGSIDE 
            // THE ICID WE MATCHED WHILE LOOKING THROUGH THE RELATIONSHIP FILE
            await promptProcessorTryWorkingDirectoryBaseNameLookupInRelationshipFile(
                lmStudioRootDirectory,
                workingDirectory,
            );
        }

        // ICID COULD NOT BE FOUND AT ALL SO CREATE A FRESH ICID
        if(getInternalChatID() === "") {
            setInternalChatID(Math.floor(Date.now() / 1000).toString());
            createNewInternalChatID = true;
        }
    }

    //------------------------------------
    // ICID NOW KNOWN
    //------------------------------------

    // CONVERSATION FILE NAME UKNOWN?
    if (getConversationFileName() === "") {
        
        // CHECK THE RELATIONSHIP FILE
        await promptProcessorMatchICIDInRelationshipFile(
            lmStudioRootDirectory,
        );

        // CHECK THE WORKING DIRECTORY BASE NAME FILE
        // CHECK FOR A EMBEDDED ICID OR MATCHING CLIENTINPUT
        if (getConversationFileName() === "") {
            await promptProcessorTryWorkingDirectoryConversationFile(
                lmStudioRootDirectory,
                workingDirectory,
                userText,
            );
        }
    }

    // CHECK THE FULL CONVERSATION DIRECTORY FROM NEWEST TO OLDEST
    // CONVERSATION FILES AND CHECK FOR EMBEDDED ICID OR MATCHING CLIENTINPUT
    if(
        getConversationFileName() === "" || 
        createNewInternalChatID === true
    ) {
        await scanForConversationFileThruFullConversationDirectoryScan(
            lmStudioRootDirectory,
            userText,
        );
    }

    //----------------------------------------------------
    // END: CONVERSATION FILE NAME NOW KNOWN && ICID NOW KNOWN
    //----------------------------------------------------

    //----------------------------------------------------
    // BEGIN: User Text Processing
    //----------------------------------------------------
    // testing userText if it's a memory command and extracting key variables,
    // taking the power away from unreliable model/tools approach from determining this.
    await processMessage(userText);

    const pendingSaveMemoryState = getPendingSaveMemory();
    
    // Model appends message # at the end of the it's response
    // prerequisite to instructing to save memory
    const assistantIndex = messages.filter(isEligibleAssistantMessage).length + 1;

    const previousTurnState =  getPreviousTurnSavingState();

    // I don't remember exactly but I "think" this conditional was put in place to
    // stop my number and save memory command from fighting for control and stalling out the assistant.
    // So the check should be if the current turn was not a save memory mode based off .active and the previous turn
    // was not either then number is allowed to handle the message.
    if((pendingSaveMemoryState.active === false &&
        previousTurnState === false) ||
        previousTurnState === null
    ) {
        await promptProcessorAppendNewAssistantMessageToEndOfConversationJson(assistantIndex);

        setPreviousTurnSavingState(null);
    }

    //----------------------------------------------------
    // BEGIN: Memory Seed Logic
    //----------------------------------------------------
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
    // actually from the available memory pool.
    //
    // category/*.json expands to all current seeds in that category.
    const validMemorySeedsSelected = [
        ...new Set(
            normalizedMemorySeedsSelected.flatMap(
                (memorySeed) => {
                    const wildcardMatch =
                        memorySeed.match(
                            /^([^/]+)\/\*\.json$/i,
                        );

                    if (wildcardMatch) {
                        const category =
                            wildcardMatch[1];

                        return memorySeedsPool.filter(
                            (availableSeed) =>
                                availableSeed.startsWith(
                                    `${category}/`,
                                ),
                        );
                    }

                    return memorySeedsPool.includes(
                        memorySeed,
                    )
                        ? [memorySeed]
                        : [];
                },
            ),
        ),
    ];

    // Scan file first for injected seeds
    // Check on first initialzation, and skip checks later if nothing changed
    // Still works if plugin randomly reinitializes, IMS will be set to null again. 
    // So the current states either
    // matches, doesn't match, or was reset by random initialization.
    let injectedContext = "";
    
    const currentConversationFileName = getConversationFileName();

    if (
        injectedMemorySeeds === null ||
        !areStringArraysEqualAsSets(injectedMemorySeeds, validMemorySeedsSelected)
    ) {
        injectedMemorySeeds = await promptProcessorConversationFileScanForPreviousSeeds(currentConversationFileName, [...memorySeedsPool]);
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
        return (
            `${userText}.                          ` +
            `${injectedContext}[END OF MEMORIES] ` +
            `${pendingSaveMemoryState.active === true || previousTurnState === true? "System: the user is trying to save a memory, ignore what is between the [BEGINNING OF MEMORIES] and [END OF MEMORIES TAG], give a short reply 'pending save memory...'." :""}` +
            `${createNewInternalChatID? `[ICID: ${getInternalChatID()}] Ignore this ICID tag. ` : ""}`
        )
    }

    // NORMAL MESSAGE
    // Sending prompt to model during saving memory active phase. This way it does not waste tokens and time
    // pretending to play along and fake a save.
    return (
        `${userText}.                          ` +
        `${pendingSaveMemoryState.active === true || previousTurnState === true? "System: the user is trying to save a memory, give a short reply 'pending save memory...'." :""}` +
        `${createNewInternalChatID? `[ICID: ${getInternalChatID()}] Ignore this ICID tag. ` : ""}`
    );
}

/**             ______________________________________           
 *             |                                      |
 *             | LMSTUDIO LOVES TO DISCONNECT PLUGINS |
 *             |______________________________________|
 * 
 * FLOW OF SCAN   →    maybeRepairRelationshipFileWithKnownICIDAndConversationFile()         →        promptProcessorScanHistoryForID()           →          recoverICIDMultiStepMaybeSetConversationFileName()              →        promptProcessorTryWorkingDirectoryBaseNameLookupInRelationshipFile()        →       (Generate New ICID)      →           promptProcessorMatchICIDInRelationshipFile()              →           promptProcessorTryWorkingDirectoryConversationFile()             →             scanForConversationFileThruFullConversationDirectoryScan()
 *                                                 ↓                                                                  ↓                                                               ↓                                                                                  ↓                                                                                                          ↓                                                                          ↓                                                                                 ↓
 *                             (ICID && CONVO FILE IN MEMORY? YES/NO)                                     (ICID in history? YES/NO)                             (CFN in Relationship File? YES/NO | GET ICID)                        (Quick lazy check if WD base name is already an existing relationship)                                                (ICID Matches in Relationship File? YES/NO | Get CFN)                    (ICID found in WD Conversation.json? YES/NO | set CFN)                 (Scan through New -> Old Conversation.json Spotted ICID? YES/NO | set CFN)
 *                                                 ↓                                                                  ↓                                                               ↓                                                                                  ↓                                                                                                                                                                                     ↓                                                                                 ↓
 *                  (WRITE missing Relationship | Add ICID to History | Skip all Scans)                     (Add ICID to Memory)                  (Working Directory Base Name in Relationship File? YES/NO | GET ICID)                                 (Reuse pre-existing ICID + set CFN)                                                                                                                                            (ClientInput matches userText? YES/NO | set CFN)                         (During Scan check ClientInput matches userText? YES/NO | set CFN)
 *                                                                                                                                                                                    ↓                                              ______________________________________________________________________                                                                                                                                                                                                                                      ↓
 *                                                                                                                                                  (Scan allConversation Files New -> Old, Found matching clientInput)                                                                                                                                                                                                                                                                                        (WRITE Both CFN and ICID to relationship file if not already present)
 *                                                                                                                                                (in conversation file match to relationship? YES/NO | GET ICID + SET CFN)  →  (Will reuse pre-existing ICID, BOTH ICID AND CFN KNOWN SKIP REMAINING SCANS)                                                                                                                                                                                                       (repair mismatch relationship if present in relationship file)
 *                                                                                                                                                                                    ↓                                                                                                                                                                                                                                                                                                                                                          
 *                                                                                                                                                          (ICID MUST BE KNOWN BY NOW, IF NOT. IT NEVER EXISTED)                                                                                                                                                                                                                                                                                                         
 *                                                                                                                                                                                                                                                                                                                     
 *                                                                                                                                                                                                                                                                                                                                               
 *                                                                                                                                                                                                                                                                                                                            
 */

/**
 * Try to recover InternalChatID tag if the users deleted it from chat.
 */
interface ChatSessionConversationRelationship {
    internalChatID: string;
    conversationFile: string;
}

//-------------------------------
// Scanning options
//-------------------------------

/**
 * Extraordinary case if the user purposely deletes both the relationship entry in the relationship file,
 * and the user's message holding the ICID. We will reinsert the entry using the in memory data.
 */
async function maybeRepairRelationshipFileWithKnownICIDAndConversationFile(
    rootDirectory: string,
): Promise<boolean> {

    const conversationDirectory = join(
        rootDirectory,
        "conversations"
    );

    // Point to the relationship file
    const relationshipFile = join(
        conversationDirectory,
        "ChatSessionConversationRelationship.json",
    );

    const conversationFileName = getConversationFileName();

    const internalChatID = getInternalChatID();

    const lockFile = `${relationshipFile}.lock`;

    const functionName = "maybeRepairRelationshipFileWithKnownICIDAndConversationFile";

    try{
        await acquireLock(lockFile, functionName);

        const relationshipJson = await readFile(
            relationshipFile,
            "utf-8",
        );

        let relationships: ChatSessionConversationRelationship[] =
            JSON.parse(relationshipJson);

        relationships = relationships.filter(
            (relationship) =>
                relationship.internalChatID.trim() !== "" &&
                relationship.conversationFile.trim() !== "",
        );

        const relationship = relationships.find(
            (relationship) => relationship.conversationFile === conversationFileName &&
                relationship.internalChatID === internalChatID
        );

        // The exact relationship we have in memory is missing from the relationship file. CHOOSE ONLY ONE OPTION!!
        // That can only mean the user deleted the load bearing user message and deleted the relationship manually

        //---------------------------
        // OPTION 1: REPAIR THE RELATIONSHIP FILE WITH IN MEMORY DATA 
        // (must create a lock file with it's inherent delay)
        //---------------------------
        if (!relationship) {
                
            relationships.push({
                internalChatID: internalChatID,
                conversationFile: conversationFileName,
            });

            // Keep only the newest relationships.
            if (relationships.length > relationshipsLimit) {
                relationships = relationships.slice(-relationshipsLimit);
            }

            await writeFile(
                relationshipFile,
                JSON.stringify(relationships, null, 2),
                "utf-8",
            );

            return true;
        }

        //---------------------------
        // OPTION 2: RESET THE IN MEMORY DATA SO WE CAN GO THROUGH THE NORMAL PROCESS OF CREATING A BRAND NEW LINK 
        // (no lock file needed, no delay, just a quick read of the relationship file)
        //---------------------------
        // if (!relationship) {
        //     setConversationFileName("");
        //     setInternalChatID("");
        // }

        // Relationship already exists in the file
        if(relationship) {
            return false;
        }

    } catch (error) {
        // move along
    } finally {
        await releaseLock(lockFile, functionName);
    }

    return false;
}

/**
 * Scans history for any exisiting ICID.
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

    // So it does not overwrite an ICID already known in memory, but none exist in history(user deleted it)
    if(searchedInternalChatID !== ""){
        setInternalChatID(searchedInternalChatID);
    }

    return searchedInternalChatID;
}

/**
 * ICID marker in history has been lost, we will try to recover the CFN first through various methods to
 * re-establish the past ICID used.
 * CFN already in memory → check it against the relationship file
 * CFN in memory missing → check WD base name against relationship file
 * WD Base Name fails check → check from newest to oldest conversation files to match clientInput to userText = match means we now know the true conversation file name
 * check for the pre-existing relationship in the relationship file and reuse it. Reinject the re-established ICID.
 */
async function recoverICIDMultiStepMaybeSetConversationFileName(
    rootDirectory: string,
    workingDirectory: string,
    userText: string,
): Promise<boolean>{

    const conversationFileName = getConversationFileName();
    
    const conversationDirectory = join(
        rootDirectory,
        "conversations"
    );

    // Point to the relationship file
    const relationshipFile = join(
        conversationDirectory,
        "ChatSessionConversationRelationship.json",
    );

    // Conversation File Name still available in memory
    if(conversationFileName !== "") {
        try{
            const relationshipJson = await readFile(
                relationshipFile,
                "utf-8",
            );

            const relationships: ChatSessionConversationRelationship[] =
                JSON.parse(relationshipJson);

            const relationship = relationships.find(
                (relationship) => relationship.conversationFile === conversationFileName
            );

            if(relationship) {
                setInternalChatID(relationship.internalChatID);
                return true;
            }

        } catch {
            // move along
        }
    }

    // FALLBACK: JUST A QUICK LOOK UP IF IT WORKS IT WORKS, IF NOT THAT'S ALL WE CAN DO
    // Conversation File Name from Working Directory
    const directoryBaseNameFromWD = basename(workingDirectory);

    const conversationFileNameWD = `${directoryBaseNameFromWD}.conversation.json`;

    try {
        const relationshipJson = await readFile(
            relationshipFile,
            "utf-8",
        );

        const relationships: ChatSessionConversationRelationship[] =
            JSON.parse(relationshipJson);

        const relationship = relationships.find(
            (relationship) => relationship.conversationFile === conversationFileNameWD
        );

        if(relationship) {
            setInternalChatID(relationship.internalChatID);
            return true;
        }
    } catch {
        // move along
    }

    // Check clientInput of all the conversations in directory starting from the newest conversation file
    // No authority to overwrite, just comparing the conversation file found to the relationship file
    const allConversationFiles = await findAllConversationFiles(conversationDirectory);

    for (const conversationFile of allConversationFiles) {

        const conversationJson = await readFile(
            conversationFile,
            "utf-8",
        );

        // Find a matching clientInput text that matches the majority of the user's input
        // Sometimes clientInput did not fully register all of the user's input by the time we read it
        try {
            const conversation = JSON.parse(conversationJson);

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
                // If we already expendend the processing power to confirm the conversation file name
                // we might as well set it.
                setConversationFileName(normalizeJsonFileName(basename(conversationFile)));

                // Check relationship file for a matching internal chat ID
                try {
                    const relationshipJson = await readFile(
                        relationshipFile,
                        "utf-8",
                    );

                    const relationships: ChatSessionConversationRelationship[] =
                        JSON.parse(relationshipJson);

                    const relationship = relationships.find(
                        (relationship) => relationship.conversationFile === getConversationFileName()
                    );

                    if(relationship) {
                        setInternalChatID(relationship.internalChatID);
                        return true;
                    }
                } catch {
                    // move along
                }

                break;
            }
        } catch {
            // Ignore malformed conversation files and continue scanning.
        }
    }

    return false;
}

/**
 * Cheap check to see if a conversation file name can be derived from the working directory base name
 * WD base name sometimes has random alphanumeric suffixes
 */
async function promptProcessorTryWorkingDirectoryBaseNameLookupInRelationshipFile(
    rootDirectory: string,
    workingDirectory: string,
):Promise<void> {

    // Construct the path to the conversation folder
    const conversationDirectory = join(
        rootDirectory,
        "conversations",
    );

    // Point to the relationship file
    const relationshipFile = join(
        conversationDirectory,
        "ChatSessionConversationRelationship.json",
    );

    // Extract the basename of the working directory
    const workingDirectoryBaseName = basename(workingDirectory);

    // Point to the potential conversation file
    const conversationFileName = `${workingDirectoryBaseName}.conversation.json`;

    // Try to read the relationship file
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
        // At worst we are going to reuse an abandoned ICID rather than making a new one
        for (
            let i = relationships.length - 1;
            i >= 0;
            i--
        ) {
            const relationship = relationships[i];

            if (relationship.conversationFile === conversationFileName) {

                // If the conversation file is matched, set the conversation file name in memory
                setConversationFileName(normalizeJsonFileName(conversationFileName));

                // If a matching relationship is found, return its internalChatID
                setInternalChatID(relationship.internalChatID);
            }
        }
    } catch (error) {
        console.error("Error reading relationship file:", error);
    }
}

/**
 * Quick check to match an internal chat ID against the relationship file to derive the conversation file name
 */
async function promptProcessorMatchICIDInRelationshipFile(
    rootDirectory: string,
): Promise<void> {

    // Construct the path to the conversation folder
    const conversationDirectory = join(
        rootDirectory,
        "conversations",
    );

    // Point to the relationship file
    const relationshipFile = join(
        conversationDirectory,
        "ChatSessionConversationRelationship.json",
    );

    // Fetch current internal chat ID
    const currentInternalChatID = getInternalChatID();

    try {
        const relationshipJson = await readFile(
            relationshipFile,
            "utf-8",
        );

        const relationships: ChatSessionConversationRelationship[] =
            JSON.parse(relationshipJson);

        const relationship = relationships.find(
            (relationship) => relationship.internalChatID === currentInternalChatID
        );

        if (relationship) {

            // If a matching relationship is found, set it's conversation file name
            setConversationFileName(normalizeJsonFileName(relationship.conversationFile));
        }

    } catch (error: any) {
        console.error(`Error occurred while reading relationship file: ${error.message}`);
    }
}

/**
 * Check to see if Working Directory base name links to a conversation file, if it does check for the ICID
 * or clientInput in the file to validate the conversation file name
 */
async function promptProcessorTryWorkingDirectoryConversationFile(
    rootDirectory: string,
    workingDirectory: string,
    userText: string,
):Promise<void> {

    // Construct the path to the conversation folder
    const conversationDirectory = join(
        rootDirectory,
        "conversations",
    );

    // Extract the basename of the working directory
    const workingDirectoryBaseName = basename(workingDirectory);

    // Point to the potential conversation file
    const conversationFileName = `${workingDirectoryBaseName}.conversation.json`;

    // Construct the path to the conversation file
    const conversationFilePath = join(
        conversationDirectory,
        conversationFileName,
    );

    const currentInternalChatID = getInternalChatID();

    try {

        // Parse the conversation file
        const conversationJson = await readFile(
            conversationFilePath,
            "utf-8",
        );

        const conversation = JSON.parse(conversationJson);

        // Check for the embedded ICID
        const internalChatIDPattern = new RegExp(
            `\\[ICID:\\s*${currentInternalChatID}\\]`,
        );

        if (internalChatIDPattern.test(conversationJson)) {
            setConversationFileName(normalizeJsonFileName(conversationFileName));

            return;
        }

        // Check if the conversation file has a matching clientInput
        const normalize = (s: string): string =>
            (s ?? "")
                .trim()
                .replace(/\s+/g, " ");

        const clientInput = normalize(conversation.clientInput);

        const input = normalize(userText);

        // Find a matching clientInput text that matches the majority of the user's input
        // Sometimes clientInput did not fully register all of the user's input by the time we read it
        if (
            clientInput.length > 0 &&
            input.startsWith(clientInput)
        ) {
            setConversationFileName(normalizeJsonFileName(conversationFileName));

            return;
        }

    } catch (error: any) {
        if (error.code !== "ENOENT") {
            throw error;
        }

        // File doesn't exist — silently move along.
    }
}

/**
 * Expensive full directory scan of all conversation files from newest to oldest until a match is found between
 * the user's input and a conversation file's clientInput or ICID marker.
 * Highest authority to rewrite the relationship file to update or remove mismatched pairs.
 */
async function scanForConversationFileThruFullConversationDirectoryScan(
    rootDirectory: string,
    userText: string,
):Promise<void> {

    const conversationDirectory = join(
        rootDirectory,
        "conversations"
    );

    const allConversationFiles = await findAllConversationFiles(conversationDirectory);

    const currentInternalChatID = getInternalChatID();

    const internalChatIDPattern = new RegExp(
        `\\[ICID:\\s*${currentInternalChatID}\\]`,
    );

    for (const conversationFile of allConversationFiles) {

        const conversationJson = await readFile(
            conversationFile,
            "utf-8",
        );

        // Check for the embedded ICID
        if (internalChatIDPattern.test(conversationJson)) {

            setConversationFileName(normalizeJsonFileName(basename(conversationFile)));

            break;
        }

        // Find a matching clientInput text that matches the majority of the user's input
        // Sometimes clientInput did not fully register all of the user's input by the time we read it
        try {
            const conversation = JSON.parse(conversationJson);

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
                setConversationFileName(normalizeJsonFileName(basename(conversationFile)));

                break;
            }

        } catch {
            // Ignore malformed conversation files and continue scanning.
        }
    }

    // Point to the relationship file
    const relationshipFile = join(
        conversationDirectory,
        "ChatSessionConversationRelationship.json",
    );

    const lockFile = `${relationshipFile}.lock`;

    const functionName = "scanForConversationFileThruFullConversationDirectoryScan";

    // We should now have both ICID and ConversationFileName in memory
    // Check the relationship file if it already exists, if not we need to create it
    try {
        await acquireLock(lockFile, functionName);

        const relationshipJson = await readFile(
            relationshipFile,
            "utf-8",
        );

        const relationships: ChatSessionConversationRelationship[] =
            JSON.parse(relationshipJson);

        const relationship = relationships.find(
            (relationship) => relationship.internalChatID === currentInternalChatID &&
                relationship.conversationFile === getConversationFileName(),
        );

        // If they already perfectly match we don't need to do anything
        if (relationship) {
            setConversationFileName(normalizeJsonFileName(relationship.conversationFile));
            setInternalChatID(relationship.internalChatID);
            return;
        }

        // If there was not a perfect match, we need to create a new one or modify an old existing relationship

        const matchingIndexes = relationships
            .map((relationship, index) => ({
                relationship,
                index,
            }))
            .filter(
                ({ relationship }) =>
                    relationship.internalChatID === getInternalChatID() ||
                    relationship.conversationFile === getConversationFileName(),
            );

        if (matchingIndexes.length > 0) {

            const filteredRelationships = relationships.filter(
                (_, index) =>
                    !matchingIndexes.some(
                        (match) => match.index === index,
                    ),
            );

            filteredRelationships.push({
                internalChatID: getInternalChatID(),
                conversationFile: getConversationFileName(),
            });

            const relationshipsToWrite =
                filteredRelationships.length > relationshipsLimit
                    ? filteredRelationships.slice(-relationshipsLimit)
                    : filteredRelationships;

            await writeFile(
                relationshipFile,
                JSON.stringify(relationshipsToWrite, null, 4),
                "utf-8",
            );

        } else {

            relationships.push({
                internalChatID: getInternalChatID(),
                conversationFile: getConversationFileName(),
            });

            const relationshipsToWrite =
                relationships.length > relationshipsLimit
                    ? relationships.slice(-relationshipsLimit)
                    : relationships;

            await writeFile(
                relationshipFile,
                JSON.stringify(relationshipsToWrite, null, 4),
                "utf-8",
            );
        }

    } catch (error: any) {
        console.error(`scanForConversationFileThruFullConversationDirectoryScan() error: ${error.message}`);
    } finally {
        await releaseLock(lockFile, functionName);
    }
}

/**
 * Helper for the full scanning of all conversation files to find the ICID
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

            if (entry.isFile()) {
                if ( entry.name === "ChatSessionConversationRelationship.json") {
                    continue;
                }

                if (
                    entry.name.endsWith(".lock") ||
                    entry.name.endsWith(".ready")
                ) {
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

//-----------------------------------------------------------
// Memory Seeds
//-----------------------------------------------------------

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