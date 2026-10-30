import { acquireLock, releaseLock } from "./acquireLockFile";
import { memoryStore } from "./memoryStore";
import type { MemorySeed } from "./memoryStore";
import { join } from "node:path";
import { editAssistantResponse } from "./triggerSaveMemory";
import { getMemorySeedsPool } from "./memorySession";
import { promptProcessorConstructMemoriesToInject } from "./promptPreprocessor";
import path from "node:path";
import fs from "node:fs/promises";

import { 
    getController, 
    configSchematics, 
    getTableOfMemoriesRegex, 
    getFuzzySearchRegex, 
    getMemoryRangeRegex, 
    addConversationOperation, 
    setPendingTomCommand, 
    getPendingTomCommand,
    TOM_RANGES,
    getDirectFetchRegex,
    setLastKnownIndexOfRetractedToms,
    getLastKnownIndexOfRetractedToms
} from "./config";

import {
    writeFile,
    readFile,
    readdir,
    stat,
} from "node:fs/promises";

export interface TableOfMemoriesEntity {
    fileSizeKB: number;
    fileName: string;
    keywords: string;
    summary: string;
}

export interface MemoryTurn {
    direct_input: string;
    output: string;
}

interface MemoryEntry {
  filename: string;
  summary: string;
}

export async function tableOfMemoriesMain(): Promise<void> {

    const config = getController().getPluginConfig(configSchematics);
    const initializeTOM = config.get("initializeTOM") as boolean;

    const memoriesDirectory = await memoryStore.getMemoriesDirectory();

    if (initializeTOM) {
        await createTableOfMemories(memoriesDirectory);
        await initializeTableOfMemoriesFromLegacyPluginVersion(memoriesDirectory);
    }
}

//-------------------------------------------------
// UserText Interceptor To Determine TOM Regex Commands
//-------------------------------------------------

// First layer filter that will try to determine if the userText
// is a TOM fuzzy search or TOM table lookup command.
export async function processMessageForTom(
    userText: string,
    retractOldToms: number,
    enableToolsMode: boolean,
): Promise<void>{

    const TABLE_OF_MEMORIES_REGEX = getTableOfMemoriesRegex();

    const FUZZY_SEARCH_MEMORY_REGEX = getFuzzySearchRegex();

    const DIRECT_FETCH_MEMORY_REGEX = getDirectFetchRegex();

    const tomMatch = userText.match(TABLE_OF_MEMORIES_REGEX);

    const pendingTomCommand = getPendingTomCommand();

    let constructedTableString = "";

    const tomDirectFetchMatch = userText.match(DIRECT_FETCH_MEMORY_REGEX);

    if (retractOldToms > 0) {

        addConversationOperation(
            "tryRetractOldTomsFunction",
            {
                retractOldToms,
                enableToolsMode,
            },
        );
    }

    // Early exit after the retractOldToms operation
    if (enableToolsMode) return;

    // DIRECT MEMORY FETCH USER PROVIDED .JSON NAME
    if (tomDirectFetchMatch) {
        const memorySeedsPool = getMemorySeedsPool();
        const requestedSeeds = new Set<string>();

        for (const seed of memorySeedsPool) {
            // Accept only exact seed paths mentioned in the user text.
            if (userText.includes(seed)) {
                requestedSeeds.add(seed);
            }

            // Expand category/*.json only for known categories.
            const slashIndex = seed.indexOf("/");
            if (slashIndex === -1) continue;

            const category = seed.slice(0, slashIndex);
            const wildcard = `${category}/*.json`;

            if (userText.includes(wildcard)) {
                requestedSeeds.add(seed);
            }
        }

        const validatedSeedsToFetch = [...requestedSeeds];

        // console.log("Validated seeds:", validatedSeedsToFetch);

        if (validatedSeedsToFetch.length === 0) {

            constructedTableString = constructNonExisitingMemoryString([...memorySeedsPool]);

            addConversationOperation(
                "tryAppendTableOfMemoriesContentFunction",
                {
                    constructedTableString,
                },
            );

            setPendingTomCommand("ready");
            return;
        }

        const memoriesPackage = await promptProcessorConstructMemoriesToInject(
            validatedSeedsToFetch,
            false,                      // Do not summarize seeds
        );

        constructedTableString = formatMemoryPackage(memoriesPackage);

        // Fetch only validatedSeedsToFetch.
        if (constructedTableString !== "") {
            // Inject the constructedTableString into the newest assistant message.
            addConversationOperation(
                "tryAppendTableOfMemoriesContentFunction",
                {
                    constructedTableString,
                },
            );

            setPendingTomCommand("ready");
        }
        return;
    }

    // TABLE LOOK UP USER PROVIDED TOMAJ then FUZZY MEMORY SEARCH IF IT WAS NOT A TABLE LOOK UP
    // First layer check for direct table of memories lookup.
    // This captures a broad userText with keywords for 'fetch' & 'table' & 'memory|memories' || 'tom'
    if (
        tomMatch ||
        pendingTomCommand === "incomplete"
    ) {
        const match = extractMemoryRange(userText);

        // Second layer check to see if those three same values exist AND there is variation of `TOM_A-J`, `TOM_K-Q`, `TOM_R-Z`
        // which is the expected table names ai, a i, a_i validate too as long as they've cleared the first layer check
        if (match) {

            const tableName = `TOM_${match.toUpperCase()}`;

            const returnPackage = await tableOfMemoriesDirectLookup(tableName);
            
            constructedTableString = formatAsTableString(returnPackage);
            
            setPendingTomCommand("ready");
        } else {
            // Build a string to append to ask the user which table they like to look up
            // giving them their full options.
            // Set ourselves in a global state to wait for that answer.

            constructedTableString =
                "Specify exactly which Table of Memories you wish to retrieve: " +
                "`TOM_" + TOM_RANGES.first.start + "-" + TOM_RANGES.first.end + "`, " +
                "`TOM_" + TOM_RANGES.second.start + "-" + TOM_RANGES.second.end + "`, " +
                "`TOM_" + TOM_RANGES.special.start + "-" + TOM_RANGES.special.end + "`";

            setPendingTomCommand("incomplete");
        }

    } else {
        // FUZZY SEARCH Regex matched first layer check, send it through to 
        // the model to validate and extract the search query.
        const fuzzySearchMatch = userText.match(FUZZY_SEARCH_MEMORY_REGEX);

        if (fuzzySearchMatch) {
            const extractedQuery = await askModelToValidateFuzzySearchRegexAndExtractQuery(userText);

            if (extractedQuery !== "") {
                const returnPackage = await tableOfMemoriesSummariesLookup(extractedQuery);

                if (returnPackage !== "") {
                    constructedTableString = constructTOMSummariesLookupTable(returnPackage);          
                }

                if (returnPackage === "") {
                    constructedTableString = constructTomEmptyReturnPackage(extractedQuery);
                }
            }
        }
    }

    if (constructedTableString !== "") {
        // Inject the constructedTableString into the newest assistant message.
        addConversationOperation(
            "tryAppendTableOfMemoriesContentFunction",
            {
                constructedTableString,
            },
        );

        setPendingTomCommand("ready");
    }
}

