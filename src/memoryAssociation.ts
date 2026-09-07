import type { LMStudioClient } from "@lmstudio/sdk";
import type { Chat } from "@lmstudio/sdk";

import {
    cleanAssistantResponse,
    cleanUserInput,
    getAssistantResponse,
    getPriorUserMessages,
    type UserIntentionCandidate,
} from "./conversationReader";

export interface MemoryAssociation {
    assistantMessageNumber: number;
    assistantResponse: string;

    rootInput: string;
    directInput: string;
}

/**
 * Determine which earlier user message represents the original intention
 * associated with an approved assistant response.
 *
 * Important:
 *
 * The model is NOT asked whether the assistant response is correct.
 * The user already established that by selecting the response to remember.
 *
 * The model is only asked:
 *
 * "Which earlier user input is this response ultimately answering?"
 */
export async function associateAssistantResponse(
    client: LMStudioClient,
    history: Chat,
    assistantMessageNumber: number,
): Promise<MemoryAssociation> {

    if (!assistantMessageNumber) {
        throw new Error(
            `AssistantMessage# ${assistantMessageNumber} not provided.`,
        );
    }

    const assistantMsg = getAssistantResponse(
        history,
        assistantMessageNumber,
    );

    const cleanedAssistantResponse =
        cleanAssistantResponse(assistantMsg.content);

    const candidates = getPriorUserMessages(
        history,
        assistantMessageNumber,
    );

    if (candidates.length === 0) {
        throw new Error(
            `Message ${assistantMessageNumber} has no earlier user messages ` +
            "that could serve as its root intention.",
        );
    }

    const rootUserMessageNumber =
        await determineOriginalIntention(
            client,
            cleanedAssistantResponse,
            candidates,
        );

    const rootCandidate = candidates.find(
        (candidate) =>
            candidate.messageNumber === rootUserMessageNumber,
    );

    if (!rootCandidate) {
        throw new Error(
            `The association model selected message ` +
            `${rootUserMessageNumber}, but that message is not a valid ` +
            "prior user message.",
        );
    }

    const messages = history.getMessagesArray();

    let directInput = "";

    for (
        let index = assistantMsg.arrayIndex - 1;
        index >= 0;
        index--
    ) {
        const message = messages[index];

        if (!message.isUserMessage()) {
            continue;
        }

        directInput = cleanUserInput(
            message.getText(),
        );

        break;
    }

    if (!directInput) {
        throw new Error(
            `Message ${assistantMessageNumber} has no directly preceding ` +
            "user input.",
        );
    }

    return {
        assistantMessageNumber,
        assistantResponse: cleanedAssistantResponse,

        rootInput: cleanUserInput(
            rootCandidate.content,
        ),

        directInput,
    };
}

/**
 * Ask a local LM Studio model to identify the original user intention.
 */
async function determineOriginalIntention(
    client: LMStudioClient,
    assistantResponse: string,
    candidates: UserIntentionCandidate[],
): Promise<number> {
    const model = await client.llm.model();

    const candidateText = candidates
        .map(
            (candidate) =>
                `USER MESSAGE ${candidate.messageNumber}:\n` +
                cleanUserInput(candidate.content),
        )
        .join("\n\n---\n\n");

    const prompt = `
        Choose the ROOT INPUT for the approved assistant response.

        The root input is the earliest user message that established the user's overall goal or curiosity.

        Root inputs are not follow-ups, clarifications, corrections, refinements, implementation steps, or sub-topics.

        Choose a later message only when it establishes a genuinely new topic beyond the scope of the overall goal or curiosity.

        Return ONLY the USER MESSAGE NUMBER.

        APPROVED ASSISTANT RESPONSE:
        ${assistantResponse}

        USER MESSAGES:
        ${candidateText}

        ROOT USER MESSAGE NUMBER:
        `.trim();

    const result = await model.respond(prompt, {
        temperature: 0,
    });

    const raw = result.content.trim();
    const cleaned = cleanAssistantResponse(raw);

    const match = cleaned.match(/\b(\d+)\b/);

    if (!match) {
        throw new Error(
            `The association model did not return a valid message number. ` +
            `Model returned: ${raw}`,
        );
    }

    const selectedNumber = Number(match[1]);

    const exists = candidates.some(
        (candidate) =>
            candidate.messageNumber === selectedNumber,
    );

    if (!exists) {
        throw new Error(
            `The association model selected message ${selectedNumber}, ` +
            "but that is not one of the available prior user messages.",
        );
    }

    return selectedNumber;
}