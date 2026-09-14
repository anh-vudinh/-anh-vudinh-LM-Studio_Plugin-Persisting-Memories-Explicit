import { configSchematics, setConfigSchematics } from "./config";
import { setCurrentConversationHistory, getCurrentConversationHistory } from "./conversationHistoryCache";
import { getMemorySeedsPool, updateMemorySeedsSelected, addMemorySeedToSelected, getMemorySeedsSelected } from "./memorySession";
import { isEligibleAssistantMessage } from "./conversationReader";
import { memoryStore } from "./memoryStore";
import { removeMemorySeeds, validateConversationFile, findAllConversationFiles } from "./removeMemorySeeds";
import { readFile, writeFile, access } from "node:fs/promises";
import { join, basename } from "node:path";
import path from "node:path";

import type {
    ChatMessage,
    PromptPreprocessorController,
} from "@lmstudio/sdk";

let injectedMemorySeeds: string[] | null = null;
let internalChatID = "";
const relationshipsLimit = 15;

export async function promptPreprocessor(
    ctl: PromptPreprocessorController,
    userMessage: ChatMessage,
): Promise<string | ChatMessage> {
    const memoriesDirectory = await memoryStore.getMemoriesDirectory();
    const config = ctl.getPluginConfig(configSchematics);
    const memorySeedsSelected = config.get("memorySeedsSelected") as string[];
    let conversationFileName = config.get("conversationFileName") as string;
    const memorySeedsPool = getMemorySeedsPool();
    const history = await ctl.pullHistory();
    
    await setCurrentConversationHistory(history);

    const messages = (await getCurrentConversationHistory()).getMessagesArray();
    const userText = userMessage.getText();

    // Cleaning up whitespaces only, not mispellings
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

    // Establish the memory seeds that have already been
    // injected into this conversation using history.messagesArray()
    if (injectedMemorySeeds === null || injectedMemorySeeds.length > 0) {

        injectedMemorySeeds = [];

        injectedMemorySeeds = await promptProcessorHistoryScanForPreviousSeeds();
    }

    // Find selected memory seeds that have not already been injected.
    const newMemorySeeds =
        validMemorySeedsSelected.filter(
            (memorySeed) =>
                !injectedMemorySeeds!.includes(
                    memorySeed,
                ),
        );

    // console.log(
    //     "[MEMORY TEST] history:",
    //     history.getMessagesArray().map(
    //         (message, index) => ({
    //             index,
    //             role: message.getRole(),
    //             text: message.getText(),
    //         }),
    //     ),
    // );

    // New valid seeds waiting to be injected
    let injectedContext = "";

    if (newMemorySeeds.length > 0) {

        injectedContext = await promptProcessorConstructMemoriesToInject(newMemorySeeds, memoriesDirectory);
    }

    // Model appends message # at the end of the it's response
    // prerequisite to instructing to save memory
    const assistantIndex = messages.filter(isEligibleAssistantMessage).length + 1;
    const numberingInstruction = `Format requirement: at the end of your response add ***message ${assistantIndex}***.`;

    // Find or assign a unique ID for this chat session
    let createdNewInternalChatID = false;

    if (internalChatID === "") {

        // Search through history for it's existence
        internalChatID = await promptProcessorScanHistoryForID();
        
        // History did not show it so now we give it one
        // promptProcessorScanForConversationFile will use to connect them together
        if (internalChatID === "") {
            internalChatID = Date.now().toString();
            createdNewInternalChatID = true;
        }
    }

    // Check ChatSessionConversationRelationship.json for pre-established relationship
    // or scan each conversation.json until we find the matching one
    if(conversationFileName === "") {

        conversationFileName = await promptProcessorScanForConversationFile(createdNewInternalChatID);
    }

    // Remove memory seeds the user no longer wants
    if (injectedMemorySeeds !== null) {

        injectedMemorySeeds = await promptProcessorRemoveSeeds(ctl, injectedMemorySeeds, validMemorySeedsSelected);
    }

    if (injectedContext) {

        return (
            `${userText}\n` +
            `${createdNewInternalChatID? `[InternalChatID: ${internalChatID}] ` : ""}` +
            `${injectedContext}\n` +
            `${numberingInstruction}`
        );
    }

    return (
        `${userText}\n` +
        `${createdNewInternalChatID? `[InternalChatID: ${internalChatID}] ` : ""}` +
        `${numberingInstruction}`
    );
}

async function promptProcessorHistoryScanForPreviousSeeds(): Promise<string[]> {

    let foundPastInjectedMemorySeed: string[] = [];
    const memorySeedsPool = getMemorySeedsPool();
    const messages = (await getCurrentConversationHistory()).getMessagesArray();

    for (
        const message
        of messages
    ) {
        const text =
            message.getText();

        const matches =
            text.matchAll(
                /\[BEGIN ([^\]]+)\]/g,
            );

        for (const match of matches) {
            const memorySeed =
                match[1].trim();

            if (
                // Only track memory seeds found in history that exist in the memory pool.
                memorySeedsPool.includes(
                    memorySeed,
                ) &&
                // Avoid tracking the same memory seed more than once.
                !foundPastInjectedMemorySeed.includes(
                    memorySeed,
                )
            ) {
                foundPastInjectedMemorySeed.push(
                    memorySeed,
                );
            }
        }
    }

    updateMemorySeedsSelected(foundPastInjectedMemorySeed);

    setConfigSchematics({memorySeedsSelected: foundPastInjectedMemorySeed});

    return foundPastInjectedMemorySeed;
}

