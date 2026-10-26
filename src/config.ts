import { createConfigSchematics } from "@lmstudio/sdk";
import { normalizeJsonFileName } from "./promptPreprocessor"
import type { PromptPreprocessorController } from "@lmstudio/sdk";

// ============================================================
// TOM Command States
// ============================================================

// Status:
// Incomplete = pending TOM command not yet done
// Null = no TOM command default state
// Ready = valid and queued
export type PendingTomCommandStatus = "incomplete" | "null" | "ready";

let pendingTomCommand: PendingTomCommandStatus = "null";

export function getPendingTomCommand(): PendingTomCommandStatus {
    return pendingTomCommand;
}

export function setPendingTomCommand(
    value: PendingTomCommandStatus,
): void {
    pendingTomCommand = value;
}

export const TOM_RANGES = {
    first: { start: "A", end: "J" },
    second: { start: "K", end: "Q" },
    special: { start: "R", end: "Z" },
} as const;

const tomRangePatterns = Object.values(TOM_RANGES)
    .map(({ start, end }) => {
        return `${start.toLowerCase()}\\s*-?\\s*${end.toLowerCase()}`;
    })
    .join("|");

// ============================================================
// Config Schematics
// ============================================================

let currentMemorySeedsPool: readonly string[] = [];
let currentMemorySeedsSelected: readonly string[] = [];
let currentEngrainCompaction: string = "";

export function createConfig(
    memorySeedsPool: readonly string[],
    memorySeedsSelected: readonly string[],
    engrainCompaction: string,
) {
    return createConfigSchematics()
        .field(
            "enableToolsMode",
            "boolean",
            {
                displayName: "🛠️ Switch to Tool Call Mode?",
                hint: "Explicit Mode is the default. Turning this on allows the assistant to call these functions as tools.\n\n Still handled explicitly: \n - Message # appending \n - Table retractions \n - injected memory seed removal",
            },
            false,
        )
        .field(
            "deleteMemorySeedsFile",
            "string",
            {
                displayName: "🗑️ Delete Memory",
                warning: "This memory will be permanently deleted.",
                hint: "*WARNING* This does not remove already injected memories. This is a final action to permanently delete a memory. \n\n Optional: \n - <category>/*.json will delete the entire category",
                placeholder: "Full name of the memory to delete. Copy/paste from available memories.",
            },
            "",
        )
        .field(
            "memorySeedsPool",
            "stringArray",
            {
                displayName: "Available Memories",
                subtitle: "DISPLAY ONLY: Hover for Save Memory Commands.",
                hint: "Copy/paste full names, including the .json into: \n\n - Memories to Inject \n - Delete Memory \n\n Chat Commands: \n\n Single Save: \n - save memory <message #>; category <category_name>; name <memory_name> \n\n Batch Save: \n - save memory <message #> to <message #>; category <category_name>; name <memory_name> ",
                allowEmptyStrings: false,
            },
            [...memorySeedsPool],
        )
        .field(
            "memorySeedsSelected",
            "stringArray",
            {
                displayName: "🧠 Memories to Inject",
                subtitle: "Injects a memory into context. Copy/paste from available memories.",
                hint: "Only the memories listed will persist through turns. \n\n Optional: \n - <category>/*.json will inject the entire category",
                allowEmptyStrings: false,
            },
            [...memorySeedsSelected]
        )
        .field(
            "summarizeMemorySeeds",
            "boolean",
            {
                displayName: "📝 Summarize Memory Injected",
                subtitle: " Forces a summary of the memory file to be injected rather than the raw user/assistant exchange",
                hint: "This will lessen the context window consumed but may lose details or merge content compared to the full message exchange.",
            },
            false,
        )
        .field(
            "tomNames",
            "stringArray",
            {
                displayName: "📦 Table of Memories",
                subtitle: "DISPLAY ONLY: Hover for TOM commands.",
                hint:`IMPORTANT! \n Make sure you have read the tooltip for Initialize Table of Memories first before using this feature. \n\n Chat Commands: \n 1) fetch the memory table <table name> (TOM_LOOKUP) \n\n 2) recall a memory about <insert specifics> (FUZZY_RECALL) \n\n 3) fetch the memory <category>/<name>.json (DIRECT_LOOKUP) \n\n 4) fetch the memories <category>/*.json (FULL_CAT_FETCH) \n\n Shorthand: \n - tom${(TOM_RANGES.first.start + TOM_RANGES.first.end).toLowerCase()}, tom${(TOM_RANGES.second.start + TOM_RANGES.second.end).toLowerCase()}, tom${(TOM_RANGES.special.start + TOM_RANGES.special.end).toLowerCase()}`,
                allowEmptyStrings: false,
            },
            [`TOM_${TOM_RANGES.first.start}-${TOM_RANGES.first.end}`, `TOM_${TOM_RANGES.second.start}-${TOM_RANGES.second.end}`, `TOM_${TOM_RANGES.special.start}-${TOM_RANGES.special.end}`]
        )
        .field(
            "initializeTOM",
            "boolean",
            {
                displayName: "⚙️ Initialize Table of Memories",
                subtitle: " *WARNING* Do not leave enabled. Hover for details.",
                hint: "This is to create the table of memories files for this plugin. Turn it on and send any user message. Turn it off after the message is sent. \n\n Leave it off by default unless your scenerio matches one condition: \n 1) You have never initialized the memory tables before. \n 2) You suspect that your TOM files/contents need repair. \n\n Leave this OFF once the table has been initialized It is expensive to run if you have many memories.",
            },
            false,
        )
        .field(
            "retractOldToms",
            "numeric",
            {
                displayName: "↩️ Retract TOM & TOC older than <N> turns",
                hint: "Retroactively frees up your context window from being burdended by TOM & TOC tables that you've already consumed. Excludes the latest assistant turn. \n\n - Off = 0 \n\n - Max = 10 ",
                int: true,
                min: 0,
                max: 10,
            },
            0
        )
        .field(
            "deleteTocCollectionsAfterNthDays",
            "numeric",
            {
                displayName: "🔥 Delete Compactions older than <N> days",
                subtitle: "XPlugin Feature: Hover for details.",
                hint: "REQUIRES the companion plugin Context Cleanup rev8+ from LM Studio or v4.0+ from Github. \n\n  All compactions older than the stated days will be deleted. \n\n This uses the TOC_Collections files to determine which compacitons to expire. This is for those who wish to not have to manually prune compactions. \n\n - Off = 0 \n\n - Max = 15 \n\n If a Compaction's contents are important to you, make it permanent using 🌱 Compaction ➠ Memory Seed.",
                int: true,
                min: 0,
                max: 15,
            },
            0
        )
        .field(
            "engrainCompaction",
            "string",
            {
                displayName: "🌱 Compaction ➠ Memory Seed",
                subtitle: "XPlugin Feature: Hover for details.",
                warning: "REQUIRES the companion plugin Context Cleanup rev8+ enabled.",
                hint: "REQUIRES the companion plugin Context Cleanup rev8+ from LM Studio or v4.0+ from Github. \n\n Converts a single compaction into a memory seed (one-time | Readme for specifics). \n\n <name_c#_p#.json> >> <category>/<name>.json \n\n Use >> specifically to separate the compaction seed from the memory seed. \n\n\n **Chat Commands:** \n - list compaction seeds \n - fetch compaction <name_c#_p#.json>",
                placeholder: "name_c#_p#.json >> category/name.json",
            },
            engrainCompaction,
        )
        .build();
}

