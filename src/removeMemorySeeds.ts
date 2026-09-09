import { memoryStore } from "./memoryStore";
import { join } from "node:path";
import { ChatMessage } from "@lmstudio/sdk";
import { readdir, writeFile, readFile, stat } from "node:fs/promises";

export async function removeMemorySeeds(
    conversationFileNumber: number,
    seedsToModify: string[],
    history: ChatMessage[],
): Promise<string> {

    const rootDirectory = await memoryStore.getRootDirectory();

    try{
        // Reject 0 or invalid conversation numbers
        if(conversationFileNumber === 0 || conversationFileNumber <= 999999999999){
            return `Error: The conversation file number is either 0 or not valid.`
        }

        // Construct the path to the conversation file
        const conversationDirectory = join(
            rootDirectory,
            "conversations"
        );

        const conversationFile = await findConversationFile(
            conversationDirectory,
            conversationFileNumber
        );
        
        // File existence validation
        if(!conversationFile) {
            return `Conversation file ${conversationFileNumber}.conversation.json not found.`;
        }

        // Prepare json file to be readable and assign to variable
        const conversationJson = await readFile(
            conversationFile,
            "utf-8",
        );

        const conversation = JSON.parse(conversationJson);
        
        // File content fuzzy matches history validation
        if (!await validateConversationFile(conversation, history)){
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

                clearInterval(pollForAssistantUpdate);
            }
        }, 2000);

        return `Conversation file successfully modified.`;

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
    conversationFileName: number,
): Promise<string | null> {
    const targetFileName = `${conversationFileName}.conversation.json`;

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