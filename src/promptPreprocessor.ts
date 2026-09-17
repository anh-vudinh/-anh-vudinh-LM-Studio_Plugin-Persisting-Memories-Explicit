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
let createNewInternalChatID: boolean;
let cleanupAllSeeds: boolean;
let internalChatID = "";
const relationshipsLimit = 15;

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

    // Assume values can be lost during future runs because of random plugin reinitialization

    // Read History to see check for an InternalChatID
    if (internalChatID === "") {
        internalChatID = await promptProcessorScanHistoryForID(messages);

        if (internalChatID !== "") {
            createNewInternalChatID = false;
        }
    }

    // First check of History for InternalChatID returned nothing
    // So we must create one
    if (internalChatID ===  "") {
        createNewInternalChatID = true;
    }
    
    // Assign an InternalChatID
    if (createNewInternalChatID === true) {
        internalChatID = Date.now().toString();
    }

    // Use the pre-existing InternalChatID found
    // to find the matching conversation file
    conversationFileName = await promptProcessorScanForConversationFile(internalChatID, userText);

    // Read the user's currently selected memories from plugin
    // Note use memorySeedsSelected over getMemorySeedsSelected() <- which does not update real-time
    
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
    injectedMemorySeeds = await promptProcessorConversationFileScanForPreviousSeeds(conversationFileName, [...memorySeedsPool]);

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
    const numberingInstruction = `Format requirement: at the end of your response add ***message ${assistantIndex}***.`;
    
    // Remove all memory seeds
    const areSeedsDetectedInHistory = await promptProcessorHistorySimpleScanForSeeds(messages);
    if(memorySeedsSelected.length === 0 && areSeedsDetectedInHistory === true) {
        cleanupAllSeeds = true;
        await promptProcessorRemoveSeeds(conversationFileName, injectedMemorySeeds, validMemorySeedsSelected, cleanupAllSeeds);
        injectedMemorySeeds = [];
    }

    // Remove specific memory seeds the user no longer wants
    // after the model has finished responding
    if(memorySeedsSelected.length > 0) {
        cleanupAllSeeds = false;
        injectedMemorySeeds = await promptProcessorRemoveSeeds(conversationFileName, injectedMemorySeeds, validMemorySeedsSelected, cleanupAllSeeds);
    }

    if (injectedContext) {

        return (
            `${userText}\n` +
            `${createNewInternalChatID? `[InternalChatID: ${internalChatID}] ` : ""}` +
            `${injectedContext}[END OF MEMORIES]\n` +
            `${numberingInstruction}`
        );
    }

    return (
        `${userText}\n` +
        `${createNewInternalChatID? `[InternalChatID: ${internalChatID}] ` : ""}` +
        `${numberingInstruction}`
    );
}

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
                /\[InternalChatID:\s*(\d+)\]/
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

async function promptProcessorScanForConversationFile(
    internalChatID: string,
    userText: string,
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

    // We've already found or assigned an InternalChatID
    // Take the ICID check if there is an existing relationship
    // in the relationship json.
    const existingRelationship = relationships.find(
        (relationship) =>
            relationship.internalChatID === internalChatID,
    );

    // STEP 1: If there is a current relationship check if the conversation file
    // still exist, if the file does not exist remove the entry
    if (existingRelationship) {

        // Retrieve the full conversation file name.
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

        // STEP 2: If the conversation file still exist, open it to confirm for ICID
        if (foundConversationFileName !== "") {

            const conversationContent = await readFile(
                conversationFilePath,
                "utf-8",
            );

            const internalChatIDPattern = new RegExp(
                `\\[InternalChatID:\\s*${internalChatID}\\]`,
            );

            // STEP 2.1: If the ICID matches, conversation file found
            if (internalChatIDPattern.test(conversationContent)) {

                return foundConversationFileName;
            }
        }
    }

    // STEP 2.2: If the ICID doesn't match continue to scan in STEP 3.

    // STEP 3: Perform a scan of each conversation file starting from the newest
    // to search for the ICID because by now it should already exist
    const allConversationFiles = await findAllConversationFiles(conversationDirectory);

    let matchingConversationFile: string | null = null;

    const internalChatIDPattern = new RegExp(
        `\\[InternalChatID:\\s*${internalChatID}\\]`,
    );

    for (const conversationFile of allConversationFiles) {
        const conversationContent = await readFile(
            conversationFile,
            "utf-8",
        );

        // First try to match the InternalChatID.
        if (internalChatIDPattern.test(conversationContent)) {
            matchingConversationFile = conversationFile;
            break;
        }

        // Fallback for brand-new conversations where the
        // InternalChatID has not yet been injected.
        try {
            const conversation = JSON.parse(
                conversationContent,
            );

            const clientInput = conversation.clientInput?.trim() ?? "";
            const input = userText.trim();

            if (
                clientInput.length > 0 &&
                input.startsWith(clientInput)
            ) {
                matchingConversationFile = conversationFile;
                break;
            }
        } catch {
            // Ignore malformed conversation files and continue scanning.
        }
        
    }

    // Found the match, so add it as a relationship in
    // ChatSessionConversationRelationship.json.
    if (matchingConversationFile !== null) {
        const conversationFileName = basename(
            matchingConversationFile,
        );

        const relationshipData = {
            internalChatID,
            conversationFile: conversationFileName,
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

        foundConversationFileName = conversationFileName;
    }

    // STEP 4: We now either have an already valid conversation file name
    // from a confirmed existing conversation or we've found it through the scan
    // return the conversation file name and set config state
    setConfigSchematics({
        conversationFileName: foundConversationFileName
    });

    return foundConversationFileName;
}

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
}

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