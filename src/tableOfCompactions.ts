import type { Dirent } from "node:fs";
import type { PendingSaveMemory } from "./config";
import { ChatMessage } from "@lmstudio/sdk";
import { cleanAssistantResponse, cleanUserInput, isEligibleAssistantMessage } from "./conversationReader";
import { editAssistantResponse, isMetadataOnlyOutput } from "./triggerSaveMemory";
import { addMemorySeedToPool } from "./memorySession";
import { MemorySeed, memoryStore } from "./memoryStore";
import { join, dirname } from "node:path";
import path from "node:path";
import fs from "node:fs/promises";

import { 
    getController, 
    addConversationOperation, 
    getValidatedConversationRootDirectory,
    getValidatedMemoriesRootDirectory,
    getConversationFileName,
    TOM_RANGES,
    getCompactionSummaryRegex,
    setPendingTomCommand,
    getListCompactionSeedsRegex,
    getContextCleanupPluginInUse
} from "./config";

import {
    writeFile,
    readFile,
    readdir,
    stat,
    unlink,
    mkdir,
} from "node:fs/promises";

import {
    extractSummaryAndKeywords,
    modelCallToUpdateMemorySummaryAndKeywords,
    TableOfMemoriesEntity
} from "./tableOfMemories";

export interface TableOfCompactionsEntityCollection {
    date_created_group: string;
    members_fileName: string[];
    engrained_fileName: string[];
}

export interface TableOfCompactionsEntity {
    fileSizeKB: number;
    fileName: string;
    keywords: string;
    summary: string;
    preceding_compacation_fileName: string;
}

interface CompactionSnapshotParams {
    keepOldestN: number;
    keepNewestN: number;
    conversationName: string;
    autoCleanupThreshold: number;
}

interface CompactionSnapshot {
    params: CompactionSnapshotParams;
    messages: ChatMessage[];
}

type ExtractedMessage = {
    memoryNumber: number;
    direct_input: string;
    output: string;
};

export async function tableOfCompactionsMain(
    deleteTocCollectionsAfterNthDays: number,
): Promise<void> {

    if(deleteTocCollectionsAfterNthDays > 0) {
        await deleteExpiredCompactionsAndTocCleanup(deleteTocCollectionsAfterNthDays);
    }

    const contextCleanupPluginInUse = getContextCleanupPluginInUse();

    if (contextCleanupPluginInUse === false) return;

    const memoriesDirectory = await memoryStore.getMemoriesDirectory();

    const parsedCompactionFileData = await findShadowCopyAndParse();

    if (parsedCompactionFileData === null) return;

    await createTableOfCompactions(memoriesDirectory);

    await processCompactionFileDataAndCreateMemorySeeds(parsedCompactionFileData);
}

/**
 * Process user text if they're trying to get a summary or list the compaction seeds.
 * List compaction seed command works in both tools and explicit mode.
 * Tools mode has it's own summary call. This is the explicit's summary function.
 */
export async function processMessageForCompaction(
    userText: string,
    enableToolsMode: boolean,
): Promise<void>{

    const COMPACTION_SUMMARY_REGEX = getCompactionSummaryRegex();
    const LIST_COMPACTION_SEEDS_REGEX = getListCompactionSeedsRegex();

    const compactionSummaryMatch = userText.match(COMPACTION_SUMMARY_REGEX);
    const listCompactionSeedsMatch = userText.match(LIST_COMPACTION_SEEDS_REGEX);

    let constructedSummaryString = "";

    if (listCompactionSeedsMatch) {
        const allCompactionSeedsAvailable = await listCompactionSeeds(true);    // true for table format return

        constructedSummaryString = allCompactionSeedsAvailable;

        if (constructedSummaryString !== "") {
            // Inject the constructedTableString into the newest assistant message.
            addConversationOperation(
                "tryAppendCompactionSummaryFunction",
                {
                    constructedSummaryString,
                },
            );
            
            setPendingTomCommand("ready");
        }

        return;
    }

    if (enableToolsMode) return;

    if (compactionSummaryMatch) {

        const allSeeds: string[] = (
            await scanForAndReturnMatchingFiles()
        ).map(entry => entry.name);
        
        const requestedFileName = extractCompactionFileName(
            userText,
            allSeeds,
        );

        if (!requestedFileName) return;

        // Check the TOC_Seeds Directory if there is a file matching the request
        constructedSummaryString = await createCompactionSummary(requestedFileName);

        // Fetch only validatedSeedsToFetch.
        if (constructedSummaryString !== "") {
            // Inject the constructedTableString into the newest assistant message.
            addConversationOperation(
                "tryAppendCompactionSummaryFunction",
                {
                    constructedSummaryString,
                },
            );

            setPendingTomCommand("ready");
        }
    }
}

//-------------------------------------------------
// TABLE OF COMPACTION FILE MAINTANENCE
//-------------------------------------------------

/**
 * Creates/Intializes the Compaction related folders and files
 */
async function createTableOfCompactions(
    memoriesDirectory: string,
): Promise<void> {
    const now = new Date();

    const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
    ].join("-");

    const compactionsDirectory = path.join(
        memoriesDirectory,
        "compactions",
    );

    const tocEntityDirectory = path.join(
        compactionsDirectory,
        "TOC_Entity",
    );

    const tocSeedsDirectory = path.join(
        compactionsDirectory,
        "TOC_Seeds",
    );

    const tocSummariesDirectory = path.join(
        compactionsDirectory,
        "TOC_Summaries",
    );

    await mkdir(tocEntityDirectory, { recursive: true });
    await mkdir(tocSeedsDirectory, { recursive: true });
    await mkdir(tocSummariesDirectory, { recursive: true });

    const filePath = path.join(
        tocEntityDirectory,
        `TOC_${today}.json`,
    );

    try {
        await writeFile(filePath, "[]", {
            encoding: "utf-8",
            flag: "wx",
        });

    } catch (error) {

        return;
    }

    const collectionsFilePath = path.join(
        compactionsDirectory,
        "TOC_Collections.json",
    );

    // Create the collections file if it doesn't exist.
    try {
        await writeFile(collectionsFilePath, "[]", {
            encoding: "utf-8",
            flag: "wx",
        });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
            console.error(
                `Failed to create collections TOC "${collectionsFilePath}":`,
                error,
            );
            return;
        }
    }

    try {
        const contents = await readFile(
            collectionsFilePath,
            "utf-8",
        );

        const collections: TableOfCompactionsEntityCollection[] =
            JSON.parse(contents);

        const existingCollection = collections.some(
            collection => collection.date_created_group === today,
        );

        if (!existingCollection) {
            collections.push({
                date_created_group: today,
                members_fileName: [],
                engrained_fileName: [],
            });

            await writeFile(
                collectionsFilePath,
                JSON.stringify(collections, null, 2),
                "utf-8",
            );
        }
    } catch (error) {
        console.error(
            `Failed to update collections TOC "${collectionsFilePath}":`,
            error,
        );
    }
}

