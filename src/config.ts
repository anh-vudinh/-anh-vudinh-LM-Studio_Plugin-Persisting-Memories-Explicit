import { createConfigSchematics } from "@lmstudio/sdk";

let currentMemorySeedsPool: readonly string[] = [];
let currentMemorySeedsSelected: readonly string[] = [];
let currentConversationFileName = "";

export function createConfig(
    memorySeedsPool: readonly string[],
    memorySeedsSelected: readonly string[],
    conversationFileName: string,
) {
    return createConfigSchematics()
        .field(
            "conversationFileName",
            "string",
            {
                displayName: "Conversation File Name",
                subtitle:
                    "Required for memory removal. Digits only. The number associated with the conversation.json file for this chat session.",
                nonConfigurable: true,
            },
            conversationFileName,
        )
        .field(
            "deleteMemorySeedsFile",
            "string",
            {
                displayName: "Delete Memory",
                subtitle: " *WARNING* This does not remove already injected memories. This is a final action to permanently delete a memory.",
                warning: "The selected memories will be permanently deleted.",
                placeholder: "Full name the memory to delete. Copy/paste from available memories.",
            },
            "",
        )
        .field(
            "memorySeedsPool",
            "stringArray",
            {
                displayName: "Available Memories",
                subtitle:
                    "DISPLAY ONLY: Copy names from this list to the Selected Memories text field to use in the current session.",
            },
            [...memorySeedsPool],
        )
        .field(
            "memorySeedsSelected",
            "stringArray",
            {
                displayName: "Memories to Inject",
                subtitle: "Injects a memory into context. Copy/paste from available memories.",
                allowEmptyStrings: false,
                warning: "Only the memories listed below will persist through turns.",
            },
            [...memorySeedsSelected]
        )
        .build();
}

export let configSchematics = createConfig(
    currentMemorySeedsPool,
    currentMemorySeedsSelected,
    currentConversationFileName,
);

export function setConfigSchematics({
    memorySeedsPool,
    memorySeedsSelected,
    conversationFileName,
}: {
    memorySeedsPool?: readonly string[];
    memorySeedsSelected?: readonly string[];
    conversationFileName?: string;
}): void {
    if (memorySeedsPool !== undefined) {
        currentMemorySeedsPool = memorySeedsPool;
    }

    if (memorySeedsSelected !== undefined) {
        currentMemorySeedsSelected = memorySeedsSelected;
    }

    if (conversationFileName !== undefined) {
        currentConversationFileName = conversationFileName;
    }

    configSchematics = createConfig(
        currentMemorySeedsPool,
        currentMemorySeedsSelected,
        currentConversationFileName,
    );
}