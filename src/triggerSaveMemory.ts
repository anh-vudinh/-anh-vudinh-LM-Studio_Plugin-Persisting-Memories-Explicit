import { memoryStore } from "./memoryStore";
import type { MemorySeed } from "./memoryStore";
import { getCurrentConversationHistory } from "./conversationHistoryCache";
import { associateAssistantResponse } from "./memoryAssociation";
import { cleanUserInput } from "./conversationReader"
import type { ChatMessage } from "@lmstudio/sdk";

import {
    addConversationOperation,
    getController,
    setPendingSaveMemory,
    getPendingSaveMemory,
    resetPendingSaveMemory,
    PendingSaveMemory,
    getCategoryExtractRegex,
    getNameExtractRegex,
    getExitSaveMemoryRegex,
    getSaveMemoryRegex,
    getMultiSaveMemoryRegex,
    configSchematics,
} from "./config"

// ============================================================
// KEYWORD REGEXES
// ============================================================

// Save-memory command.
const SAVE_MEMORY_REGEX = getSaveMemoryRegex();

const MULTI_SAVE_MEMORY_REGEX = getMultiSaveMemoryRegex();

const CATEGORY_EXTRACT_REGEX = getCategoryExtractRegex();

const NAME_EXTRACT_REGEX = getNameExtractRegex();

const EXIT_SAVE_MEMORY_REGEX = getExitSaveMemoryRegex();

// ============================================================
// FIELD EXTRACTION
// ============================================================

function extractCategory(segment: string): string | null {
    const match = segment.match(CATEGORY_EXTRACT_REGEX);
    return match?.[1]?.trim() ?? null;
}

// reject wildcard trying to be used as a name
function extractFileName(
    segment: string,
): string | null {

    const match =
        segment.match(NAME_EXTRACT_REGEX);

    const fileName =
        match?.[1]?.trim() ?? null;

    if (
        fileName === "*" ||
        fileName === "*.json"
    ) {
        return null;
    }

    return fileName;
}

// ============================================================
// RESULT TYPES
// ============================================================

interface SaveMemoryResult {
    action: "none" | "waiting" | "saved";

    missing?: {
        memoryNumber: boolean;
        category: boolean;
        fileName: boolean;
    };

    current?: {
        memoryNumber: number | null;
        category: string | null;
        fileName: string | null;
    };
}

// ============================================================
// MAIN MESSAGE PROCESSOR
// ============================================================