export function formatMemoryPackage(
    packageText: string
): string {
    const memoryBlockRegex =
        /\[BEGIN ([^\]]+\.json)\]([\s\S]*?)\[END \1\]/gi;

    const formattedMemories: string[] = [];
    let blockMatch: RegExpExecArray | null;

    while ((blockMatch = memoryBlockRegex.exec(packageText)) !== null) {
        const source = blockMatch[1].trim();
        const payload = blockMatch[2].trim();

        const dateMatch = payload.match(
            /DATE:\s*(.*?)(?=\s+TOPIC_\d+:|$)/i,
        );
        const date = dateMatch?.[1]?.trim() ?? "Date unavailable";

        const topicRegex =
            /TOPIC_(\d+):\s*([\s\S]*?)(?=\s+TOPIC_\d+:|$)/gi;

        const rows: string[] = [];
        let topicMatch: RegExpExecArray | null;

        while ((topicMatch = topicRegex.exec(payload)) !== null) {
            const topicNumber = topicMatch[1];
            const section = topicMatch[2].trim();

            const userMatch = /\bUSER\s*:/i.exec(section);
            const assistantMatch = /\bASSISTANT\s*:/i.exec(section);

            const firstMessageIndex = [
                userMatch?.index,
                assistantMatch?.index,
            ]
                .filter((index): index is number => index !== undefined)
                .reduce(
                    (minimum, index) => Math.min(minimum, index),
                    section.length,
                );

            const topicText = section
                .slice(0, firstMessageIndex)
                .trim();

            let userText = "";
            if (userMatch) {
                const userStart = userMatch.index + userMatch[0].length;
                const userEnd =
                    assistantMatch && assistantMatch.index > userMatch.index
                        ? assistantMatch.index
                        : section.length;

                userText = section.slice(userStart, userEnd).trim();
            }

            let assistantText = "";
            if (assistantMatch) {
                const assistantStart =
                    assistantMatch.index + assistantMatch[0].length;

                assistantText = section.slice(assistantStart).trim();
            }

            rows.push(
                `| **TOPIC ${topicNumber}** | ${escapeCell(topicText)} |`,
                `| **USER** | ${escapeCell(userText)} |`,
                `| **ASSISTANT** | ${escapeCell(assistantText)} |`,
            );
        }

        formattedMemories.push(
            [
                '📦 **`Memory Package`**',
                `### ${source}`,
                `**DATE:** ${escapeCell(date)}`,
                "",
                "| Field | Content |",
                "|---|---|",
                ...rows,
            ].join("\n"),
        );
    }

    return formattedMemories.join("\n\n");

    function escapeCell(value: string): string {
        return value
            .replace(/\|/g, "\\|")
            .replace(/\r?\n/g, "<br>");
    }
}


// Second filter to validate a search command and extract 
// the search query which will be fed to compare to keywords and summaries
// Low cost hybrid approach rather than try and predict every formatting a user may 
// weave their actual query in during a save command.
async function askModelToValidateFuzzySearchRegexAndExtractQuery(
    userText: string,
):Promise<string> {
    const client = getController().client;
    const model = await client.llm.model();
    
    const prompt = `
        The user has provided a text which may be a request or command to recall, find, or any synonym of 'search' for a MEMORY. 

        Extract the subjects of what they are trying to search for. Do not include the search command within your returned string of the search query you have extracted.

        If this was not a valid search query return an empty string.

        [BEGINNING OF USER TEXT]: 
        ${userText}
        [END OF USER TEXT]
        `.trim();

    const result = await model.respond(
        prompt,
        {
            temperature: 0,
        },
    );

    const cleanedText = result.content
        .replace(
            /^[\s\S]*?__LM_STUDIO_INTERNAL_LSEP_SYNTHETIC_REASONING_END_[A-Za-z0-9]+__/i,
            "",
        )
        .replace(/^[\s\S]*?```(?:json)?\s*/i, "")
        .replace(/\s*```[\s\S]*$/i, "")
        .trim();

    return cleanedText;
}

// Extracts the TOM suffix identifier for TOM file of interest
function extractMemoryRange(input: string): string | null {
    
    const MEMORY_RANGE_REGEX = getMemoryRangeRegex();
    
    const match = input.match(MEMORY_RANGE_REGEX);
    if (!match) return null;

    const letters = match[1].replace(/[\s-]/g, "").toLowerCase();

    if (!/^[a-z]{2}$/.test(letters)) return null;

    const [start, end] = letters;

    const first = TOM_RANGES.first;
    if (new RegExp(`[${first.start}-${first.end}]`, "i").test(start) &&
        new RegExp(`[${first.start}-${first.end}]`, "i").test(end))
        return `${first.start}-${first.end}`.toLowerCase();

    const second = TOM_RANGES.second;
    if (new RegExp(`[${second.start}-${second.end}]`, "i").test(start) &&
        new RegExp(`[${second.start}-${second.end}]`, "i").test(end))
        return `${second.start}-${second.end}`.toLowerCase();

    const special = TOM_RANGES.special;
    if (new RegExp(`[${special.start}-${special.end}]`, "i").test(start) &&
        new RegExp(`[${special.start}-${special.end}]`, "i").test(end))
        return `${special.start}-${special.end}`.toLowerCase();

    return null;
}