async function promptProcessorConstructMemoriesToInject(
    newMemorySeeds: string[],
    memoriesDirectory: string,
): Promise<string>{

    let createdInjectedContext = "";

    createdInjectedContext = "THIS IS INJECTED CONTEXT FROM A PRIOR CONVERSATION:\n\n";

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

async function promptProcessorScanHistoryForID(): Promise<string> {

    let searchedInternalChatID = "";
    const messages = (await getCurrentConversationHistory()).getMessagesArray();

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
    createdNewInternalChatID: boolean,
): Promise<string> {
    let relationships: any[] = [];
    let foundConversationFileName = "";

    const rootDirectory = await memoryStore.getRootDirectory();
    const messages = (await getCurrentConversationHistory()).getMessagesArray();

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
        // File doesn't exist yet, so we'll create it.
    }

    const existingRelationship = relationships.find(
        (relationship) =>
            relationship.internalChatID === internalChatID,
    );

    if (existingRelationship) {

        // Relationship already exists, so we already know the conversation.
        const conversationFileIdentifier = existingRelationship.conversationFile;

        const conversationFilePath = join(
            conversationDirectory,
            `${conversationFileIdentifier}.conversation.json`,
        );

        // Check whether the conversationFile actually still exist
        // If it no longer is present delete the entry from the relationship json file
        // and then continue the logic to scan for the correct file
        try {
            await access(conversationFilePath);

            // File exists, so we're done.
            foundConversationFileName = conversationFileIdentifier;
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
    }

    // If we found the the InternalChatID but did not find an entry in our relationships.json
    // we have to go find the matching conversation and populate the relationship.json
    // or if the internalID was not found in either history messages or the relationship.json
    // Now we grab all the files in conversation folder to try and figure out which
    // conversation file belongs to this chat
    if (createdNewInternalChatID || (existingRelationship === undefined && internalChatID !== "") || foundConversationFileName === "") {

        const allConversationFiles = await findAllConversationFiles(conversationDirectory);
        let matchingConversationFile: string | null = null;

        // Reading first user and assistant exchange to see if this is the 
        // same conversation file as the chat session
        for (const conversationFile of allConversationFiles) {

            const conversationJson = await readFile(
                conversationFile,
                "utf-8",
            );

            const conversation = JSON.parse(conversationJson);

            const isValid = await validateConversationFile(
                conversation,
                messages,
            );

            if (isValid) {
                matchingConversationFile = conversationFile;
                break;
            }
        }

        // Found the match so we add it as a
        // relationship in ChatSessionConversationRelationship.json
        if (matchingConversationFile !== null) {
            const convoFileName = basename(
                matchingConversationFile,
            );

            const conversationFileIdentifier =
                convoFileName.endsWith(".conversation.json")
                    ? convoFileName.replace(
                        ".conversation.json",
                        "",
                    )
                    : convoFileName.replace(
                        ".json",
                        "",
                    );

            const relationshipData = {
                internalChatID,
                conversationFile: conversationFileIdentifier,
            };

            relationships.push(relationshipData);

            // Control the file size
            // Keep only the newest 20 relationships
            if (relationships.length > relationshipsLimit) {
                relationships = relationships.slice(-relationshipsLimit);
            }

            await writeFile(
                relationshipFile,
                JSON.stringify(relationships, null, 2),
                "utf-8",
            );

            foundConversationFileName = conversationFileIdentifier;
        }
    }

    setConfigSchematics({conversationFileName: foundConversationFileName});

    return foundConversationFileName;
}

async function promptProcessorRemoveSeeds(
    ctl: PromptPreprocessorController,
    injectedMemorySeeds: string[],
    validMemorySeedsSelected: string[],
): Promise<string[]> {

    const config = ctl.getPluginConfig(configSchematics);

    // Here we check if there were actually seeds removed by the user
    // Removal is assumed when the seed no longer exists in .config
    // but still exists within the actual history.messagesArray()
    const removedMemorySeeds =
        injectedMemorySeeds.filter(
            (memorySeed) =>
                !validMemorySeedsSelected.includes(
                    memorySeed,
                ),
        );
    
    // Second chceck to make sure there's actually something to remove
    if(removedMemorySeeds.length > 0) {

        await removeMemorySeeds(config, removedMemorySeeds);

        // need to set injectedMemorySeeds to match what's actually
        // available rather than use processing power to do another scan of history
        // the actual update of the .config is delayed to work around lmstudio's lack of support
        // so injectedMemorySeeds will just update on it's own and assume the
        // .config will match later when assistant is done responding
        const updatedMemorySeedsSelected = getMemorySeedsSelected();

        injectedMemorySeeds = [...updatedMemorySeedsSelected];
        setConfigSchematics({memorySeedsSelected: updatedMemorySeedsSelected});
    }

    return injectedMemorySeeds;
}