/**
 * Gathers all the compaction seeds in the TOC_Seeds folder and displays it for the user.
 */
export async function listCompactionSeeds(
    tableFormat: boolean,
): Promise<string> {
    const memoriesDirectory = getValidatedMemoriesRootDirectory();

    const tocSeedsDirectory = path.join(
        memoriesDirectory,
        "compactions",
        "TOC_Seeds",
    );

    const availableFiles = (await fs.readdir(tocSeedsDirectory, {
        withFileTypes: true,
    }))
        .filter(entry => entry.isFile())
        .map(entry => entry.name)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    if (availableFiles.length === 0) {
        return "No compaction seeds are available.";
    }

    const groupedFiles = new Map<string, string[]>();

    for (const fileName of availableFiles) {
        const baseFileName = fileName.replace(
            /_c\d+_p\d+(?: - Copy)?\.json$/i,
            "",
        );

        const existingFiles = groupedFiles.get(baseFileName) ?? [];
        existingFiles.push(fileName);
        groupedFiles.set(baseFileName, existingFiles);
    }
    
    let index = 1;

    if (!tableFormat) {
        return availableFiles
            .map((fileName, index) => `${index + 1}. ${fileName}`)
            .join("\n");
    }

    const rows = [...groupedFiles.entries()].map(
        ([baseFileName, fileNames]) => {
            const numberedFiles = fileNames
                .map(fileName => `${index++}. ${fileName}`)
                .join("<br>");

            return `| ${baseFileName} | ${numberedFiles} |`;
        },
    );

    return [
        '📦 **`Compaction List Package`**',
        "| Base Name | Compaction Seed Files |",
        "|---|---|",
        ...rows,
    ].join("\n");
}

/**
 * Checks the specific conversation folder to see if any .copy exist.
 * The folder checked will only ever be the direct folder where the related conversation file exist.
 * So no extra drilling allowed for nested folders. Helps save processing power.
 * If a .copy file is found (name does not matter, done on purpose, so an unresolved .copy files still has a chance to be made into a compaction seed)
 * then it will be read and parsed into memory.
 */
async function findShadowCopyAndParse(): Promise<({ filePath: string } & CompactionSnapshot) | null> {
    const conversationsDirectory = getValidatedConversationRootDirectory();
    const conversationFile = getConversationFileName();

    const relativeConversationDirectory = join(
        conversationsDirectory,
        dirname(conversationFile),
    );

    const entries = await readdir(relativeConversationDirectory, {
        withFileTypes: true,
    });

    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".copy")) {
            continue;
        }

        const fullPath = join(relativeConversationDirectory, entry.name);
        const fileContents = await readFile(fullPath, "utf-8");
        const snapshot: CompactionSnapshot = JSON.parse(fileContents);

        return {
            filePath: fullPath,
            ...snapshot,
        };
    }

    return null;
}

/**
 * The main processing of the copy file contents in memory into a compaction seed. This is the director of all the work.
 */
async function processCompactionFileDataAndCreateMemorySeeds(
    parsedCompactionFileData: ({ filePath: string } & CompactionSnapshot),
): Promise<boolean> {
    const filePath = parsedCompactionFileData.filePath;
    const parsedCompactionFileDataParams = parsedCompactionFileData.params;
    const messages: ChatMessage[] = parsedCompactionFileData.messages;
    const fileName = parsedCompactionFileDataParams.conversationName;

    // Determines the maximum number of parts expected. Trying to keep each part worth 20% of the user's context window.
    const splitToParts = parsedCompactionFileDataParams.autoCleanupThreshold <= 60 ? 3 : 4;

    // Account for the latest assistant response missing from the array.
    const totalAssistantResponses = messages.filter(isEligibleAssistantMessage).length + 1;

    const firstResponse = parsedCompactionFileDataParams.keepOldestN + 1;
    const lastResponse = totalAssistantResponses - parsedCompactionFileDataParams.keepNewestN;
    const responsesToCompact = Math.max(
        0,
        lastResponse - firstResponse,
    );

    // Never create more parts than there are responses to save.
    const numberOfParts = Math.min(splitToParts, responsesToCompact);

    const matchingFiles = await scanForAndReturnMatchingFiles(fileName);

    const escapeRegExp = (value: string): string =>
        value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const compactionPattern = new RegExp(
        `^${escapeRegExp(fileName)}_c(\\d+)_p(\\d+)\\.json$`,
    );

    const highestCompactionNumber = matchingFiles.reduce(
        (highest, entry) => {
            const match = entry.name.match(compactionPattern);
            return Math.max(highest, Number(match?.[1] ?? 0));
        },
        0,
    );

    const nextCompactionNumber = highestCompactionNumber + 1;
 
    const isFirstCompaction = matchingFiles.length === 0;

    let handledFirstCompaction = !isFirstCompaction;

    if (numberOfParts === 0) {
        return false;
    }

    // Distribute responses evenly; put any remainder in the last part.
    const baseSize = Math.floor(responsesToCompact / numberOfParts);
    const remainder = responsesToCompact % numberOfParts;

    let seedsWereSaved = false;

    let matchingFilesAndNewAdditions: string[] = matchingFiles.map(
        entry => entry.name,
    );

    // Stringified Messages goes to model to use for topics.
    // Extracted Messages go to be saved.
    const { stringifiedMessages, extractedMessages } = await prepareHistoryMessagesForModel(messages);

    const topicsForMessages = await modelCallToProvideTopics(stringifiedMessages);

    for (let part = 1; part <= numberOfParts; part++) {
        const startOffset = (part - 1) * baseSize;

        const endOffset =
            part * baseSize +
            (part === numberOfParts ? remainder : 0);

        const pendingSaveMemory: PendingSaveMemory = {
            active: true,
            memoryNumber: handledFirstCompaction
                ? firstResponse + startOffset
                : 1,
            category: "compactions",
            fileName: `${fileName.trim()}_c${nextCompactionNumber}_p${part}`,
            memoryNumberEndRange: firstResponse + endOffset - 1,
        };

        // Includes the new additions into the array we pass along to construct the trail text replacement
        matchingFilesAndNewAdditions.push(
            `${pendingSaveMemory.fileName}.json`,
        );

        const saveResults = await multiSaveMemoryForCompaction(
            pendingSaveMemory,
            extractedMessages,
            topicsForMessages,
            matchingFilesAndNewAdditions,
        );

        // console.log("PART SAVE RESULT", {
        //     part,
        //     fileName: pendingSaveMemory.fileName,
        //     start: pendingSaveMemory.memoryNumber,
        //     end: pendingSaveMemory.memoryNumberEndRange,
        //     saveResults,
        // });

        // Logs if any seed saved at all. Triggers early exit if seeds were all filtered out because the user message/assistant response was considered metadata only
        if (seedsWereSaved === false) {
            seedsWereSaved = saveResults;
        }

        // this makes sure the excluded beginning messages are included in the first part save, otherwise they would never
        // enter the compaction chain and be lost data.
        if (!handledFirstCompaction) {
            handledFirstCompaction = true;
        }
    }

    // No seeds were saved successfully
    if (!seedsWereSaved) {
        return false;
    }

    addConversationOperation(
        "tryAppendTOCTrailFunction",
        {
            matchingFilesAndNewAdditions,
        },
    );

    // All parts saved successfully.
    await unlink(filePath);
    return true;
}