//-------------------------------------------------
// TABLE OF MEMORIES FILE MAINTANENCE
//-------------------------------------------------

// Creates the three TOM files
async function createTableOfMemories(
    memoriesDirectory: string,
): Promise<void> {
    const tableNames = [
        `TOM_${TOM_RANGES.first.start}-${TOM_RANGES.first.end}.json`,
        `TOM_${TOM_RANGES.second.start}-${TOM_RANGES.second.end}.json`,
        `TOM_${TOM_RANGES.special.start}-${TOM_RANGES.special.end}.json`, // Special characters will live in R-Z.
    ];

    for (const tableName of tableNames) {
        const filePath = join(memoriesDirectory, tableName);

        try {
            // "wx" creates the file only if it does not already exist.
            await writeFile(filePath, "[]", {
                encoding: "utf-8",
                flag: "wx",
            });

            console.log(
                `[⚙️ Initialize Table of Memories] ${tableName} created.`,
            );
        } catch (error) {
            const fsError = error as NodeJS.ErrnoException;

            if (fsError.code === "EEXIST") {
                // File already exists; leave it untouched.
                console.log(
                    `[⚙️ Initialize Table of Memories] ${tableName} already exist.`,
                );
                continue;
            }

            console.error(
                `[⚙️ Initialize Table of Memories] Failed to create table of memories "${filePath}":`,
                error,
            );
        }
    }
}

// Will populate the TOM files with all exisiting memories
// Should not be run often or automatically, expensive
async function initializeTableOfMemoriesFromLegacyPluginVersion(
    memoriesDirectory: string,
): Promise<void> {

    const functionName = "initializeTableOfMemoriesFromLegacyPluginVersion";

    // This is to disconnect the initialization from the main process so that querying the 
    // model to determine the keywords and summary do not stall the chat
    setTimeout(() => {
        void runInitialization().catch((error) => {
            console.error(
                `${functionName} failed:`,
                error,
            );
        });
    }, 0);

    async function runInitialization(): Promise<void> {
        const categories = await readdir(
            memoriesDirectory,
            { withFileTypes: true },
        );

        const existingMemoryFiles: string[] = [];

        for (const category of categories) {
            if (!category.isDirectory()) {
                continue;
            }

            if (category.name === "compactions") {
                continue;
            }

            const categoryPath = path.join(
                memoriesDirectory,
                category.name,
            );

            const files = await readdir(
                categoryPath,
                { withFileTypes: true },
            );

            const firstCharacter = category.name[0].toUpperCase();

            const tomFileName =
                firstCharacter >= `${TOM_RANGES.first.start}` && firstCharacter <= `${TOM_RANGES.first.end}`
                    ? `TOM_${TOM_RANGES.first.start}-${TOM_RANGES.first.end}.json`
                    : firstCharacter >= `${TOM_RANGES.second.start}` && firstCharacter <= `${TOM_RANGES.second.end}`
                        ? `TOM_${TOM_RANGES.second.start}-${TOM_RANGES.second.end}.json`
                        : `TOM_${TOM_RANGES.special.start}-${TOM_RANGES.special.end}.json`;

            const tomFilePath = path.join(
                memoriesDirectory,
                tomFileName,
            );

            let lockOwnerName: string | undefined;

            const lockFile = `${tomFilePath}.lock`;
            
            lockOwnerName = await acquireLock(lockFile, functionName);

            try {
                for (const file of files) {
                    if (
                        !file.isFile() ||
                        !file.name.toLowerCase().endsWith(".json")
                    ) {
                        continue;
                    }

                    const fileName = [
                        category.name,
                        file.name,
                    ].join("/");

                    const memoryFilePath = path.join(
                        categoryPath,
                        file.name,
                    );

                    existingMemoryFiles.push(fileName);

                    try {
                        const memoryStats = await stat(memoryFilePath);
                        const fileSizeKB = memoryStats.size / 1024;

                        let tableOfMemories: TableOfMemoriesEntity[] = [];

                        try {
                            const tomContent = await readFile(
                                tomFilePath,
                                "utf-8",
                            );

                            tableOfMemories = JSON.parse(tomContent);
                        } catch (error) {
                            const fsError = error as NodeJS.ErrnoException;

                            if (fsError.code !== "ENOENT") {
                                throw error;
                            }
                        }

                        const existingIndex = tableOfMemories.findIndex(
                            (entry) => entry.fileName === fileName,
                        );

                        // Skip initialization if the stored KB size matches.
                        if (
                            existingIndex !== -1 &&
                            tableOfMemories[existingIndex].fileSizeKB === fileSizeKB
                        ) {
                            console.log(
                                `[⚙️ Initialize Table of Memories] ${fileName} skipped [Reason: no changes].`,
                            );
                            continue;
                        }

                        // Missing entry or changed file size: reinitialize.
                        const memoryFragments =
                            await reconstructMemoryFragments(memoryFilePath);

                        const summaryReturnPackage =
                            await modelCallToCraftMemorySummaryAndKeywords(memoryFragments);

                        const { summary, keywords } =
                            extractSummaryAndKeywords(summaryReturnPackage);

                        const entity: TableOfMemoriesEntity = {
                            fileSizeKB,
                            fileName,
                            keywords,
                            summary,
                        };

                        if (existingIndex !== -1) {
                            console.log(
                                `[⚙️ Initialize Table of Memories] ${fileName} updated.`,
                            );
                            tableOfMemories[existingIndex] = entity;
                        } else {
                            console.log(
                                `[⚙️ Initialize Table of Memories] ${fileName} initialized.`,
                            );
                            tableOfMemories.push(entity);
                        }

                        await writeFile(
                            tomFilePath,
                            JSON.stringify(tableOfMemories, null, 4),
                            "utf-8",
                        );
                    } catch (error) {
                        console.error(
                            `Failed to initialize "${fileName}" in ${tomFileName}:`,
                            error,
                        );
                    }
                }
            } finally {
                if (lockOwnerName !== undefined) {
                    await releaseLock(lockFile, lockOwnerName);
                    lockOwnerName = undefined;
                }
            }
        }

        // Clean up abandoned entries in the TOM file
        // Normal memory seed deletion logic removes these normally, but this is insurance
        const tomFileNames = [
            `TOM_${TOM_RANGES.first.start}-${TOM_RANGES.first.end}.json`,
            `TOM_${TOM_RANGES.second.start}-${TOM_RANGES.second.end}.json`,
            `TOM_${TOM_RANGES.special.start}-${TOM_RANGES.special.end}.json`,
        ];

        for (const tomFileName of tomFileNames) {
            const tomFilePath = path.join(
                memoriesDirectory,
                tomFileName,
            );

            const lockFile = `${tomFilePath}.lock`;

            let lockOwnerName: string | undefined;

            lockOwnerName = await acquireLock(lockFile, functionName);

            try {
                let tableOfMemories: TableOfMemoriesEntity[] = [];

                try {
                    const tomContent = await readFile(
                        tomFilePath,
                        "utf-8",
                    );

                    tableOfMemories = JSON.parse(tomContent);
                } catch (error) {
                    const fsError = error as NodeJS.ErrnoException;

                    if (fsError.code !== "ENOENT") {
                        console.error(
                            `[⚙️ Initialize Table of Memories] `,
                            `${error}`
                        )
                    }
                }

                const filteredTableOfMemories = tableOfMemories.filter(
                    (entry) => existingMemoryFiles.includes(entry.fileName),
                );

                if (filteredTableOfMemories.length !== tableOfMemories.length) {
                    await writeFile(
                        tomFilePath,
                        JSON.stringify(filteredTableOfMemories, null, 4),
                        "utf-8",
                    );

                    console.log(
                        `[⚙️ Initialize Table of Memories] Removed stale entries from ${tomFileName}.`,
                    );
                }

            } finally {
                if (lockOwnerName !== undefined) {
                    await releaseLock(lockFile, lockOwnerName);
                    lockOwnerName = undefined;
                }
            }
        }

        console.warn(
            `[⚙️ Initialize Table of Memories] TABLES HAVE BEEN INITIALIZED/REFRESHED REMEMBER TO TURN THIS FEATURE OFF.`,
        );
    }
}

