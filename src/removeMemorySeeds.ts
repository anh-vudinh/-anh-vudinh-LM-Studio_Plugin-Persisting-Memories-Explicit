import { memoryStore } from "./memoryStore";
import { join } from "node:path";
import { readdir, writeFile, readFile, stat } from "node:fs/promises";
import { removeMemorySeedFromSelected, getMemorySeedsSelected, } from "./memorySession";
import { getCurrentConversationHistory } from "./conversationHistoryCache";

import {
    ChatMessage,
    InferParsedConfig,
} from "@lmstudio/sdk";

import {
    setConfigSchematics,
    configSchematics,
} from "./config";

export async function removeMemorySeeds(
    ctlConfig: InferParsedConfig<typeof configSchematics>,
    seedsToModify: string[],
): Promise<string> {

    const rootDirectory = await memoryStore.getRootDirectory();
    const messages = (await getCurrentConversationHistory()).getMessagesArray();
    const conversationFileName = ctlConfig.get("conversationFileName") as string;
    
    try{

        // Reject invalid conversation name
        if(conversationFileName === ""){
            return `Error: The conversation file number is not valid.`
        }

        // Construct the path to the conversation file
        const conversationDirectory = join(
            rootDirectory,
            "conversations"
        );

        const conversationFile = await findConversationFile(
            conversationDirectory,
            conversationFileName
        );
        
        // File existence validation
        if(!conversationFile) {
            return `Conversation file not found in directory.`;
        }

        // Prepare json file to be readable and assign to variable
        const conversationJson = await readFile(
            conversationFile,
            "utf-8",
        );

        const conversation = JSON.parse(conversationJson);
        
        // File content fuzzy matches history validation
        // Is this second validation check necessary? we already validated it before in promptpreprocessor
        // I think this check was redundancy for if I wanted to use this function outside of promptpreprocessor
        if (!await validateConversationFile(conversation, messages)){
            return `Error: The conversation file is not associated with this chat session.`
        }

        // Snapshotting assistantLastMessagedAt field (so watcher knows when model is finished with it's response)
        const originalAssistantLastMessagedAt =
            conversation.assistantLastMessagedAt;

        // Initiated polling until assistantLastMessagedAt value changes
        const pollForAssistantUpdate = setInterval(async () => {
            const latestJson = await readFile(
                conversationFile,
                "utf-8",
            );

            // Get the latest available conversation.json every 2 seconds
            const latestConversation = JSON.parse(latestJson);

            // Wait until the original assistantLastMessagedAt and latest assistantLastMessagedAt no longer match.
            // This is the signal that the model has finished responding
            if (latestConversation.assistantLastMessagedAt !== originalAssistantLastMessagedAt) {

                // User wants to remove memory seeds that were appended through the promptpreprocessor
                // Make sure the preprocessed text exists
                for (const message of latestConversation.messages) {

                    for (const version of message.versions ?? []) {

                        const preprocessedContent = version.preprocessed?.content;

                        if (!preprocessedContent) {
                            continue;
                        }

                        // Loop through each item to see if seeds to remove exist
                        // Based off our structure seeds will always be in the preprocessed content 
                        for (const content of preprocessedContent) {

                            if (content.type !== "text" || !content.text) {
                                continue;
                            }

                            for (const seedName of seedsToModify) {

                                const escapedSeedName = escapeRegExp(seedName);

                                const pattern = new RegExp(
                                    `\\[BEGIN ${escapedSeedName}\\][\\s\\S]*?\\[END ${escapedSeedName}\\]\\s*`,
                                    "g",
                                );

                                const updatedText = content.text.replace(
                                    pattern,
                                    "",
                                );

                                if (updatedText !== content.text) {
                                    content.text = updatedText;
                                }

                                removeMemorySeedFromSelected(seedName);
                            }
                        }
                    }
                }
                // Overwrite the conversation.json without the removed memory seeds.
                await writeFile(
                    conversationFile,
                    JSON.stringify(latestConversation, null, 2),
                    "utf-8",
                );

                // Seed removed success
                console.log(`[removeMemorySeeds] Memory seeds [${seedsToModify.join(", ")}] successfully removed.`)
                
                // update the .config memoryselected
                setConfigSchematics({memorySeedsSelected: getMemorySeedsSelected()});

                clearInterval(pollForAssistantUpdate);
            }
        }, 2000);

        return `Initiated removal of memory seeds ${seedsToModify.join(", ")}.`;

    } catch (error) {

        return `Error modifying conversation file: ${error instanceof Error ? error.message : String(error)}`;
    }
}

/**
 * ------------------------------------------------------------------------
 * Locates the file based on # provided by user
 * ------------------------------------------------------------------------
 */