export let configSchematics = createConfig(
    currentMemorySeedsPool,
    currentMemorySeedsSelected,
    currentEngrainCompaction,
);

export function setConfigSchematics({
    memorySeedsPool,
    memorySeedsSelected,
    engrainCompaction,
}: {
    memorySeedsPool?: readonly string[];
    memorySeedsSelected?: readonly string[];
    engrainCompaction?: string;
}): void {
    if (memorySeedsPool !== undefined) {
        currentMemorySeedsPool = memorySeedsPool;
    }

    if (memorySeedsSelected !== undefined) {
        currentMemorySeedsSelected = memorySeedsSelected;
    }

    if (engrainCompaction != undefined) {
        currentEngrainCompaction = engrainCompaction;
    }

    configSchematics = createConfig(
        currentMemorySeedsPool,
        currentMemorySeedsSelected,
        currentEngrainCompaction,
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

export function takeConversationOperations(): ConversationOperation[] {
    const operations = [...conversationOperations];
    conversationOperations = [];
    return operations;
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

const TABLE_OF_MEMORIES_REGEX = new RegExp(
    String.raw`\b(?:table|tbl|tble|tabel|tables)\s*(?:of\s*)?(?:memories|memory|mem|mm|mmry|memry|mry|mmy|memy|mems)|(?:memories|memory|mem|mm|mmry|memry|mry|mmy|memy|mems)\s*(?:table|tbl|tble|tabel|tables)|\btom[_\s-]*(?:${tomRangePatterns})\b`,
    "i",
);

// Second check to extract the alphabet range of tom file
const MEMORY_RANGE_REGEX =
    /\b(?:tom\s*[_-]?\s*|(?:table|tbl|tble|tabel|tables)\s*(?:of\s*)?(?:memories|memory|mem|mm|mmry|memry|mry|mmy|memy|mems)\s*|(?:memories|memory|mem|mm|mmry|memry|mry|mmy|memy|mems)\s+(?:table|tbl|tble|tabel|tables)\s*)([a-z]\s*-?\s*[a-z])\b/i;

// Both "lookup phrase" and "memory phrase" must be present, they may be up to 5 words apart
// The ordering of the fetch phrase and memory phrase can be reversed
// The model will be asked to interpret your query
const FUZZY_SEARCH_MEMORY_REGEX =
    /\b(?:(?:search|serch|srch|searching|find|fnd|look|lok|looking|fetch|fetsh|retrieve|retrive|retreive|recall|locate|lcoate|remember|rember|recollect|recollecting|get|grab|pull)\b(?:\W+\w+){0,5}\W+\b(?:memory|memories|mem|mm|mmry|memry|mry|mmy|memy|mems)\b|(?:memory|memories|mem|mm|mmry|memry|mry|mmy|memy|mems)\b(?:\W+\w+){0,5}\W+\b(?:search|serch|srch|searching|find|fnd|look|lok|looking|fetch|fetsh|retrieve|retrive|retreive|recall|locate|lcoate|remember|rember|recollect|recollecting|get|grab|pull)\b)/i;

// Need a "fetch phrase" + "memory phrase" + "category/name.json".
// The ordering of the fetch phrase and memory phrase can be reversed
const DIRECT_FETCH_MEMORY_REGEX =
    /\b(?:(?:fetch|fetsh|retrieve|retrive|retreive|get|grab|pull)\b(?:\W+\w+){0,3}\W+\b(?:memory|memories|mem|mm|mmry|memry|mry|mmy|memy|mems)?\b|(?:memory|memories|mem|mm|mmry|memry|mry|mmy|memy|mems)?\b(?:\W+\w+){0,3}\W+\b(?:fetch|fetsh|retrieve|retrive|retreive|get|grab|pull)\b)\W+(?:[^/\\*]+|\*)\/(?:[^/\\*]+|\*)\.json\b/i;

const COMPACTION_SUMMARY_REGEX =
    /\b(?:(?:fetch|fetsh|retrieve|retrive|retreive|get|grab|pull)\b(?:\W+\w+){0,3}\W+(?:compaction|compacton|compact|campaction|campactun|compactun|compacten|compactions|comp)?|(?:compaction|compacton|compact|campaction|campactun|compactun|compacten|compactions|compact)?\b(?:\W+\w+){0,3}\W+(?:fetch|fetsh|retrieve|retrive|retreive|get|grab|pull))\W+[\w -]+_c\d+_p\d+\.json\b/i;

const COMPACTION_KEYWORD_REGEX =
    /\b(?:fetch|fetsh|retrieve|retrive|retreive|get|grab|pull|compactions|compaction|compacton|campaction|campactun|compactun|compacten|compact|comp)\b/ig;

const LIST_COMPACTION_SEEDS_REGEX =
    /\blist\b(?:\W+\w+){0,3}\W+\b(?:compaction|compacton|compact|campaction|campactun|compactun|compacten|compactions|compacts|campactions|campactuns|compactuns|compactens|comp)?s?\b\W+\bseeds?\b/i;

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

export function getTableOfMemoriesRegex(): RegExp {
    return TABLE_OF_MEMORIES_REGEX;
}

export function getMemoryRangeRegex(): RegExp {
    return MEMORY_RANGE_REGEX;
}

export function getFuzzySearchRegex(): RegExp {
    return FUZZY_SEARCH_MEMORY_REGEX;
}

export function getDirectFetchRegex(): RegExp {
    return DIRECT_FETCH_MEMORY_REGEX;
}

export function getCompactionSummaryRegex(): RegExp {
    return COMPACTION_SUMMARY_REGEX;
}

export function getCompactionKeywordRegex(): RegExp {
    return COMPACTION_KEYWORD_REGEX;
}

export function getListCompactionSeedsRegex(): RegExp {
    return LIST_COMPACTION_SEEDS_REGEX;
}

// ============================================================
// LM STUDIO ROOT DIRECTORY OVERRIDE
// ============================================================

let validatedLMSRootDirectory = "";
let validatedConversationRootDirectory = "";
let validatedMemoriesRootDirectory = "";

export function setValidatedLMSRootDirectory(value: string): void {
  validatedLMSRootDirectory = value;
}

export function getValidatedLMSRootDirectory(): string {
  return validatedLMSRootDirectory;
}

export function setValidatedConversationRootDirectory(value: string): void {
  validatedConversationRootDirectory = value;
}

export function getValidatedConversationRootDirectory(): string {
  return validatedConversationRootDirectory;
}

export function setValidatedMemoriesRootDirectory(value: string): void {
  validatedMemoriesRootDirectory = value;
}

export function getValidatedMemoriesRootDirectory(): string {
  return validatedMemoriesRootDirectory;
}

// ============================================================
// TOM Last Retracted Index
// ============================================================

let lastKnownIndexOfRetractedToms: number | null = null;

export function setLastKnownIndexOfRetractedToms(value: number | null): void {
  lastKnownIndexOfRetractedToms = value;
}

export function getLastKnownIndexOfRetractedToms(): number | null {
  return lastKnownIndexOfRetractedToms;
}

// ============================================================
// Compaction
// ============================================================

let contextCleanupPluginInUse: boolean | null = null;
// let contextCleanupConversationName = "";

export function setContextCleanupPluginInUse(value: boolean | null): void {
  contextCleanupPluginInUse = value;
}

export function getContextCleanupPluginInUse(): boolean | null {
  return contextCleanupPluginInUse;
}

// export function setContextCleanupConversationName(value: string): void {
//   contextCleanupConversationName = value;
// }

// export function getContextCleanupConversationName(): string {
//   return contextCleanupConversationName;
// }