export async function processMessageForSaveMemory(
    userText: string,
    messages: ChatMessage[],
    enableToolsMode: boolean,
): Promise<SaveMemoryResult | null> {

    // --------------------------------------------------------
    // Check whether this message contains an exit command
    // --------------------------------------------------------

    const exitMatch = userText.match(EXIT_SAVE_MEMORY_REGEX);
    
    const exitRequested = exitMatch !== null? true : false;

    if (enableToolsMode && exitRequested) {
        resetPendingSaveMemory();
    }

    // Early exit to not process userText other than an exit command
    // Everything else should be handled by the assistant
    if (enableToolsMode) {
        return null;
    }

    if (!enableToolsMode) {
        // If the last assistant message was an incomplete save command, and the plugin/chat timed out before completion
        // we re-enable the save memory mode as the assistant's next message.
        const reinitializedIncompletedSaveCommand = await scanHistoryForIncompleteSaveMemoryCommand(userText, messages);

        if(reinitializedIncompletedSaveCommand) {
            userText = exitRequested
            ? userText 
            : reinitializedIncompletedSaveCommand;
        }
    }

    // --------------------------------------------------------
    // Check whether this message contains a save-memory command.
    // --------------------------------------------------------

    const saveMatch = userText.match(SAVE_MEMORY_REGEX);

    if (saveMatch) {
        setPendingSaveMemory({
            active: true,
            memoryNumber: Number(saveMatch[1]),
            memoryNumberEndRange: null,
        });
    }

    // --------------------------------------------------------
    // Check whether this message contains a save-memory range of messages command.
    // --------------------------------------------------------

    const multiSaveMatch = userText.match(MULTI_SAVE_MEMORY_REGEX);

    if (multiSaveMatch) {
        const startMemoryNumber = Number(multiSaveMatch[1]);
        const endMemoryNumber = Number(multiSaveMatch[2]);

        setPendingSaveMemory({
            active: true,
            memoryNumber: startMemoryNumber,
            memoryNumberEndRange: endMemoryNumber,
        });
    }

    // --------------------------------------------------------
    // If we're not currently in save-memory mode,
    // don't interpret category/name as save-memory fields.
    // --------------------------------------------------------

    const current = getPendingSaveMemory();

    if (!current.active) {
        return {
            action: "none",
        };
    }

    // --------------------------------------------------------
    // Split fields using the supported delimiters.
    // --------------------------------------------------------

    const segments: string[] = userText
        .split(/[;,.]/)
        .map((segment: string) => segment.trim())
        .filter((segment: string) => segment.length > 0);

    // --------------------------------------------------------
    // Process each segment.
    // --------------------------------------------------------

    for (const segment of segments) {

        // ----------------------------------------------------
        // CATEGORY
        // ----------------------------------------------------

        const category = extractCategory(segment);

        if (category !== null) {
            setPendingSaveMemory({
                category,
            });
            continue;
        }

        // ----------------------------------------------------
        // NAME
        // ----------------------------------------------------

        const fileName = extractFileName(segment);

        if (fileName !== null) {
            setPendingSaveMemory({
                fileName,
            });
            continue;
        }
    }

    // Get updated state
    const updated = getPendingSaveMemory();

    // ========================================================
    // DETERMINE WHAT IS STILL MISSING
    // ========================================================

    const missing = {
        memoryNumber: updated.memoryNumber === null,
        category: updated.category === null,
        fileName: updated.fileName === null,
    };


    // ========================================================
    // EVERYTHING IS PRESENT (Multi Seed Save)
    // ========================================================

    if (
        updated.memoryNumber !== null &&
        updated.category !== null &&
        updated.fileName !== null &&
        updated.memoryNumberEndRange !== null
    ) {
        const savedMemoryStatus = await multiSaveMemory(updated);

        await appendSaveMemoryTextAtEndOfConversationJson(exitRequested, updated, enableToolsMode, savedMemoryStatus);

        return {
            action: "saved",
        };
    }

    // ========================================================
    // EVERYTHING IS PRESENT (Single Seed Save)
    // ========================================================

    if (
        updated.memoryNumber !== null &&
        updated.category !== null &&
        updated.fileName !== null &&
        updated.memoryNumberEndRange === null
    ) {
        const savedMemoryStatus = await saveMemory(updated);

        await appendSaveMemoryTextAtEndOfConversationJson(exitRequested, updated, enableToolsMode, savedMemoryStatus);

        return {
            action: "saved",
        };
    }

    // ========================================================
    // STILL WAITING FOR SOMETHING
    // ========================================================
    
    await appendSaveMemoryTextAtEndOfConversationJson(exitRequested, updated, enableToolsMode);

    return {
        action: "waiting",

        missing,

        current: {
            memoryNumber: updated.memoryNumber,
            category: updated.category,
            fileName: updated.fileName,
        },
    };
}

/**
 * Flow is prompt preprocessor → appendSaveMemoryTextAtEndOfConversationJson → multiEditCoordinator
 * → tryAppendSaveMemoryTextAtEndOfConversationJsonFunction → string constructors → editAssistantResponse →
 * (all fields given) → saveMemory → appendSaveMemoryTextAtEndOfConversationJson → tryAppendSaveMemoryTextAtEndOfConversationJsonFunction
 * → multiEditCoordinator(conversation.json write)
 */
async function appendSaveMemoryTextAtEndOfConversationJson(
    exitRequested: boolean,
    pendingSaveMemory: PendingSaveMemory,
    enableToolsMode: boolean,
    savedMemoryStatus?: boolean,
): Promise<void> {

    if (enableToolsMode) return;
    // Queuing save memory logic to write conversation.json
    // Passing params required by children functions over
    addConversationOperation(
        "tryAppendSaveMemoryTextAtEndOfConversationJsonFunction",
        {
            exitRequested,
            pendingSaveMemory,
            savedMemoryStatus,
        },
    );

    setPendingSaveMemory({active: true});

    //=================================================
    // CODE NOW RUNS FROM multiEditCoordinator.ts
    //=================================================
}

/**
 * multiEditCoordinator calls this function
 */
