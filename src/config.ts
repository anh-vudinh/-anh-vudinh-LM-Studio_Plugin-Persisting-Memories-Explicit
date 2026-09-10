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
            "memorySeedsSelected",
            "stringArray",
            {
                displayName: "Selected Memories",
                allowEmptyStrings: false,
                warning: "The selected memories will be used in the current session.",
            },
            memorySeedsSelected,
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