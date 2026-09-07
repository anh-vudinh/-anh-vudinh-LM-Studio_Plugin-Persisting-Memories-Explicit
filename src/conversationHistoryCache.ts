import type { Chat } from "@lmstudio/sdk";

/**
 * The currently active LM Studio conversation history.
 *
 * The prompt preprocessor updates this immediately before each generation.
 * Tools can then read the same conversation while the model is executing
 * a tool call during that generation.
 *
 * We deliberately keep this in memory only. The LM Studio conversation
 * itself remains the source of truth.
 */
let currentHistory: Chat | null = null;

export async function setCurrentConversationHistory(history: Chat): Promise<void> {
    currentHistory = history;
}

export async function getCurrentConversationHistory(): Promise<Chat> {
    if (!currentHistory) {
        throw new Error(
            "No active conversation history is available. " +
            "The Memory Seed plugin must receive conversation history " +
            "from LM Studio before a memory operation can be performed.",
        );
    }

    return currentHistory;
}

export function clearCurrentConversationHistory(): void {
    currentHistory = null;
}