import { tool, Tool, ToolsProviderController } from "@lmstudio/sdk";
import { getMemorySeedsPool } from "./memorySession";
import { deleteMemorySeedFile } from "./deleteMemorySeedFiles"
import { configSchematics } from "./config";
import { z } from "zod";
import { tableOfMemoriesDirectLookup, tableOfMemoriesSummariesLookup } from "./tableOfMemories";

export async function toolsProvider(
  ctl: ToolsProviderController
): Promise<Tool[]> {
    const tools: Tool[] = [];
    const config = ctl.getPluginConfig(configSchematics);
    const memoryFileToDelete = config.get("deleteMemorySeedsFile") as string;

    //------------------------------------------------------------------------
    // MEMORY SEED DELETION
    //------------------------------------------------------------------------
    const normalizedMemoryFileToDelete = memoryFileToDelete.trim()

    const wildcardMatch =
    normalizedMemoryFileToDelete.match(
        /^([^/]+)\/\*\.json$/i,
    );

    if (
    wildcardMatch &&
    normalizedMemoryFileToDelete !== ""
    ) {
        // Handle wildcard deletion
        const category = wildcardMatch[1];

        const memorySeedsToDelete =
            getMemorySeedsPool().filter(
                (memorySeed) =>
                    memorySeed.startsWith(
                        `${category}/`,
                    ),
            );
        
        // Category does not exist in the memory pool → do nothing
        if (memorySeedsToDelete.length !== 0) {
        for (const memorySeed of memorySeedsToDelete) {
            await deleteMemorySeedFile(memorySeed);
            
            console.log("deleted ", memorySeed);
        }
        }

    } else if (
        // Normal file deletion
        normalizedMemoryFileToDelete !== "" &&
        getMemorySeedsPool().includes(normalizedMemoryFileToDelete)
    ) {
        await deleteMemorySeedFile(normalizedMemoryFileToDelete);

        console.log("deleted ", normalizedMemoryFileToDelete);
    }

    //------------------------------------------------------------------------
    // MEMORY SEED RECALL
    //------------------------------------------------------------------------
    const memorySeedRecall = tool({
        name: "memory_seed_recall",

        description:
            `This tool is used for when the user wants the assistant to search through their memories directory to recollect which memory file best matches the memory they are trying to locate.` +
            `This tool should not be used to directly retrieve a memory file's full content.`+
            `This tool only returns up to three results containing a memory filename along with it's summary.` +
            `Return the results to the user exactly as received.`,
            
        parameters: {
            userQuery: z
            .string()
            .trim()
            .min(1)
            .describe(
                "The user's provided query of the memory they are trying to have the assistant recollect for them."
            ),
        },

        implementation: async (params: {
            userQuery: string;
        }) => {
            const { userQuery } = params;

            const returnPackage = await tableOfMemoriesSummariesLookup(userQuery);

            return returnPackage;
        },
    });

    //------------------------------------------------------------------------
    // Table Of Memories LookUp
    //------------------------------------------------------------------------
    const tableOfMemoriesRecall = tool({
        name: "table_of_memories_lookup",

        description:
            `This tool is used for when the user wants the assistant to display to them the table of memories.` +
            `The table of memories only contains metadata and summaries of memory files.` +
            `This tool is not meant to be used unless explicitly called for by the user.` +
            `Always first ask for the user to clarify which specific Memories Table they would like to look up; their options are TOM_A-I, TOM_J-R, TOM_S-Z.`,
            
        parameters: {
            tableToLookUp: z
            .string()
            .trim()
            .min(1)
            .describe("Available Memories Tables: 'TOM_A-I', 'TOM_J-R', 'TOM_S-Z'"),
        },

        implementation: async (params: {
            tableToLookUp: string;
        }) => {
            const { tableToLookUp } = params;

            const returnPackage = await tableOfMemoriesDirectLookup(tableToLookUp);
            
            return returnPackage;
        },
    });

    tools.push(memorySeedRecall, tableOfMemoriesRecall);

    return tools;
}