import { tool, Tool, ToolsProviderController } from "@lmstudio/sdk";
import { z } from "zod";
import { getCurrentConversationHistory } from "./conversationHistoryCache";
import { associateAssistantResponse } from "./memoryAssociation";
import { memoryStore } from "./memoryStore";
import { configSchematics } from "./config";
import { getMemorySeedsPool } from "./memorySession";
import { readFile } from "node:fs/promises";
import { deleteMemorySeedFile } from "./deleteMemorySeedFiles"
import path from "node:path";

export async function toolsProvider(
  ctl: ToolsProviderController
): Promise<Tool[]> {
  const tools: Tool[] = [];
  const config = ctl.getPluginConfig(configSchematics);
  
  const memoryFileToDelete = config.get("deleteMemorySeedsFile") as string;
  
  if (memoryFileToDelete !== "") {
    await deleteMemorySeedFile(memoryFileToDelete);
    console.log("deleted", memoryFileToDelete)
  }

  /**
   * ------------------------------------------------------------------------
   * memory seed selection
   * ------------------------------------------------------------------------
   */
  const memorySeedsSelected =
    config.get("memorySeedsSelected") as string[];

  const memorySeedsPool = getMemorySeedsPool();

  const normalizedMemorySeedsSelected =
      memorySeedsSelected.map(
          (memorySeed) =>
              memorySeed
                  .trim()
                  .replace(/\.json.*$/i, ".json"),
      );

  const validMemorySeedsSelected = [
      ...new Set(
          normalizedMemorySeedsSelected.filter(
              (memorySeed) =>
                  memorySeedsPool.includes(memorySeed),
          ),
      ),
  ];

  const memoriesDirectory = await memoryStore.getMemoriesDirectory();

  const selectedMemorySeeds = [];

  for (const memorySeed of validMemorySeedsSelected) {
      const [category, filename] =
          memorySeed.split("/");

      const filePath = path.join(
          memoriesDirectory,
          category,
          filename,
      );

      const contents = await readFile(
          filePath,
          "utf-8",
      );

      const seed = JSON.parse(contents);

      selectedMemorySeeds.push({
          memorySeed,
          seed,
      });
  }

   /**
   * ------------------------------------------------------------------------
   * saveMemoryTool
   * ------------------------------------------------------------------------
   */
  const saveMemoryTool = tool({
    name: "save_memory",

    description:
      "Use when user says, save memory message <N>, messageNumber is set to <N>." +
      "If user does not provide category and name, ask them for it." +
      "You must first know the category and name before calling this tool.",

    parameters: {
      messageNumber: z
        .number()
        .int()
        .min(0)
        .describe(
          "Exact number provided by the user as message <N>."
        ),

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
        messageNumber: number;
        category: string;
        name: string;
      },
      { signal }
    ) => {
      try {
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

        const association = await associateAssistantResponse(
          ctl.client,
          history,
          params.messageNumber
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

        //bookmark here
        if (signal.aborted) {
          return "Memory Seed operation was aborted.";
        }


        /**
         * Save exactly the association we established:
         *
         * input  = original user intention
         * output = approved assistant response
         *
         * No reasoning/thinking is stored.
         * No intermediate conversation summary is stored.
         */

        return (
          `Memory Seed "${params.name}" saved under "${params.category}".`
        );
      } catch (error) {
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

  tools.push(saveMemoryTool);

  return tools;
  
}
