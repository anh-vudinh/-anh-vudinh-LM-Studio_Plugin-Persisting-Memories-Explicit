import type {
    ChatMessage,
    PromptPreprocessorController,
} from "@lmstudio/sdk";

import { configSchematics } from "./config";
import { setCurrentConversationHistory } from "./conversationHistoryCache";
import { isEligibleAssistantMessage } from "./conversationReader";

export async function promptPreprocessor(
    ctl: PromptPreprocessorController,
    userMessage: ChatMessage,
): Promise<string | ChatMessage> {
    const config = ctl.getPluginConfig(configSchematics);
    const enableSeeding = config.get("enableSeeding") as boolean;
    const history = await ctl.pullHistory();

    await setCurrentConversationHistory(history);

    const messages = history.getMessagesArray();

    const assistantIndex =
        messages.filter(isEligibleAssistantMessage).length + 1;

    if (!enableSeeding) {
        return userMessage;
    }

    const numberingInstruction =
        `Format requirement: at the end of only this response add ***message ${assistantIndex}***`;

    return `${userMessage.getText()}\n${numberingInstruction}`;
}