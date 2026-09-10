import { createConfigSchematics } from "@lmstudio/sdk";

export function createConfig(
    memorySeedsPool: string[],
    memorySeedsSelected: string[],
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
            "memorySeedsSelected",
            "stringArray",
            {
                displayName: "Selected Memories",
                subtitle: "Injects a memory into context.",
                allowEmptyStrings: false,
                warning: "Removing a memory purges it from context after the next turn.",
            },
            memorySeedsSelected,
        )
        .field(
            "memorySeedsPool",
            "stringArray",
            {
                displayName: "Available Memories",
                subtitle:
                    "DISPLAY ONLY: Copy names from this list to the Selected Memories text field to use in the current session.",
            },
            memorySeedsPool,
        )
        .field(
            "deleteMemorySeedsFile",
            "string",
            {
                displayName: "Delete Memory",
                subtitle: " This does not remove memories already injected. This removes it from the available pool.",
                warning: "The selected memories will be permenantly deleted.",
                placeholder: "Full name of memory here to delete it from the pool",
            },
            "",
        )
        .build();
}

export let configSchematics = createConfig([], [], "");

export function setConfigSchematics(
    memorySeedsPool: string[],
    memorySeedsSelected: string[],
    conversationFileName: string,
): void {
    configSchematics = createConfig(
        memorySeedsPool,
        memorySeedsSelected,
        conversationFileName,
    );
}