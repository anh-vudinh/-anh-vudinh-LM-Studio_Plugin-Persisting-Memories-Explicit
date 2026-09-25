import { memoryStore } from "./memoryStore";
import { getCurrentConversationHistory } from "./conversationHistoryCache";
import { associateAssistantResponse } from "./memoryAssociation";
import { isEligibleAssistantMessage } from "./conversationReader"

import {
    addConversationOperation,
    setPreviousTurnSavingState,
    getController,
    setPendingSaveMemory,
    getPendingSaveMemory,
    resetPendingSaveMemory,
    PendingSaveMemory,
} from "./config"

// ============================================================
// KEYWORD REGEXES
// ============================================================

// Save-memory command.
const SAVE_MEMORY_REGEX =
    /\b(?:save|sav|sve|sv|store|remember|persist)\b.*?\b(?:memory|mem|mm|mmry|memry|mry|mmy|memy)\b(?:\s+message|msg)?\s*(\d+)/i;

const CATEGORY_EXTRACT_REGEX =
    /^(?:category|categroy|categary|categry|catgry|catagory|catgory|categoy)\b\s+(?:is\s+)?(.+)$/i;

const NAME_EXTRACT_REGEX =
    /^(?:name|nmae|nam|nme)\b\s+(?:is\s+)?(.+)$/i;

const EXIT_SAVE_MEMORY_REGEX =
    /\bexit\b\s+(?:save|sav|sve|sv|store|remember|persist)\b\s+(?:memory|mem|mm|mmry|memry|mry|mmy|memy)\b/i;

// ============================================================
// FIELD EXTRACTION
// ============================================================

function extractCategory(segment: string): string | null {
    const match = segment.match(CATEGORY_EXTRACT_REGEX);
    return match?.[1]?.trim() ?? null;
}

