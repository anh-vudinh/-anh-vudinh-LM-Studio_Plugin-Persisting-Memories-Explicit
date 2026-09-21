import { tool, Tool, ToolsProviderController } from "@lmstudio/sdk";
import { z } from "zod";
import { getCurrentConversationHistory } from "./conversationHistoryCache";
import { associateAssistantResponse } from "./memoryAssociation";
import { memoryStore } from "./memoryStore";
import { configSchematics, getSaveMemoryNumber, setSaveMemoryNumber } from "./config";
import { getMemorySeedsPool } from "./memorySession";
import { deleteMemorySeedFile } from "./deleteMemorySeedFiles"

/**
* ToolsProvider does not have much responsibility. Just to interpret when the user
* requests to save a memory. The plugin's heavy lifting is in prompt preprocessor
*/
export async function toolsProvider(
  ctl: ToolsProviderController
): Promise<Tool[]> {
  const tools: Tool[] = [];
  const config = ctl.getPluginConfig(configSchematics);
  const memoryFileToDelete = config.get("deleteMemorySeedsFile") as string;
  
  /**
  * Deletion logic is handled here because tools can get the real-time state
  * of the deleteMemorySeedsFile config field.
  * Prompt preprocessor would have only caught it after a message is sent.
  */
  const normalizedMemoryFileToDelete = memoryFileToDelete.trim()

  if (normalizedMemoryFileToDelete !== "" && 
      getMemorySeedsPool().includes(normalizedMemoryFileToDelete)
  ) {

    await deleteMemorySeedFile(normalizedMemoryFileToDelete);
    console.log("deleted ", normalizedMemoryFileToDelete)
  }

  /**
   * ------------------------------------------------------------------------
   * persistingMemoriesTool
   * ------------------------------------------------------------------------
   */
  const persistingMemoriesTool = tool({
    name: "persist_seed",

    description:
      `Use when user says, "save memory"; category; name; or "save memory" followed by a digit.` +
      `User must first have provided the category and name before this tool can be used.`,

    parameters: {
      category: z
        .string()
        .trim()
        .min(1)
        .describe(
          "NON OPTIONAL: MUST BE USER PROVIDED. Memory Seed category/folder."
        ),

      name: z
        .string()
        .trim()
        .min(1)
        .describe(
          "NON OPTIONAL: MUST BE USER PROVIDED. Name for the Memory Seed."
        ),
    },

    implementation: async (
      params: {
        category: string;
        name: string;
      },
      { signal }
    ) => {
      try {

        const saveMemoryNumber = getSaveMemoryNumber();

        if (saveMemoryNumber === null) {
            throw new InvalidSaveMemoryNumberError();
        }

        if (!params.category) {
          return (
            "Tell me which category/folder name to use."
          );
        }

        if (!params.name) {
          return (
            "Tell me what to name this Memory Seed."
          );
        }

        if (signal.aborted) {
          return "Memory Seed operation was aborted.";
        }

        const history = await getCurrentConversationHistory();

        if (signal.aborted) {
          return "Memory Seed operation was aborted.";
        }

        const validSaveMemoryNumber = saveMemoryNumber;

        const association = await associateAssistantResponse(
          ctl.client,
          history,
          validSaveMemoryNumber,
        );

        await memoryStore.saveSeed(
            params.category,
            params.name,
            {
                date: new Date().toISOString(),
                root_input: association.rootInput,
                direct_input: association.directInput,
                output: association.assistantResponse,
            },
        );

        if (signal.aborted) {
          return "Memory Seed operation was aborted.";
        }

        return (
          `Memory Seed" ${params.category}/${params.name}" of msg ${validSaveMemoryNumber} has been saved.`
        );
      } catch (error) {
        if (error instanceof InvalidSaveMemoryNumberError) {
            throw error;
        }

        if (error instanceof Error && error.name === "AbortError") {
            return "Memory Seed operation was aborted.";
        }

        return (
          "Error creating Memory Seed: " +
          `${error instanceof Error ? error.message : String(error)}`
        );
      }
    },
  });

  tools.push(persistingMemoriesTool);

  return tools;
}

class InvalidSaveMemoryNumberError extends Error {
    constructor() {
        super("The msg number provided is invalid.");
        this.name = "InvalidSaveMemoryNumberError";
    }
}