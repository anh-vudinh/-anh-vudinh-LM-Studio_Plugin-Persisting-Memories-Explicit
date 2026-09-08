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
                    .replace(/\.json.*$/i, ".json"),
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

    const hasConversationMessage =
        history
            .getMessagesArray()
            .some(
                (message) =>
                    message.isUserMessage() ||
                    message.isAssistantMessage(),
            );

    console.log(
        "[MEMORY TEST] hasConversationMessage:",
        hasConversationMessage,
    );

    console.log(
        "[MEMORY TEST] selected:",
        validMemorySeedsSelected,
    );

    if (
        validMemorySeedsSelected.length > 0
    ) {
        console.log(
            "[MEMORY TEST] APPENDING MEMORY SEEDS",
        );

        for (
            const memorySeed
            of validMemorySeedsSelected
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

            console.log(
                "[MEMORY TEST] appending:",
                memorySeed,
            );

            history.append(
                "user",
                contents,
            );
        }
    }

    console.log(
        "[MEMORY TEST] history AFTER:",
        history.getMessagesArray().map(
            (message, index) => ({
                index,
                role: message.getRole(),
                text: message.getText(),
            }),
        ),
    );

    const messages =
        history.getMessagesArray();

    const assistantIndex =
        messages.filter(
            isEligibleAssistantMessage,
        ).length + 1;

    const numberingInstruction =
        `Format requirement: at the end of only this response add ***message ${assistantIndex}***`;

    return `${userMessage.getText()}\n${numberingInstruction}`;
}