/**
 * A customized multiSaveMemory function specifically for compactions. Prepares all the data into the form to run saveMultipleSeeds.
 */
export async function multiSaveMemoryForCompaction(
    updated: PendingSaveMemory,
    extractedMessages: ExtractedMessage[],
    topicsForMessages: string,
    matchingFilesAndNewAdditions: string[],
): Promise<boolean> {

    const {
        memoryNumber: startMemoryNumber,
        memoryNumberEndRange: endMemoryNumber,
        category,
        fileName,
    } = updated;

    if (
        startMemoryNumber == null ||
        endMemoryNumber == null ||
        category == null ||
        fileName == null
    ) {
        return false;
    }

    try {
        const seeds: MemorySeed[] = [];

        for (
            let memoryNumber = startMemoryNumber;
            memoryNumber <= endMemoryNumber;
            memoryNumber++
        ) {
            const message = extractedMessages.find(
                item => item.memoryNumber === memoryNumber,
            );

            if (!message) {
                console.warn(`No extracted message found for memory ${memoryNumber}`);
                continue;
            }

            const output = cleanAssistantResponse(message.output);

            if (isMetadataOnlyOutput(output)){
                // console.log(memoryNumber,"======skipped")
                continue;
            }

            const cleanedDirectInput = cleanUserInput(message.direct_input?.trim());
            const cleanedRootInput = cleanUserInput(getTopicForMessage(memoryNumber, topicsForMessages).trim());
            // console.log(
            //     "memoryNumber:",memoryNumber,
            // ),
            seeds.push({
                date: new Date().toISOString(),
                root_input: cleanedRootInput,
                direct_input: cleanedDirectInput,
                output: output,
            });
        }

        // No eligible seeds were collected.
        if (seeds.length === 0) {
            return false;
        }

        // Save all collected seeds in one write operation.
        return await memoryStore.saveMultipleSeeds(
            category,
            fileName,
            seeds,
            startMemoryNumber,
            true, // callerIsCompaction
            matchingFilesAndNewAdditions,
        );

    } catch (error) {
        console.error(
            "Error creating Memory Seed: " +
            `${error instanceof Error ? error.message : String(error)}`,
        );

        return false;
    }
}

/**
 * Prepares the .copy file contents to a string organized and readable by the model to provide topics.
 * The method is different from ChatMessages[], during a session we can use the .getMessagesArray() to extract the text.
 * Because the shadow .copy is formatted like the ChatMessages[] but does not carry the built-in functions, we have to alter the text extraction method.
 */
export async function prepareHistoryMessagesForModel(
    messages: ChatMessage[],
): Promise<{
    stringifiedMessages: string;
    extractedMessages: ExtractedMessage[];
}> {
    const LM_STUDIO_THINKING_END =
        /__LM_STUDIO_INTERNAL_LSEP_SYNTHETIC_REASONING_END_[a-z0-9]+__/i;

    let turn = 0;
    let conversationText = "";

    const extractedMessages: ExtractedMessage[] = [];

    messages
        .filter(message => {
            const role = (message as any).data.role;
            return role === "user" || role === "assistant";
        })
        .forEach(message => {
            const role = (message as any).data.role;
            const content = (message as any).data?.content ?? [];

            if (role === "user") {
                turn++;

                const text =
                    content
                        .find((item: any) => item.type === "text")
                        ?.text?.trim() ?? "";

                extractedMessages.push({
                    memoryNumber: turn,
                    direct_input: text,
                    output: "",
                });

                conversationText += `[${turn}]User: "${text}"\n`;
                return;
            }

            const text = content
                .filter(
                    (item: any) =>
                        item.type === "text" &&
                        typeof item.text === "string" &&
                        item.text.trim() !== "" &&
                        !LM_STUDIO_THINKING_END.test(item.text.trim()),
                )
                .at(-1)
                ?.text.trim() ?? "";

            const currentMessage = extractedMessages.find(
                item => item.memoryNumber === turn,
            );

            if (currentMessage) {
                currentMessage.output = text;
            }

            conversationText +=
                `[${turn}]Assistant response: "${text}"\n`;
        });

    return {
        stringifiedMessages: conversationText,
        extractedMessages,
    };
}

/**
 * Ask the model to go through the stringified messages and provide topics or the root_input for each entry.
 * This is to make the compaction seed file semi-conform to a memory seed file. This method is like a fuzzy shortcut and was done so that 
 * we do not expend extra processing power using the memory seed normal route of asking the model to associate each assisatant message
 * to the root user message 1 by 1. Trade off of less accuracy for more speed and less processing.
 */
