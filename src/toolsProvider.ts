import { tool, Tool, ToolsProviderController } from "@lmstudio/sdk";
import { z } from "zod";
import { getCurrentConversationHistory } from "./conversationHistoryCache";
import { associateAssistantResponse } from "./memoryAssociation";
import { memoryStore } from "./memoryStore";
import { configSchematics } from "./config";
import { getMemorySeedsPool } from "./memorySession";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function toolsProvider(
  ctl: ToolsProviderController
): Promise<Tool[]> {
  const tools: Tool[] = [];

  /**
   * ------------------------------------------------------------------------
   * memory seed selection
   * ------------------------------------------------------------------------
   */
  const config = ctl.getPluginConfig(configSchematics);

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

  const memoriesDirectory =
      "C:\\Users\\VU-W11\\.lmstudio\\memories";

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

  console.log(
      "Memory Seeds Validated:",
      validMemorySeedsSelected,
  );

   /**
   * ------------------------------------------------------------------------
   * remember_message
   * ------------------------------------------------------------------------
   */
  const rememberMessageTool = tool({
    name: "remember_message",

    description:
      "Tool for when user specifically calls, create memory message <N>. " +
      "messageNumber is set to <N>. " +
      "User must provide a category and name, ask the user for them before invoking the tool. " +
      "Regardless of success or failure, only invoke the tool once per user request. ",

    parameters: {
      messageNumber: z
        .number()
        .int()
        .min(0)
        .describe(
          "Exact number provided by the user as assistant message <N>."
        ),

      category: z
        .string()
        .trim()
        .min(1)
        .describe(
          "User provided only. Not up to your discretion. Memory Seed category/folder."
        ),

      name: z
        .string()
        .trim()
        .min(1)
        .describe(
          "User provided only. Not up to your discretion. Name for the Memory Seed."
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

        // const assistant = getAssistantResponse(
        //     history,
        //     params.messageNumber,
        // );

        // const output = cleanAssistantResponse(assistant.content);

        memoryStore.setRootDirectory(
            ctl.getWorkingDirectory(),
        );

        await memoryStore.initialize();

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
         * Make sure the storage root exists before writing.
         */
        memoryStore.setRootDirectory(ctl.getWorkingDirectory());
        await memoryStore.initialize();

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

  tools.push(rememberMessageTool);

  return tools;
  
}