// Use model to craft the summary and keywords for the TOM files
async function modelCallToCraftMemorySummaryAndKeywords(
    memoryFragments: string,
): Promise<string> {
    const client = getController().client;
    const model = await client.llm.model();
    
    const prompt = `
        The user needs you the assistant to formulate a thorough summary of the provided User and Assistant message history.

        Ensure that the final summary you provide is a fair representation of the overall message history. Wrap your final summary in the exact tags of [BEGINNING_OF_SUMMARY] and [END_OF_SUMMARY].

        In addition to the summary, identify significant keywords which are relevant to this user and assistant message exchange. These keywords will serve as a quick lookup to determine the relevancy of this message history.

        Fewer keywords is better, so make sure the keywords you have chosen are impactful, relevant, and significant. Wrap the collection of keywords identified in the exact tags of [BEGINNING_OF_KEYWORDS] and [END_OF_KEYWORDS].

        If there are no significant or meaningful keywords it is acceptable to return an empty string enclosed by the relevant tags.

        If there is no significant or meaningful summary it is acceptable to return an empty string enclosed by the relevant tags.

        [BEGINNING OF MESSAGE HISTORY]: 
        ${memoryFragments}
        [END OF MESSAGE HISTORY]
        `.trim();

    const result = await model.respond(
        prompt,
        {
            temperature: 0,
        },
    );

    const cleanedText = result.content
        .replace(
            /^[\s\S]*?__LM_STUDIO_INTERNAL_LSEP_SYNTHETIC_REASONING_END_[A-Za-z0-9]+__/i,
            "",
        )
        .replace(/^[\s\S]*?```(?:json)?\s*/i, "")
        .replace(/\s*```[\s\S]*$/i, "")
        .trim();

    return cleanedText;
}

// Use model to extract Summary and Keywords returned by the model
// in a single string into separate fields based on the seperation tags we asked the model to append
export function extractSummaryAndKeywords(
    response: string,
): { summary: string; keywords: string } {
    const normalizeTag = (tag: string): string =>
        tag
            .replace(/[\s_-]+/g, "")
            .toUpperCase();

    const tagPattern =
        /\[\s*(BEGINNING[\s_-]*OF[\s_-]*(?:SUMMARY|KEYWORDS)|END[\s_-]*OF[\s_-]*(?:SUMMARY|KEYWORDS)|SUMMARY|KEYWORDS)\s*\]/gi;

    const tags: {
        type: "summary" | "keywords";
        kind: "begin" | "end";
        start: number;
        contentStart: number;
    }[] = [];

    for (const match of response.matchAll(tagPattern)) {
        const rawTag = normalizeTag(match[1]);
        const type = rawTag.endsWith("SUMMARY")
            ? "summary"
            : "keywords";

        const kind =
            rawTag.startsWith("BEGINNINGOF") ||
            rawTag === type.toUpperCase()
                ? "begin"
                : "end";

        tags.push({
            type,
            kind,
            start: match.index!,
            contentStart: match.index! + match[0].length,
        });
    }

    const result = {
        summary: "",
        keywords: "",
    };

    for (let i = 0; i < tags.length; i++) {
        const tag = tags[i];

        if (tag.kind !== "begin") {
            continue;
        }

        // Find the next opening tag of either section.
        const nextBegin = tags
            .slice(i + 1)
            .find((next) => next.kind === "begin");

        // Prefer the matching closing tag if it occurs first.
        const matchingEnd = tags
            .slice(i + 1)
            .find(
                (next) =>
                    next.type === tag.type &&
                    next.kind === "end",
            );

        const boundary =
            matchingEnd &&
            (!nextBegin || matchingEnd.start < nextBegin.start)
                ? matchingEnd.start
                : nextBegin?.start ?? response.length;

        result[tag.type] = response
            .slice(tag.contentStart, boundary)
            .trim();
    }

    return result;
}