export async function findConversationFile(
    conversationsDirectory: string,
    conversationFileName: string,
): Promise<string | null> {
    // Fuzzy check if provided name is a unix date/time
    // If it's unix date/time, lm studio default auto assign name
    // append .conversation at the end
    const targetFileName = /^\d{13,14}$/.test(conversationFileName)
    ? `${conversationFileName}.conversation.json`
    : `${conversationFileName}.json`;

    async function searchDirectory(
        directory: string,
    ): Promise<string | null> {
        const entries = await readdir(directory, {
            withFileTypes: true,
        });

        for (const entry of entries) {
            const fullPath = join(directory, entry.name);

            if (entry.isFile() && entry.name === targetFileName) {
                return fullPath;
            }

            if (entry.isDirectory()) {
                const result = await searchDirectory(fullPath);

                if (result) {
                    return result;
                }
            }
        }

        return null;
    }

    const result = await searchDirectory(conversationsDirectory);

    if (!result) {
        return null;
    }

    return result;
}

/**
 * ------------------------------------------------------------------------
 * Validate if the file is the correct one
 * by matching the first user & assistant interaction
 * between history.messagesArray() and the file_number.conversation.json
 * ------------------------------------------------------------------------
 */
export async function validateConversationFile(
    conversation: any,
    history: ChatMessage[]
): Promise<boolean> {
    try {
        const firstUserMessage = conversation.messages.find(
            (message: any) => message.versions?.some(
                (version: any) => version.role === "user"
            )
        );

        const firstAssistantMessage = conversation.messages.find(
            (message: any) => message.versions?.some(
                (version: any) => version.role === "assistant"
            )
        );

        const firstUserMessageText = await extractUserMessageFromConversationJSON(firstUserMessage);
        const firstAssistantMessageText = await extractAssistantMessageFromConversationJSON(firstAssistantMessage);
        
        const firstHistoryUserMessage = history.find(
            (message) => (message as any).data?.role === "user"
        );

        if (!firstHistoryUserMessage) {
            console.error("Could not find the first user message in history.");
            return false;
        }

        const firstHistoryAssistantMessage = history.find(
            (message) => (message as any).data?.role === "assistant"
        );

        if (!firstHistoryAssistantMessage) {
            console.error("Could not find the first assistant message in history.");
            return false;
        }

        const firstHistoryUserText =
            (firstHistoryUserMessage as any).data.content?.find((b: any) => b.type === "text")?.text
                ?.replace(/\n/g, "")
                .trim() ?? "";

        const firstHistoryAssistantText =
            (firstHistoryAssistantMessage as any).data.content
                ?.filter((content: any) =>
                    content.type === "text" &&
                    content.text !== "" &&
                    !content.text.startsWith(
                        "__LM_STUDIO_INTERNAL_LSEP_SYNTHETIC_REASONING_END_"
                    )
                )
                .map((content: any) =>
                    content.text.replace(/\n/g, "").trim()
                )
                .join("") ?? "";

        return (
            firstUserMessageText === firstHistoryUserText &&
            firstAssistantMessageText === firstHistoryAssistantText
        );
    } catch (error) {
        console.error(
            "Error validating conversation file:",
            error,
        );

        return false;
    }
}

async function extractUserMessageFromConversationJSON(
    message: any
): Promise<string> {

    if (!message) {
        return "Could not find the first user message in conversation file.";
    }

    const userVersion = message.versions.find(
        (version: any) => version.role === "user"
    );

    if (!userVersion) {
        return "Could not find the user version in conversation file.";
    }

    const preprocessedText =
        userVersion.preprocessed?.content?.find((b: any) => b.type === "text")?.text
            ?.replace(/\n/g, "")
            .trim() ?? "";

    const contentText =
        userVersion.content?.find((b: any) => b.type === "text")?.text
            ?.replace(/\n/g, "")
            .trim() ?? "";

    const firstUserMessageText =
        preprocessedText !== ""
            ? preprocessedText
            : contentText;

    return firstUserMessageText;
}

async function extractAssistantMessageFromConversationJSON(
    message: any
): Promise <string> {

    if (!message) {
        return "Could not find the first assistant message in conversation file.";
    }

    const assistantVersion = message.versions.find(
        (version: any) => version.role === "assistant"
    );

    if (!assistantVersion) {
        return "Could not find the assistant version in conversation file.";
    }

    const thinkingText =
        assistantVersion.steps?.[0]?.content?.find((b: any) => b.type === "text")?.text
            ?.replace(/\n/g, "")
            .trim() ?? "";

    const responseText =
        assistantVersion.steps?.[1]?.content?.find((b: any) => b.type === "text")?.text
            ?.replace(/\n/g, "")
            .trim() ?? "";

    const firstAssistantMessageText =
        `${thinkingText}${responseText}`;

    return firstAssistantMessageText;
}

function escapeRegExp(text: string): string {
    return text.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&",
    );
}

/**
 * ------------------------------------------------------------------------
 * Finds all conversation files recursively
 * ------------------------------------------------------------------------
 */
export async function findAllConversationFiles(
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