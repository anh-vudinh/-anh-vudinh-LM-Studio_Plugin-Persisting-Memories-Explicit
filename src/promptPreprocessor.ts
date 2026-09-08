import type {
    ChatMessage,
    PromptPreprocessorController,
} from "@lmstudio/sdk";

import { configSchematics } from "./config";

import { setCurrentConversationHistory } from "./conversationHistoryCache";

import { getMemorySeedsPool } from "./memorySession";

import { readFile } from "node:fs/promises";

import path from "node:path";

import { isEligibleAssistantMessage } from "./conversationReader";

import { memoryStore } from "./memoryStore";

let injectedMemorySeeds: string[] | null = null;

export async function promptPreprocessor(
    ctl: PromptPreprocessorController,
    userMessage: ChatMessage,
): Promise<string | ChatMessage> {

    console.log(
        "[MEMORY TEST] promptPreprocessor TRIGGERED",
    );

    const memoriesDirectory =
        await memoryStore.getMemoriesDirectory();

    console.log(
        "[MEMORY TEST] memories directory:",
        memoriesDirectory,
    );

    const config =
        ctl.getPluginConfig(configSchematics);

    const enableSeeding =
        config.get("enableSeeding") as boolean;

    const memorySeedsSelected =
        config.get("memorySeedsSelected") as string[];

    const memorySeedsPool =
        getMemorySeedsPool();

    const history =
        await ctl.pullHistory();

    console.log(
        "[MEMORY TEST] history BEFORE:",
        history.getMessagesArray().map(
            (message, index) => ({
                index,
                role: message.getRole(),
                text: message.getText(),
            }),
        ),
    );

    await setCurrentConversationHistory(history);

    if (!enableSeeding) {
        console.log(
            "[MEMORY TEST] seeding disabled",
        );

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

        console.log(
            "[MEMORY TEST] initialized injected seeds:",
            injectedMemorySeeds,
        );
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

    console.log(
        "[MEMORY TEST] new memory seeds:",
        newMemorySeeds,
    );

    let injectedContext = "";

    if (
        newMemorySeeds.length > 0
    ) {
        console.log(
            "[MEMORY TEST] BUILDING NEW MEMORY SEED CONTEXT",
        );

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

        console.log(
            "[MEMORY TEST] formatted new context:",
            injectedContext,
        );
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

        console.log(
    "[MEMORY TEST] FINAL USER MESSAGE SENT:",
    userText,
);

    console.log(
        "[MEMORY TEST] FINAL PREPROCESSED CONTENT:",
        injectedContext
            ? `${injectedContext}\n${userText}\n${numberingInstruction}`
            : `${userText}\n${numberingInstruction}`,
    );

    console.log(
        "[MEMORY TEST] injectedMemorySeeds:",
        injectedMemorySeeds,
    );

    if (injectedContext) {
        return (
            `${injectedContext}\n` +
            `${userText}\n` +
            `${numberingInstruction}`
        );
    }

    return (
        `${userText}\n` +
        `${numberingInstruction}`
    );
}