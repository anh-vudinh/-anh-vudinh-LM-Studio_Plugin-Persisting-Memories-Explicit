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

    const enableSeeding =
        config.get("enableSeeding") as boolean;

    const conversationFileNumber =
        config.get("conversationFileNumber") as number;

    const memorySeedsSelected =
        config.get("memorySeedsSelected") as string[];

    const memorySeedsPool =
        getMemorySeedsPool();

    const history =
        await ctl.pullHistory();

    await setCurrentConversationHistory(history);

    if (!enableSeeding) {

        return userMessage;
    }

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

    console.log(
        "[MEMORY TEST] selected:",
        validMemorySeedsSelected,
    );

    /*
     * Establish the memory seeds that have already been
     * injected into this conversation.
     *
     * We use the existing chat history as the source of truth
     * so this still works if the plugin was disabled and later
     * enabled again.
     */
    if (injectedMemorySeeds === null) {

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
                    memorySeedsPool.includes(
                        memorySeed,
                    ) &&
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

    /*
     * Find only memory seeds that are currently selected
     * but have not already been injected.
     */
    const newMemorySeeds =
        validMemorySeedsSelected.filter(
            (memorySeed) =>
                !injectedMemorySeeds!.includes(
                    memorySeed,
                ),
        );

    let injectedContext = "";

    if (
        newMemorySeeds.length > 0
    ) {
        injectedContext =
            "THIS IS INJECTED CONTEXT FROM A PRIOR CONVERSATION:\n\n";

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

            injectedContext +=
                `[BEGIN ${memorySeed}]\n`;

            injectedContext +=
                `DATE: Between ${earliestDate} - ${latestDate}\n\n`;

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

            injectedContext +=
                `[END ${memorySeed}]\n\n`;

            /*
             * Mark this file as injected only after its
             * context has successfully been built.
             */
            injectedMemorySeeds.push(
                memorySeed,
            );
        }
    }

    const messages =
        history.getMessagesArray();

    const assistantIndex =
        messages.filter(
            isEligibleAssistantMessage,
        ).length + 1;

    const numberingInstruction =
        `Format requirement: at the end of only this response add ***message ${assistantIndex}***`;

    const userText =
        userMessage.getText();

    /*
     * Remove memory seeds that are no longer selected.
     */
    if (injectedMemorySeeds !== null) {

        const removedMemorySeeds =
            injectedMemorySeeds.filter(
                (memorySeed) =>
                    !validMemorySeedsSelected.includes(
                        memorySeed,
                    ),
            );

        console.log(
            "[MEMORY TEST] removed memory seeds:",
            removedMemorySeeds,
        );

        await removeMemorySeeds(conversationFileNumber, removedMemorySeeds, messages);

        console.log(
            "[MEMORY TEST] injected seeds after removal:",
            injectedMemorySeeds,
        );
    }

    /*
     * Assign a unique ID for this chat session
     * Check if internalChatID is unknown if so assign one, if exist put it in memory
     * and build out the ChatSessionConversationRelationship.json
     */
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

        // We look up into the ChatSessionConversationRelationship.json first to see
        // if there is already an established relationship
        // if we find a relationship that matches the internalChatID we grab the conversationFileIdentifier
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
            const conversationFileIdentifier =
                existingRelationship.conversationFile;

            console.log("========here3",conversationFileIdentifier)
        }

        // History did not show it so now we give it one
        if (internalChatID === "") {
            internalChatID = Date.now().toString();
            createdNewInternalChatID = true;
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
                const conversationFileName = basename(
                    matchingConversationFile,
                );
                const conversationFileIdentifier =
                    conversationFileName.endsWith(".conversation.json")
                        ? conversationFileName.replace(
                            ".conversation.json",
                            "",
                        )
                        : conversationFileName.replace(
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