// Helper to reconstruct the memory file's contents into a coherent User/Assistant Turn
// for the model to digest to craft a summary and choose keywords.
async function reconstructMemoryFragments(
    memoryFilePath: string,
): Promise<string> {
    const content = await readFile(memoryFilePath, "utf-8");
    const turns: MemoryTurn[] = JSON.parse(content);

    return turns
        .map(
            (turn, index) =>
                `[Turn ${index + 1}] User: ${turn.direct_input}\n` +
                `Assistant: ${turn.output}`,
        )
        .join("\n\n");
}

// Updates the TOM file with new entries, triggered by saveMemorySeed
// This is expected to add new memories to the appropriate TOM file,
// update summary and keywords of exisiting TOM files by taking the exisiting summary and keywords
// and merging them with the new content to that memory summarized
export async function updateTableOfMemoriesIncrementally(
    memoriesDirectory: string,
    category: string,
    name: string,
    seeds: MemorySeed[],
): Promise<void> {

    const functionName = "updateTableOfMemoriesIncrementally";

    setTimeout(() => {
        void runUpdateTom().catch((error) => {
            console.error(
                `${functionName} failed:`,
                error,
            );
        });
    }, 0);

    async function runUpdateTom(): Promise<void>{
        const firstCharacter = category[0].toUpperCase();

        const tomFileName =
            firstCharacter >= `${TOM_RANGES.first.start}` && firstCharacter <= `${TOM_RANGES.first.end}`
                ? `TOM_${TOM_RANGES.first.start}-${TOM_RANGES.first.end}.json`
                : firstCharacter >= `${TOM_RANGES.second.start}` && firstCharacter <= `${TOM_RANGES.second.end}`
                    ? `TOM_${TOM_RANGES.second.start}-${TOM_RANGES.second.end}.json`
                    : `TOM_${TOM_RANGES.special.start}-${TOM_RANGES.special.end}.json`;

        const tomFilePath = path.join(
            memoriesDirectory,
            tomFileName,
        );

        const fileName = `${category}/${name}.json`;

        const tomContent = await fs.readFile(
            tomFilePath,
            "utf-8",
        );

        const tableOfMemories: TableOfMemoriesEntity[] =
            JSON.parse(tomContent);

        const existingIndex = tableOfMemories.findIndex(
            (entry) => entry.fileName === fileName,
        );

        const existingEntry =
            existingIndex !== -1
                ? tableOfMemories[existingIndex]
                : undefined;

        // Send only the existing TOM summary/keywords and new seeds.
        const newMemoryFragments = seeds
            .map(
                (seed, index) =>
                    `[Turn ${index + 1}] User: ${seed.direct_input}\n` +
                    `Assistant: ${seed.output}`,
            )
            .join("\n\n");

        const consolidationInput = [
            "CURRENT SUMMARY:",
            existingEntry?.summary ?? "",
            "",
            "CURRENT KEYWORDS:",
            existingEntry?.keywords ?? "",
            "",
            "NEW MEMORY FRAGMENTS:",
            newMemoryFragments,
        ].join("\n");

        const summaryReturnPackage = await modelCallToUpdateMemorySummaryAndKeywords(consolidationInput);

        const { summary, keywords } = extractSummaryAndKeywords(summaryReturnPackage);

        const memoryFilePath = path.join(
            memoriesDirectory,
            category,
            `${name}.json`,
        );

        const memoryStats = await stat(memoryFilePath);

        const updatedEntry: TableOfMemoriesEntity = {
            fileSizeKB: memoryStats.size / 1024,
            fileName,
            keywords,
            summary,
        };

        if (existingIndex !== -1) {
            tableOfMemories[existingIndex] = updatedEntry;
        } else {
            tableOfMemories.push(updatedEntry);
        }

        await fs.writeFile(
            tomFilePath,
            JSON.stringify(tableOfMemories, null, 4),
            "utf-8",
        );
    }
}

// The prompt that asks the model to merge new user/assistant turns added to the memory file
// into the contents of the exisiting TOM keywords and summary
export async function modelCallToUpdateMemorySummaryAndKeywords(
    consolidationInput: string,
): Promise<string> {
    
    const client = getController().client;
    const model = await client.llm.model();
    
    const prompt = `
        The user needs you the assistant to update the CURRENT SUMMARY AND CURRENT KEYWORDS if there is any impactful, significant or relevant changes based on the addition of the NEW MEMORY FRAGMENTS.

        Ensure that the final summary you provide is faithful to the current summary and retains it's key elements and takes into account the additional content provided by the new memory fragments. Wrap your final summary in the exact tags of [BEGINNING_OF_SUMMARY] and [END_OF_SUMMARY].

        In addition to updating the summary, identify only significant keywords from the new memory fragments which are relevant enough to be add to the current keywords.

        Try to limit yourself to no more than 10 of the best suited keywords, so make sure the keywords you have chosen to add or remove are substantive. Wrap the collection of keywords identified in the exact tags of [BEGINNING_OF_KEYWORDS] and [END_OF_KEYWORDS].

        If there are no significant or meaningful keywords to add or remove return back the keywords that you originally received.

        If there is no significant or meaningful update to the summary return back the summary that you originally received.

        [BEGINNING OF PACKAGE]: 
        ${consolidationInput}
        [END OF PACKAGE]
        `.trim();

    const result = await model.respond(
        prompt,
        {
            temperature: 0,
        },
    );

    const cleanedText = result.content
        .replace(
            /^[\s\S]*?__LM_STUDIO_INTERNAL_LSEP_SYNTHETIC_REASONING_END_[A-Za-z0-9]+__/i,
            "",
        )
        .replace(/^[\s\S]*?```(?:json)?\s*/i, "")
        .replace(/\s*```[\s\S]*$/i, "")
        .trim();

    return cleanedText;
}