async function modelCallToProvideTopics(
    conversationText: string,
): Promise<string> {
    const client = getController().client;
    const model = await client.llm.model();
    
    const prompt = `
        Provided to you is a chat transcript between a user and assistant with a prefix labeling each turn which it belongs too.

        The user needs you the assistant to comb through the chat transcript and assign a topic to a range of similarly related user and assistant messages.

        These messages are ordered chronologically, the initial topic should be established by the earliest messages. Any distinct change and shift in topic should be noted.

        All message turns must belong to a topic group. Do not exclude any range and ensure full coverage. Leave no gaps between the end of one range and the beginning of another.

        Only meaningful topics should be noted. If a topic does not carry much weight to the conversation or is irrelevant, roll that turn into the next topic of significance.

        You are not trying to determine every possible topic present. You are only trying to determine the topics of importance.

        If topics switch back to an earlier topic that was deviated from, then the topic and it's associated ranges should be noted.

        The user expects a string to be returned formatted strictly as [Topic: <Topic> 🔹 <beginning_of_number_range> - <ending_of_number_range>] for every topic that you have identify.

        Use the 🔹 emoji as the mandatory separator between the topic name and the numeric range.

        Topics are not minor differences in nuances, they must be significant shifts in tone, subject, goal, inquiry, or results.

        [BEGINNING OF CHAT TRANSCRIPT]: 
        ${conversationText}
        [END OF CHAT TRANSCRIPT]
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

/**
 * Helper: The model has already provided the topic and the ranges of where each message falls within those topic ranges.
 * This associates which message belongs to which model assigned topic and returns the root_input (topic) for it.
 */
function getTopicForMessage(
    memoryNumber: number,
    topicsForMessages: string,
): string {
    const topicPattern =
        /Topic:\s*(.*?)\s*🔹\s*(\d+)\s*-\s*(\d+|end)/gi;

    const topicRanges = [...topicsForMessages.matchAll(topicPattern)].map(
        match => ({
            topic: match[1].replace(/[\[\]\/]/g, "").trim(),
            start: Number(match[2]),
            end: match[3].toLowerCase() === "end"
                ? Infinity
                : Number(match[3]),
        }),
    ).sort((a, b) => a.start - b.start);

    const matchingRange = topicRanges.find(
        range =>
            memoryNumber >= range.start &&
            memoryNumber <= range.end,
    );

    if (matchingRange) {
        return matchingRange.topic;
    }

    // Fallback because the model has shown to sometimes leave gaps in topic range coverage.
    // So some memoryNumbers dont belong to anything. This will roll it over into a neighboring available topic.
    // I've tweaked the prompt and topic parser to allow for variances in the return of the topics string. This another layer of insurance.
    const nextRange = topicRanges.find(
        range => range.start > memoryNumber,
    );

    if (nextRange) {
        return nextRange.topic;
    }

    const previousRanges = topicRanges.filter(
        range => range.end < memoryNumber,
    );

    return previousRanges.length > 0
        ? previousRanges[previousRanges.length - 1].topic
        : "";
}

/**
 * Create the TOC_Seeds file and TOC_Entity file for this new addition
 */
export async function updateTableOfCompactionsIncrementally(
    memoriesDirectory: string,
    category: string,
    name: string,
    seeds: MemorySeed[],
    matchingFilesAndNewAdditions?: string[],
): Promise<void> {

    const now = new Date(Date.now());

    const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
    ].join("-");

    const tableName = `TOC_${today}.json`;

    const tocFilePath = path.join(
            memoriesDirectory,
            "compactions",
            "TOC_Entity",
            tableName
        );

    const fileName = `${name}.json`;

    const tomContent = await fs.readFile(
        tocFilePath,
        "utf-8",
    );
    
    const tableOfMemories: TableOfCompactionsEntity[] =
        JSON.parse(tomContent);

    const existingIndex = tableOfMemories.findIndex(
        (entry) => entry.fileName === fileName,
    );

    const existingEntry =
        existingIndex !== -1
            ? tableOfMemories[existingIndex]
            : undefined;

    // // Send only the existing TOM summary/keywords and new seeds.
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
        "compactions",
        "TOC_Seeds",
        `${name}.json`,
    );

    const memoryStats = await stat(memoryFilePath);

    if (matchingFilesAndNewAdditions === undefined) return;

    const currentIndex = matchingFilesAndNewAdditions.indexOf(fileName);

    const preceding_compacation_fileName =
        currentIndex > 0
            ? matchingFilesAndNewAdditions[currentIndex - 1]
            : "";

    const updatedEntry: TableOfCompactionsEntity = {
        fileSizeKB: memoryStats.size / 1024,
        fileName,
        keywords,
        summary,
        preceding_compacation_fileName,
    };

    if (existingIndex !== -1) {
        tableOfMemories[existingIndex] = updatedEntry;
    } else {
        tableOfMemories.push(updatedEntry);
    }

    await fs.writeFile(
        tocFilePath,
        JSON.stringify(tableOfMemories, null, 4),
        "utf-8",
    );
}

/**
 * Add the new compaction to the members list of the collections file
 */
export async function updateTocCollectionsIncrementally(
    name: string,
): Promise<void> {

    const fileName = name.endsWith(".json")
        ? name
        : `${name}.json`;
    
    const memoriesDirectory = getValidatedMemoriesRootDirectory();

    const compactionsDirectory = path.join(
        memoriesDirectory,
        "compactions",
    );

    const collectionsFilePath = path.join(
        compactionsDirectory,
        "TOC_Collections.json",
    );

    const now = new Date();
    const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
    ].join("-");

    try {
        await fs.mkdir(compactionsDirectory, { recursive: true });

        let collections: TableOfCompactionsEntityCollection[];

        try {
            const contents = await fs.readFile(
                collectionsFilePath,
                "utf-8",
            );

            collections = JSON.parse(contents);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                throw error;
            }

            collections = [];
        }

        let todayEntry = collections.find(
            entry => entry.date_created_group === today,
        );

        if (!todayEntry) {
            todayEntry = {
                date_created_group: today,
                members_fileName: [],
                engrained_fileName: [],
            };

            collections.push(todayEntry);
        }

        if (!todayEntry.members_fileName.includes(fileName)) {
            todayEntry.members_fileName.push(fileName);
        }

        await fs.writeFile(
            collectionsFilePath,
            JSON.stringify(collections, null, 2),
            "utf-8",
        );
    } catch (error) {
        console.error(
            `[TOC COLLECTIONS] Failed to update "${collectionsFilePath}":`,
            error,
        );
    }
}

/**
 * Returns the compaction seeds matching the file name provided.
 * Heythere will gather all of the Heythere compactions and parts.
 * If no file name is provided then return all available compaction seeds in the folder.
 */
export async function scanForAndReturnMatchingFiles(
    fileName?: string,
): Promise<Dirent[]> {
    const memoriesDirectory = getValidatedMemoriesRootDirectory();

    const compactionsSeedsDirectory = join(
        memoriesDirectory,
        "compactions",
        "TOC_Seeds",
    );

    let entries: Dirent[];

    try {
        entries = await readdir(compactionsSeedsDirectory, {
            withFileTypes: true,
        });
    } catch (error) {
        const fsError = error as NodeJS.ErrnoException;

        if (fsError.code === "ENOENT") {
            return [];
        }

        throw error;
    }

    // No filename provided: return all available seed files.
    if (fileName === undefined) {
        return entries
            .filter(entry => entry.isFile() && entry.name.endsWith(".json"))
            .sort((a, b) =>
                a.name.localeCompare(b.name, undefined, {
                    sensitivity: "base",
                }),
            );
    }

    // Original behavior: find compaction parts for the specified base filename.
    const escapeRegExp = (value: string): string =>
        value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const compactionPattern = new RegExp(
        `^${escapeRegExp(fileName)}_c(\\d+)_p(\\d+)\\.json$`,
    );

    return entries
        .filter(
            entry =>
                entry.isFile() &&
                compactionPattern.test(entry.name),
        )
        .sort((a, b) => {
            const matchA = a.name.match(compactionPattern)!;
            const matchB = b.name.match(compactionPattern)!;

            const compactionA = Number(matchA[1]);
            const compactionB = Number(matchB[1]);

            if (compactionA !== compactionB) {
                return compactionA - compactionB;
            }

            return Number(matchA[2]) - Number(matchB[2]);
        });
}

/**
 * Checks if the actual compaction seed file exist
 */
export async function compactionSeedExists(
    name: string,
): Promise<boolean> {

    const memoriesDirectory = getValidatedMemoriesRootDirectory();

    if (!/^.+_c\d+_p\d+\.json$/i.test(name)) {
        return false;
    }

    const compactionsSeedsDirectory = join(
        memoriesDirectory,
        "compactions",
        "TOC_Seeds",
    );

    try {
        const stats = await fs.stat(
            join(compactionsSeedsDirectory, name),
        );
        return stats.isFile();
    } catch {
        return false;
    }
}

/**
 * Checks if the memory seed already exists
 */
export async function enCompactionSeedExists(
    extractedInputs: CompactionSeed,
): Promise<boolean> {

    const { memorySeed } = extractedInputs;

    const memoryMatch = memorySeed.match(
        /^([^/\\]+)\/([^/\\]+\.json)$/i,
    );

    if (!memoryMatch) {
        return false;
    }

    // Skips the first match which is the full match of the entire string
    const [, category, name] = memoryMatch;

    const memoriesDirectory = getValidatedMemoriesRootDirectory();

    const categoryDirectory = join(
        memoriesDirectory,
        category,
    );

    try {
        const stats = await fs.stat(
            join(categoryDirectory, name),
        );
        return stats.isFile();
    } catch {
        return false;
    }
}

/**
 * Creates an on-demand compaction summary for the user if they ask for it.
 * The results are then saved and cached in case the user asks for it again in the future.
 * Rather than process it brand new return to them the cached version.
 */
export async function createCompactionSummary(
    requestedFileName: string,
):Promise<string> {
    const memoriesDirectory = getValidatedMemoriesRootDirectory();

    const compactionsDirectory = path.join(
        memoriesDirectory,
        "compactions",
    );

    const tocSeedsDirectory = path.join(
        compactionsDirectory,
        "TOC_Seeds",
    );

    const tocSummariesDirectory = path.join(
        compactionsDirectory,
        "TOC_Summaries",
    );
    
    const availableFiles = (await fs.readdir(tocSeedsDirectory, {
        withFileTypes: true,
    }))
        .filter(entry => entry.isFile())
        .map(entry => entry.name)
        .filter(name => /^.+_c\d+_p\d+\.json$/i.test(name));

    const exactMatch = availableFiles.find(
        name => name.toLowerCase() === requestedFileName.toLowerCase(),
    ) ?? null;

    if (exactMatch === null) return "";

    const compactionSeedFile = path.join(
        tocSeedsDirectory,
        exactMatch,
    );

    const compactionSummaryFile = path.join(
        tocSummariesDirectory,
        exactMatch,
    );

    let modelReturnPackage: string;

    // Checks if we've already made a cached version of the summary, send this instead of doing a new call to the model.
    try {
        const cachedSummary = await fs.readFile(
            compactionSummaryFile,
            "utf-8",
        );

        modelReturnPackage = JSON.parse(cachedSummary) as string;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
        }

        const stringifiedMessages =
            await constructCompactionToInject(
                compactionSeedFile,
            );

        modelReturnPackage =
            await modelCallForOnDemandSummary(stringifiedMessages);

        await fs.mkdir(tocSummariesDirectory, { recursive: true });

        await fs.writeFile(
            compactionSummaryFile,
            JSON.stringify(modelReturnPackage),
            "utf-8",
        );
    }

    // Return the cached or newly generated summary.
    return formatCompactionPackage(modelReturnPackage);
}

/**
 * Helper: prepares the raw compaction seed into a string format to feed to
 * the model to generate the compaction summary
 */
export async function constructCompactionToInject(
    filePath: string,
): Promise<string> {
    const contents = await readFile(filePath, "utf-8");

    const seeds = JSON.parse(contents) as Array<{
        direct_input: string;
        output: string;
    }>;

    let context = "";

    for (const seed of seeds) {
        context += `USER: ${seed.direct_input}\n\n`;
        context += `ASSISTANT: ${seed.output}\n\n`;
    }

    return context;
}

/**
 * Model Provides a summary of the compaction seed
 */
async function modelCallForOnDemandSummary(
    conversationText: string,
): Promise<string> {
    const client = getController().client;
    const model = await client.llm.model();
    
    const prompt = `
        Provided to you is a chat transcript between a user and assistant with a prefix labeling each turn which it belongs too.

        These messages are ordered chronologically, the user needs you the assistant to comb through the chat transcript and extremely condense the contents down do it's most relevant parts. 

        The condensed version you create must not lose the messages original meaning and intent.

        The user will be using your output to determine if this chat transcript is relevant to them, so make notes of key elements that will remind them of exactly what this user assistant exchange was about.

        Elements which you find that are of little important or may simply be to generalized and unspecific should not be a target of focus to help identify this chat exchange.

        If this is code make sure to highlight the finalized code that you can derive from the chat transcript.

        If this is a novel or writing related make sure to highlight the finalized written work.

        If this is a general inquiry make sure to highlight all relevant inquiries along with their assistant provided answers.

        If this is role-play make sure to highlight the setting, progressions, and current state of the act.

        For any subject not mentioned above, use your own best discretion.

        [BEGINNING OF CHAT TRANSCRIPT]: 
        ${conversationText}
        [END OF CHAT TRANSCRIPT]
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

interface CompactionSeed {
    compactionSeed: string;
    memorySeed: string;
}

/**
 * Separates the engrainCompaction field text into the compaction seed and memory seed text.
 */
export function extractCompactionMemorySeeds(
    engrainCompaction: string,
): CompactionSeed | null {
    const match = engrainCompaction.match(
        /^(.+_c\d+_p\d+\.json)\s*>>\s*([^/\\]+\/[^/\\]+\.json)$/i,
    );

    if (!match) {
        return null;
    }

    return {
        compactionSeed: match[1].trim(),
        memorySeed: match[2].trim(),
    };
}

/**
 * Check the TOC_Collections to see if the compaction 
 * seed has been engrained on any date group.
 */
export async function validateIfAlreadyEngrained(
    compactionSeed: string,
): Promise<boolean | null> {
    const memoriesDirectory = getValidatedMemoriesRootDirectory();

    const collectionsFilePath = path.join(
        memoriesDirectory,
        "compactions",
        "TOC_Collections.json",
    );

    try {
        const collections: TableOfCompactionsEntityCollection[] =
            JSON.parse(
                await fs.readFile(collectionsFilePath, "utf-8"),
            );

        const results = collections.some(collection =>
            collection.engrained_fileName.includes(compactionSeed),
        );

        if (results) {
            console.log(
                `[COMPACTION] "${compactionSeed}" was already engrained.`,
            );
        }

        return results;
    } catch (error) {
        console.error(
            `[COMPACTION] Failed to check whether "${compactionSeed}" is already engrained:`,
            error,
        );

        return null;
    }
}

/**
 * Used to create a brand new memory seed from a compaction seed
 */
export async function compactionToMemorySeedTransfer(
    seedNames: CompactionSeed,
): Promise<void> {

    const { compactionSeed, memorySeed } = seedNames;
    
    const memoryMatch = memorySeed.match(
        /^([^/\\]+)\/([^/\\]+\.json)$/i,
    );

    if (!memoryMatch) {
        return;
    }

    // Skips the first match which is the full match of the entire string
    const [, category, name] = memoryMatch;

    const memoriesDirectory = getValidatedMemoriesRootDirectory();

    const compactionsDirectory = path.join(
        memoriesDirectory,
        "compactions",
    );

    const collectionsFilePath = path.join(
        compactionsDirectory,
        "TOC_Collections.json",
    );

    const tocSeedsDirectory = path.join(
        compactionsDirectory,
        "TOC_Seeds",
    );

    const tocEntityDirectory = path.join(
        compactionsDirectory,
        "TOC_Entity",
    );

    const categoryDirectory = join(
        memoriesDirectory,
        category,
    );

    const firstCharacter = category.toUpperCase();

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

    try {
        // Find the date group containing this compaction filename.
        const collections: TableOfCompactionsEntityCollection[] =
            JSON.parse(
                await fs.readFile(collectionsFilePath, "utf-8"),
            );

        const collection = collections.find(entry =>
            entry.members_fileName.includes(compactionSeed),
        );

        if (!collection) {
            console.error(
                `[COMPACTION TRANSFER] "${compactionSeed}" was not found in TOC_Collections.`,
            );
            return;
        }

        // Read the entity TOC for that date group.
        const tocEntityFilePath = path.join(
            tocEntityDirectory,
            `TOC_${collection.date_created_group}.json`,
        );

        const entities: TableOfCompactionsEntity[] = JSON.parse(
            await fs.readFile(tocEntityFilePath, "utf-8"),
        );

        const entity = entities.find(
            entry => entry.fileName === compactionSeed,
        );

        if (!entity) {
            console.error(
                `[COMPACTION TRANSFER] "${compactionSeed}" was not found in "${tocEntityFilePath}".`,
            );
            return;
        }

        // Convert it to a memory entity, omitting the compaction-only field.
        const {
            preceding_compacation_fileName: _precedingCompaction,
            ...memoryEntity
        } = entity;

        // Read TOM and prevent duplicate transfers.
        const tomContents: TableOfMemoriesEntity[] = JSON.parse(
            await fs.readFile(tomFilePath, "utf-8"),
        );

        if (tomContents.some(entry => entry.fileName === memorySeed)) {
            console.log(
                `[COMPACTION TRANSFER] "${compactionSeed}" as "${category}/${name}" already exists in TOM. Skipping transfer.`,
            );
            return;
        }

        const newTomEntry: TableOfMemoriesEntity = {
            fileName: memorySeed,
            fileSizeKB: entity.fileSizeKB,
            keywords: entity.keywords,
            summary: entity.summary,
        };

        // Append the entity to TOM.
        tomContents.push(newTomEntry);

        await fs.writeFile(
            tomFilePath,
            JSON.stringify(tomContents, null, 2),
            "utf-8",
        );

        // Copy the seed JSON to memory location, preserving the original.
        await fs.mkdir(categoryDirectory, { recursive: true });

        await fs.copyFile(
            path.join(tocSeedsDirectory, compactionSeed),
            path.join(categoryDirectory, name),
        );

        // Inject new memory seed into the available memory seeds pool
        addMemorySeedToPool(`${category}/${name}`);

        // Add the file name to the TOC_Collections of today
        await addTocEngrainedFileName(
            collections,
            collectionsFilePath,
            compactionSeed,
        );

        console.log(
            `[COMPACTION TRANSFER] "${compactionSeed}" moved to ~/.lmstudio/memories/${category}/${name}`,
        );

    } catch (error) {
        console.error(
            `[COMPACTION TRANSFER] Failed to transfer "${compactionSeed}":`,
            error,
        );
    }
}

/**
 * Used for pushing compaction seed content to an already existing memory seed
 */
export async function patchCompactedMemorySeed(
    extractedInputs: CompactionSeed,
): Promise<void>{
    const memoryMatch = extractedInputs.memorySeed.match(
        /^([^/\\]+)\/([^/\\]+\.json)$/i,
    );

    if (!memoryMatch) return;

    const [, category, name] = memoryMatch;

    const memoriesDirectory = getValidatedMemoriesRootDirectory();

    const compactionsDirectory = path.join(
        memoriesDirectory,
        "compactions",
    );

    const collectionsFilePath = path.join(
        compactionsDirectory,
        "TOC_Collections.json",
    );

    const tocSeedsDirectory = path.join(
        compactionsDirectory,
        "TOC_Seeds",
    );

    const tocEntityDirectory = path.join(
        compactionsDirectory,
        "TOC_Entity",
    );

    const categoryDirectory = join(
        memoriesDirectory,
        category,
    );

    const firstCharacter = category.toUpperCase();

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

    try {
        const collections: TableOfCompactionsEntityCollection[] =
            JSON.parse(
                await fs.readFile(collectionsFilePath, "utf-8"),
        );

        const collection = collections.find(entry =>
            entry.members_fileName.includes(extractedInputs.compactionSeed),
        );

        if (!collection) return;

        // Read the entity TOC for that date group.
        const tocEntityFilePath = path.join(
            tocEntityDirectory,
            `TOC_${collection.date_created_group}.json`,
        );

        const entities: TableOfCompactionsEntity[] = JSON.parse(
            await fs.readFile(tocEntityFilePath, "utf-8"),
        );

        const entity = entities.find(
            entry => entry.fileName === extractedInputs.compactionSeed,
        );

        if (!entity) return;

        // Convert it to a memory entity, omitting the compaction-only field.
        const {
            preceding_compacation_fileName: _precedingCompaction,
            ...memoryEntity
        } = entity;

        // Push the TOC_Seeds Content into the category/name.json
        const sourceSeedPath = path.join(
            tocSeedsDirectory,
            entity.fileName,
        );

        const targetSeedPath = path.join(
            categoryDirectory,
            name,
        );

        const sourceContent = JSON.parse(
            await fs.readFile(sourceSeedPath, "utf-8"),
        );

        const targetContent = JSON.parse(
            await fs.readFile(targetSeedPath, "utf-8"),
        );

        targetContent.push(...sourceContent);

        await fs.writeFile(
            targetSeedPath,
            JSON.stringify(targetContent, null, 2),
            "utf-8",
        );

        // Amend the matching TOM fileName with the fields of the TOC_Entity
        const tomContents: TableOfMemoriesEntity[] = JSON.parse(
            await fs.readFile(tomFilePath, "utf-8"),
        );

        const tomIndex = tomContents.findIndex(
            entry => entry.fileName === extractedInputs.memorySeed,
        );

        if (tomIndex === -1) {
            throw new Error(
                `Memory seed "${extractedInputs.memorySeed}" not found in TOM: ${tomFilePath}`,
            );
        }

        const existingTomEntry = tomContents[tomIndex];

        const combinedKeywords = [
            ...new Set(
                [
                    existingTomEntry.keywords,
                    memoryEntity.keywords,
                ]
                    .filter(Boolean)
                    .flatMap(keywords => keywords.split(","))
                    .map(keyword => keyword.trim())
                    .filter(Boolean),
            ),
        ].join(", ");

        // Combine the existing TOM metadata with the TOC_Entity metadata.
        const updatedTomEntry: TableOfMemoriesEntity = {
            fileName: extractedInputs.memorySeed,
            fileSizeKB: existingTomEntry.fileSizeKB + memoryEntity.fileSizeKB,
            keywords: combinedKeywords,
            summary: [
                existingTomEntry.summary,
                memoryEntity.summary,
            ]
                .filter(Boolean)
                .join("\n"),
        };

        tomContents[tomIndex] = updatedTomEntry;

        await fs.writeFile(
            tomFilePath,
            JSON.stringify(tomContents, null, 2),
            "utf-8",
        );

        // Add the engrained compaction to the TOC_Collection engrained field
        await addTocEngrainedFileName(
            collections,
            collectionsFilePath,
            extractedInputs.compactionSeed,
        );

        console.log(`[COMPACTION TRANSFER] ${extractedInputs.compactionSeed} amended into pre-existing ~/.lmstudio/memories/${category}/${name}`)
    } catch (error) {
        console.error(
            `[PATCH COMPACTION] Failed to check whether "${extractedInputs.compactionSeed}" is already engrained:`,
            error,
        );
    }
}

/**
 * Adds the compaction seed to the date group it was engrained on.
 */
async function addTocEngrainedFileName(
    collections: TableOfCompactionsEntityCollection[],
    collectionsFilePath: string,
    compactionSeed: string,
): Promise<void> {
    // Add the compaction filename to today's engrained_fileName collection.
    const now = new Date();

    const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
    ].join("-");

    let todayCollection = collections.find(
        entry => entry.date_created_group === today,
    );

    if (!todayCollection) {
        todayCollection = {
            date_created_group: today,
            members_fileName: [],
            engrained_fileName: [],
        };

        collections.push(todayCollection);
    }

    if (!todayCollection.engrained_fileName.includes(compactionSeed)) {
        todayCollection.engrained_fileName.push(compactionSeed);
    }

    await fs.writeFile(
        collectionsFilePath,
        JSON.stringify(collections, null, 2),
        "utf-8",
    );
}