export async function tryAppendSaveMemoryTextAtEndOfConversationJsonFunction(
    exitRequested: boolean,
    latestConversation: any,
    pendingSaveMemory: PendingSaveMemory,
    targetAssistantMessageIndex: number,
    savedMemoryStatus?: boolean,
): Promise<void> {

    let lines: string[] = [];

    // Exit Save Memory State
    if(exitRequested === true) {
        lines = (await constructAssistantReplySaveMemoryExit(pendingSaveMemory));
    } else {
        // Category or File Name fields missing path
        if(
            pendingSaveMemory.category === null ||
            pendingSaveMemory.fileName === null
        ) {
            lines = (await constructAssistantReplyForMissingFields(pendingSaveMemory));
        }

        // Saving Memory Success path
        if(pendingSaveMemory.category !== null &&
            pendingSaveMemory.fileName !== null) {
            lines = (await constructAssistantReplySaveMemory(pendingSaveMemory));
        }

        // Saving process failed path
        if (savedMemoryStatus === false) {
            lines = (await constructAssistantReplySaveMemoryNothingToSave(pendingSaveMemory));
        }
    }
    
    await editAssistantResponse(
        latestConversation,
        lines.join("\n\n"),
        targetAssistantMessageIndex,
    );
}

export async function editAssistantResponse(
    conversation: any,
    replacementText: string,
    targetAssistantMessageIndex: number,
    appendInstead?: boolean,
): Promise<void> {

    // Find the last assistant message
    const assistantMessage = conversation.messages[targetAssistantMessageIndex];

    if (!assistantMessage) {
        throw new Error("No assistant message found.");
    }

    // Get the last version
    const assistantVersion =
        assistantMessage?.versions?.[
            assistantMessage.currentlySelected ?? 0
        ];
        
    if (!assistantVersion) {
        throw new Error("Assistant message has no versions.");
    }

    // Remove thinking steps
    assistantVersion.steps = assistantVersion.steps.filter(
        (step: any) => step.style?.type !== "thinking",
    );

    // Find the assistant response step
    const responseStep = assistantVersion.steps.find(
        (step: any) =>
            step.type === "contentBlock" &&
            step.genInfo !== undefined &&
            step.content?.some(
                (contentBlock: any) => contentBlock.type === "text",
            ),
    );

    if (!responseStep) {
        throw new Error("Could not find assistant response step.");
    }

    // Find the actual text content block
    const textBlock = responseStep.content.find(
        (contentBlock: any) => contentBlock.type === "text",
    );

    if (!textBlock) {
        throw new Error("Could not find assistant response text.");
    }

    // Appended instead was originally made for the compaction trail, but I've taken a different
    // approach and this current logic currently has no users, but will be left for maybe somewhere
    // in the future something needs to be appended directly to the assistant's message.
    if (appendInstead) {
        const startMarker = textBlock.text.indexOf("🚨");
        const endMarker = textBlock.text.indexOf(
            "⬇️[Assistant Message]⬇️",
            startMarker,
        );

        if (startMarker !== -1 && endMarker !== -1) {
            textBlock.text =
                textBlock.text.slice(0, startMarker) +
                textBlock.text.slice(
                    endMarker + "⬇️[Assistant Message]⬇️".length,
                );
        }

        textBlock.text = textBlock.text
            ? `${replacementText}\n\n${textBlock.text}`
            : replacementText;
    } else {
        // Replace the assistant's response
        textBlock.text = replacementText;
    }
}

