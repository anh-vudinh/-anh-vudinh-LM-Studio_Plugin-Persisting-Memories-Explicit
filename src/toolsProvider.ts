import type { PendingSaveMemory } from "./config"
import { tool, Tool, ToolsProviderController } from "@lmstudio/sdk";
import { getMemorySeedsPool } from "./memorySession";
import { deleteMemorySeedFile } from "./deleteMemorySeedFiles";
import { configSchematics, getPendingSaveMemory, setConfigSchematics, setPendingSaveMemory, TOM_RANGES, } from "./config";
import { promptProcessorConstructMemoriesToInject } from "./promptPreprocessor";
import { multiSaveMemory, saveMemory } from "./triggerSaveMemory";
import { z } from "zod";

import { 
    constructTOMSummariesLookupTable, 
    formatAsTableString, 
    formatMemoryPackage, 
    tableOfMemoriesDirectLookup, 
    tableOfMemoriesSummariesLookup, 
} from "./tableOfMemories";

import {
    compactionSeedExists, 
    compactionToMemorySeedTransfer, 
    createCompactionSummary, 
    enCompactionSeedExists, 
    extractCompactionMemorySeeds, 
    listCompactionSeeds,
    patchCompactedMemorySeed,
    validateIfAlreadyEngrained
} from "./tableOfCompactions";

let latestEngrainCompaction = "";
let lastProcessedEngrainCompaction = "";
let alreadyTriggered = false;
let deletionInProgress = false;
let engrainCompactionChanged = false;
let engrainCompactionPoller: ReturnType<typeof setInterval> | undefined;