/**
 * Inserts a compaction message to the last assistant message.
 * Ideally targets being inserted before the message # appended.
 * If not it uses the same fallback as the message # appending, before debug and if not,
 * after the last textblock type text of the asssitant.
 * This message is shouldIncludeInContext: false, meaning like the message # will not be part of
 * the context the assistant can process. It's just visually for the user.
 */
async function appendCompactionNotice(
    conversation: any,
    replacementText: string,
    targetAssistantMessageIndex: number,
): Promise<void> {

    // Find the target assistant message for this MEC instance
    const assistantMessage = conversation.messages[targetAssistantMessageIndex];

    if (!assistantMessage) {
        throw new Error("No assistant message found.");
    }

    // Get the currently selected version
    const assistantVersion =
        assistantMessage?.versions?.[
            assistantMessage.currentlySelected ?? 0
        ];

    if (!assistantVersion) {
        throw new Error("Assistant message has no versions.");
    }

    // Find the first message-number block, regardless of its number
    const messageNumberIndex = assistantVersion.steps.findIndex(
        (step: any) =>
            step.type === "contentBlock" &&
            step.content?.some(
                (contentBlock: any) =>
                    contentBlock.type === "text" &&
                    /^\n\n\*\*\*message \d+\*\*\*$/.test(
                        contentBlock.text,
                    ),
            ),
    );

    // Find debugInfoBlock
    const debugInfoIndex = assistantVersion.steps.findIndex(
        (step: any) => step.type === "debugInfoBlock",
    );

    // Avoid inserting the same replacement text more than once
    const replacementExists = assistantVersion.steps.some(
        (step: any) =>
            step.type === "contentBlock" &&
            step.content?.some(
                (contentBlock: any) =>
                    contentBlock.type === "text" &&
                    contentBlock.text === replacementText,
            ),
    );

    if (replacementExists) {
        return;
    }

    // Prefer inserting before the message-number block.
    // Otherwise, insert before debugInfoBlock.
    // If neither exists, append to the end.
    const insertIndex =
        messageNumberIndex !== -1
            ? messageNumberIndex
            : debugInfoIndex !== -1
                ? debugInfoIndex
                : assistantVersion.steps.length;

    // Create the replacement content block
    const markerBlock = {
        type: "contentBlock",
        stepIdentifier: String(Date.now()),
        content: [
            {
                type: "text",
                text: replacementText,
                fromDraftModel: false,
                tokensCount: 1,
                isStructural: false,
            },
        ],
        defaultShouldIncludeInContext: false,
        shouldIncludeInContext: false,
    };

    // Insert the replacement block
    assistantVersion.steps.splice(insertIndex, 0, markerBlock);
}

