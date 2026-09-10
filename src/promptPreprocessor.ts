import type {
    ChatMessage,
    PromptPreprocessorController,
} from "@lmstudio/sdk";

import {
    setConfigSchematics,
    configSchematics,
} from "./config";
import { setCurrentConversationHistory } from "./conversationHistoryCache";
import { getMemorySeedsPool } from "./memorySession";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { join, basename } from "node:path";
import { isEligibleAssistantMessage } from "./conversationReader";
import { memoryStore } from "./memoryStore";
import { removeMemorySeeds, validateConversationFile, findAllConversationFiles } from "./removeMemorySeeds";

let injectedMemorySeeds: string[] | null = null;
let internalChatID = "";

export async function promptPreprocessor(
    ctl: PromptPreprocessorController,
    userMessage: ChatMessage,
): Promise<string | ChatMessage> {

    const memoriesDirectory =
        await memoryStore.getMemoriesDirectory();

    const config =
        ctl.getPluginConfig(configSchematics);

    const memorySeedsSelected =
        config.get("memorySeedsSelected") as string[];
        
    const memorySeedsPool =
        getMemorySeedsPool();

    const history =
        await ctl.pullHistory();

    let conversationFileName =
        config.get("conversationFileName") as string;

    await setCurrentConversationHistory(history);

    // Cleaning up whitespaces only, not mispellings
    // like memory.jsonte just for the first validation check
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
    // as the source of truth
    // added second check to catch bug when the array is empty at future turns
    if (injectedMemorySeeds === null || injectedMemorySeeds.length > 0) {

        injectedMemorySeeds = [];

        for (
            const message
            of history.getMessagesArray()
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
                    !injectedMemorySeeds.includes(
                        memorySeed,
                    )
                ) {
                    injectedMemorySeeds.push(
                        memorySeed,
                    );
                }
            }
        }
    }

    // Find selected memory seeds that have not already been injected.
    const newMemorySeeds =
        validMemorySeedsSelected.filter(
            (memorySeed) =>
                !injectedMemorySeeds!.includes(
                    memorySeed,
                ),
        );

    
    // We have new valid seeds waiting to be injected
    // need to know conversationfilename before this
    let injectedContext = "";

    if ( newMemorySeeds.length > 0 ) {

        injectedContext = "THIS IS INJECTED CONTEXT FROM A PRIOR CONVERSATION:\n\n";

        // Going to grab the contents of the seed we're going to inject
        // then build it into a string that the model can digest as
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
            injectedContext +=
                `[BEGIN ${memorySeed}]\n`;

            injectedContext +=
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
                injectedContext +=
                    `TOPIC_${topicNumber}: ${rootInput}\n`;

                for (
                    const seed
                    of topicSeeds
                ) {
                    injectedContext +=
                        `USER: ${seed.direct_input}\n`;

                    injectedContext +=
                        `ASSISTANT: ${seed.output}\n\n`;
                }

                topicNumber += 1;
            }

            // indicates the end of the memory block
            injectedContext +=
                `[END ${memorySeed}]\n\n`;

            injectedMemorySeeds.push(
                memorySeed,
            );
        }
    }

    // Very important block: we're using this to tell the model
    // to append message # at the end of the it's response
    // this is for the user to visually and correctly know which
    // message # they must tell the model to call the save memory tool on
    const messages =
        history.getMessagesArray();

    const assistantIndex =
        messages.filter(
            isEligibleAssistantMessage,
        ).length + 1;

    const numberingInstruction =
        `Format requirement: at the end of your response add ***message ${assistantIndex}***.`;

    const userText =
        userMessage.getText();

    // Assign a unique ID for this chat session
    // Check if internalChatID is unknown if so assign one, if exist put it in memory
    // and build out the ChatSessionConversationRelationship.json with the relationship
    let createdNewInternalChatID = false;

    if (internalChatID === "") {
        
        // Search through history for it's existence
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
                    internalChatID = match[1];
                    break;
                }
            }

            if (internalChatID !== "") {
                break;
            }
        }

        // History did not show it so now we give it one
        if (internalChatID === "") {
            internalChatID = Date.now().toString();
            createdNewInternalChatID = true;
        }
    }

    // Do we know the associated conversation file name yet?
    // If not we look into the ChatSessionConversationRelationship.json first to see
    // if there is already an established relationship.
    // If we find a relationship that matches the internalChatID we grab the conversationFileIdentifier
    if(conversationFileName === "") {

        let relationships: any[] = [];

        const rootDirectory = await memoryStore.getRootDirectory();

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

            setConfigSchematics([], injectedMemorySeeds, conversationFileIdentifier);

            conversationFileName = conversationFileIdentifier;
            
        }

        // If we found the the InternalChatID but did not find an entry in our relationships.json
        // we have to go find the matching conversation and populate the relationship.json
        // or if the internalID was not found in either history messages or the relationship.json
        // Now we grab all the files in conversation folder to try and figure out which
        // conversation file belongs to this chat
        if (createdNewInternalChatID || (existingRelationship === undefined && internalChatID !== "")) {
            const allConversationFiles = await findAllConversationFiles(conversationDirectory);
            let matchingConversationFile: string | null = null;

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

            // creating the relationship file
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
                await writeFile(
                    relationshipFile,
                    JSON.stringify(relationships, null, 2),
                    "utf-8",
                );
            }
        }
    }

    // We are now going to remove memory seeds the user no longer wants
    // This first null check is just to make sure we're not wastefully calling removeMemorySeeds()
    if (injectedMemorySeeds !== null) {

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

            await removeMemorySeeds(conversationFileName, removedMemorySeeds, messages, config);

            // need to set injectedMemorySeeds to match what's actually
            // available rather than use processing power to do another scan of history
            // the actual update of the .config is delayed to work around lmstudio's lack of support
            // so injectedMemorySeeds will just update on it's own and assume the
            // .config will match later when assistant is done responding
            const currentMemorySeedsSelected = config.get("memorySeedsSelected") as string[];
            const updatedMemorySeedsSelected =
                    currentMemorySeedsSelected.filter(
                        (memorySeed) => !removedMemorySeeds.includes(memorySeed),
                    );
            injectedMemorySeeds = updatedMemorySeedsSelected;
        }
        
    }

    if (injectedContext) {
        return (
            `${createdNewInternalChatID? `[InternalChatID: ${internalChatID}] ` : ""}` +
            `${injectedContext}\n` +
            `${userText}\n` +
            `${numberingInstruction}`
        );
    }

    return (
        `${createdNewInternalChatID? `[InternalChatID: ${internalChatID}] ` : ""}` +
        `${userText}\n` +
        `${numberingInstruction}`
    );
}