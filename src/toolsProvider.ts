import { tool, Tool, ToolsProviderController } from "@lmstudio/sdk";
import { z } from "zod";
import { getCurrentConversationHistory } from "./conversationHistoryCache";
import { associateAssistantResponse } from "./memoryAssociation";
import { memoryStore } from "./memoryStore";

export async function toolsProvider(
  ctl: ToolsProviderController
): Promise<Tool[]> {
  const tools: Tool[] = [];
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