/**
 * MEC calls this function to append a returned compaction summary to overwrite the assistant's last message.
 * There is a different function for appending the compaction trail.
 */
export async function tryAppendCompactionSummaryFunction(
    latestConversation: any,
    constructedTableString: string,
    targetAssistantMessageIndex: number,
): Promise<void> {

    await editAssistantResponse(
        latestConversation,
        constructedTableString,
        targetAssistantMessageIndex,
    );
}

/**
 * MEC calls on this function to add the compaction trail to the last assistant message.
 * There is a different function for appending a compaction summary.
 */
export async function tryAppendTOCTrailFunction(
    latestConversation: any,
    matchingFiles: string[],
    targetAssistantMessageIndex: number,
): Promise<void> {
    const lines: string[] = [];

    interface CompactionPart {
        fileName: string;
        prefix: string;
        compaction: number;
        part: number;
    }

    const parseCompactionPart = (
        fileName: string,
    ): CompactionPart | null => {
        const match = fileName.match(
            /^(.*)_c(\d+)_p(\d+)\.json$/,
        );

        if (!match) {
            return null;
        }

        return {
            fileName,
            prefix: match[1],
            compaction: Number(match[2]),
            part: Number(match[3]),
        };
    };

    const parsedFiles = matchingFiles
        .map(parseCompactionPart)
        .filter(
            (part): part is CompactionPart =>
                part !== null,
        );

    const groups: CompactionPart[][] = [];

    for (const part of parsedFiles) {
        const lastGroup = groups[groups.length - 1];

        const belongsToLastGroup =
            lastGroup &&
            lastGroup[0].prefix === part.prefix &&
            lastGroup[0].compaction === part.compaction;

        if (belongsToLastGroup) {
            lastGroup.push(part);
        } else {
            groups.push([part]);
        }
    }

    const orderedPartNames = groups
        .map((group, index) => {
            const isLast = index === groups.length - 1;

            const firstFile = group[0].fileName;

            const remainingParts = group
                .slice(1)
                .map((part) => `p${part.part}`);

            const partsLabel = remainingParts.length > 0
                ? ` *(PARTS: ${remainingParts.join(", ")})*`
                : "";

            const groupLabel = `${firstFile}${partsLabel}`;

            return isLast
                ? `${groupLabel} ➯ **[Current Session]**`
                : groupLabel;
        })
        .join(" ➯ ");

    const latestFileName =
        matchingFiles[matchingFiles.length - 1];

    const compactionCount = latestFileName
        ? Number(
            latestFileName.match(
                /_c(\d+)_p\d+\.json$/,
            )?.[1] ?? 0,
        )
        : 0;

    lines.push(
        [
            `---`,
            `🚨**This chat session has been compacted:** ***${compactionCount}*** previous times🚨`,
            `**Latest Compaction File Name:** ${latestFileName ? `*${latestFileName}*` : ""}`,
            `**Compaction Trail:** ${orderedPartNames}`,
            `---`,
        ].join("\n\n"),
    );

    await appendCompactionNotice(
        latestConversation,
        lines.join("\n\n"),
        targetAssistantMessageIndex,
    );
}