export async function saveMemory(
    updated: PendingSaveMemory
): Promise<boolean> {
    const ctl = getController();
    const enableToolsMode = ctl.getPluginConfig(configSchematics).get("enableToolsMode") as boolean;

    const { memoryNumber, category, fileName } = updated;

    if (
        memoryNumber === null ||
        category === null ||
        fileName === null
    ) return false;

    try {
        const history = await getCurrentConversationHistory();

        const association = await associateAssistantResponse(
            ctl.client,
            history,
            memoryNumber,
        );

        // Do not save memory if assistant message was metadata only
        if (association === null) {
            return false;
        }

        // Added some tolerance because users technically could delete all
        // their user messages before asking the model to save a memory
        const cleanedRootInput =
            cleanUserInput(association.rootInput?.trim());

        const rootInput = cleanedRootInput !== ""
            ? cleanedRootInput
            : "original user intention/topic was fully scrubbed";

        const cleanedDirectInput =
            cleanUserInput(association.directInput?.trim());

        const directInput = cleanedDirectInput !== ""
            ? cleanedDirectInput
            : "original user message was fully scrubbed";

        await memoryStore.saveSeed(
            category,
            fileName,
            {
                date: new Date().toISOString(),
                root_input: rootInput,
                direct_input: directInput,
                output: association.assistantResponse,
            },
            memoryNumber,
        );
        if(!enableToolsMode) {
            // Write to conversation.json a save message content block
            await appendSaveMemoryTextAtEndOfConversationJson(false, updated, enableToolsMode);
        }

        return true;

    } catch (error) {
        console.error(
            "Error creating Memory Seed: " +
            `${error instanceof Error ? error.message : String(error)}`
        );

        return false;

    } finally {
        resetPendingSaveMemory();
    }
}

// simple boolean return true success if something saved, false failure because messages were ineligible
export async function multiSaveMemory(
    updated: PendingSaveMemory,
): Promise<boolean> {
    const ctl = getController();
    const enableToolsMode = ctl.getPluginConfig(configSchematics).get("enableToolsMode") as boolean;

    const {
        memoryNumber: startMemoryNumber,
        memoryNumberEndRange: endMemoryNumber,
        category,
        fileName,
    } = updated;

    if (
        startMemoryNumber == null ||
        endMemoryNumber == null ||
        category == null ||
        fileName == null
    ) {
        return false;
    }

    try {
        const history = await getCurrentConversationHistory();
        
        const seeds: MemorySeed[] = [];

        for (
            let memoryNumber = startMemoryNumber;
            memoryNumber <= endMemoryNumber;
            memoryNumber++
        ) {
            let association;

            try {
                association = await associateAssistantResponse(
                    ctl.client,
                    history,
                    memoryNumber,
                );
            } catch (error) {
                console.error(
                    `Failed to associate assistant response ${memoryNumber}; skipping it: ` +
                    `${error instanceof Error ? error.message : String(error)}`,
                );

                // Skip this memory number and continue with the next.
                continue;
            }

            // Assistant response was metadata only.
            if (association === null) {
                continue;
            }

            const cleanedRootInput = cleanUserInput(association.rootInput?.trim());

            const cleanedDirectInput = cleanUserInput(association.directInput?.trim());

            // User input was metadata only.
            if (isMetadataOnlyInput(cleanedDirectInput)) {
                continue;
            }

            // Both root and direct inputs are usable.
            if (
                cleanedRootInput !== "" &&
                cleanedDirectInput !== ""
            ) {
                seeds.push({
                    date: new Date().toISOString(),
                    root_input: cleanedRootInput,
                    direct_input: cleanedDirectInput,
                    output: association.assistantResponse,
                });
            } else if (
                cleanedRootInput === "" &&
                cleanedDirectInput !== ""
            ) {
                // Use DirectInput as a placeholder for RootInput.
                seeds.push({
                    date: new Date().toISOString(),
                    root_input: cleanedDirectInput,
                    direct_input: cleanedDirectInput,
                    output: association.assistantResponse,
                });
            }
        }

        // No eligible seeds were collected.
        if (seeds.length === 0) {
            return false;
        }

        // Save all collected seeds in one write operation.
        await memoryStore.saveMultipleSeeds(
            category,
            fileName,
            seeds,
            startMemoryNumber,
        );

        if(!enableToolsMode) {
            await appendSaveMemoryTextAtEndOfConversationJson(false, updated, enableToolsMode);
        }

        return true;

    } catch (error) {
        console.error(
            "Error creating Memory Seed: " +
            `${error instanceof Error ? error.message : String(error)}`,
        );

        return false;
    } finally {
        resetPendingSaveMemory();
    }
}

/**
 * Constructors for the Save Memory Message strings
 * For Missing Fields - Successful memory save - Save memory early abort
 */