// This is triggered during the deletion memory logic
// Deletes any existing TOM entry that matches the deleted memory
export async function deleteMemoryFromTableOfMemories(
    memoriesDirectory: string,
    category: string,
    filename: string,
): Promise<string> {
    const firstCharacter = category[0].toUpperCase();

    const tomFileName =
        firstCharacter >= `${TOM_RANGES.first.start}` && firstCharacter <= `${TOM_RANGES.first.end}`
            ? `TOM_${TOM_RANGES.first.start}-${TOM_RANGES.first.end}.json`
            : firstCharacter >= `${TOM_RANGES.second.start}` && firstCharacter <= `${TOM_RANGES.second.end}`
                ? `TOM_${TOM_RANGES.second.start}-${TOM_RANGES.second.end}.json`
                : `TOM_${TOM_RANGES.special.start}-${TOM_RANGES.special.end}.json`;

    const tomFilePath = join(memoriesDirectory, tomFileName);

    const fileName = [
        category,
        filename,
    ].join("/");

    const tomContent = await readFile(tomFilePath, "utf-8");
    const tableOfMemories: TableOfMemoriesEntity[] =
        JSON.parse(tomContent);

    const filteredTableOfMemories = tableOfMemories.filter(
        (entry) => entry.fileName !== fileName,
    );

    if (filteredTableOfMemories.length !== tableOfMemories.length) {
        await writeFile(
            tomFilePath,
            JSON.stringify(filteredTableOfMemories, null, 4),
            "utf-8",
        );
    }

    return tomFileName;
}

//-------------------------------------------------
// FUZZY MEMORY RECALL
//-------------------------------------------------

// Gathers all the filenames and their keywords from all the TOMs
// To feed to the model to first identify which filenames have the most
// similar keywords matching the user's query.
// Note that the user's query is actually the model's "understanding" of the user's query
// not the user's direct userText.
export async function tableOfMemoriesSummariesLookup(
    query: string,
): Promise<string> {
    const memoriesDirectory = await memoryStore.getMemoriesDirectory();

    const tomFileNames = [
        `TOM_${TOM_RANGES.first.start}-${TOM_RANGES.first.end}.json`,
        `TOM_${TOM_RANGES.second.start}-${TOM_RANGES.second.end}.json`,
        `TOM_${TOM_RANGES.special.start}-${TOM_RANGES.special.end}.json`,
    ];

    // Load all TOM entries into memory.
    const allEntries: TableOfMemoriesEntity[] = [];

    for (const tomFileName of tomFileNames) {
        const tomFilePath = path.join(
            memoriesDirectory,
            tomFileName,
        );

        try {
            const content = await readFile(tomFilePath, "utf-8");
            const entries: TableOfMemoriesEntity[] = JSON.parse(content);

            allEntries.push(...entries);
        } catch (error) {
            const fsError = error as NodeJS.ErrnoException;

            // A missing TOM file is treated as an empty TOM.
            if (fsError.code === "ENOENT") {
                continue;
            }

            throw error;
        }
    }

    if (allEntries.length === 0) {
        return "";
    }

    // Build the compact keyword index for the first model call.
    const keywordIndex = allEntries
        .map(
            (entry) =>
                `[filename: "${entry.fileName}"\n` +
                `keywords: "${entry.keywords}"]`,
        )
        .join("\n\n");

    // First model call: select the best 8 filenames
    // across all TOM entries based on keyword relevance.
    const keywordMatches =
        await modelCallToSelectMemoryFilenamesByKeywords(
            query,
            keywordIndex,
        );

    const keywordMatchNames = parseReturnedFilenames(
        keywordMatches,
    );

    // Validate the returned filenames against the loaded entries.
    const entriesByFileName = new Map(
        allEntries.map((entry) => [entry.fileName, entry]),
    );

    const shortlistedEntries: TableOfMemoriesEntity[] = [];
    const seenNames = new Set<string>();

    for (const fileName of keywordMatchNames) {
        const entry = entriesByFileName.get(fileName);

        if (!entry || seenNames.has(fileName)) {
            continue;
        }

        seenNames.add(fileName);
        shortlistedEntries.push(entry);

        // Enforce a maximum of 8 candidates.
        if (shortlistedEntries.length === 8) {
            break;
        }
    }

    if (shortlistedEntries.length === 0) {
        return "";
    }

    // Build the filename + summary input for the second model call.
    const candidateSummaries = shortlistedEntries
        .map(
            (entry) =>
                `[filename: "${entry.fileName}"\n` +
                `summary: "${entry.summary}"]`,
        )
        .join("\n\n");

    // Second model call: return only filenames that are
    // relevant after evaluating their summaries.
    const summaryMatches =
        await modelCallToSelectMemoryFilenamesBySummaries(
            query,
            candidateSummaries,
        );

    const finalMatchNames = parseReturnedFilenames(
        summaryMatches,
    );

    // Build the final result from the original TOM entries.
    // Never rely on the model to reproduce summaries.
    const shortlistedByName = new Map(
        shortlistedEntries.map(
            (entry) => [entry.fileName, entry],
        ),
    );

    const finalResults: string[] = [];
    const finalSeenNames = new Set<string>();

    for (const fileName of finalMatchNames) {
        const entry = shortlistedByName.get(fileName);

        if (!entry || finalSeenNames.has(fileName)) {
            continue;
        }

        finalSeenNames.add(fileName);

        finalResults.push(
            `Filename: ${entry.fileName}\n` +
            `Summary: ${entry.summary}`,
        );
    }

    if (finalResults.length === 0) {
        return "";
    }

    return(
        finalResults.join("\n\n")
    );
}

