import { configSchematics, setConfigSchematics } from "./config";
import { setCurrentConversationHistory, getCurrentConversationHistory } from "./conversationHistoryCache";
import { getMemorySeedsPool, updateMemorySeedsSelected, addMemorySeedToSelected, getMemorySeedsSelected } from "./memorySession";
import { isEligibleAssistantMessage } from "./conversationReader";
import { memoryStore } from "./memoryStore";
import { removeMemorySeeds } from "./removeMemorySeeds";
import { readFile, writeFile, access, readdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import path from "node:path";

import type {
    ChatMessage,
    PromptPreprocessorController,
} from "@lmstudio/sdk";

let injectedMemorySeeds: string[] | null = null;
let cleanupAllSeeds: boolean;
let internalChatID = "";
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

    // Assume values can be lost during future runs because of random plugin reinitialization

    // Read History to check for an InternalChatID
    if (internalChatID === "") {

        internalChatID = await promptProcessorScanHistoryForID(messages);
    }

    // First check of History for InternalChatID returned nothing
    // So we must create one
    if (internalChatID ===  "") {

        createNewInternalChatID = true;
        internalChatID = Date.now().toString();
    }
    
    // Use the pre-existing InternalChatID found
    // to find the matching conversation file
    // Skip if we already know the conversation file
    if (conversationFileName === "") {

        conversationFileName = await promptProcessorScanForConversationFile(
            internalChatID, 
            userText, 
            workingDirectory
        );
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

    // Create the memories string to inject

    // Model appends message # at the end of the it's response
    // prerequisite to instructing to save memory
    const assistantIndex = messages.filter(isEligibleAssistantMessage).length + 1;

    // Remove number instruction during save memory request. Dumb assistants have shown
    // to believe the format requirement is a second message save request
    const isSaveMemoryRequest =
    /\b(?:save|sav|sve|sv|store|remember|persist)\b.*?\b(?:memory|mem|mm|mmry|memry|mry|mmy|memy)\b/i
        .test(userText);

    const numberingInstruction = isSaveMemoryRequest
        ? ""
        : `Format requirement: for only this one of your response, add to the end **message ${assistantIndex}**.`;
    
    // Remove all memory seeds
    const areSeedsDetectedInHistory = await promptProcessorHistorySimpleScanForSeeds(messages);

    if(memorySeedsSelected.length === 0 && areSeedsDetectedInHistory === true) {

        cleanupAllSeeds = true;

        await promptProcessorRemoveSeeds(
            conversationFileName, 
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
            conversationFileName, 
            injectedMemorySeeds, 
            validMemorySeedsSelected, 
            cleanupAllSeeds
        );
    }

    if (injectedContext) {

        return (
            `${userText}.\n` +
            `${createNewInternalChatID? `[ICID: ${internalChatID}] . ` : ""}` +
            `${injectedContext}[END OF MEMORIES]\n` +
            `${numberingInstruction}`
        );
    }

    return (
        `${userText}.\n` +
        `${createNewInternalChatID? `[ICID: ${internalChatID}] . ` : ""}` +
        `${numberingInstruction}`
    );
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
    internalChatID: string,
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
    // remove the abandoned relationship.
    if (existingRelationship) {

        const conversationFileName = existingRelationship.conversationFile;

        const conversationFilePath = join(
            conversationDirectory,
            conversationFileName,
        );

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
    }

    // 2nd SCAN:
    // STEP 3: Check if the basename of WD is a match for the conversation file.
    if (foundConversationFileName === "") {
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

                    const clientInput = conversation.clientInput?.trim() ?? "";

                    const input = userText.trim();

                    if (
                        clientInput.length > 0 &&
                        input.startsWith(clientInput)
                    ) {
                        foundConversationFileName = conversationFileName;
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
    }

    // 3rd SCAN:
    // STEP 4: Scan each conversation file starting from the newest.
    //
    // Only perform this scan if STEP 3 did not find a match.
    if (foundConversationFileName === "") {

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

                const clientInput = conversation.clientInput?.trim() ?? "";

                const input = userText.trim();

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
    }

    // FINAL STEP:
    // If we found a conversation file through STEP 3 or STEP 4,
    // create/update the relationship in ChatSessionConversationRelationship.json.
    if (foundConversationFileName !== "") {

        // Remove any existing relationship for this InternalChatID
        // before creating the new association.
        relationships = relationships.filter(
            (relationship) =>
                relationship.internalChatID !== internalChatID,
        );

        const relationshipData = {
            internalChatID,
            conversationFile: foundConversationFileName,
        };

        relationships.push(relationshipData);

        // Control the file size.
        // Keep only the newest Nth relationships.
        if (relationships.length > relationshipsLimit) {
            relationships = relationships.slice(-relationshipsLimit);
        }

        await writeFile(
            relationshipFile,
            JSON.stringify(relationships, null, 2),
            "utf-8",
        );
    }

    // Set config state after scanning and relationship persistence.
    setConfigSchematics({conversationFileName: foundConversationFileName});

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

/**
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
    conversationFileName: string,
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

        injectedMemorySeeds = await removeMemorySeeds(conversationFileName, validMemorySeedsSelected, memorySeedsToRemove, cleanupAllSeeds);

    }

    return injectedMemorySeeds;
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