/**
 * Checks today's date, then checks the TOC_Collections date_group to see if any date groups
 * life time has exceeded the deleteTocCollectionsAfterNthDays setting set by the user.
 * Any group that has exceeded that cutoff will be removed from the TOC and the members list
 * will be used to scrub all associated files and entries.
 */
async function deleteExpiredCompactionsAndTocCleanup(
    daysToTriggerExpire: number,
): Promise<void> {
    const memoriesDirectory = getValidatedMemoriesRootDirectory();

    const compactionsDirectory = path.join(
        memoriesDirectory,
        "compactions",
    );

    const collectionsFilePath = path.join(
        compactionsDirectory,
        "TOC_Collections.json",
    );

    const tocSeedsDirectory = path.join(
        compactionsDirectory,
        "TOC_Seeds",
    );

    const tocEntityDirectory = path.join(
        compactionsDirectory,
        "TOC_Entity",
    );

    const tocSummariesDirectory = path.join(
        compactionsDirectory,
        "TOC_Summaries",
    );

    const now = new Date();
    const today = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
    );

    try {
        const contents = await fs.readFile(
            collectionsFilePath,
            "utf-8",
        );

        const collections: TableOfCompactionsEntityCollection[] =
            JSON.parse(contents);

        const remainingCollections: TableOfCompactionsEntityCollection[] = [];
        const expiredCollections: TableOfCompactionsEntityCollection[] = [];

        for (const entry of collections) {
            const [year, month, day] = entry.date_created_group
                .split("-")
                .map(Number);

            const entryDate = new Date(year, month - 1, day);

            if (Number.isNaN(entryDate.getTime())) {
                remainingCollections.push(entry);
                continue;
            }

            const ageInDays = Math.floor(
                (today.getTime() - entryDate.getTime()) /
                    (24 * 60 * 60 * 1000),
            );

            if (ageInDays > daysToTriggerExpire) {
                expiredCollections.push(entry);
            } else {
                remainingCollections.push(entry);
            }
        }

        for (const entry of expiredCollections) {
            // Delete each member from the corresponding TOC collection group
            for (const fileName of entry.members_fileName) {
                // Delete the corresponding seed, if it exists
                try {
                    await fs.unlink(
                        path.join(tocSeedsDirectory, fileName),
                    );
                } catch (error) {
                    console.error(
                        `[COMPACTION CLEANUP] Failed to delete "${fileName}":`,
                        error,
                    );
                }

                // Delete the corresponding cached summary, if it exists
                try {
                    await fs.unlink(
                        path.join(tocSummariesDirectory, fileName),
                    );
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
                        console.error(
                            `[COMPACTION CLEANUP] Failed to delete summary "${fileName}":`,
                            error,
                        );
                    }
                }
            }

            // Delete the corresponding TOC_Entity file
            try {
                await fs.unlink(
                    path.join(
                        tocEntityDirectory,
                        `TOC_${entry.date_created_group}.json`,
                    ),
                );
            } catch (error) {
                console.error(
                    `[COMPACTION CLEANUP] Failed to delete entity TOC for "${entry.date_created_group}":`,
                    error,
                );
            }
        }

        if (expiredCollections.length > 0) {
            await fs.writeFile(
                collectionsFilePath,
                JSON.stringify(remainingCollections, null, 2),
                "utf-8",
            );
        }
    } catch (error) {
        console.error(
            "[COMPACTION CLEANUP] Failed to clean up expired compactions:",
            error,
        );
    }
}

/**
 * Helper: extracts the compaction name and orders it to match the letters backwards.
 * The compaction names are auto generated by lmstudio so it may contain spaces like "the pie was great_c1_p1.json"
 * we needed to differentiate between a file of "the pie was great_c1_p1.json" and "was great_c1_p1.json"
 */
function extractCompactionFileName(
    userText: string,
    availableFiles: string[],
): string | null {
    const normalizedText = userText.trimEnd().toLowerCase();

    const matchingFile = [...availableFiles]
        .sort((a, b) => b.length - a.length)
        .find(fileName => normalizedText.endsWith(fileName.toLowerCase()));

    return matchingFile ?? null;
}

/**
 * Helper: add the 📦 so that TOM/TOC retraction feature can Content Retracted the compaction related stuff.
 */
export function formatCompactionPackage(
    packageText: string
): string {
    const formattedMemories: string[] = [];

    formattedMemories.push(
        [
            '📦 **`Compaction Summary Package`**',
            packageText,
        ].join("\n"),
    );

    return formattedMemories.join("\n\n");
}