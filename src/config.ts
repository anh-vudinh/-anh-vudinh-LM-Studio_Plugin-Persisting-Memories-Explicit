import { createConfigSchematics } from "@lmstudio/sdk";
import { normalizeJsonFileName } from "./promptPreprocessor"
import type { PromptPreprocessorController } from "@lmstudio/sdk";

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
                subtitle: "Required for memory removal. Digits only. The number associated with the conversation.json file for this chat session.",
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
                warning: "This memory will be permanently deleted.",
                placeholder: "Full name the memory to delete. Copy/paste from available memories.",
            },
            "",
        )
        .field(
            "memorySeedsPool",
            "stringArray",
            {
                displayName: "Available Memories",
                subtitle: "DISPLAY ONLY: To create a new memory type to the assistant: save memory <message_#>; category <cat_name>; name <file_name>",
                hint: "Copy/paste full names to Memories to Inject or Delete Memory fields.",
                allowEmptyStrings: false,
            },
            [...memorySeedsPool],
        )
        .field(
            "memorySeedsSelected",
            "stringArray",
            {
                displayName: "Memories to Inject",
                subtitle: "Injects a memory into context. Copy/paste from available memories.",
                warning: "Only the memories listed below will persist through turns.",
                allowEmptyStrings: false,
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
        currentConversationFileName = normalizeJsonFileName(conversationFileName);
    }

    configSchematics = createConfig(
        currentMemorySeedsPool,
        currentMemorySeedsSelected,
        currentConversationFileName,
    );
}

// ============================================================
// Config Getters sharing access to ctl
// ============================================================

let ctl: PromptPreprocessorController;

export function setController(controller: PromptPreprocessorController): void {
    ctl = controller;
}

export function getController(): PromptPreprocessorController {
    return ctl;
}

// export function setCurrentConversationFileName(value: string): void {
//     currentConversationFileName = value;
// }

export function getCurrentConversationFileName(): string {
    return currentConversationFileName;
}

// ============================================================
// Lock File Origin States
// ============================================================

const lockFileOwnership = new Map<string, boolean | null>();

export function setLockFileOriginatesFromThisPlugin(
    lockFile: string,
    value: boolean | null,
): void {
    lockFileOwnership.set(lockFile, value);
}

export function getLockFileOriginatesFromThisPlugin(
    lockFile: string,
): boolean | null {
    return lockFileOwnership.get(lockFile) ?? null;
}

// ============================================================
// SAVE MEMORY STATE
// ============================================================

export interface PendingSaveMemory {
    active: boolean;
    memoryNumber: number | null;
    category: string | null;
    fileName: string | null;
}

let pendingSaveMemory: PendingSaveMemory = {
    active: false,
    memoryNumber: null,
    category: null,
    fileName: null,
};

export function getPendingSaveMemory(): PendingSaveMemory {
    return { ...pendingSaveMemory };
}

export function setPendingSaveMemory(
    updates: Partial<PendingSaveMemory>,
): void {
    pendingSaveMemory = {
        ...pendingSaveMemory,
        ...updates,
    };
}

export function resetPendingSaveMemory(): void {
    pendingSaveMemory = {
        active: false,
        memoryNumber: null,
        category: null,
        fileName: null,
    };
}

let previousSavingState: boolean | null = null;

export function setPreviousTurnSavingState(value: boolean | null): void {
    previousSavingState = value;
}

export function getPreviousTurnSavingState(): boolean | null {
    return previousSavingState;
}