// Prompt to ask the model to choose the best matching keywords and return the file names only in a string array.
// Must be a string array because i've seen a model return strings only they do not follow strict and reliable
// formatting. Allowing them to return a string means they may feel like adding **filename** or return their conclusions
async function modelCallToSelectMemoryFilenamesByKeywords(
    query: string,
    keywordIndex: string,
): Promise<string> {
    const client = getController().client;
    const model = await client.llm.model();

    const prompt = `
        The user needs you the assistant to return to them the filenames of the KEYWORD ENTRIES that somewhat matches their user query.

        Do not consider filenames name as part of your analysis when matching for keywords.

        Limit yourself to at most 8 filenames of matching keyword entries. It is acceptable to return nothing if there are no good matches.

        Return the simple text formatted filename matches in a single string array.

        User Query: ${query}. 

        [BEGINNING OF KEYWORDS ENTRIES]: 
        ${keywordIndex}
        [END OF KEYWORDS ENTRIES]
        `.trim();

    const result = await model.respond(
        prompt,
        {
            temperature: 0,
        },
    );

    const cleanedText = result.content
        .replace(
            /^[\s\S]*?__LM_STUDIO_INTERNAL_LSEP_SYNTHETIC_REASONING_END_[A-Za-z0-9]+__/i,
            "",
        )
        .replace(/^[\s\S]*?```(?:json)?\s*/i, "")
        .replace(/\s*```[\s\S]*$/i, "")
        .trim();

    return cleanedText;
}

// Prompt to ask the model to choose the best matching summaries after we've filtered by a keywords similarity match
// Must be a string array because i've seen a model return strings only they do not follow strict and reliable
// formatting. Allowing them to return a string means they may feel like adding **filename** or return their conclusions
async function modelCallToSelectMemoryFilenamesBySummaries(
    query: string,
    candidateSummaries: string,
): Promise<string> {
    const client = getController().client;
    const model = await client.llm.model();

    const prompt = `
        The user needs you the assistant to return to them the filenames of the SUMMARIES ENTRIES that best matches their user query.

        Best matches does not require exact word matches, you may match for similar meaning or themes.

        Limit yourself to at most 5 filenames of the best matching summaries. It is acceptable to return nothing if there are no good matches.

        Return the simple text formatted filename matches in a single string array.

        User Query: ${query}. 

        [BEGINNING OF SUMMARIES ENTRIES]: 
        ${candidateSummaries}
        [END OF SUMMARIES ENTRIES]
        `.trim();

    const result = await model.respond(
        prompt,
        {
            temperature: 0,
        },
    );

    const cleanedText = result.content
        .replace(
            /^[\s\S]*?__LM_STUDIO_INTERNAL_LSEP_SYNTHETIC_REASONING_END_[A-Za-z0-9]+__/i,
            "",
        )
        .replace(/^[\s\S]*?```(?:json)?\s*/i, "")
        .replace(/\s*```[\s\S]*$/i, "")
        .trim();

    return cleanedText;
}