export async function toolsProvider(
  ctl: ToolsProviderController
): Promise<Tool[]> {
    const tools: Tool[] = [];
    const config = ctl.getPluginConfig(configSchematics);
    const memoryFileToDelete = config.get("deleteMemorySeedsFile") as string;
    const enableToolsMode = config.get("enableToolsMode") as boolean;
    const engrainCompaction = config.get("engrainCompaction") as string;
    latestEngrainCompaction = engrainCompaction;
    engrainCompactionChanged = true;

    //------------------------------------------------------------------------
    // CREATE ENGRAINED COMPACTION SEED
    //------------------------------------------------------------------------
    if (!engrainCompactionPoller) {
        engrainCompactionPoller = setInterval(() => {
            if (engrainCompactionChanged) {
                // A change occurred during the last 2 seconds.
                engrainCompactionChanged = false;
                return;
            }

            // No changes during the last 2 seconds.
            clearInterval(engrainCompactionPoller);
            engrainCompactionPoller = undefined;

            const stableValue = latestEngrainCompaction;

            if (stableValue === "") return;

            if (stableValue === lastProcessedEngrainCompaction) {
                // console.log("[VALIDATION SKIPPED] Value already processed");
                return;
            }

            // Remember this value so a subsequent invocation doesn't process it again.
            lastProcessedEngrainCompaction = stableValue;
            // console.log("[VALIDATION PASSED]", stableValue);

            // Value is stable so begin conversion.
            void convertCompactionToMemorySeed(stableValue);

        }, 2000);
    }

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
        normalizedMemoryFileToDelete !== "" &&
        !deletionInProgress
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
            deletionInProgress = true;
            for (const memorySeed of memorySeedsToDelete) {
                await deleteMemorySeedFile(memorySeed);
                console.log("🗑️ Deleted ", memorySeed);
            }
            deletionInProgress = false;
        }

    } else if (
        // Normal file deletion
        normalizedMemoryFileToDelete !== "" &&
        getMemorySeedsPool().includes(normalizedMemoryFileToDelete) &&
        !deletionInProgress
    ) {
        deletionInProgress = true;
        await deleteMemorySeedFile(normalizedMemoryFileToDelete);
        console.log("🗑️ Deleted ", normalizedMemoryFileToDelete);
        deletionInProgress = false;
    }

    //------------------------------------------------------------------------
    // MEMORY SEED FUZZY RECALL
    //------------------------------------------------------------------------
    const memorySeedRecall = tool({
        name: "memory_seed_recall",

        description:
            `This tool is used for when the user wants the assistant to search through their memories directory to recollect which memory file best matches the memory they are trying to locate.` +
            `This tool should not be used to directly retrieve a memory file's full content.`+
            `This tool only returns up to five results containing a memory filename along with it's summary.` +
            `Present the results to the user before calling this tool again.` +
            'Include this following tag "📦 **Memory Package**" at the beginning of your response, including the 📦 emoji, as the title.' +
            'The tool will return a string prepared to be displayed as a markdown table. Display it as a markdown table. DO NOT wrap the raw contents in a block or backticks.',
  
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

            if (returnPackage === "") return "no match found";

            const tablefiedReturnPackage = constructTOMSummariesLookupTable(returnPackage);

            return [
                tablefiedReturnPackage,
            ].join("\n");
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
            `Always first ask for the user to clarify which specific Memories Table they would like to look up; their options are TOM_${TOM_RANGES.first.start}-${TOM_RANGES.first.end}, TOM_${TOM_RANGES.second.start}-${TOM_RANGES.second.end}, TOM_${TOM_RANGES.special.start}-${TOM_RANGES.special.end}. The user may say the shorthand versions of these, which are tom${(TOM_RANGES.first.start + TOM_RANGES.first.end).toLowerCase()}, tom${(TOM_RANGES.second.start + TOM_RANGES.second.end).toLowerCase()}, tom${(TOM_RANGES.special.start + TOM_RANGES.special.end).toLowerCase()}.` +
            `Present the results to the user before calling this tool again.` +
            'Include this following tag "📦 **Memory Package**" at the beginning of your response, including the 📦 emoji, as the title.' +
            'Required to display the results as a raw markdown table.',

        parameters: {
            tableToLookUp: z
            .string()
            .trim()
            .min(1)
            .describe("Available Memories Tables: 'TOM_A-J', 'TOM_K-Q', 'TOM_R-Z'"),
        },

        implementation: async (params: {
            tableToLookUp: string;
        }) => {
            const { tableToLookUp } = params;

            const returnPackage = await tableOfMemoriesDirectLookup(tableToLookUp);

            if (returnPackage === "") return "no matching table found";

            if (returnPackage === "not initialized") return "TOM tables have not yet been initialized. Use the '⚙️ Initialize Table of Memories' feature first before performing any actions related to Table of Memories.";

            const tablefiedReturnPackage = formatAsTableString(returnPackage);

            return [
                tablefiedReturnPackage,
            ].join("\n");
        },
    });

    //------------------------------------------------------------------------
    // DIRECT MEMORY SEED FETCH
    //------------------------------------------------------------------------
    const directMemoryLookup = tool({
        name: "direct_memory_lookup",

        description:
            `This tool is used for when the user wants the assistant to fetch them a specific memory.` +
            `This request must include a required .json suffix for the memory name. Any request lacking a .json suffix means this is not the right tool to use.` +
            `This tool supports * as a wildcard for the file_name to pull a whole category of memories, this is only for strict special cases directly requested by the user to use. A wildcard is not meant to be used lightly.` +
            `Present the results to the user before calling this tool again.` +
            'Include this following tag "📦 **Memory Package**" at the beginning of your response, including the 📦 emoji, as the title.' +
            'Required to display the results as a raw markdown table.',

        parameters: {
            memoryJsonToLookUp: z
            .string()
            .trim()
            .min(1)
            .describe("The full name of the memory matching the structure <category_name>/<file_name>.json. In special cases if the user directly request it, a * can be used as a wildcard for the file_name."),
        },

        implementation: async (params: {
            memoryJsonToLookUp: string;
        }) => {
            const { memoryJsonToLookUp } = params;

            const memorySeedsPool = getMemorySeedsPool();
            const requestedSeeds = new Set<string>();

            for (const seed of memorySeedsPool) {
                // Accept only exact seed paths mentioned in the user text.
                if (memoryJsonToLookUp.includes(seed)) {
                    requestedSeeds.add(seed);
                }

                // Expand category/*.json only for known categories.
                const slashIndex = seed.indexOf("/");
                if (slashIndex === -1) continue;

                const category = seed.slice(0, slashIndex);
                const wildcard = `${category}/*.json`;

                if (memoryJsonToLookUp.includes(wildcard)) {
                    requestedSeeds.add(seed);
                }
            }

            const validatedSeedsToFetch = [...requestedSeeds];

            if (validatedSeedsToFetch.length === 0) {
                return `Invalid memory name. The correct structure is <category_name>/<file_name>.json. \n\n These are currently the only available memories: ${memorySeedsPool.join(", ")}`;
            }

            // Always returns content if the memory exist.
            const returnPackage = await promptProcessorConstructMemoriesToInject(
                validatedSeedsToFetch,
                false,                      // Do not summarize seeds
            );

            const tablefiedReturnPackage = formatMemoryPackage(returnPackage);

            return [
                tablefiedReturnPackage,
            ].join("\n");
        },
    });

    //------------------------------------------------------------------------
    // COMPACTION SUMMARY FETCH
    //------------------------------------------------------------------------
    const compactionSummaryFetch = tool({
        name: "compaction_file_fetch",

        description:
            `This tool is used for when the user wants the assistant to fetch a compaction file.` +
            `This request must include two elements 1) c#_p# within the request meaning compaction # and part # and 2) a required .json suffix at the end of the compaction name. Any request lacking these two elements is not a call to use this tool.` +
            `Present the results to the user before calling this tool again.` +
            'Include this following tag "📦 **Compaction Summary Package**" at the beginning of your response, including the 📦 emoji, as the title.' +
            'The results will be returned as a string to be displayed however you want, BUT you must adhere to the requirements of using the "📦 **Compaction Summary Package**" tag as the title.' +
            'Required to display the results as a raw markdown table.',

        parameters: {
            compactionFileToFetch: z
            .string()
            .trim()
            .min(1)
            .describe("The full name of the compaction file matching the structure <file_name>_c#_p#.json"),
        },

        implementation: async (params: {
            compactionFileToFetch: string;
        }) => {
            const { compactionFileToFetch } = params;

            let constructedSummaryString = "";

            constructedSummaryString = await createCompactionSummary(compactionFileToFetch);

            if(constructedSummaryString === "") {
                const allCompactionSeedsAvailable = await listCompactionSeeds(false);    // false for plain string format return

                return `Invalid compaction file name. The correct structure is <file_name>_c#_p#.json. \n\n These are currently the only available compaction files: ${allCompactionSeedsAvailable}.`;
            }

            const returnPackage = await createCompactionSummary(compactionFileToFetch);

            return (
                returnPackage
            )
        },
    });
    
    /**
     * ------------------------------------------------------------------------
     * persistingMemoriesTool
     * ------------------------------------------------------------------------
     */
    const persistingMemoriesTool = tool({
      name: "create_new_memories",

      description:
        `This tool is only for creating a new memory seed at the user's explicit request.` +
        `For saving a single message, the user is expected to have said, 'save memory <messageNumber>; category <category>; name <name>;'` +
        `For saving a batch of messages, the user is expected to have said, 'save memory <messageNumber> to <messageEndNumber>; category <category>; name <name>;'` +
        `Present the results to the user before calling this tool again.` +
        `It is your job to assign the given <parameters> to their matching parameter field.` +
        `It is not your job to fabricate parameters that were not explicitly given by the user. Any missing parameters must be asked for the user to supply first.` +
        'Include this following tag "⏳ **`SAVE MEMORY MODE`**" at the beginning of your response, including the ⏳ emoji, as the title.',
        
      parameters: {
        messageNumber: z
          .number()
          .int()
          .min(1)
          .describe(
            "Exact <messageNumber> provided by the user during a save memory command."
          ),
        category: z
          .string()
          .trim()
          .min(1)
          .describe(
            "Exact <category> provided by the user during a save memory command."
          ),
        name: z
          .string()
          .trim()
          .min(1)
          .describe(
            "Exact <name> provided by the user during a save memory command."
          ),
        messageEndNumber: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe(
            "Exact <messageEndNumber> IF provided by the user during a save memory command. User may provide this to save a range of messages."
          ),
      },

      implementation: async (
        params: {
          messageNumber: number;
          category: string;
          name: string;
          messageEndNumber?: number;
        },
        { signal }
      ) => {
        const {messageNumber, category, name, messageEndNumber} = params;

        const pendingSaveMemory: PendingSaveMemory = {
            active: true,
            memoryNumber: messageNumber,
            category,
            fileName: name,
            memoryNumberEndRange: messageEndNumber ?? null,
        }

        setPendingSaveMemory(pendingSaveMemory);

        const currentPendingSaveMemory = getPendingSaveMemory();

        try {

          if (signal.aborted) {
            return "Memory Seed operation was aborted.";
          }

          let memorySavedStatus = false;

          // SINGLE MESSAGE SAVE
          if (messageEndNumber === null || messageEndNumber === undefined) {

            memorySavedStatus = await saveMemory(currentPendingSaveMemory);

          } else {
            // MULTI MESSAGE SAVE
            memorySavedStatus = await multiSaveMemory(currentPendingSaveMemory);
          }

          if (signal.aborted) {
            return "Memory Seed operation was aborted.";
          }

          if(memorySavedStatus){
            return [
                `Your response is expected to contain the word 'save memory mode' to communicate to the user this tool has been used.`,
                `✅ Memory Seed ${currentPendingSaveMemory.category}/${currentPendingSaveMemory.fileName} of msg ${currentPendingSaveMemory.memoryNumber}${currentPendingSaveMemory.memoryNumberEndRange !== null? ` through ${currentPendingSaveMemory.memoryNumberEndRange}` : ""} has been saved.`
            ].join("\n\n");
          } else{
            return [
                `Your response is expected to contain the word 'save memory mode' to communicate to the user this tool has been used.`,
                `❌ Memory Seed ${currentPendingSaveMemory.category}/${currentPendingSaveMemory.fileName} of msg ${currentPendingSaveMemory.memoryNumber}${currentPendingSaveMemory.memoryNumberEndRange !== null? ` through ${currentPendingSaveMemory.memoryNumberEndRange}` : ""} is ineligible to be saved. This means that it's content was considered purely metadata.`
            ].join("\n\n");
          }

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

    if (enableToolsMode) {
        tools.push(memorySeedRecall, tableOfMemoriesRecall, directMemoryLookup, persistingMemoriesTool, compactionSummaryFetch);
    };

    return tools;
}

async function convertCompactionToMemorySeed(
    engrainCompaction: string,
):Promise<void>{
    if(alreadyTriggered === false) {
        alreadyTriggered = true;

        // Extract user text to compaction seed and intended memory seed
        const extractedInputs = extractCompactionMemorySeeds(engrainCompaction);

        if (extractedInputs !== null) {

            // Check if it is already engrained on any date
            // True = already engrained, False = not engrained, Null = error reading/parsing
            const engrained = await validateIfAlreadyEngrained(extractedInputs.compactionSeed);

            if (engrained || engrained === null) {
                alreadyTriggered = false;
                return;
            }

            const isValidCompactionSeed = await compactionSeedExists(extractedInputs.compactionSeed);

            if(isValidCompactionSeed) {
                // Add the memory seed to available memories pool
                const doesEnCompactionAlreadyExist = await enCompactionSeedExists(extractedInputs);

                if (!doesEnCompactionAlreadyExist) {
                    await compactionToMemorySeedTransfer(extractedInputs);
                }

                if (doesEnCompactionAlreadyExist) {
                    await patchCompactedMemorySeed(extractedInputs);
                }
            }
        }

        alreadyTriggered = false;
    };
}