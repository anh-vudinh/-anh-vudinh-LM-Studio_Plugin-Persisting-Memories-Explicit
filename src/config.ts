import { createConfigSchematics } from "@lmstudio/sdk";
import { normalizeJsonFileName } from "./promptPreprocessor"
import type { PromptPreprocessorController } from "@lmstudio/sdk";

let currentMemorySeedsPool: readonly string[] = [];
let currentMemorySeedsSelected: readonly string[] = [];

export function createConfig(
    memorySeedsPool: readonly string[],
    memorySeedsSelected: readonly string[],
) {
    return createConfigSchematics()
        .field(
            "deleteMemorySeedsFile",
            "string",
            {
                displayName: "Delete Memory",
                subtitle: " *WARNING* This does not remove already injected memories. This is a final action to permanently delete a memory.",
                warning: "This memory will be permanently deleted.",
                hint: "Optional: <category/*.json> will delete the entire category.",
                placeholder: "Full name of the memory to delete. Copy/paste from available memories.",
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
);

export function setConfigSchematics({
    memorySeedsPool,
    memorySeedsSelected,
}: {
    memorySeedsPool?: readonly string[];
    memorySeedsSelected?: readonly string[];
}): void {
    if (memorySeedsPool !== undefined) {
        currentMemorySeedsPool = memorySeedsPool;
    }

    if (memorySeedsSelected !== undefined) {
        currentMemorySeedsSelected = memorySeedsSelected;
    }

    configSchematics = createConfig(
        currentMemorySeedsPool,
        currentMemorySeedsSelected,
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

// ============================================================
// SAVE MEMORY STATE
// ============================================================

export interface PendingSaveMemory {
    active: boolean;
    memoryNumber: number | null;
    category: string | null;
    fileName: string | null;
    memoryNumberEndRange: number | null;
}

let pendingSaveMemory: PendingSaveMemory = {
    active: false,
    memoryNumber: null,
    category: null,
    fileName: null,
    memoryNumberEndRange: null,
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
        memoryNumberEndRange: null,
    };
}

let previousSavingState: boolean | null = null;

export function setPreviousTurnSavingState(value: boolean | null): void {
    previousSavingState = value;
}

export function getPreviousTurnSavingState(): boolean | null {
    return previousSavingState;
}

// ============================================================
// Multiple Edit Coordinator
// ============================================================

interface ConversationOperation {
    name: string;
    params: any;
}

let conversationOperations: ConversationOperation[] = [];

export function addConversationOperation(
    name: string,
    params: any,
): void {
    conversationOperations.push({
        name,
        params,
    });
}

export function getConversationOperations(): ConversationOperation[] {
    return conversationOperations;
}

export function clearConversationOperations(): void {
    conversationOperations = [];
}

// ============================================================
// Conversation File Name & ICID States
// ============================================================

let conversationFileName = "";
let internalChatID = "";

export function setConversationFileName(value: string): void {
  conversationFileName = normalizeJsonFileName(value);
}

export function getConversationFileName(): string {
  return conversationFileName;
}

export function setInternalChatID(value: string): void {
  internalChatID = value;
}

export function getInternalChatID(): string {
  return internalChatID;
}

// ============================================================
// Unified REGEX Patterns
// ============================================================
const SAVE_MEMORY_REGEX =
    /\b(?:save|sav|sve|sv|store|remember|persist)\s*(?:memory|mem|mm|mmry|memry|mry|mmy|memy)\s*(?:message|msg)?\s*(\d+)/i;

const MULTI_SAVE_MEMORY_REGEX =
    /\b(?:save|sav|sve|sv|store|remember|persist)\s*(?:memory|mem|mm|mmry|memry|mry|mmy|memy)\s*(?:message|msg|messages|msgs)?\s*(\d+)\s*(?:through|thru|thrugh|thruogh|thorugh|thurogh|to|too)\s*(\d+)/i;

// Make sure this scrubber conforms to the expected words used in the save and multi save memory patterns
const CLEAN_USER_INPUT_SAVE_MEMORY_REGEX =
    /\b(?:save|sav|sve|sv|store|remember|persist)\s*(?:memory|mem|mm|mmry|memry|mry|mmy|memy)\s*(?:message|msg|messages|msgs)?\s*\d+(?:\s*(?:through|thru|thrugh|thruogh|thorugh|thurogh|to|too)\s*\d+)?\s*[;,.]?\s*/gi;

const CATEGORY_EXTRACT_REGEX =
    /^(?:the\s+)?(?:memory|mem|mm|mmry|memry|mry|mmy|memy)?\s*(?:category|categroy|categary|categry|catgry|catagory|catgory|categoy)\b\s+(?:is\s+)?(.+)$/i;

const NAME_EXTRACT_REGEX =
    /^(?:the\s+)?(?:memory|mem|mm|mmry|memry|mry|mmy|memy)?\s*(?:name|nmae|nam|nme)\b\s+(?:is\s+)?(.+)$/i;

const EXIT_SAVE_MEMORY_REGEX =
    /\bexit\b\s+(?:save|sav|sve|sv|store|remember|persist)\b\s+(?:memory|mem|mm|mmry|memry|mry|mmy|memy)\b/i;

export function getSaveMemoryRegex(): RegExp {
    return SAVE_MEMORY_REGEX;
}

export function getMultiSaveMemoryRegex(): RegExp {
    return MULTI_SAVE_MEMORY_REGEX;
}

export function getCategoryExtractRegex(): RegExp {
    return CATEGORY_EXTRACT_REGEX;
}

export function getNameExtractRegex(): RegExp {
    return NAME_EXTRACT_REGEX;
}

export function getExitSaveMemoryRegex(): RegExp {
    return EXIT_SAVE_MEMORY_REGEX;
}

export function getCleanUserInputSaveMemoryRegex(): RegExp {
    return CLEAN_USER_INPUT_SAVE_MEMORY_REGEX;
}