export async function constructAssistantReplySaveMemory(
    pendingSaveMemory: PendingSaveMemory,
): Promise<string[]>{
    
    const lines: string[] = [];

    lines.push(
        '⏳ **`SAVE MEMORY MODE`**'
    );

    lines.push(
        `✅ **[ Message ${pendingSaveMemory.memoryNumber}${pendingSaveMemory.memoryNumberEndRange !== null? ` — ${pendingSaveMemory.memoryNumberEndRange}` : ""} ]**`+
        ` was successfully saved as ***${pendingSaveMemory.category}/${pendingSaveMemory.fileName}.json***`
    );

    return lines;
}

export async function constructAssistantReplyForMissingFields(
    pendingSaveMemory: PendingSaveMemory,
): Promise<string[]>{
    
    const lines: string[] = [];

    lines.push(
        '⏳ **`SAVE MEMORY MODE`**'
    );

    lines.push(
        '**Please provide the following missing information with its required prefix:**'
    );

    if (pendingSaveMemory.category === null) {
        lines.push(
            '❌ Category Name: `category <category_here>`.',
        );
    }

    if (pendingSaveMemory.fileName === null) {
        lines.push(
            '❌ Memory Name: `name <name_here>`.',
        );
    }

    if (
        pendingSaveMemory.category === null &&
        pendingSaveMemory.fileName === null
    ) {
        lines.push(
            '*To provide both together, you may use [ `;`  `,`  `.` ] to separate the missing parameters.*',
        );
        lines.push(
            '**Example:** `category <name_here>; name <name_here>`',
        );
    }

    lines.push(
        '⚠️ *To forcefully end this save memory attempt say:* `exit save memory`'
    );

    lines.push(
        `✅ *${[
            "known —",
            pendingSaveMemory.memoryNumberEndRange !== null
                ? `Messages: ${pendingSaveMemory.memoryNumber} to ${pendingSaveMemory.memoryNumberEndRange};`
                : `Message: ${pendingSaveMemory.memoryNumber};`,
            pendingSaveMemory.category !== null
                ? `Category: ${pendingSaveMemory.category};`
                : "",
            pendingSaveMemory.fileName !== null
                ? `Name: ${pendingSaveMemory.fileName};`
                : "",
        ]
            .filter(Boolean)
            .join(" ")}*`,
    );
    
    return lines;
}

export async function constructAssistantReplySaveMemoryExit(
    pendingSaveMemory: PendingSaveMemory,
): Promise<string[]>{
    
    const lines: string[] = [];

    lines.push(
        '⏳ **`SAVE MEMORY MODE`**'
    );

    lines.push(
        `🛑${[
            "Exiting Save Memory Request of ***[",
            pendingSaveMemory.memoryNumberEndRange !== null
                ? `Messages: ${pendingSaveMemory.memoryNumber} to ${pendingSaveMemory.memoryNumberEndRange}`
                : `Message: ${pendingSaveMemory.memoryNumber}`,
            "]***",
        ]
            .filter(Boolean)
            .join(" ")}`,
    );

    return lines;
}

export async function constructAssistantReplySaveMemoryNothingToSave(
    pendingSaveMemory: PendingSaveMemory,
): Promise<string[]>{
    
    const lines: string[] = [];

    lines.push(
        '⏳ **`SAVE MEMORY MODE`**'
    );

    lines.push(
        `🛑 ${[
            "Save Memory Request of ***[",
            pendingSaveMemory.memoryNumberEndRange !== null
                ? `Messages: ${pendingSaveMemory.memoryNumber} to ${pendingSaveMemory.memoryNumberEndRange}`
                : `Message: ${pendingSaveMemory.memoryNumber}`,
            "]***",
            "rejected because there is no eligible content.",
        ]
            .filter(Boolean)
            .join(" ")}`,
    );

    return lines;
}

function isMetadataOnlyInput(
    input: string
): boolean {

    // Regexes unified at config.ts
    const CATEGORY_EXTRACT_REGEX = getCategoryExtractRegex();

    const NAME_EXTRACT_REGEX = getNameExtractRegex();

    const EXIT_SAVE_MEMORY_REGEX = getExitSaveMemoryRegex();

    const normalized = input.trim();

    if (
        EXIT_SAVE_MEMORY_REGEX.test(normalized) ||
        input.length <= 1                               // catches anything useless or a single . that was not scrubbed by cleanuserinput
    ) {
        return true;
    }

    const segments = normalized
        .split(/[;,\.]/)
        .map((segment) => segment.trim())
        .filter(Boolean);

    if (segments.length === 0) {
        return false;
    }

    return segments.every(
        (segment) =>
            CATEGORY_EXTRACT_REGEX.test(segment) ||
            NAME_EXTRACT_REGEX.test(segment),
    );
}

