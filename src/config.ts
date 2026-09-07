import { createConfigSchematics } from "@lmstudio/sdk";

export function createConfig(
    memorySeedsPool: string[],
    memorySeedsSelected: string[],
) {
    return createConfigSchematics()
        .field(
            "enableSeeding",
            "boolean",
            {
                displayName: "Enable Seeding?",
            },
            true,
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

export let configSchematics = createConfig([], []);

export function setConfigSchematics(
    memorySeedsPool: string[],
    memorySeedsSelected: string[],
): void {
    configSchematics = createConfig(
        memorySeedsPool,
        memorySeedsSelected,
    );
}