// Parse the string of a string array of filenames given by the model to an actual usable strings array.
function parseReturnedFilenames(response: string): string[] {
    const trimmedResponse = response.trim();

    // Prefer a JSON string array.
    try {
        const parsed: unknown = JSON.parse(trimmedResponse);

        if (
            Array.isArray(parsed) &&
            parsed.every((item) => typeof item === "string")
        ) {
            return parsed
                .map((fileName) => fileName.trim())
                .filter((fileName) => fileName.length > 0);
        }
    } catch {
        // Fall back to plain-text parsing.
    }

    return trimmedResponse
        .split(/\r?\n/)
        .map((line) => line.trim())
        .map((line) =>
            line
                .replace(/^(?:[-*•]|\d+[.)])\s*/, "")
                .replace(/^["'`]|["'`]$/g, "")
                .replace(/^\*+|\*+$/g, "")
                .trim(),
        )
        .filter((line) => line.length > 0);
}

//-------------------------------------------------
// TABLE OF MEMORIES LOOKUP
//-------------------------------------------------

export async function tableOfMemoriesDirectLookup(
    tomName: string,
): Promise<string> {
    const memoriesDirectory = await memoryStore.getMemoriesDirectory();

    const validTomFiles = [
        `TOM_${TOM_RANGES.first.start}-${TOM_RANGES.first.end}`,
        `TOM_${TOM_RANGES.second.start}-${TOM_RANGES.second.end}`,
        `TOM_${TOM_RANGES.special.start}-${TOM_RANGES.special.end}`,
    ];

    const normalizedTomName = tomName
        .trim()
        .replace(/\.json$/i, "")
        .toUpperCase();

    if (!validTomFiles.includes(normalizedTomName)) {
        return "";
    }

    const tomFilePath = path.join(
        memoriesDirectory,
        `${normalizedTomName}.json`,
    );

    try {
        return await readFile(tomFilePath, "utf-8");
    } catch (error) {
        const fsError = error as NodeJS.ErrnoException;

        if (fsError.code === "ENOENT") {
            return "not initialized";
        }

        throw error;
    }
}

//-------------------------------------------------
// String Constructors to replace Assistant's last Text with Prepared Content
//-------------------------------------------------
export function constructTOMSummariesLookupTable(
    returnPackage: string,
): string {
    const MEMORY_ENTRY_REGEX =
        /Filename:\s*(.*?)\s*Summary:\s*([\s\S]*?)(?=Filename:|$)/g;

    const entries: MemoryEntry[] = Array.from(
        returnPackage.matchAll(MEMORY_ENTRY_REGEX),
        ([, filename, summary]) => ({
        filename: filename.trim(),
        summary: summary.trim(),
        })
    );

    if (entries.length === 0) return "";

    const escape = (value: string) =>
        value
        .replace(/\|/g, "\\|")
        .replace(/\r?\n/g, "<br>");

    return [
        '📦 **`Memory Package`**',
        "| Filename | Summary |",
        "| --- | --- |",
        ...entries.map(
        ({ filename, summary }) =>
            `| ${escape(filename)} | ${escape(summary)} |`
        ),
    ].join("\n");
}

export function formatAsTableString(input: string): string {
    if (!input.trim()) return "";

    const data = JSON.parse(input);

    if (!Array.isArray(data)) return "";

    const escapeCell = (value: unknown): string =>
        String(value ?? "")
            .replace(/\|/g, "\\|")
            .replace(/\r?\n/g, " ");

    const headers = [
        "fileName",
        "fileSize (KB)",
        "Keywords",
        "Summary",
    ];

    return [
        '📦 **`Memory Package`**',
        `| ${headers.join(" | ")} |`,
        `| ${headers.map(() => "---").join(" | ")} |`,
        ...data.map((file: {
            fileName: string;
            fileSizeKB: number;
            keywords: string;
            summary: string;
        }) =>
            `| ${[
                file.fileName,
                Number(file.fileSizeKB).toFixed(2),
                file.keywords,
                file.summary,
            ].map(escapeCell).join(" | ")} |`
        ),
    ].join("\n");
}

export function constructNonExisitingMemoryString(
    memorySeedsPool: string[],
): string {
    return [
        '📦 **`Memory Package`**',
        "",
        `*That memory seed does not exist.* **These are your available memories:**`,
        "",
        ...memorySeedsPool.map(seed => `- ${seed}`),
    ].join("\n");
}

export function constructTomEmptyReturnPackage(
    extractedQuery: string,
): string {

    return [
        `## **No content was retrieved for the query:** ${extractedQuery}.`,
    ].join("\n");
}

//-------------------------------------------------
// Function for multiEditCoordinator
//-------------------------------------------------
export async function tryAppendTableOfMemoriesContentFunction(
    latestConversation: any,
    constructedTableString: string,
    targetAssistantMessageIndex: number,
): Promise<void> {

    let lines: string[] = [];

    lines.push(
        `${constructedTableString}`
    );

    await editAssistantResponse(
        latestConversation,
        lines.join("\n\n"),
        targetAssistantMessageIndex,
    );
}

export async function tryRetractOldTomsFunction(
    latestConversation: any,
    lastAssistantMessageIndex: number,
    retractOldToms: number,
    enableToolsMode: boolean,
): Promise<void> {
    if (retractOldToms === 0) return;

    const storedIndex = getLastKnownIndexOfRetractedToms();
    const startIndex = storedIndex ?? 0;

    const marker = "📦";
    
    const toolNames = new Set([
        "table_of_memories_lookup",
        "memory_seed_recall",
        "direct_memory_lookup",
        "compaction_file_fetch"
    ]);

    // Collect message indices that contain an assistant version.
    const assistantMessageIndices = latestConversation.messages
        .map((message: any, index: number) =>
            message.versions?.some(
                (version: any) => version.role === "assistant"
            )
                ? index
                : -1
        )
        .filter((index: number) => index !== -1);

    // Keep the last two assistant messages untouched.
    const excludedAssistantIndices = new Set(
        assistantMessageIndices.slice(-retractOldToms)
    );

    // Scan messages starting at the saved index.
    for (
        let messageIndex = startIndex;
        messageIndex < latestConversation.messages.length;
        messageIndex++
    ) {
        // Preserve the existing exclusion behavior.
        if (excludedAssistantIndices.has(messageIndex)) {
            continue;
        };

        const message = latestConversation.messages[messageIndex];

        // Process each assistant version independently.
        for (const version of message.versions ?? []) {
            if (version.role !== "assistant") continue;

            // TOOLS MODE:
            // Find the matching tool result, not assistant text or a tool request.
            if (enableToolsMode) {
                let matchingResultStepIndex = -1;

                for (
                    let stepIndex = 0;
                    stepIndex < (version.steps ?? []).length;
                    stepIndex++
                ) {
                    const step = version.steps[stepIndex];

                    // step.content directly contains the toolCallResult item.
                    for (const item of step.content ?? []) {
                        if (item.type !== "toolCallResult") continue;
                        if (!toolNames.has(item.name)) continue;
                        if (typeof item.content !== "string") continue;

                        // Check for the marker within the first five characters.
                        if (item.content.slice(0, 10).includes(marker)) {
                            // Retract only this matching tool result.
                            item.content = "Content Retracted";
                            matchingResultStepIndex = stepIndex;
                            break;
                        }
                    }

                    if (matchingResultStepIndex !== -1) break;
                }

                // Only retract the assistant response if a tool result matched.
                if (matchingResultStepIndex !== -1) {
                    // A matching tool result was found.
                    // Retract the subsequent normal assistant response.
                    for (
                        let stepIndex = matchingResultStepIndex + 1;
                        stepIndex < (version.steps ?? []).length;
                        stepIndex++
                    ) {
                        const step = version.steps[stepIndex];

                        // Skip thinking blocks.
                        if (step.style?.type === "thinking") continue;

                        const responseText = (step.content ?? []).find(
                            (item: any) =>
                                item.type === "text" &&
                                typeof item.text === "string"
                        );

                        if (responseText) {
                            responseText.text = "Content Retracted";
                            break;
                        }
                    }
                } else {
                    // No matching tool result: search assistant text directly.
                    for (const step of version.steps ?? []) {
                        // Skip thinking blocks.
                        if (step.style?.type === "thinking") continue;

                        for (const item of step.content ?? []) {
                            if (
                                item.type === "text" &&
                                typeof item.text === "string" &&
                                item.text.slice(0, 10).includes(marker)
                            ) {
                                item.text = "Content Retracted";
                                break;
                            }
                        }

                        // Stop after finding and retracting a matching response.
                        if (
                            (step.content ?? []).some(
                                (item: any) => item.type === "text" &&
                                    item.text === "Content Retracted"
                            )
                        ) {
                            break;
                        }
                    }
                }

                // Do not run the non-tools text-marker logic in tools mode.
                continue;
            }

            // NON-TOOLS MODE:
            // Find an assistant response containing the marker near the start,
            // while explicitly excluding thinking steps.
            let found = false;

            for (const step of version.steps ?? []) {
                // Never retract text from a thinking step.
                if (step.style?.type === "thinking") continue;

                // Inspect text items in this non-thinking step.
                for (const item of step.content ?? []) {
                    if (
                        item.type === "text" &&
                        typeof item.text === "string" &&
                        item.text.slice(0, 10).includes(marker)
                    ) {
                        // Retract the matching assistant response text.
                        item.text = "Content Retracted";
                        found = true;
                        break;
                    }
                }

                // Stop after retracting the first matching text item.
                if (found) break;
            }
        }
    }

    // Preserve the existing saved-index behavior.
    setLastKnownIndexOfRetractedToms(
        assistantMessageIndices.slice(-2)[0] ?? lastAssistantMessageIndex
    );
}