/**
 * Returns back if the assistant message had characters associated with
 * the return package of the backend data. Prevents wasting processing power by excluding these matches.
 */
export function isMetadataOnlyOutput(output: string): boolean {
    const prefix = output.slice(0, 8);

    if (
        output.length <= 1 ||
        output.trim() === "Content Retracted" ||
        prefix.includes("📦") ||
        prefix.includes("⏳") ||
        prefix.includes("✅") ||                                // ⏳ should catch first. this is an extra layer for when the assistant generates the response using tools mode it the output may be unreliable
        prefix.includes("❌") ||                                // ⏳ should catch first. this is an extra layer for when the assistant generates the response using tools mode it the output may be unreliable
        prefix.includes("🚨") ||                                // currently unused.
        output.toLowerCase().includes("save memory mode")       // ⏳ should catch first. this is an extra layer for when the assistant generates the response using tools mode it the output may be unreliable
    ) {
        return true;
    }

    return false;
}

/**
 * Scans last assistant message in history for an incompleted save memory command.
 */
export async function scanHistoryForIncompleteSaveMemoryCommand(
    userText: string,
    messages: ChatMessage[],
): Promise<string> {
    // Find the last assistant message
    let lastAssistantMessage: any = null;

    for (let i = messages.length - 1; i >= 0; i--) {
        if ((messages[i] as any).data.role === "assistant") {
            lastAssistantMessage = messages[i];
            break;
        }
    }

    if (!lastAssistantMessage) {
        return "";
    }

    // Extract text from that message only
    const extractedLastAssistantText = (
        lastAssistantMessage.data.content ?? []
    )
        .filter(
            (content: any) =>
                content.type === "text" && content.text,
        )
        .map((content: any) => content.text)
        .join("\n");

    // Only process if the LAST assistant message contains SAVE MEMORY MODE
    if (!extractedLastAssistantText.includes("SAVE MEMORY MODE")) {
        return "";
    }

    const knownMatch = extractedLastAssistantText.match(
        /known\s*—\s*(.+)/i,
    );

    if (!knownMatch) {
        return "";
    }

    const knownParameters = knownMatch[1];

    const messageMatch = knownParameters.match(
        /\bMessages?:\s*(\d+)(?:\s+to\s+(\d+))?\s*;/i,
    );

    const categoryMatch = knownParameters.match(
        /\bCategory:\s*([^;]+)\s*;/i,
    );

    const nameMatch = knownParameters.match(
        /\bName:\s*([^;]+)\s*;/i,
    );

    const memoryNumber = messageMatch?.[1] ?? null;
    const memoryNumberEndRange = messageMatch?.[2] ?? null;
    let category = categoryMatch?.[1]?.trim() ?? null;
    let fileName = nameMatch?.[1]?.trim() ?? null;

    // --------------------------------------------------------
    // Split fields using the supported delimiters.
    // --------------------------------------------------------

    const segments: string[] = userText
        .split(/[;,.]/)
        .map((segment: string) => segment.trim())
        .filter((segment: string) => segment.length > 0);

    // --------------------------------------------------------
    // Process each segment.
    // --------------------------------------------------------

    for (const segment of segments) {

        // ----------------------------------------------------
        // CATEGORY
        // ----------------------------------------------------

        const userLastCategory = extractCategory(segment);

        if (userLastCategory !== null) {
            category = userLastCategory;
            continue;
        }

        // ----------------------------------------------------
        // NAME
        // ----------------------------------------------------

        const userLastFileName = extractFileName(segment);

        if (userLastFileName !== null) {
            fileName = userLastFileName;
            continue;
        }
    }

    return [
        memoryNumberEndRange !== null
            ? `save memory messages ${memoryNumber} to ${memoryNumberEndRange};`
            : memoryNumber !== null
                ? `save memory ${memoryNumber};`
                : "",
        category !== null ? `category ${category};` : "",
        fileName !== null ? `name ${fileName};` : "",
    ]
        .filter(Boolean)
        .join(" ");
}