function extractFileName(segment: string): string | null {
    const match = segment.match(NAME_EXTRACT_REGEX);
    return match?.[1]?.trim() ?? null;
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

export async function processMessage(
    userText: string,
): Promise<SaveMemoryResult> {

    // --------------------------------------------------------
    // Check whether this message contains a save-memory command.
    // --------------------------------------------------------

    const saveMatch = userText.match(SAVE_MEMORY_REGEX);

    if (saveMatch) {
        setPendingSaveMemory({
            active: true,
            memoryNumber: Number(saveMatch[1]),
        });
        setPreviousTurnSavingState(true);
    }

    // --------------------------------------------------------
    // Check whether this message contains an exit command
    // --------------------------------------------------------

    const exitMatch = userText.match(EXIT_SAVE_MEMORY_REGEX);
    
    const exitRequested = exitMatch !== null? true : false;

    // --------------------------------------------------------
    // If we're not currently in save-memory mode,
    // don't interpret category/name as save-memory fields.
    // --------------------------------------------------------

    const current = getPendingSaveMemory();

    if (!current.active) {
        setPreviousTurnSavingState(null);
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
    // EVERYTHING IS PRESENT
    // ========================================================

    if (
        updated.memoryNumber !== null &&
        updated.category !== null &&
        updated.fileName !== null
    ) {

        await appendSaveMemoryTextAtEndOfConversationJson(exitRequested);

        await saveMemory({
            memoryNumber: updated.memoryNumber,
            category: updated.category,
            fileName: updated.fileName,
            },
        );

        return {
            action: "saved",
        };
    }


    // ========================================================
    // STILL WAITING FOR SOMETHING
    // ========================================================
    
    await appendSaveMemoryTextAtEndOfConversationJson(exitRequested);

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
 * → tryAppendSaveMemoryTextAtEndOfConversationJsonTimeoutFunction → string constructors → editAssistantResponse →
 * (all fields given) → saveMemory → appendSaveMemoryTextAtEndOfConversationJson → tryAppendSaveMemoryTextAtEndOfConversationJsonTimeoutFunction
 * → multiEditCoordinator(conversation.json write)
 */
async function appendSaveMemoryTextAtEndOfConversationJson(
    exitRequested: boolean,
): Promise<void> {

    const pendingSaveMemory = getPendingSaveMemory();

    // Queuing save memory logic to write conversation.json
    // Passing params required by children functions over
    addConversationOperation(
        "tryAppendSaveMemoryTextAtEndOfConversationJsonTimeoutFunction",
        {
            exitRequested,
            pendingSaveMemory,
        },
    );

    //=================================================
    // CODE NOW RUNS FROM multiEditCoordinator.ts
    //=================================================
}

/**
 * multiEditCoordinator calls this function
 */
export async function tryAppendSaveMemoryTextAtEndOfConversationJsonTimeoutFunction(
    exitRequested: boolean,
    latestConversation: any,
    pendingSaveMemory: PendingSaveMemory,
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

        // Saved Memory path
        if(pendingSaveMemory.category !== null &&
            pendingSaveMemory.fileName !== null){
            lines = (await constructAssistantReplySaveMemory(pendingSaveMemory));
        }
    }
    
    await editAssistantResponse(
        latestConversation,
        lines.join("\n\n"),
    );
}

export async function editAssistantResponse(
    conversation: any,
    replacementText: string,
): Promise<void> {

    // Find the last assistant message
    const assistantMessage = [...conversation.messages]
        .reverse()
        .find((message: any) =>
            message.versions?.[
                message.currentlySelected ?? 0
            ]?.role === "assistant",
        );

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

    // Replace the assistant's response
    textBlock.text = replacementText;

    // Find debugInfoBlock
    const debugInfoIndex = assistantVersion.steps.findIndex(
        (step: any) => step.type === "debugInfoBlock",
    );

    const messages = (await getCurrentConversationHistory()).getMessagesArray();
    const assistantIndex = messages.filter(isEligibleAssistantMessage).length + 1;

    // Create the new content block
    const markerBlock = {
        type: "contentBlock",
        stepIdentifier: String(Date.now()),
        content: [
            {
            type: "text",
            text: `\n\n***message ${assistantIndex}***`,
            fromDraftModel: false,
            tokensCount: 1,
            isStructural: false,
            },
        ],
        defaultShouldIncludeInContext: false,
        shouldIncludeInContext: false,
        };

        const markerExists = assistantVersion.steps.some(
        (step: any) =>
            step.type === "contentBlock" &&
            step.content?.some(
                (contentBlock: any) =>
                    contentBlock.type === "text" &&
                    contentBlock.text === `\n\n***message ${assistantIndex}***`,
            ),
    );

    // Try to add marker block object before debug.
    // If that doesn't exist just add after the last role: assistant content block.
    const insertIndex =
        debugInfoIndex !== -1
            ? debugInfoIndex
            : assistantVersion.steps.length;

    if (!markerExists) {
        assistantVersion.steps.splice(
            insertIndex,
            0,
            markerBlock,
        );
    }
}

async function saveMemory({
    memoryNumber,
    category,
    fileName
}: {
    memoryNumber: number,
    category: string,
    fileName: string,
}): Promise<void> {

    const ctl = getController();

    try {
        const history = await getCurrentConversationHistory();

        // Start the memory saving
        const association = await associateAssistantResponse(
            ctl.client,
            history,
            memoryNumber,
        );

        await memoryStore.saveSeed(
            category,
            fileName,
            {
                date: new Date().toISOString(),
                root_input: association.rootInput,
                direct_input: association.directInput,
                output: association.assistantResponse,
            },
            memoryNumber,
        );

        // Write to conversation.json a save message content block
        await appendSaveMemoryTextAtEndOfConversationJson(false);

    } catch (error) {
        console.error(
            "Error creating Memory Seed: " +
            `${error instanceof Error ? error.message : String(error)}`
        );

    } finally {
        // Reset state for new tool calls
        // previousTurnSavingState is to prevent the normal path from
        // trying to append when save handles the appending of message #.
        // Possible reduction here because writes are handled by the coordinator now.
        setPreviousTurnSavingState(true);
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
        `**[Message ${pendingSaveMemory.memoryNumber}]** was successfully saved as ***${pendingSaveMemory.category}/${pendingSaveMemory.fileName}.json***`
    );

    return lines;
}

export async function constructAssistantReplyForMissingFields(
    pendingSaveMemory: PendingSaveMemory,
): Promise<string[]>{
    
    const lines: string[] = [];

    lines.push(
        '**Please provide the following missing information with its required prefix:**'
    );

    if (pendingSaveMemory.category === null) {
        lines.push(
            '- Category Name: `category <category_here>`.',
        );
    }

    if (pendingSaveMemory.fileName === null) {
        lines.push(
            '- Memory Name: `name <name_here>`.',
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
        '*To forcefully end this save memory attempt say:* `exit save memory`'
    );
    
    return lines;
}

export async function constructAssistantReplySaveMemoryExit(
    pendingSaveMemory: PendingSaveMemory,
): Promise<string[]>{
    
    const lines: string[] = [];

    lines.push(
        `Exiting Save Memory Request of **[Message ${pendingSaveMemory.memoryNumber}]**`
    );

    lines.push(
        `- Category: ${pendingSaveMemory.category === null
            ? `[Not Provided]`
            : `[ ${pendingSaveMemory.category} ]`
        }`
    );

    lines.push(
        `- Memory Name: ${pendingSaveMemory.fileName === null
            ? `[ Not Provided ]`
            : `[ ${pendingSaveMemory.fileName} ]`
        }`
    );

    return lines;
}