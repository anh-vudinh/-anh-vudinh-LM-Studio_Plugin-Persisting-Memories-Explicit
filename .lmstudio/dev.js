"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/conversationHistoryCache.ts
async function setCurrentConversationHistory(history) {
  currentHistory = history;
}
async function getCurrentConversationHistory() {
  if (!currentHistory) {
    throw new Error(
      "No active conversation history is available. The Memory Seed plugin must receive conversation history from LM Studio before a memory operation can be performed."
    );
  }
  return currentHistory;
}
var currentHistory;
var init_conversationHistoryCache = __esm({
  "src/conversationHistoryCache.ts"() {
    "use strict";
    currentHistory = null;
  }
});

// src/memorySession.ts
function initializeMemorySeedsPool(pool) {
  memorySeedsPool = Object.freeze([...pool]);
}
function getMemorySeedsPool() {
  return memorySeedsPool;
}
function removeMemorySeedFromPool(memorySeed) {
  memorySeedsPool = Object.freeze(
    memorySeedsPool.filter(
      (seed) => seed !== memorySeed
    )
  );
}
function addMemorySeedToPool(memorySeed) {
  memorySeedsPool = Object.freeze([
    ...memorySeedsPool,
    memorySeed
  ]);
}
function getMemorySeedsSelected() {
  return memorySeedsSelected;
}
function updateMemorySeedsSelected(selected) {
  memorySeedsSelected = Object.freeze([...selected]);
}
function addMemorySeedToSelected(memorySeed) {
  memorySeedsSelected = Object.freeze([
    ...memorySeedsSelected,
    memorySeed
  ]);
}
function removeMemorySeedFromSelected(memorySeed) {
  memorySeedsSelected = Object.freeze(
    memorySeedsSelected.filter(
      (seed) => seed !== memorySeed
    )
  );
}
var memorySeedsPool, memorySeedsSelected;
var init_memorySession = __esm({
  "src/memorySession.ts"() {
    "use strict";
    memorySeedsPool = Object.freeze([]);
    memorySeedsSelected = Object.freeze([]);
  }
});

// src/acquireLockFile.ts
function addLockFileFunction(lockFile, functionName) {
  const functions = lockFileFunctions.get(lockFile) ?? [];
  if (!functions.includes(functionName)) {
    functions.push(functionName);
  }
  lockFileFunctions.set(lockFile, functions);
}
function removeLockFileFunction(lockFile, functionName) {
  const functions = lockFileFunctions.get(lockFile);
  if (!functions) {
    return false;
  }
  const index = functions.indexOf(functionName);
  if (index === -1) {
    return false;
  }
  functions.splice(index, 1);
  if (functions.length === 0) {
    lockFileFunctions.delete(lockFile);
  }
  return true;
}
function getLockFileFunctions(lockFile) {
  return [...lockFileFunctions.get(lockFile) ?? []];
}
async function acquireLock(lockFile, functionName) {
  const ownerCount = (lockOwnerCounters.get(functionName) ?? 0) + 1;
  lockOwnerCounters.set(functionName, ownerCount);
  const uniqueFunctionName = `${functionName}_${ownerCount}`;
  const LOCK_STALE_TIMEOUT_MS = 2e4;
  const LOCK_WAIT_TIMEOUT_MS = 25e3;
  const POLL_INTERVAL_MS = 100;
  const startedAt = Date.now();
  while (true) {
    if (Date.now() - startedAt >= LOCK_WAIT_TIMEOUT_MS) {
      throw new Error(
        `Timed out waiting for lock: ${lockFile}`
      );
    }
    const currentFunctions = lockFileFunctions.get(lockFile);
    if (currentFunctions && currentFunctions.length > 0) {
      addLockFileFunction(lockFile, uniqueFunctionName);
      return uniqueFunctionName;
    }
    try {
      const handle = await (0, import_promises.open)(lockFile, "wx");
      addLockFileFunction(lockFile, uniqueFunctionName);
      await handle.close();
      return uniqueFunctionName;
    } catch (error) {
      const fsError = error;
      if (fsError.code !== "EEXIST") {
        throw error;
      }
      const functionsAfterCollision = lockFileFunctions.get(lockFile);
      if (functionsAfterCollision && functionsAfterCollision.length > 0) {
        addLockFileFunction(lockFile, uniqueFunctionName);
        return uniqueFunctionName;
      }
      try {
        const stats = await (0, import_promises.stat)(lockFile);
        const lockAge = Date.now() - stats.mtimeMs;
        if (lockAge >= LOCK_STALE_TIMEOUT_MS) {
          try {
            await (0, import_promises.unlink)(lockFile);
          } catch (error2) {
            const fsError2 = error2;
            if (fsError2.code !== "ENOENT") {
              throw error2;
            }
          }
          continue;
        }
      } catch (error2) {
        const fsError2 = error2;
        if (fsError2.code !== "ENOENT") {
          throw error2;
        }
        continue;
      }
      await new Promise(
        (resolve) => setTimeout(resolve, POLL_INTERVAL_MS)
      );
    }
  }
}
async function releaseLock(lockFile, functionName) {
  const removed = removeLockFileFunction(
    lockFile,
    functionName
  );
  if (!removed) {
    return;
  }
  const remainingFunctions = getLockFileFunctions(lockFile);
  if (remainingFunctions.length > 0) {
    return;
  }
  try {
    await (0, import_promises.unlink)(lockFile);
  } catch (error) {
    const fsError = error;
    if (fsError.code !== "ENOENT") {
      throw error;
    }
  }
}
var import_promises, lockFileFunctions, lockOwnerCounters;
var init_acquireLockFile = __esm({
  "src/acquireLockFile.ts"() {
    "use strict";
    import_promises = require("node:fs/promises");
    lockFileFunctions = /* @__PURE__ */ new Map();
    lockOwnerCounters = /* @__PURE__ */ new Map();
  }
});

// src/config.ts
function getPendingTomCommand() {
  return pendingTomCommand;
}
function setPendingTomCommand(value) {
  pendingTomCommand = value;
}
function createConfig(memorySeedsPool2, memorySeedsSelected2) {
  return (0, import_sdk.createConfigSchematics)().field(
    "enableToolsMode",
    "boolean",
    {
      displayName: "\u{1F6E0}\uFE0F Switch to Tool Call Mode?",
      subtitle: "Explicit Mode is the default. Turning this on allows the assistant to call these functions as tools. This semi-disables the explicit mode. Hover for Details.",
      hint: "Still handled explicitly: \n - Message # appending \n - TOM retractions \n - injected memory seed removal"
    },
    false
  ).field(
    "deleteMemorySeedsFile",
    "string",
    {
      displayName: "\u{1F5D1}\uFE0F Delete Memory",
      subtitle: " *WARNING* This does not remove already injected memories. This is a final action to permanently delete a memory.",
      warning: "This memory will be permanently deleted.",
      hint: "Optional: \n - <category>/*.json will delete the entire category",
      placeholder: "Full name of the memory to delete. Copy/paste from available memories."
    },
    ""
  ).field(
    "memorySeedsPool",
    "stringArray",
    {
      displayName: "Available Memories",
      subtitle: "DISPLAY ONLY: Hover for Save Memory command syntax reminders.",
      hint: "Copy/paste full names, including the .json to: \n\n - Memories to Inject \n - Delete Memory \n\n Commands: \n\n Single: \n - save memory <message #>; category <category_name>; name <memory_name> \n\n Batch: \n - save memory <message #> to <message #>; category <category_name>; name <memory_name> ",
      allowEmptyStrings: false
    },
    [...memorySeedsPool2]
  ).field(
    "memorySeedsSelected",
    "stringArray",
    {
      displayName: "\u{1F9E0} Memories to Inject",
      subtitle: "Injects a memory into context. Copy/paste from available memories.",
      warning: "Only the memories listed below will persist through turns.",
      hint: "Optional: \n - <category>/*.json will inject the entire category",
      allowEmptyStrings: false
    },
    [...memorySeedsSelected2]
  ).field(
    "summarizeMemorySeeds",
    "boolean",
    {
      displayName: "\u{1F4DD} Summarize All Memories Injected (not retroactive)",
      subtitle: " Will force a summary of the memory file to be injected instead of the complete user/assistant exchange",
      hint: "This will lessen the context window consumed but may lose details or merge content compared to the full message exchange."
    },
    false
  ).field(
    "tomNames",
    "stringArray",
    {
      displayName: "\u{1F4E6} Table of Memories",
      subtitle: "DISPLAY ONLY: Hover for command syntax reminders. \n\n These buttons do nothing.",
      hint: "IMPORTANT! \n Make sure you have read the tooltip for Initialize Table of Memories first before using this feature. \n\n Commands: \n 1) fetch the memory table <table name> \n 2) recall a memory about <insert specifics> \n 3) fetch the memory <category>/<name>.json \n 4) fetch the memories <category>/*.json \n\n Shorthand: \n - tomaj, tomkq, tomrz",
      allowEmptyStrings: false
    },
    [`TOM_${TOM_RANGES.first.start}-${TOM_RANGES.first.end}`, `TOM_${TOM_RANGES.second.start}-${TOM_RANGES.second.end}`, `TOM_${TOM_RANGES.special.start}-${TOM_RANGES.special.end}`]
  ).field(
    "initializeTOM",
    "boolean",
    {
      displayName: "\u2699\uFE0F Initialize Table of Memories",
      subtitle: " *WARNING* Do not leave enabled. Hover for details.",
      warning: "Remember to off this after you've sent one message with it enabled.",
      hint: "This is to create the table of memories files for this plugin. Turn it on and send any user message. Turn it off after the message is sent. \n\n Leave it off by default unless your scenerio matches one condition: \n 1) You have never initialized the memory tables before. \n 2) You suspect that your TOM files/contents need repair. \n\n Leave this OFF once the table has been initialized It is expensive to run if you have many memories."
    },
    false
  ).field(
    "retractOldToms",
    "numeric",
    {
      displayName: "\u21A9\uFE0F Retract old TOMs & TOCs from Context?",
      subtitle: "Removes all the previously fetched TOMs & TOCs from the chat session. Excluding TOMs & TOCs in the lastest <N>th assistant messages.",
      hint: "Retroactively frees up your context window from being burdended by TOM & TOC tables that you've already consumed. \n\n - Off = 0 \n\n - Max = 10 ",
      int: true,
      min: 0,
      max: 10
    },
    0
  ).field(
    "deleteTocCollectionsAfterNthDays",
    "numeric",
    {
      displayName: "\u{1F525} Delete Compactions older than <N> days old",
      subtitle: "XPlugin Feature: Hover for details.",
      warning: "REQUIRES the companion plugin Context Cleanup rev8+ enabled.",
      hint: "REQUIRES the companion plugin Context Cleanup rev8+ from LM Studio or v4.0+ from Github. \n\n  All compactions older than the stated days will be deleted. \n\n This uses the TOC_Collections files to determine which compacitons to expire. This is for those who wish to not have to manually prune compactions. \n\n - Off = 0 \n\n - Max = 15 \n\n If a Compaction's contents are important to you, make it permanent using \u{1F331} Compaction \u27A0 Memory Seed.",
      int: true,
      min: 0,
      max: 15
    },
    0
  ).field(
    "engrainCompaction",
    "string",
    {
      displayName: "\u{1F331} Compaction \u27A0 Memory Seed",
      subtitle: "XPlugin Feature: Hover for details.",
      warning: "REQUIRES the companion plugin Context Cleanup rev8+ enabled.",
      hint: "REQUIRES the companion plugin Context Cleanup rev8+ from LM Studio or v4.0+ from Github. \n\n Converts a compaction into a memory seed. <name_c#_p#.json>. \n\n All compactions will be added to the category en_comps. \n\n\n **Chat Commands:** \n - list compaction seeds \n - fetch compaction <name_c#_p#.json>",
      placeholder: "Name of the compaction to engrain. <name_c#_p#.json>"
    },
    ""
  ).build();
}
function setConfigSchematics({
  memorySeedsPool: memorySeedsPool2,
  memorySeedsSelected: memorySeedsSelected2
}) {
  if (memorySeedsPool2 !== void 0) {
    currentMemorySeedsPool = memorySeedsPool2;
  }
  if (memorySeedsSelected2 !== void 0) {
    currentMemorySeedsSelected = memorySeedsSelected2;
  }
  configSchematics = createConfig(
    currentMemorySeedsPool,
    currentMemorySeedsSelected
  );
}
function setController(controller) {
  ctl = controller;
}
function getController() {
  return ctl;
}
function getPendingSaveMemory() {
  return { ...pendingSaveMemory };
}
function setPendingSaveMemory(updates) {
  pendingSaveMemory = {
    ...pendingSaveMemory,
    ...updates
  };
}
function resetPendingSaveMemory() {
  pendingSaveMemory = {
    active: false,
    memoryNumber: null,
    category: null,
    fileName: null,
    memoryNumberEndRange: null
  };
}
function addConversationOperation(name, params) {
  conversationOperations.push({
    name,
    params
  });
}
function getConversationOperations() {
  return conversationOperations;
}
function takeConversationOperations() {
  const operations = [...conversationOperations];
  conversationOperations = [];
  return operations;
}
function setConversationFileName(value) {
  conversationFileName = normalizeJsonFileName(value);
}
function getConversationFileName() {
  return conversationFileName;
}
function setInternalChatID(value) {
  internalChatID = value;
}
function getInternalChatID() {
  return internalChatID;
}
function getSaveMemoryRegex() {
  return SAVE_MEMORY_REGEX;
}
function getMultiSaveMemoryRegex() {
  return MULTI_SAVE_MEMORY_REGEX;
}
function getCategoryExtractRegex() {
  return CATEGORY_EXTRACT_REGEX;
}
function getNameExtractRegex() {
  return NAME_EXTRACT_REGEX;
}
function getExitSaveMemoryRegex() {
  return EXIT_SAVE_MEMORY_REGEX;
}
function getCleanUserInputSaveMemoryRegex() {
  return CLEAN_USER_INPUT_SAVE_MEMORY_REGEX;
}
function getTableOfMemoriesRegex() {
  return TABLE_OF_MEMORIES_REGEX;
}
function getMemoryRangeRegex() {
  return MEMORY_RANGE_REGEX;
}
function getFuzzySearchRegex() {
  return FUZZY_SEARCH_MEMORY_REGEX;
}
function getDirectFetchRegex() {
  return DIRECT_FETCH_MEMORY_REGEX;
}
function getCompactionSummaryRegex() {
  return COMPACTION_SUMMARY_REGEX;
}
function getListCompactionSeedsRegex() {
  return LIST_COMPACTION_SEEDS_REGEX;
}
function setValidatedLMSRootDirectory(value) {
  validatedLMSRootDirectory = value;
}
function getValidatedLMSRootDirectory() {
  return validatedLMSRootDirectory;
}
function setValidatedConversationRootDirectory(value) {
  validatedConversationRootDirectory = value;
}
function getValidatedConversationRootDirectory() {
  return validatedConversationRootDirectory;
}
function setValidatedMemoriesRootDirectory(value) {
  validatedMemoriesRootDirectory = value;
}
function getValidatedMemoriesRootDirectory() {
  return validatedMemoriesRootDirectory;
}
function setLastKnownIndexOfRetractedToms(value) {
  lastKnownIndexOfRetractedToms = value;
}
function getLastKnownIndexOfRetractedToms() {
  return lastKnownIndexOfRetractedToms;
}
function setContextCleanupPluginInUse(value) {
  contextCleanupPluginInUse = value;
}
function setContextCleanupConversationName(value) {
  contextCleanupConversationName = value;
}
function getContextCleanupConversationName() {
  return contextCleanupConversationName;
}
var import_sdk, pendingTomCommand, TOM_RANGES, tomRangePatterns, currentMemorySeedsPool, currentMemorySeedsSelected, configSchematics, ctl, pendingSaveMemory, conversationOperations, conversationFileName, internalChatID, SAVE_MEMORY_REGEX, MULTI_SAVE_MEMORY_REGEX, CLEAN_USER_INPUT_SAVE_MEMORY_REGEX, CATEGORY_EXTRACT_REGEX, NAME_EXTRACT_REGEX, EXIT_SAVE_MEMORY_REGEX, TABLE_OF_MEMORIES_REGEX, MEMORY_RANGE_REGEX, FUZZY_SEARCH_MEMORY_REGEX, DIRECT_FETCH_MEMORY_REGEX, COMPACTION_SUMMARY_REGEX, LIST_COMPACTION_SEEDS_REGEX, validatedLMSRootDirectory, validatedConversationRootDirectory, validatedMemoriesRootDirectory, lastKnownIndexOfRetractedToms, contextCleanupPluginInUse, contextCleanupConversationName;
var init_config = __esm({
  "src/config.ts"() {
    "use strict";
    import_sdk = require("@lmstudio/sdk");
    init_promptPreprocessor();
    pendingTomCommand = "null";
    TOM_RANGES = {
      first: { start: "A", end: "J" },
      second: { start: "K", end: "Q" },
      special: { start: "R", end: "Z" }
    };
    tomRangePatterns = Object.values(TOM_RANGES).map(({ start, end }) => {
      return `${start.toLowerCase()}\\s*-?\\s*${end.toLowerCase()}`;
    }).join("|");
    currentMemorySeedsPool = [];
    currentMemorySeedsSelected = [];
    configSchematics = createConfig(
      currentMemorySeedsPool,
      currentMemorySeedsSelected
    );
    pendingSaveMemory = {
      active: false,
      memoryNumber: null,
      category: null,
      fileName: null,
      memoryNumberEndRange: null
    };
    conversationOperations = [];
    conversationFileName = "";
    internalChatID = "";
    SAVE_MEMORY_REGEX = /\b(?:save|sav|sve|sv|store|remember|persist)\s*(?:memory|mem|mm|mmry|memry|mry|mmy|memy)\s*(?:message|msg)?\s*(\d+)/i;
    MULTI_SAVE_MEMORY_REGEX = /\b(?:save|sav|sve|sv|store|remember|persist)\s*(?:memory|mem|mm|mmry|memry|mry|mmy|memy)\s*(?:message|msg|messages|msgs)?\s*(\d+)\s*(?:through|thru|thrugh|thruogh|thorugh|thurogh|to|too)\s*(\d+)/i;
    CLEAN_USER_INPUT_SAVE_MEMORY_REGEX = /\b(?:save|sav|sve|sv|store|remember|persist)\s*(?:memory|mem|mm|mmry|memry|mry|mmy|memy)\s*(?:message|msg|messages|msgs)?\s*\d+(?:\s*(?:through|thru|thrugh|thruogh|thorugh|thurogh|to|too)\s*\d+)?\s*[;,.]?\s*/gi;
    CATEGORY_EXTRACT_REGEX = /^(?:the\s+)?(?:memory|mem|mm|mmry|memry|mry|mmy|memy)?\s*(?:category|categroy|categary|categry|catgry|catagory|catgory|categoy)\b\s+(?:is\s+)?(.+)$/i;
    NAME_EXTRACT_REGEX = /^(?:the\s+)?(?:memory|mem|mm|mmry|memry|mry|mmy|memy)?\s*(?:name|nmae|nam|nme)\b\s+(?:is\s+)?(.+)$/i;
    EXIT_SAVE_MEMORY_REGEX = /\bexit\b\s+(?:save|sav|sve|sv|store|remember|persist)\b\s+(?:memory|mem|mm|mmry|memry|mry|mmy|memy)\b/i;
    TABLE_OF_MEMORIES_REGEX = new RegExp(
      String.raw`\b(?:table|tbl|tble|tabel|tables)\s*(?:of\s*)?(?:memories|memory|mem|mm|mmry|memry|mry|mmy|memy|mems)|(?:memories|memory|mem|mm|mmry|memry|mry|mmy|memy|mems)\s*(?:table|tbl|tble|tabel|tables)|\btom[_\s-]*(?:${tomRangePatterns})\b`,
      "i"
    );
    MEMORY_RANGE_REGEX = /\b(?:tom\s*[_-]?\s*|(?:table|tbl|tble|tabel|tables)\s*(?:of\s*)?(?:memories|memory|mem|mm|mmry|memry|mry|mmy|memy|mems)\s*|(?:memories|memory|mem|mm|mmry|memry|mry|mmy|memy|mems)\s+(?:table|tbl|tble|tabel|tables)\s*)([a-z]\s*-?\s*[a-z])\b/i;
    FUZZY_SEARCH_MEMORY_REGEX = /\b(?:(?:search|serch|srch|searching|find|fnd|look|lok|looking|fetch|fetsh|retrieve|retrive|retreive|recall|locate|lcoate|remember|rember|recollect|recollecting|get|grab|pull)\b(?:\W+\w+){0,5}\W+\b(?:memory|memories|mem|mm|mmry|memry|mry|mmy|memy|mems)\b|(?:memory|memories|mem|mm|mmry|memry|mry|mmy|memy|mems)\b(?:\W+\w+){0,5}\W+\b(?:search|serch|srch|searching|find|fnd|look|lok|looking|fetch|fetsh|retrieve|retrive|retreive|recall|locate|lcoate|remember|rember|recollect|recollecting|get|grab|pull)\b)/i;
    DIRECT_FETCH_MEMORY_REGEX = /\b(?:(?:fetch|fetsh|retrieve|retrive|retreive|get|grab|pull)\b(?:\W+\w+){0,3}\W+\b(?:memory|memories|mem|mm|mmry|memry|mry|mmy|memy|mems)?\b|(?:memory|memories|mem|mm|mmry|memry|mry|mmy|memy|mems)?\b(?:\W+\w+){0,3}\W+\b(?:fetch|fetsh|retrieve|retrive|retreive|get|grab|pull)\b)\W+(?:[^/\\*]+|\*)\/(?:[^/\\*]+|\*)\.json\b/i;
    COMPACTION_SUMMARY_REGEX = /\b(?:(?:fetch|fetsh|retrieve|retrive|retreive|get|grab|pull)\b(?:\W+\w+){0,3}\W+(?:compaction|compacton|compact|campaction|campactun|compactun|compacten|compactions|comp)?|(?:compaction|compacton|compact|campaction|campactun|compactun|compacten|compactions|compact)?\b(?:\W+\w+){0,3}\W+(?:fetch|fetsh|retrieve|retrive|retreive|get|grab|pull))\W+[\w -]+_c\d+_p\d+\.json\b/i;
    LIST_COMPACTION_SEEDS_REGEX = /\blist\b(?:\W+\w+){0,3}\W+\b(?:compaction|compacton|compact|campaction|campactun|compactun|compacten|compactions|compacts|campactions|campactuns|compactuns|compactens|comp)?s?\b\W+\bseeds?\b/i;
    validatedLMSRootDirectory = "";
    validatedConversationRootDirectory = "";
    validatedMemoriesRootDirectory = "";
    lastKnownIndexOfRetractedToms = null;
    contextCleanupPluginInUse = false;
    contextCleanupConversationName = "";
  }
});

// src/conversationReader.ts
function getAssistantResponse(history, messageNumber) {
  validateMessageNumber(messageNumber);
  const messages = history.getMessagesArray();
  let assistantMessageNumber = 0;
  for (let arrayIndex = 0; arrayIndex < messages.length; arrayIndex++) {
    const message = messages[arrayIndex];
    if (!isEligibleAssistantMessage(message)) {
      continue;
    }
    assistantMessageNumber++;
    if (assistantMessageNumber !== messageNumber) {
      continue;
    }
    const cleanedContent = message.getText().replace(
      /^[\s\S]*?__LM_STUDIO_INTERNAL_LSEP_SYNTHETIC_REASONING_END_[A-Za-z0-9]+__/i,
      ""
    );
    return {
      messageNumber,
      arrayIndex,
      content: cleanedContent,
      raw: message
    };
  }
  throw new Error(
    `Assistant response ${messageNumber} does not exist. The conversation contains ${assistantMessageNumber} eligible assistant response(s).`
  );
}
function isEligibleAssistantMessage(message) {
  const isAssistant = typeof message.isAssistantMessage === "function" ? message.isAssistantMessage() : message.data?.role === "assistant";
  if (!isAssistant) {
    return false;
  }
  const content = message.data?.content ?? [];
  return !content.some(
    (item) => item.type === "toolCallRequest"
  );
}
function getPriorUserMessages(history, assistantMessageNumber) {
  validateMessageNumber(assistantMessageNumber);
  const assistant = getAssistantResponse(
    history,
    assistantMessageNumber
  );
  const messages = history.getMessagesArray();
  const candidates = [];
  let userMessageNumber = 0;
  for (let index = 0; index < assistant.arrayIndex; index++) {
    const raw = messages[index];
    const role = normalizeRole(raw.getRole());
    if (role !== "user") {
      continue;
    }
    userMessageNumber += 1;
    candidates.push({
      messageNumber: userMessageNumber,
      arrayIndex: index,
      content: extractVisibleText(raw),
      raw
    });
  }
  return candidates;
}
function extractVisibleText(message) {
  try {
    return message.getText();
  } catch {
    return "";
  }
}
function normalizeRole(role) {
  switch (role) {
    case "user":
      return "user";
    case "assistant":
      return "assistant";
    case "system":
      return "system";
    default:
      return "unknown";
  }
}
function validateMessageNumber(messageNumber) {
  if (!Number.isInteger(messageNumber) || messageNumber < 0) {
    throw new Error(
      `Invalid message number "${messageNumber}". Conversation message numbers start at 0.`
    );
  }
}
function cleanAssistantResponse(text) {
  const markerMatches = [...text.matchAll(SYNTHETIC_REASONING_END)];
  let cleaned = text;
  if (markerMatches.length > 0) {
    const lastMarker = markerMatches[markerMatches.length - 1];
    const endIndex = (lastMarker.index ?? 0) + lastMarker[0].length;
    cleaned = text.slice(endIndex);
  }
  cleaned = cleaned.replace(
    /\n+\*\*\*message \d+\*\*\*\s*$/,
    ""
  );
  return cleaned.trim();
}
function cleanUserInput(text) {
  return text.replace(
    getCleanUserInputSaveMemoryRegex(),
    ""
  ).replace(
    /\[BEGINNING OF MEMORIES\][\s\S]*?\[END OF MEMORIES\]/g,
    ""
  ).replace(
    /Ignore this ICID tag\./g,
    ""
  ).replace(
    /\[ICID:\s*\d+\](?:\s+\.?)?\s*/g,
    ""
  ).replace(
    /ROLEPLAY:[\s\S]*?\[User Last Message\]/g,
    ""
  ).replace(
    /ROLEPLAY:[\s\S]*?\.\.\.'/g,
    ""
  ).trim();
}
var SYNTHETIC_REASONING_END;
var init_conversationReader = __esm({
  "src/conversationReader.ts"() {
    "use strict";
    init_config();
    SYNTHETIC_REASONING_END = /__LM_STUDIO_INTERNAL_LSEP_SYNTHETIC_REASONING_END_[0-9a-f]+__/g;
  }
});

// src/memoryAssociation.ts
async function associateAssistantResponse(client2, history, assistantMessageNumber) {
  if (!assistantMessageNumber) {
    throw new Error(
      `AssistantMessage# ${assistantMessageNumber} not provided.`
    );
  }
  const assistantMsg = getAssistantResponse(
    history,
    assistantMessageNumber
  );
  if (isMetadataOnlyOutput(assistantMsg.content)) {
    return null;
  }
  const cleanedAssistantResponse = cleanAssistantResponse(assistantMsg.content);
  const candidates = getPriorUserMessages(
    history,
    assistantMessageNumber
  );
  let rootInput = "";
  try {
    const rootUserMessageNumber = await determineOriginalIntention(
      client2,
      cleanedAssistantResponse,
      candidates
    );
    const rootCandidate = candidates.find(
      (candidate) => candidate.messageNumber === rootUserMessageNumber
    );
    if (rootCandidate) {
      rootInput = rootCandidate.content;
    }
  } catch {
    rootInput = "";
  }
  let directInput = "";
  const messages = history.getMessagesArray();
  for (let index = assistantMsg.arrayIndex - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message.isUserMessage()) {
      continue;
    }
    directInput = message.getText() || "";
    break;
  }
  return {
    assistantMessageNumber,
    assistantResponse: cleanedAssistantResponse,
    rootInput,
    directInput
  };
}
async function determineOriginalIntention(client2, assistantResponse, candidates) {
  const model = await client2.llm.model();
  const candidateText = candidates.map(
    (candidate) => `USER MESSAGE ${candidate.messageNumber}:
` + candidate.content
  ).join("\n\n---\n\n");
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
    temperature: 0
  });
  const raw = result.content.trim();
  const cleaned = cleanAssistantResponse(raw);
  const match = cleaned.match(/\b(\d+)\b/);
  if (!match) {
    throw new Error(
      `The association model did not return a valid message number. Model returned: ${raw}`
    );
  }
  const selectedNumber = Number(match[1]);
  const exists = candidates.some(
    (candidate) => candidate.messageNumber === selectedNumber
  );
  if (!exists) {
    throw new Error(
      `The association model selected message ${selectedNumber}, but that is not one of the available prior user messages.`
    );
  }
  return selectedNumber;
}
var init_memoryAssociation = __esm({
  "src/memoryAssociation.ts"() {
    "use strict";
    init_triggerSaveMemory();
    init_conversationReader();
  }
});

// src/triggerSaveMemory.ts
function extractCategory(segment) {
  const match = segment.match(CATEGORY_EXTRACT_REGEX2);
  return match?.[1]?.trim() ?? null;
}
function extractFileName(segment) {
  const match = segment.match(NAME_EXTRACT_REGEX2);
  const fileName = match?.[1]?.trim() ?? null;
  if (fileName === "*" || fileName === "*.json") {
    return null;
  }
  return fileName;
}
async function processMessageForSaveMemory(userText, messages, enableToolsMode) {
  const exitMatch = userText.match(EXIT_SAVE_MEMORY_REGEX2);
  const exitRequested = exitMatch !== null ? true : false;
  if (enableToolsMode && exitRequested) {
    resetPendingSaveMemory();
  }
  if (!enableToolsMode) {
    const reinitializedIncompletedSaveCommand = await scanHistoryForIncompleteSaveMemoryCommand(userText, messages);
    if (reinitializedIncompletedSaveCommand) {
      userText = exitRequested ? userText : reinitializedIncompletedSaveCommand;
    }
  }
  const saveMatch = userText.match(SAVE_MEMORY_REGEX2);
  if (saveMatch) {
    setPendingSaveMemory({
      active: true,
      memoryNumber: Number(saveMatch[1]),
      memoryNumberEndRange: null
    });
  }
  const multiSaveMatch = userText.match(MULTI_SAVE_MEMORY_REGEX2);
  if (multiSaveMatch) {
    const startMemoryNumber = Number(multiSaveMatch[1]);
    const endMemoryNumber = Number(multiSaveMatch[2]);
    setPendingSaveMemory({
      active: true,
      memoryNumber: startMemoryNumber,
      memoryNumberEndRange: endMemoryNumber
    });
  }
  const current = getPendingSaveMemory();
  if (!current.active) {
    return {
      action: "none"
    };
  }
  const segments = userText.split(/[;,.]/).map((segment) => segment.trim()).filter((segment) => segment.length > 0);
  for (const segment of segments) {
    const category = extractCategory(segment);
    if (category !== null) {
      setPendingSaveMemory({
        category
      });
      continue;
    }
    const fileName = extractFileName(segment);
    if (fileName !== null) {
      setPendingSaveMemory({
        fileName
      });
      continue;
    }
  }
  const updated = getPendingSaveMemory();
  const missing = {
    memoryNumber: updated.memoryNumber === null,
    category: updated.category === null,
    fileName: updated.fileName === null
  };
  if (updated.memoryNumber !== null && updated.category !== null && updated.fileName !== null && updated.memoryNumberEndRange !== null) {
    const savedMemoryStatus = await multiSaveMemory(updated);
    await appendSaveMemoryTextAtEndOfConversationJson(exitRequested, updated, enableToolsMode, savedMemoryStatus);
    return {
      action: "saved"
    };
  }
  if (updated.memoryNumber !== null && updated.category !== null && updated.fileName !== null && updated.memoryNumberEndRange === null) {
    const savedMemoryStatus = await saveMemory(updated);
    await appendSaveMemoryTextAtEndOfConversationJson(exitRequested, updated, enableToolsMode, savedMemoryStatus);
    return {
      action: "saved"
    };
  }
  await appendSaveMemoryTextAtEndOfConversationJson(exitRequested, updated, enableToolsMode);
  return {
    action: "waiting",
    missing,
    current: {
      memoryNumber: updated.memoryNumber,
      category: updated.category,
      fileName: updated.fileName
    }
  };
}
async function appendSaveMemoryTextAtEndOfConversationJson(exitRequested, pendingSaveMemory2, enableToolsMode, savedMemoryStatus) {
  if (enableToolsMode) return;
  addConversationOperation(
    "tryAppendSaveMemoryTextAtEndOfConversationJsonFunction",
    {
      exitRequested,
      pendingSaveMemory: pendingSaveMemory2,
      savedMemoryStatus
    }
  );
}
async function tryAppendSaveMemoryTextAtEndOfConversationJsonFunction(exitRequested, latestConversation, pendingSaveMemory2, targetAssistantMessageIndex, savedMemoryStatus) {
  let lines = [];
  if (exitRequested === true) {
    lines = await constructAssistantReplySaveMemoryExit(pendingSaveMemory2);
  } else {
    if (pendingSaveMemory2.category === null || pendingSaveMemory2.fileName === null) {
      lines = await constructAssistantReplyForMissingFields(pendingSaveMemory2);
    }
    if (pendingSaveMemory2.category !== null && pendingSaveMemory2.fileName !== null) {
      lines = await constructAssistantReplySaveMemory(pendingSaveMemory2);
    }
    if (savedMemoryStatus === false) {
      lines = await constructAssistantReplySaveMemoryNothingToSave(pendingSaveMemory2);
    }
  }
  await editAssistantResponse(
    latestConversation,
    lines.join("\n\n"),
    targetAssistantMessageIndex
  );
}
async function editAssistantResponse(conversation, replacementText, targetAssistantMessageIndex, appendInstead) {
  const assistantMessage = conversation.messages[targetAssistantMessageIndex];
  if (!assistantMessage) {
    throw new Error("No assistant message found.");
  }
  const assistantVersion = assistantMessage?.versions?.[assistantMessage.currentlySelected ?? 0];
  if (!assistantVersion) {
    throw new Error("Assistant message has no versions.");
  }
  assistantVersion.steps = assistantVersion.steps.filter(
    (step) => step.style?.type !== "thinking"
  );
  const responseStep = assistantVersion.steps.find(
    (step) => step.type === "contentBlock" && step.genInfo !== void 0 && step.content?.some(
      (contentBlock) => contentBlock.type === "text"
    )
  );
  if (!responseStep) {
    throw new Error("Could not find assistant response step.");
  }
  const textBlock = responseStep.content.find(
    (contentBlock) => contentBlock.type === "text"
  );
  if (!textBlock) {
    throw new Error("Could not find assistant response text.");
  }
  if (appendInstead) {
    const startMarker = textBlock.text.indexOf("\u{1F6A8}");
    const endMarker = textBlock.text.indexOf(
      "\u2B07\uFE0F[Assistant Message]\u2B07\uFE0F",
      startMarker
    );
    if (startMarker !== -1 && endMarker !== -1) {
      textBlock.text = textBlock.text.slice(0, startMarker) + textBlock.text.slice(
        endMarker + "\u2B07\uFE0F[Assistant Message]\u2B07\uFE0F".length
      );
    }
    textBlock.text = textBlock.text ? `${replacementText}

${textBlock.text}` : replacementText;
  } else {
    textBlock.text = replacementText;
  }
}
async function saveMemory(updated) {
  const ctl2 = getController();
  const enableToolsMode = ctl2.getPluginConfig(configSchematics).get("enableToolsMode");
  const { memoryNumber, category, fileName } = updated;
  if (memoryNumber === null || category === null || fileName === null) return false;
  try {
    const history = await getCurrentConversationHistory();
    const association = await associateAssistantResponse(
      ctl2.client,
      history,
      memoryNumber
    );
    if (association === null) {
      return false;
    }
    const cleanedRootInput = cleanUserInput(association.rootInput?.trim());
    const rootInput = cleanedRootInput !== "" ? cleanedRootInput : "original user intention/topic was fully scrubbed";
    const cleanedDirectInput = cleanUserInput(association.directInput?.trim());
    const directInput = cleanedDirectInput !== "" ? cleanedDirectInput : "original user message was fully scrubbed";
    await memoryStore.saveSeed(
      category,
      fileName,
      {
        date: (/* @__PURE__ */ new Date()).toISOString(),
        root_input: rootInput,
        direct_input: directInput,
        output: association.assistantResponse
      },
      memoryNumber
    );
    if (!enableToolsMode) {
      await appendSaveMemoryTextAtEndOfConversationJson(false, updated, enableToolsMode);
    }
    return true;
  } catch (error) {
    console.error(
      `Error creating Memory Seed: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  } finally {
    resetPendingSaveMemory();
  }
}
async function multiSaveMemory(updated) {
  const ctl2 = getController();
  const enableToolsMode = ctl2.getPluginConfig(configSchematics).get("enableToolsMode");
  const {
    memoryNumber: startMemoryNumber,
    memoryNumberEndRange: endMemoryNumber,
    category,
    fileName
  } = updated;
  if (startMemoryNumber == null || endMemoryNumber == null || category == null || fileName == null) {
    return false;
  }
  try {
    const history = await getCurrentConversationHistory();
    const seeds = [];
    for (let memoryNumber = startMemoryNumber; memoryNumber <= endMemoryNumber; memoryNumber++) {
      let association;
      try {
        association = await associateAssistantResponse(
          ctl2.client,
          history,
          memoryNumber
        );
      } catch (error) {
        console.error(
          `Failed to associate assistant response ${memoryNumber}; skipping it: ${error instanceof Error ? error.message : String(error)}`
        );
        continue;
      }
      if (association === null) {
        continue;
      }
      const cleanedRootInput = cleanUserInput(association.rootInput?.trim());
      const cleanedDirectInput = cleanUserInput(association.directInput?.trim());
      if (isMetadataOnlyInput(cleanedDirectInput)) {
        continue;
      }
      if (cleanedRootInput !== "" && cleanedDirectInput !== "") {
        seeds.push({
          date: (/* @__PURE__ */ new Date()).toISOString(),
          root_input: cleanedRootInput,
          direct_input: cleanedDirectInput,
          output: association.assistantResponse
        });
      } else if (cleanedRootInput === "" && cleanedDirectInput !== "") {
        seeds.push({
          date: (/* @__PURE__ */ new Date()).toISOString(),
          root_input: cleanedDirectInput,
          direct_input: cleanedDirectInput,
          output: association.assistantResponse
        });
      }
    }
    if (seeds.length === 0) {
      return false;
    }
    await memoryStore.saveMultipleSeeds(
      category,
      fileName,
      seeds,
      startMemoryNumber
    );
    if (!enableToolsMode) {
      await appendSaveMemoryTextAtEndOfConversationJson(false, updated, enableToolsMode);
    }
    return true;
  } catch (error) {
    console.error(
      `Error creating Memory Seed: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  } finally {
    resetPendingSaveMemory();
  }
}
async function constructAssistantReplySaveMemory(pendingSaveMemory2) {
  const lines = [];
  lines.push(
    "\u23F3 **`SAVE MEMORY MODE`**"
  );
  lines.push(
    `\u2705 **[ Message ${pendingSaveMemory2.memoryNumber}${pendingSaveMemory2.memoryNumberEndRange !== null ? ` \u2014 ${pendingSaveMemory2.memoryNumberEndRange}` : ""} ]** was successfully saved as ***${pendingSaveMemory2.category}/${pendingSaveMemory2.fileName}.json***`
  );
  return lines;
}
async function constructAssistantReplyForMissingFields(pendingSaveMemory2) {
  const lines = [];
  lines.push(
    "\u23F3 **`SAVE MEMORY MODE`**"
  );
  lines.push(
    "**Please provide the following missing information with its required prefix:**"
  );
  if (pendingSaveMemory2.category === null) {
    lines.push(
      "\u274C Category Name: `category <category_here>`."
    );
  }
  if (pendingSaveMemory2.fileName === null) {
    lines.push(
      "\u274C Memory Name: `name <name_here>`."
    );
  }
  if (pendingSaveMemory2.category === null && pendingSaveMemory2.fileName === null) {
    lines.push(
      "*To provide both together, you may use [ `;`  `,`  `.` ] to separate the missing parameters.*"
    );
    lines.push(
      "**Example:** `category <name_here>; name <name_here>`"
    );
  }
  lines.push(
    "\u26A0\uFE0F *To forcefully end this save memory attempt say:* `exit save memory`"
  );
  lines.push(
    `\u2705 *${[
      "known \u2014",
      pendingSaveMemory2.memoryNumberEndRange !== null ? `Messages: ${pendingSaveMemory2.memoryNumber} to ${pendingSaveMemory2.memoryNumberEndRange};` : `Message: ${pendingSaveMemory2.memoryNumber};`,
      pendingSaveMemory2.category !== null ? `Category: ${pendingSaveMemory2.category};` : "",
      pendingSaveMemory2.fileName !== null ? `Name: ${pendingSaveMemory2.fileName};` : ""
    ].filter(Boolean).join(" ")}*`
  );
  return lines;
}
async function constructAssistantReplySaveMemoryExit(pendingSaveMemory2) {
  const lines = [];
  lines.push(
    "\u23F3 **`SAVE MEMORY MODE`**"
  );
  lines.push(
    `\u{1F6D1}${[
      "Exiting Save Memory Request of ***[",
      pendingSaveMemory2.memoryNumberEndRange !== null ? `Messages: ${pendingSaveMemory2.memoryNumber} to ${pendingSaveMemory2.memoryNumberEndRange}` : `Message: ${pendingSaveMemory2.memoryNumber}`,
      "]***"
    ].filter(Boolean).join(" ")}`
  );
  return lines;
}
async function constructAssistantReplySaveMemoryNothingToSave(pendingSaveMemory2) {
  const lines = [];
  lines.push(
    "\u23F3 **`SAVE MEMORY MODE`**"
  );
  lines.push(
    `\u{1F6D1} ${[
      "Save Memory Request of ***[",
      pendingSaveMemory2.memoryNumberEndRange !== null ? `Messages: ${pendingSaveMemory2.memoryNumber} to ${pendingSaveMemory2.memoryNumberEndRange}` : `Message: ${pendingSaveMemory2.memoryNumber}`,
      "]***",
      "rejected because there is no eligible content."
    ].filter(Boolean).join(" ")}`
  );
  return lines;
}
function isMetadataOnlyInput(input) {
  const CATEGORY_EXTRACT_REGEX3 = getCategoryExtractRegex();
  const NAME_EXTRACT_REGEX3 = getNameExtractRegex();
  const EXIT_SAVE_MEMORY_REGEX3 = getExitSaveMemoryRegex();
  const normalized = input.trim();
  if (EXIT_SAVE_MEMORY_REGEX3.test(normalized) || input.length <= 1) {
    return true;
  }
  const segments = normalized.split(/[;,\.]/).map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) {
    return false;
  }
  return segments.every(
    (segment) => CATEGORY_EXTRACT_REGEX3.test(segment) || NAME_EXTRACT_REGEX3.test(segment)
  );
}
function isMetadataOnlyOutput(output) {
  const prefix = output.slice(0, 8);
  if (output.length <= 1 || output === "Content Retracted" || prefix.includes("\u{1F6A8}") || prefix.includes("\u{1F4E6}") || prefix.includes("\u23F3") || prefix.includes("\u2705") || prefix.includes("\u274C") || output.toLowerCase().includes("save memory mode")) {
    return true;
  }
  return false;
}
async function scanHistoryForIncompleteSaveMemoryCommand(userText, messages) {
  let lastAssistantMessage = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].data.role === "assistant") {
      lastAssistantMessage = messages[i];
      break;
    }
  }
  if (!lastAssistantMessage) {
    return "";
  }
  const extractedLastAssistantText = (lastAssistantMessage.data.content ?? []).filter(
    (content) => content.type === "text" && content.text
  ).map((content) => content.text).join("\n");
  if (!extractedLastAssistantText.includes("SAVE MEMORY MODE")) {
    return "";
  }
  const knownMatch = extractedLastAssistantText.match(
    /known\s*—\s*(.+)/i
  );
  if (!knownMatch) {
    return "";
  }
  const knownParameters = knownMatch[1];
  const messageMatch = knownParameters.match(
    /\bMessages?:\s*(\d+)(?:\s+to\s+(\d+))?\s*;/i
  );
  const categoryMatch = knownParameters.match(
    /\bCategory:\s*([^;]+)\s*;/i
  );
  const nameMatch = knownParameters.match(
    /\bName:\s*([^;]+)\s*;/i
  );
  const memoryNumber = messageMatch?.[1] ?? null;
  const memoryNumberEndRange = messageMatch?.[2] ?? null;
  let category = categoryMatch?.[1]?.trim() ?? null;
  let fileName = nameMatch?.[1]?.trim() ?? null;
  const segments = userText.split(/[;,.]/).map((segment) => segment.trim()).filter((segment) => segment.length > 0);
  for (const segment of segments) {
    const userLastCategory = extractCategory(segment);
    if (userLastCategory !== null) {
      category = userLastCategory;
      continue;
    }
    const userLastFileName = extractFileName(segment);
    if (userLastFileName !== null) {
      fileName = userLastFileName;
      continue;
    }
  }
  return [
    memoryNumberEndRange !== null ? `save memory messages ${memoryNumber} to ${memoryNumberEndRange};` : memoryNumber !== null ? `save memory ${memoryNumber};` : "",
    category !== null ? `category ${category};` : "",
    fileName !== null ? `name ${fileName};` : ""
  ].filter(Boolean).join(" ");
}
var SAVE_MEMORY_REGEX2, MULTI_SAVE_MEMORY_REGEX2, CATEGORY_EXTRACT_REGEX2, NAME_EXTRACT_REGEX2, EXIT_SAVE_MEMORY_REGEX2;
var init_triggerSaveMemory = __esm({
  "src/triggerSaveMemory.ts"() {
    "use strict";
    init_memoryStore();
    init_conversationHistoryCache();
    init_memoryAssociation();
    init_conversationReader();
    init_config();
    SAVE_MEMORY_REGEX2 = getSaveMemoryRegex();
    MULTI_SAVE_MEMORY_REGEX2 = getMultiSaveMemoryRegex();
    CATEGORY_EXTRACT_REGEX2 = getCategoryExtractRegex();
    NAME_EXTRACT_REGEX2 = getNameExtractRegex();
    EXIT_SAVE_MEMORY_REGEX2 = getExitSaveMemoryRegex();
  }
});

// src/tableOfMemories.ts
async function tableOfMemoriesMain() {
  const config = getController().getPluginConfig(configSchematics);
  const initializeTOM = config.get("initializeTOM");
  const memoriesDirectory = await memoryStore.getMemoriesDirectory();
  if (initializeTOM) {
    await createTableOfMemories(memoriesDirectory);
    await initializeTableOfMemoriesFromLegacyPluginVersion(memoriesDirectory);
  }
}
async function processMessageForTom(userText, retractOldToms, enableToolsMode) {
  const TABLE_OF_MEMORIES_REGEX2 = getTableOfMemoriesRegex();
  const FUZZY_SEARCH_MEMORY_REGEX2 = getFuzzySearchRegex();
  const DIRECT_FETCH_MEMORY_REGEX2 = getDirectFetchRegex();
  const tomMatch = userText.match(TABLE_OF_MEMORIES_REGEX2);
  const pendingTomCommand2 = getPendingTomCommand();
  let constructedTableString = "";
  const tomDirectFetchMatch = userText.match(DIRECT_FETCH_MEMORY_REGEX2);
  if (retractOldToms > 0) {
    addConversationOperation(
      "tryRetractOldTomsFunction",
      {
        retractOldToms,
        enableToolsMode
      }
    );
  }
  if (enableToolsMode) return;
  if (tomDirectFetchMatch) {
    const memorySeedsPool2 = getMemorySeedsPool();
    const requestedSeeds = /* @__PURE__ */ new Set();
    for (const seed of memorySeedsPool2) {
      if (userText.includes(seed)) {
        requestedSeeds.add(seed);
      }
      const slashIndex = seed.indexOf("/");
      if (slashIndex === -1) continue;
      const category = seed.slice(0, slashIndex);
      const wildcard = `${category}/*.json`;
      if (userText.includes(wildcard)) {
        requestedSeeds.add(seed);
      }
    }
    const validatedSeedsToFetch = [...requestedSeeds];
    const memoriesPackage = await promptProcessorConstructMemoriesToInject(
      validatedSeedsToFetch,
      false
      // Do not summarize seeds
    );
    constructedTableString = formatMemoryPackage(memoriesPackage);
    if (constructedTableString !== "") {
      addConversationOperation(
        "tryAppendTableOfMemoriesContentFunction",
        {
          constructedTableString
        }
      );
      setPendingTomCommand("ready");
    }
    return;
  }
  if (tomMatch || pendingTomCommand2 === "incomplete") {
    const match = extractMemoryRange(userText);
    if (match) {
      const tableName = `TOM_${match.toUpperCase()}`;
      const returnPackage = await tableOfMemoriesDirectLookup(tableName);
      constructedTableString = formatAsTableString(returnPackage);
      setPendingTomCommand("ready");
    } else {
      constructedTableString = "Specify exactly which Table of Memories you wish to retrieve: `TOM_" + TOM_RANGES.first.start + "-" + TOM_RANGES.first.end + "`, `TOM_" + TOM_RANGES.second.start + "-" + TOM_RANGES.second.end + "`, `TOM_" + TOM_RANGES.special.start + "-" + TOM_RANGES.special.end + "`";
      setPendingTomCommand("incomplete");
    }
  } else {
    const fuzzySearchMatch = userText.match(FUZZY_SEARCH_MEMORY_REGEX2);
    if (fuzzySearchMatch) {
      const extractedQuery = await askModelToValidateFuzzySearchRegexAndExtractQuery(userText);
      if (extractedQuery !== "") {
        const returnPackage = await tableOfMemoriesSummariesLookup(extractedQuery);
        if (returnPackage !== "") {
          constructedTableString = constructTOMSummariesLookupTable(returnPackage);
          setPendingTomCommand("ready");
        }
      }
    }
  }
  if (constructedTableString !== "") {
    addConversationOperation(
      "tryAppendTableOfMemoriesContentFunction",
      {
        constructedTableString
      }
    );
  }
}
function formatMemoryPackage(packageText) {
  const memoryBlockRegex = /\[BEGIN ([^\]]+\.json)\]([\s\S]*?)\[END \1\]/gi;
  const formattedMemories = [];
  let blockMatch;
  while ((blockMatch = memoryBlockRegex.exec(packageText)) !== null) {
    const source = blockMatch[1].trim();
    const payload = blockMatch[2].trim();
    const dateMatch = payload.match(
      /DATE:\s*(.*?)(?=\s+TOPIC_\d+:|$)/i
    );
    const date = dateMatch?.[1]?.trim() ?? "Date unavailable";
    const topicRegex = /TOPIC_(\d+):\s*([\s\S]*?)(?=\s+TOPIC_\d+:|$)/gi;
    const rows = [];
    let topicMatch;
    while ((topicMatch = topicRegex.exec(payload)) !== null) {
      const topicNumber = topicMatch[1];
      const section = topicMatch[2].trim();
      const userMatch = /\bUSER\s*:/i.exec(section);
      const assistantMatch = /\bASSISTANT\s*:/i.exec(section);
      const firstMessageIndex = [
        userMatch?.index,
        assistantMatch?.index
      ].filter((index) => index !== void 0).reduce(
        (minimum, index) => Math.min(minimum, index),
        section.length
      );
      const topicText = section.slice(0, firstMessageIndex).trim();
      let userText = "";
      if (userMatch) {
        const userStart = userMatch.index + userMatch[0].length;
        const userEnd = assistantMatch && assistantMatch.index > userMatch.index ? assistantMatch.index : section.length;
        userText = section.slice(userStart, userEnd).trim();
      }
      let assistantText = "";
      if (assistantMatch) {
        const assistantStart = assistantMatch.index + assistantMatch[0].length;
        assistantText = section.slice(assistantStart).trim();
      }
      rows.push(
        `| **TOPIC ${topicNumber}** | ${escapeCell(topicText)} |`,
        `| **USER** | ${escapeCell(userText)} |`,
        `| **ASSISTANT** | ${escapeCell(assistantText)} |`
      );
    }
    formattedMemories.push(
      [
        "\u{1F4E6} **`Memory Package`**",
        `### ${source}`,
        `**DATE:** ${escapeCell(date)}`,
        "",
        "| Field | Content |",
        "|---|---|",
        ...rows
      ].join("\n")
    );
  }
  return formattedMemories.join("\n\n");
  function escapeCell(value) {
    return value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
  }
}
async function askModelToValidateFuzzySearchRegexAndExtractQuery(userText) {
  const client2 = getController().client;
  const model = await client2.llm.model();
  const prompt = `
        The user has provided a text which may be a request or command to recall, find, or any synonym of 'search' for a MEMORY OR MEMORIES. 

        Extract the subject or phrase of what they are trying to search for. Do not include the search command within your returned string of the search query you have extracted.

        If this was not a valid search query return an empty string.

        [BEGINNING OF USER TEXT]: 
        ${userText}
        [END OF USER TEXT]
        `.trim();
  const result = await model.respond(
    prompt,
    {
      temperature: 0
    }
  );
  const cleanedText = result.content.replace(
    /^[\s\S]*?__LM_STUDIO_INTERNAL_LSEP_SYNTHETIC_REASONING_END_[A-Za-z0-9]+__/i,
    ""
  ).replace(/^[\s\S]*?```(?:json)?\s*/i, "").replace(/\s*```[\s\S]*$/i, "").trim();
  return cleanedText;
}
function extractMemoryRange(input) {
  const MEMORY_RANGE_REGEX2 = getMemoryRangeRegex();
  const match = input.match(MEMORY_RANGE_REGEX2);
  if (!match) return null;
  const letters = match[1].replace(/[\s-]/g, "").toLowerCase();
  if (!/^[a-z]{2}$/.test(letters)) return null;
  const [start, end] = letters;
  const first = TOM_RANGES.first;
  if (new RegExp(`[${first.start}-${first.end}]`, "i").test(start) && new RegExp(`[${first.start}-${first.end}]`, "i").test(end))
    return `${first.start}-${first.end}`.toLowerCase();
  const second = TOM_RANGES.second;
  if (new RegExp(`[${second.start}-${second.end}]`, "i").test(start) && new RegExp(`[${second.start}-${second.end}]`, "i").test(end))
    return `${second.start}-${second.end}`.toLowerCase();
  const special = TOM_RANGES.special;
  if (new RegExp(`[${special.start}-${special.end}]`, "i").test(start) && new RegExp(`[${special.start}-${special.end}]`, "i").test(end))
    return `${special.start}-${special.end}`.toLowerCase();
  return null;
}
async function createTableOfMemories(memoriesDirectory) {
  const tableNames = [
    `TOM_${TOM_RANGES.first.start}-${TOM_RANGES.first.end}.json`,
    `TOM_${TOM_RANGES.second.start}-${TOM_RANGES.second.end}.json`,
    `TOM_${TOM_RANGES.special.start}-${TOM_RANGES.special.end}.json`
    // Special characters will live in R-Z.
  ];
  for (const tableName of tableNames) {
    const filePath = (0, import_node_path.join)(memoriesDirectory, tableName);
    try {
      await (0, import_promises3.writeFile)(filePath, "[]", {
        encoding: "utf-8",
        flag: "wx"
      });
    } catch (error) {
      const fsError = error;
      if (fsError.code === "EEXIST") {
        continue;
      }
      console.error(
        `Failed to create table of memories "${filePath}":`,
        error
      );
    }
  }
}
async function initializeTableOfMemoriesFromLegacyPluginVersion(memoriesDirectory) {
  const functionName = "initializeTableOfMemoriesFromLegacyPluginVersion";
  setTimeout(() => {
    void runInitialization().catch((error) => {
      console.error(
        `${functionName} failed:`,
        error
      );
    });
  }, 0);
  async function runInitialization() {
    const categories = await (0, import_promises3.readdir)(
      memoriesDirectory,
      { withFileTypes: true }
    );
    for (const category of categories) {
      if (!category.isDirectory()) {
        continue;
      }
      const categoryPath = import_node_path2.default.join(
        memoriesDirectory,
        category.name
      );
      const files = await (0, import_promises3.readdir)(
        categoryPath,
        { withFileTypes: true }
      );
      const firstCharacter = category.name[0].toUpperCase();
      const tomFileName = firstCharacter >= `${TOM_RANGES.first.start}` && firstCharacter <= `${TOM_RANGES.first.end}` ? `TOM_${TOM_RANGES.first.start}-${TOM_RANGES.first.end}.json` : firstCharacter >= `${TOM_RANGES.second.start}` && firstCharacter <= `${TOM_RANGES.second.end}` ? `TOM_${TOM_RANGES.second.start}-${TOM_RANGES.second.end}.json` : `TOM_${TOM_RANGES.special.start}-${TOM_RANGES.special.end}.json`;
      const tomFilePath = import_node_path2.default.join(
        memoriesDirectory,
        tomFileName
      );
      let lockOwnerName;
      const lockFile = `${tomFilePath}.lock`;
      lockOwnerName = await acquireLock(lockFile, functionName);
      try {
        for (const file of files) {
          if (!file.isFile() || !file.name.toLowerCase().endsWith(".json")) {
            continue;
          }
          const fileName = `${category.name}/${file.name}`;
          const memoryFilePath = import_node_path2.default.join(
            categoryPath,
            file.name
          );
          try {
            const memoryStats = await (0, import_promises3.stat)(memoryFilePath);
            const fileSizeKB = memoryStats.size / 1024;
            let tableOfMemories = [];
            try {
              const tomContent = await (0, import_promises3.readFile)(
                tomFilePath,
                "utf-8"
              );
              tableOfMemories = JSON.parse(tomContent);
            } catch (error) {
              const fsError = error;
              if (fsError.code !== "ENOENT") {
                throw error;
              }
            }
            const existingIndex = tableOfMemories.findIndex(
              (entry) => entry.fileName === fileName
            );
            if (existingIndex !== -1 && tableOfMemories[existingIndex].fileSizeKB === fileSizeKB) {
              continue;
            }
            const memoryFragments = await reconstructMemoryFragments(memoryFilePath);
            const summaryReturnPackage = await modelCallToCraftMemorySummaryAndKeywords(memoryFragments);
            const { summary, keywords } = extractSummaryAndKeywords(summaryReturnPackage);
            const entity = {
              fileSizeKB,
              fileName,
              keywords,
              summary
            };
            if (existingIndex !== -1) {
              tableOfMemories[existingIndex] = entity;
            } else {
              tableOfMemories.push(entity);
            }
            await (0, import_promises3.writeFile)(
              tomFilePath,
              JSON.stringify(tableOfMemories, null, 4),
              "utf-8"
            );
          } catch (error) {
            console.error(
              `Failed to initialize "${fileName}" in ${tomFileName}:`,
              error
            );
          }
        }
      } finally {
        if (lockOwnerName !== void 0) {
          await releaseLock(lockFile, lockOwnerName);
          lockOwnerName = void 0;
        }
      }
    }
  }
}
async function modelCallToCraftMemorySummaryAndKeywords(memoryFragments) {
  const client2 = getController().client;
  const model = await client2.llm.model();
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
      temperature: 0
    }
  );
  const cleanedText = result.content.replace(
    /^[\s\S]*?__LM_STUDIO_INTERNAL_LSEP_SYNTHETIC_REASONING_END_[A-Za-z0-9]+__/i,
    ""
  ).replace(/^[\s\S]*?```(?:json)?\s*/i, "").replace(/\s*```[\s\S]*$/i, "").trim();
  return cleanedText;
}
function extractSummaryAndKeywords(response) {
  const normalizeTag = (tag) => tag.replace(/[\s_-]+/g, "").toUpperCase();
  const tagPattern = /\[\s*(BEGINNING[\s_-]*OF[\s_-]*(?:SUMMARY|KEYWORDS)|END[\s_-]*OF[\s_-]*(?:SUMMARY|KEYWORDS)|SUMMARY|KEYWORDS)\s*\]/gi;
  const tags = [];
  for (const match of response.matchAll(tagPattern)) {
    const rawTag = normalizeTag(match[1]);
    const type = rawTag.endsWith("SUMMARY") ? "summary" : "keywords";
    const kind = rawTag.startsWith("BEGINNINGOF") || rawTag === type.toUpperCase() ? "begin" : "end";
    tags.push({
      type,
      kind,
      start: match.index,
      contentStart: match.index + match[0].length
    });
  }
  const result = {
    summary: "",
    keywords: ""
  };
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    if (tag.kind !== "begin") {
      continue;
    }
    const nextBegin = tags.slice(i + 1).find((next) => next.kind === "begin");
    const matchingEnd = tags.slice(i + 1).find(
      (next) => next.type === tag.type && next.kind === "end"
    );
    const boundary = matchingEnd && (!nextBegin || matchingEnd.start < nextBegin.start) ? matchingEnd.start : nextBegin?.start ?? response.length;
    result[tag.type] = response.slice(tag.contentStart, boundary).trim();
  }
  return result;
}
async function reconstructMemoryFragments(memoryFilePath) {
  const content = await (0, import_promises3.readFile)(memoryFilePath, "utf-8");
  const turns = JSON.parse(content);
  return turns.map(
    (turn, index) => `[Turn ${index + 1}] User: ${turn.direct_input}
Assistant: ${turn.output}`
  ).join("\n\n");
}
async function updateTableOfMemoriesIncrementally(memoriesDirectory, category, name, seeds) {
  const functionName = "updateTableOfMemoriesIncrementally";
  setTimeout(() => {
    void runUpdateTom().catch((error) => {
      console.error(
        `${functionName} failed:`,
        error
      );
    });
  }, 0);
  async function runUpdateTom() {
    const firstCharacter = category[0].toUpperCase();
    const tomFileName = firstCharacter >= `${TOM_RANGES.first.start}` && firstCharacter <= `${TOM_RANGES.first.end}` ? `TOM_${TOM_RANGES.first.start}-${TOM_RANGES.first.end}.json` : firstCharacter >= `${TOM_RANGES.second.start}` && firstCharacter <= `${TOM_RANGES.second.end}` ? `TOM_${TOM_RANGES.second.start}-${TOM_RANGES.second.end}.json` : `TOM_${TOM_RANGES.special.start}-${TOM_RANGES.special.end}.json`;
    const tomFilePath = import_node_path2.default.join(
      memoriesDirectory,
      tomFileName
    );
    const fileName = `${category}/${name}.json`;
    const tomContent = await import_promises2.default.readFile(
      tomFilePath,
      "utf-8"
    );
    const tableOfMemories = JSON.parse(tomContent);
    const existingIndex = tableOfMemories.findIndex(
      (entry) => entry.fileName === fileName
    );
    const existingEntry = existingIndex !== -1 ? tableOfMemories[existingIndex] : void 0;
    const newMemoryFragments = seeds.map(
      (seed, index) => `[Turn ${index + 1}] User: ${seed.direct_input}
Assistant: ${seed.output}`
    ).join("\n\n");
    const consolidationInput = [
      "CURRENT SUMMARY:",
      existingEntry?.summary ?? "",
      "",
      "CURRENT KEYWORDS:",
      existingEntry?.keywords ?? "",
      "",
      "NEW MEMORY FRAGMENTS:",
      newMemoryFragments
    ].join("\n");
    const summaryReturnPackage = await modelCallToUpdateMemorySummaryAndKeywords(consolidationInput);
    const { summary, keywords } = extractSummaryAndKeywords(summaryReturnPackage);
    const memoryFilePath = import_node_path2.default.join(
      memoriesDirectory,
      category,
      `${name}.json`
    );
    const memoryStats = await (0, import_promises3.stat)(memoryFilePath);
    const updatedEntry = {
      fileSizeKB: memoryStats.size / 1024,
      fileName,
      keywords,
      summary
    };
    if (existingIndex !== -1) {
      tableOfMemories[existingIndex] = updatedEntry;
    } else {
      tableOfMemories.push(updatedEntry);
    }
    await import_promises2.default.writeFile(
      tomFilePath,
      JSON.stringify(tableOfMemories, null, 4),
      "utf-8"
    );
  }
}
async function modelCallToUpdateMemorySummaryAndKeywords(consolidationInput) {
  const client2 = getController().client;
  const model = await client2.llm.model();
  const prompt = `
        The user needs you the assistant to update the CURRENT SUMMARY AND CURRENT KEYWORDS if there is any impactful, significant or relevant changes based on the addition of the NEW MEMORY FRAGMENTS.

        Ensure that the final summary you provide is faithful to the current summary and retains it's key elements and takes into account the additional content provided by the new memory fragments. Wrap your final summary in the exact tags of [BEGINNING_OF_SUMMARY] and [END_OF_SUMMARY].

        In addition to updating the summary, identify only significant keywords from the new memory fragments which are relevant enough to be add to the current keywords.

        Try to limit yourself to no more than 7 of the best suited keywords, so make sure the keywords you have chosen to add or remove are substantive. Wrap the collection of keywords identified in the exact tags of [BEGINNING_OF_KEYWORDS] and [END_OF_KEYWORDS].

        If there are no significant or meaningful keywords to add or remove return back the keywords that you originally received.

        If there is no significant or meaningful update to the summary return back the summary that you originally received.

        [BEGINNING OF PACKAGE]: 
        ${consolidationInput}
        [END OF PACKAGE]
        `.trim();
  const result = await model.respond(
    prompt,
    {
      temperature: 0
    }
  );
  const cleanedText = result.content.replace(
    /^[\s\S]*?__LM_STUDIO_INTERNAL_LSEP_SYNTHETIC_REASONING_END_[A-Za-z0-9]+__/i,
    ""
  ).replace(/^[\s\S]*?```(?:json)?\s*/i, "").replace(/\s*```[\s\S]*$/i, "").trim();
  return cleanedText;
}
async function deleteMemoryFromTableOfMemories(memoriesDirectory, category, filename) {
  const firstCharacter = category[0].toUpperCase();
  const tomFileName = firstCharacter >= `${TOM_RANGES.first.start}` && firstCharacter <= `${TOM_RANGES.first.end}` ? `TOM_${TOM_RANGES.first.start}-${TOM_RANGES.first.end}.json` : firstCharacter >= `${TOM_RANGES.second.start}` && firstCharacter <= `${TOM_RANGES.second.end}` ? `TOM_${TOM_RANGES.second.start}-${TOM_RANGES.second.end}.json` : `TOM_${TOM_RANGES.special.start}-${TOM_RANGES.special.end}.json`;
  const tomFilePath = (0, import_node_path.join)(memoriesDirectory, tomFileName);
  const fileName = `${category}/${filename}`;
  const tomContent = await (0, import_promises3.readFile)(tomFilePath, "utf-8");
  const tableOfMemories = JSON.parse(tomContent);
  const filteredTableOfMemories = tableOfMemories.filter(
    (entry) => entry.fileName !== fileName
  );
  if (filteredTableOfMemories.length !== tableOfMemories.length) {
    await (0, import_promises3.writeFile)(
      tomFilePath,
      JSON.stringify(filteredTableOfMemories, null, 4),
      "utf-8"
    );
  }
  return tomFileName;
}
async function tableOfMemoriesSummariesLookup(query) {
  const memoriesDirectory = await memoryStore.getMemoriesDirectory();
  const tomFileNames = [
    `TOM_${TOM_RANGES.first.start}-${TOM_RANGES.first.end}.json`,
    `TOM_${TOM_RANGES.second.start}-${TOM_RANGES.second.end}.json`,
    `TOM_${TOM_RANGES.special.start}-${TOM_RANGES.special.end}.json`
  ];
  const allEntries = [];
  for (const tomFileName of tomFileNames) {
    const tomFilePath = import_node_path2.default.join(
      memoriesDirectory,
      tomFileName
    );
    try {
      const content = await (0, import_promises3.readFile)(tomFilePath, "utf-8");
      const entries = JSON.parse(content);
      allEntries.push(...entries);
    } catch (error) {
      const fsError = error;
      if (fsError.code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }
  if (allEntries.length === 0) {
    return "";
  }
  const keywordIndex = allEntries.map(
    (entry) => `[filename: "${entry.fileName}"
keywords: "${entry.keywords}"]`
  ).join("\n\n");
  const keywordMatches = await modelCallToSelectMemoryFilenamesByKeywords(
    query,
    keywordIndex
  );
  const keywordMatchNames = parseReturnedFilenames(
    keywordMatches
  );
  const entriesByFileName = new Map(
    allEntries.map((entry) => [entry.fileName, entry])
  );
  const shortlistedEntries = [];
  const seenNames = /* @__PURE__ */ new Set();
  for (const fileName of keywordMatchNames) {
    const entry = entriesByFileName.get(fileName);
    if (!entry || seenNames.has(fileName)) {
      continue;
    }
    seenNames.add(fileName);
    shortlistedEntries.push(entry);
    if (shortlistedEntries.length === 8) {
      break;
    }
  }
  if (shortlistedEntries.length === 0) {
    return "";
  }
  const candidateSummaries = shortlistedEntries.map(
    (entry) => `[filename: "${entry.fileName}"
summary: "${entry.summary}"]`
  ).join("\n\n");
  const summaryMatches = await modelCallToSelectMemoryFilenamesBySummaries(
    query,
    candidateSummaries
  );
  const finalMatchNames = parseReturnedFilenames(
    summaryMatches
  );
  const shortlistedByName = new Map(
    shortlistedEntries.map(
      (entry) => [entry.fileName, entry]
    )
  );
  const finalResults = [];
  const finalSeenNames = /* @__PURE__ */ new Set();
  for (const fileName of finalMatchNames) {
    const entry = shortlistedByName.get(fileName);
    if (!entry || finalSeenNames.has(fileName)) {
      continue;
    }
    finalSeenNames.add(fileName);
    finalResults.push(
      `Filename: ${entry.fileName}
Summary: ${entry.summary}`
    );
  }
  if (finalResults.length === 0) {
    return "";
  }
  return finalResults.join("\n\n");
}
async function modelCallToSelectMemoryFilenamesByKeywords(query, keywordIndex) {
  const client2 = getController().client;
  const model = await client2.llm.model();
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
      temperature: 0
    }
  );
  const cleanedText = result.content.replace(
    /^[\s\S]*?__LM_STUDIO_INTERNAL_LSEP_SYNTHETIC_REASONING_END_[A-Za-z0-9]+__/i,
    ""
  ).replace(/^[\s\S]*?```(?:json)?\s*/i, "").replace(/\s*```[\s\S]*$/i, "").trim();
  return cleanedText;
}
async function modelCallToSelectMemoryFilenamesBySummaries(query, candidateSummaries) {
  const client2 = getController().client;
  const model = await client2.llm.model();
  const prompt = `
        The user needs you the assistant to return to them the filenames of the SUMMARIES ENTRIES that best matches their user query.

        Best matches does not require exact word matches, you may match for similar meaning or themes.

        Limit yourself to at most 3 filenames of the best matching summaries. It is acceptable to return nothing if there are no good matches.

        Return the simple text formatted filename matches in a single string array.

        User Query: ${query}. 

        [BEGINNING OF SUMMARIES ENTRIES]: 
        ${candidateSummaries}
        [END OF SUMMARIES ENTRIES]
        `.trim();
  const result = await model.respond(
    prompt,
    {
      temperature: 0
    }
  );
  const cleanedText = result.content.replace(
    /^[\s\S]*?__LM_STUDIO_INTERNAL_LSEP_SYNTHETIC_REASONING_END_[A-Za-z0-9]+__/i,
    ""
  ).replace(/^[\s\S]*?```(?:json)?\s*/i, "").replace(/\s*```[\s\S]*$/i, "").trim();
  return cleanedText;
}
function parseReturnedFilenames(response) {
  const trimmedResponse = response.trim();
  try {
    const parsed = JSON.parse(trimmedResponse);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed.map((fileName) => fileName.trim()).filter((fileName) => fileName.length > 0);
    }
  } catch {
  }
  return trimmedResponse.split(/\r?\n/).map((line) => line.trim()).map(
    (line) => line.replace(/^(?:[-*•]|\d+[.)])\s*/, "").replace(/^["'`]|["'`]$/g, "").replace(/^\*+|\*+$/g, "").trim()
  ).filter((line) => line.length > 0);
}
async function tableOfMemoriesDirectLookup(tomName) {
  const memoriesDirectory = await memoryStore.getMemoriesDirectory();
  const validTomFiles = [
    `TOM_${TOM_RANGES.first.start}-${TOM_RANGES.first.end}`,
    `TOM_${TOM_RANGES.second.start}-${TOM_RANGES.second.end}`,
    `TOM_${TOM_RANGES.special.start}-${TOM_RANGES.special.end}`
  ];
  const normalizedTomName = tomName.trim().replace(/\.json$/i, "").toUpperCase();
  if (!validTomFiles.includes(normalizedTomName)) {
    return "";
  }
  const tomFilePath = import_node_path2.default.join(
    memoriesDirectory,
    `${normalizedTomName}.json`
  );
  try {
    return await (0, import_promises3.readFile)(tomFilePath, "utf-8");
  } catch (error) {
    const fsError = error;
    if (fsError.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}
function constructTOMSummariesLookupTable(returnPackage) {
  const MEMORY_ENTRY_REGEX = /Filename:\s*(.*?)\s*Summary:\s*([\s\S]*?)(?=Filename:|$)/g;
  const entries = Array.from(
    returnPackage.matchAll(MEMORY_ENTRY_REGEX),
    ([, filename, summary]) => ({
      filename: filename.trim(),
      summary: summary.trim()
    })
  );
  if (entries.length === 0) return "";
  const escape = (value) => value.replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
  return [
    "\u{1F4E6} **`Memory Package`**",
    "| Filename | Summary |",
    "| --- | --- |",
    ...entries.map(
      ({ filename, summary }) => `| ${escape(filename)} | ${escape(summary)} |`
    )
  ].join("\n");
}
function formatAsTableString(input) {
  if (!input.trim()) return "";
  const data = JSON.parse(input);
  if (!Array.isArray(data)) return "";
  const escapeCell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  const headers = [
    "fileName",
    "fileSize (KB)",
    "Keywords",
    "Summary"
  ];
  return [
    "\u{1F4E6} **`Memory Package`**",
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...data.map(
      (file) => `| ${[
        file.fileName,
        Number(file.fileSizeKB).toFixed(2),
        file.keywords,
        file.summary
      ].map(escapeCell).join(" | ")} |`
    )
  ].join("\n");
}
async function tryAppendTableOfMemoriesContentFunction(latestConversation, constructedTableString, targetAssistantMessageIndex) {
  let lines = [];
  lines.push(
    `${constructedTableString}`
  );
  await editAssistantResponse(
    latestConversation,
    lines.join("\n\n"),
    targetAssistantMessageIndex
  );
}
async function tryRetractOldTomsFunction(latestConversation, lastAssistantMessageIndex, retractOldToms, enableToolsMode) {
  if (retractOldToms === 0) return;
  const storedIndex = getLastKnownIndexOfRetractedToms();
  const startIndex = storedIndex ?? 0;
  const marker = "\u{1F4E6}";
  const toolNames = /* @__PURE__ */ new Set([
    "table_of_memories_lookup",
    "memory_seed_recall",
    "direct_memory_lookup",
    "compaction_summary_fetch"
  ]);
  const assistantMessageIndices = latestConversation.messages.map(
    (message, index) => message.versions?.some(
      (version) => version.role === "assistant"
    ) ? index : -1
  ).filter((index) => index !== -1);
  const excludedAssistantIndices = new Set(
    assistantMessageIndices.slice(-retractOldToms)
  );
  for (let messageIndex = startIndex; messageIndex < latestConversation.messages.length; messageIndex++) {
    if (excludedAssistantIndices.has(messageIndex)) {
      continue;
    }
    ;
    const message = latestConversation.messages[messageIndex];
    for (const version of message.versions ?? []) {
      if (version.role !== "assistant") continue;
      if (enableToolsMode) {
        let matchingResultStepIndex = -1;
        for (let stepIndex = 0; stepIndex < (version.steps ?? []).length; stepIndex++) {
          const step = version.steps[stepIndex];
          for (const item of step.content ?? []) {
            if (item.type !== "toolCallResult") continue;
            if (!toolNames.has(item.name)) continue;
            if (typeof item.content !== "string") continue;
            if (item.content.slice(0, 10).includes(marker)) {
              item.content = "Content Retracted";
              matchingResultStepIndex = stepIndex;
              break;
            }
          }
          if (matchingResultStepIndex !== -1) break;
        }
        if (matchingResultStepIndex !== -1) {
          for (let stepIndex = matchingResultStepIndex + 1; stepIndex < (version.steps ?? []).length; stepIndex++) {
            const step = version.steps[stepIndex];
            if (step.style?.type === "thinking") continue;
            const responseText = (step.content ?? []).find(
              (item) => item.type === "text" && typeof item.text === "string"
            );
            if (responseText) {
              responseText.text = "Content Retracted";
              break;
            }
          }
        } else {
          for (const step of version.steps ?? []) {
            if (step.style?.type === "thinking") continue;
            for (const item of step.content ?? []) {
              if (item.type === "text" && typeof item.text === "string" && item.text.slice(0, 7).includes(marker)) {
                item.text = "Content Retracted";
                break;
              }
            }
            if ((step.content ?? []).some(
              (item) => item.type === "text" && item.text === "Content Retracted"
            )) {
              break;
            }
          }
        }
        continue;
      }
      let found = false;
      for (const step of version.steps ?? []) {
        if (step.style?.type === "thinking") continue;
        for (const item of step.content ?? []) {
          if (item.type === "text" && typeof item.text === "string" && item.text.slice(0, 10).includes(marker)) {
            item.text = "Content Retracted";
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }
  }
  setLastKnownIndexOfRetractedToms(
    assistantMessageIndices.slice(-2)[0] ?? lastAssistantMessageIndex
  );
}
var import_node_path, import_node_path2, import_promises2, import_promises3;
var init_tableOfMemories = __esm({
  "src/tableOfMemories.ts"() {
    "use strict";
    init_acquireLockFile();
    init_memoryStore();
    import_node_path = require("node:path");
    init_triggerSaveMemory();
    init_memorySession();
    init_promptPreprocessor();
    import_node_path2 = __toESM(require("node:path"));
    import_promises2 = __toESM(require("node:fs/promises"));
    init_config();
    import_promises3 = require("node:fs/promises");
  }
});

// src/tableOfCompactions.ts
async function tableOfCompactionsMain(deleteTocCollectionsAfterNthDays) {
  if (deleteTocCollectionsAfterNthDays > 0) {
    await deleteExpiredCompactionsAndTocCleanup(deleteTocCollectionsAfterNthDays);
  }
  const memoriesDirectory = await memoryStore.getMemoriesDirectory();
  await createTableOfCompactions(memoriesDirectory);
  const parsedCompactionFileData = await findShadowCopyAndParse();
  if (parsedCompactionFileData === null) return;
  const savedCompactionsStatus = await processCompactionFileDataAndCreateMemorySeeds(parsedCompactionFileData);
}
async function processMessageForCompactionSummary(userText, enableToolsMode) {
  if (enableToolsMode) return;
  const COMPACTION_SUMMARY_REGEX2 = getCompactionSummaryRegex();
  const LIST_COMPACTION_SEEDS_REGEX2 = getListCompactionSeedsRegex();
  const compactionSummaryMatch = userText.match(COMPACTION_SUMMARY_REGEX2);
  const listCompactionSeedsMatch = userText.match(LIST_COMPACTION_SEEDS_REGEX2);
  let constructedSummaryString = "";
  if (listCompactionSeedsMatch) {
    const allCompactionSeedsAvailable = await listCompactionSeeds(true);
    constructedSummaryString = allCompactionSeedsAvailable;
    if (constructedSummaryString !== "") {
      addConversationOperation(
        "tryAppendCompactionSummaryFunction",
        {
          constructedSummaryString
        }
      );
      setPendingTomCommand("ready");
    }
    return;
  }
  if (compactionSummaryMatch) {
    const allSeeds = (await scanForAndReturnMatchingFiles()).map((entry) => entry.name);
    const requestedFileName = extractCompactionFileName(
      userText,
      allSeeds
    );
    console.log(requestedFileName);
    if (!requestedFileName) return;
    constructedSummaryString = await createCompactionSummary(requestedFileName);
    if (constructedSummaryString !== "") {
      addConversationOperation(
        "tryAppendCompactionSummaryFunction",
        {
          constructedSummaryString
        }
      );
      setPendingTomCommand("ready");
    }
  }
}
async function tryAppendCompactionSummaryFunction(latestConversation, constructedTableString, targetAssistantMessageIndex) {
  await editAssistantResponse(
    latestConversation,
    constructedTableString,
    targetAssistantMessageIndex
  );
}
async function createTableOfCompactions(memoriesDirectory, createTodaysTable) {
  const now = /* @__PURE__ */ new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
  const compactionsDirectory = import_node_path4.default.join(
    memoriesDirectory,
    "compactions"
  );
  const tocEntityDirectory = import_node_path4.default.join(
    compactionsDirectory,
    "TOC_Entity"
  );
  const tocSeedsDirectory = import_node_path4.default.join(
    compactionsDirectory,
    "TOC_Seeds"
  );
  const tocSummariesDirectory = import_node_path4.default.join(
    compactionsDirectory,
    "TOC_Summaries"
  );
  await (0, import_promises5.mkdir)(tocEntityDirectory, { recursive: true });
  await (0, import_promises5.mkdir)(tocSeedsDirectory, { recursive: true });
  await (0, import_promises5.mkdir)(tocSummariesDirectory, { recursive: true });
  const filePath = import_node_path4.default.join(
    tocEntityDirectory,
    `TOC_${today}.json`
  );
  let todayTableCreated = false;
  try {
    await (0, import_promises5.writeFile)(filePath, "[]", {
      encoding: "utf-8",
      flag: "wx"
    });
    todayTableCreated = true;
  } catch (error) {
    if (error.code !== "EEXIST") {
      console.error(
        `Failed to create table of memories "${filePath}":`,
        error
      );
      return;
    }
  }
  const collectionsFilePath = import_node_path4.default.join(
    compactionsDirectory,
    "TOC_Collections.json"
  );
  try {
    await (0, import_promises5.writeFile)(collectionsFilePath, "[]", {
      encoding: "utf-8",
      flag: "wx"
    });
  } catch (error) {
    if (error.code !== "EEXIST") {
      console.error(
        `Failed to create collections TOC "${collectionsFilePath}":`,
        error
      );
      return;
    }
  }
  if (!todayTableCreated) {
    return;
  }
  try {
    const contents = await (0, import_promises5.readFile)(
      collectionsFilePath,
      "utf-8"
    );
    const collections = JSON.parse(contents);
    collections.push({
      date_created_group: today,
      members_fileName: []
    });
    await (0, import_promises5.writeFile)(
      collectionsFilePath,
      JSON.stringify(collections, null, 2),
      "utf-8"
    );
  } catch (error) {
    console.error(
      `Failed to update collections TOC "${collectionsFilePath}":`,
      error
    );
  }
}
async function findShadowCopyAndParse() {
  const conversationsDirectory = getValidatedConversationRootDirectory();
  const conversationFile = getConversationFileName();
  const relativeConversationDirectory = (0, import_node_path3.join)(
    conversationsDirectory,
    (0, import_node_path3.dirname)(conversationFile)
  );
  const entries = await (0, import_promises5.readdir)(relativeConversationDirectory, {
    withFileTypes: true
  });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".copy")) {
      continue;
    }
    const fullPath = (0, import_node_path3.join)(relativeConversationDirectory, entry.name);
    const fileContents = await (0, import_promises5.readFile)(fullPath, "utf-8");
    const snapshot = JSON.parse(fileContents);
    return {
      filePath: fullPath,
      ...snapshot
    };
  }
  return null;
}
async function processCompactionFileDataAndCreateMemorySeeds(parsedCompactionFileData) {
  const filePath = parsedCompactionFileData.filePath;
  const parsedCompactionFileDataParams = parsedCompactionFileData.params;
  const messages = parsedCompactionFileData.messages;
  const fileName = parsedCompactionFileDataParams.conversationName;
  const splitToParts = parsedCompactionFileDataParams.autoCleanupThreshold > 60 ? 3 : 2;
  const totalAssistantResponses = messages.filter(isEligibleAssistantMessage).length + 1;
  const firstResponse = parsedCompactionFileDataParams.keepOldestN + 1;
  const lastResponse = totalAssistantResponses - parsedCompactionFileDataParams.keepNewestN;
  const responsesToCompact = Math.max(
    0,
    lastResponse - firstResponse
  );
  const numberOfParts = Math.min(splitToParts, responsesToCompact);
  const matchingFiles = await scanForAndReturnMatchingFiles(fileName);
  const escapeRegExp2 = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const compactionPattern = new RegExp(
    `^${escapeRegExp2(fileName)}_c(\\d+)_p(\\d+)\\.json$`
  );
  const highestCompactionNumber = matchingFiles.reduce(
    (highest, entry) => {
      const match = entry.name.match(compactionPattern);
      return Math.max(highest, Number(match?.[1] ?? 0));
    },
    0
  );
  const nextCompactionNumber = highestCompactionNumber + 1;
  const isFirstCompaction = matchingFiles.length === 0;
  let handledFirstCompaction = !isFirstCompaction;
  if (numberOfParts === 0) {
    return false;
  }
  const baseSize = Math.floor(responsesToCompact / numberOfParts);
  const remainder = responsesToCompact % numberOfParts;
  let seedsWereSaved = false;
  let matchingFilesAndNewAdditions = matchingFiles.map(
    (entry) => entry.name
  );
  const { stringifiedMessages, extractedMessages } = await prepareHistoryMessagesForModel(messages);
  const topicsForMessages = await modelCallToProvideTopics(stringifiedMessages);
  for (let part = 1; part <= numberOfParts; part++) {
    const startOffset = (part - 1) * baseSize;
    const endOffset = part * baseSize + (part === numberOfParts ? remainder : 0);
    const pendingSaveMemory2 = {
      active: true,
      memoryNumber: handledFirstCompaction ? firstResponse + startOffset : 1,
      category: "compactions",
      fileName: `${fileName.trim()}_c${nextCompactionNumber}_p${part}`,
      memoryNumberEndRange: firstResponse + endOffset - 1
    };
    matchingFilesAndNewAdditions.push(
      `${pendingSaveMemory2.fileName}.json`
    );
    const saveResults = await multiSaveMemoryForCompaction(
      pendingSaveMemory2,
      extractedMessages,
      topicsForMessages,
      matchingFilesAndNewAdditions
    );
    if (seedsWereSaved === false) {
      seedsWereSaved = saveResults;
    }
    if (!handledFirstCompaction) {
      handledFirstCompaction = true;
    }
  }
  if (!seedsWereSaved) {
    return false;
  }
  addConversationOperation(
    "tryAppendTOCTrailFunction",
    {
      matchingFilesAndNewAdditions
    }
  );
  return true;
}
async function tryAppendTOCTrailFunction(latestConversation, matchingFiles, targetAssistantMessageIndex) {
  let lines = [];
  const orderedPartNames = matchingFiles.map((fileName, index) => {
    const isLast = index === matchingFiles.length - 1;
    return isLast ? `**${fileName} \u2192 [Current Session]**` : `*${fileName}*`;
  }).join(" \u2192 ");
  const compactionCount = matchingFiles.length > 0 ? Number(matchingFiles[matchingFiles.length - 1].match(/_c(\d+)_p\d+\.json$/)?.[1] ?? 0) : 0;
  lines.push(
    `\u{1F6A8}${[
      `**This chat session has been compacted:** ***${compactionCount}*** previous times.`,
      `**Lastest Compaction File Name:** ${matchingFiles.length > 0 ? `*${matchingFiles[matchingFiles.length - 1]}*` : ""}`,
      `**[Compaction Trail]:** ${orderedPartNames}`,
      `\u2B07\uFE0F[Assistant Message]\u2B07\uFE0F`
    ].filter(Boolean).join("\n\n")}`
  );
  await editAssistantResponse(
    latestConversation,
    lines.join("\n\n"),
    targetAssistantMessageIndex,
    true
    // Append instead of replacing the original text
  );
}
async function multiSaveMemoryForCompaction(updated, extractedMessages, topicsForMessages, matchingFilesAndNewAdditions) {
  const {
    memoryNumber: startMemoryNumber,
    memoryNumberEndRange: endMemoryNumber,
    category,
    fileName
  } = updated;
  if (startMemoryNumber == null || endMemoryNumber == null || category == null || fileName == null) {
    return false;
  }
  try {
    const seeds = [];
    for (let memoryNumber = startMemoryNumber; memoryNumber <= endMemoryNumber; memoryNumber++) {
      const message = extractedMessages.find(
        (item) => item.memoryNumber === memoryNumber
      );
      if (!message) {
        console.warn(`No extracted message found for memory ${memoryNumber}`);
        continue;
      }
      const output = cleanAssistantResponse(message.output);
      if (isMetadataOnlyOutput(output)) {
        continue;
      }
      const cleanedDirectInput = cleanUserInput(message.direct_input?.trim());
      const cleanedRootInput = cleanUserInput(getTopicForMessage(memoryNumber, topicsForMessages).trim());
      seeds.push({
        date: (/* @__PURE__ */ new Date()).toISOString(),
        root_input: cleanedRootInput,
        direct_input: cleanedDirectInput,
        output
      });
    }
    if (seeds.length === 0) {
      return false;
    }
    return await memoryStore.saveMultipleSeeds(
      category,
      fileName,
      seeds,
      startMemoryNumber,
      true,
      // callerIsCompaction
      matchingFilesAndNewAdditions
    );
  } catch (error) {
    console.error(
      `Error creating Memory Seed: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}
function getTopicForMessage(memoryNumber, topicsForMessages) {
  const topicPattern = /Topic:\s*(.*?)\s*🔹\s*(\d+)\s*-\s*(\d+|end)/gi;
  const topicRanges = [...topicsForMessages.matchAll(topicPattern)].map(
    (match) => ({
      topic: match[1].replace(/[\[\]\/]/g, "").trim(),
      start: Number(match[2]),
      end: match[3].toLowerCase() === "end" ? Infinity : Number(match[3])
    })
  ).sort((a, b) => a.start - b.start);
  const matchingRange = topicRanges.find(
    (range) => memoryNumber >= range.start && memoryNumber <= range.end
  );
  if (matchingRange) {
    return matchingRange.topic;
  }
  const nextRange = topicRanges.find(
    (range) => range.start > memoryNumber
  );
  if (nextRange) {
    return nextRange.topic;
  }
  const previousRanges = topicRanges.filter(
    (range) => range.end < memoryNumber
  );
  return previousRanges.length > 0 ? previousRanges[previousRanges.length - 1].topic : "";
}
async function prepareHistoryMessagesForModel(messages) {
  const LM_STUDIO_THINKING_END = /__LM_STUDIO_INTERNAL_LSEP_SYNTHETIC_REASONING_END_[a-z0-9]+__/i;
  let turn = 0;
  let conversationText = "";
  const extractedMessages = [];
  messages.filter((message) => {
    const role = message.data.role;
    return role === "user" || role === "assistant";
  }).forEach((message) => {
    const role = message.data.role;
    const content = message.data?.content ?? [];
    if (role === "user") {
      turn++;
      const text2 = content.find((item) => item.type === "text")?.text?.trim() ?? "";
      extractedMessages.push({
        memoryNumber: turn,
        direct_input: text2,
        output: ""
      });
      conversationText += `[${turn}]User: "${text2}"
`;
      return;
    }
    const text = content.filter(
      (item) => item.type === "text" && typeof item.text === "string" && item.text.trim() !== "" && !LM_STUDIO_THINKING_END.test(item.text.trim())
    ).at(-1)?.text.trim() ?? "";
    const currentMessage = extractedMessages.find(
      (item) => item.memoryNumber === turn
    );
    if (currentMessage) {
      currentMessage.output = text;
    }
    conversationText += `[${turn}]Assistant response: "${text}"
`;
  });
  return {
    stringifiedMessages: conversationText,
    extractedMessages
  };
}
async function modelCallToProvideTopics(conversationText) {
  const client2 = getController().client;
  const model = await client2.llm.model();
  const prompt = `
        Provided to you is a chat transcript between a user and assistant with a prefix labeling each turn which it belongs too.

        The user needs you the assistant to comb through the chat transcript and assign a topic to a range of similarly related user and assistant messages.

        These messages are ordered chronologically, the initial topic should be established by the earliest messages. Any distinct change and shift in topic should be noted.

        All message turns must belong to a topic group. Do not exclude any range and ensure full coverage. Leave no gaps between the end of one range and the beginning of another.

        Only meaningful topics should be noted. If a topic does not carry much weight to the conversation or is irrelevant, roll that turn into the next topic of significance.

        You are not trying to determine every possible topic present. You are only trying to determine the topics of importance.

        If topics switch back to an earlier topic that was deviated from, then the topic and it's associated ranges should be noted.

        The user expects a string to be returned formatted strictly as [Topic: <Topic> \u{1F539} <beginning_of_number_range> - <ending_of_number_range>] for every topic that you have identify.

        Use the \u{1F539} emoji as the mandatory separator between the topic name and the numeric range.

        Topics are not minor differences in nuances, they must be significant shifts in tone, subject, goal, inquiry, or results.

        [BEGINNING OF CHAT TRANSCRIPT]: 
        ${conversationText}
        [END OF CHAT TRANSCRIPT]
        `.trim();
  const result = await model.respond(
    prompt,
    {
      temperature: 0
    }
  );
  const cleanedText = result.content.replace(
    /^[\s\S]*?__LM_STUDIO_INTERNAL_LSEP_SYNTHETIC_REASONING_END_[A-Za-z0-9]+__/i,
    ""
  ).replace(/^[\s\S]*?```(?:json)?\s*/i, "").replace(/\s*```[\s\S]*$/i, "").trim();
  return cleanedText;
}
async function updateTableOfCompactionsIncrementally(memoriesDirectory, category, name, seeds, matchingFilesAndNewAdditions) {
  const now = new Date(Date.now());
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
  const tableName = `TOC_${today}.json`;
  const tocFilePath = import_node_path4.default.join(
    memoriesDirectory,
    "compactions",
    "TOC_Entity",
    tableName
  );
  const fileName = `${name}.json`;
  const tomContent = await import_promises4.default.readFile(
    tocFilePath,
    "utf-8"
  );
  const tableOfMemories = JSON.parse(tomContent);
  const existingIndex = tableOfMemories.findIndex(
    (entry) => entry.fileName === fileName
  );
  const existingEntry = existingIndex !== -1 ? tableOfMemories[existingIndex] : void 0;
  const newMemoryFragments = seeds.map(
    (seed, index) => `[Turn ${index + 1}] User: ${seed.direct_input}
Assistant: ${seed.output}`
  ).join("\n\n");
  const consolidationInput = [
    "CURRENT SUMMARY:",
    existingEntry?.summary ?? "",
    "",
    "CURRENT KEYWORDS:",
    existingEntry?.keywords ?? "",
    "",
    "NEW MEMORY FRAGMENTS:",
    newMemoryFragments
  ].join("\n");
  const summaryReturnPackage = await modelCallToUpdateMemorySummaryAndKeywords(consolidationInput);
  const { summary, keywords } = extractSummaryAndKeywords(summaryReturnPackage);
  const memoryFilePath = import_node_path4.default.join(
    memoriesDirectory,
    "compactions",
    "TOC_Seeds",
    `${name}.json`
  );
  const memoryStats = await (0, import_promises5.stat)(memoryFilePath);
  if (matchingFilesAndNewAdditions === void 0) return;
  const currentIndex = matchingFilesAndNewAdditions.indexOf(fileName);
  const preceding_compacation_fileName = currentIndex > 0 ? matchingFilesAndNewAdditions[currentIndex - 1] : "";
  const updatedEntry = {
    fileSizeKB: memoryStats.size / 1024,
    fileName,
    keywords,
    summary,
    preceding_compacation_fileName
  };
  if (existingIndex !== -1) {
    tableOfMemories[existingIndex] = updatedEntry;
  } else {
    tableOfMemories.push(updatedEntry);
  }
  await import_promises4.default.writeFile(
    tocFilePath,
    JSON.stringify(tableOfMemories, null, 4),
    "utf-8"
  );
}
async function updateTocCollectionsIncrementally(name) {
  const fileName = name.endsWith(".json") ? name : `${name}.json`;
  const memoriesDirectory = getValidatedMemoriesRootDirectory();
  const compactionsDirectory = import_node_path4.default.join(
    memoriesDirectory,
    "compactions"
  );
  const collectionsFilePath = import_node_path4.default.join(
    compactionsDirectory,
    "TOC_Collections.json"
  );
  const now = /* @__PURE__ */ new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-");
  try {
    await import_promises4.default.mkdir(compactionsDirectory, { recursive: true });
    let collections;
    try {
      const contents = await import_promises4.default.readFile(
        collectionsFilePath,
        "utf-8"
      );
      collections = JSON.parse(contents);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      collections = [];
    }
    let todayEntry = collections.find(
      (entry) => entry.date_created_group === today
    );
    if (!todayEntry) {
      todayEntry = {
        date_created_group: today,
        members_fileName: []
      };
      collections.push(todayEntry);
    }
    if (!todayEntry.members_fileName.includes(fileName)) {
      todayEntry.members_fileName.push(fileName);
    }
    await import_promises4.default.writeFile(
      collectionsFilePath,
      JSON.stringify(collections, null, 2),
      "utf-8"
    );
  } catch (error) {
    console.error(
      `[TOC COLLECTIONS] Failed to update "${collectionsFilePath}":`,
      error
    );
  }
}
async function deleteExpiredCompactionsAndTocCleanup(daysToTriggerExpire) {
  const memoriesDirectory = getValidatedMemoriesRootDirectory();
  const compactionsDirectory = import_node_path4.default.join(
    memoriesDirectory,
    "compactions"
  );
  const collectionsFilePath = import_node_path4.default.join(
    compactionsDirectory,
    "TOC_Collections.json"
  );
  const tocSeedsDirectory = import_node_path4.default.join(
    compactionsDirectory,
    "TOC_Seeds"
  );
  const tocEntityDirectory = import_node_path4.default.join(
    compactionsDirectory,
    "TOC_Entity"
  );
  const tocSummariesDirectory = import_node_path4.default.join(
    compactionsDirectory,
    "TOC_Summaries"
  );
  const now = /* @__PURE__ */ new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  try {
    const contents = await import_promises4.default.readFile(
      collectionsFilePath,
      "utf-8"
    );
    const collections = JSON.parse(contents);
    const remainingCollections = [];
    const expiredCollections = [];
    for (const entry of collections) {
      const [year, month, day] = entry.date_created_group.split("-").map(Number);
      const entryDate = new Date(year, month - 1, day);
      if (Number.isNaN(entryDate.getTime())) {
        remainingCollections.push(entry);
        continue;
      }
      const ageInDays = Math.floor(
        (today.getTime() - entryDate.getTime()) / (24 * 60 * 60 * 1e3)
      );
      if (ageInDays > daysToTriggerExpire) {
        expiredCollections.push(entry);
      } else {
        remainingCollections.push(entry);
      }
    }
    for (const entry of expiredCollections) {
      for (const fileName of entry.members_fileName) {
        try {
          await import_promises4.default.unlink(
            import_node_path4.default.join(tocSeedsDirectory, fileName)
          );
        } catch (error) {
          console.error(
            `[COMPACTION CLEANUP] Failed to delete "${fileName}":`,
            error
          );
        }
        try {
          await import_promises4.default.unlink(
            import_node_path4.default.join(tocSummariesDirectory, fileName)
          );
        } catch (error) {
          if (error.code !== "ENOENT") {
            console.error(
              `[COMPACTION CLEANUP] Failed to delete summary "${fileName}":`,
              error
            );
          }
        }
      }
      try {
        await import_promises4.default.unlink(
          import_node_path4.default.join(
            tocEntityDirectory,
            `TOC_${entry.date_created_group}.json`
          )
        );
      } catch (error) {
        console.error(
          `[COMPACTION CLEANUP] Failed to delete entity TOC for "${entry.date_created_group}":`,
          error
        );
      }
    }
    if (expiredCollections.length > 0) {
      await import_promises4.default.writeFile(
        collectionsFilePath,
        JSON.stringify(remainingCollections, null, 2),
        "utf-8"
      );
    }
  } catch (error) {
    console.error(
      "[COMPACTION CLEANUP] Failed to clean up expired compactions:",
      error
    );
  }
}
async function scanForAndReturnMatchingFiles(fileName) {
  const memoriesDirectory = getValidatedMemoriesRootDirectory();
  const compactionsSeedsDirectory = (0, import_node_path3.join)(
    memoriesDirectory,
    "compactions",
    "TOC_Seeds"
  );
  let entries;
  try {
    entries = await (0, import_promises5.readdir)(compactionsSeedsDirectory, {
      withFileTypes: true
    });
  } catch (error) {
    const fsError = error;
    if (fsError.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  if (fileName === void 0) {
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).sort(
      (a, b) => a.name.localeCompare(b.name, void 0, {
        sensitivity: "base"
      })
    );
  }
  const escapeRegExp2 = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const compactionPattern = new RegExp(
    `^${escapeRegExp2(fileName)}_c(\\d+)_p(\\d+)\\.json$`
  );
  return entries.filter(
    (entry) => entry.isFile() && compactionPattern.test(entry.name)
  ).sort((a, b) => {
    const matchA = a.name.match(compactionPattern);
    const matchB = b.name.match(compactionPattern);
    const compactionA = Number(matchA[1]);
    const compactionB = Number(matchB[1]);
    if (compactionA !== compactionB) {
      return compactionA - compactionB;
    }
    return Number(matchA[2]) - Number(matchB[2]);
  });
}
async function compactionSeedExists(name) {
  const memoriesDirectory = getValidatedMemoriesRootDirectory();
  if (!/^.+_c\d+_p\d+\.json$/i.test(name)) {
    return false;
  }
  const compactionsSeedsDirectory = (0, import_node_path3.join)(
    memoriesDirectory,
    "compactions",
    "TOC_Seeds"
  );
  try {
    const stats = await import_promises4.default.stat(
      (0, import_node_path3.join)(compactionsSeedsDirectory, name)
    );
    return stats.isFile();
  } catch {
    return false;
  }
}
async function enCompactionSeedExists(name) {
  const memoriesDirectory = getValidatedMemoriesRootDirectory();
  if (!/^.+_c\d+_p\d+\.json$/i.test(name)) {
    return false;
  }
  const en_compactionsSeedsDirectory = (0, import_node_path3.join)(
    memoriesDirectory,
    "en_comps"
  );
  try {
    const stats = await import_promises4.default.stat(
      (0, import_node_path3.join)(en_compactionsSeedsDirectory, name)
    );
    return stats.isFile();
  } catch {
    return false;
  }
}
async function compactionToMemorySeedTransfer(fileName) {
  const memoriesDirectory = getValidatedMemoriesRootDirectory();
  const compactionsDirectory = import_node_path4.default.join(
    memoriesDirectory,
    "compactions"
  );
  const collectionsFilePath = import_node_path4.default.join(
    compactionsDirectory,
    "TOC_Collections.json"
  );
  const tocSeedsDirectory = import_node_path4.default.join(
    compactionsDirectory,
    "TOC_Seeds"
  );
  const tocEntityDirectory = import_node_path4.default.join(
    compactionsDirectory,
    "TOC_Entity"
  );
  const enCompactionsDirectory = import_node_path4.default.join(
    memoriesDirectory,
    "en_comps"
  );
  const tomFilePath = import_node_path4.default.join(
    memoriesDirectory,
    `TOM_${TOM_RANGES.first.start}-${TOM_RANGES.first.end}.json`
  );
  try {
    const collections = JSON.parse(
      await import_promises4.default.readFile(collectionsFilePath, "utf-8")
    );
    const collection = collections.find(
      (entry) => entry.members_fileName.includes(fileName)
    );
    if (!collection) {
      console.error(
        `[COMPACTION TRANSFER] "${fileName}" was not found in TOC_Collections.`
      );
      return;
    }
    const tocEntityFilePath = import_node_path4.default.join(
      tocEntityDirectory,
      `TOC_${collection.date_created_group}.json`
    );
    const entities = JSON.parse(
      await import_promises4.default.readFile(tocEntityFilePath, "utf-8")
    );
    const entity = entities.find(
      (entry) => entry.fileName === fileName
    );
    if (!entity) {
      console.error(
        `[COMPACTION TRANSFER] "${fileName}" was not found in "${tocEntityFilePath}".`
      );
      return;
    }
    const {
      preceding_compacation_fileName: _precedingCompaction,
      ...memoryEntity
    } = entity;
    const tomContents = JSON.parse(
      await import_promises4.default.readFile(tomFilePath, "utf-8")
    );
    if (tomContents.some((entry) => entry.fileName === fileName)) {
      console.log(
        `[COMPACTION TRANSFER] "${fileName}" already exists in TOM. Skipping transfer.`
      );
      return;
    }
    tomContents.push(memoryEntity);
    await import_promises4.default.writeFile(
      tomFilePath,
      JSON.stringify(tomContents, null, 2),
      "utf-8"
    );
    await import_promises4.default.mkdir(enCompactionsDirectory, { recursive: true });
    await import_promises4.default.copyFile(
      import_node_path4.default.join(tocSeedsDirectory, fileName),
      import_node_path4.default.join(enCompactionsDirectory, fileName)
    );
  } catch (error) {
    console.error(
      `[COMPACTION TRANSFER] Failed to transfer "${fileName}":`,
      error
    );
  }
}
async function modelCallForOnDemandSummary(conversationText) {
  const client2 = getController().client;
  const model = await client2.llm.model();
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
      temperature: 0
    }
  );
  const cleanedText = result.content.replace(
    /^[\s\S]*?__LM_STUDIO_INTERNAL_LSEP_SYNTHETIC_REASONING_END_[A-Za-z0-9]+__/i,
    ""
  ).replace(/^[\s\S]*?```(?:json)?\s*/i, "").replace(/\s*```[\s\S]*$/i, "").trim();
  return cleanedText;
}
function extractCompactionFileName(userText, availableFiles) {
  const normalizedText = userText.trimEnd().toLowerCase();
  const matchingFile = [...availableFiles].sort((a, b) => b.length - a.length).find((fileName) => normalizedText.endsWith(fileName.toLowerCase()));
  return matchingFile ?? null;
}
async function promptProcessorConstructCompactionToInject(filePath) {
  const contents = await (0, import_promises5.readFile)(filePath, "utf-8");
  const seeds = JSON.parse(contents);
  let context = "";
  for (const seed of seeds) {
    context += `USER: ${seed.direct_input}

`;
    context += `ASSISTANT: ${seed.output}

`;
  }
  return context;
}
function formatCompactionPackage(packageText) {
  const formattedMemories = [];
  formattedMemories.push(
    [
      "\u{1F4E6} **`Compaction Summary Package`**",
      packageText
    ].join("\n")
  );
  return formattedMemories.join("\n\n");
}
async function listCompactionSeeds(tableFormat) {
  const memoriesDirectory = getValidatedMemoriesRootDirectory();
  const tocSeedsDirectory = import_node_path4.default.join(
    memoriesDirectory,
    "compactions",
    "TOC_Seeds"
  );
  const availableFiles = (await import_promises4.default.readdir(tocSeedsDirectory, {
    withFileTypes: true
  })).filter((entry) => entry.isFile()).map((entry) => entry.name).sort((a, b) => a.localeCompare(b, void 0, { sensitivity: "base" }));
  if (availableFiles.length === 0) {
    return "No compaction seeds are available.";
  }
  const groupedFiles = /* @__PURE__ */ new Map();
  for (const fileName of availableFiles) {
    const baseFileName = fileName.replace(
      /_c\d+_p\d+(?: - Copy)?\.json$/i,
      ""
    );
    const existingFiles = groupedFiles.get(baseFileName) ?? [];
    existingFiles.push(fileName);
    groupedFiles.set(baseFileName, existingFiles);
  }
  let index = 1;
  if (!tableFormat) {
    return availableFiles.map((fileName, index2) => `${index2 + 1}. ${fileName}`).join("\n");
  }
  const rows = [...groupedFiles.entries()].map(
    ([baseFileName, fileNames]) => {
      const numberedFiles = fileNames.map((fileName) => `${index++}. ${fileName}`).join("<br>");
      return `| ${baseFileName} | ${numberedFiles} |`;
    }
  );
  return [
    "\u{1F4E6} **`Compaction List Package`**",
    "| Base Name | Compaction Seed Files |",
    "|---|---|",
    ...rows
  ].join("\n");
}
async function createCompactionSummary(requestedFileName) {
  const memoriesDirectory = getValidatedMemoriesRootDirectory();
  const compactionsDirectory = import_node_path4.default.join(
    memoriesDirectory,
    "compactions"
  );
  const tocSeedsDirectory = import_node_path4.default.join(
    compactionsDirectory,
    "TOC_Seeds"
  );
  const tocSummariesDirectory = import_node_path4.default.join(
    compactionsDirectory,
    "TOC_Summaries"
  );
  const availableFiles = (await import_promises4.default.readdir(tocSeedsDirectory, {
    withFileTypes: true
  })).filter((entry) => entry.isFile()).map((entry) => entry.name).filter((name) => /^.+_c\d+_p\d+\.json$/i.test(name));
  const exactMatch = availableFiles.find(
    (name) => name.toLowerCase() === requestedFileName.toLowerCase()
  ) ?? null;
  if (exactMatch === null) return "";
  const compactionSeedFile = import_node_path4.default.join(
    tocSeedsDirectory,
    exactMatch
  );
  const compactionSummaryFile = import_node_path4.default.join(
    tocSummariesDirectory,
    exactMatch
  );
  let modelReturnPackage;
  try {
    const cachedSummary = await import_promises4.default.readFile(
      compactionSummaryFile,
      "utf-8"
    );
    modelReturnPackage = JSON.parse(cachedSummary);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    const stringifiedMessages = await promptProcessorConstructCompactionToInject(
      compactionSeedFile
    );
    modelReturnPackage = await modelCallForOnDemandSummary(stringifiedMessages);
    await import_promises4.default.mkdir(tocSummariesDirectory, { recursive: true });
    await import_promises4.default.writeFile(
      compactionSummaryFile,
      JSON.stringify(modelReturnPackage),
      "utf-8"
    );
  }
  return formatCompactionPackage(modelReturnPackage);
}
var import_node_path3, import_node_path4, import_promises4, import_promises5;
var init_tableOfCompactions = __esm({
  "src/tableOfCompactions.ts"() {
    "use strict";
    init_memoryStore();
    import_node_path3 = require("node:path");
    import_node_path4 = __toESM(require("node:path"));
    import_promises4 = __toESM(require("node:fs/promises"));
    init_config();
    import_promises5 = require("node:fs/promises");
    init_tableOfMemories();
    init_conversationReader();
    init_triggerSaveMemory();
  }
});

// src/memoryStore.ts
function sanitizePathPart(value) {
  return value.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "").replace(/\.+$/g, "").trim();
}
function sanitizeFilename(value) {
  return value.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, "").replace(/\.+$/g, "").trim();
}
var import_promises6, import_node_path5, MemoryStore, memoryStore;
var init_memoryStore = __esm({
  "src/memoryStore.ts"() {
    "use strict";
    init_memorySession();
    init_config();
    init_tableOfMemories();
    import_promises6 = __toESM(require("node:fs/promises"));
    import_node_path5 = __toESM(require("node:path"));
    init_tableOfCompactions();
    MemoryStore = class {
      rootDirectory = null;
      memoriesDirectory = null;
      /**
       * Configure where Memory Seeds are stored.
       * The directory is supplied by LM Studio's plugin working directory.
       */
      async setRootDirectory(rootDirectory) {
        if (!rootDirectory || !rootDirectory.trim()) {
          throw new Error(
            "Memory Store root directory cannot be empty."
          );
        }
        this.rootDirectory = rootDirectory;
        this.memoriesDirectory = import_node_path5.default.join(
          this.rootDirectory,
          "memories"
        );
      }
      /**
       * Return the root directory used by the memory store.
       */
      async getRootDirectory() {
        if (!this.rootDirectory) {
          throw new Error(
            "Memory Store has not been initialized with a root directory."
          );
        }
        return this.rootDirectory;
      }
      /**
       * Make sure the root memories directory exists.
       */
      async initialize() {
        const directory = await this.getMemoriesDirectory();
        await import_promises6.default.mkdir(directory, {
          recursive: true
        });
      }
      /**
       * Return the configured memories directory.
       */
      async getMemoriesDirectory() {
        if (!this.memoriesDirectory) {
          throw new Error(
            "Memory Store has not been initialized with a root directory."
          );
        }
        return this.memoriesDirectory;
      }
      /**
       * Save a Memory Seed.
       *
       * Creates:
       *
       *   memories/
       *     Rust Game/
       *       game-architecture.json
       */
      async saveSeed(category, name, seed, saveMemoryNumber) {
        const directory = await this.initializeAndGetDirectory();
        const safeCategory = sanitizePathPart(category);
        const safeName = sanitizeFilename(name);
        if (saveMemoryNumber === null) {
          return false;
        }
        if (!safeCategory) {
          return false;
        }
        if (!safeName) {
          return false;
        }
        if (!seed.root_input.trim()) {
          return false;
        }
        if (!seed.direct_input.trim()) {
          return false;
        }
        if (!seed.output.trim()) {
          return false;
        }
        try {
          const categoryPath = import_node_path5.default.join(
            directory,
            safeCategory
          );
          await import_promises6.default.mkdir(categoryPath, {
            recursive: true
          });
          const filePath = import_node_path5.default.join(
            categoryPath,
            `${safeName}.json`
          );
          let seeds = [];
          try {
            const existing = await import_promises6.default.readFile(
              filePath,
              "utf-8"
            );
            const parsed = JSON.parse(existing);
            if (Array.isArray(parsed)) {
              seeds = parsed;
            } else if (parsed && typeof parsed === "object") {
              seeds = [parsed];
            } else {
              return false;
            }
          } catch (error) {
            if (error.code !== "ENOENT") {
              return false;
            }
          }
          seeds.push(seed);
          await import_promises6.default.writeFile(
            filePath,
            JSON.stringify(seeds, null, 2),
            "utf-8"
          );
          const memorySeedName = `${safeCategory}/${safeName}.json`;
          await updateTableOfMemoriesIncrementally(
            directory,
            safeCategory,
            safeName,
            [seed]
          );
          const memorySeedsPool2 = getMemorySeedsPool();
          if (!memorySeedsPool2.includes(memorySeedName)) {
            setConfigSchematics({
              memorySeedsPool: [
                ...memorySeedsPool2,
                memorySeedName
              ]
            });
          }
          resetPendingSaveMemory();
          return true;
        } catch {
          return false;
        }
      }
      async saveMultipleSeeds(category, name, seeds, saveMemoryNumber, callerIsCompaction, matchingFilesAndNewAdditions) {
        const directory = await this.initializeAndGetDirectory();
        const safeCategory = sanitizePathPart(category);
        const safeName = sanitizeFilename(name);
        if (saveMemoryNumber === null) {
          return false;
        }
        if (!safeCategory) {
          return false;
        }
        if (!safeName) {
          return false;
        }
        if (!seeds.length) {
          console.warn("[SAVE SKIPPED] No seeds", { name: safeName });
          return false;
        }
        for (const seed of seeds) {
          for (let index = 0; index < seeds.length; index++) {
            const seed2 = seeds[index];
            if (!seed2.root_input.trim()) {
              console.warn("[SAVE SKIPPED] Empty root_input", {
                name: safeName,
                index,
                root_input: seed2.root_input
              });
              return false;
            }
          }
          if (!seed.direct_input.trim()) {
            return false;
          }
          if (!seed.output.trim()) {
            return false;
          }
        }
        try {
          const categoryPath = callerIsCompaction ? import_node_path5.default.join(directory, safeCategory, "TOC_Seeds") : import_node_path5.default.join(directory, safeCategory);
          await import_promises6.default.mkdir(categoryPath, {
            recursive: true
          });
          const filePath = import_node_path5.default.join(
            categoryPath,
            `${safeName}.json`
          );
          let existingSeeds = [];
          try {
            const existing = await import_promises6.default.readFile(
              filePath,
              "utf-8"
            );
            const parsed = JSON.parse(existing);
            if (Array.isArray(parsed)) {
              existingSeeds = parsed;
            } else if (parsed && typeof parsed === "object") {
              existingSeeds = [parsed];
            } else {
              return false;
            }
          } catch (error) {
            if (error.code !== "ENOENT") {
              return false;
            }
          }
          existingSeeds.push(...seeds);
          await import_promises6.default.writeFile(
            filePath,
            JSON.stringify(existingSeeds, null, 2),
            "utf-8"
          );
          if (callerIsCompaction) {
            await updateTableOfCompactionsIncrementally(
              directory,
              safeCategory,
              safeName,
              seeds,
              matchingFilesAndNewAdditions
            );
            await updateTocCollectionsIncrementally(
              safeName
            );
            return true;
          }
          const memorySeedName = `${safeCategory}/${safeName}.json`;
          await updateTableOfMemoriesIncrementally(
            directory,
            safeCategory,
            safeName,
            seeds
          );
          const memorySeedsPool2 = getMemorySeedsPool();
          if (!memorySeedsPool2.includes(memorySeedName)) {
            setConfigSchematics({
              memorySeedsPool: [
                ...memorySeedsPool2,
                memorySeedName
              ]
            });
          }
          return true;
        } catch {
          return false;
        }
      }
      /**
       * Initialize the store and return its directory.
       */
      async initializeAndGetDirectory() {
        await this.initialize();
        return this.getMemoriesDirectory();
      }
    };
    memoryStore = new MemoryStore();
  }
});

// src/removeMemorySeeds.ts
async function removeMemorySeeds(validMemorySeedsSelected, memorySeedsToRemove, cleanupAllSeeds2) {
  addConversationOperation(
    "tryRemoveMemorySeedsTimeoutFunction",
    {
      cleanupAllSeeds: cleanupAllSeeds2,
      memorySeedsToRemove,
      validMemorySeedsSelected
    }
  );
}
async function tryRemoveMemorySeedsTimeoutFunction(cleanupAllSeeds2, latestConversation, memorySeedsToRemove, validMemorySeedsSelected) {
  if (cleanupAllSeeds2 === true) {
    removeAllMemoryWrappers(latestConversation);
    updateMemorySeedsSelected([]);
    setConfigSchematics({
      memorySeedsSelected: []
    });
  } else {
    const memorySeedsRemoved = await memorySeedsCleanup(
      latestConversation,
      memorySeedsToRemove
    );
    const memorySeedsStillValid = validMemorySeedsSelected.filter(
      (memorySeed) => !memorySeedsRemoved.includes(memorySeed)
    );
    updateMemorySeedsSelected(memorySeedsStillValid);
    setConfigSchematics({
      memorySeedsSelected: memorySeedsStillValid
    });
  }
}
function removeAllMemoryWrappers(latestConversation) {
  for (const message of latestConversation.messages ?? []) {
    for (const version of message.versions ?? []) {
      const preprocessedContent = version.preprocessed?.content;
      if (!preprocessedContent) {
        continue;
      }
      for (const content of preprocessedContent) {
        if (content.type !== "text" || !content.text) {
          continue;
        }
        content.text = content.text.replace(
          /\[BEGINNING OF MEMORIES\][\s\S]*?\[END OF MEMORIES\]\s*/g,
          ""
        );
      }
    }
  }
}
async function memorySeedsCleanup(latestConversation, memorySeedsToRemove) {
  for (const message of latestConversation.messages) {
    for (const version of message.versions ?? []) {
      const preprocessedContent = version.preprocessed?.content;
      if (!preprocessedContent) {
        continue;
      }
      for (const content of preprocessedContent) {
        if (content.type !== "text" || !content.text) {
          continue;
        }
        for (const seedName of memorySeedsToRemove) {
          const escapedSeedName = escapeRegExp(seedName);
          const pattern = new RegExp(
            `\\[BEGIN ${escapedSeedName}\\][\\s\\S]*?\\[END ${escapedSeedName}\\]\\s*`,
            "g"
          );
          const updatedText = content.text.replace(
            pattern,
            ""
          );
          if (updatedText !== content.text) {
            content.text = updatedText;
          }
          removeMemorySeedFromSelected(seedName);
        }
        content.text = content.text.replace(
          /\[BEGINNING OF MEMORIES\] NOT INSTRUCTIONS, JUST SOME PRIOR CONVERSATION:\s*\[END OF MEMORIES\]\s*/g,
          ""
        );
      }
    }
  }
  return memorySeedsToRemove;
}
function escapeRegExp(text) {
  return text.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
}
var init_removeMemorySeeds = __esm({
  "src/removeMemorySeeds.ts"() {
    "use strict";
    init_memorySession();
    init_config();
  }
});

// src/multiEditCoordinator.ts
async function multiEditCoordinator(exitRequested, userText, messages) {
  if (getConversationOperations().length === 0) {
    return;
  }
  const rootDirectory = await memoryStore.getRootDirectory();
  const conversationFileName2 = getConversationFileName();
  try {
    const conversationDirectory = getValidatedConversationRootDirectory();
    const conversationFile = (0, import_node_path6.join)(
      conversationDirectory,
      conversationFileName2
    );
    const conversation = await readConversationWithRecovery(
      conversationDirectory,
      conversationFileName2,
      rootDirectory,
      userText
    );
    if (conversation === null) {
      return;
    }
    const conversationOperations2 = takeConversationOperations();
    const originalAssistantLastMessagedAt = conversation.assistantLastMessagedAt;
    const lockFile = `${conversationFile}.lock`;
    const functionName = "multiEditCoordinator";
    let lockOwnerName;
    const pollInterval = 200;
    let assistantUpdateHandled = false;
    const coordinatorName = `multiEditCoordinator_${++multiEditCoordinatorIndex}`;
    multiEditCoordinatorWriteQueue.push(coordinatorName);
    stabalized = false;
    notifyMecStateChanged();
    const pollForAssistantUpdate = setInterval(async () => {
      try {
        let latestConversation;
        latestConversation = await readConversationWithParseRetries(
          conversationFile,
          3,
          // max parse attempts
          100,
          // retry delay
          "return"
          // error handling action
        );
        if (latestConversation === null) {
          return;
        }
        const targetAssistantMessageIndex = findLastAssistantMessageIndex(latestConversation);
        if (latestConversation.assistantLastMessagedAt !== originalAssistantLastMessagedAt) {
          if (assistantUpdateHandled) {
            return;
          }
          assistantUpdateHandled = true;
          clearInterval(pollForAssistantUpdate);
          void (async () => {
            const extendedDelay = [...multiEditCoordinatorWriteQueue].length < 2;
            const requiredStableDuration = extendedDelay ? 2300 : 2600;
            try {
              await waitForStableClientInput(
                conversationFile,
                100,
                // stabilityPollInterval
                requiredStableDuration,
                coordinatorName
              );
              while (multiEditCoordinatorWriteQueue[0] !== coordinatorName) {
                await new Promise((resolve) => setTimeout(resolve, pollInterval));
              }
              const finalCoordinatorName = multiEditCoordinatorWriteQueue[multiEditCoordinatorWriteQueue.length - 1];
              if (inMemoryConversation === null) {
                inMemoryConversation = await readConversationWithParseRetries(
                  conversationFile,
                  2,
                  // max parse attempts
                  100,
                  // retry delay
                  "throw"
                  // error handling action
                );
              }
              let protectSaveMemoryTurn = false;
              let lastMesageAppendOperation;
              for (const operation of conversationOperations2) {
                if (operation.name === "tryAppendSaveMemoryTextAtEndOfConversationJsonFunction") {
                  await tryAppendSaveMemoryTextAtEndOfConversationJsonFunction(
                    operation.params.exitRequested,
                    inMemoryConversation,
                    operation.params.pendingSaveMemory,
                    targetAssistantMessageIndex,
                    operation.params.savedMemoryStatus
                  );
                  protectSaveMemoryTurn = true;
                }
                if (operation.name === "tryAppendTableOfMemoriesContentFunction" && protectSaveMemoryTurn === false) {
                  await tryAppendTableOfMemoriesContentFunction(
                    inMemoryConversation,
                    operation.params.constructedTableString,
                    targetAssistantMessageIndex
                  );
                }
                if (operation.name === "tryAppendCompactionSummaryFunction" && protectSaveMemoryTurn === false) {
                  await tryAppendCompactionSummaryFunction(
                    inMemoryConversation,
                    operation.params.constructedSummaryString,
                    targetAssistantMessageIndex
                  );
                }
                if (operation.name === "promptProcessorAppendMessageNumberToLastAssistantMessage") {
                  promptProcessorConstructMessageNumberTag(
                    inMemoryConversation,
                    operation.params.assistantIndex,
                    targetAssistantMessageIndex
                  );
                  if (coordinatorName === finalCoordinatorName && multiEditCoordinatorWriteQueue[0] === coordinatorName) {
                    lastMesageAppendOperation = operation;
                  }
                }
                if (coordinatorName === finalCoordinatorName && multiEditCoordinatorWriteQueue[0] === coordinatorName) {
                  if (operation.name === "tryRetractOldTomsFunction") {
                    await tryRetractOldTomsFunction(
                      inMemoryConversation,
                      targetAssistantMessageIndex,
                      operation.params.retractOldToms,
                      operation.params.enableToolsMode
                    );
                  }
                  if (operation.name === "tryRemoveMemorySeedsTimeoutFunction") {
                    await tryRemoveMemorySeedsTimeoutFunction(
                      operation.params.cleanupAllSeeds,
                      inMemoryConversation,
                      operation.params.memorySeedsToRemove,
                      operation.params.validMemorySeedsSelected
                    );
                  }
                  if (operation.name === "tryAppendTOCTrailFunction") {
                    await tryAppendTOCTrailFunction(
                      inMemoryConversation,
                      operation.params.matchingFilesAndNewAdditions,
                      targetAssistantMessageIndex
                    );
                  }
                }
              }
              lockOwnerName = await acquireLock(lockFile, functionName);
              if (coordinatorName === finalCoordinatorName && multiEditCoordinatorWriteQueue[0] === coordinatorName) {
                await writeVerifiyWithReassurance(
                  conversationFile,
                  inMemoryConversation,
                  lastMesageAppendOperation,
                  targetAssistantMessageIndex
                );
                const contextCleanupPluginInUse2 = await createACoordinationReadyFile(
                  conversation,
                  conversationFile
                );
                if (contextCleanupPluginInUse2) {
                  setContextCleanupPluginInUse(contextCleanupPluginInUse2);
                  const currentCCName = getContextCleanupConversationName();
                  if (currentCCName === "") {
                    setContextCleanupConversationName(inMemoryConversation.name);
                  }
                }
                inMemoryConversation = null;
              }
            } catch (error) {
              console.error(
                "multiEditCoordinator Error during delayed memory seed cleanup:",
                error
              );
            } finally {
              if (lockOwnerName !== void 0) {
                await releaseLock(lockFile, lockOwnerName);
                lockOwnerName = void 0;
              }
              const queueIndex = multiEditCoordinatorWriteQueue.indexOf(coordinatorName);
              if (queueIndex !== -1) {
                multiEditCoordinatorWriteQueue.splice(queueIndex, 1);
              }
              for (const operation of conversationOperations2) {
                if (operation.name === "tryAppendTableOfMemoriesContentFunction" || operation.name === "tryAppendCompactionSummaryFunction") {
                  setPendingTomCommand("null");
                }
                if (operation.name === "tryAppendSaveMemoryTextAtEndOfConversationJsonFunction") {
                  if (operation.params.exitRequested === true) {
                    resetPendingSaveMemory();
                  }
                }
              }
              notifyMecStateChanged();
            }
          })();
        }
      } catch (error) {
        clearInterval(pollForAssistantUpdate);
        console.error(
          "multiEditCoordinator Error polling for assistant update:",
          error
        );
        try {
          if (lockOwnerName !== void 0) {
            await releaseLock(lockFile, lockOwnerName);
            lockOwnerName = void 0;
          }
        } catch (releaseError) {
          console.error(
            "multiEditCoordinator Error releasing lock after polling failure:",
            releaseError
          );
        }
      }
    }, pollInterval);
  } catch (error) {
    const fsError = error;
    if (fsError.code === "EISDIR") {
      throw new Error(`
                This is a known unresolvable error. Scans pulled in an empty string as the conversation file name. 
            `);
    }
    throw new Error(`multiEditCoordinator Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}
async function createACoordinationReadyFile(conversation, conversationFile) {
  const enabledPluginsArray = conversation.plugins;
  const hasContextCleanup = enabledPluginsArray.some(
    (plugin) => plugin.includes("context-cleanup")
  );
  const readyFile = `${conversationFile}.persisting-memories-final-write.ready`;
  if (hasContextCleanup) {
    try {
      const handle = await (0, import_promises7.open)(readyFile, "wx");
      await handle.close();
    } catch (error) {
      const fsError = error;
      if (fsError.code !== "EEXIST") {
        throw error;
      }
      await (0, import_promises7.unlink)(readyFile);
      const handle = await (0, import_promises7.open)(readyFile, "wx");
      await handle.close();
    }
  }
  return hasContextCleanup;
}
async function readConversationWithRecovery(conversationDirectory, conversationFileName2, rootDirectory, userText) {
  const readConversation = async (fileName) => {
    const filePath = (0, import_node_path6.join)(conversationDirectory, fileName);
    return readConversationWithParseRetries(
      filePath,
      2,
      200,
      "throw"
    );
  };
  try {
    return await readConversation(conversationFileName2);
  } catch (error) {
    const fsError = error;
    if (fsError.code !== "EISDIR" && !(error instanceof SyntaxError)) {
      console.error("Failed to read conversation file:", error);
      return null;
    }
    console.warn(
      "Original conversation read failed; attempting full-directory recovery:",
      error
    );
  }
  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        await scanForConversationFileThruFullConversationDirectoryScan(
          rootDirectory,
          userText
        );
        const recoveredFileName = getConversationFileName();
        if (!recoveredFileName?.trim()) {
          console.error(
            "Unable to recover conversation file: filename is empty."
          );
          resolve(null);
          return;
        }
        resolve(await readConversation(recoveredFileName));
      } catch (error) {
        console.error(
          "Failed to recover or read conversation file:",
          error
        );
        resolve(null);
      }
    }, 200);
  });
}
async function waitForStableClientInput(conversationFile, stabilityPollInterval, requiredStableDuration, coordinatorName) {
  let previousClientInput;
  let stableSince = null;
  while (true) {
    if (stabalized) {
      return true;
    }
    const stateChangePromise = mecStateChanged;
    const finalCoordinatorName = multiEditCoordinatorWriteQueue[multiEditCoordinatorWriteQueue.length - 1];
    if (coordinatorName !== finalCoordinatorName) {
      await stateChangePromise;
      continue;
    }
    let stabilityConversation;
    try {
      const stabilityJson = await (0, import_promises7.readFile)(
        conversationFile,
        "utf-8"
      );
      stabilityConversation = JSON.parse(stabilityJson);
    } catch (error) {
      if (error instanceof SyntaxError) {
        await new Promise(
          (resolve) => setTimeout(resolve, stabilityPollInterval)
        );
        continue;
      }
      return false;
    }
    if (stabalized) {
      return true;
    }
    const currentClientInput = stabilityConversation.clientInput;
    const now = Date.now();
    if (stableSince === null) {
      previousClientInput = currentClientInput;
      stableSince = now;
    } else if (currentClientInput !== previousClientInput) {
      previousClientInput = currentClientInput;
      stableSince = now;
    }
    const inputIsStable = now - stableSince >= requiredStableDuration;
    if (inputIsStable) {
      stabalized = true;
      notifyMecStateChanged();
      return true;
    }
    await new Promise(
      (resolve) => setTimeout(resolve, stabilityPollInterval)
    );
  }
}
async function readFileWithRetries(filePath, maxAttempts, retryDelay) {
  let attempts = 0;
  while (true) {
    try {
      return await (0, import_promises7.readFile)(filePath, "utf-8");
    } catch (error) {
      attempts++;
      if (attempts >= maxAttempts) {
        console.error("readFileWithRetries error during read of:", filePath);
      }
      await new Promise(
        (resolve) => setTimeout(resolve, retryDelay)
      );
    }
  }
}
async function readConversationWithParseRetries(conversationFile, maxParseAttempts, retryDelay, onParseFailure = "throw") {
  let parseAttempts = 0;
  while (true) {
    try {
      const latestJson = await (0, import_promises7.readFile)(
        conversationFile,
        "utf-8"
      );
      return JSON.parse(latestJson);
    } catch (error) {
      if (!(error instanceof SyntaxError)) {
        throw error;
      }
      parseAttempts++;
      if (parseAttempts >= maxParseAttempts) {
        if (onParseFailure === "return") {
          return null;
        }
        throw error;
      }
      await new Promise(
        (resolve) => setTimeout(resolve, retryDelay)
      );
    }
  }
}
function findLastAssistantMessageIndex(conversation) {
  for (let i = conversation.messages.length - 1; i >= 0; i--) {
    const message = conversation.messages[i];
    const selectedVersion = message.versions?.[message.currentlySelected ?? 0];
    if (selectedVersion?.role === "assistant") {
      return i;
    }
  }
  return -1;
}
function notifyMecStateChanged() {
  const resolve = resolveMecStateChange;
  mecStateChanged = new Promise((resolveNext) => {
    resolveMecStateChange = resolveNext;
  });
  resolve?.();
}
async function writeVerifiyWithReassurance(conversationFile, inMemoryConversation2, operation, targetAssistantMessageIndex) {
  const maxAttempts = 3;
  const expectedMessageNumber = operation.params.assistantIndex;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await (0, import_promises7.writeFile)(
      conversationFile,
      JSON.stringify(inMemoryConversation2, null, 2),
      "utf-8"
    );
    const writtenContent = await (0, import_promises7.readFile)(conversationFile, "utf-8");
    const writtenConversation = JSON.parse(writtenContent);
    const targetMessage = writtenConversation.messages?.[targetAssistantMessageIndex];
    const selectedVersion = targetMessage?.versions?.[targetMessage.currentlySelected ?? 0];
    const hasExpectedMessageNumber = selectedVersion?.role === "assistant" && selectedVersion?.steps?.some(
      (step) => step.content?.some(
        (block) => typeof block.text === "string" && block.text.includes(`***message ${expectedMessageNumber}***`)
      )
    );
    if (hasExpectedMessageNumber) {
      return;
    }
    if (attempt === maxAttempts) {
      console.error(
        `Write verification failed after ${maxAttempts} attempts: assistant message at index ${targetAssistantMessageIndex} does not contain the expected message number ${expectedMessageNumber}.`
      );
    }
  }
}
var import_node_path6, import_promises7, multiEditCoordinatorWriteQueue, multiEditCoordinatorIndex, inMemoryConversation, stabalized, resolveMecStateChange, mecStateChanged;
var init_multiEditCoordinator = __esm({
  "src/multiEditCoordinator.ts"() {
    "use strict";
    init_memoryStore();
    init_triggerSaveMemory();
    init_removeMemorySeeds();
    init_acquireLockFile();
    init_promptPreprocessor();
    init_tableOfCompactions();
    init_tableOfMemories();
    import_node_path6 = require("node:path");
    import_promises7 = require("node:fs/promises");
    init_config();
    multiEditCoordinatorWriteQueue = [];
    multiEditCoordinatorIndex = 0;
    inMemoryConversation = null;
    stabalized = false;
    resolveMecStateChange = null;
    mecStateChanged = new Promise((resolve) => {
      resolveMecStateChange = resolve;
    });
  }
});

// src/promptPreprocessor.ts
async function promptPreprocessor(ctl2, userMessage) {
  const lmStudioRootDirectory = getValidatedLMSRootDirectory();
  const workingDirectory = ctl2.getWorkingDirectory();
  const config = ctl2.getPluginConfig(configSchematics);
  const memorySeedsPool2 = getMemorySeedsPool();
  const memorySeedsSelected2 = config.get("memorySeedsSelected");
  const history = await ctl2.pullHistory();
  await setCurrentConversationHistory(history);
  const messages = (await getCurrentConversationHistory()).getMessagesArray();
  const userText = userMessage.getText();
  let createNewInternalChatID = false;
  setController(ctl2);
  const summarizeMemorySeeds = config.get("summarizeMemorySeeds");
  const retractOldToms = config.get("retractOldToms");
  const enableToolsMode = config.get("enableToolsMode");
  const deleteTocCollectionsAfterNthDays = config.get("deleteTocCollectionsAfterNthDays");
  if (getInternalChatID() !== "" && getConversationFileName() !== "") {
    const relationshipReadded = await maybeRepairRelationshipFileWithKnownICIDAndConversationFile(
      lmStudioRootDirectory
    );
    if (relationshipReadded) {
      createNewInternalChatID = true;
    }
  }
  if (getInternalChatID() === "") {
    const historyICID = await promptProcessorScanHistoryForID(messages);
    if (historyICID === "") {
      const icidRecovered = await recoverICIDMultiStepMaybeSetConversationFileName(
        lmStudioRootDirectory,
        workingDirectory,
        userText
      );
      if (icidRecovered) {
        createNewInternalChatID = true;
      }
    }
    if (getInternalChatID() === "") {
      await promptProcessorTryWorkingDirectoryBaseNameLookupInRelationshipFile(
        lmStudioRootDirectory,
        workingDirectory
      );
    }
    if (getInternalChatID() === "") {
      setInternalChatID(Math.floor(Date.now() / 1e3).toString());
      createNewInternalChatID = true;
    }
  }
  if (getConversationFileName() === "") {
    await promptProcessorMatchICIDInRelationshipFile(
      lmStudioRootDirectory
    );
    if (getConversationFileName() === "") {
      await promptProcessorTryWorkingDirectoryConversationFile(
        lmStudioRootDirectory,
        workingDirectory,
        userText
      );
    }
  }
  if (getConversationFileName() === "" || createNewInternalChatID === true) {
    await scanForConversationFileThruFullConversationDirectoryScan(
      lmStudioRootDirectory,
      userText
    );
  }
  await tableOfMemoriesMain();
  await processMessageForTom(userText, retractOldToms, enableToolsMode);
  const pendingSaveMemoryState = getPendingSaveMemory();
  await processMessageForSaveMemory(userText, messages, enableToolsMode);
  await processMessageForCompactionSummary(userText, enableToolsMode);
  const assistantIndex = messages.filter(isEligibleAssistantMessage).length + 1;
  await promptProcessorAppendMessageNumberToLastAssistantMessage(assistantIndex);
  const normalizedMemorySeedsSelected = memorySeedsSelected2.map(
    (memorySeed) => memorySeed.trim().replace(
      /\.json.*$/i,
      ".json"
    )
  );
  const validMemorySeedsSelected = [
    ...new Set(
      normalizedMemorySeedsSelected.flatMap(
        (memorySeed) => {
          const wildcardMatch = memorySeed.match(
            /^([^/]+)\/\*\.json$/i
          );
          if (wildcardMatch) {
            const category = wildcardMatch[1];
            return memorySeedsPool2.filter(
              (availableSeed) => availableSeed.startsWith(
                `${category}/`
              )
            );
          }
          return memorySeedsPool2.includes(
            memorySeed
          ) ? [memorySeed] : [];
        }
      )
    )
  ];
  let injectedContext = "";
  const currentConversationFileName = getConversationFileName();
  if (injectedMemorySeeds === null || !areStringArraysEqualAsSets(injectedMemorySeeds, validMemorySeedsSelected)) {
    injectedMemorySeeds = await promptProcessorConversationFileScanForPreviousSeeds(currentConversationFileName, [...memorySeedsPool2]);
  }
  const newMemorySeeds = validMemorySeedsSelected.filter(
    (memorySeed) => !injectedMemorySeeds.includes(
      memorySeed
    )
  );
  if (newMemorySeeds.length > 0) {
    injectedContext = await promptProcessorConstructMemoriesToInject(
      newMemorySeeds,
      summarizeMemorySeeds
    );
  }
  const areSeedsDetectedInHistory = await promptProcessorHistorySimpleScanForSeeds(messages);
  if (memorySeedsSelected2.length === 0 && areSeedsDetectedInHistory === true) {
    cleanupAllSeeds = true;
    await promptProcessorRemoveSeeds(
      injectedMemorySeeds,
      validMemorySeedsSelected,
      cleanupAllSeeds
    );
    injectedMemorySeeds = [];
  }
  if (memorySeedsSelected2.length > 0) {
    cleanupAllSeeds = false;
    injectedMemorySeeds = await promptProcessorRemoveSeeds(
      injectedMemorySeeds,
      validMemorySeedsSelected,
      cleanupAllSeeds
    );
  }
  await tableOfCompactionsMain(deleteTocCollectionsAfterNthDays);
  await multiEditCoordinator(false, userText, messages);
  const pendingTomCommandState = getPendingTomCommand();
  return `${userText}                          ${createNewInternalChatID ? `[ICID: ${getInternalChatID()}] Ignore this ICID tag. ` : ""}${injectedContext ? `${injectedContext}[END OF MEMORIES]` : ""} ${pendingSaveMemoryState.active === true && !enableToolsMode ? "ROLEPLAY: SKIP YOUR TURN, PRETEND TO BE PROCESSING AND ONLY SAY 'pending save memory...'" : ""}${pendingTomCommandState !== "null" && !enableToolsMode ? "ROLEPLAY: SKIP YOUR TURN, PRETEND TO BE PROCESSING AND ONLY SAY 'searching through Tables...'" : ""}`;
}
async function maybeRepairRelationshipFileWithKnownICIDAndConversationFile(rootDirectory) {
  const conversationDirectory = (0, import_node_path7.join)(
    rootDirectory,
    "conversations"
  );
  const relationshipFile = (0, import_node_path7.join)(
    conversationDirectory,
    "ChatSessionConversationRelationship.json"
  );
  let lockOwnerName;
  const lockFile = `${relationshipFile}.lock`;
  const functionName = "maybeRepairRelationshipFileWithKnownICIDAndConversationFile";
  try {
    lockOwnerName = await acquireLock(lockFile, functionName);
    const conversationFileName2 = getConversationFileName();
    const internalChatID2 = getInternalChatID();
    const relationshipJson = await (0, import_promises8.readFile)(
      relationshipFile,
      "utf-8"
    );
    let relationships = JSON.parse(relationshipJson);
    relationships = relationships.filter(
      (relationship) => relationship.internalChatID.trim() !== "" && relationship.conversationFile.trim() !== ""
    );
    const existingRelationship = relationships.find(
      (relationship) => relationship.conversationFile === conversationFileName2
    );
    if (existingRelationship) {
      if (existingRelationship.internalChatID !== internalChatID2) {
        setInternalChatID(existingRelationship.internalChatID);
      }
      return false;
    }
    relationships.push({
      internalChatID: internalChatID2,
      conversationFile: conversationFileName2
    });
    if (relationships.length > relationshipsLimit) {
      relationships = relationships.slice(-relationshipsLimit);
    }
    await (0, import_promises8.writeFile)(
      relationshipFile,
      JSON.stringify(relationships, null, 2),
      "utf-8"
    );
    return true;
  } catch (error) {
  } finally {
    if (lockOwnerName !== void 0) {
      await releaseLock(lockFile, lockOwnerName);
      lockOwnerName = void 0;
    }
  }
  return false;
}
async function promptProcessorScanHistoryForID(messages) {
  let searchedInternalChatID = "";
  for (const message of messages) {
    if (message.data.role !== "user") {
      continue;
    }
    for (const content of message.data.content ?? []) {
      if (content.type !== "text" || !content.text) {
        continue;
      }
      const match = content.text.match(
        /\[ICID:\s*(\d+)\]/
      );
      if (match) {
        searchedInternalChatID = match[1];
        break;
      }
    }
    if (searchedInternalChatID !== "") {
      break;
    }
  }
  if (searchedInternalChatID !== "") {
    setInternalChatID(searchedInternalChatID);
  }
  return searchedInternalChatID;
}
async function recoverICIDMultiStepMaybeSetConversationFileName(rootDirectory, workingDirectory, userText) {
  const conversationFileName2 = getConversationFileName();
  const conversationDirectory = (0, import_node_path7.join)(
    rootDirectory,
    "conversations"
  );
  const relationshipFile = (0, import_node_path7.join)(
    conversationDirectory,
    "ChatSessionConversationRelationship.json"
  );
  if (conversationFileName2 !== "") {
    try {
      const relationshipJson = await (0, import_promises8.readFile)(
        relationshipFile,
        "utf-8"
      );
      const relationships = JSON.parse(relationshipJson);
      const relationship = relationships.find(
        (relationship2) => relationship2.conversationFile === conversationFileName2
      );
      if (relationship) {
        setInternalChatID(relationship.internalChatID);
        return true;
      }
    } catch {
    }
  }
  const directoryBaseNameFromWD = (0, import_node_path7.basename)(workingDirectory);
  const conversationFileNameWD = `${directoryBaseNameFromWD}.conversation.json`;
  try {
    const relationshipJson = await (0, import_promises8.readFile)(
      relationshipFile,
      "utf-8"
    );
    const relationships = JSON.parse(relationshipJson);
    const relationship = relationships.find(
      (relationship2) => relationship2.conversationFile === conversationFileNameWD
    );
    if (relationship) {
      setInternalChatID(relationship.internalChatID);
      return true;
    }
  } catch {
  }
  const allConversationFiles = await findAllConversationFiles(conversationDirectory);
  for (const conversationFile of allConversationFiles) {
    const conversationJson = await (0, import_promises8.readFile)(
      conversationFile,
      "utf-8"
    );
    try {
      const conversation = JSON.parse(conversationJson);
      const normalize = (s) => (s ?? "").trim().replace(/\s+/g, " ");
      const clientInput = normalize(conversation.clientInput);
      const input = normalize(userText);
      if (clientInput.length > 0 && input.startsWith(clientInput)) {
        setConversationFileName(
          normalizeJsonFileName(
            getConversationRelativePath(
              conversationDirectory,
              conversationFile
            )
          )
        );
        try {
          const relationshipJson = await (0, import_promises8.readFile)(
            relationshipFile,
            "utf-8"
          );
          const relationships = JSON.parse(relationshipJson);
          const relationship = relationships.find(
            (relationship2) => relationship2.conversationFile === getConversationFileName()
          );
          if (relationship) {
            setInternalChatID(relationship.internalChatID);
            return true;
          }
        } catch {
        }
        break;
      }
    } catch {
    }
  }
  return false;
}
async function promptProcessorTryWorkingDirectoryBaseNameLookupInRelationshipFile(rootDirectory, workingDirectory) {
  const conversationDirectory = (0, import_node_path7.join)(
    rootDirectory,
    "conversations"
  );
  const relationshipFile = (0, import_node_path7.join)(
    conversationDirectory,
    "ChatSessionConversationRelationship.json"
  );
  const workingDirectoryBaseName = (0, import_node_path7.basename)(workingDirectory);
  const conversationFileName2 = `${workingDirectoryBaseName}.conversation.json`;
  try {
    const relationshipJson = await (0, import_promises8.readFile)(
      relationshipFile,
      "utf-8"
    );
    const relationships = JSON.parse(relationshipJson);
    for (let i = relationships.length - 1; i >= 0; i--) {
      const relationship = relationships[i];
      if (relationship.conversationFile === conversationFileName2) {
        setConversationFileName(normalizeJsonFileName(conversationFileName2));
        setInternalChatID(relationship.internalChatID);
      }
    }
  } catch (error) {
    console.error("promptProcessorTryWorkingDirectoryBaseNameLookupInRelationshipFile error:", error);
  }
}
async function promptProcessorMatchICIDInRelationshipFile(rootDirectory) {
  const conversationDirectory = (0, import_node_path7.join)(
    rootDirectory,
    "conversations"
  );
  const relationshipFile = (0, import_node_path7.join)(
    conversationDirectory,
    "ChatSessionConversationRelationship.json"
  );
  const currentInternalChatID = getInternalChatID();
  try {
    const relationshipJson = await (0, import_promises8.readFile)(
      relationshipFile,
      "utf-8"
    );
    const relationships = JSON.parse(relationshipJson);
    const relationship = relationships.find(
      (relationship2) => relationship2.internalChatID === currentInternalChatID
    );
    if (relationship) {
      setConversationFileName(normalizeJsonFileName(relationship.conversationFile));
    }
  } catch (error) {
    console.error(`promptProcessorMatchICIDInRelationshipFile error: ${error.message}`);
  }
}
async function promptProcessorTryWorkingDirectoryConversationFile(rootDirectory, workingDirectory, userText) {
  const conversationDirectory = (0, import_node_path7.join)(
    rootDirectory,
    "conversations"
  );
  const workingDirectoryBaseName = (0, import_node_path7.basename)(workingDirectory);
  const conversationFileName2 = `${workingDirectoryBaseName}.conversation.json`;
  const conversationFilePath = (0, import_node_path7.join)(
    conversationDirectory,
    conversationFileName2
  );
  const currentInternalChatID = getInternalChatID();
  try {
    const conversationJson = await (0, import_promises8.readFile)(
      conversationFilePath,
      "utf-8"
    );
    const conversation = JSON.parse(conversationJson);
    const internalChatIDPattern = new RegExp(
      `\\[ICID:\\s*${currentInternalChatID}\\]`
    );
    if (internalChatIDPattern.test(conversationJson)) {
      setConversationFileName(normalizeJsonFileName(conversationFileName2));
      return;
    }
    const normalize = (s) => (s ?? "").trim().replace(/\s+/g, " ");
    const clientInput = normalize(conversation.clientInput);
    const input = normalize(userText);
    if (clientInput.length > 0 && input.startsWith(clientInput)) {
      setConversationFileName(normalizeJsonFileName(conversationFileName2));
      return;
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}
async function scanForConversationFileThruFullConversationDirectoryScan(rootDirectory, userText) {
  const conversationDirectory = (0, import_node_path7.join)(
    rootDirectory,
    "conversations"
  );
  const allConversationFiles = await findAllConversationFiles(conversationDirectory);
  const currentInternalChatID = getInternalChatID();
  const internalChatIDPattern = new RegExp(
    `\\[ICID:\\s*${currentInternalChatID}\\]`
  );
  for (const conversationFile of allConversationFiles) {
    const conversationJson = await (0, import_promises8.readFile)(
      conversationFile,
      "utf-8"
    );
    if (internalChatIDPattern.test(conversationJson)) {
      setConversationFileName(
        normalizeJsonFileName(
          getConversationRelativePath(
            conversationDirectory,
            conversationFile
          )
        )
      );
      break;
    }
    try {
      const conversation = JSON.parse(conversationJson);
      const normalize = (s) => (s ?? "").trim().replace(/\s+/g, " ");
      const clientInput = normalize(conversation.clientInput);
      const input = normalize(userText);
      if (clientInput.length > 0 && input.startsWith(clientInput)) {
        setConversationFileName(
          normalizeJsonFileName(
            getConversationRelativePath(
              conversationDirectory,
              conversationFile
            )
          )
        );
        break;
      }
    } catch {
    }
  }
  const relationshipFile = (0, import_node_path7.join)(
    conversationDirectory,
    "ChatSessionConversationRelationship.json"
  );
  let lockOwnerName;
  const lockFile = `${relationshipFile}.lock`;
  const functionName = "scanForConversationFileThruFullConversationDirectoryScan";
  try {
    lockOwnerName = await acquireLock(lockFile, functionName);
    let resolvedConversationFileName = getConversationFileName();
    let resolvedInternalChatID = getInternalChatID();
    if (resolvedConversationFileName === "" || resolvedInternalChatID === "") {
      return;
    }
    const relationshipJson = await (0, import_promises8.readFile)(
      relationshipFile,
      "utf-8"
    );
    const relationships = JSON.parse(relationshipJson);
    const relationship = relationships.find(
      (relationship2) => relationship2.internalChatID === resolvedInternalChatID && relationship2.conversationFile === resolvedConversationFileName
    );
    if (relationship) {
      setConversationFileName(normalizeJsonFileName(relationship.conversationFile));
      setInternalChatID(relationship.internalChatID);
    } else {
      const existingRelationship = relationships.find(
        (relationship2) => relationship2.conversationFile === resolvedConversationFileName
      );
      if (existingRelationship) {
        if (existingRelationship.internalChatID !== resolvedInternalChatID) {
          setInternalChatID(existingRelationship.internalChatID);
        }
      }
    }
    resolvedConversationFileName = getConversationFileName();
    resolvedInternalChatID = getInternalChatID();
    const matchingIndexes = relationships.map((relationship2, index) => ({
      relationship: relationship2,
      index
    })).filter(
      ({ relationship: relationship2 }) => relationship2.internalChatID === resolvedInternalChatID || relationship2.conversationFile === resolvedConversationFileName
    );
    if (matchingIndexes.length > 0) {
      const filteredRelationships = relationships.filter(
        (_, index) => !matchingIndexes.some(
          (match) => match.index === index
        )
      );
      filteredRelationships.push({
        internalChatID: resolvedInternalChatID,
        conversationFile: resolvedConversationFileName
      });
      const relationshipsToWrite = filteredRelationships.length > relationshipsLimit ? filteredRelationships.slice(-relationshipsLimit) : filteredRelationships;
      await (0, import_promises8.writeFile)(
        relationshipFile,
        JSON.stringify(relationshipsToWrite, null, 4),
        "utf-8"
      );
    } else {
      relationships.push({
        internalChatID: resolvedInternalChatID,
        conversationFile: resolvedConversationFileName
      });
      const relationshipsToWrite = relationships.length > relationshipsLimit ? relationships.slice(-relationshipsLimit) : relationships;
      await (0, import_promises8.writeFile)(
        relationshipFile,
        JSON.stringify(relationshipsToWrite, null, 4),
        "utf-8"
      );
    }
  } catch (error) {
    console.error(`scanForConversationFileThruFullConversationDirectoryScan error: ${error.message}`);
  } finally {
    if (lockOwnerName !== void 0) {
      await releaseLock(lockFile, lockOwnerName);
      lockOwnerName = void 0;
    }
  }
}
async function findAllConversationFiles(conversationsDirectory) {
  const conversationFiles = [];
  async function searchDirectory(directory) {
    const entries = await (0, import_promises8.readdir)(directory, {
      withFileTypes: true
    });
    for (const entry of entries) {
      const fullPath = (0, import_node_path7.join)(
        directory,
        entry.name
      );
      if (entry.isFile()) {
        if (entry.name === "ChatSessionConversationRelationship.json") {
          continue;
        }
        if (entry.name.endsWith(".lock") || entry.name.endsWith(".ready") || entry.name.endsWith(".copy")) {
          continue;
        }
        conversationFiles.push(fullPath);
        continue;
      }
      if (entry.isDirectory()) {
        await searchDirectory(fullPath);
      }
    }
  }
  await searchDirectory(conversationsDirectory);
  const filesWithModifiedTime = await Promise.all(
    conversationFiles.map(async (filePath) => {
      const fileStats = await (0, import_promises8.stat)(filePath);
      return {
        filePath,
        modifiedTime: fileStats.mtimeMs
      };
    })
  );
  filesWithModifiedTime.sort(
    (a, b) => b.modifiedTime - a.modifiedTime
  );
  return filesWithModifiedTime.map(
    (file) => file.filePath
  );
}
async function promptProcessorHistorySimpleScanForSeeds(messages) {
  for (const message of messages) {
    if (/\[BEGIN .*\.json\]/.test(message.getText())) {
      return true;
    }
  }
  return false;
}
async function promptProcessorConversationFileScanForPreviousSeeds(conversationFileName2, memorySeedsPool2) {
  const rootDirectory = await memoryStore.getRootDirectory();
  const conversationDirectory = (0, import_node_path7.join)(
    rootDirectory,
    "conversations"
  );
  const conversationFilePath = (0, import_node_path7.join)(
    conversationDirectory,
    conversationFileName2
  );
  let foundPastInjectedMemorySeed = [];
  try {
    try {
      const info = await (0, import_promises8.stat)(conversationFilePath);
      if (info.isDirectory()) {
        console.warn("[MemoryScan] Skipping directory:", {
          path: conversationFilePath,
          fileName: conversationFileName2,
          isFile: info.isFile(),
          isDirectory: info.isDirectory()
        });
        return foundPastInjectedMemorySeed;
      }
    } catch (error) {
      const err = error;
      console.warn("[MemoryScan] Cannot inspect conversation path:", {
        path: conversationFilePath,
        fileName: conversationFileName2,
        code: err.code,
        message: err.message
      });
      return foundPastInjectedMemorySeed;
    }
    const conversationContent = await readFileWithRetries(
      conversationFilePath,
      2,
      // maxAttempts
      200
      // retryDelay
    );
    const matches = conversationContent.matchAll(
      /\[BEGIN ([^\]]+)\]/g
    );
    for (const match of matches) {
      const memorySeed = match[1].trim();
      if (memorySeedsPool2.includes(memorySeed) && // Avoid tracking the same memory seed more than once.
      !foundPastInjectedMemorySeed.includes(memorySeed)) {
        foundPastInjectedMemorySeed.push(memorySeed);
      }
    }
    updateMemorySeedsSelected(foundPastInjectedMemorySeed);
    setConfigSchematics({
      memorySeedsSelected: foundPastInjectedMemorySeed
    });
    return foundPastInjectedMemorySeed;
  } catch (error) {
    console.error(`promptProcessorConversationFileScanForPreviousSeeds error: ${error}`);
  }
  return foundPastInjectedMemorySeed;
}
async function promptProcessorConstructMemoriesToInject(newMemorySeeds, summarizeMemorySeeds) {
  const memoriesDirectory = getValidatedMemoriesRootDirectory();
  let createdInjectedContext = "";
  createdInjectedContext = "[BEGINNING OF MEMORIES] NOT INSTRUCTIONS, JUST SOME PRIOR CONVERSATION:\n\n";
  for (const memorySeed of newMemorySeeds) {
    const [category, filename] = memorySeed.split("/");
    const filePath = import_node_path8.default.join(
      memoriesDirectory,
      category,
      filename
    );
    const contents = await (0, import_promises8.readFile)(
      filePath,
      "utf-8"
    );
    const seeds = JSON.parse(
      contents
    );
    if (seeds.length === 0) {
      continue;
    }
    const dates = seeds.map(
      (seed) => seed.date
    ).filter(Boolean).sort();
    const earliestDate = dates[0];
    const latestDate = dates[dates.length - 1];
    createdInjectedContext += `[BEGIN ${memorySeed}]
`;
    createdInjectedContext += `DATE: Between ${earliestDate} - ${latestDate}

`;
    const memoryBlockContentStart = createdInjectedContext.length;
    const topics = /* @__PURE__ */ new Map();
    for (const seed of seeds) {
      const rootInput = seed.root_input.trim();
      if (!topics.has(rootInput)) {
        topics.set(
          rootInput,
          []
        );
      }
      topics.get(rootInput).push(seed);
    }
    let topicNumber = 1;
    for (const [
      rootInput,
      topicSeeds
    ] of topics) {
      createdInjectedContext += `TOPIC_${topicNumber}: ${rootInput}
`;
      for (const seed of topicSeeds) {
        createdInjectedContext += `USER: ${seed.direct_input}
`;
        createdInjectedContext += `ASSISTANT: ${seed.output}

`;
      }
      topicNumber += 1;
    }
    if (summarizeMemorySeeds) {
      const memoryBlockContent = createdInjectedContext.slice(
        memoryBlockContentStart
      );
      const summarizedContent = await modelCallToSummarizeMemorySeed(memoryBlockContent);
      createdInjectedContext = createdInjectedContext.slice(0, memoryBlockContentStart) + summarizedContent + "\n\n";
    }
    createdInjectedContext += `[END ${memorySeed}]

`;
    if (injectedMemorySeeds !== null) {
      injectedMemorySeeds.push(
        memorySeed
      );
    }
    addMemorySeedToSelected(memorySeed);
  }
  setConfigSchematics({ memorySeedsSelected: getMemorySeedsSelected() });
  return createdInjectedContext;
}
async function modelCallToSummarizeMemorySeed(memoryBlockContent) {
  const client2 = getController().client;
  const model = await client2.llm.model();
  const prompt = `
        The user needs you the assistant to rigorously condense the following MESSAGE HISTORY exchange between a user and assistant.

        Discard anything that seems repetitive, minor, or of little value. Do not lose any important details of the exchange. Return a string.

        [BEGINNING OF MESSAGE HISTORY]: 
        ${memoryBlockContent}
        [END OF MESSAGE HISTORY]
        `.trim();
  const result = await model.respond(
    prompt,
    {
      temperature: 0
    }
  );
  const cleanedText = result.content.replace(
    /^[\s\S]*?__LM_STUDIO_INTERNAL_LSEP_SYNTHETIC_REASONING_END_[A-Za-z0-9]+__/i,
    ""
  ).replace(/^[\s\S]*?```(?:json)?\s*/i, "").replace(/\s*```[\s\S]*$/i, "").trim();
  return cleanedText;
}
async function promptProcessorRemoveSeeds(injectedMemorySeeds2, validMemorySeedsSelected, cleanupAllSeeds2) {
  const memorySeedsToRemove = injectedMemorySeeds2.filter(
    (memorySeed) => !validMemorySeedsSelected.includes(
      memorySeed
    )
  );
  if (memorySeedsToRemove.length > 0) {
    await removeMemorySeeds(validMemorySeedsSelected, memorySeedsToRemove, cleanupAllSeeds2);
  }
  return validMemorySeedsSelected;
}
function areStringArraysEqualAsSets(a, b) {
  const aSet = new Set(a);
  const bSet = new Set(b);
  if (aSet.size !== bSet.size) {
    return false;
  }
  return [...aSet].every((value) => bSet.has(value));
}
function normalizeJsonFileName(jsonFileName) {
  return jsonFileName.replace(/(\.json).*$/, "$1");
}
async function promptProcessorAppendMessageNumberToLastAssistantMessage(assistantIndex) {
  addConversationOperation(
    "promptProcessorAppendMessageNumberToLastAssistantMessage",
    {
      assistantIndex
    }
  );
}
function promptProcessorConstructMessageNumberTag(conversation, assistantIndex, targetAssistantMessageIndex) {
  const assistantMessage = conversation.messages[targetAssistantMessageIndex];
  if (!assistantMessage) {
    throw new Error("No assistant message found.");
  }
  const assistantVersion = assistantMessage?.versions?.[assistantMessage.currentlySelected ?? 0];
  if (!assistantVersion) {
    throw new Error("Assistant message has no versions.");
  }
  const debugInfoIndex = assistantVersion.steps.findIndex(
    (step) => step.type === "debugInfoBlock"
  );
  const markerBlock = {
    type: "contentBlock",
    stepIdentifier: String(Date.now()),
    content: [
      {
        type: "text",
        text: `

***message ${assistantIndex}***`,
        fromDraftModel: false,
        tokensCount: 1,
        isStructural: false
      }
    ],
    defaultShouldIncludeInContext: false,
    shouldIncludeInContext: false
  };
  const markerExists = assistantVersion.steps.some(
    (step) => step.type === "contentBlock" && step.content?.some(
      (contentBlock) => contentBlock.type === "text" && contentBlock.text === `

***message ${assistantIndex}***`
    )
  );
  const insertIndex = debugInfoIndex !== -1 ? debugInfoIndex : assistantVersion.steps.length;
  if (!markerExists) {
    assistantVersion.steps.splice(
      insertIndex,
      0,
      markerBlock
    );
  }
}
function getConversationRelativePath(conversationsDirectory, conversationFilePath) {
  return (0, import_node_path7.relative)(
    conversationsDirectory,
    conversationFilePath
  ).split(import_node_path8.default.sep).join("/");
}
var import_node_path7, import_node_path8, import_promises8, injectedMemorySeeds, cleanupAllSeeds, relationshipsLimit;
var init_promptPreprocessor = __esm({
  "src/promptPreprocessor.ts"() {
    "use strict";
    init_conversationHistoryCache();
    init_memorySession();
    init_acquireLockFile();
    init_conversationReader();
    init_memoryStore();
    init_removeMemorySeeds();
    import_node_path7 = require("node:path");
    init_triggerSaveMemory();
    init_multiEditCoordinator();
    init_tableOfMemories();
    import_node_path8 = __toESM(require("node:path"));
    init_config();
    import_promises8 = require("node:fs/promises");
    init_tableOfCompactions();
    injectedMemorySeeds = null;
    relationshipsLimit = 15;
  }
});

// src/deleteMemorySeedFiles.ts
async function deleteMemorySeedFile(memorySeed) {
  const normalizedMemorySeed = memorySeed.trim().split(".json")[0] + ".json";
  const [category, filename] = normalizedMemorySeed.split("/");
  try {
    const memoriesDirectory = await memoryStore.getMemoriesDirectory();
    const memoryFile = (0, import_node_path9.join)(
      memoriesDirectory,
      category,
      filename
    );
    try {
      await (0, import_promises9.unlink)(memoryFile);
      let tomFileName = "";
      try {
        tomFileName = await deleteMemoryFromTableOfMemories(
          memoriesDirectory,
          category,
          filename
        );
      } catch (error) {
      }
      removeMemorySeedFromPool(normalizedMemorySeed);
      setConfigSchematics({ memorySeedsPool: [...getMemorySeedsPool()] });
    } catch (error) {
      if (error.code === "ENOENT") {
      }
    }
    const categoryDirectory = (0, import_node_path9.join)(
      memoriesDirectory,
      category
    );
    const remainingFiles = await (0, import_promises9.readdir)(
      categoryDirectory
    );
    if (remainingFiles.length === 0) {
      try {
        await (0, import_promises9.rmdir)(categoryDirectory);
      } catch (error) {
        if (error.code !== "EPERM" && error.code !== "ENOTEMPTY") {
        }
      }
    }
    return `Memory seed "${normalizedMemorySeed}" deleted successfully.`;
  } catch (error) {
    if (error.code === "ENOENT") {
      return `deleteMemorySeedFile Error: Memory seed "${normalizedMemorySeed}" was not found.`;
    }
  }
  return `Memory seed "${normalizedMemorySeed}" deleted successfully.`;
}
var import_node_path9, import_promises9;
var init_deleteMemorySeedFiles = __esm({
  "src/deleteMemorySeedFiles.ts"() {
    "use strict";
    init_memoryStore();
    import_node_path9 = require("node:path");
    import_promises9 = require("node:fs/promises");
    init_memorySession();
    init_config();
    init_tableOfMemories();
  }
});

// src/toolsProvider.ts
async function toolsProvider(ctl2) {
  const tools = [];
  const config = ctl2.getPluginConfig(configSchematics);
  const memoryFileToDelete = config.get("deleteMemorySeedsFile");
  const enableToolsMode = config.get("enableToolsMode");
  const engrainCompaction = config.get("engrainCompaction");
  const isValidCompactionFileName = /^.+_c\d+_p\d+\.json$/i.test(engrainCompaction);
  if (isValidCompactionFileName) {
    if (alreadyTriggered === false) {
      alreadyTriggered = true;
      const isValidCompactionSeed = await compactionSeedExists(engrainCompaction);
      if (isValidCompactionSeed) {
        const doesEnCompactionAlreadyExist = await enCompactionSeedExists(engrainCompaction);
        if (!doesEnCompactionAlreadyExist) {
          await compactionToMemorySeedTransfer(engrainCompaction);
          addMemorySeedToPool(`en_comps/${engrainCompaction}`);
        }
      }
      alreadyTriggered = false;
    }
    ;
  }
  const normalizedMemoryFileToDelete = memoryFileToDelete.trim();
  const wildcardMatch = normalizedMemoryFileToDelete.match(
    /^([^/]+)\/\*\.json$/i
  );
  if (wildcardMatch && normalizedMemoryFileToDelete !== "") {
    const category = wildcardMatch[1];
    const memorySeedsToDelete = getMemorySeedsPool().filter(
      (memorySeed) => memorySeed.startsWith(
        `${category}/`
      )
    );
    if (memorySeedsToDelete.length !== 0) {
      for (const memorySeed of memorySeedsToDelete) {
        await deleteMemorySeedFile(memorySeed);
        console.log("deleted ", memorySeed);
      }
    }
  } else if (
    // Normal file deletion
    normalizedMemoryFileToDelete !== "" && getMemorySeedsPool().includes(normalizedMemoryFileToDelete)
  ) {
    await deleteMemorySeedFile(normalizedMemoryFileToDelete);
    console.log("deleted ", normalizedMemoryFileToDelete);
  }
  const memorySeedRecall = (0, import_sdk2.tool)({
    name: "memory_seed_recall",
    description: `This tool is used for when the user wants the assistant to search through their memories directory to recollect which memory file best matches the memory they are trying to locate.This tool should not be used to directly retrieve a memory file's full content.This tool only returns up to three results containing a memory filename along with it's summary.Present the results to the user before calling this tool again.Include this following tag "\u{1F4E6} **Memory Package**" at the beginning of your response, including the \u{1F4E6} emoji, as the title.The results will be returned as a string prepared to be displayed as a markdown table.`,
    parameters: {
      userQuery: import_zod.z.string().trim().min(1).describe(
        "The user's provided query of the memory they are trying to have the assistant recollect for them."
      )
    },
    implementation: async (params) => {
      const { userQuery } = params;
      const returnPackage = await tableOfMemoriesSummariesLookup(userQuery);
      if (returnPackage === "") return "no match found";
      const tablefiedReturnPackage = constructTOMSummariesLookupTable(returnPackage);
      return [
        tablefiedReturnPackage
      ].join("\n");
    }
  });
  const tableOfMemoriesRecall = (0, import_sdk2.tool)({
    name: "table_of_memories_lookup",
    description: `This tool is used for when the user wants the assistant to display to them the table of memories.The table of memories only contains metadata and summaries of memory files.Always first ask for the user to clarify which specific Memories Table they would like to look up; their options are TOM_A-J, TOM_K-Q, TOM_R-Z. The shorthand versions of these are tomaj, tomkq, and tomrz.Present the results to the user before calling this tool again.Include this following tag "\u{1F4E6} **Memory Package**" at the beginning of your response, including the \u{1F4E6} emoji, as the title.The results will be returned as a string prepared to be displayed as a markdown table.`,
    parameters: {
      tableToLookUp: import_zod.z.string().trim().min(1).describe("Available Memories Tables: 'TOM_A-J', 'TOM_K-Q', 'TOM_R-Z'")
    },
    implementation: async (params) => {
      const { tableToLookUp } = params;
      const returnPackage = await tableOfMemoriesDirectLookup(tableToLookUp);
      if (returnPackage === "") return "no match found";
      const tablefiedReturnPackage = formatAsTableString(returnPackage);
      return [
        tablefiedReturnPackage
      ].join("\n");
    }
  });
  const directMemoryLookup = (0, import_sdk2.tool)({
    name: "direct_memory_lookup",
    description: `This tool is used for when the user wants the assistant to fetch them a specific memory.This request must include a required .json suffix for the memory name. Any request lacking a .json suffix means this is not the right tool to use.Present the results to the user before calling this tool again.Include this following tag "\u{1F4E6} **Memory Package**" at the beginning of your response, including the \u{1F4E6} emoji, as the title.The results will be returned as a string prepared to be displayed as a markdown table.`,
    parameters: {
      memoryJsonToLookUp: import_zod.z.string().trim().min(1).describe("The full name of the memory matching the structure <category_name>/<file_name>.json")
    },
    implementation: async (params) => {
      const { memoryJsonToLookUp } = params;
      const memorySeedsPool2 = getMemorySeedsPool();
      const requestedSeeds = /* @__PURE__ */ new Set();
      for (const seed of memorySeedsPool2) {
        if (memoryJsonToLookUp.includes(seed)) {
          requestedSeeds.add(seed);
        }
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
        return `Invalid memory name. The correct structure is <category_name>/<file_name>.json. 

 These are currently the only available memories: ${memorySeedsPool2.join(", ")}`;
      }
      const returnPackage = await promptProcessorConstructMemoriesToInject(
        validatedSeedsToFetch,
        false
        // Do not summarize seeds
      );
      const tablefiedReturnPackage = formatMemoryPackage(returnPackage);
      return [
        tablefiedReturnPackage
      ].join("\n");
    }
  });
  const compactionSummaryFetch = (0, import_sdk2.tool)({
    name: "compaction_file_fetch",
    description: `This tool is used for when the user wants the assistant to fetch a compaction file.This request must include two elements 1) c#_p# within the request meaning compaction # and part # and 2) a required .json suffix at the end of the compaction name. Any request lacking these two elements is not a call to use this tool.Present the results to the user before calling this tool again.Include this following tag "\u{1F4E6} **Compaction Summary Package**" at the beginning of your response, including the \u{1F4E6} emoji, as the title.The results will be returned as a string to be displayed however you want, BUT you must adhere to the requirements of using the "\u{1F4E6} **Compaction Summary Package**" tag as the title.This tool will only provide a summary, there is no tool to provide the a compaction's raw data, to do this the user must be reminded to manually convert the compaction file into a memory seed.`,
    parameters: {
      compactionFileToFetch: import_zod.z.string().trim().min(1).describe("The full name of the compaction file matching the structure <file_name>_c#_p#.json")
    },
    implementation: async (params) => {
      const { compactionFileToFetch } = params;
      let constructedSummaryString = "";
      constructedSummaryString = await createCompactionSummary(compactionFileToFetch);
      if (constructedSummaryString === "") {
        const allCompactionSeedsAvailable = await listCompactionSeeds(false);
        return `Invalid compaction file name. The correct structure is <file_name>_c#_p#.json. 

 These are currently the only available compaction files: ${allCompactionSeedsAvailable}.`;
      }
      const returnPackage = await createCompactionSummary(compactionFileToFetch);
      return returnPackage;
    }
  });
  const persistingMemoriesTool = (0, import_sdk2.tool)({
    name: "create_new_memories",
    description: `This tool is only for creating a new memory seed at the user's explicit request.For saving a single message, the user is expected to have said, 'save memory <messageNumber>; category <category>; name <name>;'For saving a batch of messages, the user is expected to have said, 'save memory <messageNumber> to <messageEndNumber>; category <category>; name <name>;'Present the results to the user before calling this tool again.It is your job to assign the given <parameters> to their matching parameter field.It is not your job to fabricate parameters that were not explicitly given by the user. Any missing parameters must be asked for the user to supply first.Include this following tag "\u23F3 **\`SAVE MEMORY MODE\`**" at the beginning of your response, including the \u23F3 emoji, as the title.`,
    parameters: {
      messageNumber: import_zod.z.number().int().min(1).describe(
        "Exact <messageNumber> provided by the user during a save memory command."
      ),
      category: import_zod.z.string().trim().min(1).describe(
        "Exact <category> provided by the user during a save memory command."
      ),
      name: import_zod.z.string().trim().min(1).describe(
        "Exact <name> provided by the user during a save memory command."
      ),
      messageEndNumber: import_zod.z.number().int().min(1).optional().describe(
        "Exact <messageEndNumber> IF provided by the user during a save memory command. User may provide this to save a range of messages."
      )
    },
    implementation: async (params, { signal }) => {
      const { messageNumber, category, name, messageEndNumber } = params;
      const pendingSaveMemory2 = {
        active: true,
        memoryNumber: messageNumber,
        category,
        fileName: name,
        memoryNumberEndRange: messageEndNumber ?? null
      };
      setPendingSaveMemory(pendingSaveMemory2);
      const currentPendingSaveMemory = getPendingSaveMemory();
      try {
        if (signal.aborted) {
          return "Memory Seed operation was aborted.";
        }
        let memorySavedStatus = false;
        if (messageEndNumber === null || messageEndNumber === void 0) {
          memorySavedStatus = await saveMemory(currentPendingSaveMemory);
        } else {
          memorySavedStatus = await multiSaveMemory(currentPendingSaveMemory);
        }
        if (signal.aborted) {
          return "Memory Seed operation was aborted.";
        }
        if (memorySavedStatus) {
          return [
            `Your response is expected to contain the word 'save memory mode' to communicate to the user this tool has been used.`,
            `\u2705 Memory Seed ${currentPendingSaveMemory.category}/${currentPendingSaveMemory.fileName} of msg ${currentPendingSaveMemory.memoryNumber}${currentPendingSaveMemory.memoryNumberEndRange !== null ? ` through ${currentPendingSaveMemory.memoryNumberEndRange}` : ""} has been saved.`
          ].join("\n\n");
        } else {
          return [
            `Your response is expected to contain the word 'save memory mode' to communicate to the user this tool has been used.`,
            `\u274C Memory Seed ${currentPendingSaveMemory.category}/${currentPendingSaveMemory.fileName} of msg ${currentPendingSaveMemory.memoryNumber}${currentPendingSaveMemory.memoryNumberEndRange !== null ? ` through ${currentPendingSaveMemory.memoryNumberEndRange}` : ""} is ineligible to be saved. This means that it's content was considered purely metadata.`
          ].join("\n\n");
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return "Memory Seed operation was aborted.";
        }
        return `Error creating Memory Seed: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  });
  if (enableToolsMode) {
    tools.push(memorySeedRecall, tableOfMemoriesRecall, directMemoryLookup, persistingMemoriesTool, compactionSummaryFetch);
  }
  ;
  return tools;
}
var import_sdk2, import_zod, alreadyTriggered;
var init_toolsProvider = __esm({
  "src/toolsProvider.ts"() {
    "use strict";
    import_sdk2 = require("@lmstudio/sdk");
    init_memorySession();
    init_deleteMemorySeedFiles();
    init_config();
    init_promptPreprocessor();
    init_triggerSaveMemory();
    import_zod = require("zod");
    init_tableOfMemories();
    init_tableOfCompactions();
    alreadyTriggered = false;
  }
});

// src/index.ts
var src_exports = {};
__export(src_exports, {
  main: () => main,
  resolveLMStudioRoot: () => resolveLMStudioRoot
});
async function main(context) {
  const lmStudioRoot = await resolveLMStudioRoot();
  await memoryStore.setRootDirectory(lmStudioRoot);
  await memoryStore.initialize();
  const memoriesDirectory = await memoryStore.getMemoriesDirectory();
  const categories = await (0, import_promises10.readdir)(
    memoriesDirectory,
    {
      withFileTypes: true
    }
  );
  const memorySeedsPool2 = [];
  for (const category of categories) {
    if (!category.isDirectory()) {
      continue;
    }
    if (category.name === "compactions") {
      continue;
    }
    const categoryPath = import_path.default.join(
      memoriesDirectory,
      category.name
    );
    const files = await (0, import_promises10.readdir)(
      categoryPath,
      {
        withFileTypes: true
      }
    );
    for (const file of files) {
      if (file.isFile() && file.name.toLowerCase().endsWith(".json")) {
        memorySeedsPool2.push(
          `${category.name}/${file.name}`
        );
      }
    }
  }
  memorySeedsPool2.sort();
  initializeMemorySeedsPool(memorySeedsPool2);
  setConfigSchematics({ memorySeedsPool: memorySeedsPool2 });
  context.withConfigSchematics(configSchematics);
  context.withPromptPreprocessor(promptPreprocessor);
  context.withToolsProvider(toolsProvider);
  console.log("Persisting Memories(explicit) Plugin initialized");
}
async function resolveLMStudioRoot() {
  const defaultRoot = import_path.default.join(
    import_os.default.homedir(),
    ".lmstudio"
  );
  const memoriesRoot = import_path.default.join(
    defaultRoot,
    "memories"
  );
  try {
    const conversationsPath = import_path.default.join(
      defaultRoot,
      "conversations"
    );
    if ((await import_promises11.default.stat(conversationsPath)).isDirectory()) {
      setValidatedLMSRootDirectory(defaultRoot);
      setValidatedConversationRootDirectory(conversationsPath);
      setValidatedMemoriesRootDirectory(memoriesRoot);
      return defaultRoot;
    }
  } catch {
  }
  const cwdRoot = import_path.default.resolve(process.cwd(), "..", "..", "..", "..");
  const cwdConversationsRoot = import_path.default.join(
    cwdRoot,
    "conversations"
  );
  const cwdMemoriesRoot = import_path.default.join(
    cwdRoot,
    "memories"
  );
  try {
    if ((await import_promises11.default.stat(cwdConversationsRoot)).isDirectory()) {
      setValidatedLMSRootDirectory(cwdRoot);
      setValidatedConversationRootDirectory(cwdConversationsRoot);
      setValidatedMemoriesRootDirectory(cwdMemoriesRoot);
      return cwdRoot;
    }
  } catch {
  }
  throw new Error(
    "Could not find a valid LM Studio root: neither the default location nor the cwd-derived location contains a conversations directory."
  );
}
var import_promises10, import_promises11, import_path, import_os;
var init_src = __esm({
  "src/index.ts"() {
    "use strict";
    init_promptPreprocessor();
    init_toolsProvider();
    init_memoryStore();
    import_promises10 = require("fs/promises");
    init_memorySession();
    import_promises11 = __toESM(require("node:fs/promises"));
    import_path = __toESM(require("path"));
    import_os = __toESM(require("os"));
    init_config();
  }
});

// .lmstudio/entry.ts
var import_sdk3 = require("@lmstudio/sdk");
var clientIdentifier = process.env.LMS_PLUGIN_CLIENT_IDENTIFIER;
var clientPasskey = process.env.LMS_PLUGIN_CLIENT_PASSKEY;
var baseUrl = process.env.LMS_PLUGIN_BASE_URL;
var client = new import_sdk3.LMStudioClient({
  clientIdentifier,
  clientPasskey,
  baseUrl
});
globalThis.__LMS_PLUGIN_CONTEXT = true;
var predictionLoopHandlerSet = false;
var promptPreprocessorSet = false;
var configSchematicsSet = false;
var globalConfigSchematicsSet = false;
var toolsProviderSet = false;
var generatorSet = false;
var selfRegistrationHost = client.plugins.getSelfRegistrationHost();
var pluginContext = {
  withPredictionLoopHandler: (generate) => {
    if (predictionLoopHandlerSet) {
      throw new Error("PredictionLoopHandler already registered");
    }
    if (toolsProviderSet) {
      throw new Error("PredictionLoopHandler cannot be used with a tools provider");
    }
    predictionLoopHandlerSet = true;
    selfRegistrationHost.setPredictionLoopHandler(generate);
    return pluginContext;
  },
  withPromptPreprocessor: (preprocess) => {
    if (promptPreprocessorSet) {
      throw new Error("PromptPreprocessor already registered");
    }
    promptPreprocessorSet = true;
    selfRegistrationHost.setPromptPreprocessor(preprocess);
    return pluginContext;
  },
  withConfigSchematics: (configSchematics2) => {
    if (configSchematicsSet) {
      throw new Error("Config schematics already registered");
    }
    configSchematicsSet = true;
    selfRegistrationHost.setConfigSchematics(configSchematics2);
    return pluginContext;
  },
  withGlobalConfigSchematics: (globalConfigSchematics) => {
    if (globalConfigSchematicsSet) {
      throw new Error("Global config schematics already registered");
    }
    globalConfigSchematicsSet = true;
    selfRegistrationHost.setGlobalConfigSchematics(globalConfigSchematics);
    return pluginContext;
  },
  withToolsProvider: (toolsProvider2) => {
    if (toolsProviderSet) {
      throw new Error("Tools provider already registered");
    }
    if (predictionLoopHandlerSet) {
      throw new Error("Tools provider cannot be used with a predictionLoopHandler");
    }
    toolsProviderSet = true;
    selfRegistrationHost.setToolsProvider(toolsProvider2);
    return pluginContext;
  },
  withGenerator: (generator) => {
    if (generatorSet) {
      throw new Error("Generator already registered");
    }
    generatorSet = true;
    selfRegistrationHost.setGenerator(generator);
    return pluginContext;
  }
};
Promise.resolve().then(() => (init_src(), src_exports)).then(async (module2) => {
  return await module2.main(pluginContext);
}).then(() => {
  selfRegistrationHost.initCompleted();
}).catch((error) => {
  console.error("Failed to execute the main function of the plugin.");
  console.error(error);
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiLi4vc3JjL2NvbnZlcnNhdGlvbkhpc3RvcnlDYWNoZS50cyIsICIuLi9zcmMvbWVtb3J5U2Vzc2lvbi50cyIsICIuLi9zcmMvYWNxdWlyZUxvY2tGaWxlLnRzIiwgIi4uL3NyYy9jb25maWcudHMiLCAiLi4vc3JjL2NvbnZlcnNhdGlvblJlYWRlci50cyIsICIuLi9zcmMvbWVtb3J5QXNzb2NpYXRpb24udHMiLCAiLi4vc3JjL3RyaWdnZXJTYXZlTWVtb3J5LnRzIiwgIi4uL3NyYy90YWJsZU9mTWVtb3JpZXMudHMiLCAiLi4vc3JjL3RhYmxlT2ZDb21wYWN0aW9ucy50cyIsICIuLi9zcmMvbWVtb3J5U3RvcmUudHMiLCAiLi4vc3JjL3JlbW92ZU1lbW9yeVNlZWRzLnRzIiwgIi4uL3NyYy9tdWx0aUVkaXRDb29yZGluYXRvci50cyIsICIuLi9zcmMvcHJvbXB0UHJlcHJvY2Vzc29yLnRzIiwgIi4uL3NyYy9kZWxldGVNZW1vcnlTZWVkRmlsZXMudHMiLCAiLi4vc3JjL3Rvb2xzUHJvdmlkZXIudHMiLCAiLi4vc3JjL2luZGV4LnRzIiwgImVudHJ5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyJpbXBvcnQgdHlwZSB7IENoYXQgfSBmcm9tIFwiQGxtc3R1ZGlvL3Nka1wiO1xyXG5cclxuLyoqXHJcbiAqIFRoZSBjdXJyZW50bHkgYWN0aXZlIExNIFN0dWRpbyBjb252ZXJzYXRpb24gaGlzdG9yeS5cclxuICogV2UgZGVsaWJlcmF0ZWx5IGtlZXAgdGhpcyBpbiBtZW1vcnkgb25seS4gVGhlIExNIFN0dWRpbyBjb252ZXJzYXRpb25cclxuICogaXRzZWxmIHJlbWFpbnMgdGhlIHNvdXJjZSBvZiB0cnV0aC5cclxuICovXHJcbmxldCBjdXJyZW50SGlzdG9yeTogQ2hhdCB8IG51bGwgPSBudWxsO1xyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNldEN1cnJlbnRDb252ZXJzYXRpb25IaXN0b3J5KGhpc3Rvcnk6IENoYXQpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGN1cnJlbnRIaXN0b3J5ID0gaGlzdG9yeTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEN1cnJlbnRDb252ZXJzYXRpb25IaXN0b3J5KCk6IFByb21pc2U8Q2hhdD4ge1xyXG4gICAgXHJcbiAgICBpZiAoIWN1cnJlbnRIaXN0b3J5KSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICAgICAgICBcIk5vIGFjdGl2ZSBjb252ZXJzYXRpb24gaGlzdG9yeSBpcyBhdmFpbGFibGUuIFwiICtcclxuICAgICAgICAgICAgXCJUaGUgTWVtb3J5IFNlZWQgcGx1Z2luIG11c3QgcmVjZWl2ZSBjb252ZXJzYXRpb24gaGlzdG9yeSBcIiArXHJcbiAgICAgICAgICAgIFwiZnJvbSBMTSBTdHVkaW8gYmVmb3JlIGEgbWVtb3J5IG9wZXJhdGlvbiBjYW4gYmUgcGVyZm9ybWVkLlwiLFxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbiAgICByZXR1cm4gY3VycmVudEhpc3Rvcnk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjbGVhckN1cnJlbnRDb252ZXJzYXRpb25IaXN0b3J5KCk6IHZvaWQge1xyXG4gICAgY3VycmVudEhpc3RvcnkgPSBudWxsO1xyXG59IiwgImxldCBtZW1vcnlTZWVkc1Bvb2w6IHJlYWRvbmx5IHN0cmluZ1tdID0gT2JqZWN0LmZyZWV6ZShbXSk7XHJcbmxldCBtZW1vcnlTZWVkc1NlbGVjdGVkOiByZWFkb25seSBzdHJpbmdbXSA9IE9iamVjdC5mcmVlemUoW10pO1xyXG5cclxuLypcclxuKiBNZW1vcnlTZWVkc1Bvb2wgR2V0dGVycyBhbmQgU2V0dGVyc1xyXG4qL1xyXG5leHBvcnQgZnVuY3Rpb24gaW5pdGlhbGl6ZU1lbW9yeVNlZWRzUG9vbChcclxuICAgIHBvb2w6IHJlYWRvbmx5IHN0cmluZ1tdLFxyXG4pOiB2b2lkIHtcclxuICAgIG1lbW9yeVNlZWRzUG9vbCA9IE9iamVjdC5mcmVlemUoWy4uLnBvb2xdKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldE1lbW9yeVNlZWRzUG9vbCgpOiByZWFkb25seSBzdHJpbmdbXSB7XHJcbiAgICByZXR1cm4gbWVtb3J5U2VlZHNQb29sO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVtb3ZlTWVtb3J5U2VlZEZyb21Qb29sKFxyXG4gICAgbWVtb3J5U2VlZDogc3RyaW5nLFxyXG4pOiB2b2lkIHtcclxuICAgIG1lbW9yeVNlZWRzUG9vbCA9IE9iamVjdC5mcmVlemUoXHJcbiAgICAgICAgbWVtb3J5U2VlZHNQb29sLmZpbHRlcihcclxuICAgICAgICAgICAgKHNlZWQpID0+IHNlZWQgIT09IG1lbW9yeVNlZWQsXHJcbiAgICAgICAgKSxcclxuICAgICk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVNZW1vcnlTZWVkc1Bvb2woXHJcbiAgICBwb29sOiByZWFkb25seSBzdHJpbmdbXSxcclxuKTogdm9pZCB7XHJcbiAgICBtZW1vcnlTZWVkc1Bvb2wgPSBPYmplY3QuZnJlZXplKFsuLi5wb29sXSk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBhZGRNZW1vcnlTZWVkVG9Qb29sKFxyXG4gICAgbWVtb3J5U2VlZDogc3RyaW5nLFxyXG4pOiB2b2lkIHtcclxuICAgIG1lbW9yeVNlZWRzUG9vbCA9IE9iamVjdC5mcmVlemUoW1xyXG4gICAgICAgIC4uLm1lbW9yeVNlZWRzUG9vbCxcclxuICAgICAgICBtZW1vcnlTZWVkLFxyXG4gICAgXSk7XHJcbn1cclxuXHJcbi8qXHJcbiogU2VsZWN0ZWRNZW1vcnlTZWVkcyBHZXR0ZXJzIGFuZCBTZXR0ZXJzXHJcbiovXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRNZW1vcnlTZWVkc1NlbGVjdGVkKCk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcclxuICAgIHJldHVybiBtZW1vcnlTZWVkc1NlbGVjdGVkO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlTWVtb3J5U2VlZHNTZWxlY3RlZChcclxuICAgIHNlbGVjdGVkOiByZWFkb25seSBzdHJpbmdbXSxcclxuKTogdm9pZCB7XHJcbiAgICBtZW1vcnlTZWVkc1NlbGVjdGVkID0gT2JqZWN0LmZyZWV6ZShbLi4uc2VsZWN0ZWRdKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGFkZE1lbW9yeVNlZWRUb1NlbGVjdGVkKFxyXG4gICAgbWVtb3J5U2VlZDogc3RyaW5nLFxyXG4pOiB2b2lkIHtcclxuICAgIG1lbW9yeVNlZWRzU2VsZWN0ZWQgPSBPYmplY3QuZnJlZXplKFtcclxuICAgICAgICAuLi5tZW1vcnlTZWVkc1NlbGVjdGVkLFxyXG4gICAgICAgIG1lbW9yeVNlZWQsXHJcbiAgICBdKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZU1lbW9yeVNlZWRGcm9tU2VsZWN0ZWQoXHJcbiAgICBtZW1vcnlTZWVkOiBzdHJpbmcsXHJcbik6IHZvaWQge1xyXG4gICAgbWVtb3J5U2VlZHNTZWxlY3RlZCA9IE9iamVjdC5mcmVlemUoXHJcbiAgICAgICAgbWVtb3J5U2VlZHNTZWxlY3RlZC5maWx0ZXIoXHJcbiAgICAgICAgICAgIChzZWVkKSA9PiBzZWVkICE9PSBtZW1vcnlTZWVkLFxyXG4gICAgICAgICksXHJcbiAgICApO1xyXG59IiwgImltcG9ydCB7XHJcbiAgICBzdGF0LFxyXG4gICAgb3BlbixcclxuICAgIHVubGlua1xyXG59IGZyb20gXCJub2RlOmZzL3Byb21pc2VzXCI7XHJcblxyXG4vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbi8vIExvY2sgRmlsZVxyXG4vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG4vKipcclxuICogTmVlZGVkIHRvIHBsYXkgd2l0aCBteSBjb250ZXh0IGNsZWFudXAgcGx1Z2luLlxyXG4gKiBodHRwczovL2dpdGh1Yi5jb20vYW5oLXZ1ZGluaC9MTS1TdHVkaW9fQ29udGV4dC1DbGVhbnVwXHJcbiAqIFxyXG4gKiBMb2NrIHdvcmtzIGxpa2UgdGhpcy5cclxuICogVXNlciBjYWxscyBmdW5jdGlvbnMuIFRob3NlIGZ1bmN0aW9ucyBzZW5kIHRoZWlyIGZ1bmN0aW9uTmFtZSBhbmQgcGFyYW1lcnRlcnMgb3ZlciB0byBtdWx0aUVkaXRDb29yZGluYXRvcigpLlxyXG4gKiBNRUMgYWZ0ZXIgbXVsdGlwbGUgbGF5ZXJlZCBjaGVja3Mgd2lsbCBhY3F1aXJlIGEgbG9jayBmaWxlIGp1c3QgYmVmb3JlIGl0J3Mgd3JpdGUgb3BlcmF0aW9uLlxyXG4gKiBUZWNobmljYWxseSB0aGlzIGxvY2sgYWxsb3dzIGZvciBtdWx0aXBsZSBmdW5jdGlvbnMgdG8gY2FsbCBmb3IgdGhlaXIgZnVuY3Rpb24gc3RvcmVkIGluIE1FQyB0byBiZSBydW4gZm9yIHRoYXQgdHVybi5cclxuICogT25jZSBhIGZ1bmN0aW9uIGhhcyBiZWVuIHJ1biwgaXQgd2lsbCBiZSBjbGVhcmVkIGZyb20gdGhlIHJlbWFpbmluZ0Z1bmN0aW9ucyBxdWV1ZS5cclxuICogUmVsZWFzZUxvY2soKSB3aWxsIHJlbGVhc2UgdGhlIGxvY2sgZmlsZSBvbmNlIHRoZXJlIGFyZSBubyByZW1haW5pbmcgZnVuY3Rpb25zIHRvIGJlIHJ1bi5cclxuICogSWYgeW91IGFyZSBub3Qgc2VlaW5nIHRoZSBxdWV1ZSBiZSBwb3B1bGF0ZWQgSSd2ZSB0ZXN0ZWQgaXQgdGhvcm91Z2hseSBpdCB3b3Jrcy4gSXQncyBqdXN0IHRoYXQgdGhlIHdyaXRlIGhhcHBlbnNcclxuICogc28gZmFzdCBpbiBtb3N0IGluc3RhbmNlcyB0aGF0IHRoZSBxdWV1ZSB3aWxsIGp1c3QgYmUgdGhlIG9uZSBmdW5jdGlvbiBzdHJhaWdodCB0byByZWxlYXNlLlxyXG4gKi9cclxuXHJcbmNvbnN0IGxvY2tGaWxlRnVuY3Rpb25zID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZ1tdPigpO1xyXG5jb25zdCBsb2NrT3duZXJDb3VudGVycyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gYWRkTG9ja0ZpbGVGdW5jdGlvbihcclxuICAgIGxvY2tGaWxlOiBzdHJpbmcsXHJcbiAgICBmdW5jdGlvbk5hbWU6IHN0cmluZyxcclxuKTogdm9pZCB7XHJcbiAgICBjb25zdCBmdW5jdGlvbnMgPSBsb2NrRmlsZUZ1bmN0aW9ucy5nZXQobG9ja0ZpbGUpID8/IFtdO1xyXG5cclxuICAgIGlmICghZnVuY3Rpb25zLmluY2x1ZGVzKGZ1bmN0aW9uTmFtZSkpIHtcclxuICAgICAgICBmdW5jdGlvbnMucHVzaChmdW5jdGlvbk5hbWUpO1xyXG4gICAgfVxyXG5cclxuICAgIGxvY2tGaWxlRnVuY3Rpb25zLnNldChsb2NrRmlsZSwgZnVuY3Rpb25zKTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHJlbW92ZUxvY2tGaWxlRnVuY3Rpb24oXHJcbiAgICBsb2NrRmlsZTogc3RyaW5nLFxyXG4gICAgZnVuY3Rpb25OYW1lOiBzdHJpbmcsXHJcbik6IGJvb2xlYW4ge1xyXG4gICAgY29uc3QgZnVuY3Rpb25zID0gbG9ja0ZpbGVGdW5jdGlvbnMuZ2V0KGxvY2tGaWxlKTtcclxuXHJcbiAgICBpZiAoIWZ1bmN0aW9ucykge1xyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBpbmRleCA9IGZ1bmN0aW9ucy5pbmRleE9mKGZ1bmN0aW9uTmFtZSk7XHJcblxyXG4gICAgaWYgKGluZGV4ID09PSAtMSkge1xyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICBmdW5jdGlvbnMuc3BsaWNlKGluZGV4LCAxKTtcclxuXHJcbiAgICBpZiAoZnVuY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIGxvY2tGaWxlRnVuY3Rpb25zLmRlbGV0ZShsb2NrRmlsZSk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRydWU7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRMb2NrRmlsZUZ1bmN0aW9ucyhcclxuICAgIGxvY2tGaWxlOiBzdHJpbmcsXHJcbik6IHN0cmluZ1tdIHtcclxuICAgIHJldHVybiBbLi4uKGxvY2tGaWxlRnVuY3Rpb25zLmdldChsb2NrRmlsZSkgPz8gW10pXTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGFjcXVpcmVMb2NrKFxyXG4gICAgbG9ja0ZpbGU6IHN0cmluZyxcclxuICAgIGZ1bmN0aW9uTmFtZTogc3RyaW5nLFxyXG4pOiBQcm9taXNlPHN0cmluZz4ge1xyXG5cclxuICAgIGNvbnN0IG93bmVyQ291bnQgPSAobG9ja093bmVyQ291bnRlcnMuZ2V0KGZ1bmN0aW9uTmFtZSkgPz8gMCkgKyAxO1xyXG5cclxuICAgIGxvY2tPd25lckNvdW50ZXJzLnNldChmdW5jdGlvbk5hbWUsIG93bmVyQ291bnQpO1xyXG5cclxuICAgIGNvbnN0IHVuaXF1ZUZ1bmN0aW9uTmFtZSA9IGAke2Z1bmN0aW9uTmFtZX1fJHtvd25lckNvdW50fWA7XHJcblxyXG4gICAgY29uc3QgTE9DS19TVEFMRV9USU1FT1VUX01TID0gMjBfMDAwO1xyXG4gICAgY29uc3QgTE9DS19XQUlUX1RJTUVPVVRfTVMgPSAyNV8wMDA7XHJcbiAgICBjb25zdCBQT0xMX0lOVEVSVkFMX01TID0gMTAwO1xyXG4gICAgY29uc3Qgc3RhcnRlZEF0ID0gRGF0ZS5ub3coKTtcclxuXHJcbiAgICB3aGlsZSAodHJ1ZSkge1xyXG4gICAgICAgIFxyXG4gICAgICAgIC8vIERpc2FibGVkIGlmIHNvbWUgZnVuY3Rpb25zIG1heSBnZW51aW5lbHkgdGFrZSBhIGxvbmcgdGltZSB0byByZWxlYXNlIHRoZWlyIGxvY2tmaWxlLlxyXG4gICAgICAgIC8vIFRvIGVuYWJsZSB0aGlzIGRlcGVuZHMgd2hlbiB5b3UgYWNxdWlyZSB0aGUgbG9jay4gSWYgeW91IGRvIGl0IGJlZm9yZSB0aGUgbGFzdGFzc2lzdGFudG1lc3NhZ2UgY2hlY2ssXHJcbiAgICAgICAgLy8gdG9vbCBjYWxscyBtb3N0IGxpa2VseSB3aWxsIHRpbWUgdGhpcyBvdXQuIElmIHlvdSBkbyBpdCBqdXN0IGJlZm9yZSB0aGUgd3JpdGVGaWxlIGFuZCBpdCdzIHBhc3NlZCBhbGwgZnJlc2huZXNzIHRlc3RzLCBpdCB3aWxsIGJlIHVzZWZ1bC5cclxuICAgICAgICAvLyBUbyBzdG9wIGEgY3Jhc2hlZC9odW5nIHByb2Nlc3MuXHJcbiAgICAgICAgaWYgKERhdGUubm93KCkgLSBzdGFydGVkQXQgPj0gTE9DS19XQUlUX1RJTUVPVVRfTVMpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICAgICAgICAgICAgYFRpbWVkIG91dCB3YWl0aW5nIGZvciBsb2NrOiAke2xvY2tGaWxlfWAsXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBQTSBhbHJlYWR5IG93bnMgdGhpcyBsb2NrLlxyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRGdW5jdGlvbnMgPSBsb2NrRmlsZUZ1bmN0aW9ucy5nZXQobG9ja0ZpbGUpO1xyXG5cclxuICAgICAgICBpZiAoY3VycmVudEZ1bmN0aW9ucyAmJiBjdXJyZW50RnVuY3Rpb25zLmxlbmd0aCA+IDApIHtcclxuXHJcbiAgICAgICAgICAgIGFkZExvY2tGaWxlRnVuY3Rpb24obG9ja0ZpbGUsIHVuaXF1ZUZ1bmN0aW9uTmFtZSk7XHJcblxyXG4gICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhcclxuICAgICAgICAgICAgLy8gICAgIFwiPT09PT0gUE0gQUxSRUFEWSBPV05TIExPQ0sgPT09PT1cIixcclxuICAgICAgICAgICAgLy8gICAgIGxvY2tGaWxlLFxyXG4gICAgICAgICAgICAvLyAgICAgXCJmdW5jdGlvblwiLFxyXG4gICAgICAgICAgICAvLyAgICAgZnVuY3Rpb25OYW1lLFxyXG4gICAgICAgICAgICAvLyAgICAgXCJhY3RpdmUgZnVuY3Rpb25zXCIsXHJcbiAgICAgICAgICAgIC8vICAgICBnZXRMb2NrRmlsZUZ1bmN0aW9ucyhsb2NrRmlsZSksXHJcbiAgICAgICAgICAgIC8vICAgICBcInRpbWVzdGFtcFwiLFxyXG4gICAgICAgICAgICAvLyAgICAgRGF0ZS5ub3coKSxcclxuICAgICAgICAgICAgLy8gKTtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiB1bmlxdWVGdW5jdGlvbk5hbWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBoYW5kbGUgPSBhd2FpdCBvcGVuKGxvY2tGaWxlLCBcInd4XCIpO1xyXG5cclxuICAgICAgICAgICAgYWRkTG9ja0ZpbGVGdW5jdGlvbihsb2NrRmlsZSwgdW5pcXVlRnVuY3Rpb25OYW1lKTtcclxuXHJcbiAgICAgICAgICAgIC8vIGNvbnNvbGUubG9nKFxyXG4gICAgICAgICAgICAvLyAgICAgXCI9PT09PSBQTSBDUkVBVEVEIExPQ0sgPT09PT1cIixcclxuICAgICAgICAgICAgLy8gICAgIGxvY2tGaWxlLFxyXG4gICAgICAgICAgICAvLyAgICAgXCJmdW5jdGlvblwiLFxyXG4gICAgICAgICAgICAvLyAgICAgZnVuY3Rpb25OYW1lLFxyXG4gICAgICAgICAgICAvLyAgICAgXCJhY3RpdmUgZnVuY3Rpb25zXCIsXHJcbiAgICAgICAgICAgIC8vICAgICBnZXRMb2NrRmlsZUZ1bmN0aW9ucyhsb2NrRmlsZSksXHJcbiAgICAgICAgICAgIC8vICAgICBcInRpbWVzdGFtcFwiLFxyXG4gICAgICAgICAgICAvLyAgICAgRGF0ZS5ub3coKSxcclxuICAgICAgICAgICAgLy8gKTtcclxuXHJcbiAgICAgICAgICAgIGF3YWl0IGhhbmRsZS5jbG9zZSgpO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIHVuaXF1ZUZ1bmN0aW9uTmFtZTtcclxuXHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc3QgZnNFcnJvciA9IGVycm9yIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcclxuXHJcbiAgICAgICAgICAgIGlmIChmc0Vycm9yLmNvZGUgIT09IFwiRUVYSVNUXCIpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IGVycm9yO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBBbm90aGVyIFBNIGZ1bmN0aW9uIG1heSBoYXZlIGFjcXVpcmVkIGl0XHJcbiAgICAgICAgICAgIC8vIHdoaWxlIHRoaXMgZnVuY3Rpb24gd2FzIHRyeWluZyB0byBjcmVhdGUgaXQuXHJcbiAgICAgICAgICAgIGNvbnN0IGZ1bmN0aW9uc0FmdGVyQ29sbGlzaW9uID1cclxuICAgICAgICAgICAgICAgIGxvY2tGaWxlRnVuY3Rpb25zLmdldChsb2NrRmlsZSk7XHJcblxyXG4gICAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICAgICBmdW5jdGlvbnNBZnRlckNvbGxpc2lvbiAmJlxyXG4gICAgICAgICAgICAgICAgZnVuY3Rpb25zQWZ0ZXJDb2xsaXNpb24ubGVuZ3RoID4gMFxyXG4gICAgICAgICAgICApIHtcclxuICAgICAgICAgICAgICAgIGFkZExvY2tGaWxlRnVuY3Rpb24obG9ja0ZpbGUsIHVuaXF1ZUZ1bmN0aW9uTmFtZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gY29uc29sZS5sb2coXHJcbiAgICAgICAgICAgICAgICAvLyAgICAgXCI9PT09PSBQTSBBQ1FVSVJFRCBMT0NLIEFGVEVSIENPTExJU0lPTiA9PT09PVwiLFxyXG4gICAgICAgICAgICAgICAgLy8gICAgIGxvY2tGaWxlLFxyXG4gICAgICAgICAgICAgICAgLy8gICAgIFwiZnVuY3Rpb25cIixcclxuICAgICAgICAgICAgICAgIC8vICAgICBmdW5jdGlvbk5hbWUsXHJcbiAgICAgICAgICAgICAgICAvLyAgICAgXCJhY3RpdmUgZnVuY3Rpb25zXCIsXHJcbiAgICAgICAgICAgICAgICAvLyAgICAgZ2V0TG9ja0ZpbGVGdW5jdGlvbnMobG9ja0ZpbGUpLFxyXG4gICAgICAgICAgICAgICAgLy8gICAgIFwidGltZXN0YW1wXCIsXHJcbiAgICAgICAgICAgICAgICAvLyAgICAgRGF0ZS5ub3coKSxcclxuICAgICAgICAgICAgICAgIC8vICk7XHJcblxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIHVuaXF1ZUZ1bmN0aW9uTmFtZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHN0YXRzID0gYXdhaXQgc3RhdChsb2NrRmlsZSk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBsb2NrQWdlID0gRGF0ZS5ub3coKSAtIHN0YXRzLm10aW1lTXM7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGxvY2tBZ2UgPj0gTE9DS19TVEFMRV9USU1FT1VUX01TKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdW5saW5rKGxvY2tGaWxlKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNvbnNvbGUubG9nKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyAgICAgXCI9PT09PSBPVEhFUiBQTFVHSU4gU1RBTEUgTE9DSyBSRU1PVkVEIEJZIFBNID09PT09XCIsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgICBsb2NrRmlsZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gICAgIFwidGltZXN0YW1wXCIsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgICBEYXRlLm5vdygpLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyApO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmc0Vycm9yID0gZXJyb3IgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGZzRXJyb3IuY29kZSAhPT0gXCJFTk9FTlRcIikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGZzRXJyb3IgPSBlcnJvciBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb247XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKGZzRXJyb3IuY29kZSAhPT0gXCJFTk9FTlRcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIHRocm93IGVycm9yO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT5cclxuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQocmVzb2x2ZSwgUE9MTF9JTlRFUlZBTF9NUyksXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVsZWFzZUxvY2soXHJcbiAgICBsb2NrRmlsZTogc3RyaW5nLFxyXG4gICAgZnVuY3Rpb25OYW1lOiBzdHJpbmcsXHJcbik6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgcmVtb3ZlZCA9IHJlbW92ZUxvY2tGaWxlRnVuY3Rpb24oXHJcbiAgICAgICAgbG9ja0ZpbGUsXHJcbiAgICAgICAgZnVuY3Rpb25OYW1lLFxyXG4gICAgKTtcclxuXHJcbiAgICBpZiAoIXJlbW92ZWQpIHtcclxuICAgICAgICAvLyBjb25zb2xlLndhcm4oXHJcbiAgICAgICAgLy8gICAgIFwiPT09PT0gUE0gUkVMRUFTRSBMT0NLIFdBUk5JTkcgPT09PT1cIixcclxuICAgICAgICAvLyAgICAgbG9ja0ZpbGUsXHJcbiAgICAgICAgLy8gICAgIFwiZnVuY3Rpb25cIixcclxuICAgICAgICAvLyAgICAgZnVuY3Rpb25OYW1lLFxyXG4gICAgICAgIC8vICAgICBcIndhcyBub3QgcmVnaXN0ZXJlZCBhcyBvd25pbmcgdGhlIGxvY2tcIixcclxuICAgICAgICAvLyAgICAgXCJ0aW1lc3RhbXBcIixcclxuICAgICAgICAvLyAgICAgRGF0ZS5ub3coKSxcclxuICAgICAgICAvLyApO1xyXG5cclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgcmVtYWluaW5nRnVuY3Rpb25zID0gZ2V0TG9ja0ZpbGVGdW5jdGlvbnMobG9ja0ZpbGUpO1xyXG5cclxuICAgIC8vIGNvbnNvbGUubG9nKFxyXG4gICAgLy8gICAgIFwiPT09PT0gUE0gRlVOQ1RJT04gRklOSVNIRUQgPT09PT1cIixcclxuICAgIC8vICAgICBsb2NrRmlsZSxcclxuICAgIC8vICAgICBcImZ1bmN0aW9uXCIsXHJcbiAgICAvLyAgICAgZnVuY3Rpb25OYW1lLFxyXG4gICAgLy8gICAgIFwicmVtYWluaW5nIGZ1bmN0aW9uc1wiLFxyXG4gICAgLy8gICAgIHJlbWFpbmluZ0Z1bmN0aW9ucyxcclxuICAgIC8vICAgICBcInRpbWVzdGFtcFwiLFxyXG4gICAgLy8gICAgIERhdGUubm93KCksXHJcbiAgICAvLyApO1xyXG5cclxuICAgIC8vIFBNIHN0aWxsIGhhcyBmdW5jdGlvbnMgdXNpbmcgdGhpcyBsb2NrLlxyXG4gICAgaWYgKHJlbWFpbmluZ0Z1bmN0aW9ucy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIExhc3QgUE0gZnVuY3Rpb24gZmluaXNoZWQuXHJcbiAgICB0cnkge1xyXG4gICAgICAgIGF3YWl0IHVubGluayhsb2NrRmlsZSk7XHJcblxyXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFxyXG4gICAgICAgIC8vICAgICBcIj09PT09IFBNIFJFTEVBU0VEIExPQ0sgPT09PT1cIixcclxuICAgICAgICAvLyAgICAgbG9ja0ZpbGUsXHJcbiAgICAgICAgLy8gICAgIFwidGltZXN0YW1wXCIsXHJcbiAgICAgICAgLy8gICAgIERhdGUubm93KCksXHJcbiAgICAgICAgLy8gKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc3QgZnNFcnJvciA9IGVycm9yIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcclxuXHJcbiAgICAgICAgaWYgKGZzRXJyb3IuY29kZSAhPT0gXCJFTk9FTlRcIikge1xyXG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn0iLCAiaW1wb3J0IHsgY3JlYXRlQ29uZmlnU2NoZW1hdGljcyB9IGZyb20gXCJAbG1zdHVkaW8vc2RrXCI7XHJcbmltcG9ydCB7IG5vcm1hbGl6ZUpzb25GaWxlTmFtZSB9IGZyb20gXCIuL3Byb21wdFByZXByb2Nlc3NvclwiXHJcbmltcG9ydCB0eXBlIHsgQ2hhdCwgUHJvbXB0UHJlcHJvY2Vzc29yQ29udHJvbGxlciB9IGZyb20gXCJAbG1zdHVkaW8vc2RrXCI7XHJcblxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuLy8gVE9NIENvbW1hbmQgU3RhdGVzXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxuLy8gU3RhdHVzOlxyXG4vLyBJbmNvbXBsZXRlID0gcGVuZGluZyBUT00gY29tbWFuZCBub3QgeWV0IGRvbmVcclxuLy8gTnVsbCA9IG5vIFRPTSBjb21tYW5kIGRlZmF1bHQgc3RhdGVcclxuLy8gUmVhZHkgPSB2YWxpZCBhbmQgcXVldWVkXHJcbmV4cG9ydCB0eXBlIFBlbmRpbmdUb21Db21tYW5kU3RhdHVzID0gXCJpbmNvbXBsZXRlXCIgfCBcIm51bGxcIiB8IFwicmVhZHlcIjtcclxuXHJcbmxldCBwZW5kaW5nVG9tQ29tbWFuZDogUGVuZGluZ1RvbUNvbW1hbmRTdGF0dXMgPSBcIm51bGxcIjtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRQZW5kaW5nVG9tQ29tbWFuZCgpOiBQZW5kaW5nVG9tQ29tbWFuZFN0YXR1cyB7XHJcbiAgICByZXR1cm4gcGVuZGluZ1RvbUNvbW1hbmQ7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRQZW5kaW5nVG9tQ29tbWFuZChcclxuICAgIHZhbHVlOiBQZW5kaW5nVG9tQ29tbWFuZFN0YXR1cyxcclxuKTogdm9pZCB7XHJcbiAgICBwZW5kaW5nVG9tQ29tbWFuZCA9IHZhbHVlO1xyXG59XHJcblxyXG5leHBvcnQgY29uc3QgVE9NX1JBTkdFUyA9IHtcclxuICAgIGZpcnN0OiB7IHN0YXJ0OiBcIkFcIiwgZW5kOiBcIkpcIiB9LFxyXG4gICAgc2Vjb25kOiB7IHN0YXJ0OiBcIktcIiwgZW5kOiBcIlFcIiB9LFxyXG4gICAgc3BlY2lhbDogeyBzdGFydDogXCJSXCIsIGVuZDogXCJaXCIgfSxcclxufSBhcyBjb25zdDtcclxuXHJcbmNvbnN0IHRvbVJhbmdlUGF0dGVybnMgPSBPYmplY3QudmFsdWVzKFRPTV9SQU5HRVMpXHJcbiAgICAubWFwKCh7IHN0YXJ0LCBlbmQgfSkgPT4ge1xyXG4gICAgICAgIHJldHVybiBgJHtzdGFydC50b0xvd2VyQ2FzZSgpfVxcXFxzKi0/XFxcXHMqJHtlbmQudG9Mb3dlckNhc2UoKX1gO1xyXG4gICAgfSlcclxuICAgIC5qb2luKFwifFwiKTtcclxuXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4vLyBDb25maWcgU2NoZW1hdGljc1xyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuXHJcbmxldCBjdXJyZW50TWVtb3J5U2VlZHNQb29sOiByZWFkb25seSBzdHJpbmdbXSA9IFtdO1xyXG5sZXQgY3VycmVudE1lbW9yeVNlZWRzU2VsZWN0ZWQ6IHJlYWRvbmx5IHN0cmluZ1tdID0gW107XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQ29uZmlnKFxyXG4gICAgbWVtb3J5U2VlZHNQb29sOiByZWFkb25seSBzdHJpbmdbXSxcclxuICAgIG1lbW9yeVNlZWRzU2VsZWN0ZWQ6IHJlYWRvbmx5IHN0cmluZ1tdLFxyXG4pIHtcclxuICAgIHJldHVybiBjcmVhdGVDb25maWdTY2hlbWF0aWNzKClcclxuICAgICAgICAuZmllbGQoXHJcbiAgICAgICAgICAgIFwiZW5hYmxlVG9vbHNNb2RlXCIsXHJcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5TmFtZTogXCJcdUQ4M0RcdURFRTBcdUZFMEYgU3dpdGNoIHRvIFRvb2wgQ2FsbCBNb2RlP1wiLFxyXG4gICAgICAgICAgICAgICAgc3VidGl0bGU6IFwiRXhwbGljaXQgTW9kZSBpcyB0aGUgZGVmYXVsdC4gVHVybmluZyB0aGlzIG9uIGFsbG93cyB0aGUgYXNzaXN0YW50IHRvIGNhbGwgdGhlc2UgZnVuY3Rpb25zIGFzIHRvb2xzLiBUaGlzIHNlbWktZGlzYWJsZXMgdGhlIGV4cGxpY2l0IG1vZGUuIEhvdmVyIGZvciBEZXRhaWxzLlwiLFxyXG4gICAgICAgICAgICAgICAgaGludDogXCJTdGlsbCBoYW5kbGVkIGV4cGxpY2l0bHk6IFxcbiAtIE1lc3NhZ2UgIyBhcHBlbmRpbmcgXFxuIC0gVE9NIHJldHJhY3Rpb25zIFxcbiAtIGluamVjdGVkIG1lbW9yeSBzZWVkIHJlbW92YWxcIixcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgZmFsc2UsXHJcbiAgICAgICAgKVxyXG4gICAgICAgIC5maWVsZChcclxuICAgICAgICAgICAgXCJkZWxldGVNZW1vcnlTZWVkc0ZpbGVcIixcclxuICAgICAgICAgICAgXCJzdHJpbmdcIixcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZGlzcGxheU5hbWU6IFwiXHVEODNEXHVEREQxXHVGRTBGIERlbGV0ZSBNZW1vcnlcIixcclxuICAgICAgICAgICAgICAgIHN1YnRpdGxlOiBcIiAqV0FSTklORyogVGhpcyBkb2VzIG5vdCByZW1vdmUgYWxyZWFkeSBpbmplY3RlZCBtZW1vcmllcy4gVGhpcyBpcyBhIGZpbmFsIGFjdGlvbiB0byBwZXJtYW5lbnRseSBkZWxldGUgYSBtZW1vcnkuXCIsXHJcbiAgICAgICAgICAgICAgICB3YXJuaW5nOiBcIlRoaXMgbWVtb3J5IHdpbGwgYmUgcGVybWFuZW50bHkgZGVsZXRlZC5cIixcclxuICAgICAgICAgICAgICAgIGhpbnQ6IFwiT3B0aW9uYWw6IFxcbiAtIDxjYXRlZ29yeT4vKi5qc29uIHdpbGwgZGVsZXRlIHRoZSBlbnRpcmUgY2F0ZWdvcnlcIixcclxuICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyOiBcIkZ1bGwgbmFtZSBvZiB0aGUgbWVtb3J5IHRvIGRlbGV0ZS4gQ29weS9wYXN0ZSBmcm9tIGF2YWlsYWJsZSBtZW1vcmllcy5cIixcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgXCJcIixcclxuICAgICAgICApXHJcbiAgICAgICAgLmZpZWxkKFxyXG4gICAgICAgICAgICBcIm1lbW9yeVNlZWRzUG9vbFwiLFxyXG4gICAgICAgICAgICBcInN0cmluZ0FycmF5XCIsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlOYW1lOiBcIkF2YWlsYWJsZSBNZW1vcmllc1wiLFxyXG4gICAgICAgICAgICAgICAgc3VidGl0bGU6IFwiRElTUExBWSBPTkxZOiBIb3ZlciBmb3IgU2F2ZSBNZW1vcnkgY29tbWFuZCBzeW50YXggcmVtaW5kZXJzLlwiLFxyXG4gICAgICAgICAgICAgICAgaGludDogXCJDb3B5L3Bhc3RlIGZ1bGwgbmFtZXMsIGluY2x1ZGluZyB0aGUgLmpzb24gdG86IFxcblxcbiAtIE1lbW9yaWVzIHRvIEluamVjdCBcXG4gLSBEZWxldGUgTWVtb3J5IFxcblxcbiBDb21tYW5kczogXFxuXFxuIFNpbmdsZTogXFxuIC0gc2F2ZSBtZW1vcnkgPG1lc3NhZ2UgIz47IGNhdGVnb3J5IDxjYXRlZ29yeV9uYW1lPjsgbmFtZSA8bWVtb3J5X25hbWU+IFxcblxcbiBCYXRjaDogXFxuIC0gc2F2ZSBtZW1vcnkgPG1lc3NhZ2UgIz4gdG8gPG1lc3NhZ2UgIz47IGNhdGVnb3J5IDxjYXRlZ29yeV9uYW1lPjsgbmFtZSA8bWVtb3J5X25hbWU+IFwiLFxyXG4gICAgICAgICAgICAgICAgYWxsb3dFbXB0eVN0cmluZ3M6IGZhbHNlLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBbLi4ubWVtb3J5U2VlZHNQb29sXSxcclxuICAgICAgICApXHJcbiAgICAgICAgLmZpZWxkKFxyXG4gICAgICAgICAgICBcIm1lbW9yeVNlZWRzU2VsZWN0ZWRcIixcclxuICAgICAgICAgICAgXCJzdHJpbmdBcnJheVwiLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5TmFtZTogXCJcdUQ4M0VcdURERTAgTWVtb3JpZXMgdG8gSW5qZWN0XCIsXHJcbiAgICAgICAgICAgICAgICBzdWJ0aXRsZTogXCJJbmplY3RzIGEgbWVtb3J5IGludG8gY29udGV4dC4gQ29weS9wYXN0ZSBmcm9tIGF2YWlsYWJsZSBtZW1vcmllcy5cIixcclxuICAgICAgICAgICAgICAgIHdhcm5pbmc6IFwiT25seSB0aGUgbWVtb3JpZXMgbGlzdGVkIGJlbG93IHdpbGwgcGVyc2lzdCB0aHJvdWdoIHR1cm5zLlwiLFxyXG4gICAgICAgICAgICAgICAgaGludDogXCJPcHRpb25hbDogXFxuIC0gPGNhdGVnb3J5Pi8qLmpzb24gd2lsbCBpbmplY3QgdGhlIGVudGlyZSBjYXRlZ29yeVwiLFxyXG4gICAgICAgICAgICAgICAgYWxsb3dFbXB0eVN0cmluZ3M6IGZhbHNlLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBbLi4ubWVtb3J5U2VlZHNTZWxlY3RlZF1cclxuICAgICAgICApXHJcbiAgICAgICAgLmZpZWxkKFxyXG4gICAgICAgICAgICBcInN1bW1hcml6ZU1lbW9yeVNlZWRzXCIsXHJcbiAgICAgICAgICAgIFwiYm9vbGVhblwiLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5TmFtZTogXCJcdUQ4M0RcdURDREQgU3VtbWFyaXplIEFsbCBNZW1vcmllcyBJbmplY3RlZCAobm90IHJldHJvYWN0aXZlKVwiLFxyXG4gICAgICAgICAgICAgICAgc3VidGl0bGU6IFwiIFdpbGwgZm9yY2UgYSBzdW1tYXJ5IG9mIHRoZSBtZW1vcnkgZmlsZSB0byBiZSBpbmplY3RlZCBpbnN0ZWFkIG9mIHRoZSBjb21wbGV0ZSB1c2VyL2Fzc2lzdGFudCBleGNoYW5nZVwiLFxyXG4gICAgICAgICAgICAgICAgaGludDogXCJUaGlzIHdpbGwgbGVzc2VuIHRoZSBjb250ZXh0IHdpbmRvdyBjb25zdW1lZCBidXQgbWF5IGxvc2UgZGV0YWlscyBvciBtZXJnZSBjb250ZW50IGNvbXBhcmVkIHRvIHRoZSBmdWxsIG1lc3NhZ2UgZXhjaGFuZ2UuXCIsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIGZhbHNlLFxyXG4gICAgICAgIClcclxuICAgICAgICAuZmllbGQoXHJcbiAgICAgICAgICAgIFwidG9tTmFtZXNcIixcclxuICAgICAgICAgICAgXCJzdHJpbmdBcnJheVwiLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5TmFtZTogXCJcdUQ4M0RcdURDRTYgVGFibGUgb2YgTWVtb3JpZXNcIixcclxuICAgICAgICAgICAgICAgIHN1YnRpdGxlOiBcIkRJU1BMQVkgT05MWTogSG92ZXIgZm9yIGNvbW1hbmQgc3ludGF4IHJlbWluZGVycy4gXFxuXFxuIFRoZXNlIGJ1dHRvbnMgZG8gbm90aGluZy5cIixcclxuICAgICAgICAgICAgICAgIGhpbnQ6XCJJTVBPUlRBTlQhIFxcbiBNYWtlIHN1cmUgeW91IGhhdmUgcmVhZCB0aGUgdG9vbHRpcCBmb3IgSW5pdGlhbGl6ZSBUYWJsZSBvZiBNZW1vcmllcyBmaXJzdCBiZWZvcmUgdXNpbmcgdGhpcyBmZWF0dXJlLiBcXG5cXG4gQ29tbWFuZHM6IFxcbiAxKSBmZXRjaCB0aGUgbWVtb3J5IHRhYmxlIDx0YWJsZSBuYW1lPiBcXG4gMikgcmVjYWxsIGEgbWVtb3J5IGFib3V0IDxpbnNlcnQgc3BlY2lmaWNzPiBcXG4gMykgZmV0Y2ggdGhlIG1lbW9yeSA8Y2F0ZWdvcnk+LzxuYW1lPi5qc29uIFxcbiA0KSBmZXRjaCB0aGUgbWVtb3JpZXMgPGNhdGVnb3J5Pi8qLmpzb24gXFxuXFxuIFNob3J0aGFuZDogXFxuIC0gdG9tYWosIHRvbWtxLCB0b21yelwiLFxyXG4gICAgICAgICAgICAgICAgYWxsb3dFbXB0eVN0cmluZ3M6IGZhbHNlLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBbYFRPTV8ke1RPTV9SQU5HRVMuZmlyc3Quc3RhcnR9LSR7VE9NX1JBTkdFUy5maXJzdC5lbmR9YCwgYFRPTV8ke1RPTV9SQU5HRVMuc2Vjb25kLnN0YXJ0fS0ke1RPTV9SQU5HRVMuc2Vjb25kLmVuZH1gLCBgVE9NXyR7VE9NX1JBTkdFUy5zcGVjaWFsLnN0YXJ0fS0ke1RPTV9SQU5HRVMuc3BlY2lhbC5lbmR9YF1cclxuICAgICAgICApXHJcbiAgICAgICAgLmZpZWxkKFxyXG4gICAgICAgICAgICBcImluaXRpYWxpemVUT01cIixcclxuICAgICAgICAgICAgXCJib29sZWFuXCIsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGRpc3BsYXlOYW1lOiBcIlx1MjY5OVx1RkUwRiBJbml0aWFsaXplIFRhYmxlIG9mIE1lbW9yaWVzXCIsXHJcbiAgICAgICAgICAgICAgICBzdWJ0aXRsZTogXCIgKldBUk5JTkcqIERvIG5vdCBsZWF2ZSBlbmFibGVkLiBIb3ZlciBmb3IgZGV0YWlscy5cIixcclxuICAgICAgICAgICAgICAgIHdhcm5pbmc6IFwiUmVtZW1iZXIgdG8gb2ZmIHRoaXMgYWZ0ZXIgeW91J3ZlIHNlbnQgb25lIG1lc3NhZ2Ugd2l0aCBpdCBlbmFibGVkLlwiLFxyXG4gICAgICAgICAgICAgICAgaGludDogXCJUaGlzIGlzIHRvIGNyZWF0ZSB0aGUgdGFibGUgb2YgbWVtb3JpZXMgZmlsZXMgZm9yIHRoaXMgcGx1Z2luLiBUdXJuIGl0IG9uIGFuZCBzZW5kIGFueSB1c2VyIG1lc3NhZ2UuIFR1cm4gaXQgb2ZmIGFmdGVyIHRoZSBtZXNzYWdlIGlzIHNlbnQuIFxcblxcbiBMZWF2ZSBpdCBvZmYgYnkgZGVmYXVsdCB1bmxlc3MgeW91ciBzY2VuZXJpbyBtYXRjaGVzIG9uZSBjb25kaXRpb246IFxcbiAxKSBZb3UgaGF2ZSBuZXZlciBpbml0aWFsaXplZCB0aGUgbWVtb3J5IHRhYmxlcyBiZWZvcmUuIFxcbiAyKSBZb3Ugc3VzcGVjdCB0aGF0IHlvdXIgVE9NIGZpbGVzL2NvbnRlbnRzIG5lZWQgcmVwYWlyLiBcXG5cXG4gTGVhdmUgdGhpcyBPRkYgb25jZSB0aGUgdGFibGUgaGFzIGJlZW4gaW5pdGlhbGl6ZWQgSXQgaXMgZXhwZW5zaXZlIHRvIHJ1biBpZiB5b3UgaGF2ZSBtYW55IG1lbW9yaWVzLlwiLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBmYWxzZSxcclxuICAgICAgICApXHJcbiAgICAgICAgLmZpZWxkKFxyXG4gICAgICAgICAgICBcInJldHJhY3RPbGRUb21zXCIsXHJcbiAgICAgICAgICAgIFwibnVtZXJpY1wiLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5TmFtZTogXCJcdTIxQTlcdUZFMEYgUmV0cmFjdCBvbGQgVE9NcyAmIFRPQ3MgZnJvbSBDb250ZXh0P1wiLFxyXG4gICAgICAgICAgICAgICAgc3VidGl0bGU6IFwiUmVtb3ZlcyBhbGwgdGhlIHByZXZpb3VzbHkgZmV0Y2hlZCBUT01zICYgVE9DcyBmcm9tIHRoZSBjaGF0IHNlc3Npb24uIEV4Y2x1ZGluZyBUT01zICYgVE9DcyBpbiB0aGUgbGFzdGVzdCA8Tj50aCBhc3Npc3RhbnQgbWVzc2FnZXMuXCIsXHJcbiAgICAgICAgICAgICAgICBoaW50OiBcIlJldHJvYWN0aXZlbHkgZnJlZXMgdXAgeW91ciBjb250ZXh0IHdpbmRvdyBmcm9tIGJlaW5nIGJ1cmRlbmRlZCBieSBUT00gJiBUT0MgdGFibGVzIHRoYXQgeW91J3ZlIGFscmVhZHkgY29uc3VtZWQuIFxcblxcbiAtIE9mZiA9IDAgXFxuXFxuIC0gTWF4ID0gMTAgXCIsXHJcbiAgICAgICAgICAgICAgICBpbnQ6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBtaW46IDAsXHJcbiAgICAgICAgICAgICAgICBtYXg6IDEwLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAwXHJcbiAgICAgICAgKVxyXG4gICAgICAgIC5maWVsZChcclxuICAgICAgICAgICAgXCJkZWxldGVUb2NDb2xsZWN0aW9uc0FmdGVyTnRoRGF5c1wiLFxyXG4gICAgICAgICAgICBcIm51bWVyaWNcIixcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgZGlzcGxheU5hbWU6IFwiXHVEODNEXHVERDI1IERlbGV0ZSBDb21wYWN0aW9ucyBvbGRlciB0aGFuIDxOPiBkYXlzIG9sZFwiLFxyXG4gICAgICAgICAgICAgICAgc3VidGl0bGU6IFwiWFBsdWdpbiBGZWF0dXJlOiBIb3ZlciBmb3IgZGV0YWlscy5cIixcclxuICAgICAgICAgICAgICAgIHdhcm5pbmc6IFwiUkVRVUlSRVMgdGhlIGNvbXBhbmlvbiBwbHVnaW4gQ29udGV4dCBDbGVhbnVwIHJldjgrIGVuYWJsZWQuXCIsXHJcbiAgICAgICAgICAgICAgICBoaW50OiBcIlJFUVVJUkVTIHRoZSBjb21wYW5pb24gcGx1Z2luIENvbnRleHQgQ2xlYW51cCByZXY4KyBmcm9tIExNIFN0dWRpbyBvciB2NC4wKyBmcm9tIEdpdGh1Yi4gXFxuXFxuICBBbGwgY29tcGFjdGlvbnMgb2xkZXIgdGhhbiB0aGUgc3RhdGVkIGRheXMgd2lsbCBiZSBkZWxldGVkLiBcXG5cXG4gVGhpcyB1c2VzIHRoZSBUT0NfQ29sbGVjdGlvbnMgZmlsZXMgdG8gZGV0ZXJtaW5lIHdoaWNoIGNvbXBhY2l0b25zIHRvIGV4cGlyZS4gVGhpcyBpcyBmb3IgdGhvc2Ugd2hvIHdpc2ggdG8gbm90IGhhdmUgdG8gbWFudWFsbHkgcHJ1bmUgY29tcGFjdGlvbnMuIFxcblxcbiAtIE9mZiA9IDAgXFxuXFxuIC0gTWF4ID0gMTUgXFxuXFxuIElmIGEgQ29tcGFjdGlvbidzIGNvbnRlbnRzIGFyZSBpbXBvcnRhbnQgdG8geW91LCBtYWtlIGl0IHBlcm1hbmVudCB1c2luZyBcdUQ4M0NcdURGMzEgQ29tcGFjdGlvbiBcdTI3QTAgTWVtb3J5IFNlZWQuXCIsXHJcbiAgICAgICAgICAgICAgICBpbnQ6IHRydWUsXHJcbiAgICAgICAgICAgICAgICBtaW46IDAsXHJcbiAgICAgICAgICAgICAgICBtYXg6IDE1LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAwXHJcbiAgICAgICAgKVxyXG4gICAgICAgIC5maWVsZChcclxuICAgICAgICAgICAgXCJlbmdyYWluQ29tcGFjdGlvblwiLFxyXG4gICAgICAgICAgICBcInN0cmluZ1wiLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICBkaXNwbGF5TmFtZTogXCJcdUQ4M0NcdURGMzEgQ29tcGFjdGlvbiBcdTI3QTAgTWVtb3J5IFNlZWRcIixcclxuICAgICAgICAgICAgICAgIHN1YnRpdGxlOiBcIlhQbHVnaW4gRmVhdHVyZTogSG92ZXIgZm9yIGRldGFpbHMuXCIsXHJcbiAgICAgICAgICAgICAgICB3YXJuaW5nOiBcIlJFUVVJUkVTIHRoZSBjb21wYW5pb24gcGx1Z2luIENvbnRleHQgQ2xlYW51cCByZXY4KyBlbmFibGVkLlwiLFxyXG4gICAgICAgICAgICAgICAgaGludDogXCJSRVFVSVJFUyB0aGUgY29tcGFuaW9uIHBsdWdpbiBDb250ZXh0IENsZWFudXAgcmV2OCsgZnJvbSBMTSBTdHVkaW8gb3IgdjQuMCsgZnJvbSBHaXRodWIuIFxcblxcbiBDb252ZXJ0cyBhIGNvbXBhY3Rpb24gaW50byBhIG1lbW9yeSBzZWVkLiA8bmFtZV9jI19wIy5qc29uPi4gXFxuXFxuIEFsbCBjb21wYWN0aW9ucyB3aWxsIGJlIGFkZGVkIHRvIHRoZSBjYXRlZ29yeSBlbl9jb21wcy4gXFxuXFxuXFxuICoqQ2hhdCBDb21tYW5kczoqKiBcXG4gLSBsaXN0IGNvbXBhY3Rpb24gc2VlZHMgXFxuIC0gZmV0Y2ggY29tcGFjdGlvbiA8bmFtZV9jI19wIy5qc29uPlwiLFxyXG4gICAgICAgICAgICAgICAgcGxhY2Vob2xkZXI6IFwiTmFtZSBvZiB0aGUgY29tcGFjdGlvbiB0byBlbmdyYWluLiA8bmFtZV9jI19wIy5qc29uPlwiLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBcIlwiLFxyXG4gICAgICAgIClcclxuICAgICAgICAuYnVpbGQoKTtcclxufVxyXG5cclxuZXhwb3J0IGxldCBjb25maWdTY2hlbWF0aWNzID0gY3JlYXRlQ29uZmlnKFxyXG4gICAgY3VycmVudE1lbW9yeVNlZWRzUG9vbCxcclxuICAgIGN1cnJlbnRNZW1vcnlTZWVkc1NlbGVjdGVkLFxyXG4pO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHNldENvbmZpZ1NjaGVtYXRpY3Moe1xyXG4gICAgbWVtb3J5U2VlZHNQb29sLFxyXG4gICAgbWVtb3J5U2VlZHNTZWxlY3RlZCxcclxufToge1xyXG4gICAgbWVtb3J5U2VlZHNQb29sPzogcmVhZG9ubHkgc3RyaW5nW107XHJcbiAgICBtZW1vcnlTZWVkc1NlbGVjdGVkPzogcmVhZG9ubHkgc3RyaW5nW107XHJcbn0pOiB2b2lkIHtcclxuICAgIGlmIChtZW1vcnlTZWVkc1Bvb2wgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIGN1cnJlbnRNZW1vcnlTZWVkc1Bvb2wgPSBtZW1vcnlTZWVkc1Bvb2w7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKG1lbW9yeVNlZWRzU2VsZWN0ZWQgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIGN1cnJlbnRNZW1vcnlTZWVkc1NlbGVjdGVkID0gbWVtb3J5U2VlZHNTZWxlY3RlZDtcclxuICAgIH1cclxuXHJcbiAgICBjb25maWdTY2hlbWF0aWNzID0gY3JlYXRlQ29uZmlnKFxyXG4gICAgICAgIGN1cnJlbnRNZW1vcnlTZWVkc1Bvb2wsXHJcbiAgICAgICAgY3VycmVudE1lbW9yeVNlZWRzU2VsZWN0ZWQsXHJcbiAgICApO1xyXG59XHJcblxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuLy8gQ29uZmlnIEdldHRlcnMgc2hhcmluZyBhY2Nlc3MgdG8gY3RsXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxubGV0IGN0bDogUHJvbXB0UHJlcHJvY2Vzc29yQ29udHJvbGxlcjtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRDb250cm9sbGVyKGNvbnRyb2xsZXI6IFByb21wdFByZXByb2Nlc3NvckNvbnRyb2xsZXIpOiB2b2lkIHtcclxuICAgIGN0bCA9IGNvbnRyb2xsZXI7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRDb250cm9sbGVyKCk6IFByb21wdFByZXByb2Nlc3NvckNvbnRyb2xsZXIge1xyXG4gICAgcmV0dXJuIGN0bDtcclxufVxyXG5cclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbi8vIFNBVkUgTUVNT1JZIFNUQVRFXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBQZW5kaW5nU2F2ZU1lbW9yeSB7XHJcbiAgICBhY3RpdmU6IGJvb2xlYW47XHJcbiAgICBtZW1vcnlOdW1iZXI6IG51bWJlciB8IG51bGw7XHJcbiAgICBjYXRlZ29yeTogc3RyaW5nIHwgbnVsbDtcclxuICAgIGZpbGVOYW1lOiBzdHJpbmcgfCBudWxsO1xyXG4gICAgbWVtb3J5TnVtYmVyRW5kUmFuZ2U6IG51bWJlciB8IG51bGw7XHJcbn1cclxuXHJcbmxldCBwZW5kaW5nU2F2ZU1lbW9yeTogUGVuZGluZ1NhdmVNZW1vcnkgPSB7XHJcbiAgICBhY3RpdmU6IGZhbHNlLFxyXG4gICAgbWVtb3J5TnVtYmVyOiBudWxsLFxyXG4gICAgY2F0ZWdvcnk6IG51bGwsXHJcbiAgICBmaWxlTmFtZTogbnVsbCxcclxuICAgIG1lbW9yeU51bWJlckVuZFJhbmdlOiBudWxsLFxyXG59O1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldFBlbmRpbmdTYXZlTWVtb3J5KCk6IFBlbmRpbmdTYXZlTWVtb3J5IHtcclxuICAgIHJldHVybiB7IC4uLnBlbmRpbmdTYXZlTWVtb3J5IH07XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRQZW5kaW5nU2F2ZU1lbW9yeShcclxuICAgIHVwZGF0ZXM6IFBhcnRpYWw8UGVuZGluZ1NhdmVNZW1vcnk+LFxyXG4pOiB2b2lkIHtcclxuICAgIHBlbmRpbmdTYXZlTWVtb3J5ID0ge1xyXG4gICAgICAgIC4uLnBlbmRpbmdTYXZlTWVtb3J5LFxyXG4gICAgICAgIC4uLnVwZGF0ZXMsXHJcbiAgICB9O1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gcmVzZXRQZW5kaW5nU2F2ZU1lbW9yeSgpOiB2b2lkIHtcclxuICAgIHBlbmRpbmdTYXZlTWVtb3J5ID0ge1xyXG4gICAgICAgIGFjdGl2ZTogZmFsc2UsXHJcbiAgICAgICAgbWVtb3J5TnVtYmVyOiBudWxsLFxyXG4gICAgICAgIGNhdGVnb3J5OiBudWxsLFxyXG4gICAgICAgIGZpbGVOYW1lOiBudWxsLFxyXG4gICAgICAgIG1lbW9yeU51bWJlckVuZFJhbmdlOiBudWxsLFxyXG4gICAgfTtcclxufVxyXG5cclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbi8vIE11bHRpcGxlIEVkaXQgQ29vcmRpbmF0b3JcclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcblxyXG5pbnRlcmZhY2UgQ29udmVyc2F0aW9uT3BlcmF0aW9uIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIHBhcmFtczogYW55O1xyXG59XHJcblxyXG5sZXQgY29udmVyc2F0aW9uT3BlcmF0aW9uczogQ29udmVyc2F0aW9uT3BlcmF0aW9uW10gPSBbXTtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBhZGRDb252ZXJzYXRpb25PcGVyYXRpb24oXHJcbiAgICBuYW1lOiBzdHJpbmcsXHJcbiAgICBwYXJhbXM6IGFueSxcclxuKTogdm9pZCB7XHJcbiAgICBjb252ZXJzYXRpb25PcGVyYXRpb25zLnB1c2goe1xyXG4gICAgICAgIG5hbWUsXHJcbiAgICAgICAgcGFyYW1zLFxyXG4gICAgfSk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRDb252ZXJzYXRpb25PcGVyYXRpb25zKCk6IENvbnZlcnNhdGlvbk9wZXJhdGlvbltdIHtcclxuICAgIHJldHVybiBjb252ZXJzYXRpb25PcGVyYXRpb25zO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gdGFrZUNvbnZlcnNhdGlvbk9wZXJhdGlvbnMoKTogQ29udmVyc2F0aW9uT3BlcmF0aW9uW10ge1xyXG4gICAgY29uc3Qgb3BlcmF0aW9ucyA9IFsuLi5jb252ZXJzYXRpb25PcGVyYXRpb25zXTtcclxuICAgIGNvbnZlcnNhdGlvbk9wZXJhdGlvbnMgPSBbXTtcclxuICAgIHJldHVybiBvcGVyYXRpb25zO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJDb252ZXJzYXRpb25PcGVyYXRpb25zKCk6IHZvaWQge1xyXG4gICAgY29udmVyc2F0aW9uT3BlcmF0aW9ucyA9IFtdO1xyXG59XHJcblxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuLy8gQ29udmVyc2F0aW9uIEZpbGUgTmFtZSAmIElDSUQgU3RhdGVzXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxubGV0IGNvbnZlcnNhdGlvbkZpbGVOYW1lID0gXCJcIjtcclxubGV0IGludGVybmFsQ2hhdElEID0gXCJcIjtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRDb252ZXJzYXRpb25GaWxlTmFtZSh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgY29udmVyc2F0aW9uRmlsZU5hbWUgPSBub3JtYWxpemVKc29uRmlsZU5hbWUodmFsdWUpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29udmVyc2F0aW9uRmlsZU5hbWUoKTogc3RyaW5nIHtcclxuICByZXR1cm4gY29udmVyc2F0aW9uRmlsZU5hbWU7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRJbnRlcm5hbENoYXRJRCh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgaW50ZXJuYWxDaGF0SUQgPSB2YWx1ZTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldEludGVybmFsQ2hhdElEKCk6IHN0cmluZyB7XHJcbiAgcmV0dXJuIGludGVybmFsQ2hhdElEO1xyXG59XHJcblxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuLy8gVW5pZmllZCBSRUdFWCBQYXR0ZXJuc1xyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuY29uc3QgU0FWRV9NRU1PUllfUkVHRVggPVxyXG4gICAgL1xcYig/OnNhdmV8c2F2fHN2ZXxzdnxzdG9yZXxyZW1lbWJlcnxwZXJzaXN0KVxccyooPzptZW1vcnl8bWVtfG1tfG1tcnl8bWVtcnl8bXJ5fG1teXxtZW15KVxccyooPzptZXNzYWdlfG1zZyk/XFxzKihcXGQrKS9pO1xyXG5cclxuY29uc3QgTVVMVElfU0FWRV9NRU1PUllfUkVHRVggPVxyXG4gICAgL1xcYig/OnNhdmV8c2F2fHN2ZXxzdnxzdG9yZXxyZW1lbWJlcnxwZXJzaXN0KVxccyooPzptZW1vcnl8bWVtfG1tfG1tcnl8bWVtcnl8bXJ5fG1teXxtZW15KVxccyooPzptZXNzYWdlfG1zZ3xtZXNzYWdlc3xtc2dzKT9cXHMqKFxcZCspXFxzKig/OnRocm91Z2h8dGhydXx0aHJ1Z2h8dGhydW9naHx0aG9ydWdofHRodXJvZ2h8dG98dG9vKVxccyooXFxkKykvaTtcclxuXHJcbi8vIE1ha2Ugc3VyZSB0aGlzIHNjcnViYmVyIGNvbmZvcm1zIHRvIHRoZSBleHBlY3RlZCB3b3JkcyB1c2VkIGluIHRoZSBzYXZlIGFuZCBtdWx0aSBzYXZlIG1lbW9yeSBwYXR0ZXJuc1xyXG5jb25zdCBDTEVBTl9VU0VSX0lOUFVUX1NBVkVfTUVNT1JZX1JFR0VYID1cclxuICAgIC9cXGIoPzpzYXZlfHNhdnxzdmV8c3Z8c3RvcmV8cmVtZW1iZXJ8cGVyc2lzdClcXHMqKD86bWVtb3J5fG1lbXxtbXxtbXJ5fG1lbXJ5fG1yeXxtbXl8bWVteSlcXHMqKD86bWVzc2FnZXxtc2d8bWVzc2FnZXN8bXNncyk/XFxzKlxcZCsoPzpcXHMqKD86dGhyb3VnaHx0aHJ1fHRocnVnaHx0aHJ1b2dofHRob3J1Z2h8dGh1cm9naHx0b3x0b28pXFxzKlxcZCspP1xccypbOywuXT9cXHMqL2dpO1xyXG5cclxuY29uc3QgQ0FURUdPUllfRVhUUkFDVF9SRUdFWCA9XHJcbiAgICAvXig/OnRoZVxccyspPyg/Om1lbW9yeXxtZW18bW18bW1yeXxtZW1yeXxtcnl8bW15fG1lbXkpP1xccyooPzpjYXRlZ29yeXxjYXRlZ3JveXxjYXRlZ2FyeXxjYXRlZ3J5fGNhdGdyeXxjYXRhZ29yeXxjYXRnb3J5fGNhdGVnb3kpXFxiXFxzKyg/OmlzXFxzKyk/KC4rKSQvaTtcclxuXHJcbmNvbnN0IE5BTUVfRVhUUkFDVF9SRUdFWCA9XHJcbiAgICAvXig/OnRoZVxccyspPyg/Om1lbW9yeXxtZW18bW18bW1yeXxtZW1yeXxtcnl8bW15fG1lbXkpP1xccyooPzpuYW1lfG5tYWV8bmFtfG5tZSlcXGJcXHMrKD86aXNcXHMrKT8oLispJC9pO1xyXG5cclxuY29uc3QgRVhJVF9TQVZFX01FTU9SWV9SRUdFWCA9XHJcbiAgICAvXFxiZXhpdFxcYlxccysoPzpzYXZlfHNhdnxzdmV8c3Z8c3RvcmV8cmVtZW1iZXJ8cGVyc2lzdClcXGJcXHMrKD86bWVtb3J5fG1lbXxtbXxtbXJ5fG1lbXJ5fG1yeXxtbXl8bWVteSlcXGIvaTtcclxuXHJcbmNvbnN0IFRBQkxFX09GX01FTU9SSUVTX1JFR0VYID0gbmV3IFJlZ0V4cChcclxuICAgIFN0cmluZy5yYXdgXFxiKD86dGFibGV8dGJsfHRibGV8dGFiZWx8dGFibGVzKVxccyooPzpvZlxccyopPyg/Om1lbW9yaWVzfG1lbW9yeXxtZW18bW18bW1yeXxtZW1yeXxtcnl8bW15fG1lbXl8bWVtcyl8KD86bWVtb3JpZXN8bWVtb3J5fG1lbXxtbXxtbXJ5fG1lbXJ5fG1yeXxtbXl8bWVteXxtZW1zKVxccyooPzp0YWJsZXx0Ymx8dGJsZXx0YWJlbHx0YWJsZXMpfFxcYnRvbVtfXFxzLV0qKD86JHt0b21SYW5nZVBhdHRlcm5zfSlcXGJgLFxyXG4gICAgXCJpXCIsXHJcbik7XHJcblxyXG4vLyBTZWNvbmQgY2hlY2sgdG8gZXh0cmFjdCB0aGUgYWxwaGFiZXQgcmFuZ2Ugb2YgdG9tIGZpbGVcclxuY29uc3QgTUVNT1JZX1JBTkdFX1JFR0VYID1cclxuICAgIC9cXGIoPzp0b21cXHMqW18tXT9cXHMqfCg/OnRhYmxlfHRibHx0YmxlfHRhYmVsfHRhYmxlcylcXHMqKD86b2ZcXHMqKT8oPzptZW1vcmllc3xtZW1vcnl8bWVtfG1tfG1tcnl8bWVtcnl8bXJ5fG1teXxtZW15fG1lbXMpXFxzKnwoPzptZW1vcmllc3xtZW1vcnl8bWVtfG1tfG1tcnl8bWVtcnl8bXJ5fG1teXxtZW15fG1lbXMpXFxzKyg/OnRhYmxlfHRibHx0YmxlfHRhYmVsfHRhYmxlcylcXHMqKShbYS16XVxccyotP1xccypbYS16XSlcXGIvaTtcclxuXHJcbi8vIEJvdGggXCJsb29rdXAgcGhyYXNlXCIgYW5kIFwibWVtb3J5IHBocmFzZVwiIG11c3QgYmUgcHJlc2VudCwgdGhleSBtYXkgYmUgdXAgdG8gNSB3b3JkcyBhcGFydFxyXG4vLyBUaGUgb3JkZXJpbmcgb2YgdGhlIGZldGNoIHBocmFzZSBhbmQgbWVtb3J5IHBocmFzZSBjYW4gYmUgcmV2ZXJzZWRcclxuLy8gVGhlIG1vZGVsIHdpbGwgYmUgYXNrZWQgdG8gaW50ZXJwcmV0IHlvdXIgcXVlcnlcclxuY29uc3QgRlVaWllfU0VBUkNIX01FTU9SWV9SRUdFWCA9XHJcbiAgICAvXFxiKD86KD86c2VhcmNofHNlcmNofHNyY2h8c2VhcmNoaW5nfGZpbmR8Zm5kfGxvb2t8bG9rfGxvb2tpbmd8ZmV0Y2h8ZmV0c2h8cmV0cmlldmV8cmV0cml2ZXxyZXRyZWl2ZXxyZWNhbGx8bG9jYXRlfGxjb2F0ZXxyZW1lbWJlcnxyZW1iZXJ8cmVjb2xsZWN0fHJlY29sbGVjdGluZ3xnZXR8Z3JhYnxwdWxsKVxcYig/OlxcVytcXHcrKXswLDV9XFxXK1xcYig/Om1lbW9yeXxtZW1vcmllc3xtZW18bW18bW1yeXxtZW1yeXxtcnl8bW15fG1lbXl8bWVtcylcXGJ8KD86bWVtb3J5fG1lbW9yaWVzfG1lbXxtbXxtbXJ5fG1lbXJ5fG1yeXxtbXl8bWVteXxtZW1zKVxcYig/OlxcVytcXHcrKXswLDV9XFxXK1xcYig/OnNlYXJjaHxzZXJjaHxzcmNofHNlYXJjaGluZ3xmaW5kfGZuZHxsb29rfGxva3xsb29raW5nfGZldGNofGZldHNofHJldHJpZXZlfHJldHJpdmV8cmV0cmVpdmV8cmVjYWxsfGxvY2F0ZXxsY29hdGV8cmVtZW1iZXJ8cmVtYmVyfHJlY29sbGVjdHxyZWNvbGxlY3Rpbmd8Z2V0fGdyYWJ8cHVsbClcXGIpL2k7XHJcblxyXG4vLyBOZWVkIGEgXCJmZXRjaCBwaHJhc2VcIiArIFwibWVtb3J5IHBocmFzZVwiICsgXCJjYXRlZ29yeS9uYW1lLmpzb25cIi5cclxuLy8gVGhlIG9yZGVyaW5nIG9mIHRoZSBmZXRjaCBwaHJhc2UgYW5kIG1lbW9yeSBwaHJhc2UgY2FuIGJlIHJldmVyc2VkXHJcbmNvbnN0IERJUkVDVF9GRVRDSF9NRU1PUllfUkVHRVggPVxyXG4gICAgL1xcYig/Oig/OmZldGNofGZldHNofHJldHJpZXZlfHJldHJpdmV8cmV0cmVpdmV8Z2V0fGdyYWJ8cHVsbClcXGIoPzpcXFcrXFx3Kyl7MCwzfVxcVytcXGIoPzptZW1vcnl8bWVtb3JpZXN8bWVtfG1tfG1tcnl8bWVtcnl8bXJ5fG1teXxtZW15fG1lbXMpP1xcYnwoPzptZW1vcnl8bWVtb3JpZXN8bWVtfG1tfG1tcnl8bWVtcnl8bXJ5fG1teXxtZW15fG1lbXMpP1xcYig/OlxcVytcXHcrKXswLDN9XFxXK1xcYig/OmZldGNofGZldHNofHJldHJpZXZlfHJldHJpdmV8cmV0cmVpdmV8Z2V0fGdyYWJ8cHVsbClcXGIpXFxXKyg/OlteL1xcXFwqXSt8XFwqKVxcLyg/OlteL1xcXFwqXSt8XFwqKVxcLmpzb25cXGIvaTtcclxuXHJcbmNvbnN0IENPTVBBQ1RJT05fU1VNTUFSWV9SRUdFWCA9XHJcbiAgICAvXFxiKD86KD86ZmV0Y2h8ZmV0c2h8cmV0cmlldmV8cmV0cml2ZXxyZXRyZWl2ZXxnZXR8Z3JhYnxwdWxsKVxcYig/OlxcVytcXHcrKXswLDN9XFxXKyg/OmNvbXBhY3Rpb258Y29tcGFjdG9ufGNvbXBhY3R8Y2FtcGFjdGlvbnxjYW1wYWN0dW58Y29tcGFjdHVufGNvbXBhY3Rlbnxjb21wYWN0aW9uc3xjb21wKT98KD86Y29tcGFjdGlvbnxjb21wYWN0b258Y29tcGFjdHxjYW1wYWN0aW9ufGNhbXBhY3R1bnxjb21wYWN0dW58Y29tcGFjdGVufGNvbXBhY3Rpb25zfGNvbXBhY3QpP1xcYig/OlxcVytcXHcrKXswLDN9XFxXKyg/OmZldGNofGZldHNofHJldHJpZXZlfHJldHJpdmV8cmV0cmVpdmV8Z2V0fGdyYWJ8cHVsbCkpXFxXK1tcXHcgLV0rX2NcXGQrX3BcXGQrXFwuanNvblxcYi9pO1xyXG5cclxuY29uc3QgQ09NUEFDVElPTl9LRVlXT1JEX1JFR0VYID1cclxuICAgIC9cXGIoPzpmZXRjaHxmZXRzaHxyZXRyaWV2ZXxyZXRyaXZlfHJldHJlaXZlfGdldHxncmFifHB1bGx8Y29tcGFjdGlvbnN8Y29tcGFjdGlvbnxjb21wYWN0b258Y2FtcGFjdGlvbnxjYW1wYWN0dW58Y29tcGFjdHVufGNvbXBhY3Rlbnxjb21wYWN0fGNvbXApXFxiL2lnO1xyXG5cclxuY29uc3QgTElTVF9DT01QQUNUSU9OX1NFRURTX1JFR0VYID1cclxuICAgIC9cXGJsaXN0XFxiKD86XFxXK1xcdyspezAsM31cXFcrXFxiKD86Y29tcGFjdGlvbnxjb21wYWN0b258Y29tcGFjdHxjYW1wYWN0aW9ufGNhbXBhY3R1bnxjb21wYWN0dW58Y29tcGFjdGVufGNvbXBhY3Rpb25zfGNvbXBhY3RzfGNhbXBhY3Rpb25zfGNhbXBhY3R1bnN8Y29tcGFjdHVuc3xjb21wYWN0ZW5zfGNvbXApP3M/XFxiXFxXK1xcYnNlZWRzP1xcYi9pO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldFNhdmVNZW1vcnlSZWdleCgpOiBSZWdFeHAge1xyXG4gICAgcmV0dXJuIFNBVkVfTUVNT1JZX1JFR0VYO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ2V0TXVsdGlTYXZlTWVtb3J5UmVnZXgoKTogUmVnRXhwIHtcclxuICAgIHJldHVybiBNVUxUSV9TQVZFX01FTU9SWV9SRUdFWDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldENhdGVnb3J5RXh0cmFjdFJlZ2V4KCk6IFJlZ0V4cCB7XHJcbiAgICByZXR1cm4gQ0FURUdPUllfRVhUUkFDVF9SRUdFWDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldE5hbWVFeHRyYWN0UmVnZXgoKTogUmVnRXhwIHtcclxuICAgIHJldHVybiBOQU1FX0VYVFJBQ1RfUkVHRVg7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRFeGl0U2F2ZU1lbW9yeVJlZ2V4KCk6IFJlZ0V4cCB7XHJcbiAgICByZXR1cm4gRVhJVF9TQVZFX01FTU9SWV9SRUdFWDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldENsZWFuVXNlcklucHV0U2F2ZU1lbW9yeVJlZ2V4KCk6IFJlZ0V4cCB7XHJcbiAgICByZXR1cm4gQ0xFQU5fVVNFUl9JTlBVVF9TQVZFX01FTU9SWV9SRUdFWDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldFRhYmxlT2ZNZW1vcmllc1JlZ2V4KCk6IFJlZ0V4cCB7XHJcbiAgICByZXR1cm4gVEFCTEVfT0ZfTUVNT1JJRVNfUkVHRVg7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRNZW1vcnlSYW5nZVJlZ2V4KCk6IFJlZ0V4cCB7XHJcbiAgICByZXR1cm4gTUVNT1JZX1JBTkdFX1JFR0VYO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ2V0RnV6enlTZWFyY2hSZWdleCgpOiBSZWdFeHAge1xyXG4gICAgcmV0dXJuIEZVWlpZX1NFQVJDSF9NRU1PUllfUkVHRVg7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXREaXJlY3RGZXRjaFJlZ2V4KCk6IFJlZ0V4cCB7XHJcbiAgICByZXR1cm4gRElSRUNUX0ZFVENIX01FTU9SWV9SRUdFWDtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbXBhY3Rpb25TdW1tYXJ5UmVnZXgoKTogUmVnRXhwIHtcclxuICAgIHJldHVybiBDT01QQUNUSU9OX1NVTU1BUllfUkVHRVg7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRDb21wYWN0aW9uS2V5d29yZFJlZ2V4KCk6IFJlZ0V4cCB7XHJcbiAgICByZXR1cm4gQ09NUEFDVElPTl9LRVlXT1JEX1JFR0VYO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ2V0TGlzdENvbXBhY3Rpb25TZWVkc1JlZ2V4KCk6IFJlZ0V4cCB7XHJcbiAgICByZXR1cm4gTElTVF9DT01QQUNUSU9OX1NFRURTX1JFR0VYO1xyXG59XHJcblxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuLy8gTE0gU1RVRElPIFJPT1QgRElSRUNUT1JZIE9WRVJSSURFXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxubGV0IHZhbGlkYXRlZExNU1Jvb3REaXJlY3RvcnkgPSBcIlwiO1xyXG5sZXQgdmFsaWRhdGVkQ29udmVyc2F0aW9uUm9vdERpcmVjdG9yeSA9IFwiXCI7XHJcbmxldCB2YWxpZGF0ZWRNZW1vcmllc1Jvb3REaXJlY3RvcnkgPSBcIlwiO1xyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHNldFZhbGlkYXRlZExNU1Jvb3REaXJlY3RvcnkodmFsdWU6IHN0cmluZyk6IHZvaWQge1xyXG4gIHZhbGlkYXRlZExNU1Jvb3REaXJlY3RvcnkgPSB2YWx1ZTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldFZhbGlkYXRlZExNU1Jvb3REaXJlY3RvcnkoKTogc3RyaW5nIHtcclxuICByZXR1cm4gdmFsaWRhdGVkTE1TUm9vdERpcmVjdG9yeTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHNldFZhbGlkYXRlZENvbnZlcnNhdGlvblJvb3REaXJlY3RvcnkodmFsdWU6IHN0cmluZyk6IHZvaWQge1xyXG4gIHZhbGlkYXRlZENvbnZlcnNhdGlvblJvb3REaXJlY3RvcnkgPSB2YWx1ZTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldFZhbGlkYXRlZENvbnZlcnNhdGlvblJvb3REaXJlY3RvcnkoKTogc3RyaW5nIHtcclxuICByZXR1cm4gdmFsaWRhdGVkQ29udmVyc2F0aW9uUm9vdERpcmVjdG9yeTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIHNldFZhbGlkYXRlZE1lbW9yaWVzUm9vdERpcmVjdG9yeSh2YWx1ZTogc3RyaW5nKTogdm9pZCB7XHJcbiAgdmFsaWRhdGVkTWVtb3JpZXNSb290RGlyZWN0b3J5ID0gdmFsdWU7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRWYWxpZGF0ZWRNZW1vcmllc1Jvb3REaXJlY3RvcnkoKTogc3RyaW5nIHtcclxuICByZXR1cm4gdmFsaWRhdGVkTWVtb3JpZXNSb290RGlyZWN0b3J5O1xyXG59XHJcblxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuLy8gVE9NIExhc3QgUmV0cmFjdGVkIEluZGV4XHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxubGV0IGxhc3RLbm93bkluZGV4T2ZSZXRyYWN0ZWRUb21zOiBudW1iZXIgfCBudWxsID0gbnVsbDtcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRMYXN0S25vd25JbmRleE9mUmV0cmFjdGVkVG9tcyh2YWx1ZTogbnVtYmVyIHwgbnVsbCk6IHZvaWQge1xyXG4gIGxhc3RLbm93bkluZGV4T2ZSZXRyYWN0ZWRUb21zID0gdmFsdWU7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRMYXN0S25vd25JbmRleE9mUmV0cmFjdGVkVG9tcygpOiBudW1iZXIgfCBudWxsIHtcclxuICByZXR1cm4gbGFzdEtub3duSW5kZXhPZlJldHJhY3RlZFRvbXM7XHJcbn1cclxuXHJcbi8vIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4vLyAvLyBDb21wYWN0aW9uXHJcbi8vIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxubGV0IGNvbnRleHRDbGVhbnVwUGx1Z2luSW5Vc2UgPSBmYWxzZTtcclxubGV0IGNvbnRleHRDbGVhbnVwQ29udmVyc2F0aW9uTmFtZSA9IFwiXCI7XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gc2V0Q29udGV4dENsZWFudXBQbHVnaW5JblVzZSh2YWx1ZTogYm9vbGVhbik6IHZvaWQge1xyXG4gIGNvbnRleHRDbGVhbnVwUGx1Z2luSW5Vc2UgPSB2YWx1ZTtcclxufVxyXG5cclxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbnRleHRDbGVhbnVwUGx1Z2luSW5Vc2UoKTogYm9vbGVhbiB7XHJcbiAgcmV0dXJuIGNvbnRleHRDbGVhbnVwUGx1Z2luSW5Vc2U7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBzZXRDb250ZXh0Q2xlYW51cENvbnZlcnNhdGlvbk5hbWUodmFsdWU6IHN0cmluZyk6IHZvaWQge1xyXG4gIGNvbnRleHRDbGVhbnVwQ29udmVyc2F0aW9uTmFtZSA9IHZhbHVlO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29udGV4dENsZWFudXBDb252ZXJzYXRpb25OYW1lKCk6IHN0cmluZyB7XHJcbiAgcmV0dXJuIGNvbnRleHRDbGVhbnVwQ29udmVyc2F0aW9uTmFtZTtcclxufSIsICJpbXBvcnQgdHlwZSB7IENoYXQsIENoYXRNZXNzYWdlIH0gZnJvbSBcIkBsbXN0dWRpby9zZGtcIjtcclxuaW1wb3J0IHsgZ2V0Q2xlYW5Vc2VySW5wdXRTYXZlTWVtb3J5UmVnZXggfSBmcm9tIFwiLi9jb25maWdcIjtcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgQ29udmVyc2F0aW9uTWVzc2FnZSB7XHJcbiAgICAvKipcclxuICAgICAqIEh1bWFuLWZhY2luZyBjb252ZXJzYXRpb24gbWVzc2FnZSBudW1iZXIuXHJcbiAgICAgKlxyXG4gICAgICogTWVzc2FnZSAxID0gZmlyc3QgdXNlciByZXF1ZXN0ICsgaXRzIGFzc2lzdGFudCByZXNwb25zZS5cclxuICAgICAqIE1lc3NhZ2UgMiA9IHNlY29uZCB1c2VyIHJlcXVlc3QgKyBpdHMgYXNzaXN0YW50IHJlc3BvbnNlLlxyXG4gICAgICovXHJcbiAgICBtZXNzYWdlTnVtYmVyOiBudW1iZXI7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBJbmRleCBvZiB0aGUgdW5kZXJseWluZyBDaGF0TWVzc2FnZSByZXR1cm5lZCBieVxyXG4gICAgICogaGlzdG9yeS5nZXRNZXNzYWdlc0FycmF5KCkuXHJcbiAgICAgKi9cclxuICAgIGFycmF5SW5kZXg6IG51bWJlcjtcclxuXHJcbiAgICByb2xlOiBcInVzZXJcIiB8IFwiYXNzaXN0YW50XCIgfCBcInN5c3RlbVwiIHwgXCJ1bmtub3duXCI7XHJcbiAgICBjb250ZW50OiBzdHJpbmc7XHJcbiAgICByYXc6IENoYXRNZXNzYWdlO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIEFzc2lzdGFudFJlc3BvbnNlIHtcclxuICAgIC8qKlxyXG4gICAgICogSHVtYW4tZmFjaW5nIGNvbnZlcnNhdGlvbiBtZXNzYWdlIG51bWJlci5cclxuICAgICAqL1xyXG4gICAgbWVzc2FnZU51bWJlcjogbnVtYmVyO1xyXG5cclxuICAgIC8qKlxyXG4gICAgICogSW5kZXggb2YgdGhlIHVuZGVybHlpbmcgYXNzaXN0YW50IENoYXRNZXNzYWdlLlxyXG4gICAgICovXHJcbiAgICBhcnJheUluZGV4OiBudW1iZXI7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBWaXNpYmxlIGFzc2lzdGFudCByZXNwb25zZS5cclxuICAgICAqL1xyXG4gICAgY29udGVudDogc3RyaW5nO1xyXG5cclxuICAgIHJhdzogQ2hhdE1lc3NhZ2U7XHJcbn1cclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgVXNlckludGVudGlvbkNhbmRpZGF0ZSB7XHJcbiAgICAvKipcclxuICAgICAqIEh1bWFuLWZhY2luZyBjb252ZXJzYXRpb24gbWVzc2FnZSBudW1iZXIuXHJcbiAgICAgKlxyXG4gICAgICogVGhpcyBjb3JyZXNwb25kcyB0byB0aGUgdXNlcidzIHJlcXVlc3QgbnVtYmVyLlxyXG4gICAgICovXHJcbiAgICBtZXNzYWdlTnVtYmVyOiBudW1iZXI7XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBJbmRleCBvZiB0aGUgdW5kZXJseWluZyB1c2VyIENoYXRNZXNzYWdlLlxyXG4gICAgICovXHJcbiAgICBhcnJheUluZGV4OiBudW1iZXI7XHJcblxyXG4gICAgY29udGVudDogc3RyaW5nO1xyXG4gICAgcmF3OiBDaGF0TWVzc2FnZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFJlYWRzIHRoZSBhY3RpdmUgY29udmVyc2F0aW9uIGFuZCBhc3NpZ25zIG1lc3NhZ2UgbnVtYmVyc1xyXG4gKiBhY2NvcmRpbmcgdG8gVVNFUiBtZXNzYWdlcyByYXRoZXIgdGhhbiByYXcgYXJyYXkgaW5kZXhlcy5cclxuICpcclxuICogRXhhbXBsZTpcclxuICpcclxuICogICBtZXNzYWdlc1swXSA9IHVzZXIgXCJoaVwiXHJcbiAqICAgbWVzc2FnZXNbMV0gPSBhc3Npc3RhbnQgXCJoZWxsb1wiXHJcbiAqICAgbWVzc2FnZXNbMl0gPSB1c2VyIFwid2hhdCBpcyB0b2RheSdzIGRhdGU/XCJcclxuICogICBtZXNzYWdlc1szXSA9IGFzc2lzdGFudCBcIi4uLlwiXHJcbiAqXHJcbiAqIGJlY29tZXM6XHJcbiAqXHJcbiAqICAgY29udmVyc2F0aW9uIG1lc3NhZ2UgMSA9IHVzZXIgXCJoaVwiICsgYXNzaXN0YW50IFwiaGVsbG9cIlxyXG4gKiAgIGNvbnZlcnNhdGlvbiBtZXNzYWdlIDIgPSB1c2VyIFwid2hhdCBpcyB0b2RheSdzIGRhdGU/XCIgKyBhc3Npc3RhbnQgXCIuLi5cIlxyXG4gKlxyXG4gKiBXZSBkZWxpYmVyYXRlbHkgZG8gbm90IGFzc3VtZSB0aGF0IHRoZSBhc3Npc3RhbnQgaXMgbG9jYXRlZFxyXG4gKiBhdCB1c2VySW5kZXggKyAxLiBMTSBTdHVkaW8ncyBTREsgQ2hhdCByZXByZXNlbnRhdGlvbiBtYXlcclxuICogY29udGFpbiBhZGRpdGlvbmFsIGVudHJpZXMuXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gcmVhZENvbnZlcnNhdGlvbihcclxuICAgIGhpc3Rvcnk6IENoYXQsXHJcbik6IENvbnZlcnNhdGlvbk1lc3NhZ2VbXSB7XHJcbiAgICBjb25zdCBtZXNzYWdlcyA9IGhpc3RvcnkuZ2V0TWVzc2FnZXNBcnJheSgpO1xyXG5cclxuICAgIGNvbnN0IGNvbnZlcnNhdGlvbjogQ29udmVyc2F0aW9uTWVzc2FnZVtdID0gW107XHJcbiAgICBsZXQgbWVzc2FnZU51bWJlciA9IDA7XHJcblxyXG4gICAgZm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IG1lc3NhZ2VzLmxlbmd0aDsgaW5kZXgrKykge1xyXG4gICAgICAgIGNvbnN0IHJhdyA9IG1lc3NhZ2VzW2luZGV4XTtcclxuICAgICAgICBjb25zdCByb2xlID0gbm9ybWFsaXplUm9sZShyYXcuZ2V0Um9sZSgpKTtcclxuXHJcbiAgICAgICAgaWYgKHJvbGUgIT09IFwidXNlclwiKSB7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbWVzc2FnZU51bWJlciArPSAxO1xyXG5cclxuICAgICAgICBjb252ZXJzYXRpb24ucHVzaCh7XHJcbiAgICAgICAgICAgIG1lc3NhZ2VOdW1iZXIsXHJcbiAgICAgICAgICAgIGFycmF5SW5kZXg6IGluZGV4LFxyXG4gICAgICAgICAgICByb2xlLFxyXG4gICAgICAgICAgICBjb250ZW50OiBleHRyYWN0VmlzaWJsZVRleHQocmF3KSxcclxuICAgICAgICAgICAgcmF3LFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBjb25zdCBhc3Npc3RhbnQgPSBmaW5kTmV4dEFzc2lzdGFudChcclxuICAgICAgICAgICAgbWVzc2FnZXMsXHJcbiAgICAgICAgICAgIGluZGV4ICsgMSxcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBpZiAoYXNzaXN0YW50KSB7XHJcbiAgICAgICAgICAgIGNvbnZlcnNhdGlvbi5wdXNoKHtcclxuICAgICAgICAgICAgICAgIG1lc3NhZ2VOdW1iZXIsXHJcbiAgICAgICAgICAgICAgICBhcnJheUluZGV4OiBhc3Npc3RhbnQuYXJyYXlJbmRleCxcclxuICAgICAgICAgICAgICAgIHJvbGU6IFwiYXNzaXN0YW50XCIsXHJcbiAgICAgICAgICAgICAgICBjb250ZW50OiBhc3Npc3RhbnQuY29udGVudCxcclxuICAgICAgICAgICAgICAgIHJhdzogYXNzaXN0YW50LnJhdyxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBjb252ZXJzYXRpb247XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRBc3Npc3RhbnRSZXNwb25zZShcclxuICAgIGhpc3Rvcnk6IENoYXQsXHJcbiAgICBtZXNzYWdlTnVtYmVyOiBudW1iZXIsXHJcbik6IEFzc2lzdGFudFJlc3BvbnNlIHtcclxuICAgIHZhbGlkYXRlTWVzc2FnZU51bWJlcihtZXNzYWdlTnVtYmVyKTtcclxuXHJcbiAgICBjb25zdCBtZXNzYWdlcyA9IGhpc3RvcnkuZ2V0TWVzc2FnZXNBcnJheSgpO1xyXG5cclxuICAgIGxldCBhc3Npc3RhbnRNZXNzYWdlTnVtYmVyID0gMDtcclxuXHJcbiAgICBmb3IgKGxldCBhcnJheUluZGV4ID0gMDsgYXJyYXlJbmRleCA8IG1lc3NhZ2VzLmxlbmd0aDsgYXJyYXlJbmRleCsrKSB7XHJcbiAgICAgICAgY29uc3QgbWVzc2FnZSA9IG1lc3NhZ2VzW2FycmF5SW5kZXhdO1xyXG5cclxuICAgICAgICBpZiAoIWlzRWxpZ2libGVBc3Npc3RhbnRNZXNzYWdlKG1lc3NhZ2UpKSB7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgYXNzaXN0YW50TWVzc2FnZU51bWJlcisrO1xyXG5cclxuICAgICAgICBpZiAoYXNzaXN0YW50TWVzc2FnZU51bWJlciAhPT0gbWVzc2FnZU51bWJlcikge1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGNsZWFuZWRDb250ZW50ID0gbWVzc2FnZS5nZXRUZXh0KCkucmVwbGFjZShcclxuICAgICAgICAgICAgL15bXFxzXFxTXSo/X19MTV9TVFVESU9fSU5URVJOQUxfTFNFUF9TWU5USEVUSUNfUkVBU09OSU5HX0VORF9bQS1aYS16MC05XStfXy9pLFxyXG4gICAgICAgICAgICBcIlwiLFxyXG4gICAgICAgIClcclxuXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgbWVzc2FnZU51bWJlcixcclxuICAgICAgICAgICAgYXJyYXlJbmRleCxcclxuICAgICAgICAgICAgY29udGVudDogY2xlYW5lZENvbnRlbnQsXHJcbiAgICAgICAgICAgIHJhdzogbWVzc2FnZSxcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIHRocm93IG5ldyBFcnJvcihcclxuICAgICAgICBgQXNzaXN0YW50IHJlc3BvbnNlICR7bWVzc2FnZU51bWJlcn0gZG9lcyBub3QgZXhpc3QuIGAgK1xyXG4gICAgICAgIGBUaGUgY29udmVyc2F0aW9uIGNvbnRhaW5zICR7YXNzaXN0YW50TWVzc2FnZU51bWJlcn0gZWxpZ2libGUgYXNzaXN0YW50IHJlc3BvbnNlKHMpLmAsXHJcbiAgICApO1xyXG59XHJcblxyXG4vLyBOb3cgaGFzIGEgZmFsbCBiYWNrIGJlY2F1c2UgaXNBc3Npc3RhbnRNZXNzYWdlIGlzIG5vdCBhIGZ1bmN0aW9uIGZvciB0aGUgbWVzc2FnZXMgd2Ugc3RvcmVkIGluIHRoZSBjb3B5IGZpbGVcclxuLy8gVGhlIGZpcnN0IHJvdXRlIGNoZWNrcyBpZiB0aGlzIGlzIGEgdmFsaWQgZnVuY3Rpb24gYXQgcnVudGltZSwgaWYgaXQgaXMsIGl0IHJ1bnMgdGhlIG9yaWdpbmFsIGZ1bmN0aW9uIFxyXG4vLyBmcm9tIGxtc3R1ZGlvLCBpZiBpdCBpc24ndCBpdCBmYWxscyBiYWNrIHRvIHRoZSBzZWNvbmQgdHlwZSBvZiBjaGVjayBmb3IgdGhlIGNvcHkgZmlsZS5cclxuZXhwb3J0IGZ1bmN0aW9uIGlzRWxpZ2libGVBc3Npc3RhbnRNZXNzYWdlKFxyXG4gICAgbWVzc2FnZTogQ2hhdE1lc3NhZ2UsXHJcbik6IGJvb2xlYW4ge1xyXG4gICAgY29uc3QgaXNBc3Npc3RhbnQgPVxyXG4gICAgICAgIHR5cGVvZiBtZXNzYWdlLmlzQXNzaXN0YW50TWVzc2FnZSA9PT0gXCJmdW5jdGlvblwiXHJcbiAgICAgICAgICAgID8gbWVzc2FnZS5pc0Fzc2lzdGFudE1lc3NhZ2UoKVxyXG4gICAgICAgICAgICA6IChtZXNzYWdlIGFzIGFueSkuZGF0YT8ucm9sZSA9PT0gXCJhc3Npc3RhbnRcIjtcclxuXHJcbiAgICBpZiAoIWlzQXNzaXN0YW50KSB7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGNvbnRlbnQgPSAobWVzc2FnZSBhcyBhbnkpLmRhdGE/LmNvbnRlbnQgPz8gW107XHJcblxyXG4gICAgcmV0dXJuICFjb250ZW50LnNvbWUoXHJcbiAgICAgICAgKGl0ZW06IGFueSkgPT4gaXRlbS50eXBlID09PSBcInRvb2xDYWxsUmVxdWVzdFwiLFxyXG4gICAgKTtcclxufVxyXG5cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRBc3Npc3RhbnRPdXRwdXQobWVzc2FnZTogQ2hhdE1lc3NhZ2UpOiBzdHJpbmcge1xyXG4gICAgY29uc3QgZGF0YSA9IChtZXNzYWdlIGFzIGFueSkuZGF0YTtcclxuXHJcbiAgICBpZiAoZGF0YT8ucm9sZSAhPT0gXCJhc3Npc3RhbnRcIikge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIk1lc3NhZ2UgaXMgbm90IGFuIGFzc2lzdGFudCBtZXNzYWdlLlwiKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCB0ZXh0Q29udGVudCA9IGRhdGEuY29udGVudFxyXG4gICAgICAgID8uZmlsdGVyKChpdGVtOiBhbnkpID0+IGl0ZW0udHlwZSA9PT0gXCJ0ZXh0XCIpXHJcbiAgICAgICAgPy5hdCgtMSk7XHJcblxyXG4gICAgaWYgKCF0ZXh0Q29udGVudD8udGV4dCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkFzc2lzdGFudCBtZXNzYWdlIG91dHB1dCBpcyBlbXB0eS5cIik7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHRleHRDb250ZW50LnRleHQ7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBSZXR1cm5zIGV2ZXJ5IGVhcmxpZXIgdXNlciByZXF1ZXN0IHRoYXQgY291bGQgcmVwcmVzZW50XHJcbiAqIHRoZSByb290IGludGVudGlvbiBiZWhpbmQgdGhlIHNlbGVjdGVkIGFzc2lzdGFudCByZXNwb25zZS5cclxuICovXHJcbmV4cG9ydCBmdW5jdGlvbiBnZXRQcmlvclVzZXJNZXNzYWdlcyhcclxuICAgIGhpc3Rvcnk6IENoYXQsXHJcbiAgICBhc3Npc3RhbnRNZXNzYWdlTnVtYmVyOiBudW1iZXIsXHJcbik6IFVzZXJJbnRlbnRpb25DYW5kaWRhdGVbXSB7XHJcbiAgICB2YWxpZGF0ZU1lc3NhZ2VOdW1iZXIoYXNzaXN0YW50TWVzc2FnZU51bWJlcik7XHJcblxyXG4gICAgY29uc3QgYXNzaXN0YW50ID0gZ2V0QXNzaXN0YW50UmVzcG9uc2UoXHJcbiAgICAgICAgaGlzdG9yeSxcclxuICAgICAgICBhc3Npc3RhbnRNZXNzYWdlTnVtYmVyLFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBtZXNzYWdlcyA9IGhpc3RvcnkuZ2V0TWVzc2FnZXNBcnJheSgpO1xyXG4gICAgY29uc3QgY2FuZGlkYXRlczogVXNlckludGVudGlvbkNhbmRpZGF0ZVtdID0gW107XHJcblxyXG4gICAgbGV0IHVzZXJNZXNzYWdlTnVtYmVyID0gMDtcclxuXHJcbiAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgYXNzaXN0YW50LmFycmF5SW5kZXg7IGluZGV4KyspIHtcclxuICAgICAgICBjb25zdCByYXcgPSBtZXNzYWdlc1tpbmRleF07XHJcbiAgICAgICAgY29uc3Qgcm9sZSA9IG5vcm1hbGl6ZVJvbGUocmF3LmdldFJvbGUoKSk7XHJcblxyXG4gICAgICAgIGlmIChyb2xlICE9PSBcInVzZXJcIikge1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHVzZXJNZXNzYWdlTnVtYmVyICs9IDE7XHJcblxyXG4gICAgICAgIGNhbmRpZGF0ZXMucHVzaCh7XHJcbiAgICAgICAgICAgIG1lc3NhZ2VOdW1iZXI6IHVzZXJNZXNzYWdlTnVtYmVyLFxyXG4gICAgICAgICAgICBhcnJheUluZGV4OiBpbmRleCxcclxuICAgICAgICAgICAgY29udGVudDogZXh0cmFjdFZpc2libGVUZXh0KHJhdyksXHJcbiAgICAgICAgICAgIHJhdyxcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gY2FuZGlkYXRlcztcclxufVxyXG5cclxuLyoqXHJcbiAqIEZpbmRzIHRoZSBmaXJzdCBhc3Npc3RhbnQgbWVzc2FnZSBhZnRlciBhIGdpdmVuIGFycmF5IHBvc2l0aW9uLlxyXG4gKlxyXG4gKiBXZSBpbnRlbnRpb25hbGx5IGRvIG5vdCBhc3N1bWUgaXQgaXMgaW1tZWRpYXRlbHkgYWRqYWNlbnQuXHJcbiAqL1xyXG5mdW5jdGlvbiBmaW5kTmV4dEFzc2lzdGFudChcclxuICAgIG1lc3NhZ2VzOiBDaGF0TWVzc2FnZVtdLFxyXG4gICAgc3RhcnRJbmRleDogbnVtYmVyLFxyXG4pOiB7XHJcbiAgICBhcnJheUluZGV4OiBudW1iZXI7XHJcbiAgICByYXc6IENoYXRNZXNzYWdlO1xyXG4gICAgY29udGVudDogc3RyaW5nO1xyXG59IHwgbnVsbCB7XHJcbiAgICBmb3IgKFxyXG4gICAgICAgIGxldCBpbmRleCA9IHN0YXJ0SW5kZXg7XHJcbiAgICAgICAgaW5kZXggPCBtZXNzYWdlcy5sZW5ndGg7XHJcbiAgICAgICAgaW5kZXgrK1xyXG4gICAgKSB7XHJcbiAgICAgICAgY29uc3QgcmF3ID0gbWVzc2FnZXNbaW5kZXhdO1xyXG4gICAgICAgIGNvbnN0IHJvbGUgPSBub3JtYWxpemVSb2xlKHJhdy5nZXRSb2xlKCkpO1xyXG5cclxuICAgICAgICBpZiAocm9sZSAhPT0gXCJhc3Npc3RhbnRcIikge1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSBleHRyYWN0VmlzaWJsZVRleHQocmF3KS50cmltKCk7XHJcblxyXG4gICAgICAgIGlmICghY29udGVudCkge1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB7XHJcbiAgICAgICAgICAgIGFycmF5SW5kZXg6IGluZGV4LFxyXG4gICAgICAgICAgICByYXcsXHJcbiAgICAgICAgICAgIGNvbnRlbnQsXHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gbnVsbDtcclxufVxyXG5cclxuLyoqXHJcbiAqIEV4dHJhY3RzIHZpc2libGUgdGV4dCBmcm9tIGFuIExNIFN0dWRpbyBDaGF0TWVzc2FnZS5cclxuICpcclxuICogZ2V0VGV4dCgpIGlzIHVzZWQgaW5zdGVhZCBvZiBtYW51YWxseSByZWFkaW5nIGludGVybmFsXHJcbiAqIG11bHRpLXN0ZXAgY29udGVudCBibG9ja3MuIFRoaXMga2VlcHMgdGhpbmtpbmcvcmVhc29uaW5nXHJcbiAqIG91dCBvZiB0aGUgTWVtb3J5IFNlZWQuXHJcbiAqL1xyXG5mdW5jdGlvbiBleHRyYWN0VmlzaWJsZVRleHQoXHJcbiAgICBtZXNzYWdlOiBDaGF0TWVzc2FnZSxcclxuKTogc3RyaW5nIHtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgcmV0dXJuIG1lc3NhZ2UuZ2V0VGV4dCgpO1xyXG4gICAgfSBjYXRjaCB7XHJcbiAgICAgICAgcmV0dXJuIFwiXCI7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIG5vcm1hbGl6ZVJvbGUoXHJcbiAgICByb2xlOiBzdHJpbmcsXHJcbik6IFwidXNlclwiIHwgXCJhc3Npc3RhbnRcIiB8IFwic3lzdGVtXCIgfCBcInVua25vd25cIiB7XHJcbiAgICBzd2l0Y2ggKHJvbGUpIHtcclxuICAgICAgICBjYXNlIFwidXNlclwiOlxyXG4gICAgICAgICAgICByZXR1cm4gXCJ1c2VyXCI7XHJcblxyXG4gICAgICAgIGNhc2UgXCJhc3Npc3RhbnRcIjpcclxuICAgICAgICAgICAgcmV0dXJuIFwiYXNzaXN0YW50XCI7XHJcblxyXG4gICAgICAgIGNhc2UgXCJzeXN0ZW1cIjpcclxuICAgICAgICAgICAgcmV0dXJuIFwic3lzdGVtXCI7XHJcblxyXG4gICAgICAgIGRlZmF1bHQ6XHJcbiAgICAgICAgICAgIHJldHVybiBcInVua25vd25cIjtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gdmFsaWRhdGVNZXNzYWdlTnVtYmVyKFxyXG4gICAgbWVzc2FnZU51bWJlcjogbnVtYmVyLFxyXG4pOiB2b2lkIHtcclxuICAgIGlmIChcclxuICAgICAgICAhTnVtYmVyLmlzSW50ZWdlcihtZXNzYWdlTnVtYmVyKSB8fFxyXG4gICAgICAgIG1lc3NhZ2VOdW1iZXIgPCAwXHJcbiAgICApIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXHJcbiAgICAgICAgICAgIGBJbnZhbGlkIG1lc3NhZ2UgbnVtYmVyIFwiJHttZXNzYWdlTnVtYmVyfVwiLiBgICtcclxuICAgICAgICAgICAgXCJDb252ZXJzYXRpb24gbWVzc2FnZSBudW1iZXJzIHN0YXJ0IGF0IDAuXCIsXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxufVxyXG5cclxuY29uc3QgU1lOVEhFVElDX1JFQVNPTklOR19FTkQgPVxyXG4gICAgL19fTE1fU1RVRElPX0lOVEVSTkFMX0xTRVBfU1lOVEhFVElDX1JFQVNPTklOR19FTkRfWzAtOWEtZl0rX18vZztcclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBjbGVhbkFzc2lzdGFudFJlc3BvbnNlKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgICBjb25zdCBtYXJrZXJNYXRjaGVzID0gWy4uLnRleHQubWF0Y2hBbGwoU1lOVEhFVElDX1JFQVNPTklOR19FTkQpXTtcclxuXHJcbiAgICBsZXQgY2xlYW5lZCA9IHRleHQ7XHJcblxyXG4gICAgaWYgKG1hcmtlck1hdGNoZXMubGVuZ3RoID4gMCkge1xyXG4gICAgICAgIGNvbnN0IGxhc3RNYXJrZXIgPSBtYXJrZXJNYXRjaGVzW21hcmtlck1hdGNoZXMubGVuZ3RoIC0gMV07XHJcblxyXG4gICAgICAgIGNvbnN0IGVuZEluZGV4ID1cclxuICAgICAgICAgICAgKGxhc3RNYXJrZXIuaW5kZXggPz8gMCkgKyBsYXN0TWFya2VyWzBdLmxlbmd0aDtcclxuXHJcbiAgICAgICAgY2xlYW5lZCA9IHRleHQuc2xpY2UoZW5kSW5kZXgpO1xyXG4gICAgfVxyXG4gICAgLy8gbGVmdCBmb3IgY29tcGF0aWJpbGl0eSBldmVuIHRob3VnaCB0aGlzIHBsdWdpbiBkb2VzIG5vdCB1c2UgdGhlIG1ldGhvZCB3aGVyZSB0aGlzIHdvdWxkIGhhdmUgY2xlYW5lZCBpdCB1cC5cclxuICAgIGNsZWFuZWQgPSBjbGVhbmVkLnJlcGxhY2UoXHJcbiAgICAgICAgL1xcbitcXCpcXCpcXCptZXNzYWdlIFxcZCtcXCpcXCpcXCpcXHMqJC8sXHJcbiAgICAgICAgXCJcIixcclxuICAgICk7XHJcblxyXG4gICAgcmV0dXJuIGNsZWFuZWQudHJpbSgpO1xyXG59XHJcblxyXG4vLyBQdXJwb3NlbHkgbGVmdCBGb3JtYXRpbmcgSW5zdHJ1Y3Rpb24gY2xlYW4gdXAgZm9yIGNvbXBhdGliaWxpdHkgZXZlbiB0aG91Z2ggdGhpcyBwbHVnaW4gZG9lcyBub3QgdXNlIGl0IGFueW1vcmUuXHJcbmV4cG9ydCBmdW5jdGlvbiBjbGVhblVzZXJJbnB1dCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgcmV0dXJuIHRleHRcclxuICAgICAgICAucmVwbGFjZShcclxuICAgICAgICAgICAgZ2V0Q2xlYW5Vc2VySW5wdXRTYXZlTWVtb3J5UmVnZXgoKSxcclxuICAgICAgICAgICAgXCJcIixcclxuICAgICAgICApXHJcbiAgICAgICAgLnJlcGxhY2UoXHJcbiAgICAgICAgICAgIC9cXFtCRUdJTk5JTkcgT0YgTUVNT1JJRVNcXF1bXFxzXFxTXSo/XFxbRU5EIE9GIE1FTU9SSUVTXFxdL2csXHJcbiAgICAgICAgICAgIFwiXCIsXHJcbiAgICAgICAgKVxyXG4gICAgICAgIC5yZXBsYWNlKFxyXG4gICAgICAgICAgICAvSWdub3JlIHRoaXMgSUNJRCB0YWdcXC4vZyxcclxuICAgICAgICAgICAgXCJcIixcclxuICAgICAgICApXHJcbiAgICAgICAgLnJlcGxhY2UoXHJcbiAgICAgICAgICAgIC9cXFtJQ0lEOlxccypcXGQrXFxdKD86XFxzK1xcLj8pP1xccyovZyxcclxuICAgICAgICAgICAgXCJcIixcclxuICAgICAgICApXHJcbiAgICAgICAgLnJlcGxhY2UoXHJcbiAgICAgICAgICAgIC9ST0xFUExBWTpbXFxzXFxTXSo/XFxbVXNlciBMYXN0IE1lc3NhZ2VcXF0vZyxcclxuICAgICAgICAgICAgXCJcIixcclxuICAgICAgICApXHJcbiAgICAgICAgLnJlcGxhY2UoXHJcbiAgICAgICAgICAgIC9ST0xFUExBWTpbXFxzXFxTXSo/XFwuXFwuXFwuJy9nLFxyXG4gICAgICAgICAgICBcIlwiLFxyXG4gICAgICAgIClcclxuICAgICAgICAudHJpbSgpO1xyXG59IiwgImltcG9ydCB0eXBlIHsgTE1TdHVkaW9DbGllbnQgfSBmcm9tIFwiQGxtc3R1ZGlvL3Nka1wiO1xyXG5pbXBvcnQgdHlwZSB7IENoYXQgfSBmcm9tIFwiQGxtc3R1ZGlvL3Nka1wiO1xyXG5pbXBvcnQgeyBpc01ldGFkYXRhT25seU91dHB1dCB9IGZyb20gXCIuL3RyaWdnZXJTYXZlTWVtb3J5XCI7XHJcblxyXG5pbXBvcnQge1xyXG4gICAgY2xlYW5Bc3Npc3RhbnRSZXNwb25zZSxcclxuICAgIGdldEFzc2lzdGFudFJlc3BvbnNlLFxyXG4gICAgZ2V0UHJpb3JVc2VyTWVzc2FnZXMsXHJcbiAgICB0eXBlIFVzZXJJbnRlbnRpb25DYW5kaWRhdGUsXHJcbn0gZnJvbSBcIi4vY29udmVyc2F0aW9uUmVhZGVyXCI7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIE1lbW9yeUFzc29jaWF0aW9uIHtcclxuICAgIGFzc2lzdGFudE1lc3NhZ2VOdW1iZXI6IG51bWJlcjtcclxuICAgIGFzc2lzdGFudFJlc3BvbnNlOiBzdHJpbmc7XHJcbiAgICByb290SW5wdXQ6IHN0cmluZztcclxuICAgIGRpcmVjdElucHV0OiBzdHJpbmc7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBEZXRlcm1pbmUgd2hpY2ggZWFybGllciB1c2VyIG1lc3NhZ2UgcmVwcmVzZW50cyB0aGUgb3JpZ2luYWwgaW50ZW50aW9uXHJcbiAqIGFzc29jaWF0ZWQgd2l0aCBhbiBhcHByb3ZlZCBhc3Npc3RhbnQgcmVzcG9uc2UuXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYXNzb2NpYXRlQXNzaXN0YW50UmVzcG9uc2UoXHJcbiAgICBjbGllbnQ6IExNU3R1ZGlvQ2xpZW50LFxyXG4gICAgaGlzdG9yeTogQ2hhdCxcclxuICAgIGFzc2lzdGFudE1lc3NhZ2VOdW1iZXI6IG51bWJlcixcclxuKTogUHJvbWlzZTxNZW1vcnlBc3NvY2lhdGlvbiB8IG51bGw+IHtcclxuXHJcbiAgICBpZiAoIWFzc2lzdGFudE1lc3NhZ2VOdW1iZXIpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXHJcbiAgICAgICAgICAgIGBBc3Npc3RhbnRNZXNzYWdlIyAke2Fzc2lzdGFudE1lc3NhZ2VOdW1iZXJ9IG5vdCBwcm92aWRlZC5gLFxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgYXNzaXN0YW50TXNnID0gZ2V0QXNzaXN0YW50UmVzcG9uc2UoXHJcbiAgICAgICAgaGlzdG9yeSxcclxuICAgICAgICBhc3Npc3RhbnRNZXNzYWdlTnVtYmVyLFxyXG4gICAgKTtcclxuICAgIFxyXG4gICAgLy8gRWFybHkgZXhpdCBpZiBhc3Npc3RhbnQgdGV4dCBpcyBqdXN0IHNhdmUgbWVtb3J5IG1vZGUgb3IgdG9tIG1vZGVcclxuICAgIGlmKGlzTWV0YWRhdGFPbmx5T3V0cHV0KGFzc2lzdGFudE1zZy5jb250ZW50KSkge1xyXG4gICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGNsZWFuZWRBc3Npc3RhbnRSZXNwb25zZSA9IGNsZWFuQXNzaXN0YW50UmVzcG9uc2UoYXNzaXN0YW50TXNnLmNvbnRlbnQpO1xyXG5cclxuICAgIGNvbnN0IGNhbmRpZGF0ZXMgPSBnZXRQcmlvclVzZXJNZXNzYWdlcyhcclxuICAgICAgICBoaXN0b3J5LFxyXG4gICAgICAgIGFzc2lzdGFudE1lc3NhZ2VOdW1iZXIsXHJcbiAgICApO1xyXG5cclxuICAgIGxldCByb290SW5wdXQgPSBcIlwiO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3Qgcm9vdFVzZXJNZXNzYWdlTnVtYmVyID1cclxuICAgICAgICAgICAgYXdhaXQgZGV0ZXJtaW5lT3JpZ2luYWxJbnRlbnRpb24oXHJcbiAgICAgICAgICAgICAgICBjbGllbnQsXHJcbiAgICAgICAgICAgICAgICBjbGVhbmVkQXNzaXN0YW50UmVzcG9uc2UsXHJcbiAgICAgICAgICAgICAgICBjYW5kaWRhdGVzLFxyXG4gICAgICAgICAgICApO1xyXG5cclxuICAgICAgICBjb25zdCByb290Q2FuZGlkYXRlID0gY2FuZGlkYXRlcy5maW5kKFxyXG4gICAgICAgICAgICAoY2FuZGlkYXRlKSA9PlxyXG4gICAgICAgICAgICAgICAgY2FuZGlkYXRlLm1lc3NhZ2VOdW1iZXIgPT09IHJvb3RVc2VyTWVzc2FnZU51bWJlcixcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBpZiAocm9vdENhbmRpZGF0ZSkge1xyXG4gICAgICAgICAgICByb290SW5wdXQgPSByb290Q2FuZGlkYXRlLmNvbnRlbnQ7XHJcbiAgICAgICAgfVxyXG4gICAgfSBjYXRjaCB7XHJcbiAgICAgICAgLy8gTGV0IGRvd25zdHJlYW0gbG9naWMgaGFuZGxlIGFuIHVuZGV0ZXJtaW5lZCByb290IGlucHV0LlxyXG4gICAgICAgIHJvb3RJbnB1dCA9IFwiXCI7XHJcbiAgICB9XHJcblxyXG4gICAgbGV0IGRpcmVjdElucHV0ID0gXCJcIjtcclxuXHJcbiAgICBjb25zdCBtZXNzYWdlcyA9IGhpc3RvcnkuZ2V0TWVzc2FnZXNBcnJheSgpO1xyXG5cclxuICAgIGZvciAoXHJcbiAgICAgICAgbGV0IGluZGV4ID0gYXNzaXN0YW50TXNnLmFycmF5SW5kZXggLSAxO1xyXG4gICAgICAgIGluZGV4ID49IDA7XHJcbiAgICAgICAgaW5kZXgtLVxyXG4gICAgKSB7XHJcbiAgICAgICAgY29uc3QgbWVzc2FnZSA9IG1lc3NhZ2VzW2luZGV4XTtcclxuXHJcbiAgICAgICAgaWYgKCFtZXNzYWdlLmlzVXNlck1lc3NhZ2UoKSkge1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGRpcmVjdElucHV0ID0gbWVzc2FnZS5nZXRUZXh0KCkgfHwgXCJcIjtcclxuICAgICAgICBicmVhaztcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIGFzc2lzdGFudE1lc3NhZ2VOdW1iZXIsXHJcbiAgICAgICAgYXNzaXN0YW50UmVzcG9uc2U6IGNsZWFuZWRBc3Npc3RhbnRSZXNwb25zZSxcclxuICAgICAgICByb290SW5wdXQsXHJcbiAgICAgICAgZGlyZWN0SW5wdXQsXHJcbiAgICB9O1xyXG59XHJcblxyXG4vKipcclxuICogQXNrIGEgbG9jYWwgTE0gU3R1ZGlvIG1vZGVsIHRvIGlkZW50aWZ5IHRoZSBvcmlnaW5hbCB1c2VyIGludGVudGlvbi5cclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIGRldGVybWluZU9yaWdpbmFsSW50ZW50aW9uKFxyXG4gICAgY2xpZW50OiBMTVN0dWRpb0NsaWVudCxcclxuICAgIGFzc2lzdGFudFJlc3BvbnNlOiBzdHJpbmcsXHJcbiAgICBjYW5kaWRhdGVzOiBVc2VySW50ZW50aW9uQ2FuZGlkYXRlW10sXHJcbik6IFByb21pc2U8bnVtYmVyPiB7XHJcbiAgICBjb25zdCBtb2RlbCA9IGF3YWl0IGNsaWVudC5sbG0ubW9kZWwoKTtcclxuXHJcbiAgICBjb25zdCBjYW5kaWRhdGVUZXh0ID0gY2FuZGlkYXRlc1xyXG4gICAgICAgIC5tYXAoXHJcbiAgICAgICAgICAgIChjYW5kaWRhdGUpID0+XHJcbiAgICAgICAgICAgICAgICBgVVNFUiBNRVNTQUdFICR7Y2FuZGlkYXRlLm1lc3NhZ2VOdW1iZXJ9OlxcbmAgK1xyXG4gICAgICAgICAgICAgICAgY2FuZGlkYXRlLmNvbnRlbnQsXHJcbiAgICAgICAgKVxyXG4gICAgICAgIC5qb2luKFwiXFxuXFxuLS0tXFxuXFxuXCIpO1xyXG5cclxuICAgIGNvbnN0IHByb21wdCA9IGBcclxuICAgICAgICBDaG9vc2UgdGhlIFJPT1QgSU5QVVQgZm9yIHRoZSBhcHByb3ZlZCBhc3Npc3RhbnQgcmVzcG9uc2UuXHJcblxyXG4gICAgICAgIFRoZSByb290IGlucHV0IGlzIHRoZSBlYXJsaWVzdCB1c2VyIG1lc3NhZ2UgdGhhdCBlc3RhYmxpc2hlZCB0aGUgdXNlcidzIG92ZXJhbGwgZ29hbCBvciBjdXJpb3NpdHkuXHJcblxyXG4gICAgICAgIFJvb3QgaW5wdXRzIGFyZSBub3QgZm9sbG93LXVwcywgY2xhcmlmaWNhdGlvbnMsIGNvcnJlY3Rpb25zLCByZWZpbmVtZW50cywgaW1wbGVtZW50YXRpb24gc3RlcHMsIG9yIHN1Yi10b3BpY3MuXHJcblxyXG4gICAgICAgIENob29zZSBhIGxhdGVyIG1lc3NhZ2Ugb25seSB3aGVuIGl0IGVzdGFibGlzaGVzIGEgZ2VudWluZWx5IG5ldyB0b3BpYyBiZXlvbmQgdGhlIHNjb3BlIG9mIHRoZSBvdmVyYWxsIGdvYWwgb3IgY3VyaW9zaXR5LlxyXG5cclxuICAgICAgICBSZXR1cm4gT05MWSB0aGUgVVNFUiBNRVNTQUdFIE5VTUJFUi5cclxuXHJcbiAgICAgICAgQVBQUk9WRUQgQVNTSVNUQU5UIFJFU1BPTlNFOlxyXG4gICAgICAgICR7YXNzaXN0YW50UmVzcG9uc2V9XHJcblxyXG4gICAgICAgIFVTRVIgTUVTU0FHRVM6XHJcbiAgICAgICAgJHtjYW5kaWRhdGVUZXh0fVxyXG5cclxuICAgICAgICBST09UIFVTRVIgTUVTU0FHRSBOVU1CRVI6XHJcbiAgICAgICAgYC50cmltKCk7XHJcblxyXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgbW9kZWwucmVzcG9uZChwcm9tcHQsIHtcclxuICAgICAgICB0ZW1wZXJhdHVyZTogMCxcclxuICAgIH0pO1xyXG5cclxuICAgIGNvbnN0IHJhdyA9IHJlc3VsdC5jb250ZW50LnRyaW0oKTtcclxuICAgIGNvbnN0IGNsZWFuZWQgPSBjbGVhbkFzc2lzdGFudFJlc3BvbnNlKHJhdyk7XHJcblxyXG4gICAgY29uc3QgbWF0Y2ggPSBjbGVhbmVkLm1hdGNoKC9cXGIoXFxkKylcXGIvKTtcclxuXHJcbiAgICBpZiAoIW1hdGNoKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICAgICAgICBgVGhlIGFzc29jaWF0aW9uIG1vZGVsIGRpZCBub3QgcmV0dXJuIGEgdmFsaWQgbWVzc2FnZSBudW1iZXIuIGAgK1xyXG4gICAgICAgICAgICBgTW9kZWwgcmV0dXJuZWQ6ICR7cmF3fWAsXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBzZWxlY3RlZE51bWJlciA9IE51bWJlcihtYXRjaFsxXSk7XHJcblxyXG4gICAgY29uc3QgZXhpc3RzID0gY2FuZGlkYXRlcy5zb21lKFxyXG4gICAgICAgIChjYW5kaWRhdGUpID0+XHJcbiAgICAgICAgICAgIGNhbmRpZGF0ZS5tZXNzYWdlTnVtYmVyID09PSBzZWxlY3RlZE51bWJlcixcclxuICAgICk7XHJcblxyXG4gICAgaWYgKCFleGlzdHMpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXHJcbiAgICAgICAgICAgIGBUaGUgYXNzb2NpYXRpb24gbW9kZWwgc2VsZWN0ZWQgbWVzc2FnZSAke3NlbGVjdGVkTnVtYmVyfSwgYCArXHJcbiAgICAgICAgICAgIFwiYnV0IHRoYXQgaXMgbm90IG9uZSBvZiB0aGUgYXZhaWxhYmxlIHByaW9yIHVzZXIgbWVzc2FnZXMuXCIsXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gc2VsZWN0ZWROdW1iZXI7XHJcbn0iLCAiaW1wb3J0IHsgbWVtb3J5U3RvcmUgfSBmcm9tIFwiLi9tZW1vcnlTdG9yZVwiO1xyXG5pbXBvcnQgdHlwZSB7IE1lbW9yeVNlZWQgfSBmcm9tIFwiLi9tZW1vcnlTdG9yZVwiO1xyXG5pbXBvcnQgeyBnZXRDdXJyZW50Q29udmVyc2F0aW9uSGlzdG9yeSB9IGZyb20gXCIuL2NvbnZlcnNhdGlvbkhpc3RvcnlDYWNoZVwiO1xyXG5pbXBvcnQgeyBhc3NvY2lhdGVBc3Npc3RhbnRSZXNwb25zZSB9IGZyb20gXCIuL21lbW9yeUFzc29jaWF0aW9uXCI7XHJcbmltcG9ydCB7IGNsZWFuVXNlcklucHV0IH0gZnJvbSBcIi4vY29udmVyc2F0aW9uUmVhZGVyXCJcclxuaW1wb3J0IHR5cGUgeyBDaGF0TWVzc2FnZSB9IGZyb20gXCJAbG1zdHVkaW8vc2RrXCI7XHJcblxyXG5pbXBvcnQge1xyXG4gICAgYWRkQ29udmVyc2F0aW9uT3BlcmF0aW9uLFxyXG4gICAgZ2V0Q29udHJvbGxlcixcclxuICAgIHNldFBlbmRpbmdTYXZlTWVtb3J5LFxyXG4gICAgZ2V0UGVuZGluZ1NhdmVNZW1vcnksXHJcbiAgICByZXNldFBlbmRpbmdTYXZlTWVtb3J5LFxyXG4gICAgUGVuZGluZ1NhdmVNZW1vcnksXHJcbiAgICBnZXRDYXRlZ29yeUV4dHJhY3RSZWdleCxcclxuICAgIGdldE5hbWVFeHRyYWN0UmVnZXgsXHJcbiAgICBnZXRFeGl0U2F2ZU1lbW9yeVJlZ2V4LFxyXG4gICAgZ2V0U2F2ZU1lbW9yeVJlZ2V4LFxyXG4gICAgZ2V0TXVsdGlTYXZlTWVtb3J5UmVnZXgsXHJcbiAgICBjb25maWdTY2hlbWF0aWNzLFxyXG59IGZyb20gXCIuL2NvbmZpZ1wiXHJcblxyXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuLy8gS0VZV09SRCBSRUdFWEVTXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxuLy8gU2F2ZS1tZW1vcnkgY29tbWFuZC5cclxuY29uc3QgU0FWRV9NRU1PUllfUkVHRVggPSBnZXRTYXZlTWVtb3J5UmVnZXgoKTtcclxuXHJcbmNvbnN0IE1VTFRJX1NBVkVfTUVNT1JZX1JFR0VYID0gZ2V0TXVsdGlTYXZlTWVtb3J5UmVnZXgoKTtcclxuXHJcbmNvbnN0IENBVEVHT1JZX0VYVFJBQ1RfUkVHRVggPSBnZXRDYXRlZ29yeUV4dHJhY3RSZWdleCgpO1xyXG5cclxuY29uc3QgTkFNRV9FWFRSQUNUX1JFR0VYID0gZ2V0TmFtZUV4dHJhY3RSZWdleCgpO1xyXG5cclxuY29uc3QgRVhJVF9TQVZFX01FTU9SWV9SRUdFWCA9IGdldEV4aXRTYXZlTWVtb3J5UmVnZXgoKTtcclxuXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4vLyBGSUVMRCBFWFRSQUNUSU9OXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxuZnVuY3Rpb24gZXh0cmFjdENhdGVnb3J5KHNlZ21lbnQ6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xyXG4gICAgY29uc3QgbWF0Y2ggPSBzZWdtZW50Lm1hdGNoKENBVEVHT1JZX0VYVFJBQ1RfUkVHRVgpO1xyXG4gICAgcmV0dXJuIG1hdGNoPy5bMV0/LnRyaW0oKSA/PyBudWxsO1xyXG59XHJcblxyXG4vLyByZWplY3Qgd2lsZGNhcmQgdHJ5aW5nIHRvIGJlIHVzZWQgYXMgYSBuYW1lXHJcbmZ1bmN0aW9uIGV4dHJhY3RGaWxlTmFtZShcclxuICAgIHNlZ21lbnQ6IHN0cmluZyxcclxuKTogc3RyaW5nIHwgbnVsbCB7XHJcblxyXG4gICAgY29uc3QgbWF0Y2ggPVxyXG4gICAgICAgIHNlZ21lbnQubWF0Y2goTkFNRV9FWFRSQUNUX1JFR0VYKTtcclxuXHJcbiAgICBjb25zdCBmaWxlTmFtZSA9XHJcbiAgICAgICAgbWF0Y2g/LlsxXT8udHJpbSgpID8/IG51bGw7XHJcblxyXG4gICAgaWYgKFxyXG4gICAgICAgIGZpbGVOYW1lID09PSBcIipcIiB8fFxyXG4gICAgICAgIGZpbGVOYW1lID09PSBcIiouanNvblwiXHJcbiAgICApIHtcclxuICAgICAgICByZXR1cm4gbnVsbDtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZmlsZU5hbWU7XHJcbn1cclxuXHJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4vLyBSRVNVTFQgVFlQRVNcclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcblxyXG5pbnRlcmZhY2UgU2F2ZU1lbW9yeVJlc3VsdCB7XHJcbiAgICBhY3Rpb246IFwibm9uZVwiIHwgXCJ3YWl0aW5nXCIgfCBcInNhdmVkXCI7XHJcblxyXG4gICAgbWlzc2luZz86IHtcclxuICAgICAgICBtZW1vcnlOdW1iZXI6IGJvb2xlYW47XHJcbiAgICAgICAgY2F0ZWdvcnk6IGJvb2xlYW47XHJcbiAgICAgICAgZmlsZU5hbWU6IGJvb2xlYW47XHJcbiAgICB9O1xyXG5cclxuICAgIGN1cnJlbnQ/OiB7XHJcbiAgICAgICAgbWVtb3J5TnVtYmVyOiBudW1iZXIgfCBudWxsO1xyXG4gICAgICAgIGNhdGVnb3J5OiBzdHJpbmcgfCBudWxsO1xyXG4gICAgICAgIGZpbGVOYW1lOiBzdHJpbmcgfCBudWxsO1xyXG4gICAgfTtcclxufVxyXG5cclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbi8vIE1BSU4gTUVTU0FHRSBQUk9DRVNTT1JcclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc01lc3NhZ2VGb3JTYXZlTWVtb3J5KFxyXG4gICAgdXNlclRleHQ6IHN0cmluZyxcclxuICAgIG1lc3NhZ2VzOiBDaGF0TWVzc2FnZVtdLFxyXG4gICAgZW5hYmxlVG9vbHNNb2RlOiBib29sZWFuLFxyXG4pOiBQcm9taXNlPFNhdmVNZW1vcnlSZXN1bHQ+IHtcclxuXHJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgLy8gQ2hlY2sgd2hldGhlciB0aGlzIG1lc3NhZ2UgY29udGFpbnMgYW4gZXhpdCBjb21tYW5kXHJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuICAgIGNvbnN0IGV4aXRNYXRjaCA9IHVzZXJUZXh0Lm1hdGNoKEVYSVRfU0FWRV9NRU1PUllfUkVHRVgpO1xyXG4gICAgXHJcbiAgICBjb25zdCBleGl0UmVxdWVzdGVkID0gZXhpdE1hdGNoICE9PSBudWxsPyB0cnVlIDogZmFsc2U7XHJcblxyXG4gICAgaWYgKGVuYWJsZVRvb2xzTW9kZSAmJiBleGl0UmVxdWVzdGVkKSB7XHJcbiAgICAgICAgcmVzZXRQZW5kaW5nU2F2ZU1lbW9yeSgpO1xyXG4gICAgfVxyXG5cclxuICAgIGlmICghZW5hYmxlVG9vbHNNb2RlKSB7XHJcbiAgICAgICAgLy8gSWYgdGhlIGxhc3QgYXNzaXN0YW50IG1lc3NhZ2Ugd2FzIGFuIGluY29tcGxldGUgc2F2ZSBjb21tYW5kLCBhbmQgdGhlIHBsdWdpbi9jaGF0IHRpbWVkIG91dCBiZWZvcmUgY29tcGxldGlvblxyXG4gICAgICAgIC8vIHdlIHJlLWVuYWJsZSB0aGUgc2F2ZSBtZW1vcnkgbW9kZSBhcyB0aGUgYXNzaXN0YW50J3MgbmV4dCBtZXNzYWdlLlxyXG4gICAgICAgIGNvbnN0IHJlaW5pdGlhbGl6ZWRJbmNvbXBsZXRlZFNhdmVDb21tYW5kID0gYXdhaXQgc2Nhbkhpc3RvcnlGb3JJbmNvbXBsZXRlU2F2ZU1lbW9yeUNvbW1hbmQodXNlclRleHQsIG1lc3NhZ2VzKTtcclxuXHJcbiAgICAgICAgaWYocmVpbml0aWFsaXplZEluY29tcGxldGVkU2F2ZUNvbW1hbmQpIHtcclxuICAgICAgICAgICAgdXNlclRleHQgPSBleGl0UmVxdWVzdGVkXHJcbiAgICAgICAgICAgID8gdXNlclRleHQgXHJcbiAgICAgICAgICAgIDogcmVpbml0aWFsaXplZEluY29tcGxldGVkU2F2ZUNvbW1hbmQ7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICAvLyBDaGVjayB3aGV0aGVyIHRoaXMgbWVzc2FnZSBjb250YWlucyBhIHNhdmUtbWVtb3J5IGNvbW1hbmQuXHJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuICAgIGNvbnN0IHNhdmVNYXRjaCA9IHVzZXJUZXh0Lm1hdGNoKFNBVkVfTUVNT1JZX1JFR0VYKTtcclxuXHJcbiAgICBpZiAoc2F2ZU1hdGNoKSB7XHJcbiAgICAgICAgc2V0UGVuZGluZ1NhdmVNZW1vcnkoe1xyXG4gICAgICAgICAgICBhY3RpdmU6IHRydWUsXHJcbiAgICAgICAgICAgIG1lbW9yeU51bWJlcjogTnVtYmVyKHNhdmVNYXRjaFsxXSksXHJcbiAgICAgICAgICAgIG1lbW9yeU51bWJlckVuZFJhbmdlOiBudWxsLFxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICAvLyBDaGVjayB3aGV0aGVyIHRoaXMgbWVzc2FnZSBjb250YWlucyBhIHNhdmUtbWVtb3J5IHJhbmdlIG9mIG1lc3NhZ2VzIGNvbW1hbmQuXHJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuICAgIGNvbnN0IG11bHRpU2F2ZU1hdGNoID0gdXNlclRleHQubWF0Y2goTVVMVElfU0FWRV9NRU1PUllfUkVHRVgpO1xyXG5cclxuICAgIGlmIChtdWx0aVNhdmVNYXRjaCkge1xyXG4gICAgICAgIGNvbnN0IHN0YXJ0TWVtb3J5TnVtYmVyID0gTnVtYmVyKG11bHRpU2F2ZU1hdGNoWzFdKTtcclxuICAgICAgICBjb25zdCBlbmRNZW1vcnlOdW1iZXIgPSBOdW1iZXIobXVsdGlTYXZlTWF0Y2hbMl0pO1xyXG5cclxuICAgICAgICBzZXRQZW5kaW5nU2F2ZU1lbW9yeSh7XHJcbiAgICAgICAgICAgIGFjdGl2ZTogdHJ1ZSxcclxuICAgICAgICAgICAgbWVtb3J5TnVtYmVyOiBzdGFydE1lbW9yeU51bWJlcixcclxuICAgICAgICAgICAgbWVtb3J5TnVtYmVyRW5kUmFuZ2U6IGVuZE1lbW9yeU51bWJlcixcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgLy8gSWYgd2UncmUgbm90IGN1cnJlbnRseSBpbiBzYXZlLW1lbW9yeSBtb2RlLFxyXG4gICAgLy8gZG9uJ3QgaW50ZXJwcmV0IGNhdGVnb3J5L25hbWUgYXMgc2F2ZS1tZW1vcnkgZmllbGRzLlxyXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbiAgICBjb25zdCBjdXJyZW50ID0gZ2V0UGVuZGluZ1NhdmVNZW1vcnkoKTtcclxuXHJcbiAgICBpZiAoIWN1cnJlbnQuYWN0aXZlKSB7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgYWN0aW9uOiBcIm5vbmVcIixcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG5cclxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICAvLyBTcGxpdCBmaWVsZHMgdXNpbmcgdGhlIHN1cHBvcnRlZCBkZWxpbWl0ZXJzLlxyXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbiAgICBjb25zdCBzZWdtZW50czogc3RyaW5nW10gPSB1c2VyVGV4dFxyXG4gICAgICAgIC5zcGxpdCgvWzssLl0vKVxyXG4gICAgICAgIC5tYXAoKHNlZ21lbnQ6IHN0cmluZykgPT4gc2VnbWVudC50cmltKCkpXHJcbiAgICAgICAgLmZpbHRlcigoc2VnbWVudDogc3RyaW5nKSA9PiBzZWdtZW50Lmxlbmd0aCA+IDApO1xyXG5cclxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICAvLyBQcm9jZXNzIGVhY2ggc2VnbWVudC5cclxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG4gICAgZm9yIChjb25zdCBzZWdtZW50IG9mIHNlZ21lbnRzKSB7XHJcblxyXG4gICAgICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAgICAgICAvLyBDQVRFR09SWVxyXG4gICAgICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbiAgICAgICAgY29uc3QgY2F0ZWdvcnkgPSBleHRyYWN0Q2F0ZWdvcnkoc2VnbWVudCk7XHJcblxyXG4gICAgICAgIGlmIChjYXRlZ29yeSAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBzZXRQZW5kaW5nU2F2ZU1lbW9yeSh7XHJcbiAgICAgICAgICAgICAgICBjYXRlZ29yeSxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgICAgIC8vIE5BTUVcclxuICAgICAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG4gICAgICAgIGNvbnN0IGZpbGVOYW1lID0gZXh0cmFjdEZpbGVOYW1lKHNlZ21lbnQpO1xyXG5cclxuICAgICAgICBpZiAoZmlsZU5hbWUgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgc2V0UGVuZGluZ1NhdmVNZW1vcnkoe1xyXG4gICAgICAgICAgICAgICAgZmlsZU5hbWUsXHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gR2V0IHVwZGF0ZWQgc3RhdGVcclxuICAgIGNvbnN0IHVwZGF0ZWQgPSBnZXRQZW5kaW5nU2F2ZU1lbW9yeSgpO1xyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBERVRFUk1JTkUgV0hBVCBJUyBTVElMTCBNSVNTSU5HXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG5cclxuICAgIGNvbnN0IG1pc3NpbmcgPSB7XHJcbiAgICAgICAgbWVtb3J5TnVtYmVyOiB1cGRhdGVkLm1lbW9yeU51bWJlciA9PT0gbnVsbCxcclxuICAgICAgICBjYXRlZ29yeTogdXBkYXRlZC5jYXRlZ29yeSA9PT0gbnVsbCxcclxuICAgICAgICBmaWxlTmFtZTogdXBkYXRlZC5maWxlTmFtZSA9PT0gbnVsbCxcclxuICAgIH07XHJcblxyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBFVkVSWVRISU5HIElTIFBSRVNFTlQgKE11bHRpIFNlZWQgU2F2ZSlcclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcblxyXG4gICAgaWYgKFxyXG4gICAgICAgIHVwZGF0ZWQubWVtb3J5TnVtYmVyICE9PSBudWxsICYmXHJcbiAgICAgICAgdXBkYXRlZC5jYXRlZ29yeSAhPT0gbnVsbCAmJlxyXG4gICAgICAgIHVwZGF0ZWQuZmlsZU5hbWUgIT09IG51bGwgJiZcclxuICAgICAgICB1cGRhdGVkLm1lbW9yeU51bWJlckVuZFJhbmdlICE9PSBudWxsXHJcbiAgICApIHtcclxuICAgICAgICBjb25zdCBzYXZlZE1lbW9yeVN0YXR1cyA9IGF3YWl0IG11bHRpU2F2ZU1lbW9yeSh1cGRhdGVkKTtcclxuXHJcbiAgICAgICAgYXdhaXQgYXBwZW5kU2F2ZU1lbW9yeVRleHRBdEVuZE9mQ29udmVyc2F0aW9uSnNvbihleGl0UmVxdWVzdGVkLCB1cGRhdGVkLCBlbmFibGVUb29sc01vZGUsIHNhdmVkTWVtb3J5U3RhdHVzKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgYWN0aW9uOiBcInNhdmVkXCIsXHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gRVZFUllUSElORyBJUyBQUkVTRU5UIChTaW5nbGUgU2VlZCBTYXZlKVxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuXHJcbiAgICBpZiAoXHJcbiAgICAgICAgdXBkYXRlZC5tZW1vcnlOdW1iZXIgIT09IG51bGwgJiZcclxuICAgICAgICB1cGRhdGVkLmNhdGVnb3J5ICE9PSBudWxsICYmXHJcbiAgICAgICAgdXBkYXRlZC5maWxlTmFtZSAhPT0gbnVsbCAmJlxyXG4gICAgICAgIHVwZGF0ZWQubWVtb3J5TnVtYmVyRW5kUmFuZ2UgPT09IG51bGxcclxuICAgICkge1xyXG4gICAgICAgIGNvbnN0IHNhdmVkTWVtb3J5U3RhdHVzID0gYXdhaXQgc2F2ZU1lbW9yeSh1cGRhdGVkKTtcclxuXHJcbiAgICAgICAgYXdhaXQgYXBwZW5kU2F2ZU1lbW9yeVRleHRBdEVuZE9mQ29udmVyc2F0aW9uSnNvbihleGl0UmVxdWVzdGVkLCB1cGRhdGVkLCBlbmFibGVUb29sc01vZGUsIHNhdmVkTWVtb3J5U3RhdHVzKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgYWN0aW9uOiBcInNhdmVkXCIsXHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gU1RJTEwgV0FJVElORyBGT1IgU09NRVRISU5HXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgXHJcbiAgICBhd2FpdCBhcHBlbmRTYXZlTWVtb3J5VGV4dEF0RW5kT2ZDb252ZXJzYXRpb25Kc29uKGV4aXRSZXF1ZXN0ZWQsIHVwZGF0ZWQsIGVuYWJsZVRvb2xzTW9kZSk7XHJcblxyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBhY3Rpb246IFwid2FpdGluZ1wiLFxyXG5cclxuICAgICAgICBtaXNzaW5nLFxyXG5cclxuICAgICAgICBjdXJyZW50OiB7XHJcbiAgICAgICAgICAgIG1lbW9yeU51bWJlcjogdXBkYXRlZC5tZW1vcnlOdW1iZXIsXHJcbiAgICAgICAgICAgIGNhdGVnb3J5OiB1cGRhdGVkLmNhdGVnb3J5LFxyXG4gICAgICAgICAgICBmaWxlTmFtZTogdXBkYXRlZC5maWxlTmFtZSxcclxuICAgICAgICB9LFxyXG4gICAgfTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEZsb3cgaXMgcHJvbXB0IHByZXByb2Nlc3NvciBcdTIxOTIgYXBwZW5kU2F2ZU1lbW9yeVRleHRBdEVuZE9mQ29udmVyc2F0aW9uSnNvbiBcdTIxOTIgbXVsdGlFZGl0Q29vcmRpbmF0b3JcclxuICogXHUyMTkyIHRyeUFwcGVuZFNhdmVNZW1vcnlUZXh0QXRFbmRPZkNvbnZlcnNhdGlvbkpzb25GdW5jdGlvbiBcdTIxOTIgc3RyaW5nIGNvbnN0cnVjdG9ycyBcdTIxOTIgZWRpdEFzc2lzdGFudFJlc3BvbnNlIFx1MjE5MlxyXG4gKiAoYWxsIGZpZWxkcyBnaXZlbikgXHUyMTkyIHNhdmVNZW1vcnkgXHUyMTkyIGFwcGVuZFNhdmVNZW1vcnlUZXh0QXRFbmRPZkNvbnZlcnNhdGlvbkpzb24gXHUyMTkyIHRyeUFwcGVuZFNhdmVNZW1vcnlUZXh0QXRFbmRPZkNvbnZlcnNhdGlvbkpzb25GdW5jdGlvblxyXG4gKiBcdTIxOTIgbXVsdGlFZGl0Q29vcmRpbmF0b3IoY29udmVyc2F0aW9uLmpzb24gd3JpdGUpXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBhcHBlbmRTYXZlTWVtb3J5VGV4dEF0RW5kT2ZDb252ZXJzYXRpb25Kc29uKFxyXG4gICAgZXhpdFJlcXVlc3RlZDogYm9vbGVhbixcclxuICAgIHBlbmRpbmdTYXZlTWVtb3J5OiBQZW5kaW5nU2F2ZU1lbW9yeSxcclxuICAgIGVuYWJsZVRvb2xzTW9kZTogYm9vbGVhbixcclxuICAgIHNhdmVkTWVtb3J5U3RhdHVzPzogYm9vbGVhbixcclxuKTogUHJvbWlzZTx2b2lkPiB7XHJcblxyXG4gICAgaWYgKGVuYWJsZVRvb2xzTW9kZSkgcmV0dXJuO1xyXG4gICAgLy8gUXVldWluZyBzYXZlIG1lbW9yeSBsb2dpYyB0byB3cml0ZSBjb252ZXJzYXRpb24uanNvblxyXG4gICAgLy8gUGFzc2luZyBwYXJhbXMgcmVxdWlyZWQgYnkgY2hpbGRyZW4gZnVuY3Rpb25zIG92ZXJcclxuICAgIGFkZENvbnZlcnNhdGlvbk9wZXJhdGlvbihcclxuICAgICAgICBcInRyeUFwcGVuZFNhdmVNZW1vcnlUZXh0QXRFbmRPZkNvbnZlcnNhdGlvbkpzb25GdW5jdGlvblwiLFxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgZXhpdFJlcXVlc3RlZCxcclxuICAgICAgICAgICAgcGVuZGluZ1NhdmVNZW1vcnksXHJcbiAgICAgICAgICAgIHNhdmVkTWVtb3J5U3RhdHVzLFxyXG4gICAgICAgIH0sXHJcbiAgICApO1xyXG5cclxuICAgIC8vPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8gQ09ERSBOT1cgUlVOUyBGUk9NIG11bHRpRWRpdENvb3JkaW5hdG9yLnRzXHJcbiAgICAvLz09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxufVxyXG5cclxuLyoqXHJcbiAqIG11bHRpRWRpdENvb3JkaW5hdG9yIGNhbGxzIHRoaXMgZnVuY3Rpb25cclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB0cnlBcHBlbmRTYXZlTWVtb3J5VGV4dEF0RW5kT2ZDb252ZXJzYXRpb25Kc29uRnVuY3Rpb24oXHJcbiAgICBleGl0UmVxdWVzdGVkOiBib29sZWFuLFxyXG4gICAgbGF0ZXN0Q29udmVyc2F0aW9uOiBhbnksXHJcbiAgICBwZW5kaW5nU2F2ZU1lbW9yeTogUGVuZGluZ1NhdmVNZW1vcnksXHJcbiAgICB0YXJnZXRBc3Npc3RhbnRNZXNzYWdlSW5kZXg6IG51bWJlcixcclxuICAgIHNhdmVkTWVtb3J5U3RhdHVzPzogYm9vbGVhbixcclxuKTogUHJvbWlzZTx2b2lkPiB7XHJcblxyXG4gICAgbGV0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuICAgIC8vIEV4aXQgU2F2ZSBNZW1vcnkgU3RhdGVcclxuICAgIGlmKGV4aXRSZXF1ZXN0ZWQgPT09IHRydWUpIHtcclxuICAgICAgICBsaW5lcyA9IChhd2FpdCBjb25zdHJ1Y3RBc3Npc3RhbnRSZXBseVNhdmVNZW1vcnlFeGl0KHBlbmRpbmdTYXZlTWVtb3J5KSk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAgIC8vIENhdGVnb3J5IG9yIEZpbGUgTmFtZSBmaWVsZHMgbWlzc2luZyBwYXRoXHJcbiAgICAgICAgaWYoXHJcbiAgICAgICAgICAgIHBlbmRpbmdTYXZlTWVtb3J5LmNhdGVnb3J5ID09PSBudWxsIHx8XHJcbiAgICAgICAgICAgIHBlbmRpbmdTYXZlTWVtb3J5LmZpbGVOYW1lID09PSBudWxsXHJcbiAgICAgICAgKSB7XHJcbiAgICAgICAgICAgIGxpbmVzID0gKGF3YWl0IGNvbnN0cnVjdEFzc2lzdGFudFJlcGx5Rm9yTWlzc2luZ0ZpZWxkcyhwZW5kaW5nU2F2ZU1lbW9yeSkpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU2F2aW5nIE1lbW9yeSBTdWNjZXNzIHBhdGhcclxuICAgICAgICBpZihwZW5kaW5nU2F2ZU1lbW9yeS5jYXRlZ29yeSAhPT0gbnVsbCAmJlxyXG4gICAgICAgICAgICBwZW5kaW5nU2F2ZU1lbW9yeS5maWxlTmFtZSAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBsaW5lcyA9IChhd2FpdCBjb25zdHJ1Y3RBc3Npc3RhbnRSZXBseVNhdmVNZW1vcnkocGVuZGluZ1NhdmVNZW1vcnkpKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFNhdmluZyBwcm9jZXNzIGZhaWxlZCBwYXRoXHJcbiAgICAgICAgaWYgKHNhdmVkTWVtb3J5U3RhdHVzID09PSBmYWxzZSkge1xyXG4gICAgICAgICAgICBsaW5lcyA9IChhd2FpdCBjb25zdHJ1Y3RBc3Npc3RhbnRSZXBseVNhdmVNZW1vcnlOb3RoaW5nVG9TYXZlKHBlbmRpbmdTYXZlTWVtb3J5KSk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICBhd2FpdCBlZGl0QXNzaXN0YW50UmVzcG9uc2UoXHJcbiAgICAgICAgbGF0ZXN0Q29udmVyc2F0aW9uLFxyXG4gICAgICAgIGxpbmVzLmpvaW4oXCJcXG5cXG5cIiksXHJcbiAgICAgICAgdGFyZ2V0QXNzaXN0YW50TWVzc2FnZUluZGV4LFxyXG4gICAgKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGVkaXRBc3Npc3RhbnRSZXNwb25zZShcclxuICAgIGNvbnZlcnNhdGlvbjogYW55LFxyXG4gICAgcmVwbGFjZW1lbnRUZXh0OiBzdHJpbmcsXHJcbiAgICB0YXJnZXRBc3Npc3RhbnRNZXNzYWdlSW5kZXg6IG51bWJlcixcclxuICAgIGFwcGVuZEluc3RlYWQ/OiBib29sZWFuLFxyXG4pOiBQcm9taXNlPHZvaWQ+IHtcclxuXHJcbiAgICAvLyBGaW5kIHRoZSBsYXN0IGFzc2lzdGFudCBtZXNzYWdlXHJcbiAgICBjb25zdCBhc3Npc3RhbnRNZXNzYWdlID0gY29udmVyc2F0aW9uLm1lc3NhZ2VzW3RhcmdldEFzc2lzdGFudE1lc3NhZ2VJbmRleF07XHJcblxyXG4gICAgaWYgKCFhc3Npc3RhbnRNZXNzYWdlKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTm8gYXNzaXN0YW50IG1lc3NhZ2UgZm91bmQuXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEdldCB0aGUgbGFzdCB2ZXJzaW9uXHJcbiAgICBjb25zdCBhc3Npc3RhbnRWZXJzaW9uID1cclxuICAgICAgICBhc3Npc3RhbnRNZXNzYWdlPy52ZXJzaW9ucz8uW1xyXG4gICAgICAgICAgICBhc3Npc3RhbnRNZXNzYWdlLmN1cnJlbnRseVNlbGVjdGVkID8/IDBcclxuICAgICAgICBdO1xyXG4gICAgICAgIFxyXG4gICAgaWYgKCFhc3Npc3RhbnRWZXJzaW9uKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQXNzaXN0YW50IG1lc3NhZ2UgaGFzIG5vIHZlcnNpb25zLlwiKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBSZW1vdmUgdGhpbmtpbmcgc3RlcHNcclxuICAgIGFzc2lzdGFudFZlcnNpb24uc3RlcHMgPSBhc3Npc3RhbnRWZXJzaW9uLnN0ZXBzLmZpbHRlcihcclxuICAgICAgICAoc3RlcDogYW55KSA9PiBzdGVwLnN0eWxlPy50eXBlICE9PSBcInRoaW5raW5nXCIsXHJcbiAgICApO1xyXG5cclxuICAgIC8vIEZpbmQgdGhlIGFzc2lzdGFudCByZXNwb25zZSBzdGVwXHJcbiAgICBjb25zdCByZXNwb25zZVN0ZXAgPSBhc3Npc3RhbnRWZXJzaW9uLnN0ZXBzLmZpbmQoXHJcbiAgICAgICAgKHN0ZXA6IGFueSkgPT5cclxuICAgICAgICAgICAgc3RlcC50eXBlID09PSBcImNvbnRlbnRCbG9ja1wiICYmXHJcbiAgICAgICAgICAgIHN0ZXAuZ2VuSW5mbyAhPT0gdW5kZWZpbmVkICYmXHJcbiAgICAgICAgICAgIHN0ZXAuY29udGVudD8uc29tZShcclxuICAgICAgICAgICAgICAgIChjb250ZW50QmxvY2s6IGFueSkgPT4gY29udGVudEJsb2NrLnR5cGUgPT09IFwidGV4dFwiLFxyXG4gICAgICAgICAgICApLFxyXG4gICAgKTtcclxuXHJcbiAgICBpZiAoIXJlc3BvbnNlU3RlcCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkIG5vdCBmaW5kIGFzc2lzdGFudCByZXNwb25zZSBzdGVwLlwiKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBGaW5kIHRoZSBhY3R1YWwgdGV4dCBjb250ZW50IGJsb2NrXHJcbiAgICBjb25zdCB0ZXh0QmxvY2sgPSByZXNwb25zZVN0ZXAuY29udGVudC5maW5kKFxyXG4gICAgICAgIChjb250ZW50QmxvY2s6IGFueSkgPT4gY29udGVudEJsb2NrLnR5cGUgPT09IFwidGV4dFwiLFxyXG4gICAgKTtcclxuXHJcbiAgICBpZiAoIXRleHRCbG9jaykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvdWxkIG5vdCBmaW5kIGFzc2lzdGFudCByZXNwb25zZSB0ZXh0LlwiKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyB0aGUgYXBwZW5kaW5zdGVhZCBwYXRoIGlzIGlmIHdlIGFyZSBhcHBseWluZyB0aGUgY29tcGFjdGlvbiB0cmFpbCB0byB0aGVcclxuICAgIC8vIGZpcnN0IGFzc2lzdGFudCdzIG1lc3NhZ2UuIFRoaXMgcmVtb3ZlcyB0aGUgb2xkIHRyYWlsIGFuZCBwcmVzZXJ2ZXMgdGhlIG9yaWdpbmFsIHVzZXIgbWVzc2FnZVxyXG4gICAgLy8gQWxzbyB0aGUgXHVEODNEXHVERUE4IHNob3VsZCBub3QgY2F1c2UgdGhpcyBmaXJzdCBhc3NpdGFudCBtZXNzYWdlIHRvIGJlIGZpbHRlcmVkIG91dCBhcyBtZXRhZGF0YVxyXG4gICAgLy8gYmVjYXVzZSB0aGUgYXBwZW5kaW5nIG9ubHkgaGFwcGVucyBhZnRlciB0aGUgb3JpZ2luYWwgbWVzc2FnZSBoYXMgYmVlbiBwcm9jZXNzZWQgYW5kIHNhdmVkIHRvIHBhcnQxLlxyXG4gICAgaWYgKGFwcGVuZEluc3RlYWQpIHtcclxuICAgICAgICBjb25zdCBzdGFydE1hcmtlciA9IHRleHRCbG9jay50ZXh0LmluZGV4T2YoXCJcdUQ4M0RcdURFQThcIik7XHJcbiAgICAgICAgY29uc3QgZW5kTWFya2VyID0gdGV4dEJsb2NrLnRleHQuaW5kZXhPZihcclxuICAgICAgICAgICAgXCJcdTJCMDdcdUZFMEZbQXNzaXN0YW50IE1lc3NhZ2VdXHUyQjA3XHVGRTBGXCIsXHJcbiAgICAgICAgICAgIHN0YXJ0TWFya2VyLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGlmIChzdGFydE1hcmtlciAhPT0gLTEgJiYgZW5kTWFya2VyICE9PSAtMSkge1xyXG4gICAgICAgICAgICB0ZXh0QmxvY2sudGV4dCA9XHJcbiAgICAgICAgICAgICAgICB0ZXh0QmxvY2sudGV4dC5zbGljZSgwLCBzdGFydE1hcmtlcikgK1xyXG4gICAgICAgICAgICAgICAgdGV4dEJsb2NrLnRleHQuc2xpY2UoXHJcbiAgICAgICAgICAgICAgICAgICAgZW5kTWFya2VyICsgXCJcdTJCMDdcdUZFMEZbQXNzaXN0YW50IE1lc3NhZ2VdXHUyQjA3XHVGRTBGXCIubGVuZ3RoLFxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRleHRCbG9jay50ZXh0ID0gdGV4dEJsb2NrLnRleHRcclxuICAgICAgICAgICAgPyBgJHtyZXBsYWNlbWVudFRleHR9XFxuXFxuJHt0ZXh0QmxvY2sudGV4dH1gXHJcbiAgICAgICAgICAgIDogcmVwbGFjZW1lbnRUZXh0O1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBSZXBsYWNlIHRoZSBhc3Npc3RhbnQncyByZXNwb25zZVxyXG4gICAgICAgIHRleHRCbG9jay50ZXh0ID0gcmVwbGFjZW1lbnRUZXh0O1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2F2ZU1lbW9yeShcclxuICAgIHVwZGF0ZWQ6IFBlbmRpbmdTYXZlTWVtb3J5XHJcbik6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgY29uc3QgY3RsID0gZ2V0Q29udHJvbGxlcigpO1xyXG4gICAgY29uc3QgZW5hYmxlVG9vbHNNb2RlID0gY3RsLmdldFBsdWdpbkNvbmZpZyhjb25maWdTY2hlbWF0aWNzKS5nZXQoXCJlbmFibGVUb29sc01vZGVcIikgYXMgYm9vbGVhbjtcclxuXHJcbiAgICBjb25zdCB7IG1lbW9yeU51bWJlciwgY2F0ZWdvcnksIGZpbGVOYW1lIH0gPSB1cGRhdGVkO1xyXG5cclxuICAgIGlmIChcclxuICAgICAgICBtZW1vcnlOdW1iZXIgPT09IG51bGwgfHxcclxuICAgICAgICBjYXRlZ29yeSA9PT0gbnVsbCB8fFxyXG4gICAgICAgIGZpbGVOYW1lID09PSBudWxsXHJcbiAgICApIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IGhpc3RvcnkgPSBhd2FpdCBnZXRDdXJyZW50Q29udmVyc2F0aW9uSGlzdG9yeSgpO1xyXG5cclxuICAgICAgICBjb25zdCBhc3NvY2lhdGlvbiA9IGF3YWl0IGFzc29jaWF0ZUFzc2lzdGFudFJlc3BvbnNlKFxyXG4gICAgICAgICAgICBjdGwuY2xpZW50LFxyXG4gICAgICAgICAgICBoaXN0b3J5LFxyXG4gICAgICAgICAgICBtZW1vcnlOdW1iZXIsXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgLy8gRG8gbm90IHNhdmUgbWVtb3J5IGlmIGFzc2lzdGFudCBtZXNzYWdlIHdhcyBtZXRhZGF0YSBvbmx5XHJcbiAgICAgICAgaWYgKGFzc29jaWF0aW9uID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEFkZGVkIHNvbWUgdG9sZXJhbmNlIGJlY2F1c2UgdXNlcnMgdGVjaG5pY2FsbHkgY291bGQgZGVsZXRlIGFsbFxyXG4gICAgICAgIC8vIHRoZWlyIHVzZXIgbWVzc2FnZXMgYmVmb3JlIGFza2luZyB0aGUgbW9kZWwgdG8gc2F2ZSBhIG1lbW9yeVxyXG4gICAgICAgIGNvbnN0IGNsZWFuZWRSb290SW5wdXQgPVxyXG4gICAgICAgICAgICBjbGVhblVzZXJJbnB1dChhc3NvY2lhdGlvbi5yb290SW5wdXQ/LnRyaW0oKSk7XHJcblxyXG4gICAgICAgIGNvbnN0IHJvb3RJbnB1dCA9IGNsZWFuZWRSb290SW5wdXQgIT09IFwiXCJcclxuICAgICAgICAgICAgPyBjbGVhbmVkUm9vdElucHV0XHJcbiAgICAgICAgICAgIDogXCJvcmlnaW5hbCB1c2VyIGludGVudGlvbi90b3BpYyB3YXMgZnVsbHkgc2NydWJiZWRcIjtcclxuXHJcbiAgICAgICAgY29uc3QgY2xlYW5lZERpcmVjdElucHV0ID1cclxuICAgICAgICAgICAgY2xlYW5Vc2VySW5wdXQoYXNzb2NpYXRpb24uZGlyZWN0SW5wdXQ/LnRyaW0oKSk7XHJcblxyXG4gICAgICAgIGNvbnN0IGRpcmVjdElucHV0ID0gY2xlYW5lZERpcmVjdElucHV0ICE9PSBcIlwiXHJcbiAgICAgICAgICAgID8gY2xlYW5lZERpcmVjdElucHV0XHJcbiAgICAgICAgICAgIDogXCJvcmlnaW5hbCB1c2VyIG1lc3NhZ2Ugd2FzIGZ1bGx5IHNjcnViYmVkXCI7XHJcblxyXG4gICAgICAgIGF3YWl0IG1lbW9yeVN0b3JlLnNhdmVTZWVkKFxyXG4gICAgICAgICAgICBjYXRlZ29yeSxcclxuICAgICAgICAgICAgZmlsZU5hbWUsXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgIGRhdGU6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgICAgIHJvb3RfaW5wdXQ6IHJvb3RJbnB1dCxcclxuICAgICAgICAgICAgICAgIGRpcmVjdF9pbnB1dDogZGlyZWN0SW5wdXQsXHJcbiAgICAgICAgICAgICAgICBvdXRwdXQ6IGFzc29jaWF0aW9uLmFzc2lzdGFudFJlc3BvbnNlLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBtZW1vcnlOdW1iZXIsXHJcbiAgICAgICAgKTtcclxuICAgICAgICBpZighZW5hYmxlVG9vbHNNb2RlKSB7XHJcbiAgICAgICAgICAgIC8vIFdyaXRlIHRvIGNvbnZlcnNhdGlvbi5qc29uIGEgc2F2ZSBtZXNzYWdlIGNvbnRlbnQgYmxvY2tcclxuICAgICAgICAgICAgYXdhaXQgYXBwZW5kU2F2ZU1lbW9yeVRleHRBdEVuZE9mQ29udmVyc2F0aW9uSnNvbihmYWxzZSwgdXBkYXRlZCwgZW5hYmxlVG9vbHNNb2RlKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcclxuICAgICAgICAgICAgXCJFcnJvciBjcmVhdGluZyBNZW1vcnkgU2VlZDogXCIgK1xyXG4gICAgICAgICAgICBgJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuXHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgIHJlc2V0UGVuZGluZ1NhdmVNZW1vcnkoKTtcclxuICAgIH1cclxufVxyXG5cclxuLy8gc2ltcGxlIGJvb2xlYW4gcmV0dXJuIHRydWUgc3VjY2VzcyBpZiBzb21ldGhpbmcgc2F2ZWQsIGZhbHNlIGZhaWx1cmUgYmVjYXVzZSBtZXNzYWdlcyB3ZXJlIGluZWxpZ2libGVcclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG11bHRpU2F2ZU1lbW9yeShcclxuICAgIHVwZGF0ZWQ6IFBlbmRpbmdTYXZlTWVtb3J5LFxyXG4pOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgIGNvbnN0IGN0bCA9IGdldENvbnRyb2xsZXIoKTtcclxuICAgIGNvbnN0IGVuYWJsZVRvb2xzTW9kZSA9IGN0bC5nZXRQbHVnaW5Db25maWcoY29uZmlnU2NoZW1hdGljcykuZ2V0KFwiZW5hYmxlVG9vbHNNb2RlXCIpIGFzIGJvb2xlYW47XHJcblxyXG4gICAgY29uc3Qge1xyXG4gICAgICAgIG1lbW9yeU51bWJlcjogc3RhcnRNZW1vcnlOdW1iZXIsXHJcbiAgICAgICAgbWVtb3J5TnVtYmVyRW5kUmFuZ2U6IGVuZE1lbW9yeU51bWJlcixcclxuICAgICAgICBjYXRlZ29yeSxcclxuICAgICAgICBmaWxlTmFtZSxcclxuICAgIH0gPSB1cGRhdGVkO1xyXG5cclxuICAgIGlmIChcclxuICAgICAgICBzdGFydE1lbW9yeU51bWJlciA9PSBudWxsIHx8XHJcbiAgICAgICAgZW5kTWVtb3J5TnVtYmVyID09IG51bGwgfHxcclxuICAgICAgICBjYXRlZ29yeSA9PSBudWxsIHx8XHJcbiAgICAgICAgZmlsZU5hbWUgPT0gbnVsbFxyXG4gICAgKSB7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgaGlzdG9yeSA9IGF3YWl0IGdldEN1cnJlbnRDb252ZXJzYXRpb25IaXN0b3J5KCk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgY29uc3Qgc2VlZHM6IE1lbW9yeVNlZWRbXSA9IFtdO1xyXG5cclxuICAgICAgICBmb3IgKFxyXG4gICAgICAgICAgICBsZXQgbWVtb3J5TnVtYmVyID0gc3RhcnRNZW1vcnlOdW1iZXI7XHJcbiAgICAgICAgICAgIG1lbW9yeU51bWJlciA8PSBlbmRNZW1vcnlOdW1iZXI7XHJcbiAgICAgICAgICAgIG1lbW9yeU51bWJlcisrXHJcbiAgICAgICAgKSB7XHJcbiAgICAgICAgICAgIGxldCBhc3NvY2lhdGlvbjtcclxuXHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBhc3NvY2lhdGlvbiA9IGF3YWl0IGFzc29jaWF0ZUFzc2lzdGFudFJlc3BvbnNlKFxyXG4gICAgICAgICAgICAgICAgICAgIGN0bC5jbGllbnQsXHJcbiAgICAgICAgICAgICAgICAgICAgaGlzdG9yeSxcclxuICAgICAgICAgICAgICAgICAgICBtZW1vcnlOdW1iZXIsXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcclxuICAgICAgICAgICAgICAgICAgICBgRmFpbGVkIHRvIGFzc29jaWF0ZSBhc3Npc3RhbnQgcmVzcG9uc2UgJHttZW1vcnlOdW1iZXJ9OyBza2lwcGluZyBpdDogYCArXHJcbiAgICAgICAgICAgICAgICAgICAgYCR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWAsXHJcbiAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIFNraXAgdGhpcyBtZW1vcnkgbnVtYmVyIGFuZCBjb250aW51ZSB3aXRoIHRoZSBuZXh0LlxyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIEFzc2lzdGFudCByZXNwb25zZSB3YXMgbWV0YWRhdGEgb25seS5cclxuICAgICAgICAgICAgaWYgKGFzc29jaWF0aW9uID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3QgY2xlYW5lZFJvb3RJbnB1dCA9IGNsZWFuVXNlcklucHV0KGFzc29jaWF0aW9uLnJvb3RJbnB1dD8udHJpbSgpKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGNsZWFuZWREaXJlY3RJbnB1dCA9IGNsZWFuVXNlcklucHV0KGFzc29jaWF0aW9uLmRpcmVjdElucHV0Py50cmltKCkpO1xyXG5cclxuICAgICAgICAgICAgLy8gVXNlciBpbnB1dCB3YXMgbWV0YWRhdGEgb25seS5cclxuICAgICAgICAgICAgaWYgKGlzTWV0YWRhdGFPbmx5SW5wdXQoY2xlYW5lZERpcmVjdElucHV0KSkge1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIC8vIEJvdGggcm9vdCBhbmQgZGlyZWN0IGlucHV0cyBhcmUgdXNhYmxlLlxyXG4gICAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICAgICBjbGVhbmVkUm9vdElucHV0ICE9PSBcIlwiICYmXHJcbiAgICAgICAgICAgICAgICBjbGVhbmVkRGlyZWN0SW5wdXQgIT09IFwiXCJcclxuICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICBzZWVkcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgICAgICBkYXRlOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICAgICAgICAgICAgcm9vdF9pbnB1dDogY2xlYW5lZFJvb3RJbnB1dCxcclxuICAgICAgICAgICAgICAgICAgICBkaXJlY3RfaW5wdXQ6IGNsZWFuZWREaXJlY3RJbnB1dCxcclxuICAgICAgICAgICAgICAgICAgICBvdXRwdXQ6IGFzc29jaWF0aW9uLmFzc2lzdGFudFJlc3BvbnNlLFxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoXHJcbiAgICAgICAgICAgICAgICBjbGVhbmVkUm9vdElucHV0ID09PSBcIlwiICYmXHJcbiAgICAgICAgICAgICAgICBjbGVhbmVkRGlyZWN0SW5wdXQgIT09IFwiXCJcclxuICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBVc2UgRGlyZWN0SW5wdXQgYXMgYSBwbGFjZWhvbGRlciBmb3IgUm9vdElucHV0LlxyXG4gICAgICAgICAgICAgICAgc2VlZHMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAgICAgZGF0ZTogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxyXG4gICAgICAgICAgICAgICAgICAgIHJvb3RfaW5wdXQ6IGNsZWFuZWREaXJlY3RJbnB1dCxcclxuICAgICAgICAgICAgICAgICAgICBkaXJlY3RfaW5wdXQ6IGNsZWFuZWREaXJlY3RJbnB1dCxcclxuICAgICAgICAgICAgICAgICAgICBvdXRwdXQ6IGFzc29jaWF0aW9uLmFzc2lzdGFudFJlc3BvbnNlLFxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE5vIGVsaWdpYmxlIHNlZWRzIHdlcmUgY29sbGVjdGVkLlxyXG4gICAgICAgIGlmIChzZWVkcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU2F2ZSBhbGwgY29sbGVjdGVkIHNlZWRzIGluIG9uZSB3cml0ZSBvcGVyYXRpb24uXHJcbiAgICAgICAgYXdhaXQgbWVtb3J5U3RvcmUuc2F2ZU11bHRpcGxlU2VlZHMoXHJcbiAgICAgICAgICAgIGNhdGVnb3J5LFxyXG4gICAgICAgICAgICBmaWxlTmFtZSxcclxuICAgICAgICAgICAgc2VlZHMsXHJcbiAgICAgICAgICAgIHN0YXJ0TWVtb3J5TnVtYmVyLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGlmKCFlbmFibGVUb29sc01vZGUpIHtcclxuICAgICAgICAgICAgYXdhaXQgYXBwZW5kU2F2ZU1lbW9yeVRleHRBdEVuZE9mQ29udmVyc2F0aW9uSnNvbihmYWxzZSwgdXBkYXRlZCwgZW5hYmxlVG9vbHNNb2RlKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihcclxuICAgICAgICAgICAgXCJFcnJvciBjcmVhdGluZyBNZW1vcnkgU2VlZDogXCIgK1xyXG4gICAgICAgICAgICBgJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCxcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgIHJlc2V0UGVuZGluZ1NhdmVNZW1vcnkoKTtcclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnN0cnVjdG9ycyBmb3IgdGhlIFNhdmUgTWVtb3J5IE1lc3NhZ2Ugc3RyaW5nc1xyXG4gKiBGb3IgTWlzc2luZyBGaWVsZHMgLSBTdWNjZXNzZnVsIG1lbW9yeSBzYXZlIC0gU2F2ZSBtZW1vcnkgZWFybHkgYWJvcnRcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb25zdHJ1Y3RBc3Npc3RhbnRSZXBseVNhdmVNZW1vcnkoXHJcbiAgICBwZW5kaW5nU2F2ZU1lbW9yeTogUGVuZGluZ1NhdmVNZW1vcnksXHJcbik6IFByb21pc2U8c3RyaW5nW10+e1xyXG4gICAgXHJcbiAgICBjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgICBsaW5lcy5wdXNoKFxyXG4gICAgICAgICdcdTIzRjMgKipgU0FWRSBNRU1PUlkgTU9ERWAqKidcclxuICAgICk7XHJcblxyXG4gICAgbGluZXMucHVzaChcclxuICAgICAgICBgXHUyNzA1ICoqWyBNZXNzYWdlICR7cGVuZGluZ1NhdmVNZW1vcnkubWVtb3J5TnVtYmVyfSR7cGVuZGluZ1NhdmVNZW1vcnkubWVtb3J5TnVtYmVyRW5kUmFuZ2UgIT09IG51bGw/IGAgXHUyMDE0ICR7cGVuZGluZ1NhdmVNZW1vcnkubWVtb3J5TnVtYmVyRW5kUmFuZ2V9YCA6IFwiXCJ9IF0qKmArXHJcbiAgICAgICAgYCB3YXMgc3VjY2Vzc2Z1bGx5IHNhdmVkIGFzICoqKiR7cGVuZGluZ1NhdmVNZW1vcnkuY2F0ZWdvcnl9LyR7cGVuZGluZ1NhdmVNZW1vcnkuZmlsZU5hbWV9Lmpzb24qKipgXHJcbiAgICApO1xyXG5cclxuICAgIHJldHVybiBsaW5lcztcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGNvbnN0cnVjdEFzc2lzdGFudFJlcGx5Rm9yTWlzc2luZ0ZpZWxkcyhcclxuICAgIHBlbmRpbmdTYXZlTWVtb3J5OiBQZW5kaW5nU2F2ZU1lbW9yeSxcclxuKTogUHJvbWlzZTxzdHJpbmdbXT57XHJcbiAgICBcclxuICAgIGNvbnN0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuICAgIGxpbmVzLnB1c2goXHJcbiAgICAgICAgJ1x1MjNGMyAqKmBTQVZFIE1FTU9SWSBNT0RFYCoqJ1xyXG4gICAgKTtcclxuXHJcbiAgICBsaW5lcy5wdXNoKFxyXG4gICAgICAgICcqKlBsZWFzZSBwcm92aWRlIHRoZSBmb2xsb3dpbmcgbWlzc2luZyBpbmZvcm1hdGlvbiB3aXRoIGl0cyByZXF1aXJlZCBwcmVmaXg6KionXHJcbiAgICApO1xyXG5cclxuICAgIGlmIChwZW5kaW5nU2F2ZU1lbW9yeS5jYXRlZ29yeSA9PT0gbnVsbCkge1xyXG4gICAgICAgIGxpbmVzLnB1c2goXHJcbiAgICAgICAgICAgICdcdTI3NEMgQ2F0ZWdvcnkgTmFtZTogYGNhdGVnb3J5IDxjYXRlZ29yeV9oZXJlPmAuJyxcclxuICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIGlmIChwZW5kaW5nU2F2ZU1lbW9yeS5maWxlTmFtZSA9PT0gbnVsbCkge1xyXG4gICAgICAgIGxpbmVzLnB1c2goXHJcbiAgICAgICAgICAgICdcdTI3NEMgTWVtb3J5IE5hbWU6IGBuYW1lIDxuYW1lX2hlcmU+YC4nLFxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKFxyXG4gICAgICAgIHBlbmRpbmdTYXZlTWVtb3J5LmNhdGVnb3J5ID09PSBudWxsICYmXHJcbiAgICAgICAgcGVuZGluZ1NhdmVNZW1vcnkuZmlsZU5hbWUgPT09IG51bGxcclxuICAgICkge1xyXG4gICAgICAgIGxpbmVzLnB1c2goXHJcbiAgICAgICAgICAgICcqVG8gcHJvdmlkZSBib3RoIHRvZ2V0aGVyLCB5b3UgbWF5IHVzZSBbIGA7YCAgYCxgICBgLmAgXSB0byBzZXBhcmF0ZSB0aGUgbWlzc2luZyBwYXJhbWV0ZXJzLionLFxyXG4gICAgICAgICk7XHJcbiAgICAgICAgbGluZXMucHVzaChcclxuICAgICAgICAgICAgJyoqRXhhbXBsZToqKiBgY2F0ZWdvcnkgPG5hbWVfaGVyZT47IG5hbWUgPG5hbWVfaGVyZT5gJyxcclxuICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIGxpbmVzLnB1c2goXHJcbiAgICAgICAgJ1x1MjZBMFx1RkUwRiAqVG8gZm9yY2VmdWxseSBlbmQgdGhpcyBzYXZlIG1lbW9yeSBhdHRlbXB0IHNheToqIGBleGl0IHNhdmUgbWVtb3J5YCdcclxuICAgICk7XHJcblxyXG4gICAgbGluZXMucHVzaChcclxuICAgICAgICBgXHUyNzA1ICoke1tcclxuICAgICAgICAgICAgXCJrbm93biBcdTIwMTRcIixcclxuICAgICAgICAgICAgcGVuZGluZ1NhdmVNZW1vcnkubWVtb3J5TnVtYmVyRW5kUmFuZ2UgIT09IG51bGxcclxuICAgICAgICAgICAgICAgID8gYE1lc3NhZ2VzOiAke3BlbmRpbmdTYXZlTWVtb3J5Lm1lbW9yeU51bWJlcn0gdG8gJHtwZW5kaW5nU2F2ZU1lbW9yeS5tZW1vcnlOdW1iZXJFbmRSYW5nZX07YFxyXG4gICAgICAgICAgICAgICAgOiBgTWVzc2FnZTogJHtwZW5kaW5nU2F2ZU1lbW9yeS5tZW1vcnlOdW1iZXJ9O2AsXHJcbiAgICAgICAgICAgIHBlbmRpbmdTYXZlTWVtb3J5LmNhdGVnb3J5ICE9PSBudWxsXHJcbiAgICAgICAgICAgICAgICA/IGBDYXRlZ29yeTogJHtwZW5kaW5nU2F2ZU1lbW9yeS5jYXRlZ29yeX07YFxyXG4gICAgICAgICAgICAgICAgOiBcIlwiLFxyXG4gICAgICAgICAgICBwZW5kaW5nU2F2ZU1lbW9yeS5maWxlTmFtZSAhPT0gbnVsbFxyXG4gICAgICAgICAgICAgICAgPyBgTmFtZTogJHtwZW5kaW5nU2F2ZU1lbW9yeS5maWxlTmFtZX07YFxyXG4gICAgICAgICAgICAgICAgOiBcIlwiLFxyXG4gICAgICAgIF1cclxuICAgICAgICAgICAgLmZpbHRlcihCb29sZWFuKVxyXG4gICAgICAgICAgICAuam9pbihcIiBcIil9KmAsXHJcbiAgICApO1xyXG4gICAgXHJcbiAgICByZXR1cm4gbGluZXM7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb25zdHJ1Y3RBc3Npc3RhbnRSZXBseVNhdmVNZW1vcnlFeGl0KFxyXG4gICAgcGVuZGluZ1NhdmVNZW1vcnk6IFBlbmRpbmdTYXZlTWVtb3J5LFxyXG4pOiBQcm9taXNlPHN0cmluZ1tdPntcclxuICAgIFxyXG4gICAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XHJcblxyXG4gICAgbGluZXMucHVzaChcclxuICAgICAgICAnXHUyM0YzICoqYFNBVkUgTUVNT1JZIE1PREVgKionXHJcbiAgICApO1xyXG5cclxuICAgIGxpbmVzLnB1c2goXHJcbiAgICAgICAgYFx1RDgzRFx1REVEMSR7W1xyXG4gICAgICAgICAgICBcIkV4aXRpbmcgU2F2ZSBNZW1vcnkgUmVxdWVzdCBvZiAqKipbXCIsXHJcbiAgICAgICAgICAgIHBlbmRpbmdTYXZlTWVtb3J5Lm1lbW9yeU51bWJlckVuZFJhbmdlICE9PSBudWxsXHJcbiAgICAgICAgICAgICAgICA/IGBNZXNzYWdlczogJHtwZW5kaW5nU2F2ZU1lbW9yeS5tZW1vcnlOdW1iZXJ9IHRvICR7cGVuZGluZ1NhdmVNZW1vcnkubWVtb3J5TnVtYmVyRW5kUmFuZ2V9YFxyXG4gICAgICAgICAgICAgICAgOiBgTWVzc2FnZTogJHtwZW5kaW5nU2F2ZU1lbW9yeS5tZW1vcnlOdW1iZXJ9YCxcclxuICAgICAgICAgICAgXCJdKioqXCIsXHJcbiAgICAgICAgXVxyXG4gICAgICAgICAgICAuZmlsdGVyKEJvb2xlYW4pXHJcbiAgICAgICAgICAgIC5qb2luKFwiIFwiKX1gLFxyXG4gICAgKTtcclxuXHJcbiAgICByZXR1cm4gbGluZXM7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb25zdHJ1Y3RBc3Npc3RhbnRSZXBseVNhdmVNZW1vcnlOb3RoaW5nVG9TYXZlKFxyXG4gICAgcGVuZGluZ1NhdmVNZW1vcnk6IFBlbmRpbmdTYXZlTWVtb3J5LFxyXG4pOiBQcm9taXNlPHN0cmluZ1tdPntcclxuICAgIFxyXG4gICAgY29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XHJcblxyXG4gICAgbGluZXMucHVzaChcclxuICAgICAgICAnXHUyM0YzICoqYFNBVkUgTUVNT1JZIE1PREVgKionXHJcbiAgICApO1xyXG5cclxuICAgIGxpbmVzLnB1c2goXHJcbiAgICAgICAgYFx1RDgzRFx1REVEMSAke1tcclxuICAgICAgICAgICAgXCJTYXZlIE1lbW9yeSBSZXF1ZXN0IG9mICoqKltcIixcclxuICAgICAgICAgICAgcGVuZGluZ1NhdmVNZW1vcnkubWVtb3J5TnVtYmVyRW5kUmFuZ2UgIT09IG51bGxcclxuICAgICAgICAgICAgICAgID8gYE1lc3NhZ2VzOiAke3BlbmRpbmdTYXZlTWVtb3J5Lm1lbW9yeU51bWJlcn0gdG8gJHtwZW5kaW5nU2F2ZU1lbW9yeS5tZW1vcnlOdW1iZXJFbmRSYW5nZX1gXHJcbiAgICAgICAgICAgICAgICA6IGBNZXNzYWdlOiAke3BlbmRpbmdTYXZlTWVtb3J5Lm1lbW9yeU51bWJlcn1gLFxyXG4gICAgICAgICAgICBcIl0qKipcIixcclxuICAgICAgICAgICAgXCJyZWplY3RlZCBiZWNhdXNlIHRoZXJlIGlzIG5vIGVsaWdpYmxlIGNvbnRlbnQuXCIsXHJcbiAgICAgICAgXVxyXG4gICAgICAgICAgICAuZmlsdGVyKEJvb2xlYW4pXHJcbiAgICAgICAgICAgIC5qb2luKFwiIFwiKX1gLFxyXG4gICAgKTtcclxuXHJcbiAgICByZXR1cm4gbGluZXM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzTWV0YWRhdGFPbmx5SW5wdXQoXHJcbiAgICBpbnB1dDogc3RyaW5nXHJcbik6IGJvb2xlYW4ge1xyXG5cclxuICAgIC8vIFJlZ2V4ZXMgdW5pZmllZCBhdCBjb25maWcudHNcclxuICAgIGNvbnN0IENBVEVHT1JZX0VYVFJBQ1RfUkVHRVggPSBnZXRDYXRlZ29yeUV4dHJhY3RSZWdleCgpO1xyXG5cclxuICAgIGNvbnN0IE5BTUVfRVhUUkFDVF9SRUdFWCA9IGdldE5hbWVFeHRyYWN0UmVnZXgoKTtcclxuXHJcbiAgICBjb25zdCBFWElUX1NBVkVfTUVNT1JZX1JFR0VYID0gZ2V0RXhpdFNhdmVNZW1vcnlSZWdleCgpO1xyXG5cclxuICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBpbnB1dC50cmltKCk7XHJcblxyXG4gICAgaWYgKFxyXG4gICAgICAgIEVYSVRfU0FWRV9NRU1PUllfUkVHRVgudGVzdChub3JtYWxpemVkKSB8fFxyXG4gICAgICAgIGlucHV0Lmxlbmd0aCA8PSAxICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNhdGNoZXMgYW55dGhpbmcgdXNlbGVzcyBvciBhIHNpbmdsZSAuIHRoYXQgd2FzIG5vdCBzY3J1YmJlZCBieSBjbGVhbnVzZXJpbnB1dFxyXG4gICAgKSB7XHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgc2VnbWVudHMgPSBub3JtYWxpemVkXHJcbiAgICAgICAgLnNwbGl0KC9bOyxcXC5dLylcclxuICAgICAgICAubWFwKChzZWdtZW50KSA9PiBzZWdtZW50LnRyaW0oKSlcclxuICAgICAgICAuZmlsdGVyKEJvb2xlYW4pO1xyXG5cclxuICAgIGlmIChzZWdtZW50cy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHNlZ21lbnRzLmV2ZXJ5KFxyXG4gICAgICAgIChzZWdtZW50KSA9PlxyXG4gICAgICAgICAgICBDQVRFR09SWV9FWFRSQUNUX1JFR0VYLnRlc3Qoc2VnbWVudCkgfHxcclxuICAgICAgICAgICAgTkFNRV9FWFRSQUNUX1JFR0VYLnRlc3Qoc2VnbWVudCksXHJcbiAgICApO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gaXNNZXRhZGF0YU9ubHlPdXRwdXQob3V0cHV0OiBzdHJpbmcpOiBib29sZWFuIHtcclxuICAgIGNvbnN0IHByZWZpeCA9IG91dHB1dC5zbGljZSgwLCA4KTtcclxuXHJcbiAgICBpZiAoXHJcbiAgICAgICAgb3V0cHV0Lmxlbmd0aCA8PSAxIHx8XHJcbiAgICAgICAgb3V0cHV0ID09PSBcIkNvbnRlbnQgUmV0cmFjdGVkXCIgfHxcclxuICAgICAgICBwcmVmaXguaW5jbHVkZXMoXCJcdUQ4M0RcdURFQThcIikgfHxcclxuICAgICAgICBwcmVmaXguaW5jbHVkZXMoXCJcdUQ4M0RcdURDRTZcIikgfHxcclxuICAgICAgICBwcmVmaXguaW5jbHVkZXMoXCJcdTIzRjNcIikgfHxcclxuICAgICAgICBwcmVmaXguaW5jbHVkZXMoXCJcdTI3MDVcIikgfHxcclxuICAgICAgICBwcmVmaXguaW5jbHVkZXMoXCJcdTI3NENcIikgfHxcclxuICAgICAgICBvdXRwdXQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhcInNhdmUgbWVtb3J5IG1vZGVcIilcclxuICAgICkge1xyXG4gICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFNjYW5zIGxhc3QgYXNzaXN0YW50IG1lc3NhZ2UgaW4gaGlzdG9yeSBmb3IgYW4gaW5jb21wbGV0ZWQgc2F2ZSBtZW1vcnkgY29tbWFuZC5cclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzY2FuSGlzdG9yeUZvckluY29tcGxldGVTYXZlTWVtb3J5Q29tbWFuZChcclxuICAgIHVzZXJUZXh0OiBzdHJpbmcsXHJcbiAgICBtZXNzYWdlczogQ2hhdE1lc3NhZ2VbXSxcclxuKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuICAgIC8vIEZpbmQgdGhlIGxhc3QgYXNzaXN0YW50IG1lc3NhZ2VcclxuICAgIGxldCBsYXN0QXNzaXN0YW50TWVzc2FnZTogYW55ID0gbnVsbDtcclxuXHJcbiAgICBmb3IgKGxldCBpID0gbWVzc2FnZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcclxuICAgICAgICBpZiAoKG1lc3NhZ2VzW2ldIGFzIGFueSkuZGF0YS5yb2xlID09PSBcImFzc2lzdGFudFwiKSB7XHJcbiAgICAgICAgICAgIGxhc3RBc3Npc3RhbnRNZXNzYWdlID0gbWVzc2FnZXNbaV07XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBpZiAoIWxhc3RBc3Npc3RhbnRNZXNzYWdlKSB7XHJcbiAgICAgICAgcmV0dXJuIFwiXCI7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRXh0cmFjdCB0ZXh0IGZyb20gdGhhdCBtZXNzYWdlIG9ubHlcclxuICAgIGNvbnN0IGV4dHJhY3RlZExhc3RBc3Npc3RhbnRUZXh0ID0gKFxyXG4gICAgICAgIGxhc3RBc3Npc3RhbnRNZXNzYWdlLmRhdGEuY29udGVudCA/PyBbXVxyXG4gICAgKVxyXG4gICAgICAgIC5maWx0ZXIoXHJcbiAgICAgICAgICAgIChjb250ZW50OiBhbnkpID0+XHJcbiAgICAgICAgICAgICAgICBjb250ZW50LnR5cGUgPT09IFwidGV4dFwiICYmIGNvbnRlbnQudGV4dCxcclxuICAgICAgICApXHJcbiAgICAgICAgLm1hcCgoY29udGVudDogYW55KSA9PiBjb250ZW50LnRleHQpXHJcbiAgICAgICAgLmpvaW4oXCJcXG5cIik7XHJcblxyXG4gICAgLy8gT25seSBwcm9jZXNzIGlmIHRoZSBMQVNUIGFzc2lzdGFudCBtZXNzYWdlIGNvbnRhaW5zIFNBVkUgTUVNT1JZIE1PREVcclxuICAgIGlmICghZXh0cmFjdGVkTGFzdEFzc2lzdGFudFRleHQuaW5jbHVkZXMoXCJTQVZFIE1FTU9SWSBNT0RFXCIpKSB7XHJcbiAgICAgICAgcmV0dXJuIFwiXCI7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qga25vd25NYXRjaCA9IGV4dHJhY3RlZExhc3RBc3Npc3RhbnRUZXh0Lm1hdGNoKFxyXG4gICAgICAgIC9rbm93blxccypcdTIwMTRcXHMqKC4rKS9pLFxyXG4gICAgKTtcclxuXHJcbiAgICBpZiAoIWtub3duTWF0Y2gpIHtcclxuICAgICAgICByZXR1cm4gXCJcIjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBrbm93blBhcmFtZXRlcnMgPSBrbm93bk1hdGNoWzFdO1xyXG5cclxuICAgIGNvbnN0IG1lc3NhZ2VNYXRjaCA9IGtub3duUGFyYW1ldGVycy5tYXRjaChcclxuICAgICAgICAvXFxiTWVzc2FnZXM/OlxccyooXFxkKykoPzpcXHMrdG9cXHMrKFxcZCspKT9cXHMqOy9pLFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBjYXRlZ29yeU1hdGNoID0ga25vd25QYXJhbWV0ZXJzLm1hdGNoKFxyXG4gICAgICAgIC9cXGJDYXRlZ29yeTpcXHMqKFteO10rKVxccyo7L2ksXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IG5hbWVNYXRjaCA9IGtub3duUGFyYW1ldGVycy5tYXRjaChcclxuICAgICAgICAvXFxiTmFtZTpcXHMqKFteO10rKVxccyo7L2ksXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IG1lbW9yeU51bWJlciA9IG1lc3NhZ2VNYXRjaD8uWzFdID8/IG51bGw7XHJcbiAgICBjb25zdCBtZW1vcnlOdW1iZXJFbmRSYW5nZSA9IG1lc3NhZ2VNYXRjaD8uWzJdID8/IG51bGw7XHJcbiAgICBsZXQgY2F0ZWdvcnkgPSBjYXRlZ29yeU1hdGNoPy5bMV0/LnRyaW0oKSA/PyBudWxsO1xyXG4gICAgbGV0IGZpbGVOYW1lID0gbmFtZU1hdGNoPy5bMV0/LnRyaW0oKSA/PyBudWxsO1xyXG5cclxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICAvLyBTcGxpdCBmaWVsZHMgdXNpbmcgdGhlIHN1cHBvcnRlZCBkZWxpbWl0ZXJzLlxyXG4gICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbiAgICBjb25zdCBzZWdtZW50czogc3RyaW5nW10gPSB1c2VyVGV4dFxyXG4gICAgICAgIC5zcGxpdCgvWzssLl0vKVxyXG4gICAgICAgIC5tYXAoKHNlZ21lbnQ6IHN0cmluZykgPT4gc2VnbWVudC50cmltKCkpXHJcbiAgICAgICAgLmZpbHRlcigoc2VnbWVudDogc3RyaW5nKSA9PiBzZWdtZW50Lmxlbmd0aCA+IDApO1xyXG5cclxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICAvLyBQcm9jZXNzIGVhY2ggc2VnbWVudC5cclxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG4gICAgZm9yIChjb25zdCBzZWdtZW50IG9mIHNlZ21lbnRzKSB7XHJcblxyXG4gICAgICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAgICAgICAvLyBDQVRFR09SWVxyXG4gICAgICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbiAgICAgICAgY29uc3QgdXNlckxhc3RDYXRlZ29yeSA9IGV4dHJhY3RDYXRlZ29yeShzZWdtZW50KTtcclxuXHJcbiAgICAgICAgaWYgKHVzZXJMYXN0Q2F0ZWdvcnkgIT09IG51bGwpIHtcclxuICAgICAgICAgICAgY2F0ZWdvcnkgPSB1c2VyTGFzdENhdGVnb3J5O1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAgICAgICAvLyBOQU1FXHJcbiAgICAgICAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuICAgICAgICBjb25zdCB1c2VyTGFzdEZpbGVOYW1lID0gZXh0cmFjdEZpbGVOYW1lKHNlZ21lbnQpO1xyXG5cclxuICAgICAgICBpZiAodXNlckxhc3RGaWxlTmFtZSAhPT0gbnVsbCkge1xyXG4gICAgICAgICAgICBmaWxlTmFtZSA9IHVzZXJMYXN0RmlsZU5hbWU7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gW1xyXG4gICAgICAgIG1lbW9yeU51bWJlckVuZFJhbmdlICE9PSBudWxsXHJcbiAgICAgICAgICAgID8gYHNhdmUgbWVtb3J5IG1lc3NhZ2VzICR7bWVtb3J5TnVtYmVyfSB0byAke21lbW9yeU51bWJlckVuZFJhbmdlfTtgXHJcbiAgICAgICAgICAgIDogbWVtb3J5TnVtYmVyICE9PSBudWxsXHJcbiAgICAgICAgICAgICAgICA/IGBzYXZlIG1lbW9yeSAke21lbW9yeU51bWJlcn07YFxyXG4gICAgICAgICAgICAgICAgOiBcIlwiLFxyXG4gICAgICAgIGNhdGVnb3J5ICE9PSBudWxsID8gYGNhdGVnb3J5ICR7Y2F0ZWdvcnl9O2AgOiBcIlwiLFxyXG4gICAgICAgIGZpbGVOYW1lICE9PSBudWxsID8gYG5hbWUgJHtmaWxlTmFtZX07YCA6IFwiXCIsXHJcbiAgICBdXHJcbiAgICAgICAgLmZpbHRlcihCb29sZWFuKVxyXG4gICAgICAgIC5qb2luKFwiIFwiKTtcclxufSIsICJpbXBvcnQgeyBhY3F1aXJlTG9jaywgcmVsZWFzZUxvY2sgfSBmcm9tIFwiLi9hY3F1aXJlTG9ja0ZpbGVcIjtcclxuaW1wb3J0IHsgbWVtb3J5U3RvcmUgfSBmcm9tIFwiLi9tZW1vcnlTdG9yZVwiO1xyXG5pbXBvcnQgdHlwZSB7IE1lbW9yeVNlZWQgfSBmcm9tIFwiLi9tZW1vcnlTdG9yZVwiO1xyXG5pbXBvcnQgeyBqb2luIH0gZnJvbSBcIm5vZGU6cGF0aFwiO1xyXG5pbXBvcnQgeyBlZGl0QXNzaXN0YW50UmVzcG9uc2UgfSBmcm9tIFwiLi90cmlnZ2VyU2F2ZU1lbW9yeVwiO1xyXG5pbXBvcnQgeyBnZXRNZW1vcnlTZWVkc1Bvb2wgfSBmcm9tIFwiLi9tZW1vcnlTZXNzaW9uXCI7XHJcbmltcG9ydCB7IHByb21wdFByb2Nlc3NvckNvbnN0cnVjdE1lbW9yaWVzVG9JbmplY3QgfSBmcm9tIFwiLi9wcm9tcHRQcmVwcm9jZXNzb3JcIjtcclxuaW1wb3J0IHBhdGggZnJvbSBcIm5vZGU6cGF0aFwiO1xyXG5pbXBvcnQgZnMgZnJvbSBcIm5vZGU6ZnMvcHJvbWlzZXNcIjtcclxuXHJcbmltcG9ydCB7IFxyXG4gICAgZ2V0Q29udHJvbGxlciwgXHJcbiAgICBjb25maWdTY2hlbWF0aWNzLCBcclxuICAgIGdldFRhYmxlT2ZNZW1vcmllc1JlZ2V4LCBcclxuICAgIGdldEZ1enp5U2VhcmNoUmVnZXgsIFxyXG4gICAgZ2V0TWVtb3J5UmFuZ2VSZWdleCwgXHJcbiAgICBhZGRDb252ZXJzYXRpb25PcGVyYXRpb24sIFxyXG4gICAgc2V0UGVuZGluZ1RvbUNvbW1hbmQsIFxyXG4gICAgZ2V0UGVuZGluZ1RvbUNvbW1hbmQsXHJcbiAgICBUT01fUkFOR0VTLFxyXG4gICAgZ2V0RGlyZWN0RmV0Y2hSZWdleCxcclxuICAgIHNldExhc3RLbm93bkluZGV4T2ZSZXRyYWN0ZWRUb21zLFxyXG4gICAgZ2V0TGFzdEtub3duSW5kZXhPZlJldHJhY3RlZFRvbXNcclxufSBmcm9tIFwiLi9jb25maWdcIjtcclxuXHJcbmltcG9ydCB7XHJcbiAgICB3cml0ZUZpbGUsXHJcbiAgICByZWFkRmlsZSxcclxuICAgIHJlYWRkaXIsXHJcbiAgICBzdGF0LFxyXG59IGZyb20gXCJub2RlOmZzL3Byb21pc2VzXCI7XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIFRhYmxlT2ZNZW1vcmllc0VudGl0eSB7XHJcbiAgICBmaWxlU2l6ZUtCOiBudW1iZXI7XHJcbiAgICBmaWxlTmFtZTogc3RyaW5nO1xyXG4gICAga2V5d29yZHM6IHN0cmluZztcclxuICAgIHN1bW1hcnk6IHN0cmluZztcclxufVxyXG5cclxuZXhwb3J0IGludGVyZmFjZSBNZW1vcnlUdXJuIHtcclxuICAgIGRpcmVjdF9pbnB1dDogc3RyaW5nO1xyXG4gICAgb3V0cHV0OiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBNZW1vcnlFbnRyeSB7XHJcbiAgZmlsZW5hbWU6IHN0cmluZztcclxuICBzdW1tYXJ5OiBzdHJpbmc7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB0YWJsZU9mTWVtb3JpZXNNYWluKCk6IFByb21pc2U8dm9pZD4ge1xyXG5cclxuICAgIGNvbnN0IGNvbmZpZyA9IGdldENvbnRyb2xsZXIoKS5nZXRQbHVnaW5Db25maWcoY29uZmlnU2NoZW1hdGljcyk7XHJcbiAgICBjb25zdCBpbml0aWFsaXplVE9NID0gY29uZmlnLmdldChcImluaXRpYWxpemVUT01cIikgYXMgYm9vbGVhbjtcclxuXHJcbiAgICBjb25zdCBtZW1vcmllc0RpcmVjdG9yeSA9IGF3YWl0IG1lbW9yeVN0b3JlLmdldE1lbW9yaWVzRGlyZWN0b3J5KCk7XHJcblxyXG4gICAgaWYgKGluaXRpYWxpemVUT00pIHtcclxuICAgICAgICBhd2FpdCBjcmVhdGVUYWJsZU9mTWVtb3JpZXMobWVtb3JpZXNEaXJlY3RvcnkpO1xyXG4gICAgICAgIGF3YWl0IGluaXRpYWxpemVUYWJsZU9mTWVtb3JpZXNGcm9tTGVnYWN5UGx1Z2luVmVyc2lvbihtZW1vcmllc0RpcmVjdG9yeSk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4vLyBVc2VyVGV4dCBJbnRlcmNlcHRvciBUbyBEZXRlcm1pbmUgVE9NIFJlZ2V4IENvbW1hbmRzXHJcbi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuLy8gRmlyc3QgbGF5ZXIgZmlsdGVyIHRoYXQgd2lsbCB0cnkgdG8gZGV0ZXJtaW5lIGlmIHRoZSB1c2VyVGV4dFxyXG4vLyBpcyBhIFRPTSBmdXp6eSBzZWFyY2ggb3IgVE9NIHRhYmxlIGxvb2t1cCBjb21tYW5kLlxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc01lc3NhZ2VGb3JUb20oXHJcbiAgICB1c2VyVGV4dDogc3RyaW5nLFxyXG4gICAgcmV0cmFjdE9sZFRvbXM6IG51bWJlcixcclxuICAgIGVuYWJsZVRvb2xzTW9kZTogYm9vbGVhbixcclxuKTogUHJvbWlzZTx2b2lkPntcclxuXHJcbiAgICBjb25zdCBUQUJMRV9PRl9NRU1PUklFU19SRUdFWCA9IGdldFRhYmxlT2ZNZW1vcmllc1JlZ2V4KCk7XHJcblxyXG4gICAgY29uc3QgRlVaWllfU0VBUkNIX01FTU9SWV9SRUdFWCA9IGdldEZ1enp5U2VhcmNoUmVnZXgoKTtcclxuXHJcbiAgICBjb25zdCBESVJFQ1RfRkVUQ0hfTUVNT1JZX1JFR0VYID0gZ2V0RGlyZWN0RmV0Y2hSZWdleCgpO1xyXG5cclxuICAgIGNvbnN0IHRvbU1hdGNoID0gdXNlclRleHQubWF0Y2goVEFCTEVfT0ZfTUVNT1JJRVNfUkVHRVgpO1xyXG5cclxuICAgIGNvbnN0IHBlbmRpbmdUb21Db21tYW5kID0gZ2V0UGVuZGluZ1RvbUNvbW1hbmQoKTtcclxuXHJcbiAgICBsZXQgY29uc3RydWN0ZWRUYWJsZVN0cmluZyA9IFwiXCI7XHJcblxyXG4gICAgY29uc3QgdG9tRGlyZWN0RmV0Y2hNYXRjaCA9IHVzZXJUZXh0Lm1hdGNoKERJUkVDVF9GRVRDSF9NRU1PUllfUkVHRVgpO1xyXG5cclxuICAgIGlmIChyZXRyYWN0T2xkVG9tcyA+IDApIHtcclxuXHJcbiAgICAgICAgYWRkQ29udmVyc2F0aW9uT3BlcmF0aW9uKFxyXG4gICAgICAgICAgICBcInRyeVJldHJhY3RPbGRUb21zRnVuY3Rpb25cIixcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgcmV0cmFjdE9sZFRvbXMsXHJcbiAgICAgICAgICAgICAgICBlbmFibGVUb29sc01vZGUsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBFYXJseSBleGl0IGFmdGVyIHRoZSByZXRyYWN0T2xkVG9tcyBvcGVyYXRpb25cclxuICAgIGlmIChlbmFibGVUb29sc01vZGUpIHJldHVybjtcclxuXHJcbiAgICAvLyBESVJFQ1QgTUVNT1JZIEZFVENIIFVTRVIgUFJPVklERUQgLkpTT04gTkFNRVxyXG4gICAgaWYgKHRvbURpcmVjdEZldGNoTWF0Y2gpIHtcclxuICAgICAgICBjb25zdCBtZW1vcnlTZWVkc1Bvb2wgPSBnZXRNZW1vcnlTZWVkc1Bvb2woKTtcclxuICAgICAgICBjb25zdCByZXF1ZXN0ZWRTZWVkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IHNlZWQgb2YgbWVtb3J5U2VlZHNQb29sKSB7XHJcbiAgICAgICAgICAgIC8vIEFjY2VwdCBvbmx5IGV4YWN0IHNlZWQgcGF0aHMgbWVudGlvbmVkIGluIHRoZSB1c2VyIHRleHQuXHJcbiAgICAgICAgICAgIGlmICh1c2VyVGV4dC5pbmNsdWRlcyhzZWVkKSkge1xyXG4gICAgICAgICAgICAgICAgcmVxdWVzdGVkU2VlZHMuYWRkKHNlZWQpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBFeHBhbmQgY2F0ZWdvcnkvKi5qc29uIG9ubHkgZm9yIGtub3duIGNhdGVnb3JpZXMuXHJcbiAgICAgICAgICAgIGNvbnN0IHNsYXNoSW5kZXggPSBzZWVkLmluZGV4T2YoXCIvXCIpO1xyXG4gICAgICAgICAgICBpZiAoc2xhc2hJbmRleCA9PT0gLTEpIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgY2F0ZWdvcnkgPSBzZWVkLnNsaWNlKDAsIHNsYXNoSW5kZXgpO1xyXG4gICAgICAgICAgICBjb25zdCB3aWxkY2FyZCA9IGAke2NhdGVnb3J5fS8qLmpzb25gO1xyXG5cclxuICAgICAgICAgICAgaWYgKHVzZXJUZXh0LmluY2x1ZGVzKHdpbGRjYXJkKSkge1xyXG4gICAgICAgICAgICAgICAgcmVxdWVzdGVkU2VlZHMuYWRkKHNlZWQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCB2YWxpZGF0ZWRTZWVkc1RvRmV0Y2ggPSBbLi4ucmVxdWVzdGVkU2VlZHNdO1xyXG5cclxuICAgICAgICAvLyBjb25zb2xlLmxvZyhcIlZhbGlkYXRlZCBzZWVkczpcIiwgdmFsaWRhdGVkU2VlZHNUb0ZldGNoKTtcclxuXHJcbiAgICAgICAgY29uc3QgbWVtb3JpZXNQYWNrYWdlID0gYXdhaXQgcHJvbXB0UHJvY2Vzc29yQ29uc3RydWN0TWVtb3JpZXNUb0luamVjdChcclxuICAgICAgICAgICAgdmFsaWRhdGVkU2VlZHNUb0ZldGNoLFxyXG4gICAgICAgICAgICBmYWxzZSwgICAgICAgICAgICAgICAgICAgICAgLy8gRG8gbm90IHN1bW1hcml6ZSBzZWVkc1xyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGNvbnN0cnVjdGVkVGFibGVTdHJpbmcgPSBmb3JtYXRNZW1vcnlQYWNrYWdlKG1lbW9yaWVzUGFja2FnZSk7XHJcblxyXG4gICAgICAgIC8vIEZldGNoIG9ubHkgdmFsaWRhdGVkU2VlZHNUb0ZldGNoLlxyXG4gICAgICAgIGlmIChjb25zdHJ1Y3RlZFRhYmxlU3RyaW5nICE9PSBcIlwiKSB7XHJcbiAgICAgICAgICAgIC8vIEluamVjdCB0aGUgY29uc3RydWN0ZWRUYWJsZVN0cmluZyBpbnRvIHRoZSBuZXdlc3QgYXNzaXN0YW50IG1lc3NhZ2UuXHJcbiAgICAgICAgICAgIGFkZENvbnZlcnNhdGlvbk9wZXJhdGlvbihcclxuICAgICAgICAgICAgICAgIFwidHJ5QXBwZW5kVGFibGVPZk1lbW9yaWVzQ29udGVudEZ1bmN0aW9uXCIsXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3RydWN0ZWRUYWJsZVN0cmluZyxcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBzZXRQZW5kaW5nVG9tQ29tbWFuZChcInJlYWR5XCIpO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIFRBQkxFIExPT0sgVVAgVVNFUiBQUk9WSURFRCBUT01BSiB0aGVuIEZVWlpZIE1FTU9SWSBTRUFSQ0ggSUYgSVQgV0FTIE5PVCBBIFRBQkxFIExPT0sgVVBcclxuICAgIC8vIEZpcnN0IGxheWVyIGNoZWNrIGZvciBkaXJlY3QgdGFibGUgb2YgbWVtb3JpZXMgbG9va3VwLlxyXG4gICAgLy8gVGhpcyBjYXB0dXJlcyBhIGJyb2FkIHVzZXJUZXh0IHdpdGgga2V5d29yZHMgZm9yICdmZXRjaCcgJiAndGFibGUnICYgJ21lbW9yeXxtZW1vcmllcycgfHwgJ3RvbSdcclxuICAgIGlmIChcclxuICAgICAgICB0b21NYXRjaCB8fFxyXG4gICAgICAgIHBlbmRpbmdUb21Db21tYW5kID09PSBcImluY29tcGxldGVcIlxyXG4gICAgKSB7XHJcbiAgICAgICAgY29uc3QgbWF0Y2ggPSBleHRyYWN0TWVtb3J5UmFuZ2UodXNlclRleHQpO1xyXG5cclxuICAgICAgICAvLyBTZWNvbmQgbGF5ZXIgY2hlY2sgdG8gc2VlIGlmIHRob3NlIHRocmVlIHNhbWUgdmFsdWVzIGV4aXN0IEFORCB0aGVyZSBpcyB2YXJpYXRpb24gb2YgYFRPTV9BLUpgLCBgVE9NX0stUWAsIGBUT01fUi1aYFxyXG4gICAgICAgIC8vIHdoaWNoIGlzIHRoZSBleHBlY3RlZCB0YWJsZSBuYW1lcyBhaSwgYSBpLCBhX2kgdmFsaWRhdGUgdG9vIGFzIGxvbmcgYXMgdGhleSd2ZSBjbGVhcmVkIHRoZSBmaXJzdCBsYXllciBjaGVja1xyXG4gICAgICAgIGlmIChtYXRjaCkge1xyXG5cclxuICAgICAgICAgICAgY29uc3QgdGFibGVOYW1lID0gYFRPTV8ke21hdGNoLnRvVXBwZXJDYXNlKCl9YDtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHJldHVyblBhY2thZ2UgPSBhd2FpdCB0YWJsZU9mTWVtb3JpZXNEaXJlY3RMb29rdXAodGFibGVOYW1lKTtcclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIGNvbnN0cnVjdGVkVGFibGVTdHJpbmcgPSBmb3JtYXRBc1RhYmxlU3RyaW5nKHJldHVyblBhY2thZ2UpO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgc2V0UGVuZGluZ1RvbUNvbW1hbmQoXCJyZWFkeVwiKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBCdWlsZCBhIHN0cmluZyB0byBhcHBlbmQgdG8gYXNrIHRoZSB1c2VyIHdoaWNoIHRhYmxlIHRoZXkgbGlrZSB0byBsb29rIHVwXHJcbiAgICAgICAgICAgIC8vIGdpdmluZyB0aGVtIHRoZWlyIGZ1bGwgb3B0aW9ucy5cclxuICAgICAgICAgICAgLy8gU2V0IG91cnNlbHZlcyBpbiBhIGdsb2JhbCBzdGF0ZSB0byB3YWl0IGZvciB0aGF0IGFuc3dlci5cclxuXHJcbiAgICAgICAgICAgIGNvbnN0cnVjdGVkVGFibGVTdHJpbmcgPVxyXG4gICAgICAgICAgICAgICAgXCJTcGVjaWZ5IGV4YWN0bHkgd2hpY2ggVGFibGUgb2YgTWVtb3JpZXMgeW91IHdpc2ggdG8gcmV0cmlldmU6IFwiICtcclxuICAgICAgICAgICAgICAgIFwiYFRPTV9cIiArIFRPTV9SQU5HRVMuZmlyc3Quc3RhcnQgKyBcIi1cIiArIFRPTV9SQU5HRVMuZmlyc3QuZW5kICsgXCJgLCBcIiArXHJcbiAgICAgICAgICAgICAgICBcImBUT01fXCIgKyBUT01fUkFOR0VTLnNlY29uZC5zdGFydCArIFwiLVwiICsgVE9NX1JBTkdFUy5zZWNvbmQuZW5kICsgXCJgLCBcIiArXHJcbiAgICAgICAgICAgICAgICBcImBUT01fXCIgKyBUT01fUkFOR0VTLnNwZWNpYWwuc3RhcnQgKyBcIi1cIiArIFRPTV9SQU5HRVMuc3BlY2lhbC5lbmQgKyBcImBcIjtcclxuXHJcbiAgICAgICAgICAgIHNldFBlbmRpbmdUb21Db21tYW5kKFwiaW5jb21wbGV0ZVwiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBGVVpaWSBTRUFSQ0ggUmVnZXggbWF0Y2hlZCBmaXJzdCBsYXllciBjaGVjaywgc2VuZCBpdCB0aHJvdWdoIHRvIFxyXG4gICAgICAgIC8vIHRoZSBtb2RlbCB0byB2YWxpZGF0ZSBhbmQgZXh0cmFjdCB0aGUgc2VhcmNoIHF1ZXJ5LlxyXG4gICAgICAgIGNvbnN0IGZ1enp5U2VhcmNoTWF0Y2ggPSB1c2VyVGV4dC5tYXRjaChGVVpaWV9TRUFSQ0hfTUVNT1JZX1JFR0VYKTtcclxuXHJcbiAgICAgICAgaWYgKGZ1enp5U2VhcmNoTWF0Y2gpIHtcclxuICAgICAgICAgICAgY29uc3QgZXh0cmFjdGVkUXVlcnkgPSBhd2FpdCBhc2tNb2RlbFRvVmFsaWRhdGVGdXp6eVNlYXJjaFJlZ2V4QW5kRXh0cmFjdFF1ZXJ5KHVzZXJUZXh0KTtcclxuXHJcbiAgICAgICAgICAgIGlmIChleHRyYWN0ZWRRdWVyeSAhPT0gXCJcIikge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcmV0dXJuUGFja2FnZSA9IGF3YWl0IHRhYmxlT2ZNZW1vcmllc1N1bW1hcmllc0xvb2t1cChleHRyYWN0ZWRRdWVyeSk7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKHJldHVyblBhY2thZ2UgIT09IFwiXCIpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdHJ1Y3RlZFRhYmxlU3RyaW5nID0gY29uc3RydWN0VE9NU3VtbWFyaWVzTG9va3VwVGFibGUocmV0dXJuUGFja2FnZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIHNldFBlbmRpbmdUb21Db21tYW5kKFwicmVhZHlcIik7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGNvbnN0cnVjdGVkVGFibGVTdHJpbmcgIT09IFwiXCIpIHtcclxuICAgICAgICAvLyBJbmplY3QgdGhlIGNvbnN0cnVjdGVkVGFibGVTdHJpbmcgaW50byB0aGUgbmV3ZXN0IGFzc2lzdGFudCBtZXNzYWdlLlxyXG4gICAgICAgIGFkZENvbnZlcnNhdGlvbk9wZXJhdGlvbihcclxuICAgICAgICAgICAgXCJ0cnlBcHBlbmRUYWJsZU9mTWVtb3JpZXNDb250ZW50RnVuY3Rpb25cIixcclxuICAgICAgICAgICAge1xyXG4gICAgICAgICAgICAgICAgY29uc3RydWN0ZWRUYWJsZVN0cmluZyxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICApO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0TWVtb3J5UGFja2FnZShcclxuICAgIHBhY2thZ2VUZXh0OiBzdHJpbmdcclxuKTogc3RyaW5nIHtcclxuICAgIGNvbnN0IG1lbW9yeUJsb2NrUmVnZXggPVxyXG4gICAgICAgIC9cXFtCRUdJTiAoW15cXF1dK1xcLmpzb24pXFxdKFtcXHNcXFNdKj8pXFxbRU5EIFxcMVxcXS9naTtcclxuXHJcbiAgICBjb25zdCBmb3JtYXR0ZWRNZW1vcmllczogc3RyaW5nW10gPSBbXTtcclxuICAgIGxldCBibG9ja01hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xyXG5cclxuICAgIHdoaWxlICgoYmxvY2tNYXRjaCA9IG1lbW9yeUJsb2NrUmVnZXguZXhlYyhwYWNrYWdlVGV4dCkpICE9PSBudWxsKSB7XHJcbiAgICAgICAgY29uc3Qgc291cmNlID0gYmxvY2tNYXRjaFsxXS50cmltKCk7XHJcbiAgICAgICAgY29uc3QgcGF5bG9hZCA9IGJsb2NrTWF0Y2hbMl0udHJpbSgpO1xyXG5cclxuICAgICAgICBjb25zdCBkYXRlTWF0Y2ggPSBwYXlsb2FkLm1hdGNoKFxyXG4gICAgICAgICAgICAvREFURTpcXHMqKC4qPykoPz1cXHMrVE9QSUNfXFxkKzp8JCkvaSxcclxuICAgICAgICApO1xyXG4gICAgICAgIGNvbnN0IGRhdGUgPSBkYXRlTWF0Y2g/LlsxXT8udHJpbSgpID8/IFwiRGF0ZSB1bmF2YWlsYWJsZVwiO1xyXG5cclxuICAgICAgICBjb25zdCB0b3BpY1JlZ2V4ID1cclxuICAgICAgICAgICAgL1RPUElDXyhcXGQrKTpcXHMqKFtcXHNcXFNdKj8pKD89XFxzK1RPUElDX1xcZCs6fCQpL2dpO1xyXG5cclxuICAgICAgICBjb25zdCByb3dzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgICAgIGxldCB0b3BpY01hdGNoOiBSZWdFeHBFeGVjQXJyYXkgfCBudWxsO1xyXG5cclxuICAgICAgICB3aGlsZSAoKHRvcGljTWF0Y2ggPSB0b3BpY1JlZ2V4LmV4ZWMocGF5bG9hZCkpICE9PSBudWxsKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHRvcGljTnVtYmVyID0gdG9waWNNYXRjaFsxXTtcclxuICAgICAgICAgICAgY29uc3Qgc2VjdGlvbiA9IHRvcGljTWF0Y2hbMl0udHJpbSgpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgdXNlck1hdGNoID0gL1xcYlVTRVJcXHMqOi9pLmV4ZWMoc2VjdGlvbik7XHJcbiAgICAgICAgICAgIGNvbnN0IGFzc2lzdGFudE1hdGNoID0gL1xcYkFTU0lTVEFOVFxccyo6L2kuZXhlYyhzZWN0aW9uKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGZpcnN0TWVzc2FnZUluZGV4ID0gW1xyXG4gICAgICAgICAgICAgICAgdXNlck1hdGNoPy5pbmRleCxcclxuICAgICAgICAgICAgICAgIGFzc2lzdGFudE1hdGNoPy5pbmRleCxcclxuICAgICAgICAgICAgXVxyXG4gICAgICAgICAgICAgICAgLmZpbHRlcigoaW5kZXgpOiBpbmRleCBpcyBudW1iZXIgPT4gaW5kZXggIT09IHVuZGVmaW5lZClcclxuICAgICAgICAgICAgICAgIC5yZWR1Y2UoXHJcbiAgICAgICAgICAgICAgICAgICAgKG1pbmltdW0sIGluZGV4KSA9PiBNYXRoLm1pbihtaW5pbXVtLCBpbmRleCksXHJcbiAgICAgICAgICAgICAgICAgICAgc2VjdGlvbi5sZW5ndGgsXHJcbiAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgdG9waWNUZXh0ID0gc2VjdGlvblxyXG4gICAgICAgICAgICAgICAgLnNsaWNlKDAsIGZpcnN0TWVzc2FnZUluZGV4KVxyXG4gICAgICAgICAgICAgICAgLnRyaW0oKTtcclxuXHJcbiAgICAgICAgICAgIGxldCB1c2VyVGV4dCA9IFwiXCI7XHJcbiAgICAgICAgICAgIGlmICh1c2VyTWF0Y2gpIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHVzZXJTdGFydCA9IHVzZXJNYXRjaC5pbmRleCArIHVzZXJNYXRjaFswXS5sZW5ndGg7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB1c2VyRW5kID1cclxuICAgICAgICAgICAgICAgICAgICBhc3Npc3RhbnRNYXRjaCAmJiBhc3Npc3RhbnRNYXRjaC5pbmRleCA+IHVzZXJNYXRjaC5pbmRleFxyXG4gICAgICAgICAgICAgICAgICAgICAgICA/IGFzc2lzdGFudE1hdGNoLmluZGV4XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDogc2VjdGlvbi5sZW5ndGg7XHJcblxyXG4gICAgICAgICAgICAgICAgdXNlclRleHQgPSBzZWN0aW9uLnNsaWNlKHVzZXJTdGFydCwgdXNlckVuZCkudHJpbSgpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBsZXQgYXNzaXN0YW50VGV4dCA9IFwiXCI7XHJcbiAgICAgICAgICAgIGlmIChhc3Npc3RhbnRNYXRjaCkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgYXNzaXN0YW50U3RhcnQgPVxyXG4gICAgICAgICAgICAgICAgICAgIGFzc2lzdGFudE1hdGNoLmluZGV4ICsgYXNzaXN0YW50TWF0Y2hbMF0ubGVuZ3RoO1xyXG5cclxuICAgICAgICAgICAgICAgIGFzc2lzdGFudFRleHQgPSBzZWN0aW9uLnNsaWNlKGFzc2lzdGFudFN0YXJ0KS50cmltKCk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHJvd3MucHVzaChcclxuICAgICAgICAgICAgICAgIGB8ICoqVE9QSUMgJHt0b3BpY051bWJlcn0qKiB8ICR7ZXNjYXBlQ2VsbCh0b3BpY1RleHQpfSB8YCxcclxuICAgICAgICAgICAgICAgIGB8ICoqVVNFUioqIHwgJHtlc2NhcGVDZWxsKHVzZXJUZXh0KX0gfGAsXHJcbiAgICAgICAgICAgICAgICBgfCAqKkFTU0lTVEFOVCoqIHwgJHtlc2NhcGVDZWxsKGFzc2lzdGFudFRleHQpfSB8YCxcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZvcm1hdHRlZE1lbW9yaWVzLnB1c2goXHJcbiAgICAgICAgICAgIFtcclxuICAgICAgICAgICAgICAgICdcdUQ4M0RcdURDRTYgKipgTWVtb3J5IFBhY2thZ2VgKionLFxyXG4gICAgICAgICAgICAgICAgYCMjIyAke3NvdXJjZX1gLFxyXG4gICAgICAgICAgICAgICAgYCoqREFURToqKiAke2VzY2FwZUNlbGwoZGF0ZSl9YCxcclxuICAgICAgICAgICAgICAgIFwiXCIsXHJcbiAgICAgICAgICAgICAgICBcInwgRmllbGQgfCBDb250ZW50IHxcIixcclxuICAgICAgICAgICAgICAgIFwifC0tLXwtLS18XCIsXHJcbiAgICAgICAgICAgICAgICAuLi5yb3dzLFxyXG4gICAgICAgICAgICBdLmpvaW4oXCJcXG5cIiksXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZm9ybWF0dGVkTWVtb3JpZXMuam9pbihcIlxcblxcblwiKTtcclxuXHJcbiAgICBmdW5jdGlvbiBlc2NhcGVDZWxsKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcge1xyXG4gICAgICAgIHJldHVybiB2YWx1ZVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvXFx8L2csIFwiXFxcXHxcIilcclxuICAgICAgICAgICAgLnJlcGxhY2UoL1xccj9cXG4vZywgXCI8YnI+XCIpO1xyXG4gICAgfVxyXG59XHJcblxyXG5cclxuLy8gU2Vjb25kIGZpbHRlciB0byB2YWxpZGF0ZSBhIHNlYXJjaCBjb21tYW5kIGFuZCBleHRyYWN0IFxyXG4vLyB0aGUgc2VhcmNoIHF1ZXJ5IHdoaWNoIHdpbGwgYmUgZmVkIHRvIGNvbXBhcmUgdG8ga2V5d29yZHMgYW5kIHN1bW1hcmllc1xyXG4vLyBMb3cgY29zdCBoeWJyaWQgYXBwcm9hY2ggcmF0aGVyIHRoYW4gdHJ5IGFuZCBwcmVkaWN0IGV2ZXJ5IGZvcm1hdHRpbmcgYSB1c2VyIG1heSBcclxuLy8gd2VhdmUgdGhlaXIgYWN0dWFsIHF1ZXJ5IGluIGR1cmluZyBhIHNhdmUgY29tbWFuZC5cclxuYXN5bmMgZnVuY3Rpb24gYXNrTW9kZWxUb1ZhbGlkYXRlRnV6enlTZWFyY2hSZWdleEFuZEV4dHJhY3RRdWVyeShcclxuICAgIHVzZXJUZXh0OiBzdHJpbmcsXHJcbik6UHJvbWlzZTxzdHJpbmc+IHtcclxuICAgIGNvbnN0IGNsaWVudCA9IGdldENvbnRyb2xsZXIoKS5jbGllbnQ7XHJcbiAgICBjb25zdCBtb2RlbCA9IGF3YWl0IGNsaWVudC5sbG0ubW9kZWwoKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJvbXB0ID0gYFxyXG4gICAgICAgIFRoZSB1c2VyIGhhcyBwcm92aWRlZCBhIHRleHQgd2hpY2ggbWF5IGJlIGEgcmVxdWVzdCBvciBjb21tYW5kIHRvIHJlY2FsbCwgZmluZCwgb3IgYW55IHN5bm9ueW0gb2YgJ3NlYXJjaCcgZm9yIGEgTUVNT1JZIE9SIE1FTU9SSUVTLiBcclxuXHJcbiAgICAgICAgRXh0cmFjdCB0aGUgc3ViamVjdCBvciBwaHJhc2Ugb2Ygd2hhdCB0aGV5IGFyZSB0cnlpbmcgdG8gc2VhcmNoIGZvci4gRG8gbm90IGluY2x1ZGUgdGhlIHNlYXJjaCBjb21tYW5kIHdpdGhpbiB5b3VyIHJldHVybmVkIHN0cmluZyBvZiB0aGUgc2VhcmNoIHF1ZXJ5IHlvdSBoYXZlIGV4dHJhY3RlZC5cclxuXHJcbiAgICAgICAgSWYgdGhpcyB3YXMgbm90IGEgdmFsaWQgc2VhcmNoIHF1ZXJ5IHJldHVybiBhbiBlbXB0eSBzdHJpbmcuXHJcblxyXG4gICAgICAgIFtCRUdJTk5JTkcgT0YgVVNFUiBURVhUXTogXHJcbiAgICAgICAgJHt1c2VyVGV4dH1cclxuICAgICAgICBbRU5EIE9GIFVTRVIgVEVYVF1cclxuICAgICAgICBgLnRyaW0oKTtcclxuXHJcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBtb2RlbC5yZXNwb25kKFxyXG4gICAgICAgIHByb21wdCxcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRlbXBlcmF0dXJlOiAwLFxyXG4gICAgICAgIH0sXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IGNsZWFuZWRUZXh0ID0gcmVzdWx0LmNvbnRlbnRcclxuICAgICAgICAucmVwbGFjZShcclxuICAgICAgICAgICAgL15bXFxzXFxTXSo/X19MTV9TVFVESU9fSU5URVJOQUxfTFNFUF9TWU5USEVUSUNfUkVBU09OSU5HX0VORF9bQS1aYS16MC05XStfXy9pLFxyXG4gICAgICAgICAgICBcIlwiLFxyXG4gICAgICAgIClcclxuICAgICAgICAucmVwbGFjZSgvXltcXHNcXFNdKj9gYGAoPzpqc29uKT9cXHMqL2ksIFwiXCIpXHJcbiAgICAgICAgLnJlcGxhY2UoL1xccypgYGBbXFxzXFxTXSokL2ksIFwiXCIpXHJcbiAgICAgICAgLnRyaW0oKTtcclxuXHJcbiAgICByZXR1cm4gY2xlYW5lZFRleHQ7XHJcbn1cclxuXHJcbi8vIEV4dHJhY3RzIHRoZSBUT00gc3VmZml4IGlkZW50aWZpZXIgZm9yIFRPTSBmaWxlIG9mIGludGVyZXN0XHJcbmZ1bmN0aW9uIGV4dHJhY3RNZW1vcnlSYW5nZShpbnB1dDogc3RyaW5nKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgICBcclxuICAgIGNvbnN0IE1FTU9SWV9SQU5HRV9SRUdFWCA9IGdldE1lbW9yeVJhbmdlUmVnZXgoKTtcclxuICAgIFxyXG4gICAgY29uc3QgbWF0Y2ggPSBpbnB1dC5tYXRjaChNRU1PUllfUkFOR0VfUkVHRVgpO1xyXG4gICAgaWYgKCFtYXRjaCkgcmV0dXJuIG51bGw7XHJcblxyXG4gICAgY29uc3QgbGV0dGVycyA9IG1hdGNoWzFdLnJlcGxhY2UoL1tcXHMtXS9nLCBcIlwiKS50b0xvd2VyQ2FzZSgpO1xyXG5cclxuICAgIGlmICghL15bYS16XXsyfSQvLnRlc3QobGV0dGVycykpIHJldHVybiBudWxsO1xyXG5cclxuICAgIGNvbnN0IFtzdGFydCwgZW5kXSA9IGxldHRlcnM7XHJcblxyXG4gICAgY29uc3QgZmlyc3QgPSBUT01fUkFOR0VTLmZpcnN0O1xyXG4gICAgaWYgKG5ldyBSZWdFeHAoYFske2ZpcnN0LnN0YXJ0fS0ke2ZpcnN0LmVuZH1dYCwgXCJpXCIpLnRlc3Qoc3RhcnQpICYmXHJcbiAgICAgICAgbmV3IFJlZ0V4cChgWyR7Zmlyc3Quc3RhcnR9LSR7Zmlyc3QuZW5kfV1gLCBcImlcIikudGVzdChlbmQpKVxyXG4gICAgICAgIHJldHVybiBgJHtmaXJzdC5zdGFydH0tJHtmaXJzdC5lbmR9YC50b0xvd2VyQ2FzZSgpO1xyXG5cclxuICAgIGNvbnN0IHNlY29uZCA9IFRPTV9SQU5HRVMuc2Vjb25kO1xyXG4gICAgaWYgKG5ldyBSZWdFeHAoYFske3NlY29uZC5zdGFydH0tJHtzZWNvbmQuZW5kfV1gLCBcImlcIikudGVzdChzdGFydCkgJiZcclxuICAgICAgICBuZXcgUmVnRXhwKGBbJHtzZWNvbmQuc3RhcnR9LSR7c2Vjb25kLmVuZH1dYCwgXCJpXCIpLnRlc3QoZW5kKSlcclxuICAgICAgICByZXR1cm4gYCR7c2Vjb25kLnN0YXJ0fS0ke3NlY29uZC5lbmR9YC50b0xvd2VyQ2FzZSgpO1xyXG5cclxuICAgIGNvbnN0IHNwZWNpYWwgPSBUT01fUkFOR0VTLnNwZWNpYWw7XHJcbiAgICBpZiAobmV3IFJlZ0V4cChgWyR7c3BlY2lhbC5zdGFydH0tJHtzcGVjaWFsLmVuZH1dYCwgXCJpXCIpLnRlc3Qoc3RhcnQpICYmXHJcbiAgICAgICAgbmV3IFJlZ0V4cChgWyR7c3BlY2lhbC5zdGFydH0tJHtzcGVjaWFsLmVuZH1dYCwgXCJpXCIpLnRlc3QoZW5kKSlcclxuICAgICAgICByZXR1cm4gYCR7c3BlY2lhbC5zdGFydH0tJHtzcGVjaWFsLmVuZH1gLnRvTG93ZXJDYXNlKCk7XHJcblxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4vLyBUQUJMRSBPRiBNRU1PUklFUyBGSUxFIE1BSU5UQU5FTkNFXHJcbi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuLy8gQ3JlYXRlcyB0aGUgdGhyZWUgVE9NIGZpbGVzXHJcbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVRhYmxlT2ZNZW1vcmllcyhcclxuICAgIG1lbW9yaWVzRGlyZWN0b3J5OiBzdHJpbmcsXHJcbik6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgdGFibGVOYW1lcyA9IFtcclxuICAgICAgICBgVE9NXyR7VE9NX1JBTkdFUy5maXJzdC5zdGFydH0tJHtUT01fUkFOR0VTLmZpcnN0LmVuZH0uanNvbmAsXHJcbiAgICAgICAgYFRPTV8ke1RPTV9SQU5HRVMuc2Vjb25kLnN0YXJ0fS0ke1RPTV9SQU5HRVMuc2Vjb25kLmVuZH0uanNvbmAsXHJcbiAgICAgICAgYFRPTV8ke1RPTV9SQU5HRVMuc3BlY2lhbC5zdGFydH0tJHtUT01fUkFOR0VTLnNwZWNpYWwuZW5kfS5qc29uYCwgLy8gU3BlY2lhbCBjaGFyYWN0ZXJzIHdpbGwgbGl2ZSBpbiBSLVouXHJcbiAgICBdO1xyXG5cclxuICAgIGZvciAoY29uc3QgdGFibGVOYW1lIG9mIHRhYmxlTmFtZXMpIHtcclxuICAgICAgICBjb25zdCBmaWxlUGF0aCA9IGpvaW4obWVtb3JpZXNEaXJlY3RvcnksIHRhYmxlTmFtZSk7XHJcblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIC8vIFwid3hcIiBjcmVhdGVzIHRoZSBmaWxlIG9ubHkgaWYgaXQgZG9lcyBub3QgYWxyZWFkeSBleGlzdC5cclxuICAgICAgICAgICAgYXdhaXQgd3JpdGVGaWxlKGZpbGVQYXRoLCBcIltdXCIsIHtcclxuICAgICAgICAgICAgICAgIGVuY29kaW5nOiBcInV0Zi04XCIsXHJcbiAgICAgICAgICAgICAgICBmbGFnOiBcInd4XCIsXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgLy8gY29uc29sZS5sb2coYENyZWF0ZWQgdGFibGUgb2YgbWVtb3JpZXM6ICR7ZmlsZVBhdGh9YCk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgY29uc3QgZnNFcnJvciA9IGVycm9yIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcclxuXHJcbiAgICAgICAgICAgIGlmIChmc0Vycm9yLmNvZGUgPT09IFwiRUVYSVNUXCIpIHtcclxuICAgICAgICAgICAgICAgIC8vIEZpbGUgYWxyZWFkeSBleGlzdHM7IGxlYXZlIGl0IHVudG91Y2hlZC5cclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFxyXG4gICAgICAgICAgICAgICAgYEZhaWxlZCB0byBjcmVhdGUgdGFibGUgb2YgbWVtb3JpZXMgXCIke2ZpbGVQYXRofVwiOmAsXHJcbiAgICAgICAgICAgICAgICBlcnJvcixcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vIFdpbGwgcG9wdWxhdGUgdGhlIFRPTSBmaWxlcyB3aXRoIGFsbCBleGlzaXRpbmcgbWVtb3JpZXNcclxuLy8gU2hvdWxkIG5vdCBiZSBydW4gb2Z0ZW4gb3IgYXV0b21hdGljYWxseSwgZXhwZW5zaXZlXHJcbmFzeW5jIGZ1bmN0aW9uIGluaXRpYWxpemVUYWJsZU9mTWVtb3JpZXNGcm9tTGVnYWN5UGx1Z2luVmVyc2lvbihcclxuICAgIG1lbW9yaWVzRGlyZWN0b3J5OiBzdHJpbmcsXHJcbik6IFByb21pc2U8dm9pZD4ge1xyXG5cclxuICAgIGNvbnN0IGZ1bmN0aW9uTmFtZSA9IFwiaW5pdGlhbGl6ZVRhYmxlT2ZNZW1vcmllc0Zyb21MZWdhY3lQbHVnaW5WZXJzaW9uXCI7XHJcblxyXG4gICAgLy8gVGhpcyBpcyB0byBkaXNjb25uZWN0IHRoZSBpbml0aWFsaXphdGlvbiBmcm9tIHRoZSBtYWluIHByb2Nlc3Mgc28gdGhhdCBxdWVyeWluZyB0aGUgXHJcbiAgICAvLyBtb2RlbCB0byBkZXRlcm1pbmUgdGhlIGtleXdvcmRzIGFuZCBzdW1tYXJ5IGRvIG5vdCBzdGFsbCB0aGUgY2hhdFxyXG4gICAgc2V0VGltZW91dCgoKSA9PiB7XHJcbiAgICAgICAgdm9pZCBydW5Jbml0aWFsaXphdGlvbigpLmNhdGNoKChlcnJvcikgPT4ge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFxyXG4gICAgICAgICAgICAgICAgYCR7ZnVuY3Rpb25OYW1lfSBmYWlsZWQ6YCxcclxuICAgICAgICAgICAgICAgIGVycm9yLFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSwgMCk7XHJcblxyXG4gICAgYXN5bmMgZnVuY3Rpb24gcnVuSW5pdGlhbGl6YXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICAgICAgY29uc3QgY2F0ZWdvcmllcyA9IGF3YWl0IHJlYWRkaXIoXHJcbiAgICAgICAgICAgIG1lbW9yaWVzRGlyZWN0b3J5LFxyXG4gICAgICAgICAgICB7IHdpdGhGaWxlVHlwZXM6IHRydWUgfSxcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IGNhdGVnb3J5IG9mIGNhdGVnb3JpZXMpIHtcclxuICAgICAgICAgICAgaWYgKCFjYXRlZ29yeS5pc0RpcmVjdG9yeSgpKSB7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc3QgY2F0ZWdvcnlQYXRoID0gcGF0aC5qb2luKFxyXG4gICAgICAgICAgICAgICAgbWVtb3JpZXNEaXJlY3RvcnksXHJcbiAgICAgICAgICAgICAgICBjYXRlZ29yeS5uYW1lLFxyXG4gICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZmlsZXMgPSBhd2FpdCByZWFkZGlyKFxyXG4gICAgICAgICAgICAgICAgY2F0ZWdvcnlQYXRoLFxyXG4gICAgICAgICAgICAgICAgeyB3aXRoRmlsZVR5cGVzOiB0cnVlIH0sXHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBmaXJzdENoYXJhY3RlciA9IGNhdGVnb3J5Lm5hbWVbMF0udG9VcHBlckNhc2UoKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHRvbUZpbGVOYW1lID1cclxuICAgICAgICAgICAgICAgIGZpcnN0Q2hhcmFjdGVyID49IGAke1RPTV9SQU5HRVMuZmlyc3Quc3RhcnR9YCAmJiBmaXJzdENoYXJhY3RlciA8PSBgJHtUT01fUkFOR0VTLmZpcnN0LmVuZH1gXHJcbiAgICAgICAgICAgICAgICAgICAgPyBgVE9NXyR7VE9NX1JBTkdFUy5maXJzdC5zdGFydH0tJHtUT01fUkFOR0VTLmZpcnN0LmVuZH0uanNvbmBcclxuICAgICAgICAgICAgICAgICAgICA6IGZpcnN0Q2hhcmFjdGVyID49IGAke1RPTV9SQU5HRVMuc2Vjb25kLnN0YXJ0fWAgJiYgZmlyc3RDaGFyYWN0ZXIgPD0gYCR7VE9NX1JBTkdFUy5zZWNvbmQuZW5kfWBcclxuICAgICAgICAgICAgICAgICAgICAgICAgPyBgVE9NXyR7VE9NX1JBTkdFUy5zZWNvbmQuc3RhcnR9LSR7VE9NX1JBTkdFUy5zZWNvbmQuZW5kfS5qc29uYFxyXG4gICAgICAgICAgICAgICAgICAgICAgICA6IGBUT01fJHtUT01fUkFOR0VTLnNwZWNpYWwuc3RhcnR9LSR7VE9NX1JBTkdFUy5zcGVjaWFsLmVuZH0uanNvbmA7XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0b21GaWxlUGF0aCA9IHBhdGguam9pbihcclxuICAgICAgICAgICAgICAgIG1lbW9yaWVzRGlyZWN0b3J5LFxyXG4gICAgICAgICAgICAgICAgdG9tRmlsZU5hbWUsXHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBsZXQgbG9ja093bmVyTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgbG9ja0ZpbGUgPSBgJHt0b21GaWxlUGF0aH0ubG9ja2A7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICBsb2NrT3duZXJOYW1lID0gYXdhaXQgYWNxdWlyZUxvY2sobG9ja0ZpbGUsIGZ1bmN0aW9uTmFtZSk7XHJcblxyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAhZmlsZS5pc0ZpbGUoKSB8fFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAhZmlsZS5uYW1lLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoXCIuanNvblwiKVxyXG4gICAgICAgICAgICAgICAgICAgICkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVOYW1lID0gYCR7Y2F0ZWdvcnkubmFtZX0vJHtmaWxlLm5hbWV9YDtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBtZW1vcnlGaWxlUGF0aCA9IHBhdGguam9pbihcclxuICAgICAgICAgICAgICAgICAgICAgICAgY2F0ZWdvcnlQYXRoLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBmaWxlLm5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgbWVtb3J5U3RhdHMgPSBhd2FpdCBzdGF0KG1lbW9yeUZpbGVQYXRoKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZmlsZVNpemVLQiA9IG1lbW9yeVN0YXRzLnNpemUgLyAxMDI0O1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHRhYmxlT2ZNZW1vcmllczogVGFibGVPZk1lbW9yaWVzRW50aXR5W10gPSBbXTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0b21Db250ZW50ID0gYXdhaXQgcmVhZEZpbGUoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdG9tRmlsZVBhdGgsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ1dGYtOFwiLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YWJsZU9mTWVtb3JpZXMgPSBKU09OLnBhcnNlKHRvbUNvbnRlbnQpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZnNFcnJvciA9IGVycm9yIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoZnNFcnJvci5jb2RlICE9PSBcIkVOT0VOVFwiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nSW5kZXggPSB0YWJsZU9mTWVtb3JpZXMuZmluZEluZGV4KFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKGVudHJ5KSA9PiBlbnRyeS5maWxlTmFtZSA9PT0gZmlsZU5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBTa2lwIGluaXRpYWxpemF0aW9uIGlmIHRoZSBzdG9yZWQgS0Igc2l6ZSBtYXRjaGVzLlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBleGlzdGluZ0luZGV4ICE9PSAtMSAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFibGVPZk1lbW9yaWVzW2V4aXN0aW5nSW5kZXhdLmZpbGVTaXplS0IgPT09IGZpbGVTaXplS0JcclxuICAgICAgICAgICAgICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gTWlzc2luZyBlbnRyeSBvciBjaGFuZ2VkIGZpbGUgc2l6ZTogcmVpbml0aWFsaXplLlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBtZW1vcnlGcmFnbWVudHMgPVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgcmVjb25zdHJ1Y3RNZW1vcnlGcmFnbWVudHMobWVtb3J5RmlsZVBhdGgpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3VtbWFyeVJldHVyblBhY2thZ2UgPVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgbW9kZWxDYWxsVG9DcmFmdE1lbW9yeVN1bW1hcnlBbmRLZXl3b3JkcyhtZW1vcnlGcmFnbWVudHMpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgeyBzdW1tYXJ5LCBrZXl3b3JkcyB9ID1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4dHJhY3RTdW1tYXJ5QW5kS2V5d29yZHMoc3VtbWFyeVJldHVyblBhY2thZ2UpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZW50aXR5OiBUYWJsZU9mTWVtb3JpZXNFbnRpdHkgPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBmaWxlU2l6ZUtCLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZmlsZU5hbWUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBrZXl3b3JkcyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN1bW1hcnksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH07XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZXhpc3RpbmdJbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhYmxlT2ZNZW1vcmllc1tleGlzdGluZ0luZGV4XSA9IGVudGl0eTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhYmxlT2ZNZW1vcmllcy5wdXNoKGVudGl0eSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHdyaXRlRmlsZShcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRvbUZpbGVQYXRoLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkodGFibGVPZk1lbW9yaWVzLCBudWxsLCA0KSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFwidXRmLThcIixcclxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYEZhaWxlZCB0byBpbml0aWFsaXplIFwiJHtmaWxlTmFtZX1cIiBpbiAke3RvbUZpbGVOYW1lfTpgLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3IsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgICAgICAgICAgaWYgKGxvY2tPd25lck5hbWUgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHJlbGVhc2VMb2NrKGxvY2tGaWxlLCBsb2NrT3duZXJOYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICBsb2NrT3duZXJOYW1lID0gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG4vLyBVc2UgbW9kZWwgdG8gY3JhZnQgdGhlIHN1bW1hcnkgYW5kIGtleXdvcmRzIGZvciB0aGUgVE9NIGZpbGVzXHJcbmFzeW5jIGZ1bmN0aW9uIG1vZGVsQ2FsbFRvQ3JhZnRNZW1vcnlTdW1tYXJ5QW5kS2V5d29yZHMoXHJcbiAgICBtZW1vcnlGcmFnbWVudHM6IHN0cmluZyxcclxuKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuICAgIGNvbnN0IGNsaWVudCA9IGdldENvbnRyb2xsZXIoKS5jbGllbnQ7XHJcbiAgICBjb25zdCBtb2RlbCA9IGF3YWl0IGNsaWVudC5sbG0ubW9kZWwoKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJvbXB0ID0gYFxyXG4gICAgICAgIFRoZSB1c2VyIG5lZWRzIHlvdSB0aGUgYXNzaXN0YW50IHRvIGZvcm11bGF0ZSBhIHRob3JvdWdoIHN1bW1hcnkgb2YgdGhlIHByb3ZpZGVkIFVzZXIgYW5kIEFzc2lzdGFudCBtZXNzYWdlIGhpc3RvcnkuXHJcblxyXG4gICAgICAgIEVuc3VyZSB0aGF0IHRoZSBmaW5hbCBzdW1tYXJ5IHlvdSBwcm92aWRlIGlzIGEgZmFpciByZXByZXNlbnRhdGlvbiBvZiB0aGUgb3ZlcmFsbCBtZXNzYWdlIGhpc3RvcnkuIFdyYXAgeW91ciBmaW5hbCBzdW1tYXJ5IGluIHRoZSBleGFjdCB0YWdzIG9mIFtCRUdJTk5JTkdfT0ZfU1VNTUFSWV0gYW5kIFtFTkRfT0ZfU1VNTUFSWV0uXHJcblxyXG4gICAgICAgIEluIGFkZGl0aW9uIHRvIHRoZSBzdW1tYXJ5LCBpZGVudGlmeSBzaWduaWZpY2FudCBrZXl3b3JkcyB3aGljaCBhcmUgcmVsZXZhbnQgdG8gdGhpcyB1c2VyIGFuZCBhc3Npc3RhbnQgbWVzc2FnZSBleGNoYW5nZS4gVGhlc2Uga2V5d29yZHMgd2lsbCBzZXJ2ZSBhcyBhIHF1aWNrIGxvb2t1cCB0byBkZXRlcm1pbmUgdGhlIHJlbGV2YW5jeSBvZiB0aGlzIG1lc3NhZ2UgaGlzdG9yeS5cclxuXHJcbiAgICAgICAgRmV3ZXIga2V5d29yZHMgaXMgYmV0dGVyLCBzbyBtYWtlIHN1cmUgdGhlIGtleXdvcmRzIHlvdSBoYXZlIGNob3NlbiBhcmUgaW1wYWN0ZnVsLCByZWxldmFudCwgYW5kIHNpZ25pZmljYW50LiBXcmFwIHRoZSBjb2xsZWN0aW9uIG9mIGtleXdvcmRzIGlkZW50aWZpZWQgaW4gdGhlIGV4YWN0IHRhZ3Mgb2YgW0JFR0lOTklOR19PRl9LRVlXT1JEU10gYW5kIFtFTkRfT0ZfS0VZV09SRFNdLlxyXG5cclxuICAgICAgICBJZiB0aGVyZSBhcmUgbm8gc2lnbmlmaWNhbnQgb3IgbWVhbmluZ2Z1bCBrZXl3b3JkcyBpdCBpcyBhY2NlcHRhYmxlIHRvIHJldHVybiBhbiBlbXB0eSBzdHJpbmcgZW5jbG9zZWQgYnkgdGhlIHJlbGV2YW50IHRhZ3MuXHJcblxyXG4gICAgICAgIElmIHRoZXJlIGlzIG5vIHNpZ25pZmljYW50IG9yIG1lYW5pbmdmdWwgc3VtbWFyeSBpdCBpcyBhY2NlcHRhYmxlIHRvIHJldHVybiBhbiBlbXB0eSBzdHJpbmcgZW5jbG9zZWQgYnkgdGhlIHJlbGV2YW50IHRhZ3MuXHJcblxyXG4gICAgICAgIFtCRUdJTk5JTkcgT0YgTUVTU0FHRSBISVNUT1JZXTogXHJcbiAgICAgICAgJHttZW1vcnlGcmFnbWVudHN9XHJcbiAgICAgICAgW0VORCBPRiBNRVNTQUdFIEhJU1RPUlldXHJcbiAgICAgICAgYC50cmltKCk7XHJcblxyXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgbW9kZWwucmVzcG9uZChcclxuICAgICAgICBwcm9tcHQsXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0ZW1wZXJhdHVyZTogMCxcclxuICAgICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBjbGVhbmVkVGV4dCA9IHJlc3VsdC5jb250ZW50XHJcbiAgICAgICAgLnJlcGxhY2UoXHJcbiAgICAgICAgICAgIC9eW1xcc1xcU10qP19fTE1fU1RVRElPX0lOVEVSTkFMX0xTRVBfU1lOVEhFVElDX1JFQVNPTklOR19FTkRfW0EtWmEtejAtOV0rX18vaSxcclxuICAgICAgICAgICAgXCJcIixcclxuICAgICAgICApXHJcbiAgICAgICAgLnJlcGxhY2UoL15bXFxzXFxTXSo/YGBgKD86anNvbik/XFxzKi9pLCBcIlwiKVxyXG4gICAgICAgIC5yZXBsYWNlKC9cXHMqYGBgW1xcc1xcU10qJC9pLCBcIlwiKVxyXG4gICAgICAgIC50cmltKCk7XHJcblxyXG4gICAgcmV0dXJuIGNsZWFuZWRUZXh0O1xyXG59XHJcblxyXG4vLyBVc2UgbW9kZWwgdG8gZXh0cmFjdCBTdW1tYXJ5IGFuZCBLZXl3b3JkcyByZXR1cm5lZCBieSB0aGUgbW9kZWxcclxuLy8gaW4gYSBzaW5nbGUgc3RyaW5nIGludG8gc2VwYXJhdGUgZmllbGRzIGJhc2VkIG9uIHRoZSBzZXBlcmF0aW9uIHRhZ3Mgd2UgYXNrZWQgdGhlIG1vZGVsIHRvIGFwcGVuZFxyXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdFN1bW1hcnlBbmRLZXl3b3JkcyhcclxuICAgIHJlc3BvbnNlOiBzdHJpbmcsXHJcbik6IHsgc3VtbWFyeTogc3RyaW5nOyBrZXl3b3Jkczogc3RyaW5nIH0ge1xyXG4gICAgY29uc3Qgbm9ybWFsaXplVGFnID0gKHRhZzogc3RyaW5nKTogc3RyaW5nID0+XHJcbiAgICAgICAgdGFnXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXFxzXy1dKy9nLCBcIlwiKVxyXG4gICAgICAgICAgICAudG9VcHBlckNhc2UoKTtcclxuXHJcbiAgICBjb25zdCB0YWdQYXR0ZXJuID1cclxuICAgICAgICAvXFxbXFxzKihCRUdJTk5JTkdbXFxzXy1dKk9GW1xcc18tXSooPzpTVU1NQVJZfEtFWVdPUkRTKXxFTkRbXFxzXy1dKk9GW1xcc18tXSooPzpTVU1NQVJZfEtFWVdPUkRTKXxTVU1NQVJZfEtFWVdPUkRTKVxccypcXF0vZ2k7XHJcblxyXG4gICAgY29uc3QgdGFnczoge1xyXG4gICAgICAgIHR5cGU6IFwic3VtbWFyeVwiIHwgXCJrZXl3b3Jkc1wiO1xyXG4gICAgICAgIGtpbmQ6IFwiYmVnaW5cIiB8IFwiZW5kXCI7XHJcbiAgICAgICAgc3RhcnQ6IG51bWJlcjtcclxuICAgICAgICBjb250ZW50U3RhcnQ6IG51bWJlcjtcclxuICAgIH1bXSA9IFtdO1xyXG5cclxuICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgcmVzcG9uc2UubWF0Y2hBbGwodGFnUGF0dGVybikpIHtcclxuICAgICAgICBjb25zdCByYXdUYWcgPSBub3JtYWxpemVUYWcobWF0Y2hbMV0pO1xyXG4gICAgICAgIGNvbnN0IHR5cGUgPSByYXdUYWcuZW5kc1dpdGgoXCJTVU1NQVJZXCIpXHJcbiAgICAgICAgICAgID8gXCJzdW1tYXJ5XCJcclxuICAgICAgICAgICAgOiBcImtleXdvcmRzXCI7XHJcblxyXG4gICAgICAgIGNvbnN0IGtpbmQgPVxyXG4gICAgICAgICAgICByYXdUYWcuc3RhcnRzV2l0aChcIkJFR0lOTklOR09GXCIpIHx8XHJcbiAgICAgICAgICAgIHJhd1RhZyA9PT0gdHlwZS50b1VwcGVyQ2FzZSgpXHJcbiAgICAgICAgICAgICAgICA/IFwiYmVnaW5cIlxyXG4gICAgICAgICAgICAgICAgOiBcImVuZFwiO1xyXG5cclxuICAgICAgICB0YWdzLnB1c2goe1xyXG4gICAgICAgICAgICB0eXBlLFxyXG4gICAgICAgICAgICBraW5kLFxyXG4gICAgICAgICAgICBzdGFydDogbWF0Y2guaW5kZXghLFxyXG4gICAgICAgICAgICBjb250ZW50U3RhcnQ6IG1hdGNoLmluZGV4ISArIG1hdGNoWzBdLmxlbmd0aCxcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByZXN1bHQgPSB7XHJcbiAgICAgICAgc3VtbWFyeTogXCJcIixcclxuICAgICAgICBrZXl3b3JkczogXCJcIixcclxuICAgIH07XHJcblxyXG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0YWdzLmxlbmd0aDsgaSsrKSB7XHJcbiAgICAgICAgY29uc3QgdGFnID0gdGFnc1tpXTtcclxuXHJcbiAgICAgICAgaWYgKHRhZy5raW5kICE9PSBcImJlZ2luXCIpIHtcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBGaW5kIHRoZSBuZXh0IG9wZW5pbmcgdGFnIG9mIGVpdGhlciBzZWN0aW9uLlxyXG4gICAgICAgIGNvbnN0IG5leHRCZWdpbiA9IHRhZ3NcclxuICAgICAgICAgICAgLnNsaWNlKGkgKyAxKVxyXG4gICAgICAgICAgICAuZmluZCgobmV4dCkgPT4gbmV4dC5raW5kID09PSBcImJlZ2luXCIpO1xyXG5cclxuICAgICAgICAvLyBQcmVmZXIgdGhlIG1hdGNoaW5nIGNsb3NpbmcgdGFnIGlmIGl0IG9jY3VycyBmaXJzdC5cclxuICAgICAgICBjb25zdCBtYXRjaGluZ0VuZCA9IHRhZ3NcclxuICAgICAgICAgICAgLnNsaWNlKGkgKyAxKVxyXG4gICAgICAgICAgICAuZmluZChcclxuICAgICAgICAgICAgICAgIChuZXh0KSA9PlxyXG4gICAgICAgICAgICAgICAgICAgIG5leHQudHlwZSA9PT0gdGFnLnR5cGUgJiZcclxuICAgICAgICAgICAgICAgICAgICBuZXh0LmtpbmQgPT09IFwiZW5kXCIsXHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgIGNvbnN0IGJvdW5kYXJ5ID1cclxuICAgICAgICAgICAgbWF0Y2hpbmdFbmQgJiZcclxuICAgICAgICAgICAgKCFuZXh0QmVnaW4gfHwgbWF0Y2hpbmdFbmQuc3RhcnQgPCBuZXh0QmVnaW4uc3RhcnQpXHJcbiAgICAgICAgICAgICAgICA/IG1hdGNoaW5nRW5kLnN0YXJ0XHJcbiAgICAgICAgICAgICAgICA6IG5leHRCZWdpbj8uc3RhcnQgPz8gcmVzcG9uc2UubGVuZ3RoO1xyXG5cclxuICAgICAgICByZXN1bHRbdGFnLnR5cGVdID0gcmVzcG9uc2VcclxuICAgICAgICAgICAgLnNsaWNlKHRhZy5jb250ZW50U3RhcnQsIGJvdW5kYXJ5KVxyXG4gICAgICAgICAgICAudHJpbSgpO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbi8vIEhlbHBlciB0byByZWNvbnN0cnVjdCB0aGUgbWVtb3J5IGZpbGUncyBjb250ZW50cyBpbnRvIGEgY29oZXJlbnQgVXNlci9Bc3Npc3RhbnQgVHVyblxyXG4vLyBmb3IgdGhlIG1vZGVsIHRvIGRpZ2VzdCB0byBjcmFmdCBhIHN1bW1hcnkgYW5kIGNob29zZSBrZXl3b3Jkcy5cclxuYXN5bmMgZnVuY3Rpb24gcmVjb25zdHJ1Y3RNZW1vcnlGcmFnbWVudHMoXHJcbiAgICBtZW1vcnlGaWxlUGF0aDogc3RyaW5nLFxyXG4pOiBQcm9taXNlPHN0cmluZz4ge1xyXG4gICAgY29uc3QgY29udGVudCA9IGF3YWl0IHJlYWRGaWxlKG1lbW9yeUZpbGVQYXRoLCBcInV0Zi04XCIpO1xyXG4gICAgY29uc3QgdHVybnM6IE1lbW9yeVR1cm5bXSA9IEpTT04ucGFyc2UoY29udGVudCk7XHJcblxyXG4gICAgcmV0dXJuIHR1cm5zXHJcbiAgICAgICAgLm1hcChcclxuICAgICAgICAgICAgKHR1cm4sIGluZGV4KSA9PlxyXG4gICAgICAgICAgICAgICAgYFtUdXJuICR7aW5kZXggKyAxfV0gVXNlcjogJHt0dXJuLmRpcmVjdF9pbnB1dH1cXG5gICtcclxuICAgICAgICAgICAgICAgIGBBc3Npc3RhbnQ6ICR7dHVybi5vdXRwdXR9YCxcclxuICAgICAgICApXHJcbiAgICAgICAgLmpvaW4oXCJcXG5cXG5cIik7XHJcbn1cclxuXHJcbi8vIFVwZGF0ZXMgdGhlIFRPTSBmaWxlIHdpdGggbmV3IGVudHJpZXMsIHRyaWdnZXJlZCBieSBzYXZlTWVtb3J5U2VlZFxyXG4vLyBUaGlzIGlzIGV4cGVjdGVkIHRvIGFkZCBuZXcgbWVtb3JpZXMgdG8gdGhlIGFwcHJvcHJpYXRlIFRPTSBmaWxlLFxyXG4vLyB1cGRhdGUgc3VtbWFyeSBhbmQga2V5d29yZHMgb2YgZXhpc2l0aW5nIFRPTSBmaWxlcyBieSB0YWtpbmcgdGhlIGV4aXNpdGluZyBzdW1tYXJ5IGFuZCBrZXl3b3Jkc1xyXG4vLyBhbmQgbWVyZ2luZyB0aGVtIHdpdGggdGhlIG5ldyBjb250ZW50IHRvIHRoYXQgbWVtb3J5IHN1bW1hcml6ZWRcclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHVwZGF0ZVRhYmxlT2ZNZW1vcmllc0luY3JlbWVudGFsbHkoXHJcbiAgICBtZW1vcmllc0RpcmVjdG9yeTogc3RyaW5nLFxyXG4gICAgY2F0ZWdvcnk6IHN0cmluZyxcclxuICAgIG5hbWU6IHN0cmluZyxcclxuICAgIHNlZWRzOiBNZW1vcnlTZWVkW10sXHJcbik6IFByb21pc2U8dm9pZD4ge1xyXG5cclxuICAgIGNvbnN0IGZ1bmN0aW9uTmFtZSA9IFwidXBkYXRlVGFibGVPZk1lbW9yaWVzSW5jcmVtZW50YWxseVwiO1xyXG5cclxuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgIHZvaWQgcnVuVXBkYXRlVG9tKCkuY2F0Y2goKGVycm9yKSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXHJcbiAgICAgICAgICAgICAgICBgJHtmdW5jdGlvbk5hbWV9IGZhaWxlZDpgLFxyXG4gICAgICAgICAgICAgICAgZXJyb3IsXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfSk7XHJcbiAgICB9LCAwKTtcclxuXHJcbiAgICBhc3luYyBmdW5jdGlvbiBydW5VcGRhdGVUb20oKTogUHJvbWlzZTx2b2lkPntcclxuICAgICAgICBjb25zdCBmaXJzdENoYXJhY3RlciA9IGNhdGVnb3J5WzBdLnRvVXBwZXJDYXNlKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHRvbUZpbGVOYW1lID1cclxuICAgICAgICAgICAgZmlyc3RDaGFyYWN0ZXIgPj0gYCR7VE9NX1JBTkdFUy5maXJzdC5zdGFydH1gICYmIGZpcnN0Q2hhcmFjdGVyIDw9IGAke1RPTV9SQU5HRVMuZmlyc3QuZW5kfWBcclxuICAgICAgICAgICAgICAgID8gYFRPTV8ke1RPTV9SQU5HRVMuZmlyc3Quc3RhcnR9LSR7VE9NX1JBTkdFUy5maXJzdC5lbmR9Lmpzb25gXHJcbiAgICAgICAgICAgICAgICA6IGZpcnN0Q2hhcmFjdGVyID49IGAke1RPTV9SQU5HRVMuc2Vjb25kLnN0YXJ0fWAgJiYgZmlyc3RDaGFyYWN0ZXIgPD0gYCR7VE9NX1JBTkdFUy5zZWNvbmQuZW5kfWBcclxuICAgICAgICAgICAgICAgICAgICA/IGBUT01fJHtUT01fUkFOR0VTLnNlY29uZC5zdGFydH0tJHtUT01fUkFOR0VTLnNlY29uZC5lbmR9Lmpzb25gXHJcbiAgICAgICAgICAgICAgICAgICAgOiBgVE9NXyR7VE9NX1JBTkdFUy5zcGVjaWFsLnN0YXJ0fS0ke1RPTV9SQU5HRVMuc3BlY2lhbC5lbmR9Lmpzb25gO1xyXG5cclxuICAgICAgICBjb25zdCB0b21GaWxlUGF0aCA9IHBhdGguam9pbihcclxuICAgICAgICAgICAgbWVtb3JpZXNEaXJlY3RvcnksXHJcbiAgICAgICAgICAgIHRvbUZpbGVOYW1lLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGNvbnN0IGZpbGVOYW1lID0gYCR7Y2F0ZWdvcnl9LyR7bmFtZX0uanNvbmA7XHJcblxyXG4gICAgICAgIGNvbnN0IHRvbUNvbnRlbnQgPSBhd2FpdCBmcy5yZWFkRmlsZShcclxuICAgICAgICAgICAgdG9tRmlsZVBhdGgsXHJcbiAgICAgICAgICAgIFwidXRmLThcIixcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBjb25zdCB0YWJsZU9mTWVtb3JpZXM6IFRhYmxlT2ZNZW1vcmllc0VudGl0eVtdID1cclxuICAgICAgICAgICAgSlNPTi5wYXJzZSh0b21Db250ZW50KTtcclxuXHJcbiAgICAgICAgY29uc3QgZXhpc3RpbmdJbmRleCA9IHRhYmxlT2ZNZW1vcmllcy5maW5kSW5kZXgoXHJcbiAgICAgICAgICAgIChlbnRyeSkgPT4gZW50cnkuZmlsZU5hbWUgPT09IGZpbGVOYW1lLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nRW50cnkgPVxyXG4gICAgICAgICAgICBleGlzdGluZ0luZGV4ICE9PSAtMVxyXG4gICAgICAgICAgICAgICAgPyB0YWJsZU9mTWVtb3JpZXNbZXhpc3RpbmdJbmRleF1cclxuICAgICAgICAgICAgICAgIDogdW5kZWZpbmVkO1xyXG5cclxuICAgICAgICAvLyBTZW5kIG9ubHkgdGhlIGV4aXN0aW5nIFRPTSBzdW1tYXJ5L2tleXdvcmRzIGFuZCBuZXcgc2VlZHMuXHJcbiAgICAgICAgY29uc3QgbmV3TWVtb3J5RnJhZ21lbnRzID0gc2VlZHNcclxuICAgICAgICAgICAgLm1hcChcclxuICAgICAgICAgICAgICAgIChzZWVkLCBpbmRleCkgPT5cclxuICAgICAgICAgICAgICAgICAgICBgW1R1cm4gJHtpbmRleCArIDF9XSBVc2VyOiAke3NlZWQuZGlyZWN0X2lucHV0fVxcbmAgK1xyXG4gICAgICAgICAgICAgICAgICAgIGBBc3Npc3RhbnQ6ICR7c2VlZC5vdXRwdXR9YCxcclxuICAgICAgICAgICAgKVxyXG4gICAgICAgICAgICAuam9pbihcIlxcblxcblwiKTtcclxuXHJcbiAgICAgICAgY29uc3QgY29uc29saWRhdGlvbklucHV0ID0gW1xyXG4gICAgICAgICAgICBcIkNVUlJFTlQgU1VNTUFSWTpcIixcclxuICAgICAgICAgICAgZXhpc3RpbmdFbnRyeT8uc3VtbWFyeSA/PyBcIlwiLFxyXG4gICAgICAgICAgICBcIlwiLFxyXG4gICAgICAgICAgICBcIkNVUlJFTlQgS0VZV09SRFM6XCIsXHJcbiAgICAgICAgICAgIGV4aXN0aW5nRW50cnk/LmtleXdvcmRzID8/IFwiXCIsXHJcbiAgICAgICAgICAgIFwiXCIsXHJcbiAgICAgICAgICAgIFwiTkVXIE1FTU9SWSBGUkFHTUVOVFM6XCIsXHJcbiAgICAgICAgICAgIG5ld01lbW9yeUZyYWdtZW50cyxcclxuICAgICAgICBdLmpvaW4oXCJcXG5cIik7XHJcblxyXG4gICAgICAgIGNvbnN0IHN1bW1hcnlSZXR1cm5QYWNrYWdlID0gYXdhaXQgbW9kZWxDYWxsVG9VcGRhdGVNZW1vcnlTdW1tYXJ5QW5kS2V5d29yZHMoY29uc29saWRhdGlvbklucHV0KTtcclxuXHJcbiAgICAgICAgY29uc3QgeyBzdW1tYXJ5LCBrZXl3b3JkcyB9ID0gZXh0cmFjdFN1bW1hcnlBbmRLZXl3b3JkcyhzdW1tYXJ5UmV0dXJuUGFja2FnZSk7XHJcblxyXG4gICAgICAgIGNvbnN0IG1lbW9yeUZpbGVQYXRoID0gcGF0aC5qb2luKFxyXG4gICAgICAgICAgICBtZW1vcmllc0RpcmVjdG9yeSxcclxuICAgICAgICAgICAgY2F0ZWdvcnksXHJcbiAgICAgICAgICAgIGAke25hbWV9Lmpzb25gLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGNvbnN0IG1lbW9yeVN0YXRzID0gYXdhaXQgc3RhdChtZW1vcnlGaWxlUGF0aCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHVwZGF0ZWRFbnRyeTogVGFibGVPZk1lbW9yaWVzRW50aXR5ID0ge1xyXG4gICAgICAgICAgICBmaWxlU2l6ZUtCOiBtZW1vcnlTdGF0cy5zaXplIC8gMTAyNCxcclxuICAgICAgICAgICAgZmlsZU5hbWUsXHJcbiAgICAgICAgICAgIGtleXdvcmRzLFxyXG4gICAgICAgICAgICBzdW1tYXJ5LFxyXG4gICAgICAgIH07XHJcblxyXG4gICAgICAgIGlmIChleGlzdGluZ0luZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICB0YWJsZU9mTWVtb3JpZXNbZXhpc3RpbmdJbmRleF0gPSB1cGRhdGVkRW50cnk7XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgdGFibGVPZk1lbW9yaWVzLnB1c2godXBkYXRlZEVudHJ5KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGF3YWl0IGZzLndyaXRlRmlsZShcclxuICAgICAgICAgICAgdG9tRmlsZVBhdGgsXHJcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHRhYmxlT2ZNZW1vcmllcywgbnVsbCwgNCksXHJcbiAgICAgICAgICAgIFwidXRmLThcIixcclxuICAgICAgICApO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBUaGUgcHJvbXB0IHRoYXQgYXNrcyB0aGUgbW9kZWwgdG8gbWVyZ2UgbmV3IHVzZXIvYXNzaXN0YW50IHR1cm5zIGFkZGVkIHRvIHRoZSBtZW1vcnkgZmlsZVxyXG4vLyBpbnRvIHRoZSBjb250ZW50cyBvZiB0aGUgZXhpc2l0aW5nIFRPTSBrZXl3b3JkcyBhbmQgc3VtbWFyeVxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbW9kZWxDYWxsVG9VcGRhdGVNZW1vcnlTdW1tYXJ5QW5kS2V5d29yZHMoXHJcbiAgICBjb25zb2xpZGF0aW9uSW5wdXQ6IHN0cmluZyxcclxuKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuICAgIFxyXG4gICAgY29uc3QgY2xpZW50ID0gZ2V0Q29udHJvbGxlcigpLmNsaWVudDtcclxuICAgIGNvbnN0IG1vZGVsID0gYXdhaXQgY2xpZW50LmxsbS5tb2RlbCgpO1xyXG4gICAgXHJcbiAgICBjb25zdCBwcm9tcHQgPSBgXHJcbiAgICAgICAgVGhlIHVzZXIgbmVlZHMgeW91IHRoZSBhc3Npc3RhbnQgdG8gdXBkYXRlIHRoZSBDVVJSRU5UIFNVTU1BUlkgQU5EIENVUlJFTlQgS0VZV09SRFMgaWYgdGhlcmUgaXMgYW55IGltcGFjdGZ1bCwgc2lnbmlmaWNhbnQgb3IgcmVsZXZhbnQgY2hhbmdlcyBiYXNlZCBvbiB0aGUgYWRkaXRpb24gb2YgdGhlIE5FVyBNRU1PUlkgRlJBR01FTlRTLlxyXG5cclxuICAgICAgICBFbnN1cmUgdGhhdCB0aGUgZmluYWwgc3VtbWFyeSB5b3UgcHJvdmlkZSBpcyBmYWl0aGZ1bCB0byB0aGUgY3VycmVudCBzdW1tYXJ5IGFuZCByZXRhaW5zIGl0J3Mga2V5IGVsZW1lbnRzIGFuZCB0YWtlcyBpbnRvIGFjY291bnQgdGhlIGFkZGl0aW9uYWwgY29udGVudCBwcm92aWRlZCBieSB0aGUgbmV3IG1lbW9yeSBmcmFnbWVudHMuIFdyYXAgeW91ciBmaW5hbCBzdW1tYXJ5IGluIHRoZSBleGFjdCB0YWdzIG9mIFtCRUdJTk5JTkdfT0ZfU1VNTUFSWV0gYW5kIFtFTkRfT0ZfU1VNTUFSWV0uXHJcblxyXG4gICAgICAgIEluIGFkZGl0aW9uIHRvIHVwZGF0aW5nIHRoZSBzdW1tYXJ5LCBpZGVudGlmeSBvbmx5IHNpZ25pZmljYW50IGtleXdvcmRzIGZyb20gdGhlIG5ldyBtZW1vcnkgZnJhZ21lbnRzIHdoaWNoIGFyZSByZWxldmFudCBlbm91Z2ggdG8gYmUgYWRkIHRvIHRoZSBjdXJyZW50IGtleXdvcmRzLlxyXG5cclxuICAgICAgICBUcnkgdG8gbGltaXQgeW91cnNlbGYgdG8gbm8gbW9yZSB0aGFuIDcgb2YgdGhlIGJlc3Qgc3VpdGVkIGtleXdvcmRzLCBzbyBtYWtlIHN1cmUgdGhlIGtleXdvcmRzIHlvdSBoYXZlIGNob3NlbiB0byBhZGQgb3IgcmVtb3ZlIGFyZSBzdWJzdGFudGl2ZS4gV3JhcCB0aGUgY29sbGVjdGlvbiBvZiBrZXl3b3JkcyBpZGVudGlmaWVkIGluIHRoZSBleGFjdCB0YWdzIG9mIFtCRUdJTk5JTkdfT0ZfS0VZV09SRFNdIGFuZCBbRU5EX09GX0tFWVdPUkRTXS5cclxuXHJcbiAgICAgICAgSWYgdGhlcmUgYXJlIG5vIHNpZ25pZmljYW50IG9yIG1lYW5pbmdmdWwga2V5d29yZHMgdG8gYWRkIG9yIHJlbW92ZSByZXR1cm4gYmFjayB0aGUga2V5d29yZHMgdGhhdCB5b3Ugb3JpZ2luYWxseSByZWNlaXZlZC5cclxuXHJcbiAgICAgICAgSWYgdGhlcmUgaXMgbm8gc2lnbmlmaWNhbnQgb3IgbWVhbmluZ2Z1bCB1cGRhdGUgdG8gdGhlIHN1bW1hcnkgcmV0dXJuIGJhY2sgdGhlIHN1bW1hcnkgdGhhdCB5b3Ugb3JpZ2luYWxseSByZWNlaXZlZC5cclxuXHJcbiAgICAgICAgW0JFR0lOTklORyBPRiBQQUNLQUdFXTogXHJcbiAgICAgICAgJHtjb25zb2xpZGF0aW9uSW5wdXR9XHJcbiAgICAgICAgW0VORCBPRiBQQUNLQUdFXVxyXG4gICAgICAgIGAudHJpbSgpO1xyXG5cclxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1vZGVsLnJlc3BvbmQoXHJcbiAgICAgICAgcHJvbXB0LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGVtcGVyYXR1cmU6IDAsXHJcbiAgICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgY2xlYW5lZFRleHQgPSByZXN1bHQuY29udGVudFxyXG4gICAgICAgIC5yZXBsYWNlKFxyXG4gICAgICAgICAgICAvXltcXHNcXFNdKj9fX0xNX1NUVURJT19JTlRFUk5BTF9MU0VQX1NZTlRIRVRJQ19SRUFTT05JTkdfRU5EX1tBLVphLXowLTldK19fL2ksXHJcbiAgICAgICAgICAgIFwiXCIsXHJcbiAgICAgICAgKVxyXG4gICAgICAgIC5yZXBsYWNlKC9eW1xcc1xcU10qP2BgYCg/Ompzb24pP1xccyovaSwgXCJcIilcclxuICAgICAgICAucmVwbGFjZSgvXFxzKmBgYFtcXHNcXFNdKiQvaSwgXCJcIilcclxuICAgICAgICAudHJpbSgpO1xyXG5cclxuICAgIHJldHVybiBjbGVhbmVkVGV4dDtcclxufVxyXG5cclxuLy8gVGhpcyBpcyB0cmlnZ2VyZWQgZHVyaW5nIHRoZSBkZWxldGlvbiBtZW1vcnkgbG9naWNcclxuLy8gRGVsZXRlcyBhbnkgZXhpc3RpbmcgVE9NIGVudHJ5IHRoYXQgbWF0Y2hlcyB0aGUgZGVsZXRlZCBtZW1vcnlcclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGRlbGV0ZU1lbW9yeUZyb21UYWJsZU9mTWVtb3JpZXMoXHJcbiAgICBtZW1vcmllc0RpcmVjdG9yeTogc3RyaW5nLFxyXG4gICAgY2F0ZWdvcnk6IHN0cmluZyxcclxuICAgIGZpbGVuYW1lOiBzdHJpbmcsXHJcbik6IFByb21pc2U8c3RyaW5nPiB7XHJcbiAgICBjb25zdCBmaXJzdENoYXJhY3RlciA9IGNhdGVnb3J5WzBdLnRvVXBwZXJDYXNlKCk7XHJcblxyXG4gICAgY29uc3QgdG9tRmlsZU5hbWUgPVxyXG4gICAgICAgIGZpcnN0Q2hhcmFjdGVyID49IGAke1RPTV9SQU5HRVMuZmlyc3Quc3RhcnR9YCAmJiBmaXJzdENoYXJhY3RlciA8PSBgJHtUT01fUkFOR0VTLmZpcnN0LmVuZH1gXHJcbiAgICAgICAgICAgID8gYFRPTV8ke1RPTV9SQU5HRVMuZmlyc3Quc3RhcnR9LSR7VE9NX1JBTkdFUy5maXJzdC5lbmR9Lmpzb25gXHJcbiAgICAgICAgICAgIDogZmlyc3RDaGFyYWN0ZXIgPj0gYCR7VE9NX1JBTkdFUy5zZWNvbmQuc3RhcnR9YCAmJiBmaXJzdENoYXJhY3RlciA8PSBgJHtUT01fUkFOR0VTLnNlY29uZC5lbmR9YFxyXG4gICAgICAgICAgICAgICAgPyBgVE9NXyR7VE9NX1JBTkdFUy5zZWNvbmQuc3RhcnR9LSR7VE9NX1JBTkdFUy5zZWNvbmQuZW5kfS5qc29uYFxyXG4gICAgICAgICAgICAgICAgOiBgVE9NXyR7VE9NX1JBTkdFUy5zcGVjaWFsLnN0YXJ0fS0ke1RPTV9SQU5HRVMuc3BlY2lhbC5lbmR9Lmpzb25gO1xyXG5cclxuICAgIGNvbnN0IHRvbUZpbGVQYXRoID0gam9pbihtZW1vcmllc0RpcmVjdG9yeSwgdG9tRmlsZU5hbWUpO1xyXG4gICAgY29uc3QgZmlsZU5hbWUgPSBgJHtjYXRlZ29yeX0vJHtmaWxlbmFtZX1gO1xyXG5cclxuICAgIGNvbnN0IHRvbUNvbnRlbnQgPSBhd2FpdCByZWFkRmlsZSh0b21GaWxlUGF0aCwgXCJ1dGYtOFwiKTtcclxuICAgIGNvbnN0IHRhYmxlT2ZNZW1vcmllczogVGFibGVPZk1lbW9yaWVzRW50aXR5W10gPVxyXG4gICAgICAgIEpTT04ucGFyc2UodG9tQ29udGVudCk7XHJcblxyXG4gICAgY29uc3QgZmlsdGVyZWRUYWJsZU9mTWVtb3JpZXMgPSB0YWJsZU9mTWVtb3JpZXMuZmlsdGVyKFxyXG4gICAgICAgIChlbnRyeSkgPT4gZW50cnkuZmlsZU5hbWUgIT09IGZpbGVOYW1lLFxyXG4gICAgKTtcclxuXHJcbiAgICBpZiAoZmlsdGVyZWRUYWJsZU9mTWVtb3JpZXMubGVuZ3RoICE9PSB0YWJsZU9mTWVtb3JpZXMubGVuZ3RoKSB7XHJcbiAgICAgICAgYXdhaXQgd3JpdGVGaWxlKFxyXG4gICAgICAgICAgICB0b21GaWxlUGF0aCxcclxuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZmlsdGVyZWRUYWJsZU9mTWVtb3JpZXMsIG51bGwsIDQpLFxyXG4gICAgICAgICAgICBcInV0Zi04XCIsXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gdG9tRmlsZU5hbWU7XHJcbn1cclxuXHJcbi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4vLyBGVVpaWSBNRU1PUlkgUkVDQUxMXHJcbi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuLy8gR2F0aGVycyBhbGwgdGhlIGZpbGVuYW1lcyBhbmQgdGhlaXIga2V5d29yZHMgZnJvbSBhbGwgdGhlIFRPTXNcclxuLy8gVG8gZmVlZCB0byB0aGUgbW9kZWwgdG8gZmlyc3QgaWRlbnRpZnkgd2hpY2ggZmlsZW5hbWVzIGhhdmUgdGhlIG1vc3RcclxuLy8gc2ltaWxhciBrZXl3b3JkcyBtYXRjaGluZyB0aGUgdXNlcidzIHF1ZXJ5LlxyXG4vLyBOb3RlIHRoYXQgdGhlIHVzZXIncyBxdWVyeSBpcyBhY3R1YWxseSB0aGUgbW9kZWwncyBcInVuZGVyc3RhbmRpbmdcIiBvZiB0aGUgdXNlcidzIHF1ZXJ5XHJcbi8vIG5vdCB0aGUgdXNlcidzIGRpcmVjdCB1c2VyVGV4dC5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHRhYmxlT2ZNZW1vcmllc1N1bW1hcmllc0xvb2t1cChcclxuICAgIHF1ZXJ5OiBzdHJpbmcsXHJcbik6IFByb21pc2U8c3RyaW5nPiB7XHJcbiAgICBjb25zdCBtZW1vcmllc0RpcmVjdG9yeSA9IGF3YWl0IG1lbW9yeVN0b3JlLmdldE1lbW9yaWVzRGlyZWN0b3J5KCk7XHJcblxyXG4gICAgY29uc3QgdG9tRmlsZU5hbWVzID0gW1xyXG4gICAgICAgIGBUT01fJHtUT01fUkFOR0VTLmZpcnN0LnN0YXJ0fS0ke1RPTV9SQU5HRVMuZmlyc3QuZW5kfS5qc29uYCxcclxuICAgICAgICBgVE9NXyR7VE9NX1JBTkdFUy5zZWNvbmQuc3RhcnR9LSR7VE9NX1JBTkdFUy5zZWNvbmQuZW5kfS5qc29uYCxcclxuICAgICAgICBgVE9NXyR7VE9NX1JBTkdFUy5zcGVjaWFsLnN0YXJ0fS0ke1RPTV9SQU5HRVMuc3BlY2lhbC5lbmR9Lmpzb25gLFxyXG4gICAgXTtcclxuXHJcbiAgICAvLyBMb2FkIGFsbCBUT00gZW50cmllcyBpbnRvIG1lbW9yeS5cclxuICAgIGNvbnN0IGFsbEVudHJpZXM6IFRhYmxlT2ZNZW1vcmllc0VudGl0eVtdID0gW107XHJcblxyXG4gICAgZm9yIChjb25zdCB0b21GaWxlTmFtZSBvZiB0b21GaWxlTmFtZXMpIHtcclxuICAgICAgICBjb25zdCB0b21GaWxlUGF0aCA9IHBhdGguam9pbihcclxuICAgICAgICAgICAgbWVtb3JpZXNEaXJlY3RvcnksXHJcbiAgICAgICAgICAgIHRvbUZpbGVOYW1lLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCByZWFkRmlsZSh0b21GaWxlUGF0aCwgXCJ1dGYtOFwiKTtcclxuICAgICAgICAgICAgY29uc3QgZW50cmllczogVGFibGVPZk1lbW9yaWVzRW50aXR5W10gPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xyXG5cclxuICAgICAgICAgICAgYWxsRW50cmllcy5wdXNoKC4uLmVudHJpZXMpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGZzRXJyb3IgPSBlcnJvciBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb247XHJcblxyXG4gICAgICAgICAgICAvLyBBIG1pc3NpbmcgVE9NIGZpbGUgaXMgdHJlYXRlZCBhcyBhbiBlbXB0eSBUT00uXHJcbiAgICAgICAgICAgIGlmIChmc0Vycm9yLmNvZGUgPT09IFwiRU5PRU5UXCIpIHtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICB0aHJvdyBlcnJvcjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGFsbEVudHJpZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgcmV0dXJuIFwiXCI7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQnVpbGQgdGhlIGNvbXBhY3Qga2V5d29yZCBpbmRleCBmb3IgdGhlIGZpcnN0IG1vZGVsIGNhbGwuXHJcbiAgICBjb25zdCBrZXl3b3JkSW5kZXggPSBhbGxFbnRyaWVzXHJcbiAgICAgICAgLm1hcChcclxuICAgICAgICAgICAgKGVudHJ5KSA9PlxyXG4gICAgICAgICAgICAgICAgYFtmaWxlbmFtZTogXCIke2VudHJ5LmZpbGVOYW1lfVwiXFxuYCArXHJcbiAgICAgICAgICAgICAgICBga2V5d29yZHM6IFwiJHtlbnRyeS5rZXl3b3Jkc31cIl1gLFxyXG4gICAgICAgIClcclxuICAgICAgICAuam9pbihcIlxcblxcblwiKTtcclxuXHJcbiAgICAvLyBGaXJzdCBtb2RlbCBjYWxsOiBzZWxlY3QgdGhlIGJlc3QgOCBmaWxlbmFtZXNcclxuICAgIC8vIGFjcm9zcyBhbGwgVE9NIGVudHJpZXMgYmFzZWQgb24ga2V5d29yZCByZWxldmFuY2UuXHJcbiAgICBjb25zdCBrZXl3b3JkTWF0Y2hlcyA9XHJcbiAgICAgICAgYXdhaXQgbW9kZWxDYWxsVG9TZWxlY3RNZW1vcnlGaWxlbmFtZXNCeUtleXdvcmRzKFxyXG4gICAgICAgICAgICBxdWVyeSxcclxuICAgICAgICAgICAga2V5d29yZEluZGV4LFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgY29uc3Qga2V5d29yZE1hdGNoTmFtZXMgPSBwYXJzZVJldHVybmVkRmlsZW5hbWVzKFxyXG4gICAgICAgIGtleXdvcmRNYXRjaGVzLFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBWYWxpZGF0ZSB0aGUgcmV0dXJuZWQgZmlsZW5hbWVzIGFnYWluc3QgdGhlIGxvYWRlZCBlbnRyaWVzLlxyXG4gICAgY29uc3QgZW50cmllc0J5RmlsZU5hbWUgPSBuZXcgTWFwKFxyXG4gICAgICAgIGFsbEVudHJpZXMubWFwKChlbnRyeSkgPT4gW2VudHJ5LmZpbGVOYW1lLCBlbnRyeV0pLFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBzaG9ydGxpc3RlZEVudHJpZXM6IFRhYmxlT2ZNZW1vcmllc0VudGl0eVtdID0gW107XHJcbiAgICBjb25zdCBzZWVuTmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IGZpbGVOYW1lIG9mIGtleXdvcmRNYXRjaE5hbWVzKSB7XHJcbiAgICAgICAgY29uc3QgZW50cnkgPSBlbnRyaWVzQnlGaWxlTmFtZS5nZXQoZmlsZU5hbWUpO1xyXG5cclxuICAgICAgICBpZiAoIWVudHJ5IHx8IHNlZW5OYW1lcy5oYXMoZmlsZU5hbWUpKSB7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgc2Vlbk5hbWVzLmFkZChmaWxlTmFtZSk7XHJcbiAgICAgICAgc2hvcnRsaXN0ZWRFbnRyaWVzLnB1c2goZW50cnkpO1xyXG5cclxuICAgICAgICAvLyBFbmZvcmNlIGEgbWF4aW11bSBvZiA4IGNhbmRpZGF0ZXMuXHJcbiAgICAgICAgaWYgKHNob3J0bGlzdGVkRW50cmllcy5sZW5ndGggPT09IDgpIHtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmIChzaG9ydGxpc3RlZEVudHJpZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgcmV0dXJuIFwiXCI7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQnVpbGQgdGhlIGZpbGVuYW1lICsgc3VtbWFyeSBpbnB1dCBmb3IgdGhlIHNlY29uZCBtb2RlbCBjYWxsLlxyXG4gICAgY29uc3QgY2FuZGlkYXRlU3VtbWFyaWVzID0gc2hvcnRsaXN0ZWRFbnRyaWVzXHJcbiAgICAgICAgLm1hcChcclxuICAgICAgICAgICAgKGVudHJ5KSA9PlxyXG4gICAgICAgICAgICAgICAgYFtmaWxlbmFtZTogXCIke2VudHJ5LmZpbGVOYW1lfVwiXFxuYCArXHJcbiAgICAgICAgICAgICAgICBgc3VtbWFyeTogXCIke2VudHJ5LnN1bW1hcnl9XCJdYCxcclxuICAgICAgICApXHJcbiAgICAgICAgLmpvaW4oXCJcXG5cXG5cIik7XHJcblxyXG4gICAgLy8gU2Vjb25kIG1vZGVsIGNhbGw6IHJldHVybiBvbmx5IGZpbGVuYW1lcyB0aGF0IGFyZVxyXG4gICAgLy8gcmVsZXZhbnQgYWZ0ZXIgZXZhbHVhdGluZyB0aGVpciBzdW1tYXJpZXMuXHJcbiAgICBjb25zdCBzdW1tYXJ5TWF0Y2hlcyA9XHJcbiAgICAgICAgYXdhaXQgbW9kZWxDYWxsVG9TZWxlY3RNZW1vcnlGaWxlbmFtZXNCeVN1bW1hcmllcyhcclxuICAgICAgICAgICAgcXVlcnksXHJcbiAgICAgICAgICAgIGNhbmRpZGF0ZVN1bW1hcmllcyxcclxuICAgICAgICApO1xyXG5cclxuICAgIGNvbnN0IGZpbmFsTWF0Y2hOYW1lcyA9IHBhcnNlUmV0dXJuZWRGaWxlbmFtZXMoXHJcbiAgICAgICAgc3VtbWFyeU1hdGNoZXMsXHJcbiAgICApO1xyXG5cclxuICAgIC8vIEJ1aWxkIHRoZSBmaW5hbCByZXN1bHQgZnJvbSB0aGUgb3JpZ2luYWwgVE9NIGVudHJpZXMuXHJcbiAgICAvLyBOZXZlciByZWx5IG9uIHRoZSBtb2RlbCB0byByZXByb2R1Y2Ugc3VtbWFyaWVzLlxyXG4gICAgY29uc3Qgc2hvcnRsaXN0ZWRCeU5hbWUgPSBuZXcgTWFwKFxyXG4gICAgICAgIHNob3J0bGlzdGVkRW50cmllcy5tYXAoXHJcbiAgICAgICAgICAgIChlbnRyeSkgPT4gW2VudHJ5LmZpbGVOYW1lLCBlbnRyeV0sXHJcbiAgICAgICAgKSxcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgZmluYWxSZXN1bHRzOiBzdHJpbmdbXSA9IFtdO1xyXG4gICAgY29uc3QgZmluYWxTZWVuTmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcclxuXHJcbiAgICBmb3IgKGNvbnN0IGZpbGVOYW1lIG9mIGZpbmFsTWF0Y2hOYW1lcykge1xyXG4gICAgICAgIGNvbnN0IGVudHJ5ID0gc2hvcnRsaXN0ZWRCeU5hbWUuZ2V0KGZpbGVOYW1lKTtcclxuXHJcbiAgICAgICAgaWYgKCFlbnRyeSB8fCBmaW5hbFNlZW5OYW1lcy5oYXMoZmlsZU5hbWUpKSB7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZmluYWxTZWVuTmFtZXMuYWRkKGZpbGVOYW1lKTtcclxuXHJcbiAgICAgICAgZmluYWxSZXN1bHRzLnB1c2goXHJcbiAgICAgICAgICAgIGBGaWxlbmFtZTogJHtlbnRyeS5maWxlTmFtZX1cXG5gICtcclxuICAgICAgICAgICAgYFN1bW1hcnk6ICR7ZW50cnkuc3VtbWFyeX1gLFxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgaWYgKGZpbmFsUmVzdWx0cy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICByZXR1cm4gXCJcIjtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4oXHJcbiAgICAgICAgZmluYWxSZXN1bHRzLmpvaW4oXCJcXG5cXG5cIilcclxuICAgICk7XHJcbn1cclxuXHJcbi8vIFByb21wdCB0byBhc2sgdGhlIG1vZGVsIHRvIGNob29zZSB0aGUgYmVzdCBtYXRjaGluZyBrZXl3b3JkcyBhbmQgcmV0dXJuIHRoZSBmaWxlIG5hbWVzIG9ubHkgaW4gYSBzdHJpbmcgYXJyYXkuXHJcbi8vIE11c3QgYmUgYSBzdHJpbmcgYXJyYXkgYmVjYXVzZSBpJ3ZlIHNlZW4gYSBtb2RlbCByZXR1cm4gc3RyaW5ncyBvbmx5IHRoZXkgZG8gbm90IGZvbGxvdyBzdHJpY3QgYW5kIHJlbGlhYmxlXHJcbi8vIGZvcm1hdHRpbmcuIEFsbG93aW5nIHRoZW0gdG8gcmV0dXJuIGEgc3RyaW5nIG1lYW5zIHRoZXkgbWF5IGZlZWwgbGlrZSBhZGRpbmcgKipmaWxlbmFtZSoqIG9yIHJldHVybiB0aGVpciBjb25jbHVzaW9uc1xyXG5hc3luYyBmdW5jdGlvbiBtb2RlbENhbGxUb1NlbGVjdE1lbW9yeUZpbGVuYW1lc0J5S2V5d29yZHMoXHJcbiAgICBxdWVyeTogc3RyaW5nLFxyXG4gICAga2V5d29yZEluZGV4OiBzdHJpbmcsXHJcbik6IFByb21pc2U8c3RyaW5nPiB7XHJcbiAgICBjb25zdCBjbGllbnQgPSBnZXRDb250cm9sbGVyKCkuY2xpZW50O1xyXG4gICAgY29uc3QgbW9kZWwgPSBhd2FpdCBjbGllbnQubGxtLm1vZGVsKCk7XHJcblxyXG4gICAgY29uc3QgcHJvbXB0ID0gYFxyXG4gICAgICAgIFRoZSB1c2VyIG5lZWRzIHlvdSB0aGUgYXNzaXN0YW50IHRvIHJldHVybiB0byB0aGVtIHRoZSBmaWxlbmFtZXMgb2YgdGhlIEtFWVdPUkQgRU5UUklFUyB0aGF0IHNvbWV3aGF0IG1hdGNoZXMgdGhlaXIgdXNlciBxdWVyeS5cclxuXHJcbiAgICAgICAgRG8gbm90IGNvbnNpZGVyIGZpbGVuYW1lcyBuYW1lIGFzIHBhcnQgb2YgeW91ciBhbmFseXNpcyB3aGVuIG1hdGNoaW5nIGZvciBrZXl3b3Jkcy5cclxuXHJcbiAgICAgICAgTGltaXQgeW91cnNlbGYgdG8gYXQgbW9zdCA4IGZpbGVuYW1lcyBvZiBtYXRjaGluZyBrZXl3b3JkIGVudHJpZXMuIEl0IGlzIGFjY2VwdGFibGUgdG8gcmV0dXJuIG5vdGhpbmcgaWYgdGhlcmUgYXJlIG5vIGdvb2QgbWF0Y2hlcy5cclxuXHJcbiAgICAgICAgUmV0dXJuIHRoZSBzaW1wbGUgdGV4dCBmb3JtYXR0ZWQgZmlsZW5hbWUgbWF0Y2hlcyBpbiBhIHNpbmdsZSBzdHJpbmcgYXJyYXkuXHJcblxyXG4gICAgICAgIFVzZXIgUXVlcnk6ICR7cXVlcnl9LiBcclxuXHJcbiAgICAgICAgW0JFR0lOTklORyBPRiBLRVlXT1JEUyBFTlRSSUVTXTogXHJcbiAgICAgICAgJHtrZXl3b3JkSW5kZXh9XHJcbiAgICAgICAgW0VORCBPRiBLRVlXT1JEUyBFTlRSSUVTXVxyXG4gICAgICAgIGAudHJpbSgpO1xyXG5cclxuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1vZGVsLnJlc3BvbmQoXHJcbiAgICAgICAgcHJvbXB0LFxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgdGVtcGVyYXR1cmU6IDAsXHJcbiAgICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgY2xlYW5lZFRleHQgPSByZXN1bHQuY29udGVudFxyXG4gICAgICAgIC5yZXBsYWNlKFxyXG4gICAgICAgICAgICAvXltcXHNcXFNdKj9fX0xNX1NUVURJT19JTlRFUk5BTF9MU0VQX1NZTlRIRVRJQ19SRUFTT05JTkdfRU5EX1tBLVphLXowLTldK19fL2ksXHJcbiAgICAgICAgICAgIFwiXCIsXHJcbiAgICAgICAgKVxyXG4gICAgICAgIC5yZXBsYWNlKC9eW1xcc1xcU10qP2BgYCg/Ompzb24pP1xccyovaSwgXCJcIilcclxuICAgICAgICAucmVwbGFjZSgvXFxzKmBgYFtcXHNcXFNdKiQvaSwgXCJcIilcclxuICAgICAgICAudHJpbSgpO1xyXG5cclxuICAgIHJldHVybiBjbGVhbmVkVGV4dDtcclxufVxyXG5cclxuLy8gUHJvbXB0IHRvIGFzayB0aGUgbW9kZWwgdG8gY2hvb3NlIHRoZSBiZXN0IG1hdGNoaW5nIHN1bW1hcmllcyBhZnRlciB3ZSd2ZSBmaWx0ZXJlZCBieSBhIGtleXdvcmRzIHNpbWlsYXJpdHkgbWF0Y2hcclxuLy8gTXVzdCBiZSBhIHN0cmluZyBhcnJheSBiZWNhdXNlIGkndmUgc2VlbiBhIG1vZGVsIHJldHVybiBzdHJpbmdzIG9ubHkgdGhleSBkbyBub3QgZm9sbG93IHN0cmljdCBhbmQgcmVsaWFibGVcclxuLy8gZm9ybWF0dGluZy4gQWxsb3dpbmcgdGhlbSB0byByZXR1cm4gYSBzdHJpbmcgbWVhbnMgdGhleSBtYXkgZmVlbCBsaWtlIGFkZGluZyAqKmZpbGVuYW1lKiogb3IgcmV0dXJuIHRoZWlyIGNvbmNsdXNpb25zXHJcbmFzeW5jIGZ1bmN0aW9uIG1vZGVsQ2FsbFRvU2VsZWN0TWVtb3J5RmlsZW5hbWVzQnlTdW1tYXJpZXMoXHJcbiAgICBxdWVyeTogc3RyaW5nLFxyXG4gICAgY2FuZGlkYXRlU3VtbWFyaWVzOiBzdHJpbmcsXHJcbik6IFByb21pc2U8c3RyaW5nPiB7XHJcbiAgICBjb25zdCBjbGllbnQgPSBnZXRDb250cm9sbGVyKCkuY2xpZW50O1xyXG4gICAgY29uc3QgbW9kZWwgPSBhd2FpdCBjbGllbnQubGxtLm1vZGVsKCk7XHJcblxyXG4gICAgY29uc3QgcHJvbXB0ID0gYFxyXG4gICAgICAgIFRoZSB1c2VyIG5lZWRzIHlvdSB0aGUgYXNzaXN0YW50IHRvIHJldHVybiB0byB0aGVtIHRoZSBmaWxlbmFtZXMgb2YgdGhlIFNVTU1BUklFUyBFTlRSSUVTIHRoYXQgYmVzdCBtYXRjaGVzIHRoZWlyIHVzZXIgcXVlcnkuXHJcblxyXG4gICAgICAgIEJlc3QgbWF0Y2hlcyBkb2VzIG5vdCByZXF1aXJlIGV4YWN0IHdvcmQgbWF0Y2hlcywgeW91IG1heSBtYXRjaCBmb3Igc2ltaWxhciBtZWFuaW5nIG9yIHRoZW1lcy5cclxuXHJcbiAgICAgICAgTGltaXQgeW91cnNlbGYgdG8gYXQgbW9zdCAzIGZpbGVuYW1lcyBvZiB0aGUgYmVzdCBtYXRjaGluZyBzdW1tYXJpZXMuIEl0IGlzIGFjY2VwdGFibGUgdG8gcmV0dXJuIG5vdGhpbmcgaWYgdGhlcmUgYXJlIG5vIGdvb2QgbWF0Y2hlcy5cclxuXHJcbiAgICAgICAgUmV0dXJuIHRoZSBzaW1wbGUgdGV4dCBmb3JtYXR0ZWQgZmlsZW5hbWUgbWF0Y2hlcyBpbiBhIHNpbmdsZSBzdHJpbmcgYXJyYXkuXHJcblxyXG4gICAgICAgIFVzZXIgUXVlcnk6ICR7cXVlcnl9LiBcclxuXHJcbiAgICAgICAgW0JFR0lOTklORyBPRiBTVU1NQVJJRVMgRU5UUklFU106IFxyXG4gICAgICAgICR7Y2FuZGlkYXRlU3VtbWFyaWVzfVxyXG4gICAgICAgIFtFTkQgT0YgU1VNTUFSSUVTIEVOVFJJRVNdXHJcbiAgICAgICAgYC50cmltKCk7XHJcblxyXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgbW9kZWwucmVzcG9uZChcclxuICAgICAgICBwcm9tcHQsXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0ZW1wZXJhdHVyZTogMCxcclxuICAgICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBjbGVhbmVkVGV4dCA9IHJlc3VsdC5jb250ZW50XHJcbiAgICAgICAgLnJlcGxhY2UoXHJcbiAgICAgICAgICAgIC9eW1xcc1xcU10qP19fTE1fU1RVRElPX0lOVEVSTkFMX0xTRVBfU1lOVEhFVElDX1JFQVNPTklOR19FTkRfW0EtWmEtejAtOV0rX18vaSxcclxuICAgICAgICAgICAgXCJcIixcclxuICAgICAgICApXHJcbiAgICAgICAgLnJlcGxhY2UoL15bXFxzXFxTXSo/YGBgKD86anNvbik/XFxzKi9pLCBcIlwiKVxyXG4gICAgICAgIC5yZXBsYWNlKC9cXHMqYGBgW1xcc1xcU10qJC9pLCBcIlwiKVxyXG4gICAgICAgIC50cmltKCk7XHJcblxyXG4gICAgcmV0dXJuIGNsZWFuZWRUZXh0O1xyXG59XHJcblxyXG4vLyBQYXJzZSB0aGUgc3RyaW5nIG9mIGEgc3RyaW5nIGFycmF5IG9mIGZpbGVuYW1lcyBnaXZlbiBieSB0aGUgbW9kZWwgdG8gYW4gYWN0dWFsIHVzYWJsZSBzdHJpbmdzIGFycmF5LlxyXG5mdW5jdGlvbiBwYXJzZVJldHVybmVkRmlsZW5hbWVzKHJlc3BvbnNlOiBzdHJpbmcpOiBzdHJpbmdbXSB7XHJcbiAgICBjb25zdCB0cmltbWVkUmVzcG9uc2UgPSByZXNwb25zZS50cmltKCk7XHJcblxyXG4gICAgLy8gUHJlZmVyIGEgSlNPTiBzdHJpbmcgYXJyYXkuXHJcbiAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IHBhcnNlZDogdW5rbm93biA9IEpTT04ucGFyc2UodHJpbW1lZFJlc3BvbnNlKTtcclxuXHJcbiAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICBBcnJheS5pc0FycmF5KHBhcnNlZCkgJiZcclxuICAgICAgICAgICAgcGFyc2VkLmV2ZXJ5KChpdGVtKSA9PiB0eXBlb2YgaXRlbSA9PT0gXCJzdHJpbmdcIilcclxuICAgICAgICApIHtcclxuICAgICAgICAgICAgcmV0dXJuIHBhcnNlZFxyXG4gICAgICAgICAgICAgICAgLm1hcCgoZmlsZU5hbWUpID0+IGZpbGVOYW1lLnRyaW0oKSlcclxuICAgICAgICAgICAgICAgIC5maWx0ZXIoKGZpbGVOYW1lKSA9PiBmaWxlTmFtZS5sZW5ndGggPiAwKTtcclxuICAgICAgICB9XHJcbiAgICB9IGNhdGNoIHtcclxuICAgICAgICAvLyBGYWxsIGJhY2sgdG8gcGxhaW4tdGV4dCBwYXJzaW5nLlxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB0cmltbWVkUmVzcG9uc2VcclxuICAgICAgICAuc3BsaXQoL1xccj9cXG4vKVxyXG4gICAgICAgIC5tYXAoKGxpbmUpID0+IGxpbmUudHJpbSgpKVxyXG4gICAgICAgIC5tYXAoKGxpbmUpID0+XHJcbiAgICAgICAgICAgIGxpbmVcclxuICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9eKD86Wy0qXHUyMDIyXXxcXGQrWy4pXSlcXHMqLywgXCJcIilcclxuICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9eW1wiJ2BdfFtcIidgXSQvZywgXCJcIilcclxuICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9eXFwqK3xcXCorJC9nLCBcIlwiKVxyXG4gICAgICAgICAgICAgICAgLnRyaW0oKSxcclxuICAgICAgICApXHJcbiAgICAgICAgLmZpbHRlcigobGluZSkgPT4gbGluZS5sZW5ndGggPiAwKTtcclxufVxyXG5cclxuLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbi8vIFRBQkxFIE9GIE1FTU9SSUVTIExPT0tVUFxyXG4vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB0YWJsZU9mTWVtb3JpZXNEaXJlY3RMb29rdXAoXHJcbiAgICB0b21OYW1lOiBzdHJpbmcsXHJcbik6IFByb21pc2U8c3RyaW5nPiB7XHJcbiAgICBjb25zdCBtZW1vcmllc0RpcmVjdG9yeSA9IGF3YWl0IG1lbW9yeVN0b3JlLmdldE1lbW9yaWVzRGlyZWN0b3J5KCk7XHJcblxyXG4gICAgY29uc3QgdmFsaWRUb21GaWxlcyA9IFtcclxuICAgICAgICBgVE9NXyR7VE9NX1JBTkdFUy5maXJzdC5zdGFydH0tJHtUT01fUkFOR0VTLmZpcnN0LmVuZH1gLFxyXG4gICAgICAgIGBUT01fJHtUT01fUkFOR0VTLnNlY29uZC5zdGFydH0tJHtUT01fUkFOR0VTLnNlY29uZC5lbmR9YCxcclxuICAgICAgICBgVE9NXyR7VE9NX1JBTkdFUy5zcGVjaWFsLnN0YXJ0fS0ke1RPTV9SQU5HRVMuc3BlY2lhbC5lbmR9YCxcclxuICAgIF07XHJcblxyXG4gICAgY29uc3Qgbm9ybWFsaXplZFRvbU5hbWUgPSB0b21OYW1lXHJcbiAgICAgICAgLnRyaW0oKVxyXG4gICAgICAgIC5yZXBsYWNlKC9cXC5qc29uJC9pLCBcIlwiKVxyXG4gICAgICAgIC50b1VwcGVyQ2FzZSgpO1xyXG5cclxuICAgIGlmICghdmFsaWRUb21GaWxlcy5pbmNsdWRlcyhub3JtYWxpemVkVG9tTmFtZSkpIHtcclxuICAgICAgICByZXR1cm4gXCJcIjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCB0b21GaWxlUGF0aCA9IHBhdGguam9pbihcclxuICAgICAgICBtZW1vcmllc0RpcmVjdG9yeSxcclxuICAgICAgICBgJHtub3JtYWxpemVkVG9tTmFtZX0uanNvbmAsXHJcbiAgICApO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IHJlYWRGaWxlKHRvbUZpbGVQYXRoLCBcInV0Zi04XCIpO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zdCBmc0Vycm9yID0gZXJyb3IgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uO1xyXG5cclxuICAgICAgICBpZiAoZnNFcnJvci5jb2RlID09PSBcIkVOT0VOVFwiKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBcIlwiO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4vLyBTdHJpbmcgQ29uc3RydWN0b3JzIHRvIHJlcGxhY2UgQXNzaXN0YW50J3MgbGFzdCBUZXh0IHdpdGggUHJlcGFyZWQgQ29udGVudFxyXG4vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuZXhwb3J0IGZ1bmN0aW9uIGNvbnN0cnVjdFRPTVN1bW1hcmllc0xvb2t1cFRhYmxlKFxyXG4gICAgcmV0dXJuUGFja2FnZTogc3RyaW5nLFxyXG4pOiBzdHJpbmcge1xyXG4gICAgY29uc3QgTUVNT1JZX0VOVFJZX1JFR0VYID1cclxuICAgICAgICAvRmlsZW5hbWU6XFxzKiguKj8pXFxzKlN1bW1hcnk6XFxzKihbXFxzXFxTXSo/KSg/PUZpbGVuYW1lOnwkKS9nO1xyXG5cclxuICAgIGNvbnN0IGVudHJpZXM6IE1lbW9yeUVudHJ5W10gPSBBcnJheS5mcm9tKFxyXG4gICAgICAgIHJldHVyblBhY2thZ2UubWF0Y2hBbGwoTUVNT1JZX0VOVFJZX1JFR0VYKSxcclxuICAgICAgICAoWywgZmlsZW5hbWUsIHN1bW1hcnldKSA9PiAoe1xyXG4gICAgICAgIGZpbGVuYW1lOiBmaWxlbmFtZS50cmltKCksXHJcbiAgICAgICAgc3VtbWFyeTogc3VtbWFyeS50cmltKCksXHJcbiAgICAgICAgfSlcclxuICAgICk7XHJcblxyXG4gICAgaWYgKGVudHJpZXMubGVuZ3RoID09PSAwKSByZXR1cm4gXCJcIjtcclxuXHJcbiAgICBjb25zdCBlc2NhcGUgPSAodmFsdWU6IHN0cmluZykgPT5cclxuICAgICAgICB2YWx1ZVxyXG4gICAgICAgIC5yZXBsYWNlKC9cXHwvZywgXCJcXFxcfFwiKVxyXG4gICAgICAgIC5yZXBsYWNlKC9cXHI/XFxuL2csIFwiPGJyPlwiKTtcclxuXHJcbiAgICByZXR1cm4gW1xyXG4gICAgICAgICdcdUQ4M0RcdURDRTYgKipgTWVtb3J5IFBhY2thZ2VgKionLFxyXG4gICAgICAgIFwifCBGaWxlbmFtZSB8IFN1bW1hcnkgfFwiLFxyXG4gICAgICAgIFwifCAtLS0gfCAtLS0gfFwiLFxyXG4gICAgICAgIC4uLmVudHJpZXMubWFwKFxyXG4gICAgICAgICh7IGZpbGVuYW1lLCBzdW1tYXJ5IH0pID0+XHJcbiAgICAgICAgICAgIGB8ICR7ZXNjYXBlKGZpbGVuYW1lKX0gfCAke2VzY2FwZShzdW1tYXJ5KX0gfGBcclxuICAgICAgICApLFxyXG4gICAgXS5qb2luKFwiXFxuXCIpO1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0QXNUYWJsZVN0cmluZyhpbnB1dDogc3RyaW5nKTogc3RyaW5nIHtcclxuICAgIGlmICghaW5wdXQudHJpbSgpKSByZXR1cm4gXCJcIjtcclxuXHJcbiAgICBjb25zdCBkYXRhID0gSlNPTi5wYXJzZShpbnB1dCk7XHJcblxyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGRhdGEpKSByZXR1cm4gXCJcIjtcclxuXHJcbiAgICBjb25zdCBlc2NhcGVDZWxsID0gKHZhbHVlOiB1bmtub3duKTogc3RyaW5nID0+XHJcbiAgICAgICAgU3RyaW5nKHZhbHVlID8/IFwiXCIpXHJcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHwvZywgXCJcXFxcfFwiKVxyXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxyP1xcbi9nLCBcIiBcIik7XHJcblxyXG4gICAgY29uc3QgaGVhZGVycyA9IFtcclxuICAgICAgICBcImZpbGVOYW1lXCIsXHJcbiAgICAgICAgXCJmaWxlU2l6ZSAoS0IpXCIsXHJcbiAgICAgICAgXCJLZXl3b3Jkc1wiLFxyXG4gICAgICAgIFwiU3VtbWFyeVwiLFxyXG4gICAgXTtcclxuXHJcbiAgICByZXR1cm4gW1xyXG4gICAgICAgICdcdUQ4M0RcdURDRTYgKipgTWVtb3J5IFBhY2thZ2VgKionLFxyXG4gICAgICAgIGB8ICR7aGVhZGVycy5qb2luKFwiIHwgXCIpfSB8YCxcclxuICAgICAgICBgfCAke2hlYWRlcnMubWFwKCgpID0+IFwiLS0tXCIpLmpvaW4oXCIgfCBcIil9IHxgLFxyXG4gICAgICAgIC4uLmRhdGEubWFwKChmaWxlOiB7XHJcbiAgICAgICAgICAgIGZpbGVOYW1lOiBzdHJpbmc7XHJcbiAgICAgICAgICAgIGZpbGVTaXplS0I6IG51bWJlcjtcclxuICAgICAgICAgICAga2V5d29yZHM6IHN0cmluZztcclxuICAgICAgICAgICAgc3VtbWFyeTogc3RyaW5nO1xyXG4gICAgICAgIH0pID0+XHJcbiAgICAgICAgICAgIGB8ICR7W1xyXG4gICAgICAgICAgICAgICAgZmlsZS5maWxlTmFtZSxcclxuICAgICAgICAgICAgICAgIE51bWJlcihmaWxlLmZpbGVTaXplS0IpLnRvRml4ZWQoMiksXHJcbiAgICAgICAgICAgICAgICBmaWxlLmtleXdvcmRzLFxyXG4gICAgICAgICAgICAgICAgZmlsZS5zdW1tYXJ5LFxyXG4gICAgICAgICAgICBdLm1hcChlc2NhcGVDZWxsKS5qb2luKFwiIHwgXCIpfSB8YFxyXG4gICAgICAgICksXHJcbiAgICBdLmpvaW4oXCJcXG5cIik7XHJcbn1cclxuXHJcbi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4vLyBGdW5jdGlvbiBmb3IgbXVsdGlFZGl0Q29vcmRpbmF0b3JcclxuLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB0cnlBcHBlbmRUYWJsZU9mTWVtb3JpZXNDb250ZW50RnVuY3Rpb24oXHJcbiAgICBsYXRlc3RDb252ZXJzYXRpb246IGFueSxcclxuICAgIGNvbnN0cnVjdGVkVGFibGVTdHJpbmc6IHN0cmluZyxcclxuICAgIHRhcmdldEFzc2lzdGFudE1lc3NhZ2VJbmRleDogbnVtYmVyLFxyXG4pOiBQcm9taXNlPHZvaWQ+IHtcclxuXHJcbiAgICBsZXQgbGluZXM6IHN0cmluZ1tdID0gW107XHJcblxyXG4gICAgbGluZXMucHVzaChcclxuICAgICAgICBgJHtjb25zdHJ1Y3RlZFRhYmxlU3RyaW5nfWBcclxuICAgICk7XHJcblxyXG4gICAgYXdhaXQgZWRpdEFzc2lzdGFudFJlc3BvbnNlKFxyXG4gICAgICAgIGxhdGVzdENvbnZlcnNhdGlvbixcclxuICAgICAgICBsaW5lcy5qb2luKFwiXFxuXFxuXCIpLFxyXG4gICAgICAgIHRhcmdldEFzc2lzdGFudE1lc3NhZ2VJbmRleCxcclxuICAgICk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB0cnlSZXRyYWN0T2xkVG9tc0Z1bmN0aW9uKFxyXG4gICAgbGF0ZXN0Q29udmVyc2F0aW9uOiBhbnksXHJcbiAgICBsYXN0QXNzaXN0YW50TWVzc2FnZUluZGV4OiBudW1iZXIsXHJcbiAgICByZXRyYWN0T2xkVG9tczogbnVtYmVyLFxyXG4gICAgZW5hYmxlVG9vbHNNb2RlOiBib29sZWFuLFxyXG4pOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGlmIChyZXRyYWN0T2xkVG9tcyA9PT0gMCkgcmV0dXJuO1xyXG5cclxuICAgIGNvbnN0IHN0b3JlZEluZGV4ID0gZ2V0TGFzdEtub3duSW5kZXhPZlJldHJhY3RlZFRvbXMoKTtcclxuICAgIGNvbnN0IHN0YXJ0SW5kZXggPSBzdG9yZWRJbmRleCA/PyAwO1xyXG5cclxuICAgIGNvbnN0IG1hcmtlciA9IFwiXHVEODNEXHVEQ0U2XCI7XHJcbiAgICBcclxuICAgIGNvbnN0IHRvb2xOYW1lcyA9IG5ldyBTZXQoW1xyXG4gICAgICAgIFwidGFibGVfb2ZfbWVtb3JpZXNfbG9va3VwXCIsXHJcbiAgICAgICAgXCJtZW1vcnlfc2VlZF9yZWNhbGxcIixcclxuICAgICAgICBcImRpcmVjdF9tZW1vcnlfbG9va3VwXCIsXHJcbiAgICAgICAgXCJjb21wYWN0aW9uX3N1bW1hcnlfZmV0Y2hcIlxyXG4gICAgXSk7XHJcblxyXG4gICAgLy8gQ29sbGVjdCBtZXNzYWdlIGluZGljZXMgdGhhdCBjb250YWluIGFuIGFzc2lzdGFudCB2ZXJzaW9uLlxyXG4gICAgY29uc3QgYXNzaXN0YW50TWVzc2FnZUluZGljZXMgPSBsYXRlc3RDb252ZXJzYXRpb24ubWVzc2FnZXNcclxuICAgICAgICAubWFwKChtZXNzYWdlOiBhbnksIGluZGV4OiBudW1iZXIpID0+XHJcbiAgICAgICAgICAgIG1lc3NhZ2UudmVyc2lvbnM/LnNvbWUoXHJcbiAgICAgICAgICAgICAgICAodmVyc2lvbjogYW55KSA9PiB2ZXJzaW9uLnJvbGUgPT09IFwiYXNzaXN0YW50XCJcclxuICAgICAgICAgICAgKVxyXG4gICAgICAgICAgICAgICAgPyBpbmRleFxyXG4gICAgICAgICAgICAgICAgOiAtMVxyXG4gICAgICAgIClcclxuICAgICAgICAuZmlsdGVyKChpbmRleDogbnVtYmVyKSA9PiBpbmRleCAhPT0gLTEpO1xyXG5cclxuICAgIC8vIEtlZXAgdGhlIGxhc3QgdHdvIGFzc2lzdGFudCBtZXNzYWdlcyB1bnRvdWNoZWQuXHJcbiAgICBjb25zdCBleGNsdWRlZEFzc2lzdGFudEluZGljZXMgPSBuZXcgU2V0KFxyXG4gICAgICAgIGFzc2lzdGFudE1lc3NhZ2VJbmRpY2VzLnNsaWNlKC1yZXRyYWN0T2xkVG9tcylcclxuICAgICk7XHJcblxyXG4gICAgLy8gU2NhbiBtZXNzYWdlcyBzdGFydGluZyBhdCB0aGUgc2F2ZWQgaW5kZXguXHJcbiAgICBmb3IgKFxyXG4gICAgICAgIGxldCBtZXNzYWdlSW5kZXggPSBzdGFydEluZGV4O1xyXG4gICAgICAgIG1lc3NhZ2VJbmRleCA8IGxhdGVzdENvbnZlcnNhdGlvbi5tZXNzYWdlcy5sZW5ndGg7XHJcbiAgICAgICAgbWVzc2FnZUluZGV4KytcclxuICAgICkge1xyXG4gICAgICAgIC8vIFByZXNlcnZlIHRoZSBleGlzdGluZyBleGNsdXNpb24gYmVoYXZpb3IuXHJcbiAgICAgICAgaWYgKGV4Y2x1ZGVkQXNzaXN0YW50SW5kaWNlcy5oYXMobWVzc2FnZUluZGV4KSkge1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCBtZXNzYWdlID0gbGF0ZXN0Q29udmVyc2F0aW9uLm1lc3NhZ2VzW21lc3NhZ2VJbmRleF07XHJcblxyXG4gICAgICAgIC8vIFByb2Nlc3MgZWFjaCBhc3Npc3RhbnQgdmVyc2lvbiBpbmRlcGVuZGVudGx5LlxyXG4gICAgICAgIGZvciAoY29uc3QgdmVyc2lvbiBvZiBtZXNzYWdlLnZlcnNpb25zID8/IFtdKSB7XHJcbiAgICAgICAgICAgIGlmICh2ZXJzaW9uLnJvbGUgIT09IFwiYXNzaXN0YW50XCIpIGNvbnRpbnVlO1xyXG5cclxuICAgICAgICAgICAgLy8gVE9PTFMgTU9ERTpcclxuICAgICAgICAgICAgLy8gRmluZCB0aGUgbWF0Y2hpbmcgdG9vbCByZXN1bHQsIG5vdCBhc3Npc3RhbnQgdGV4dCBvciBhIHRvb2wgcmVxdWVzdC5cclxuICAgICAgICAgICAgaWYgKGVuYWJsZVRvb2xzTW9kZSkge1xyXG4gICAgICAgICAgICAgICAgbGV0IG1hdGNoaW5nUmVzdWx0U3RlcEluZGV4ID0gLTE7XHJcblxyXG4gICAgICAgICAgICAgICAgZm9yIChcclxuICAgICAgICAgICAgICAgICAgICBsZXQgc3RlcEluZGV4ID0gMDtcclxuICAgICAgICAgICAgICAgICAgICBzdGVwSW5kZXggPCAodmVyc2lvbi5zdGVwcyA/PyBbXSkubGVuZ3RoO1xyXG4gICAgICAgICAgICAgICAgICAgIHN0ZXBJbmRleCsrXHJcbiAgICAgICAgICAgICAgICApIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBzdGVwID0gdmVyc2lvbi5zdGVwc1tzdGVwSW5kZXhdO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyBzdGVwLmNvbnRlbnQgZGlyZWN0bHkgY29udGFpbnMgdGhlIHRvb2xDYWxsUmVzdWx0IGl0ZW0uXHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBpdGVtIG9mIHN0ZXAuY29udGVudCA/PyBbXSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaXRlbS50eXBlICE9PSBcInRvb2xDYWxsUmVzdWx0XCIpIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXRvb2xOYW1lcy5oYXMoaXRlbS5uYW1lKSkgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaXRlbS5jb250ZW50ICE9PSBcInN0cmluZ1wiKSBjb250aW51ZTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIENoZWNrIGZvciB0aGUgbWFya2VyIHdpdGhpbiB0aGUgZmlyc3QgZml2ZSBjaGFyYWN0ZXJzLlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoaXRlbS5jb250ZW50LnNsaWNlKDAsIDEwKS5pbmNsdWRlcyhtYXJrZXIpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBSZXRyYWN0IG9ubHkgdGhpcyBtYXRjaGluZyB0b29sIHJlc3VsdC5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW0uY29udGVudCA9IFwiQ29udGVudCBSZXRyYWN0ZWRcIjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hdGNoaW5nUmVzdWx0U3RlcEluZGV4ID0gc3RlcEluZGV4O1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaGluZ1Jlc3VsdFN0ZXBJbmRleCAhPT0gLTEpIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIE9ubHkgcmV0cmFjdCB0aGUgYXNzaXN0YW50IHJlc3BvbnNlIGlmIGEgdG9vbCByZXN1bHQgbWF0Y2hlZC5cclxuICAgICAgICAgICAgICAgIGlmIChtYXRjaGluZ1Jlc3VsdFN0ZXBJbmRleCAhPT0gLTEpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBBIG1hdGNoaW5nIHRvb2wgcmVzdWx0IHdhcyBmb3VuZC5cclxuICAgICAgICAgICAgICAgICAgICAvLyBSZXRyYWN0IHRoZSBzdWJzZXF1ZW50IG5vcm1hbCBhc3Npc3RhbnQgcmVzcG9uc2UuXHJcbiAgICAgICAgICAgICAgICAgICAgZm9yIChcclxuICAgICAgICAgICAgICAgICAgICAgICAgbGV0IHN0ZXBJbmRleCA9IG1hdGNoaW5nUmVzdWx0U3RlcEluZGV4ICsgMTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc3RlcEluZGV4IDwgKHZlcnNpb24uc3RlcHMgPz8gW10pLmxlbmd0aDtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc3RlcEluZGV4KytcclxuICAgICAgICAgICAgICAgICAgICApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3RlcCA9IHZlcnNpb24uc3RlcHNbc3RlcEluZGV4XTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNraXAgdGhpbmtpbmcgYmxvY2tzLlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3RlcC5zdHlsZT8udHlwZSA9PT0gXCJ0aGlua2luZ1wiKSBjb250aW51ZTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3BvbnNlVGV4dCA9IChzdGVwLmNvbnRlbnQgPz8gW10pLmZpbmQoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAoaXRlbTogYW55KSA9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW0udHlwZSA9PT0gXCJ0ZXh0XCIgJiZcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0eXBlb2YgaXRlbS50ZXh0ID09PSBcInN0cmluZ1wiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVzcG9uc2VUZXh0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNwb25zZVRleHQudGV4dCA9IFwiQ29udGVudCBSZXRyYWN0ZWRcIjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBObyBtYXRjaGluZyB0b29sIHJlc3VsdDogc2VhcmNoIGFzc2lzdGFudCB0ZXh0IGRpcmVjdGx5LlxyXG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3Qgc3RlcCBvZiB2ZXJzaW9uLnN0ZXBzID8/IFtdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFNraXAgdGhpbmtpbmcgYmxvY2tzLlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoc3RlcC5zdHlsZT8udHlwZSA9PT0gXCJ0aGlua2luZ1wiKSBjb250aW51ZTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBzdGVwLmNvbnRlbnQgPz8gW10pIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVtLnR5cGUgPT09IFwidGV4dFwiICYmXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdHlwZW9mIGl0ZW0udGV4dCA9PT0gXCJzdHJpbmdcIiAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW0udGV4dC5zbGljZSgwLCA3KS5pbmNsdWRlcyhtYXJrZXIpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVtLnRleHQgPSBcIkNvbnRlbnQgUmV0cmFjdGVkXCI7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFN0b3AgYWZ0ZXIgZmluZGluZyBhbmQgcmV0cmFjdGluZyBhIG1hdGNoaW5nIHJlc3BvbnNlLlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAoc3RlcC5jb250ZW50ID8/IFtdKS5zb21lKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIChpdGVtOiBhbnkpID0+IGl0ZW0udHlwZSA9PT0gXCJ0ZXh0XCIgJiZcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRlbS50ZXh0ID09PSBcIkNvbnRlbnQgUmV0cmFjdGVkXCJcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIClcclxuICAgICAgICAgICAgICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAvLyBEbyBub3QgcnVuIHRoZSBub24tdG9vbHMgdGV4dC1tYXJrZXIgbG9naWMgaW4gdG9vbHMgbW9kZS5cclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBOT04tVE9PTFMgTU9ERTpcclxuICAgICAgICAgICAgLy8gRmluZCBhbiBhc3Npc3RhbnQgcmVzcG9uc2UgY29udGFpbmluZyB0aGUgbWFya2VyIG5lYXIgdGhlIHN0YXJ0LFxyXG4gICAgICAgICAgICAvLyB3aGlsZSBleHBsaWNpdGx5IGV4Y2x1ZGluZyB0aGlua2luZyBzdGVwcy5cclxuICAgICAgICAgICAgbGV0IGZvdW5kID0gZmFsc2U7XHJcblxyXG4gICAgICAgICAgICBmb3IgKGNvbnN0IHN0ZXAgb2YgdmVyc2lvbi5zdGVwcyA/PyBbXSkge1xyXG4gICAgICAgICAgICAgICAgLy8gTmV2ZXIgcmV0cmFjdCB0ZXh0IGZyb20gYSB0aGlua2luZyBzdGVwLlxyXG4gICAgICAgICAgICAgICAgaWYgKHN0ZXAuc3R5bGU/LnR5cGUgPT09IFwidGhpbmtpbmdcIikgY29udGludWU7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gSW5zcGVjdCB0ZXh0IGl0ZW1zIGluIHRoaXMgbm9uLXRoaW5raW5nIHN0ZXAuXHJcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGl0ZW0gb2Ygc3RlcC5jb250ZW50ID8/IFtdKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtLnR5cGUgPT09IFwidGV4dFwiICYmXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVvZiBpdGVtLnRleHQgPT09IFwic3RyaW5nXCIgJiZcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbS50ZXh0LnNsaWNlKDAsIDEwKS5pbmNsdWRlcyhtYXJrZXIpXHJcbiAgICAgICAgICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFJldHJhY3QgdGhlIG1hdGNoaW5nIGFzc2lzdGFudCByZXNwb25zZSB0ZXh0LlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtLnRleHQgPSBcIkNvbnRlbnQgUmV0cmFjdGVkXCI7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIFN0b3AgYWZ0ZXIgcmV0cmFjdGluZyB0aGUgZmlyc3QgbWF0Y2hpbmcgdGV4dCBpdGVtLlxyXG4gICAgICAgICAgICAgICAgaWYgKGZvdW5kKSBicmVhaztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBQcmVzZXJ2ZSB0aGUgZXhpc3Rpbmcgc2F2ZWQtaW5kZXggYmVoYXZpb3IuXHJcbiAgICBzZXRMYXN0S25vd25JbmRleE9mUmV0cmFjdGVkVG9tcyhcclxuICAgICAgICBhc3Npc3RhbnRNZXNzYWdlSW5kaWNlcy5zbGljZSgtMilbMF0gPz8gbGFzdEFzc2lzdGFudE1lc3NhZ2VJbmRleFxyXG4gICAgKTtcclxufSIsICJpbXBvcnQgdHlwZSB7IERpcmVudCB9IGZyb20gXCJub2RlOmZzXCI7XHJcbmltcG9ydCB0eXBlIHsgUGVuZGluZ1NhdmVNZW1vcnkgfSBmcm9tIFwiLi9jb25maWdcIjtcclxuaW1wb3J0IHsgTWVtb3J5U2VlZCwgbWVtb3J5U3RvcmUgfSBmcm9tIFwiLi9tZW1vcnlTdG9yZVwiO1xyXG5pbXBvcnQgeyBqb2luLCBkaXJuYW1lIH0gZnJvbSBcIm5vZGU6cGF0aFwiO1xyXG5pbXBvcnQgcGF0aCBmcm9tIFwibm9kZTpwYXRoXCI7XHJcbmltcG9ydCBmcyBmcm9tIFwibm9kZTpmcy9wcm9taXNlc1wiO1xyXG5cclxuaW1wb3J0IHsgXHJcbiAgICBnZXRDb250cm9sbGVyLCBcclxuICAgIGFkZENvbnZlcnNhdGlvbk9wZXJhdGlvbiwgXHJcbiAgICBnZXRWYWxpZGF0ZWRDb252ZXJzYXRpb25Sb290RGlyZWN0b3J5LFxyXG4gICAgZ2V0VmFsaWRhdGVkTWVtb3JpZXNSb290RGlyZWN0b3J5LFxyXG4gICAgZ2V0Q29udmVyc2F0aW9uRmlsZU5hbWUsXHJcbiAgICBUT01fUkFOR0VTLFxyXG4gICAgZ2V0Q29tcGFjdGlvblN1bW1hcnlSZWdleCxcclxuICAgIGdldENvbXBhY3Rpb25LZXl3b3JkUmVnZXgsXHJcbiAgICBzZXRQZW5kaW5nVG9tQ29tbWFuZCxcclxuICAgIGdldExpc3RDb21wYWN0aW9uU2VlZHNSZWdleFxyXG59IGZyb20gXCIuL2NvbmZpZ1wiO1xyXG5cclxuaW1wb3J0IHtcclxuICAgIHdyaXRlRmlsZSxcclxuICAgIHJlYWRGaWxlLFxyXG4gICAgcmVhZGRpcixcclxuICAgIHN0YXQsXHJcbiAgICB1bmxpbmssXHJcbiAgICBta2RpcixcclxufSBmcm9tIFwibm9kZTpmcy9wcm9taXNlc1wiO1xyXG5cclxuaW1wb3J0IHtcclxuICAgIGV4dHJhY3RTdW1tYXJ5QW5kS2V5d29yZHMsXHJcbiAgICBtb2RlbENhbGxUb1VwZGF0ZU1lbW9yeVN1bW1hcnlBbmRLZXl3b3JkcyxcclxuICAgIFRhYmxlT2ZNZW1vcmllc0VudGl0eVxyXG59IGZyb20gXCIuL3RhYmxlT2ZNZW1vcmllc1wiO1xyXG5cclxuaW1wb3J0IHsgQ2hhdE1lc3NhZ2UgfSBmcm9tIFwiQGxtc3R1ZGlvL3Nka1wiO1xyXG5pbXBvcnQgeyBjbGVhbkFzc2lzdGFudFJlc3BvbnNlLCBjbGVhblVzZXJJbnB1dCwgaXNFbGlnaWJsZUFzc2lzdGFudE1lc3NhZ2UgfSBmcm9tIFwiLi9jb252ZXJzYXRpb25SZWFkZXJcIjtcclxuaW1wb3J0IHsgZWRpdEFzc2lzdGFudFJlc3BvbnNlLCBpc01ldGFkYXRhT25seU91dHB1dCB9IGZyb20gXCIuL3RyaWdnZXJTYXZlTWVtb3J5XCI7XHJcblxyXG5pbnRlcmZhY2UgVGFibGVPZkNvbXBhY3Rpb25zRW50aXR5Q29sbGVjdGlvbiB7XHJcbiAgICBkYXRlX2NyZWF0ZWRfZ3JvdXA6IHN0cmluZztcclxuICAgIG1lbWJlcnNfZmlsZU5hbWU6IHN0cmluZ1tdO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgVGFibGVPZkNvbXBhY3Rpb25zRW50aXR5IHtcclxuICAgIGZpbGVTaXplS0I6IG51bWJlcjtcclxuICAgIGZpbGVOYW1lOiBzdHJpbmc7XHJcbiAgICBrZXl3b3Jkczogc3RyaW5nO1xyXG4gICAgc3VtbWFyeTogc3RyaW5nO1xyXG4gICAgcHJlY2VkaW5nX2NvbXBhY2F0aW9uX2ZpbGVOYW1lOiBzdHJpbmc7XHJcbn1cclxuXHJcbmludGVyZmFjZSBDb21wYWN0aW9uU25hcHNob3RQYXJhbXMge1xyXG4gICAga2VlcE9sZGVzdE46IG51bWJlcjtcclxuICAgIGtlZXBOZXdlc3ROOiBudW1iZXI7XHJcbiAgICBjb252ZXJzYXRpb25OYW1lOiBzdHJpbmc7XHJcbiAgICBhdXRvQ2xlYW51cFRocmVzaG9sZDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgQ29tcGFjdGlvblNuYXBzaG90IHtcclxuICAgIHBhcmFtczogQ29tcGFjdGlvblNuYXBzaG90UGFyYW1zO1xyXG4gICAgbWVzc2FnZXM6IENoYXRNZXNzYWdlW107XHJcbn1cclxuXHJcbnR5cGUgRXh0cmFjdGVkTWVzc2FnZSA9IHtcclxuICAgIG1lbW9yeU51bWJlcjogbnVtYmVyO1xyXG4gICAgZGlyZWN0X2lucHV0OiBzdHJpbmc7XHJcbiAgICBvdXRwdXQ6IHN0cmluZztcclxufTtcclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB0YWJsZU9mQ29tcGFjdGlvbnNNYWluKFxyXG4gICAgZGVsZXRlVG9jQ29sbGVjdGlvbnNBZnRlck50aERheXM6IG51bWJlcixcclxuKTogUHJvbWlzZTx2b2lkPiB7XHJcblxyXG4gICAgaWYoZGVsZXRlVG9jQ29sbGVjdGlvbnNBZnRlck50aERheXMgPiAwKSB7XHJcbiAgICAgICAgYXdhaXQgZGVsZXRlRXhwaXJlZENvbXBhY3Rpb25zQW5kVG9jQ2xlYW51cChkZWxldGVUb2NDb2xsZWN0aW9uc0FmdGVyTnRoRGF5cyk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgbWVtb3JpZXNEaXJlY3RvcnkgPSBhd2FpdCBtZW1vcnlTdG9yZS5nZXRNZW1vcmllc0RpcmVjdG9yeSgpO1xyXG5cclxuICAgIGF3YWl0IGNyZWF0ZVRhYmxlT2ZDb21wYWN0aW9ucyhtZW1vcmllc0RpcmVjdG9yeSk7XHJcblxyXG4gICAgY29uc3QgcGFyc2VkQ29tcGFjdGlvbkZpbGVEYXRhID0gYXdhaXQgZmluZFNoYWRvd0NvcHlBbmRQYXJzZSgpO1xyXG5cclxuICAgIGlmIChwYXJzZWRDb21wYWN0aW9uRmlsZURhdGEgPT09IG51bGwpIHJldHVybjtcclxuXHJcbiAgICBjb25zdCBzYXZlZENvbXBhY3Rpb25zU3RhdHVzID0gYXdhaXQgcHJvY2Vzc0NvbXBhY3Rpb25GaWxlRGF0YUFuZENyZWF0ZU1lbW9yeVNlZWRzKHBhcnNlZENvbXBhY3Rpb25GaWxlRGF0YSk7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwcm9jZXNzTWVzc2FnZUZvckNvbXBhY3Rpb25TdW1tYXJ5KFxyXG4gICAgdXNlclRleHQ6IHN0cmluZyxcclxuICAgIGVuYWJsZVRvb2xzTW9kZTogYm9vbGVhbixcclxuKTogUHJvbWlzZTx2b2lkPntcclxuXHJcbiAgICBpZiAoZW5hYmxlVG9vbHNNb2RlKSByZXR1cm47XHJcblxyXG4gICAgY29uc3QgQ09NUEFDVElPTl9TVU1NQVJZX1JFR0VYID0gZ2V0Q29tcGFjdGlvblN1bW1hcnlSZWdleCgpO1xyXG4gICAgY29uc3QgTElTVF9DT01QQUNUSU9OX1NFRURTX1JFR0VYID0gZ2V0TGlzdENvbXBhY3Rpb25TZWVkc1JlZ2V4KCk7XHJcblxyXG4gICAgY29uc3QgY29tcGFjdGlvblN1bW1hcnlNYXRjaCA9IHVzZXJUZXh0Lm1hdGNoKENPTVBBQ1RJT05fU1VNTUFSWV9SRUdFWCk7XHJcbiAgICBjb25zdCBsaXN0Q29tcGFjdGlvblNlZWRzTWF0Y2ggPSB1c2VyVGV4dC5tYXRjaChMSVNUX0NPTVBBQ1RJT05fU0VFRFNfUkVHRVgpO1xyXG5cclxuICAgIGxldCBjb25zdHJ1Y3RlZFN1bW1hcnlTdHJpbmcgPSBcIlwiO1xyXG5cclxuICAgIGlmIChsaXN0Q29tcGFjdGlvblNlZWRzTWF0Y2gpIHtcclxuICAgICAgICBjb25zdCBhbGxDb21wYWN0aW9uU2VlZHNBdmFpbGFibGUgPSBhd2FpdCBsaXN0Q29tcGFjdGlvblNlZWRzKHRydWUpOyAgICAvLyB0cnVlIGZvciB0YWJsZSBmb3JtYXQgcmV0dXJuXHJcblxyXG4gICAgICAgIGNvbnN0cnVjdGVkU3VtbWFyeVN0cmluZyA9IGFsbENvbXBhY3Rpb25TZWVkc0F2YWlsYWJsZTtcclxuXHJcbiAgICAgICAgaWYgKGNvbnN0cnVjdGVkU3VtbWFyeVN0cmluZyAhPT0gXCJcIikge1xyXG4gICAgICAgICAgICAvLyBJbmplY3QgdGhlIGNvbnN0cnVjdGVkVGFibGVTdHJpbmcgaW50byB0aGUgbmV3ZXN0IGFzc2lzdGFudCBtZXNzYWdlLlxyXG4gICAgICAgICAgICBhZGRDb252ZXJzYXRpb25PcGVyYXRpb24oXHJcbiAgICAgICAgICAgICAgICBcInRyeUFwcGVuZENvbXBhY3Rpb25TdW1tYXJ5RnVuY3Rpb25cIixcclxuICAgICAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdHJ1Y3RlZFN1bW1hcnlTdHJpbmcsXHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgICAgICBcclxuICAgICAgICAgICAgc2V0UGVuZGluZ1RvbUNvbW1hbmQoXCJyZWFkeVwiKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICBpZiAoY29tcGFjdGlvblN1bW1hcnlNYXRjaCkge1xyXG5cclxuICAgICAgICBjb25zdCBhbGxTZWVkczogc3RyaW5nW10gPSAoXHJcbiAgICAgICAgICAgIGF3YWl0IHNjYW5Gb3JBbmRSZXR1cm5NYXRjaGluZ0ZpbGVzKClcclxuICAgICAgICApLm1hcChlbnRyeSA9PiBlbnRyeS5uYW1lKTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCByZXF1ZXN0ZWRGaWxlTmFtZSA9IGV4dHJhY3RDb21wYWN0aW9uRmlsZU5hbWUoXHJcbiAgICAgICAgICAgIHVzZXJUZXh0LFxyXG4gICAgICAgICAgICBhbGxTZWVkcyxcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBjb25zb2xlLmxvZyhyZXF1ZXN0ZWRGaWxlTmFtZSlcclxuXHJcbiAgICAgICAgaWYgKCFyZXF1ZXN0ZWRGaWxlTmFtZSkgcmV0dXJuO1xyXG5cclxuICAgICAgICAvLyBDaGVjayB0aGUgVE9DX1NlZWRzIERpcmVjdG9yeSBpZiB0aGVyZSBpcyBhIGZpbGUgbWF0Y2hpbmcgdGhlIHJlcXVlc3RcclxuICAgICAgICBjb25zdHJ1Y3RlZFN1bW1hcnlTdHJpbmcgPSBhd2FpdCBjcmVhdGVDb21wYWN0aW9uU3VtbWFyeShyZXF1ZXN0ZWRGaWxlTmFtZSk7XHJcblxyXG4gICAgICAgIC8vIEZldGNoIG9ubHkgdmFsaWRhdGVkU2VlZHNUb0ZldGNoLlxyXG4gICAgICAgIGlmIChjb25zdHJ1Y3RlZFN1bW1hcnlTdHJpbmcgIT09IFwiXCIpIHtcclxuICAgICAgICAgICAgLy8gSW5qZWN0IHRoZSBjb25zdHJ1Y3RlZFRhYmxlU3RyaW5nIGludG8gdGhlIG5ld2VzdCBhc3Npc3RhbnQgbWVzc2FnZS5cclxuICAgICAgICAgICAgYWRkQ29udmVyc2F0aW9uT3BlcmF0aW9uKFxyXG4gICAgICAgICAgICAgICAgXCJ0cnlBcHBlbmRDb21wYWN0aW9uU3VtbWFyeUZ1bmN0aW9uXCIsXHJcbiAgICAgICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3RydWN0ZWRTdW1tYXJ5U3RyaW5nLFxyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIHNldFBlbmRpbmdUb21Db21tYW5kKFwicmVhZHlcIik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gdHJ5QXBwZW5kQ29tcGFjdGlvblN1bW1hcnlGdW5jdGlvbihcclxuICAgIGxhdGVzdENvbnZlcnNhdGlvbjogYW55LFxyXG4gICAgY29uc3RydWN0ZWRUYWJsZVN0cmluZzogc3RyaW5nLFxyXG4gICAgdGFyZ2V0QXNzaXN0YW50TWVzc2FnZUluZGV4OiBudW1iZXIsXHJcbik6IFByb21pc2U8dm9pZD4ge1xyXG5cclxuICAgIGF3YWl0IGVkaXRBc3Npc3RhbnRSZXNwb25zZShcclxuICAgICAgICBsYXRlc3RDb252ZXJzYXRpb24sXHJcbiAgICAgICAgY29uc3RydWN0ZWRUYWJsZVN0cmluZyxcclxuICAgICAgICB0YXJnZXRBc3Npc3RhbnRNZXNzYWdlSW5kZXgsXHJcbiAgICApO1xyXG59XHJcblxyXG4vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuLy8gVEFCTEUgT0YgQ09NUEFDVElPTiBGSUxFIE1BSU5UQU5FTkNFXHJcbi8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gY3JlYXRlVGFibGVPZkNvbXBhY3Rpb25zKFxyXG4gICAgbWVtb3JpZXNEaXJlY3Rvcnk6IHN0cmluZyxcclxuICAgIGNyZWF0ZVRvZGF5c1RhYmxlPzogYm9vbGVhbixcclxuKTogUHJvbWlzZTx2b2lkPiB7XHJcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xyXG5cclxuICAgIGNvbnN0IHRvZGF5ID0gW1xyXG4gICAgICAgIG5vdy5nZXRGdWxsWWVhcigpLFxyXG4gICAgICAgIFN0cmluZyhub3cuZ2V0TW9udGgoKSArIDEpLnBhZFN0YXJ0KDIsIFwiMFwiKSxcclxuICAgICAgICBTdHJpbmcobm93LmdldERhdGUoKSkucGFkU3RhcnQoMiwgXCIwXCIpLFxyXG4gICAgXS5qb2luKFwiLVwiKTtcclxuXHJcbiAgICBjb25zdCBjb21wYWN0aW9uc0RpcmVjdG9yeSA9IHBhdGguam9pbihcclxuICAgICAgICBtZW1vcmllc0RpcmVjdG9yeSxcclxuICAgICAgICBcImNvbXBhY3Rpb25zXCIsXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IHRvY0VudGl0eURpcmVjdG9yeSA9IHBhdGguam9pbihcclxuICAgICAgICBjb21wYWN0aW9uc0RpcmVjdG9yeSxcclxuICAgICAgICBcIlRPQ19FbnRpdHlcIixcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgdG9jU2VlZHNEaXJlY3RvcnkgPSBwYXRoLmpvaW4oXHJcbiAgICAgICAgY29tcGFjdGlvbnNEaXJlY3RvcnksXHJcbiAgICAgICAgXCJUT0NfU2VlZHNcIixcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgdG9jU3VtbWFyaWVzRGlyZWN0b3J5ID0gcGF0aC5qb2luKFxyXG4gICAgICAgIGNvbXBhY3Rpb25zRGlyZWN0b3J5LFxyXG4gICAgICAgIFwiVE9DX1N1bW1hcmllc1wiLFxyXG4gICAgKTtcclxuXHJcbiAgICBhd2FpdCBta2Rpcih0b2NFbnRpdHlEaXJlY3RvcnksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xyXG4gICAgYXdhaXQgbWtkaXIodG9jU2VlZHNEaXJlY3RvcnksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xyXG4gICAgYXdhaXQgbWtkaXIodG9jU3VtbWFyaWVzRGlyZWN0b3J5LCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcclxuXHJcbiAgICBjb25zdCBmaWxlUGF0aCA9IHBhdGguam9pbihcclxuICAgICAgICB0b2NFbnRpdHlEaXJlY3RvcnksXHJcbiAgICAgICAgYFRPQ18ke3RvZGF5fS5qc29uYCxcclxuICAgICk7XHJcblxyXG4gICAgbGV0IHRvZGF5VGFibGVDcmVhdGVkID0gZmFsc2U7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgICBhd2FpdCB3cml0ZUZpbGUoZmlsZVBhdGgsIFwiW11cIiwge1xyXG4gICAgICAgICAgICBlbmNvZGluZzogXCJ1dGYtOFwiLFxyXG4gICAgICAgICAgICBmbGFnOiBcInd4XCIsXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIHRvZGF5VGFibGVDcmVhdGVkID0gdHJ1ZTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgaWYgKChlcnJvciBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb24pLmNvZGUgIT09IFwiRUVYSVNUXCIpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcclxuICAgICAgICAgICAgICAgIGBGYWlsZWQgdG8gY3JlYXRlIHRhYmxlIG9mIG1lbW9yaWVzIFwiJHtmaWxlUGF0aH1cIjpgLFxyXG4gICAgICAgICAgICAgICAgZXJyb3IsXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgY29sbGVjdGlvbnNGaWxlUGF0aCA9IHBhdGguam9pbihcclxuICAgICAgICBjb21wYWN0aW9uc0RpcmVjdG9yeSxcclxuICAgICAgICBcIlRPQ19Db2xsZWN0aW9ucy5qc29uXCIsXHJcbiAgICApO1xyXG5cclxuICAgIC8vIENyZWF0ZSB0aGUgY29sbGVjdGlvbnMgZmlsZSBpZiBpdCBkb2Vzbid0IGV4aXN0LlxyXG4gICAgdHJ5IHtcclxuICAgICAgICBhd2FpdCB3cml0ZUZpbGUoY29sbGVjdGlvbnNGaWxlUGF0aCwgXCJbXVwiLCB7XHJcbiAgICAgICAgICAgIGVuY29kaW5nOiBcInV0Zi04XCIsXHJcbiAgICAgICAgICAgIGZsYWc6IFwid3hcIixcclxuICAgICAgICB9KTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgaWYgKChlcnJvciBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb24pLmNvZGUgIT09IFwiRUVYSVNUXCIpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcclxuICAgICAgICAgICAgICAgIGBGYWlsZWQgdG8gY3JlYXRlIGNvbGxlY3Rpb25zIFRPQyBcIiR7Y29sbGVjdGlvbnNGaWxlUGF0aH1cIjpgLFxyXG4gICAgICAgICAgICAgICAgZXJyb3IsXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gQWRkIHRvZGF5J3MgY29sbGVjdGlvbiBvbmx5IHdoZW4gdG9kYXkncyBlbnRpdHkgVE9DIHdhcyBuZXdseSBjcmVhdGVkLlxyXG4gICAgaWYgKCF0b2RheVRhYmxlQ3JlYXRlZCkge1xyXG4gICAgICAgIHJldHVybjtcclxuICAgIH1cclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IGNvbnRlbnRzID0gYXdhaXQgcmVhZEZpbGUoXHJcbiAgICAgICAgICAgIGNvbGxlY3Rpb25zRmlsZVBhdGgsXHJcbiAgICAgICAgICAgIFwidXRmLThcIixcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBjb25zdCBjb2xsZWN0aW9uczogVGFibGVPZkNvbXBhY3Rpb25zRW50aXR5Q29sbGVjdGlvbltdID1cclxuICAgICAgICAgICAgSlNPTi5wYXJzZShjb250ZW50cyk7XHJcblxyXG4gICAgICAgIGNvbGxlY3Rpb25zLnB1c2goe1xyXG4gICAgICAgICAgICBkYXRlX2NyZWF0ZWRfZ3JvdXA6IHRvZGF5LFxyXG4gICAgICAgICAgICBtZW1iZXJzX2ZpbGVOYW1lOiBbXSxcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgYXdhaXQgd3JpdGVGaWxlKFxyXG4gICAgICAgICAgICBjb2xsZWN0aW9uc0ZpbGVQYXRoLFxyXG4gICAgICAgICAgICBKU09OLnN0cmluZ2lmeShjb2xsZWN0aW9ucywgbnVsbCwgMiksXHJcbiAgICAgICAgICAgIFwidXRmLThcIixcclxuICAgICAgICApO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFxyXG4gICAgICAgICAgICBgRmFpbGVkIHRvIHVwZGF0ZSBjb2xsZWN0aW9ucyBUT0MgXCIke2NvbGxlY3Rpb25zRmlsZVBhdGh9XCI6YCxcclxuICAgICAgICAgICAgZXJyb3IsXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gZmluZFNoYWRvd0NvcHlBbmRQYXJzZSgpOiBQcm9taXNlPCh7IGZpbGVQYXRoOiBzdHJpbmcgfSAmIENvbXBhY3Rpb25TbmFwc2hvdCkgfCBudWxsPiB7XHJcbiAgICBjb25zdCBjb252ZXJzYXRpb25zRGlyZWN0b3J5ID0gZ2V0VmFsaWRhdGVkQ29udmVyc2F0aW9uUm9vdERpcmVjdG9yeSgpO1xyXG4gICAgY29uc3QgY29udmVyc2F0aW9uRmlsZSA9IGdldENvbnZlcnNhdGlvbkZpbGVOYW1lKCk7XHJcblxyXG4gICAgY29uc3QgcmVsYXRpdmVDb252ZXJzYXRpb25EaXJlY3RvcnkgPSBqb2luKFxyXG4gICAgICAgIGNvbnZlcnNhdGlvbnNEaXJlY3RvcnksXHJcbiAgICAgICAgZGlybmFtZShjb252ZXJzYXRpb25GaWxlKSxcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgZW50cmllcyA9IGF3YWl0IHJlYWRkaXIocmVsYXRpdmVDb252ZXJzYXRpb25EaXJlY3RvcnksIHtcclxuICAgICAgICB3aXRoRmlsZVR5cGVzOiB0cnVlLFxyXG4gICAgfSk7XHJcblxyXG4gICAgZm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XHJcbiAgICAgICAgaWYgKCFlbnRyeS5pc0ZpbGUoKSB8fCAhZW50cnkubmFtZS5lbmRzV2l0aChcIi5jb3B5XCIpKSB7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgZnVsbFBhdGggPSBqb2luKHJlbGF0aXZlQ29udmVyc2F0aW9uRGlyZWN0b3J5LCBlbnRyeS5uYW1lKTtcclxuICAgICAgICBjb25zdCBmaWxlQ29udGVudHMgPSBhd2FpdCByZWFkRmlsZShmdWxsUGF0aCwgXCJ1dGYtOFwiKTtcclxuICAgICAgICBjb25zdCBzbmFwc2hvdDogQ29tcGFjdGlvblNuYXBzaG90ID0gSlNPTi5wYXJzZShmaWxlQ29udGVudHMpO1xyXG5cclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBmaWxlUGF0aDogZnVsbFBhdGgsXHJcbiAgICAgICAgICAgIC4uLnNuYXBzaG90LFxyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIG51bGw7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NDb21wYWN0aW9uRmlsZURhdGFBbmRDcmVhdGVNZW1vcnlTZWVkcyhcclxuICAgIHBhcnNlZENvbXBhY3Rpb25GaWxlRGF0YTogKHsgZmlsZVBhdGg6IHN0cmluZyB9ICYgQ29tcGFjdGlvblNuYXBzaG90KSxcclxuKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICBjb25zdCBmaWxlUGF0aCA9IHBhcnNlZENvbXBhY3Rpb25GaWxlRGF0YS5maWxlUGF0aDtcclxuICAgIGNvbnN0IHBhcnNlZENvbXBhY3Rpb25GaWxlRGF0YVBhcmFtcyA9IHBhcnNlZENvbXBhY3Rpb25GaWxlRGF0YS5wYXJhbXM7XHJcbiAgICBjb25zdCBtZXNzYWdlczogQ2hhdE1lc3NhZ2VbXSA9IHBhcnNlZENvbXBhY3Rpb25GaWxlRGF0YS5tZXNzYWdlcztcclxuICAgIGNvbnN0IGZpbGVOYW1lID0gcGFyc2VkQ29tcGFjdGlvbkZpbGVEYXRhUGFyYW1zLmNvbnZlcnNhdGlvbk5hbWU7XHJcblxyXG4gICAgY29uc3Qgc3BsaXRUb1BhcnRzID0gcGFyc2VkQ29tcGFjdGlvbkZpbGVEYXRhUGFyYW1zLmF1dG9DbGVhbnVwVGhyZXNob2xkID4gNjAgPyAzIDogMjtcclxuXHJcbiAgICAvLyBBY2NvdW50IGZvciB0aGUgbGF0ZXN0IGFzc2lzdGFudCByZXNwb25zZSBtaXNzaW5nIGZyb20gdGhlIGFycmF5LlxyXG4gICAgY29uc3QgdG90YWxBc3Npc3RhbnRSZXNwb25zZXMgPSBtZXNzYWdlcy5maWx0ZXIoaXNFbGlnaWJsZUFzc2lzdGFudE1lc3NhZ2UpLmxlbmd0aCArIDE7XHJcblxyXG4gICAgY29uc3QgZmlyc3RSZXNwb25zZSA9IHBhcnNlZENvbXBhY3Rpb25GaWxlRGF0YVBhcmFtcy5rZWVwT2xkZXN0TiArIDE7XHJcbiAgICBjb25zdCBsYXN0UmVzcG9uc2UgPSB0b3RhbEFzc2lzdGFudFJlc3BvbnNlcyAtIHBhcnNlZENvbXBhY3Rpb25GaWxlRGF0YVBhcmFtcy5rZWVwTmV3ZXN0TjtcclxuICAgIGNvbnN0IHJlc3BvbnNlc1RvQ29tcGFjdCA9IE1hdGgubWF4KFxyXG4gICAgICAgIDAsXHJcbiAgICAgICAgbGFzdFJlc3BvbnNlIC0gZmlyc3RSZXNwb25zZSxcclxuICAgICk7XHJcblxyXG4gICAgLy8gTmV2ZXIgY3JlYXRlIG1vcmUgcGFydHMgdGhhbiB0aGVyZSBhcmUgcmVzcG9uc2VzIHRvIHNhdmUuXHJcbiAgICBjb25zdCBudW1iZXJPZlBhcnRzID0gTWF0aC5taW4oc3BsaXRUb1BhcnRzLCByZXNwb25zZXNUb0NvbXBhY3QpOyAgIC8vZ29vZFxyXG5cclxuICAgIGNvbnN0IG1hdGNoaW5nRmlsZXMgPSBhd2FpdCBzY2FuRm9yQW5kUmV0dXJuTWF0Y2hpbmdGaWxlcyhmaWxlTmFtZSk7XHJcblxyXG4gICAgY29uc3QgZXNjYXBlUmVnRXhwID0gKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuICAgICAgICB2YWx1ZS5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgXCJcXFxcJCZcIik7XHJcblxyXG4gICAgY29uc3QgY29tcGFjdGlvblBhdHRlcm4gPSBuZXcgUmVnRXhwKFxyXG4gICAgICAgIGBeJHtlc2NhcGVSZWdFeHAoZmlsZU5hbWUpfV9jKFxcXFxkKylfcChcXFxcZCspXFxcXC5qc29uJGAsXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IGhpZ2hlc3RDb21wYWN0aW9uTnVtYmVyID0gbWF0Y2hpbmdGaWxlcy5yZWR1Y2UoXHJcbiAgICAgICAgKGhpZ2hlc3QsIGVudHJ5KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gZW50cnkubmFtZS5tYXRjaChjb21wYWN0aW9uUGF0dGVybik7XHJcbiAgICAgICAgICAgIHJldHVybiBNYXRoLm1heChoaWdoZXN0LCBOdW1iZXIobWF0Y2g/LlsxXSA/PyAwKSk7XHJcbiAgICAgICAgfSxcclxuICAgICAgICAwLFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBuZXh0Q29tcGFjdGlvbk51bWJlciA9IGhpZ2hlc3RDb21wYWN0aW9uTnVtYmVyICsgMTtcclxuIFxyXG4gICAgY29uc3QgaXNGaXJzdENvbXBhY3Rpb24gPSBtYXRjaGluZ0ZpbGVzLmxlbmd0aCA9PT0gMDtcclxuXHJcbiAgICBsZXQgaGFuZGxlZEZpcnN0Q29tcGFjdGlvbiA9ICFpc0ZpcnN0Q29tcGFjdGlvbjtcclxuXHJcbiAgICBpZiAobnVtYmVyT2ZQYXJ0cyA9PT0gMCkge1xyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBEaXN0cmlidXRlIHJlc3BvbnNlcyBldmVubHk7IHB1dCBhbnkgcmVtYWluZGVyIGluIHRoZSBsYXN0IHBhcnQuXHJcbiAgICBjb25zdCBiYXNlU2l6ZSA9IE1hdGguZmxvb3IocmVzcG9uc2VzVG9Db21wYWN0IC8gbnVtYmVyT2ZQYXJ0cyk7XHJcbiAgICBjb25zdCByZW1haW5kZXIgPSByZXNwb25zZXNUb0NvbXBhY3QgJSBudW1iZXJPZlBhcnRzO1xyXG5cclxuICAgIGxldCBzZWVkc1dlcmVTYXZlZCA9IGZhbHNlO1xyXG5cclxuICAgIGxldCBtYXRjaGluZ0ZpbGVzQW5kTmV3QWRkaXRpb25zOiBzdHJpbmdbXSA9IG1hdGNoaW5nRmlsZXMubWFwKFxyXG4gICAgICAgIGVudHJ5ID0+IGVudHJ5Lm5hbWUsXHJcbiAgICApO1xyXG5cclxuICAgIC8vIFN0cmluZ2lmaWVkIE1lc3NhZ2VzIGdvZXMgdG8gbW9kZWwgdG8gdXNlIGZvciB0b3BpY3MuXHJcbiAgICAvLyBFeHRyYWN0ZWQgTWVzc2FnZXMgZ28gdG8gYmUgc2F2ZWQuXHJcbiAgICBjb25zdCB7IHN0cmluZ2lmaWVkTWVzc2FnZXMsIGV4dHJhY3RlZE1lc3NhZ2VzIH0gPSBhd2FpdCBwcmVwYXJlSGlzdG9yeU1lc3NhZ2VzRm9yTW9kZWwobWVzc2FnZXMpO1xyXG5cclxuICAgIGNvbnN0IHRvcGljc0Zvck1lc3NhZ2VzID0gYXdhaXQgbW9kZWxDYWxsVG9Qcm92aWRlVG9waWNzKHN0cmluZ2lmaWVkTWVzc2FnZXMpO1xyXG5cclxuICAgIGZvciAobGV0IHBhcnQgPSAxOyBwYXJ0IDw9IG51bWJlck9mUGFydHM7IHBhcnQrKykge1xyXG4gICAgICAgIGNvbnN0IHN0YXJ0T2Zmc2V0ID0gKHBhcnQgLSAxKSAqIGJhc2VTaXplO1xyXG5cclxuICAgICAgICBjb25zdCBlbmRPZmZzZXQgPVxyXG4gICAgICAgICAgICBwYXJ0ICogYmFzZVNpemUgK1xyXG4gICAgICAgICAgICAocGFydCA9PT0gbnVtYmVyT2ZQYXJ0cyA/IHJlbWFpbmRlciA6IDApO1xyXG5cclxuICAgICAgICBjb25zdCBwZW5kaW5nU2F2ZU1lbW9yeTogUGVuZGluZ1NhdmVNZW1vcnkgPSB7XHJcbiAgICAgICAgICAgIGFjdGl2ZTogdHJ1ZSxcclxuICAgICAgICAgICAgbWVtb3J5TnVtYmVyOiBoYW5kbGVkRmlyc3RDb21wYWN0aW9uXHJcbiAgICAgICAgICAgICAgICA/IGZpcnN0UmVzcG9uc2UgKyBzdGFydE9mZnNldFxyXG4gICAgICAgICAgICAgICAgOiAxLFxyXG4gICAgICAgICAgICBjYXRlZ29yeTogXCJjb21wYWN0aW9uc1wiLFxyXG4gICAgICAgICAgICBmaWxlTmFtZTogYCR7ZmlsZU5hbWUudHJpbSgpfV9jJHtuZXh0Q29tcGFjdGlvbk51bWJlcn1fcCR7cGFydH1gLFxyXG4gICAgICAgICAgICBtZW1vcnlOdW1iZXJFbmRSYW5nZTogZmlyc3RSZXNwb25zZSArIGVuZE9mZnNldCAtIDEsXHJcbiAgICAgICAgfTtcclxuXHJcbiAgICAgICAgLy8gSW5jbHVkZXMgdGhlIG5ldyBhZGRpdGlvbnMgaW50byB0aGUgYXJyYXkgd2UgcGFzcyBhbG9uZyB0byBjb25zdHJ1Y3QgdGhlIHRyYWlsIHRleHQgcmVwbGFjZW1lbnRcclxuICAgICAgICBtYXRjaGluZ0ZpbGVzQW5kTmV3QWRkaXRpb25zLnB1c2goXHJcbiAgICAgICAgICAgIGAke3BlbmRpbmdTYXZlTWVtb3J5LmZpbGVOYW1lfS5qc29uYCxcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBjb25zdCBzYXZlUmVzdWx0cyA9IGF3YWl0IG11bHRpU2F2ZU1lbW9yeUZvckNvbXBhY3Rpb24oXHJcbiAgICAgICAgICAgIHBlbmRpbmdTYXZlTWVtb3J5LFxyXG4gICAgICAgICAgICBleHRyYWN0ZWRNZXNzYWdlcyxcclxuICAgICAgICAgICAgdG9waWNzRm9yTWVzc2FnZXMsXHJcbiAgICAgICAgICAgIG1hdGNoaW5nRmlsZXNBbmROZXdBZGRpdGlvbnMsXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgLy8gY29uc29sZS5sb2coXCJQQVJUIFNBVkUgUkVTVUxUXCIsIHtcclxuICAgICAgICAvLyAgICAgcGFydCxcclxuICAgICAgICAvLyAgICAgZmlsZU5hbWU6IHBlbmRpbmdTYXZlTWVtb3J5LmZpbGVOYW1lLFxyXG4gICAgICAgIC8vICAgICBzdGFydDogcGVuZGluZ1NhdmVNZW1vcnkubWVtb3J5TnVtYmVyLFxyXG4gICAgICAgIC8vICAgICBlbmQ6IHBlbmRpbmdTYXZlTWVtb3J5Lm1lbW9yeU51bWJlckVuZFJhbmdlLFxyXG4gICAgICAgIC8vICAgICBzYXZlUmVzdWx0cyxcclxuICAgICAgICAvLyB9KTtcclxuXHJcbiAgICAgICAgLy8gTG9ncyBpZiBhbnkgc2VlZCBzYXZlZCBhdCBhbGwuXHJcbiAgICAgICAgaWYgKHNlZWRzV2VyZVNhdmVkID09PSBmYWxzZSkge1xyXG4gICAgICAgICAgICBzZWVkc1dlcmVTYXZlZCA9IHNhdmVSZXN1bHRzO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gdGhpcyBtYWtlcyBzdXJlIHRoZSBleGNsdWRlZCBiZWdpbm5pbmcgbWVzc2FnZXMgYXJlIGluY2x1ZGVkIGluIHRoZSBmaXJzdCBwYXJ0IHNhdmUsIG90aGVyd2lzZSB0aGV5IHdvdWxkIG5ldmVyXHJcbiAgICAgICAgLy8gZW50ZXIgdGhlIGNvbXBhY3Rpb24gY2hhaW4gYW5kIGJlIGxvc3QgZGF0YS5cclxuICAgICAgICBpZiAoIWhhbmRsZWRGaXJzdENvbXBhY3Rpb24pIHtcclxuICAgICAgICAgICAgaGFuZGxlZEZpcnN0Q29tcGFjdGlvbiA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIE5vIHNlZWRzIHdlcmUgc2F2ZWQgc3VjY2Vzc2Z1bGx5XHJcbiAgICBpZiAoIXNlZWRzV2VyZVNhdmVkKSB7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGFkZENvbnZlcnNhdGlvbk9wZXJhdGlvbihcclxuICAgICAgICBcInRyeUFwcGVuZFRPQ1RyYWlsRnVuY3Rpb25cIixcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIG1hdGNoaW5nRmlsZXNBbmROZXdBZGRpdGlvbnMsXHJcbiAgICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgLy8gQWxsIHBhcnRzIHNhdmVkIHN1Y2Nlc3NmdWxseS5cclxuICAgIC8vIGF3YWl0IHVubGluayhmaWxlUGF0aCk7XHJcbiAgICByZXR1cm4gdHJ1ZTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHRyeUFwcGVuZFRPQ1RyYWlsRnVuY3Rpb24oXHJcbiAgICBsYXRlc3RDb252ZXJzYXRpb246IGFueSxcclxuICAgIG1hdGNoaW5nRmlsZXM6IHN0cmluZ1tdLFxyXG4gICAgdGFyZ2V0QXNzaXN0YW50TWVzc2FnZUluZGV4OiBudW1iZXIsXHJcbik6IFByb21pc2U8dm9pZD57XHJcblxyXG4gICAgbGV0IGxpbmVzOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuICAgIGNvbnN0IG9yZGVyZWRQYXJ0TmFtZXMgPSBtYXRjaGluZ0ZpbGVzLm1hcCgoZmlsZU5hbWUsIGluZGV4KSA9PiB7XHJcbiAgICAgICAgY29uc3QgaXNMYXN0ID0gaW5kZXggPT09IG1hdGNoaW5nRmlsZXMubGVuZ3RoIC0gMTtcclxuICAgICAgICByZXR1cm4gaXNMYXN0XHJcbiAgICAgICAgICAgID8gYCoqJHtmaWxlTmFtZX0gXHUyMTkyIFtDdXJyZW50IFNlc3Npb25dKipgXHJcbiAgICAgICAgICAgIDogYCoke2ZpbGVOYW1lfSpgO1xyXG4gICAgfSkuam9pbihcIiBcdTIxOTIgXCIpO1xyXG5cclxuICAgIGNvbnN0IGNvbXBhY3Rpb25Db3VudCA9IG1hdGNoaW5nRmlsZXMubGVuZ3RoID4gMFxyXG4gICAgICAgID8gTnVtYmVyKG1hdGNoaW5nRmlsZXNbbWF0Y2hpbmdGaWxlcy5sZW5ndGggLSAxXS5tYXRjaCgvX2MoXFxkKylfcFxcZCtcXC5qc29uJC8pPy5bMV0gPz8gMClcclxuICAgICAgICA6IDA7XHJcblxyXG4gICAgbGluZXMucHVzaChcclxuICAgICAgICBgXHVEODNEXHVERUE4JHtbXHJcbiAgICAgICAgICAgIGAqKlRoaXMgY2hhdCBzZXNzaW9uIGhhcyBiZWVuIGNvbXBhY3RlZDoqKiAqKioke2NvbXBhY3Rpb25Db3VudH0qKiogcHJldmlvdXMgdGltZXMuYCxcclxuICAgICAgICAgICAgYCoqTGFzdGVzdCBDb21wYWN0aW9uIEZpbGUgTmFtZToqKiAke21hdGNoaW5nRmlsZXMubGVuZ3RoID4gMD8gYCoke21hdGNoaW5nRmlsZXNbbWF0Y2hpbmdGaWxlcy5sZW5ndGggLSAxXX0qYCA6IFwiXCJ9YCxcclxuICAgICAgICAgICAgYCoqW0NvbXBhY3Rpb24gVHJhaWxdOioqICR7b3JkZXJlZFBhcnROYW1lc31gLFxyXG4gICAgICAgICAgICBgXHUyQjA3XHVGRTBGW0Fzc2lzdGFudCBNZXNzYWdlXVx1MkIwN1x1RkUwRmBcclxuICAgICAgICBdXHJcbiAgICAgICAgICAgIC5maWx0ZXIoQm9vbGVhbilcclxuICAgICAgICAgICAgLmpvaW4oXCJcXG5cXG5cIil9YCxcclxuICAgICk7XHJcblxyXG4gICAgYXdhaXQgZWRpdEFzc2lzdGFudFJlc3BvbnNlKFxyXG4gICAgICAgIGxhdGVzdENvbnZlcnNhdGlvbixcclxuICAgICAgICBsaW5lcy5qb2luKFwiXFxuXFxuXCIpLFxyXG4gICAgICAgIHRhcmdldEFzc2lzdGFudE1lc3NhZ2VJbmRleCxcclxuICAgICAgICB0cnVlLCAgIC8vIEFwcGVuZCBpbnN0ZWFkIG9mIHJlcGxhY2luZyB0aGUgb3JpZ2luYWwgdGV4dFxyXG4gICAgKTtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG11bHRpU2F2ZU1lbW9yeUZvckNvbXBhY3Rpb24oXHJcbiAgICB1cGRhdGVkOiBQZW5kaW5nU2F2ZU1lbW9yeSxcclxuICAgIGV4dHJhY3RlZE1lc3NhZ2VzOiBFeHRyYWN0ZWRNZXNzYWdlW10sXHJcbiAgICB0b3BpY3NGb3JNZXNzYWdlczogc3RyaW5nLFxyXG4gICAgbWF0Y2hpbmdGaWxlc0FuZE5ld0FkZGl0aW9uczogc3RyaW5nW10sXHJcbik6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG5cclxuICAgIGNvbnN0IHtcclxuICAgICAgICBtZW1vcnlOdW1iZXI6IHN0YXJ0TWVtb3J5TnVtYmVyLFxyXG4gICAgICAgIG1lbW9yeU51bWJlckVuZFJhbmdlOiBlbmRNZW1vcnlOdW1iZXIsXHJcbiAgICAgICAgY2F0ZWdvcnksXHJcbiAgICAgICAgZmlsZU5hbWUsXHJcbiAgICB9ID0gdXBkYXRlZDtcclxuXHJcbiAgICBpZiAoXHJcbiAgICAgICAgc3RhcnRNZW1vcnlOdW1iZXIgPT0gbnVsbCB8fFxyXG4gICAgICAgIGVuZE1lbW9yeU51bWJlciA9PSBudWxsIHx8XHJcbiAgICAgICAgY2F0ZWdvcnkgPT0gbnVsbCB8fFxyXG4gICAgICAgIGZpbGVOYW1lID09IG51bGxcclxuICAgICkge1xyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IHNlZWRzOiBNZW1vcnlTZWVkW10gPSBbXTtcclxuXHJcbiAgICAgICAgZm9yIChcclxuICAgICAgICAgICAgbGV0IG1lbW9yeU51bWJlciA9IHN0YXJ0TWVtb3J5TnVtYmVyO1xyXG4gICAgICAgICAgICBtZW1vcnlOdW1iZXIgPD0gZW5kTWVtb3J5TnVtYmVyO1xyXG4gICAgICAgICAgICBtZW1vcnlOdW1iZXIrK1xyXG4gICAgICAgICkge1xyXG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gZXh0cmFjdGVkTWVzc2FnZXMuZmluZChcclxuICAgICAgICAgICAgICAgIGl0ZW0gPT4gaXRlbS5tZW1vcnlOdW1iZXIgPT09IG1lbW9yeU51bWJlcixcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGlmICghbWVzc2FnZSkge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS53YXJuKGBObyBleHRyYWN0ZWQgbWVzc2FnZSBmb3VuZCBmb3IgbWVtb3J5ICR7bWVtb3J5TnVtYmVyfWApO1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IG91dHB1dCA9IGNsZWFuQXNzaXN0YW50UmVzcG9uc2UobWVzc2FnZS5vdXRwdXQpO1xyXG5cclxuICAgICAgICAgICAgaWYgKGlzTWV0YWRhdGFPbmx5T3V0cHV0KG91dHB1dCkpe1xyXG4gICAgICAgICAgICAgICAgLy8gY29uc29sZS5sb2cobWVtb3J5TnVtYmVyLFwiPT09PT09c2tpcHBlZFwiKVxyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGNsZWFuZWREaXJlY3RJbnB1dCA9IGNsZWFuVXNlcklucHV0KG1lc3NhZ2UuZGlyZWN0X2lucHV0Py50cmltKCkpO1xyXG4gICAgICAgICAgICBjb25zdCBjbGVhbmVkUm9vdElucHV0ID0gY2xlYW5Vc2VySW5wdXQoZ2V0VG9waWNGb3JNZXNzYWdlKG1lbW9yeU51bWJlciwgdG9waWNzRm9yTWVzc2FnZXMpLnRyaW0oKSk7XHJcbiAgICAgICAgICAgIC8vIGNvbnNvbGUubG9nKFxyXG4gICAgICAgICAgICAvLyAgICAgXCJtZW1vcnlOdW1iZXI6XCIsbWVtb3J5TnVtYmVyLFxyXG4gICAgICAgICAgICAvLyApLFxyXG4gICAgICAgICAgICBzZWVkcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIGRhdGU6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgICAgIHJvb3RfaW5wdXQ6IGNsZWFuZWRSb290SW5wdXQsXHJcbiAgICAgICAgICAgICAgICBkaXJlY3RfaW5wdXQ6IGNsZWFuZWREaXJlY3RJbnB1dCxcclxuICAgICAgICAgICAgICAgIG91dHB1dDogb3V0cHV0LFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIE5vIGVsaWdpYmxlIHNlZWRzIHdlcmUgY29sbGVjdGVkLlxyXG4gICAgICAgIGlmIChzZWVkcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gU2F2ZSBhbGwgY29sbGVjdGVkIHNlZWRzIGluIG9uZSB3cml0ZSBvcGVyYXRpb24uXHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IG1lbW9yeVN0b3JlLnNhdmVNdWx0aXBsZVNlZWRzKFxyXG4gICAgICAgICAgICBjYXRlZ29yeSxcclxuICAgICAgICAgICAgZmlsZU5hbWUsXHJcbiAgICAgICAgICAgIHNlZWRzLFxyXG4gICAgICAgICAgICBzdGFydE1lbW9yeU51bWJlcixcclxuICAgICAgICAgICAgdHJ1ZSwgLy8gY2FsbGVySXNDb21wYWN0aW9uXHJcbiAgICAgICAgICAgIG1hdGNoaW5nRmlsZXNBbmROZXdBZGRpdGlvbnMsXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXHJcbiAgICAgICAgICAgIFwiRXJyb3IgY3JlYXRpbmcgTWVtb3J5IFNlZWQ6IFwiICtcclxuICAgICAgICAgICAgYCR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWAsXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBnZXRUb3BpY0Zvck1lc3NhZ2UoXHJcbiAgICBtZW1vcnlOdW1iZXI6IG51bWJlcixcclxuICAgIHRvcGljc0Zvck1lc3NhZ2VzOiBzdHJpbmcsXHJcbik6IHN0cmluZyB7XHJcbiAgICBjb25zdCB0b3BpY1BhdHRlcm4gPVxyXG4gICAgICAgIC9Ub3BpYzpcXHMqKC4qPylcXHMqXHVEODNEXHVERDM5XFxzKihcXGQrKVxccyotXFxzKihcXGQrfGVuZCkvZ2k7XHJcblxyXG4gICAgY29uc3QgdG9waWNSYW5nZXMgPSBbLi4udG9waWNzRm9yTWVzc2FnZXMubWF0Y2hBbGwodG9waWNQYXR0ZXJuKV0ubWFwKFxyXG4gICAgICAgIG1hdGNoID0+ICh7XHJcbiAgICAgICAgICAgIHRvcGljOiBtYXRjaFsxXS5yZXBsYWNlKC9bXFxbXFxdXFwvXS9nLCBcIlwiKS50cmltKCksXHJcbiAgICAgICAgICAgIHN0YXJ0OiBOdW1iZXIobWF0Y2hbMl0pLFxyXG4gICAgICAgICAgICBlbmQ6IG1hdGNoWzNdLnRvTG93ZXJDYXNlKCkgPT09IFwiZW5kXCJcclxuICAgICAgICAgICAgICAgID8gSW5maW5pdHlcclxuICAgICAgICAgICAgICAgIDogTnVtYmVyKG1hdGNoWzNdKSxcclxuICAgICAgICB9KSxcclxuICAgICkuc29ydCgoYSwgYikgPT4gYS5zdGFydCAtIGIuc3RhcnQpO1xyXG5cclxuICAgIGNvbnN0IG1hdGNoaW5nUmFuZ2UgPSB0b3BpY1Jhbmdlcy5maW5kKFxyXG4gICAgICAgIHJhbmdlID0+XHJcbiAgICAgICAgICAgIG1lbW9yeU51bWJlciA+PSByYW5nZS5zdGFydCAmJlxyXG4gICAgICAgICAgICBtZW1vcnlOdW1iZXIgPD0gcmFuZ2UuZW5kLFxyXG4gICAgKTtcclxuXHJcbiAgICBpZiAobWF0Y2hpbmdSYW5nZSkge1xyXG4gICAgICAgIHJldHVybiBtYXRjaGluZ1JhbmdlLnRvcGljO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZhbGxiYWNrIGJlY2F1c2UgdGhlIG1vZGVsIGhhcyBzaG93biB0byBzb21ldGltZXMgbGVhdmUgZ2FwcyBpbiB0b3BpYyByYW5nZSBjb3ZlcmFnZS5cclxuICAgIC8vIFNvIHNvbWUgbWVtb3J5TnVtYmVycyBkb250IGJlbG9uZyB0byBhbnl0aGluZy4gVGhpcyB3aWxsIHJvbGwgaXQgb3ZlciBpbnRvIGEgbmVpZ2hib3JpbmcgYXZhaWxhYmxlIHRvcGljLlxyXG4gICAgLy8gSSd2ZSB0d2Vha2VkIHRoZSBwcm9tcHQgYW5kIHRvcGljIHBhcnNlciB0byBhbGxvdyBmb3IgdmFyaWFuY2VzIGluIHRoZSByZXR1cm4gb2YgdGhlIHRvcGljcyBzdHJpbmcuIFRoaXMgYW5vdGhlciBsYXllciBvZiBpbnN1cmFuY2UuXHJcbiAgICBjb25zdCBuZXh0UmFuZ2UgPSB0b3BpY1Jhbmdlcy5maW5kKFxyXG4gICAgICAgIHJhbmdlID0+IHJhbmdlLnN0YXJ0ID4gbWVtb3J5TnVtYmVyLFxyXG4gICAgKTtcclxuXHJcbiAgICBpZiAobmV4dFJhbmdlKSB7XHJcbiAgICAgICAgcmV0dXJuIG5leHRSYW5nZS50b3BpYztcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBwcmV2aW91c1JhbmdlcyA9IHRvcGljUmFuZ2VzLmZpbHRlcihcclxuICAgICAgICByYW5nZSA9PiByYW5nZS5lbmQgPCBtZW1vcnlOdW1iZXIsXHJcbiAgICApO1xyXG5cclxuICAgIHJldHVybiBwcmV2aW91c1Jhbmdlcy5sZW5ndGggPiAwXHJcbiAgICAgICAgPyBwcmV2aW91c1Jhbmdlc1twcmV2aW91c1Jhbmdlcy5sZW5ndGggLSAxXS50b3BpY1xyXG4gICAgICAgIDogXCJcIjtcclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHByZXBhcmVIaXN0b3J5TWVzc2FnZXNGb3JNb2RlbChcclxuICAgIG1lc3NhZ2VzOiBDaGF0TWVzc2FnZVtdLFxyXG4pOiBQcm9taXNlPHtcclxuICAgIHN0cmluZ2lmaWVkTWVzc2FnZXM6IHN0cmluZztcclxuICAgIGV4dHJhY3RlZE1lc3NhZ2VzOiBFeHRyYWN0ZWRNZXNzYWdlW107XHJcbn0+IHtcclxuICAgIGNvbnN0IExNX1NUVURJT19USElOS0lOR19FTkQgPVxyXG4gICAgICAgIC9fX0xNX1NUVURJT19JTlRFUk5BTF9MU0VQX1NZTlRIRVRJQ19SRUFTT05JTkdfRU5EX1thLXowLTldK19fL2k7XHJcblxyXG4gICAgbGV0IHR1cm4gPSAwO1xyXG4gICAgbGV0IGNvbnZlcnNhdGlvblRleHQgPSBcIlwiO1xyXG5cclxuICAgIGNvbnN0IGV4dHJhY3RlZE1lc3NhZ2VzOiBFeHRyYWN0ZWRNZXNzYWdlW10gPSBbXTtcclxuXHJcbiAgICBtZXNzYWdlc1xyXG4gICAgICAgIC5maWx0ZXIobWVzc2FnZSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJvbGUgPSAobWVzc2FnZSBhcyBhbnkpLmRhdGEucm9sZTtcclxuICAgICAgICAgICAgcmV0dXJuIHJvbGUgPT09IFwidXNlclwiIHx8IHJvbGUgPT09IFwiYXNzaXN0YW50XCI7XHJcbiAgICAgICAgfSlcclxuICAgICAgICAuZm9yRWFjaChtZXNzYWdlID0+IHtcclxuICAgICAgICAgICAgY29uc3Qgcm9sZSA9IChtZXNzYWdlIGFzIGFueSkuZGF0YS5yb2xlO1xyXG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gKG1lc3NhZ2UgYXMgYW55KS5kYXRhPy5jb250ZW50ID8/IFtdO1xyXG5cclxuICAgICAgICAgICAgaWYgKHJvbGUgPT09IFwidXNlclwiKSB7XHJcbiAgICAgICAgICAgICAgICB0dXJuKys7XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dCA9XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGVudFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAuZmluZCgoaXRlbTogYW55KSA9PiBpdGVtLnR5cGUgPT09IFwidGV4dFwiKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICA/LnRleHQ/LnRyaW0oKSA/PyBcIlwiO1xyXG5cclxuICAgICAgICAgICAgICAgIGV4dHJhY3RlZE1lc3NhZ2VzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgICAgIG1lbW9yeU51bWJlcjogdHVybixcclxuICAgICAgICAgICAgICAgICAgICBkaXJlY3RfaW5wdXQ6IHRleHQsXHJcbiAgICAgICAgICAgICAgICAgICAgb3V0cHV0OiBcIlwiLFxyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgY29udmVyc2F0aW9uVGV4dCArPSBgWyR7dHVybn1dVXNlcjogXCIke3RleHR9XCJcXG5gO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCB0ZXh0ID0gY29udGVudFxyXG4gICAgICAgICAgICAgICAgLmZpbHRlcihcclxuICAgICAgICAgICAgICAgICAgICAoaXRlbTogYW55KSA9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpdGVtLnR5cGUgPT09IFwidGV4dFwiICYmXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHR5cGVvZiBpdGVtLnRleHQgPT09IFwic3RyaW5nXCIgJiZcclxuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbS50ZXh0LnRyaW0oKSAhPT0gXCJcIiAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAhTE1fU1RVRElPX1RISU5LSU5HX0VORC50ZXN0KGl0ZW0udGV4dC50cmltKCkpLFxyXG4gICAgICAgICAgICAgICAgKVxyXG4gICAgICAgICAgICAgICAgLmF0KC0xKVxyXG4gICAgICAgICAgICAgICAgPy50ZXh0LnRyaW0oKSA/PyBcIlwiO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgY3VycmVudE1lc3NhZ2UgPSBleHRyYWN0ZWRNZXNzYWdlcy5maW5kKFxyXG4gICAgICAgICAgICAgICAgaXRlbSA9PiBpdGVtLm1lbW9yeU51bWJlciA9PT0gdHVybixcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChjdXJyZW50TWVzc2FnZSkge1xyXG4gICAgICAgICAgICAgICAgY3VycmVudE1lc3NhZ2Uub3V0cHV0ID0gdGV4dDtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29udmVyc2F0aW9uVGV4dCArPVxyXG4gICAgICAgICAgICAgICAgYFske3R1cm59XUFzc2lzdGFudCByZXNwb25zZTogXCIke3RleHR9XCJcXG5gO1xyXG4gICAgICAgIH0pO1xyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgc3RyaW5naWZpZWRNZXNzYWdlczogY29udmVyc2F0aW9uVGV4dCxcclxuICAgICAgICBleHRyYWN0ZWRNZXNzYWdlcyxcclxuICAgIH07XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIG1vZGVsQ2FsbFRvUHJvdmlkZVRvcGljcyhcclxuICAgIGNvbnZlcnNhdGlvblRleHQ6IHN0cmluZyxcclxuKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuICAgIGNvbnN0IGNsaWVudCA9IGdldENvbnRyb2xsZXIoKS5jbGllbnQ7XHJcbiAgICBjb25zdCBtb2RlbCA9IGF3YWl0IGNsaWVudC5sbG0ubW9kZWwoKTtcclxuICAgIFxyXG4gICAgY29uc3QgcHJvbXB0ID0gYFxyXG4gICAgICAgIFByb3ZpZGVkIHRvIHlvdSBpcyBhIGNoYXQgdHJhbnNjcmlwdCBiZXR3ZWVuIGEgdXNlciBhbmQgYXNzaXN0YW50IHdpdGggYSBwcmVmaXggbGFiZWxpbmcgZWFjaCB0dXJuIHdoaWNoIGl0IGJlbG9uZ3MgdG9vLlxyXG5cclxuICAgICAgICBUaGUgdXNlciBuZWVkcyB5b3UgdGhlIGFzc2lzdGFudCB0byBjb21iIHRocm91Z2ggdGhlIGNoYXQgdHJhbnNjcmlwdCBhbmQgYXNzaWduIGEgdG9waWMgdG8gYSByYW5nZSBvZiBzaW1pbGFybHkgcmVsYXRlZCB1c2VyIGFuZCBhc3Npc3RhbnQgbWVzc2FnZXMuXHJcblxyXG4gICAgICAgIFRoZXNlIG1lc3NhZ2VzIGFyZSBvcmRlcmVkIGNocm9ub2xvZ2ljYWxseSwgdGhlIGluaXRpYWwgdG9waWMgc2hvdWxkIGJlIGVzdGFibGlzaGVkIGJ5IHRoZSBlYXJsaWVzdCBtZXNzYWdlcy4gQW55IGRpc3RpbmN0IGNoYW5nZSBhbmQgc2hpZnQgaW4gdG9waWMgc2hvdWxkIGJlIG5vdGVkLlxyXG5cclxuICAgICAgICBBbGwgbWVzc2FnZSB0dXJucyBtdXN0IGJlbG9uZyB0byBhIHRvcGljIGdyb3VwLiBEbyBub3QgZXhjbHVkZSBhbnkgcmFuZ2UgYW5kIGVuc3VyZSBmdWxsIGNvdmVyYWdlLiBMZWF2ZSBubyBnYXBzIGJldHdlZW4gdGhlIGVuZCBvZiBvbmUgcmFuZ2UgYW5kIHRoZSBiZWdpbm5pbmcgb2YgYW5vdGhlci5cclxuXHJcbiAgICAgICAgT25seSBtZWFuaW5nZnVsIHRvcGljcyBzaG91bGQgYmUgbm90ZWQuIElmIGEgdG9waWMgZG9lcyBub3QgY2FycnkgbXVjaCB3ZWlnaHQgdG8gdGhlIGNvbnZlcnNhdGlvbiBvciBpcyBpcnJlbGV2YW50LCByb2xsIHRoYXQgdHVybiBpbnRvIHRoZSBuZXh0IHRvcGljIG9mIHNpZ25pZmljYW5jZS5cclxuXHJcbiAgICAgICAgWW91IGFyZSBub3QgdHJ5aW5nIHRvIGRldGVybWluZSBldmVyeSBwb3NzaWJsZSB0b3BpYyBwcmVzZW50LiBZb3UgYXJlIG9ubHkgdHJ5aW5nIHRvIGRldGVybWluZSB0aGUgdG9waWNzIG9mIGltcG9ydGFuY2UuXHJcblxyXG4gICAgICAgIElmIHRvcGljcyBzd2l0Y2ggYmFjayB0byBhbiBlYXJsaWVyIHRvcGljIHRoYXQgd2FzIGRldmlhdGVkIGZyb20sIHRoZW4gdGhlIHRvcGljIGFuZCBpdCdzIGFzc29jaWF0ZWQgcmFuZ2VzIHNob3VsZCBiZSBub3RlZC5cclxuXHJcbiAgICAgICAgVGhlIHVzZXIgZXhwZWN0cyBhIHN0cmluZyB0byBiZSByZXR1cm5lZCBmb3JtYXR0ZWQgc3RyaWN0bHkgYXMgW1RvcGljOiA8VG9waWM+IFx1RDgzRFx1REQzOSA8YmVnaW5uaW5nX29mX251bWJlcl9yYW5nZT4gLSA8ZW5kaW5nX29mX251bWJlcl9yYW5nZT5dIGZvciBldmVyeSB0b3BpYyB0aGF0IHlvdSBoYXZlIGlkZW50aWZ5LlxyXG5cclxuICAgICAgICBVc2UgdGhlIFx1RDgzRFx1REQzOSBlbW9qaSBhcyB0aGUgbWFuZGF0b3J5IHNlcGFyYXRvciBiZXR3ZWVuIHRoZSB0b3BpYyBuYW1lIGFuZCB0aGUgbnVtZXJpYyByYW5nZS5cclxuXHJcbiAgICAgICAgVG9waWNzIGFyZSBub3QgbWlub3IgZGlmZmVyZW5jZXMgaW4gbnVhbmNlcywgdGhleSBtdXN0IGJlIHNpZ25pZmljYW50IHNoaWZ0cyBpbiB0b25lLCBzdWJqZWN0LCBnb2FsLCBpbnF1aXJ5LCBvciByZXN1bHRzLlxyXG5cclxuICAgICAgICBbQkVHSU5OSU5HIE9GIENIQVQgVFJBTlNDUklQVF06IFxyXG4gICAgICAgICR7Y29udmVyc2F0aW9uVGV4dH1cclxuICAgICAgICBbRU5EIE9GIENIQVQgVFJBTlNDUklQVF1cclxuICAgICAgICBgLnRyaW0oKTtcclxuXHJcbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBtb2RlbC5yZXNwb25kKFxyXG4gICAgICAgIHByb21wdCxcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHRlbXBlcmF0dXJlOiAwLFxyXG4gICAgICAgIH0sXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IGNsZWFuZWRUZXh0ID0gcmVzdWx0LmNvbnRlbnRcclxuICAgICAgICAucmVwbGFjZShcclxuICAgICAgICAgICAgL15bXFxzXFxTXSo/X19MTV9TVFVESU9fSU5URVJOQUxfTFNFUF9TWU5USEVUSUNfUkVBU09OSU5HX0VORF9bQS1aYS16MC05XStfXy9pLFxyXG4gICAgICAgICAgICBcIlwiLFxyXG4gICAgICAgIClcclxuICAgICAgICAucmVwbGFjZSgvXltcXHNcXFNdKj9gYGAoPzpqc29uKT9cXHMqL2ksIFwiXCIpXHJcbiAgICAgICAgLnJlcGxhY2UoL1xccypgYGBbXFxzXFxTXSokL2ksIFwiXCIpXHJcbiAgICAgICAgLnRyaW0oKTtcclxuXHJcbiAgICByZXR1cm4gY2xlYW5lZFRleHQ7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB1cGRhdGVUYWJsZU9mQ29tcGFjdGlvbnNJbmNyZW1lbnRhbGx5KFxyXG4gICAgbWVtb3JpZXNEaXJlY3Rvcnk6IHN0cmluZyxcclxuICAgIGNhdGVnb3J5OiBzdHJpbmcsXHJcbiAgICBuYW1lOiBzdHJpbmcsXHJcbiAgICBzZWVkczogTWVtb3J5U2VlZFtdLFxyXG4gICAgbWF0Y2hpbmdGaWxlc0FuZE5ld0FkZGl0aW9ucz86IHN0cmluZ1tdLFxyXG4pOiBQcm9taXNlPHZvaWQ+IHtcclxuXHJcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZShEYXRlLm5vdygpKTtcclxuXHJcbiAgICBjb25zdCB0b2RheSA9IFtcclxuICAgICAgICBub3cuZ2V0RnVsbFllYXIoKSxcclxuICAgICAgICBTdHJpbmcobm93LmdldE1vbnRoKCkgKyAxKS5wYWRTdGFydCgyLCBcIjBcIiksXHJcbiAgICAgICAgU3RyaW5nKG5vdy5nZXREYXRlKCkpLnBhZFN0YXJ0KDIsIFwiMFwiKSxcclxuICAgIF0uam9pbihcIi1cIik7XHJcblxyXG4gICAgY29uc3QgdGFibGVOYW1lID0gYFRPQ18ke3RvZGF5fS5qc29uYDtcclxuXHJcbiAgICBjb25zdCB0b2NGaWxlUGF0aCA9IHBhdGguam9pbihcclxuICAgICAgICAgICAgbWVtb3JpZXNEaXJlY3RvcnksXHJcbiAgICAgICAgICAgIFwiY29tcGFjdGlvbnNcIixcclxuICAgICAgICAgICAgXCJUT0NfRW50aXR5XCIsXHJcbiAgICAgICAgICAgIHRhYmxlTmFtZVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgY29uc3QgZmlsZU5hbWUgPSBgJHtuYW1lfS5qc29uYDtcclxuXHJcbiAgICBjb25zdCB0b21Db250ZW50ID0gYXdhaXQgZnMucmVhZEZpbGUoXHJcbiAgICAgICAgdG9jRmlsZVBhdGgsXHJcbiAgICAgICAgXCJ1dGYtOFwiLFxyXG4gICAgKTtcclxuICAgIFxyXG4gICAgY29uc3QgdGFibGVPZk1lbW9yaWVzOiBUYWJsZU9mQ29tcGFjdGlvbnNFbnRpdHlbXSA9XHJcbiAgICAgICAgSlNPTi5wYXJzZSh0b21Db250ZW50KTtcclxuXHJcbiAgICBjb25zdCBleGlzdGluZ0luZGV4ID0gdGFibGVPZk1lbW9yaWVzLmZpbmRJbmRleChcclxuICAgICAgICAoZW50cnkpID0+IGVudHJ5LmZpbGVOYW1lID09PSBmaWxlTmFtZSxcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgZXhpc3RpbmdFbnRyeSA9XHJcbiAgICAgICAgZXhpc3RpbmdJbmRleCAhPT0gLTFcclxuICAgICAgICAgICAgPyB0YWJsZU9mTWVtb3JpZXNbZXhpc3RpbmdJbmRleF1cclxuICAgICAgICAgICAgOiB1bmRlZmluZWQ7XHJcblxyXG4gICAgLy8gLy8gU2VuZCBvbmx5IHRoZSBleGlzdGluZyBUT00gc3VtbWFyeS9rZXl3b3JkcyBhbmQgbmV3IHNlZWRzLlxyXG4gICAgY29uc3QgbmV3TWVtb3J5RnJhZ21lbnRzID0gc2VlZHNcclxuICAgICAgICAubWFwKFxyXG4gICAgICAgICAgICAoc2VlZCwgaW5kZXgpID0+XHJcbiAgICAgICAgICAgICAgICBgW1R1cm4gJHtpbmRleCArIDF9XSBVc2VyOiAke3NlZWQuZGlyZWN0X2lucHV0fVxcbmAgK1xyXG4gICAgICAgICAgICAgICAgYEFzc2lzdGFudDogJHtzZWVkLm91dHB1dH1gLFxyXG4gICAgICAgIClcclxuICAgICAgICAuam9pbihcIlxcblxcblwiKTtcclxuXHJcbiAgICBjb25zdCBjb25zb2xpZGF0aW9uSW5wdXQgPSBbXHJcbiAgICAgICAgXCJDVVJSRU5UIFNVTU1BUlk6XCIsXHJcbiAgICAgICAgZXhpc3RpbmdFbnRyeT8uc3VtbWFyeSA/PyBcIlwiLFxyXG4gICAgICAgIFwiXCIsXHJcbiAgICAgICAgXCJDVVJSRU5UIEtFWVdPUkRTOlwiLFxyXG4gICAgICAgIGV4aXN0aW5nRW50cnk/LmtleXdvcmRzID8/IFwiXCIsXHJcbiAgICAgICAgXCJcIixcclxuICAgICAgICBcIk5FVyBNRU1PUlkgRlJBR01FTlRTOlwiLFxyXG4gICAgICAgIG5ld01lbW9yeUZyYWdtZW50cyxcclxuICAgIF0uam9pbihcIlxcblwiKTtcclxuXHJcbiAgICBjb25zdCBzdW1tYXJ5UmV0dXJuUGFja2FnZSA9IGF3YWl0IG1vZGVsQ2FsbFRvVXBkYXRlTWVtb3J5U3VtbWFyeUFuZEtleXdvcmRzKGNvbnNvbGlkYXRpb25JbnB1dCk7XHJcblxyXG4gICAgY29uc3QgeyBzdW1tYXJ5LCBrZXl3b3JkcyB9ID0gZXh0cmFjdFN1bW1hcnlBbmRLZXl3b3JkcyhzdW1tYXJ5UmV0dXJuUGFja2FnZSk7XHJcblxyXG4gICAgY29uc3QgbWVtb3J5RmlsZVBhdGggPSBwYXRoLmpvaW4oXHJcbiAgICAgICAgbWVtb3JpZXNEaXJlY3RvcnksXHJcbiAgICAgICAgXCJjb21wYWN0aW9uc1wiLFxyXG4gICAgICAgIFwiVE9DX1NlZWRzXCIsXHJcbiAgICAgICAgYCR7bmFtZX0uanNvbmAsXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IG1lbW9yeVN0YXRzID0gYXdhaXQgc3RhdChtZW1vcnlGaWxlUGF0aCk7XHJcblxyXG4gICAgaWYgKG1hdGNoaW5nRmlsZXNBbmROZXdBZGRpdGlvbnMgPT09IHVuZGVmaW5lZCkgcmV0dXJuO1xyXG5cclxuICAgIGNvbnN0IGN1cnJlbnRJbmRleCA9IG1hdGNoaW5nRmlsZXNBbmROZXdBZGRpdGlvbnMuaW5kZXhPZihmaWxlTmFtZSk7XHJcblxyXG4gICAgY29uc3QgcHJlY2VkaW5nX2NvbXBhY2F0aW9uX2ZpbGVOYW1lID1cclxuICAgICAgICBjdXJyZW50SW5kZXggPiAwXHJcbiAgICAgICAgICAgID8gbWF0Y2hpbmdGaWxlc0FuZE5ld0FkZGl0aW9uc1tjdXJyZW50SW5kZXggLSAxXVxyXG4gICAgICAgICAgICA6IFwiXCI7XHJcblxyXG4gICAgY29uc3QgdXBkYXRlZEVudHJ5OiBUYWJsZU9mQ29tcGFjdGlvbnNFbnRpdHkgPSB7XHJcbiAgICAgICAgZmlsZVNpemVLQjogbWVtb3J5U3RhdHMuc2l6ZSAvIDEwMjQsXHJcbiAgICAgICAgZmlsZU5hbWUsXHJcbiAgICAgICAga2V5d29yZHMsXHJcbiAgICAgICAgc3VtbWFyeSxcclxuICAgICAgICBwcmVjZWRpbmdfY29tcGFjYXRpb25fZmlsZU5hbWUsXHJcbiAgICB9O1xyXG5cclxuICAgIGlmIChleGlzdGluZ0luZGV4ICE9PSAtMSkge1xyXG4gICAgICAgIHRhYmxlT2ZNZW1vcmllc1tleGlzdGluZ0luZGV4XSA9IHVwZGF0ZWRFbnRyeTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgdGFibGVPZk1lbW9yaWVzLnB1c2godXBkYXRlZEVudHJ5KTtcclxuICAgIH1cclxuXHJcbiAgICBhd2FpdCBmcy53cml0ZUZpbGUoXHJcbiAgICAgICAgdG9jRmlsZVBhdGgsXHJcbiAgICAgICAgSlNPTi5zdHJpbmdpZnkodGFibGVPZk1lbW9yaWVzLCBudWxsLCA0KSxcclxuICAgICAgICBcInV0Zi04XCIsXHJcbiAgICApO1xyXG59XHJcblxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHVwZGF0ZVRvY0NvbGxlY3Rpb25zSW5jcmVtZW50YWxseShcclxuICAgIG5hbWU6IHN0cmluZyxcclxuKTogUHJvbWlzZTx2b2lkPiB7XHJcblxyXG4gICAgY29uc3QgZmlsZU5hbWUgPSBuYW1lLmVuZHNXaXRoKFwiLmpzb25cIilcclxuICAgICAgICA/IG5hbWVcclxuICAgICAgICA6IGAke25hbWV9Lmpzb25gO1xyXG4gICAgXHJcbiAgICBjb25zdCBtZW1vcmllc0RpcmVjdG9yeSA9IGdldFZhbGlkYXRlZE1lbW9yaWVzUm9vdERpcmVjdG9yeSgpO1xyXG5cclxuICAgIGNvbnN0IGNvbXBhY3Rpb25zRGlyZWN0b3J5ID0gcGF0aC5qb2luKFxyXG4gICAgICAgIG1lbW9yaWVzRGlyZWN0b3J5LFxyXG4gICAgICAgIFwiY29tcGFjdGlvbnNcIixcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgY29sbGVjdGlvbnNGaWxlUGF0aCA9IHBhdGguam9pbihcclxuICAgICAgICBjb21wYWN0aW9uc0RpcmVjdG9yeSxcclxuICAgICAgICBcIlRPQ19Db2xsZWN0aW9ucy5qc29uXCIsXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XHJcbiAgICBjb25zdCB0b2RheSA9IFtcclxuICAgICAgICBub3cuZ2V0RnVsbFllYXIoKSxcclxuICAgICAgICBTdHJpbmcobm93LmdldE1vbnRoKCkgKyAxKS5wYWRTdGFydCgyLCBcIjBcIiksXHJcbiAgICAgICAgU3RyaW5nKG5vdy5nZXREYXRlKCkpLnBhZFN0YXJ0KDIsIFwiMFwiKSxcclxuICAgIF0uam9pbihcIi1cIik7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgICBhd2FpdCBmcy5ta2Rpcihjb21wYWN0aW9uc0RpcmVjdG9yeSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XHJcblxyXG4gICAgICAgIGxldCBjb2xsZWN0aW9uczogVGFibGVPZkNvbXBhY3Rpb25zRW50aXR5Q29sbGVjdGlvbltdO1xyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBjb250ZW50cyA9IGF3YWl0IGZzLnJlYWRGaWxlKFxyXG4gICAgICAgICAgICAgICAgY29sbGVjdGlvbnNGaWxlUGF0aCxcclxuICAgICAgICAgICAgICAgIFwidXRmLThcIixcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGNvbGxlY3Rpb25zID0gSlNPTi5wYXJzZShjb250ZW50cyk7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgaWYgKChlcnJvciBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb24pLmNvZGUgIT09IFwiRU5PRU5UXCIpIHtcclxuICAgICAgICAgICAgICAgIHRocm93IGVycm9yO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb2xsZWN0aW9ucyA9IFtdO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IHRvZGF5RW50cnkgPSBjb2xsZWN0aW9ucy5maW5kKFxyXG4gICAgICAgICAgICBlbnRyeSA9PiBlbnRyeS5kYXRlX2NyZWF0ZWRfZ3JvdXAgPT09IHRvZGF5LFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGlmICghdG9kYXlFbnRyeSkge1xyXG4gICAgICAgICAgICB0b2RheUVudHJ5ID0ge1xyXG4gICAgICAgICAgICAgICAgZGF0ZV9jcmVhdGVkX2dyb3VwOiB0b2RheSxcclxuICAgICAgICAgICAgICAgIG1lbWJlcnNfZmlsZU5hbWU6IFtdLFxyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgY29sbGVjdGlvbnMucHVzaCh0b2RheUVudHJ5KTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICghdG9kYXlFbnRyeS5tZW1iZXJzX2ZpbGVOYW1lLmluY2x1ZGVzKGZpbGVOYW1lKSkge1xyXG4gICAgICAgICAgICB0b2RheUVudHJ5Lm1lbWJlcnNfZmlsZU5hbWUucHVzaChmaWxlTmFtZSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBhd2FpdCBmcy53cml0ZUZpbGUoXHJcbiAgICAgICAgICAgIGNvbGxlY3Rpb25zRmlsZVBhdGgsXHJcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGNvbGxlY3Rpb25zLCBudWxsLCAyKSxcclxuICAgICAgICAgICAgXCJ1dGYtOFwiLFxyXG4gICAgICAgICk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXHJcbiAgICAgICAgICAgIGBbVE9DIENPTExFQ1RJT05TXSBGYWlsZWQgdG8gdXBkYXRlIFwiJHtjb2xsZWN0aW9uc0ZpbGVQYXRofVwiOmAsXHJcbiAgICAgICAgICAgIGVycm9yLFxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbn1cclxuXHJcblxyXG5hc3luYyBmdW5jdGlvbiBkZWxldGVFeHBpcmVkQ29tcGFjdGlvbnNBbmRUb2NDbGVhbnVwKFxyXG4gICAgZGF5c1RvVHJpZ2dlckV4cGlyZTogbnVtYmVyLFxyXG4pOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IG1lbW9yaWVzRGlyZWN0b3J5ID0gZ2V0VmFsaWRhdGVkTWVtb3JpZXNSb290RGlyZWN0b3J5KCk7XHJcblxyXG4gICAgY29uc3QgY29tcGFjdGlvbnNEaXJlY3RvcnkgPSBwYXRoLmpvaW4oXHJcbiAgICAgICAgbWVtb3JpZXNEaXJlY3RvcnksXHJcbiAgICAgICAgXCJjb21wYWN0aW9uc1wiLFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBjb2xsZWN0aW9uc0ZpbGVQYXRoID0gcGF0aC5qb2luKFxyXG4gICAgICAgIGNvbXBhY3Rpb25zRGlyZWN0b3J5LFxyXG4gICAgICAgIFwiVE9DX0NvbGxlY3Rpb25zLmpzb25cIixcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgdG9jU2VlZHNEaXJlY3RvcnkgPSBwYXRoLmpvaW4oXHJcbiAgICAgICAgY29tcGFjdGlvbnNEaXJlY3RvcnksXHJcbiAgICAgICAgXCJUT0NfU2VlZHNcIixcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgdG9jRW50aXR5RGlyZWN0b3J5ID0gcGF0aC5qb2luKFxyXG4gICAgICAgIGNvbXBhY3Rpb25zRGlyZWN0b3J5LFxyXG4gICAgICAgIFwiVE9DX0VudGl0eVwiLFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCB0b2NTdW1tYXJpZXNEaXJlY3RvcnkgPSBwYXRoLmpvaW4oXHJcbiAgICAgICAgY29tcGFjdGlvbnNEaXJlY3RvcnksXHJcbiAgICAgICAgXCJUT0NfU3VtbWFyaWVzXCIsXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XHJcbiAgICBjb25zdCB0b2RheSA9IG5ldyBEYXRlKFxyXG4gICAgICAgIG5vdy5nZXRGdWxsWWVhcigpLFxyXG4gICAgICAgIG5vdy5nZXRNb250aCgpLFxyXG4gICAgICAgIG5vdy5nZXREYXRlKCksXHJcbiAgICApO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgY29udGVudHMgPSBhd2FpdCBmcy5yZWFkRmlsZShcclxuICAgICAgICAgICAgY29sbGVjdGlvbnNGaWxlUGF0aCxcclxuICAgICAgICAgICAgXCJ1dGYtOFwiLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGNvbnN0IGNvbGxlY3Rpb25zOiBUYWJsZU9mQ29tcGFjdGlvbnNFbnRpdHlDb2xsZWN0aW9uW10gPVxyXG4gICAgICAgICAgICBKU09OLnBhcnNlKGNvbnRlbnRzKTtcclxuXHJcbiAgICAgICAgY29uc3QgcmVtYWluaW5nQ29sbGVjdGlvbnM6IFRhYmxlT2ZDb21wYWN0aW9uc0VudGl0eUNvbGxlY3Rpb25bXSA9IFtdO1xyXG4gICAgICAgIGNvbnN0IGV4cGlyZWRDb2xsZWN0aW9uczogVGFibGVPZkNvbXBhY3Rpb25zRW50aXR5Q29sbGVjdGlvbltdID0gW107XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgY29sbGVjdGlvbnMpIHtcclxuICAgICAgICAgICAgY29uc3QgW3llYXIsIG1vbnRoLCBkYXldID0gZW50cnkuZGF0ZV9jcmVhdGVkX2dyb3VwXHJcbiAgICAgICAgICAgICAgICAuc3BsaXQoXCItXCIpXHJcbiAgICAgICAgICAgICAgICAubWFwKE51bWJlcik7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBlbnRyeURhdGUgPSBuZXcgRGF0ZSh5ZWFyLCBtb250aCAtIDEsIGRheSk7XHJcblxyXG4gICAgICAgICAgICBpZiAoTnVtYmVyLmlzTmFOKGVudHJ5RGF0ZS5nZXRUaW1lKCkpKSB7XHJcbiAgICAgICAgICAgICAgICByZW1haW5pbmdDb2xsZWN0aW9ucy5wdXNoKGVudHJ5KTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCBhZ2VJbkRheXMgPSBNYXRoLmZsb29yKFxyXG4gICAgICAgICAgICAgICAgKHRvZGF5LmdldFRpbWUoKSAtIGVudHJ5RGF0ZS5nZXRUaW1lKCkpIC9cclxuICAgICAgICAgICAgICAgICAgICAoMjQgKiA2MCAqIDYwICogMTAwMCksXHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBpZiAoYWdlSW5EYXlzID4gZGF5c1RvVHJpZ2dlckV4cGlyZSkge1xyXG4gICAgICAgICAgICAgICAgZXhwaXJlZENvbGxlY3Rpb25zLnB1c2goZW50cnkpO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgcmVtYWluaW5nQ29sbGVjdGlvbnMucHVzaChlbnRyeSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgZXhwaXJlZENvbGxlY3Rpb25zKSB7XHJcbiAgICAgICAgICAgIC8vIERlbGV0ZSBlYWNoIG1lbWJlciBmcm9tIHRoZSBjb3JyZXNwb25kaW5nIFRPQyBjb2xsZWN0aW9uIGdyb3VwXHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgZmlsZU5hbWUgb2YgZW50cnkubWVtYmVyc19maWxlTmFtZSkge1xyXG4gICAgICAgICAgICAgICAgLy8gRGVsZXRlIHRoZSBjb3JyZXNwb25kaW5nIHNlZWQsIGlmIGl0IGV4aXN0c1xyXG4gICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBmcy51bmxpbmsoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHBhdGguam9pbih0b2NTZWVkc0RpcmVjdG9yeSwgZmlsZU5hbWUpLFxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGBbQ09NUEFDVElPTiBDTEVBTlVQXSBGYWlsZWQgdG8gZGVsZXRlIFwiJHtmaWxlTmFtZX1cIjpgLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcixcclxuICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIERlbGV0ZSB0aGUgY29ycmVzcG9uZGluZyBjYWNoZWQgc3VtbWFyeSwgaWYgaXQgZXhpc3RzXHJcbiAgICAgICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IGZzLnVubGluayhcclxuICAgICAgICAgICAgICAgICAgICAgICAgcGF0aC5qb2luKHRvY1N1bW1hcmllc0RpcmVjdG9yeSwgZmlsZU5hbWUpLFxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmICgoZXJyb3IgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uKS5jb2RlICE9PSBcIkVOT0VOVFwiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBgW0NPTVBBQ1RJT04gQ0xFQU5VUF0gRmFpbGVkIHRvIGRlbGV0ZSBzdW1tYXJ5IFwiJHtmaWxlTmFtZX1cIjpgLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3IsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBEZWxldGUgdGhlIGNvcnJlc3BvbmRpbmcgVE9DX0VudGl0eSBmaWxlXHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBmcy51bmxpbmsoXHJcbiAgICAgICAgICAgICAgICAgICAgcGF0aC5qb2luKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0b2NFbnRpdHlEaXJlY3RvcnksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGBUT0NfJHtlbnRyeS5kYXRlX2NyZWF0ZWRfZ3JvdXB9Lmpzb25gLFxyXG4gICAgICAgICAgICAgICAgICAgICksXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcclxuICAgICAgICAgICAgICAgICAgICBgW0NPTVBBQ1RJT04gQ0xFQU5VUF0gRmFpbGVkIHRvIGRlbGV0ZSBlbnRpdHkgVE9DIGZvciBcIiR7ZW50cnkuZGF0ZV9jcmVhdGVkX2dyb3VwfVwiOmAsXHJcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IsXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoZXhwaXJlZENvbGxlY3Rpb25zLmxlbmd0aCA+IDApIHtcclxuICAgICAgICAgICAgYXdhaXQgZnMud3JpdGVGaWxlKFxyXG4gICAgICAgICAgICAgICAgY29sbGVjdGlvbnNGaWxlUGF0aCxcclxuICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHJlbWFpbmluZ0NvbGxlY3Rpb25zLCBudWxsLCAyKSxcclxuICAgICAgICAgICAgICAgIFwidXRmLThcIixcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXHJcbiAgICAgICAgICAgIFwiW0NPTVBBQ1RJT04gQ0xFQU5VUF0gRmFpbGVkIHRvIGNsZWFuIHVwIGV4cGlyZWQgY29tcGFjdGlvbnM6XCIsXHJcbiAgICAgICAgICAgIGVycm9yLFxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzY2FuRm9yQW5kUmV0dXJuTWF0Y2hpbmdGaWxlcyhcclxuICAgIGZpbGVOYW1lPzogc3RyaW5nLFxyXG4pOiBQcm9taXNlPERpcmVudFtdPiB7XHJcbiAgICBjb25zdCBtZW1vcmllc0RpcmVjdG9yeSA9IGdldFZhbGlkYXRlZE1lbW9yaWVzUm9vdERpcmVjdG9yeSgpO1xyXG5cclxuICAgIGNvbnN0IGNvbXBhY3Rpb25zU2VlZHNEaXJlY3RvcnkgPSBqb2luKFxyXG4gICAgICAgIG1lbW9yaWVzRGlyZWN0b3J5LFxyXG4gICAgICAgIFwiY29tcGFjdGlvbnNcIixcclxuICAgICAgICBcIlRPQ19TZWVkc1wiLFxyXG4gICAgKTtcclxuXHJcbiAgICBsZXQgZW50cmllczogRGlyZW50W107XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgICBlbnRyaWVzID0gYXdhaXQgcmVhZGRpcihjb21wYWN0aW9uc1NlZWRzRGlyZWN0b3J5LCB7XHJcbiAgICAgICAgICAgIHdpdGhGaWxlVHlwZXM6IHRydWUsXHJcbiAgICAgICAgfSk7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGNvbnN0IGZzRXJyb3IgPSBlcnJvciBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb247XHJcblxyXG4gICAgICAgIGlmIChmc0Vycm9yLmNvZGUgPT09IFwiRU5PRU5UXCIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFtdO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gTm8gZmlsZW5hbWUgcHJvdmlkZWQ6IHJldHVybiBhbGwgYXZhaWxhYmxlIHNlZWQgZmlsZXMuXHJcbiAgICBpZiAoZmlsZU5hbWUgPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgIHJldHVybiBlbnRyaWVzXHJcbiAgICAgICAgICAgIC5maWx0ZXIoZW50cnkgPT4gZW50cnkuaXNGaWxlKCkgJiYgZW50cnkubmFtZS5lbmRzV2l0aChcIi5qc29uXCIpKVxyXG4gICAgICAgICAgICAuc29ydCgoYSwgYikgPT5cclxuICAgICAgICAgICAgICAgIGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSwgdW5kZWZpbmVkLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2Vuc2l0aXZpdHk6IFwiYmFzZVwiLFxyXG4gICAgICAgICAgICAgICAgfSksXHJcbiAgICAgICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gT3JpZ2luYWwgYmVoYXZpb3I6IGZpbmQgY29tcGFjdGlvbiBwYXJ0cyBmb3IgdGhlIHNwZWNpZmllZCBiYXNlIGZpbGVuYW1lLlxyXG4gICAgY29uc3QgZXNjYXBlUmVnRXhwID0gKHZhbHVlOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuICAgICAgICB2YWx1ZS5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgXCJcXFxcJCZcIik7XHJcblxyXG4gICAgY29uc3QgY29tcGFjdGlvblBhdHRlcm4gPSBuZXcgUmVnRXhwKFxyXG4gICAgICAgIGBeJHtlc2NhcGVSZWdFeHAoZmlsZU5hbWUpfV9jKFxcXFxkKylfcChcXFxcZCspXFxcXC5qc29uJGAsXHJcbiAgICApO1xyXG5cclxuICAgIHJldHVybiBlbnRyaWVzXHJcbiAgICAgICAgLmZpbHRlcihcclxuICAgICAgICAgICAgZW50cnkgPT5cclxuICAgICAgICAgICAgICAgIGVudHJ5LmlzRmlsZSgpICYmXHJcbiAgICAgICAgICAgICAgICBjb21wYWN0aW9uUGF0dGVybi50ZXN0KGVudHJ5Lm5hbWUpLFxyXG4gICAgICAgIClcclxuICAgICAgICAuc29ydCgoYSwgYikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBtYXRjaEEgPSBhLm5hbWUubWF0Y2goY29tcGFjdGlvblBhdHRlcm4pITtcclxuICAgICAgICAgICAgY29uc3QgbWF0Y2hCID0gYi5uYW1lLm1hdGNoKGNvbXBhY3Rpb25QYXR0ZXJuKSE7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBjb21wYWN0aW9uQSA9IE51bWJlcihtYXRjaEFbMV0pO1xyXG4gICAgICAgICAgICBjb25zdCBjb21wYWN0aW9uQiA9IE51bWJlcihtYXRjaEJbMV0pO1xyXG5cclxuICAgICAgICAgICAgaWYgKGNvbXBhY3Rpb25BICE9PSBjb21wYWN0aW9uQikge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbXBhY3Rpb25BIC0gY29tcGFjdGlvbkI7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHJldHVybiBOdW1iZXIobWF0Y2hBWzJdKSAtIE51bWJlcihtYXRjaEJbMl0pO1xyXG4gICAgICAgIH0pO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY29tcGFjdGlvblNlZWRFeGlzdHMoXHJcbiAgICBuYW1lOiBzdHJpbmcsXHJcbik6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG5cclxuICAgIGNvbnN0IG1lbW9yaWVzRGlyZWN0b3J5ID0gZ2V0VmFsaWRhdGVkTWVtb3JpZXNSb290RGlyZWN0b3J5KCk7XHJcblxyXG4gICAgaWYgKCEvXi4rX2NcXGQrX3BcXGQrXFwuanNvbiQvaS50ZXN0KG5hbWUpKSB7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGNvbXBhY3Rpb25zU2VlZHNEaXJlY3RvcnkgPSBqb2luKFxyXG4gICAgICAgIG1lbW9yaWVzRGlyZWN0b3J5LFxyXG4gICAgICAgIFwiY29tcGFjdGlvbnNcIixcclxuICAgICAgICBcIlRPQ19TZWVkc1wiLFxyXG4gICAgKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IHN0YXRzID0gYXdhaXQgZnMuc3RhdChcclxuICAgICAgICAgICAgam9pbihjb21wYWN0aW9uc1NlZWRzRGlyZWN0b3J5LCBuYW1lKSxcclxuICAgICAgICApO1xyXG4gICAgICAgIHJldHVybiBzdGF0cy5pc0ZpbGUoKTtcclxuICAgIH0gY2F0Y2gge1xyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGVuQ29tcGFjdGlvblNlZWRFeGlzdHMoXHJcbiAgICBuYW1lOiBzdHJpbmcsXHJcbik6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG5cclxuICAgIGNvbnN0IG1lbW9yaWVzRGlyZWN0b3J5ID0gZ2V0VmFsaWRhdGVkTWVtb3JpZXNSb290RGlyZWN0b3J5KCk7XHJcblxyXG4gICAgaWYgKCEvXi4rX2NcXGQrX3BcXGQrXFwuanNvbiQvaS50ZXN0KG5hbWUpKSB7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgfVxyXG5cclxuICAgIGNvbnN0IGVuX2NvbXBhY3Rpb25zU2VlZHNEaXJlY3RvcnkgPSBqb2luKFxyXG4gICAgICAgIG1lbW9yaWVzRGlyZWN0b3J5LFxyXG4gICAgICAgIFwiZW5fY29tcHNcIixcclxuICAgICk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgICBjb25zdCBzdGF0cyA9IGF3YWl0IGZzLnN0YXQoXHJcbiAgICAgICAgICAgIGpvaW4oZW5fY29tcGFjdGlvbnNTZWVkc0RpcmVjdG9yeSwgbmFtZSksXHJcbiAgICAgICAgKTtcclxuICAgICAgICByZXR1cm4gc3RhdHMuaXNGaWxlKCk7XHJcbiAgICB9IGNhdGNoIHtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjb21wYWN0aW9uVG9NZW1vcnlTZWVkVHJhbnNmZXIoXHJcbiAgICBmaWxlTmFtZTogc3RyaW5nLFxyXG4pOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIGNvbnN0IG1lbW9yaWVzRGlyZWN0b3J5ID0gZ2V0VmFsaWRhdGVkTWVtb3JpZXNSb290RGlyZWN0b3J5KCk7XHJcblxyXG4gICAgY29uc3QgY29tcGFjdGlvbnNEaXJlY3RvcnkgPSBwYXRoLmpvaW4oXHJcbiAgICAgICAgbWVtb3JpZXNEaXJlY3RvcnksXHJcbiAgICAgICAgXCJjb21wYWN0aW9uc1wiLFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBjb2xsZWN0aW9uc0ZpbGVQYXRoID0gcGF0aC5qb2luKFxyXG4gICAgICAgIGNvbXBhY3Rpb25zRGlyZWN0b3J5LFxyXG4gICAgICAgIFwiVE9DX0NvbGxlY3Rpb25zLmpzb25cIixcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgdG9jU2VlZHNEaXJlY3RvcnkgPSBwYXRoLmpvaW4oXHJcbiAgICAgICAgY29tcGFjdGlvbnNEaXJlY3RvcnksXHJcbiAgICAgICAgXCJUT0NfU2VlZHNcIixcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgdG9jRW50aXR5RGlyZWN0b3J5ID0gcGF0aC5qb2luKFxyXG4gICAgICAgIGNvbXBhY3Rpb25zRGlyZWN0b3J5LFxyXG4gICAgICAgIFwiVE9DX0VudGl0eVwiLFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBlbkNvbXBhY3Rpb25zRGlyZWN0b3J5ID0gcGF0aC5qb2luKFxyXG4gICAgICAgIG1lbW9yaWVzRGlyZWN0b3J5LFxyXG4gICAgICAgIFwiZW5fY29tcHNcIixcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgdG9tRmlsZVBhdGggPSBwYXRoLmpvaW4oXHJcbiAgICAgICAgbWVtb3JpZXNEaXJlY3RvcnksXHJcbiAgICAgICAgYFRPTV8ke1RPTV9SQU5HRVMuZmlyc3Quc3RhcnR9LSR7VE9NX1JBTkdFUy5maXJzdC5lbmR9Lmpzb25gLFxyXG4gICAgKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAgIC8vIEZpbmQgdGhlIGRhdGUgZ3JvdXAgY29udGFpbmluZyB0aGlzIGNvbXBhY3Rpb24gZmlsZW5hbWUuXHJcbiAgICAgICAgY29uc3QgY29sbGVjdGlvbnM6IFRhYmxlT2ZDb21wYWN0aW9uc0VudGl0eUNvbGxlY3Rpb25bXSA9XHJcbiAgICAgICAgICAgIEpTT04ucGFyc2UoXHJcbiAgICAgICAgICAgICAgICBhd2FpdCBmcy5yZWFkRmlsZShjb2xsZWN0aW9uc0ZpbGVQYXRoLCBcInV0Zi04XCIpLFxyXG4gICAgICAgICAgICApO1xyXG5cclxuICAgICAgICBjb25zdCBjb2xsZWN0aW9uID0gY29sbGVjdGlvbnMuZmluZChlbnRyeSA9PlxyXG4gICAgICAgICAgICBlbnRyeS5tZW1iZXJzX2ZpbGVOYW1lLmluY2x1ZGVzKGZpbGVOYW1lKSxcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBpZiAoIWNvbGxlY3Rpb24pIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcclxuICAgICAgICAgICAgICAgIGBbQ09NUEFDVElPTiBUUkFOU0ZFUl0gXCIke2ZpbGVOYW1lfVwiIHdhcyBub3QgZm91bmQgaW4gVE9DX0NvbGxlY3Rpb25zLmAsXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFJlYWQgdGhlIGVudGl0eSBUT0MgZm9yIHRoYXQgZGF0ZSBncm91cC5cclxuICAgICAgICBjb25zdCB0b2NFbnRpdHlGaWxlUGF0aCA9IHBhdGguam9pbihcclxuICAgICAgICAgICAgdG9jRW50aXR5RGlyZWN0b3J5LFxyXG4gICAgICAgICAgICBgVE9DXyR7Y29sbGVjdGlvbi5kYXRlX2NyZWF0ZWRfZ3JvdXB9Lmpzb25gLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGNvbnN0IGVudGl0aWVzOiBUYWJsZU9mQ29tcGFjdGlvbnNFbnRpdHlbXSA9IEpTT04ucGFyc2UoXHJcbiAgICAgICAgICAgIGF3YWl0IGZzLnJlYWRGaWxlKHRvY0VudGl0eUZpbGVQYXRoLCBcInV0Zi04XCIpLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGNvbnN0IGVudGl0eSA9IGVudGl0aWVzLmZpbmQoXHJcbiAgICAgICAgICAgIGVudHJ5ID0+IGVudHJ5LmZpbGVOYW1lID09PSBmaWxlTmFtZSxcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBpZiAoIWVudGl0eSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFxyXG4gICAgICAgICAgICAgICAgYFtDT01QQUNUSU9OIFRSQU5TRkVSXSBcIiR7ZmlsZU5hbWV9XCIgd2FzIG5vdCBmb3VuZCBpbiBcIiR7dG9jRW50aXR5RmlsZVBhdGh9XCIuYCxcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ29udmVydCBpdCB0byBhIG1lbW9yeSBlbnRpdHksIG9taXR0aW5nIHRoZSBjb21wYWN0aW9uLW9ubHkgZmllbGQuXHJcbiAgICAgICAgY29uc3Qge1xyXG4gICAgICAgICAgICBwcmVjZWRpbmdfY29tcGFjYXRpb25fZmlsZU5hbWU6IF9wcmVjZWRpbmdDb21wYWN0aW9uLFxyXG4gICAgICAgICAgICAuLi5tZW1vcnlFbnRpdHlcclxuICAgICAgICB9ID0gZW50aXR5O1xyXG5cclxuICAgICAgICAvLyBSZWFkIFRPTSBhbmQgcHJldmVudCBkdXBsaWNhdGUgdHJhbnNmZXJzLlxyXG4gICAgICAgIGNvbnN0IHRvbUNvbnRlbnRzOiBUYWJsZU9mTWVtb3JpZXNFbnRpdHlbXSA9IEpTT04ucGFyc2UoXHJcbiAgICAgICAgICAgIGF3YWl0IGZzLnJlYWRGaWxlKHRvbUZpbGVQYXRoLCBcInV0Zi04XCIpLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGlmICh0b21Db250ZW50cy5zb21lKGVudHJ5ID0+IGVudHJ5LmZpbGVOYW1lID09PSBmaWxlTmFtZSkpIHtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXHJcbiAgICAgICAgICAgICAgICBgW0NPTVBBQ1RJT04gVFJBTlNGRVJdIFwiJHtmaWxlTmFtZX1cIiBhbHJlYWR5IGV4aXN0cyBpbiBUT00uIFNraXBwaW5nIHRyYW5zZmVyLmAsXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEFwcGVuZCB0aGUgZW50aXR5IHRvIFRPTS5cclxuICAgICAgICB0b21Db250ZW50cy5wdXNoKG1lbW9yeUVudGl0eSk7XHJcblxyXG4gICAgICAgIGF3YWl0IGZzLndyaXRlRmlsZShcclxuICAgICAgICAgICAgdG9tRmlsZVBhdGgsXHJcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHRvbUNvbnRlbnRzLCBudWxsLCAyKSxcclxuICAgICAgICAgICAgXCJ1dGYtOFwiLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIC8vIENvcHkgdGhlIHNlZWQgSlNPTiB0byBlbl9jb21wcywgcHJlc2VydmluZyB0aGUgb3JpZ2luYWwuXHJcbiAgICAgICAgYXdhaXQgZnMubWtkaXIoZW5Db21wYWN0aW9uc0RpcmVjdG9yeSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XHJcblxyXG4gICAgICAgIGF3YWl0IGZzLmNvcHlGaWxlKFxyXG4gICAgICAgICAgICBwYXRoLmpvaW4odG9jU2VlZHNEaXJlY3RvcnksIGZpbGVOYW1lKSxcclxuICAgICAgICAgICAgcGF0aC5qb2luKGVuQ29tcGFjdGlvbnNEaXJlY3RvcnksIGZpbGVOYW1lKSxcclxuICAgICAgICApO1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFxyXG4gICAgICAgICAgICBgW0NPTVBBQ1RJT04gVFJBTlNGRVJdIEZhaWxlZCB0byB0cmFuc2ZlciBcIiR7ZmlsZU5hbWV9XCI6YCxcclxuICAgICAgICAgICAgZXJyb3IsXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gbW9kZWxDYWxsRm9yT25EZW1hbmRTdW1tYXJ5KFxyXG4gICAgY29udmVyc2F0aW9uVGV4dDogc3RyaW5nLFxyXG4pOiBQcm9taXNlPHN0cmluZz4ge1xyXG4gICAgY29uc3QgY2xpZW50ID0gZ2V0Q29udHJvbGxlcigpLmNsaWVudDtcclxuICAgIGNvbnN0IG1vZGVsID0gYXdhaXQgY2xpZW50LmxsbS5tb2RlbCgpO1xyXG4gICAgXHJcbiAgICBjb25zdCBwcm9tcHQgPSBgXHJcbiAgICAgICAgUHJvdmlkZWQgdG8geW91IGlzIGEgY2hhdCB0cmFuc2NyaXB0IGJldHdlZW4gYSB1c2VyIGFuZCBhc3Npc3RhbnQgd2l0aCBhIHByZWZpeCBsYWJlbGluZyBlYWNoIHR1cm4gd2hpY2ggaXQgYmVsb25ncyB0b28uXHJcblxyXG4gICAgICAgIFRoZXNlIG1lc3NhZ2VzIGFyZSBvcmRlcmVkIGNocm9ub2xvZ2ljYWxseSwgdGhlIHVzZXIgbmVlZHMgeW91IHRoZSBhc3Npc3RhbnQgdG8gY29tYiB0aHJvdWdoIHRoZSBjaGF0IHRyYW5zY3JpcHQgYW5kIGV4dHJlbWVseSBjb25kZW5zZSB0aGUgY29udGVudHMgZG93biBkbyBpdCdzIG1vc3QgcmVsZXZhbnQgcGFydHMuIFxyXG5cclxuICAgICAgICBUaGUgY29uZGVuc2VkIHZlcnNpb24geW91IGNyZWF0ZSBtdXN0IG5vdCBsb3NlIHRoZSBtZXNzYWdlcyBvcmlnaW5hbCBtZWFuaW5nIGFuZCBpbnRlbnQuXHJcblxyXG4gICAgICAgIFRoZSB1c2VyIHdpbGwgYmUgdXNpbmcgeW91ciBvdXRwdXQgdG8gZGV0ZXJtaW5lIGlmIHRoaXMgY2hhdCB0cmFuc2NyaXB0IGlzIHJlbGV2YW50IHRvIHRoZW0sIHNvIG1ha2Ugbm90ZXMgb2Yga2V5IGVsZW1lbnRzIHRoYXQgd2lsbCByZW1pbmQgdGhlbSBvZiBleGFjdGx5IHdoYXQgdGhpcyB1c2VyIGFzc2lzdGFudCBleGNoYW5nZSB3YXMgYWJvdXQuXHJcblxyXG4gICAgICAgIEVsZW1lbnRzIHdoaWNoIHlvdSBmaW5kIHRoYXQgYXJlIG9mIGxpdHRsZSBpbXBvcnRhbnQgb3IgbWF5IHNpbXBseSBiZSB0byBnZW5lcmFsaXplZCBhbmQgdW5zcGVjaWZpYyBzaG91bGQgbm90IGJlIGEgdGFyZ2V0IG9mIGZvY3VzIHRvIGhlbHAgaWRlbnRpZnkgdGhpcyBjaGF0IGV4Y2hhbmdlLlxyXG5cclxuICAgICAgICBJZiB0aGlzIGlzIGNvZGUgbWFrZSBzdXJlIHRvIGhpZ2hsaWdodCB0aGUgZmluYWxpemVkIGNvZGUgdGhhdCB5b3UgY2FuIGRlcml2ZSBmcm9tIHRoZSBjaGF0IHRyYW5zY3JpcHQuXHJcblxyXG4gICAgICAgIElmIHRoaXMgaXMgYSBub3ZlbCBvciB3cml0aW5nIHJlbGF0ZWQgbWFrZSBzdXJlIHRvIGhpZ2hsaWdodCB0aGUgZmluYWxpemVkIHdyaXR0ZW4gd29yay5cclxuXHJcbiAgICAgICAgSWYgdGhpcyBpcyBhIGdlbmVyYWwgaW5xdWlyeSBtYWtlIHN1cmUgdG8gaGlnaGxpZ2h0IGFsbCByZWxldmFudCBpbnF1aXJpZXMgYWxvbmcgd2l0aCB0aGVpciBhc3Npc3RhbnQgcHJvdmlkZWQgYW5zd2Vycy5cclxuXHJcbiAgICAgICAgSWYgdGhpcyBpcyByb2xlLXBsYXkgbWFrZSBzdXJlIHRvIGhpZ2hsaWdodCB0aGUgc2V0dGluZywgcHJvZ3Jlc3Npb25zLCBhbmQgY3VycmVudCBzdGF0ZSBvZiB0aGUgYWN0LlxyXG5cclxuICAgICAgICBGb3IgYW55IHN1YmplY3Qgbm90IG1lbnRpb25lZCBhYm92ZSwgdXNlIHlvdXIgb3duIGJlc3QgZGlzY3JldGlvbi5cclxuXHJcbiAgICAgICAgW0JFR0lOTklORyBPRiBDSEFUIFRSQU5TQ1JJUFRdOiBcclxuICAgICAgICAke2NvbnZlcnNhdGlvblRleHR9XHJcbiAgICAgICAgW0VORCBPRiBDSEFUIFRSQU5TQ1JJUFRdXHJcbiAgICAgICAgYC50cmltKCk7XHJcblxyXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgbW9kZWwucmVzcG9uZChcclxuICAgICAgICBwcm9tcHQsXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0ZW1wZXJhdHVyZTogMCxcclxuICAgICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBjbGVhbmVkVGV4dCA9IHJlc3VsdC5jb250ZW50XHJcbiAgICAgICAgLnJlcGxhY2UoXHJcbiAgICAgICAgICAgIC9eW1xcc1xcU10qP19fTE1fU1RVRElPX0lOVEVSTkFMX0xTRVBfU1lOVEhFVElDX1JFQVNPTklOR19FTkRfW0EtWmEtejAtOV0rX18vaSxcclxuICAgICAgICAgICAgXCJcIixcclxuICAgICAgICApXHJcbiAgICAgICAgLnJlcGxhY2UoL15bXFxzXFxTXSo/YGBgKD86anNvbik/XFxzKi9pLCBcIlwiKVxyXG4gICAgICAgIC5yZXBsYWNlKC9cXHMqYGBgW1xcc1xcU10qJC9pLCBcIlwiKVxyXG4gICAgICAgIC50cmltKCk7XHJcblxyXG4gICAgcmV0dXJuIGNsZWFuZWRUZXh0O1xyXG59XHJcblxyXG5mdW5jdGlvbiBleHRyYWN0Q29tcGFjdGlvbkZpbGVOYW1lKFxyXG4gICAgdXNlclRleHQ6IHN0cmluZyxcclxuICAgIGF2YWlsYWJsZUZpbGVzOiBzdHJpbmdbXSxcclxuKTogc3RyaW5nIHwgbnVsbCB7XHJcbiAgICBjb25zdCBub3JtYWxpemVkVGV4dCA9IHVzZXJUZXh0LnRyaW1FbmQoKS50b0xvd2VyQ2FzZSgpO1xyXG5cclxuICAgIGNvbnN0IG1hdGNoaW5nRmlsZSA9IFsuLi5hdmFpbGFibGVGaWxlc11cclxuICAgICAgICAuc29ydCgoYSwgYikgPT4gYi5sZW5ndGggLSBhLmxlbmd0aClcclxuICAgICAgICAuZmluZChmaWxlTmFtZSA9PiBub3JtYWxpemVkVGV4dC5lbmRzV2l0aChmaWxlTmFtZS50b0xvd2VyQ2FzZSgpKSk7XHJcblxyXG4gICAgcmV0dXJuIG1hdGNoaW5nRmlsZSA/PyBudWxsO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvbXB0UHJvY2Vzc29yQ29uc3RydWN0Q29tcGFjdGlvblRvSW5qZWN0KFxyXG4gICAgZmlsZVBhdGg6IHN0cmluZyxcclxuKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuICAgIGNvbnN0IGNvbnRlbnRzID0gYXdhaXQgcmVhZEZpbGUoZmlsZVBhdGgsIFwidXRmLThcIik7XHJcblxyXG4gICAgY29uc3Qgc2VlZHMgPSBKU09OLnBhcnNlKGNvbnRlbnRzKSBhcyBBcnJheTx7XHJcbiAgICAgICAgZGlyZWN0X2lucHV0OiBzdHJpbmc7XHJcbiAgICAgICAgb3V0cHV0OiBzdHJpbmc7XHJcbiAgICB9PjtcclxuXHJcbiAgICBsZXQgY29udGV4dCA9IFwiXCI7XHJcblxyXG4gICAgZm9yIChjb25zdCBzZWVkIG9mIHNlZWRzKSB7XHJcbiAgICAgICAgY29udGV4dCArPSBgVVNFUjogJHtzZWVkLmRpcmVjdF9pbnB1dH1cXG5cXG5gO1xyXG4gICAgICAgIGNvbnRleHQgKz0gYEFTU0lTVEFOVDogJHtzZWVkLm91dHB1dH1cXG5cXG5gO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBjb250ZXh0O1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0Q29tcGFjdGlvblBhY2thZ2UoXHJcbiAgICBwYWNrYWdlVGV4dDogc3RyaW5nXHJcbik6IHN0cmluZyB7XHJcbiAgICBjb25zdCBmb3JtYXR0ZWRNZW1vcmllczogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgICBmb3JtYXR0ZWRNZW1vcmllcy5wdXNoKFxyXG4gICAgICAgIFtcclxuICAgICAgICAgICAgJ1x1RDgzRFx1RENFNiAqKmBDb21wYWN0aW9uIFN1bW1hcnkgUGFja2FnZWAqKicsXHJcbiAgICAgICAgICAgIHBhY2thZ2VUZXh0LFxyXG4gICAgICAgIF0uam9pbihcIlxcblwiKSxcclxuICAgICk7XHJcblxyXG4gICAgcmV0dXJuIGZvcm1hdHRlZE1lbW9yaWVzLmpvaW4oXCJcXG5cXG5cIik7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBsaXN0Q29tcGFjdGlvblNlZWRzKFxyXG4gICAgdGFibGVGb3JtYXQ6IGJvb2xlYW4sXHJcbik6IFByb21pc2U8c3RyaW5nPiB7XHJcbiAgICBjb25zdCBtZW1vcmllc0RpcmVjdG9yeSA9IGdldFZhbGlkYXRlZE1lbW9yaWVzUm9vdERpcmVjdG9yeSgpO1xyXG5cclxuICAgIGNvbnN0IHRvY1NlZWRzRGlyZWN0b3J5ID0gcGF0aC5qb2luKFxyXG4gICAgICAgIG1lbW9yaWVzRGlyZWN0b3J5LFxyXG4gICAgICAgIFwiY29tcGFjdGlvbnNcIixcclxuICAgICAgICBcIlRPQ19TZWVkc1wiLFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBhdmFpbGFibGVGaWxlcyA9IChhd2FpdCBmcy5yZWFkZGlyKHRvY1NlZWRzRGlyZWN0b3J5LCB7XHJcbiAgICAgICAgd2l0aEZpbGVUeXBlczogdHJ1ZSxcclxuICAgIH0pKVxyXG4gICAgICAgIC5maWx0ZXIoZW50cnkgPT4gZW50cnkuaXNGaWxlKCkpXHJcbiAgICAgICAgLm1hcChlbnRyeSA9PiBlbnRyeS5uYW1lKVxyXG4gICAgICAgIC5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYiwgdW5kZWZpbmVkLCB7IHNlbnNpdGl2aXR5OiBcImJhc2VcIiB9KSk7XHJcblxyXG4gICAgaWYgKGF2YWlsYWJsZUZpbGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgIHJldHVybiBcIk5vIGNvbXBhY3Rpb24gc2VlZHMgYXJlIGF2YWlsYWJsZS5cIjtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBncm91cGVkRmlsZXMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nW10+KCk7XHJcblxyXG4gICAgZm9yIChjb25zdCBmaWxlTmFtZSBvZiBhdmFpbGFibGVGaWxlcykge1xyXG4gICAgICAgIGNvbnN0IGJhc2VGaWxlTmFtZSA9IGZpbGVOYW1lLnJlcGxhY2UoXHJcbiAgICAgICAgICAgIC9fY1xcZCtfcFxcZCsoPzogLSBDb3B5KT9cXC5qc29uJC9pLFxyXG4gICAgICAgICAgICBcIlwiLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nRmlsZXMgPSBncm91cGVkRmlsZXMuZ2V0KGJhc2VGaWxlTmFtZSkgPz8gW107XHJcbiAgICAgICAgZXhpc3RpbmdGaWxlcy5wdXNoKGZpbGVOYW1lKTtcclxuICAgICAgICBncm91cGVkRmlsZXMuc2V0KGJhc2VGaWxlTmFtZSwgZXhpc3RpbmdGaWxlcyk7XHJcbiAgICB9XHJcbiAgICBcclxuICAgIGxldCBpbmRleCA9IDE7XHJcblxyXG4gICAgaWYgKCF0YWJsZUZvcm1hdCkge1xyXG4gICAgICAgIHJldHVybiBhdmFpbGFibGVGaWxlc1xyXG4gICAgICAgICAgICAubWFwKChmaWxlTmFtZSwgaW5kZXgpID0+IGAke2luZGV4ICsgMX0uICR7ZmlsZU5hbWV9YClcclxuICAgICAgICAgICAgLmpvaW4oXCJcXG5cIik7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgcm93cyA9IFsuLi5ncm91cGVkRmlsZXMuZW50cmllcygpXS5tYXAoXHJcbiAgICAgICAgKFtiYXNlRmlsZU5hbWUsIGZpbGVOYW1lc10pID0+IHtcclxuICAgICAgICAgICAgY29uc3QgbnVtYmVyZWRGaWxlcyA9IGZpbGVOYW1lc1xyXG4gICAgICAgICAgICAgICAgLm1hcChmaWxlTmFtZSA9PiBgJHtpbmRleCsrfS4gJHtmaWxlTmFtZX1gKVxyXG4gICAgICAgICAgICAgICAgLmpvaW4oXCI8YnI+XCIpO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIGB8ICR7YmFzZUZpbGVOYW1lfSB8ICR7bnVtYmVyZWRGaWxlc30gfGA7XHJcbiAgICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgcmV0dXJuIFtcclxuICAgICAgICAnXHVEODNEXHVEQ0U2ICoqYENvbXBhY3Rpb24gTGlzdCBQYWNrYWdlYCoqJyxcclxuICAgICAgICBcInwgQmFzZSBOYW1lIHwgQ29tcGFjdGlvbiBTZWVkIEZpbGVzIHxcIixcclxuICAgICAgICBcInwtLS18LS0tfFwiLFxyXG4gICAgICAgIC4uLnJvd3MsXHJcbiAgICBdLmpvaW4oXCJcXG5cIik7XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjcmVhdGVDb21wYWN0aW9uU3VtbWFyeShcclxuICAgIHJlcXVlc3RlZEZpbGVOYW1lOiBzdHJpbmcsXHJcbik6UHJvbWlzZTxzdHJpbmc+IHtcclxuICAgIGNvbnN0IG1lbW9yaWVzRGlyZWN0b3J5ID0gZ2V0VmFsaWRhdGVkTWVtb3JpZXNSb290RGlyZWN0b3J5KCk7XHJcblxyXG4gICAgY29uc3QgY29tcGFjdGlvbnNEaXJlY3RvcnkgPSBwYXRoLmpvaW4oXHJcbiAgICAgICAgbWVtb3JpZXNEaXJlY3RvcnksXHJcbiAgICAgICAgXCJjb21wYWN0aW9uc1wiLFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCB0b2NTZWVkc0RpcmVjdG9yeSA9IHBhdGguam9pbihcclxuICAgICAgICBjb21wYWN0aW9uc0RpcmVjdG9yeSxcclxuICAgICAgICBcIlRPQ19TZWVkc1wiLFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCB0b2NTdW1tYXJpZXNEaXJlY3RvcnkgPSBwYXRoLmpvaW4oXHJcbiAgICAgICAgY29tcGFjdGlvbnNEaXJlY3RvcnksXHJcbiAgICAgICAgXCJUT0NfU3VtbWFyaWVzXCIsXHJcbiAgICApO1xyXG4gICAgXHJcbiAgICBjb25zdCBhdmFpbGFibGVGaWxlcyA9IChhd2FpdCBmcy5yZWFkZGlyKHRvY1NlZWRzRGlyZWN0b3J5LCB7XHJcbiAgICAgICAgd2l0aEZpbGVUeXBlczogdHJ1ZSxcclxuICAgIH0pKVxyXG4gICAgICAgIC5maWx0ZXIoZW50cnkgPT4gZW50cnkuaXNGaWxlKCkpXHJcbiAgICAgICAgLm1hcChlbnRyeSA9PiBlbnRyeS5uYW1lKVxyXG4gICAgICAgIC5maWx0ZXIobmFtZSA9PiAvXi4rX2NcXGQrX3BcXGQrXFwuanNvbiQvaS50ZXN0KG5hbWUpKTtcclxuXHJcbiAgICBjb25zdCBleGFjdE1hdGNoID0gYXZhaWxhYmxlRmlsZXMuZmluZChcclxuICAgICAgICBuYW1lID0+IG5hbWUudG9Mb3dlckNhc2UoKSA9PT0gcmVxdWVzdGVkRmlsZU5hbWUudG9Mb3dlckNhc2UoKSxcclxuICAgICkgPz8gbnVsbDtcclxuXHJcbiAgICBpZiAoZXhhY3RNYXRjaCA9PT0gbnVsbCkgcmV0dXJuIFwiXCI7XHJcblxyXG4gICAgY29uc3QgY29tcGFjdGlvblNlZWRGaWxlID0gcGF0aC5qb2luKFxyXG4gICAgICAgIHRvY1NlZWRzRGlyZWN0b3J5LFxyXG4gICAgICAgIGV4YWN0TWF0Y2gsXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IGNvbXBhY3Rpb25TdW1tYXJ5RmlsZSA9IHBhdGguam9pbihcclxuICAgICAgICB0b2NTdW1tYXJpZXNEaXJlY3RvcnksXHJcbiAgICAgICAgZXhhY3RNYXRjaCxcclxuICAgICk7XHJcblxyXG4gICAgbGV0IG1vZGVsUmV0dXJuUGFja2FnZTogc3RyaW5nO1xyXG5cclxuICAgIC8vIENoZWNrcyBpZiB3ZSd2ZSBhbHJlYWR5IG1hZGUgYSBjYWNoZWQgdmVyc2lvbiBvZiB0aGUgc3VtbWFyeSwgc2VuZCB0aGlzIGluc3RlYWQgb2YgZG9pbmcgYSBuZXcgY2FsbCB0byB0aGUgbW9kZWwuXHJcbiAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IGNhY2hlZFN1bW1hcnkgPSBhd2FpdCBmcy5yZWFkRmlsZShcclxuICAgICAgICAgICAgY29tcGFjdGlvblN1bW1hcnlGaWxlLFxyXG4gICAgICAgICAgICBcInV0Zi04XCIsXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgbW9kZWxSZXR1cm5QYWNrYWdlID0gSlNPTi5wYXJzZShjYWNoZWRTdW1tYXJ5KSBhcyBzdHJpbmc7XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIGlmICgoZXJyb3IgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uKS5jb2RlICE9PSBcIkVOT0VOVFwiKSB7XHJcbiAgICAgICAgICAgIHRocm93IGVycm9yO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3Qgc3RyaW5naWZpZWRNZXNzYWdlcyA9XHJcbiAgICAgICAgICAgIGF3YWl0IHByb21wdFByb2Nlc3NvckNvbnN0cnVjdENvbXBhY3Rpb25Ub0luamVjdChcclxuICAgICAgICAgICAgICAgIGNvbXBhY3Rpb25TZWVkRmlsZSxcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgbW9kZWxSZXR1cm5QYWNrYWdlID1cclxuICAgICAgICAgICAgYXdhaXQgbW9kZWxDYWxsRm9yT25EZW1hbmRTdW1tYXJ5KHN0cmluZ2lmaWVkTWVzc2FnZXMpO1xyXG5cclxuICAgICAgICBhd2FpdCBmcy5ta2Rpcih0b2NTdW1tYXJpZXNEaXJlY3RvcnksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xyXG5cclxuICAgICAgICBhd2FpdCBmcy53cml0ZUZpbGUoXHJcbiAgICAgICAgICAgIGNvbXBhY3Rpb25TdW1tYXJ5RmlsZSxcclxuICAgICAgICAgICAgSlNPTi5zdHJpbmdpZnkobW9kZWxSZXR1cm5QYWNrYWdlKSxcclxuICAgICAgICAgICAgXCJ1dGYtOFwiLFxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUmV0dXJuIHRoZSBjYWNoZWQgb3IgbmV3bHkgZ2VuZXJhdGVkIHN1bW1hcnkuXHJcbiAgICByZXR1cm4gZm9ybWF0Q29tcGFjdGlvblBhY2thZ2UobW9kZWxSZXR1cm5QYWNrYWdlKTtcclxufSIsICJpbXBvcnQgeyBnZXRNZW1vcnlTZWVkc1Bvb2wgfSBmcm9tIFwiLi9tZW1vcnlTZXNzaW9uXCI7XHJcbmltcG9ydCB7IHJlc2V0UGVuZGluZ1NhdmVNZW1vcnksIHNldENvbmZpZ1NjaGVtYXRpY3MgfSBmcm9tIFwiLi9jb25maWdcIjtcclxuaW1wb3J0IHsgdXBkYXRlVGFibGVPZk1lbW9yaWVzSW5jcmVtZW50YWxseSB9IGZyb20gXCIuL3RhYmxlT2ZNZW1vcmllc1wiO1xyXG5pbXBvcnQgZnMgZnJvbSBcIm5vZGU6ZnMvcHJvbWlzZXNcIjtcclxuaW1wb3J0IHBhdGggZnJvbSBcIm5vZGU6cGF0aFwiO1xyXG5pbXBvcnQgeyB1cGRhdGVUYWJsZU9mQ29tcGFjdGlvbnNJbmNyZW1lbnRhbGx5LCB1cGRhdGVUb2NDb2xsZWN0aW9uc0luY3JlbWVudGFsbHkgfSBmcm9tIFwiLi90YWJsZU9mQ29tcGFjdGlvbnNcIjtcclxuXHJcbmV4cG9ydCBpbnRlcmZhY2UgTWVtb3J5U2VlZCB7XHJcbiAgICBkYXRlOiBzdHJpbmc7XHJcbiAgICByb290X2lucHV0OiBzdHJpbmc7XHJcbiAgICBkaXJlY3RfaW5wdXQ6IHN0cmluZztcclxuICAgIG91dHB1dDogc3RyaW5nO1xyXG59XHJcblxyXG5leHBvcnQgaW50ZXJmYWNlIE1lbW9yeVNlZWRJbmZvIHtcclxuICAgIG5hbWU6IHN0cmluZztcclxuICAgIGNhdGVnb3J5OiBzdHJpbmc7XHJcbiAgICBmaWxlbmFtZTogc3RyaW5nO1xyXG4gICAgc2VlZDogTWVtb3J5U2VlZDtcclxufVxyXG5cclxuZXhwb3J0IGNsYXNzIE1lbW9yeVN0b3JlIHtcclxuICAgIHByaXZhdGUgcm9vdERpcmVjdG9yeTogc3RyaW5nIHwgbnVsbCA9IG51bGw7XHJcbiAgICBwcml2YXRlIG1lbW9yaWVzRGlyZWN0b3J5OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcclxuXHJcbiAgICAvKipcclxuICAgICAqIENvbmZpZ3VyZSB3aGVyZSBNZW1vcnkgU2VlZHMgYXJlIHN0b3JlZC5cclxuICAgICAqIFRoZSBkaXJlY3RvcnkgaXMgc3VwcGxpZWQgYnkgTE0gU3R1ZGlvJ3MgcGx1Z2luIHdvcmtpbmcgZGlyZWN0b3J5LlxyXG4gICAgICovXHJcbiAgICBhc3luYyBzZXRSb290RGlyZWN0b3J5KHJvb3REaXJlY3Rvcnk6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgICAgIGlmICghcm9vdERpcmVjdG9yeSB8fCAhcm9vdERpcmVjdG9yeS50cmltKCkpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICAgICAgICAgICAgXCJNZW1vcnkgU3RvcmUgcm9vdCBkaXJlY3RvcnkgY2Fubm90IGJlIGVtcHR5LlwiLFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdGhpcy5yb290RGlyZWN0b3J5ID0gcm9vdERpcmVjdG9yeTtcclxuXHJcbiAgICAgICAgdGhpcy5tZW1vcmllc0RpcmVjdG9yeSA9IHBhdGguam9pbihcclxuICAgICAgICAgICAgdGhpcy5yb290RGlyZWN0b3J5LFxyXG4gICAgICAgICAgICBcIm1lbW9yaWVzXCIsXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvKipcclxuICAgICAqIFJldHVybiB0aGUgcm9vdCBkaXJlY3RvcnkgdXNlZCBieSB0aGUgbWVtb3J5IHN0b3JlLlxyXG4gICAgICovXHJcbiAgICBhc3luYyBnZXRSb290RGlyZWN0b3J5KCk6IFByb21pc2U8c3RyaW5nPiB7XHJcbiAgICAgICAgaWYgKCF0aGlzLnJvb3REaXJlY3RvcnkpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxyXG4gICAgICAgICAgICAgICAgXCJNZW1vcnkgU3RvcmUgaGFzIG5vdCBiZWVuIGluaXRpYWxpemVkIHdpdGggYSByb290IGRpcmVjdG9yeS5cIixcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiB0aGlzLnJvb3REaXJlY3Rvcnk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBNYWtlIHN1cmUgdGhlIHJvb3QgbWVtb3JpZXMgZGlyZWN0b3J5IGV4aXN0cy5cclxuICAgICAqL1xyXG4gICAgYXN5bmMgaW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgICAgICBjb25zdCBkaXJlY3RvcnkgPSBhd2FpdCB0aGlzLmdldE1lbW9yaWVzRGlyZWN0b3J5KCk7XHJcblxyXG4gICAgICAgIGF3YWl0IGZzLm1rZGlyKGRpcmVjdG9yeSwge1xyXG4gICAgICAgICAgICByZWN1cnNpdmU6IHRydWUsXHJcbiAgICAgICAgfSk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBSZXR1cm4gdGhlIGNvbmZpZ3VyZWQgbWVtb3JpZXMgZGlyZWN0b3J5LlxyXG4gICAgICovXHJcbiAgICBhc3luYyBnZXRNZW1vcmllc0RpcmVjdG9yeSgpOiBQcm9taXNlPHN0cmluZz4ge1xyXG4gICAgICAgIGlmICghdGhpcy5tZW1vcmllc0RpcmVjdG9yeSkge1xyXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXHJcbiAgICAgICAgICAgICAgICBcIk1lbW9yeSBTdG9yZSBoYXMgbm90IGJlZW4gaW5pdGlhbGl6ZWQgd2l0aCBhIHJvb3QgZGlyZWN0b3J5LlwiLFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXMubWVtb3JpZXNEaXJlY3Rvcnk7XHJcbiAgICB9XHJcblxyXG4gICAgLyoqXHJcbiAgICAgKiBTYXZlIGEgTWVtb3J5IFNlZWQuXHJcbiAgICAgKlxyXG4gICAgICogQ3JlYXRlczpcclxuICAgICAqXHJcbiAgICAgKiAgIG1lbW9yaWVzL1xyXG4gICAgICogICAgIFJ1c3QgR2FtZS9cclxuICAgICAqICAgICAgIGdhbWUtYXJjaGl0ZWN0dXJlLmpzb25cclxuICAgICAqL1xyXG4gICAgYXN5bmMgc2F2ZVNlZWQoXHJcbiAgICAgICAgY2F0ZWdvcnk6IHN0cmluZyxcclxuICAgICAgICBuYW1lOiBzdHJpbmcsXHJcbiAgICAgICAgc2VlZDogTWVtb3J5U2VlZCxcclxuICAgICAgICBzYXZlTWVtb3J5TnVtYmVyOiBudW1iZXIsXHJcbiAgICApOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgICAgICBjb25zdCBkaXJlY3RvcnkgPSBhd2FpdCB0aGlzLmluaXRpYWxpemVBbmRHZXREaXJlY3RvcnkoKTtcclxuXHJcbiAgICAgICAgY29uc3Qgc2FmZUNhdGVnb3J5ID0gc2FuaXRpemVQYXRoUGFydChjYXRlZ29yeSk7XHJcbiAgICAgICAgY29uc3Qgc2FmZU5hbWUgPSBzYW5pdGl6ZUZpbGVuYW1lKG5hbWUpO1xyXG5cclxuICAgICAgICBpZiAoc2F2ZU1lbW9yeU51bWJlciA9PT0gbnVsbCkge1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoIXNhZmVDYXRlZ29yeSkge1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoIXNhZmVOYW1lKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICghc2VlZC5yb290X2lucHV0LnRyaW0oKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoIXNlZWQuZGlyZWN0X2lucHV0LnRyaW0oKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBpZiAoIXNlZWQub3V0cHV0LnRyaW0oKSkge1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBjYXRlZ29yeVBhdGggPSBwYXRoLmpvaW4oXHJcbiAgICAgICAgICAgICAgICBkaXJlY3RvcnksXHJcbiAgICAgICAgICAgICAgICBzYWZlQ2F0ZWdvcnksXHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBhd2FpdCBmcy5ta2RpcihjYXRlZ29yeVBhdGgsIHtcclxuICAgICAgICAgICAgICAgIHJlY3Vyc2l2ZTogdHJ1ZSxcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBmaWxlUGF0aCA9IHBhdGguam9pbihcclxuICAgICAgICAgICAgICAgIGNhdGVnb3J5UGF0aCxcclxuICAgICAgICAgICAgICAgIGAke3NhZmVOYW1lfS5qc29uYCxcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGxldCBzZWVkczogTWVtb3J5U2VlZFtdID0gW107XHJcblxyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZXhpc3RpbmcgPSBhd2FpdCBmcy5yZWFkRmlsZShcclxuICAgICAgICAgICAgICAgICAgICBmaWxlUGF0aCxcclxuICAgICAgICAgICAgICAgICAgICBcInV0Zi04XCIsXHJcbiAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgICAgIGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoZXhpc3RpbmcpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChBcnJheS5pc0FycmF5KHBhcnNlZCkpIHtcclxuICAgICAgICAgICAgICAgICAgICBzZWVkcyA9IHBhcnNlZDtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocGFyc2VkICYmIHR5cGVvZiBwYXJzZWQgPT09IFwib2JqZWN0XCIpIHtcclxuICAgICAgICAgICAgICAgICAgICBzZWVkcyA9IFtwYXJzZWQgYXMgTWVtb3J5U2VlZF07XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFwiRU5PRU5UXCIpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHNlZWRzLnB1c2goc2VlZCk7XHJcblxyXG4gICAgICAgICAgICBhd2FpdCBmcy53cml0ZUZpbGUoXHJcbiAgICAgICAgICAgICAgICBmaWxlUGF0aCxcclxuICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHNlZWRzLCBudWxsLCAyKSxcclxuICAgICAgICAgICAgICAgIFwidXRmLThcIixcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IG1lbW9yeVNlZWROYW1lID0gYCR7c2FmZUNhdGVnb3J5fS8ke3NhZmVOYW1lfS5qc29uYDtcclxuXHJcbiAgICAgICAgICAgIGF3YWl0IHVwZGF0ZVRhYmxlT2ZNZW1vcmllc0luY3JlbWVudGFsbHkoXHJcbiAgICAgICAgICAgICAgICBkaXJlY3RvcnksXHJcbiAgICAgICAgICAgICAgICBzYWZlQ2F0ZWdvcnksXHJcbiAgICAgICAgICAgICAgICBzYWZlTmFtZSxcclxuICAgICAgICAgICAgICAgIFtzZWVkXSxcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IG1lbW9yeVNlZWRzUG9vbCA9IGdldE1lbW9yeVNlZWRzUG9vbCgpO1xyXG5cclxuICAgICAgICAgICAgaWYgKCFtZW1vcnlTZWVkc1Bvb2wuaW5jbHVkZXMobWVtb3J5U2VlZE5hbWUpKSB7XHJcbiAgICAgICAgICAgICAgICBzZXRDb25maWdTY2hlbWF0aWNzKHtcclxuICAgICAgICAgICAgICAgICAgICBtZW1vcnlTZWVkc1Bvb2w6IFtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLi4ubWVtb3J5U2VlZHNQb29sLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBtZW1vcnlTZWVkTmFtZSxcclxuICAgICAgICAgICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmVzZXRQZW5kaW5nU2F2ZU1lbW9yeSgpO1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9IGNhdGNoIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBzYXZlTXVsdGlwbGVTZWVkcyhcclxuICAgICAgICBjYXRlZ29yeTogc3RyaW5nLFxyXG4gICAgICAgIG5hbWU6IHN0cmluZyxcclxuICAgICAgICBzZWVkczogTWVtb3J5U2VlZFtdLFxyXG4gICAgICAgIHNhdmVNZW1vcnlOdW1iZXI6IG51bWJlcixcclxuICAgICAgICBjYWxsZXJJc0NvbXBhY3Rpb24/OiBib29sZWFuLFxyXG4gICAgICAgIG1hdGNoaW5nRmlsZXNBbmROZXdBZGRpdGlvbnM/OiBzdHJpbmdbXSxcclxuICAgICk6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG4gICAgICAgIGNvbnN0IGRpcmVjdG9yeSA9IGF3YWl0IHRoaXMuaW5pdGlhbGl6ZUFuZEdldERpcmVjdG9yeSgpO1xyXG5cclxuICAgICAgICBjb25zdCBzYWZlQ2F0ZWdvcnkgPSBzYW5pdGl6ZVBhdGhQYXJ0KGNhdGVnb3J5KTtcclxuICAgICAgICBjb25zdCBzYWZlTmFtZSA9IHNhbml0aXplRmlsZW5hbWUobmFtZSk7XHJcblxyXG4gICAgICAgIGlmIChzYXZlTWVtb3J5TnVtYmVyID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICghc2FmZUNhdGVnb3J5KSB7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmICghc2FmZU5hbWUpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKCFzZWVkcy5sZW5ndGgpIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKFwiW1NBVkUgU0tJUFBFRF0gTm8gc2VlZHNcIiwgeyBuYW1lOiBzYWZlTmFtZSB9KTtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBzZWVkIG9mIHNlZWRzKSB7XHJcbiAgICAgICAgICAgIGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBzZWVkcy5sZW5ndGg7IGluZGV4KyspIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHNlZWQgPSBzZWVkc1tpbmRleF07XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKCFzZWVkLnJvb3RfaW5wdXQudHJpbSgpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS53YXJuKFwiW1NBVkUgU0tJUFBFRF0gRW1wdHkgcm9vdF9pbnB1dFwiLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG5hbWU6IHNhZmVOYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBpbmRleCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgcm9vdF9pbnB1dDogc2VlZC5yb290X2lucHV0LFxyXG4gICAgICAgICAgICAgICAgICAgIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKCFzZWVkLmRpcmVjdF9pbnB1dC50cmltKCkpIHtcclxuICAgICAgICAgICAgICAgIC8vIGNvbnNvbGUud2FybihcIltTQVZFIFNLSVBQRURdIEVtcHR5IGRpcmVjdF9pbnB1dFwiLCB7XHJcbiAgICAgICAgICAgICAgICAvLyAgICAgbmFtZTogc2FmZU5hbWUsXHJcbiAgICAgICAgICAgICAgICAvLyB9KTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgaWYgKCFzZWVkLm91dHB1dC50cmltKCkpIHtcclxuICAgICAgICAgICAgICAgIC8vIGNvbnNvbGUud2FybihcIltTQVZFIFNLSVBQRURdIEVtcHR5IG91dHB1dFwiLCB7XHJcbiAgICAgICAgICAgICAgICAvLyAgICAgbmFtZTogc2FmZU5hbWUsXHJcbiAgICAgICAgICAgICAgICAvLyB9KTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBjYXRlZ29yeVBhdGggPSBjYWxsZXJJc0NvbXBhY3Rpb25cclxuICAgICAgICAgICAgICAgID8gcGF0aC5qb2luKGRpcmVjdG9yeSwgc2FmZUNhdGVnb3J5LCBcIlRPQ19TZWVkc1wiKVxyXG4gICAgICAgICAgICAgICAgOiBwYXRoLmpvaW4oZGlyZWN0b3J5LCBzYWZlQ2F0ZWdvcnkpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCBmcy5ta2RpcihjYXRlZ29yeVBhdGgsIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJlY3Vyc2l2ZTogdHJ1ZSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBmaWxlUGF0aCA9IHBhdGguam9pbihcclxuICAgICAgICAgICAgICAgIGNhdGVnb3J5UGF0aCxcclxuICAgICAgICAgICAgICAgIGAke3NhZmVOYW1lfS5qc29uYCxcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGxldCBleGlzdGluZ1NlZWRzOiBNZW1vcnlTZWVkW10gPSBbXTtcclxuXHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBleGlzdGluZyA9IGF3YWl0IGZzLnJlYWRGaWxlKFxyXG4gICAgICAgICAgICAgICAgICAgIGZpbGVQYXRoLFxyXG4gICAgICAgICAgICAgICAgICAgIFwidXRmLThcIixcclxuICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShleGlzdGluZyk7XHJcblxyXG4gICAgICAgICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocGFyc2VkKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nU2VlZHMgPSBwYXJzZWQ7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHBhcnNlZCAmJiB0eXBlb2YgcGFyc2VkID09PSBcIm9iamVjdFwiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gU3VwcG9ydCB0aGUgcHJldmlvdXMgc2luZ2xlLXNlZWQgZmlsZSBmb3JtYXQuXHJcbiAgICAgICAgICAgICAgICAgICAgZXhpc3RpbmdTZWVkcyA9IFtwYXJzZWQgYXMgTWVtb3J5U2VlZF07XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFwiRU5PRU5UXCIpIHtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGV4aXN0aW5nU2VlZHMucHVzaCguLi5zZWVkcyk7XHJcblxyXG4gICAgICAgICAgICBhd2FpdCBmcy53cml0ZUZpbGUoXHJcbiAgICAgICAgICAgICAgICBmaWxlUGF0aCxcclxuICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KGV4aXN0aW5nU2VlZHMsIG51bGwsIDIpLFxyXG4gICAgICAgICAgICAgICAgXCJ1dGYtOFwiLFxyXG4gICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgLy8gY29uc29sZS5sb2coXCJbQ09NUEFDVElPTiBGSUxFIFdSSVRURU5dXCIsIHtcclxuICAgICAgICAgICAgLy8gICAgIG5hbWU6IHNhZmVOYW1lLFxyXG4gICAgICAgICAgICAvLyAgICAgZmlsZVBhdGgsXHJcbiAgICAgICAgICAgIC8vICAgICBzZWVkQ291bnQ6IGV4aXN0aW5nU2VlZHMubGVuZ3RoLFxyXG4gICAgICAgICAgICAvLyB9KTtcclxuXHJcbiAgICAgICAgICAgIGlmIChjYWxsZXJJc0NvbXBhY3Rpb24pIHtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHVwZGF0ZVRhYmxlT2ZDb21wYWN0aW9uc0luY3JlbWVudGFsbHkoXHJcbiAgICAgICAgICAgICAgICAgICAgZGlyZWN0b3J5LFxyXG4gICAgICAgICAgICAgICAgICAgIHNhZmVDYXRlZ29yeSxcclxuICAgICAgICAgICAgICAgICAgICBzYWZlTmFtZSxcclxuICAgICAgICAgICAgICAgICAgICBzZWVkcyxcclxuICAgICAgICAgICAgICAgICAgICBtYXRjaGluZ0ZpbGVzQW5kTmV3QWRkaXRpb25zLFxyXG4gICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgICAgICBhd2FpdCB1cGRhdGVUb2NDb2xsZWN0aW9uc0luY3JlbWVudGFsbHkoXHJcbiAgICAgICAgICAgICAgICAgICAgc2FmZU5hbWUsXHJcbiAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCBtZW1vcnlTZWVkTmFtZSA9XHJcbiAgICAgICAgICAgICAgICBgJHtzYWZlQ2F0ZWdvcnl9LyR7c2FmZU5hbWV9Lmpzb25gO1xyXG5cclxuICAgICAgICAgICAgLy8gdXBkYXRpbmcgdGhlIFRPTVxyXG4gICAgICAgICAgICBhd2FpdCB1cGRhdGVUYWJsZU9mTWVtb3JpZXNJbmNyZW1lbnRhbGx5KFxyXG4gICAgICAgICAgICAgICAgZGlyZWN0b3J5LFxyXG4gICAgICAgICAgICAgICAgc2FmZUNhdGVnb3J5LFxyXG4gICAgICAgICAgICAgICAgc2FmZU5hbWUsXHJcbiAgICAgICAgICAgICAgICBzZWVkcyxcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IG1lbW9yeVNlZWRzUG9vbCA9IGdldE1lbW9yeVNlZWRzUG9vbCgpO1xyXG5cclxuICAgICAgICAgICAgaWYgKCFtZW1vcnlTZWVkc1Bvb2wuaW5jbHVkZXMobWVtb3J5U2VlZE5hbWUpKSB7XHJcbiAgICAgICAgICAgICAgICBzZXRDb25maWdTY2hlbWF0aWNzKHtcclxuICAgICAgICAgICAgICAgICAgICBtZW1vcnlTZWVkc1Bvb2w6IFtcclxuICAgICAgICAgICAgICAgICAgICAgICAgLi4ubWVtb3J5U2VlZHNQb29sLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBtZW1vcnlTZWVkTmFtZSxcclxuICAgICAgICAgICAgICAgICAgICBdLFxyXG4gICAgICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgXHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH0gY2F0Y2gge1xyXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8qKlxyXG4gICAgICogSW5pdGlhbGl6ZSB0aGUgc3RvcmUgYW5kIHJldHVybiBpdHMgZGlyZWN0b3J5LlxyXG4gICAgICovXHJcbiAgICBwcml2YXRlIGFzeW5jIGluaXRpYWxpemVBbmRHZXREaXJlY3RvcnkoKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuICAgICAgICBhd2FpdCB0aGlzLmluaXRpYWxpemUoKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0TWVtb3JpZXNEaXJlY3RvcnkoKTtcclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIENvbnZlcnQgYSB1c2VyL21vZGVsLXByb3ZpZGVkIGNhdGVnb3J5IGludG8gYSBzYWZlXHJcbiAqIGRpcmVjdG9yeSBuYW1lLlxyXG4gKlxyXG4gKiBXZSBpbnRlbnRpb25hbGx5IGFsbG93IHNwYWNlcyBiZWNhdXNlIGNhdGVnb3JpZXMgYXJlXHJcbiAqIG1lYW50IHRvIGJlIGh1bWFuLXJlYWRhYmxlLlxyXG4gKi9cclxuZnVuY3Rpb24gc2FuaXRpemVQYXRoUGFydCh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHtcclxuICAgIHJldHVybiB2YWx1ZVxyXG4gICAgICAgIC50cmltKClcclxuICAgICAgICAucmVwbGFjZSgvWzw+OlwiL1xcXFx8PypcXHgwMC1cXHgxRl0vZywgXCJcIilcclxuICAgICAgICAucmVwbGFjZSgvXFwuKyQvZywgXCJcIilcclxuICAgICAgICAudHJpbSgpO1xyXG59XHJcblxyXG4vKipcclxuICogQ29udmVydCBhIHVzZXIvbW9kZWwtcHJvdmlkZWQgTWVtb3J5IFNlZWQgbmFtZSBpbnRvXHJcbiAqIGEgc2FmZSBmaWxlbmFtZS5cclxuICovXHJcbmZ1bmN0aW9uIHNhbml0aXplRmlsZW5hbWUodmFsdWU6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gdmFsdWVcclxuICAgICAgICAudHJpbSgpXHJcbiAgICAgICAgLnJlcGxhY2UoL1s8PjpcIi9cXFxcfD8qXFx4MDAtXFx4MUZdL2csIFwiXCIpXHJcbiAgICAgICAgLnJlcGxhY2UoL1xcLiskL2csIFwiXCIpXHJcbiAgICAgICAgLnRyaW0oKTtcclxufVxyXG5cclxuZXhwb3J0IGNvbnN0IG1lbW9yeVN0b3JlID0gbmV3IE1lbW9yeVN0b3JlKCk7IiwgImltcG9ydCB7IHJlbW92ZU1lbW9yeVNlZWRGcm9tU2VsZWN0ZWQsIHVwZGF0ZU1lbW9yeVNlZWRzU2VsZWN0ZWQgfSBmcm9tIFwiLi9tZW1vcnlTZXNzaW9uXCI7XHJcbmltcG9ydCB7IGFkZENvbnZlcnNhdGlvbk9wZXJhdGlvbiwgc2V0Q29uZmlnU2NoZW1hdGljcyB9IGZyb20gXCIuL2NvbmZpZ1wiO1xyXG5cclxuLyoqXHJcbiAqIEZsb3cgaXMgcHJvbXB0IHByZXByb2Nlc3NvciBcdTIxOTIgcmVtb3ZlTWVtb3J5U2VlZHMgXHUyMTkyIG11bHRpRWRpdENvb3JkaW5hdG9yXHJcbiAqIFx1MjE5MiB0cnlSZW1vdmVNZW1vcnlTZWVkc1RpbWVvdXRGdW5jdGlvbiBcclxuICogXHUyMTkyIG1lbW9yeVNlZWRzQ2xlYW51cCAocmVtb3ZlIHNwZWNpZmljIG1lbW9yeSBzZWVkcykgfHwgcmVtb3ZhQWxsTWVtb3J5V3JhcHBlcnMgKG51a2UgYWxsIG1lbW9yeSBzZWVkcylcclxuICogXHUyMTkyIG11bHRpRWRpdENvb3JkaW5hdG9yKGNvbnZlcnNhdGlvbi5qc29uIHdyaXRlKVxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlbW92ZU1lbW9yeVNlZWRzKFxyXG4gICAgdmFsaWRNZW1vcnlTZWVkc1NlbGVjdGVkOiBzdHJpbmdbXSxcclxuICAgIG1lbW9yeVNlZWRzVG9SZW1vdmU6IHN0cmluZ1tdLFxyXG4gICAgY2xlYW51cEFsbFNlZWRzOiBib29sZWFuLFxyXG4pOiBQcm9taXNlPHZvaWQ+IHtcclxuXHJcbiAgICBhZGRDb252ZXJzYXRpb25PcGVyYXRpb24oXHJcbiAgICAgICAgXCJ0cnlSZW1vdmVNZW1vcnlTZWVkc1RpbWVvdXRGdW5jdGlvblwiLFxyXG4gICAgICAgIHtcclxuICAgICAgICAgICAgY2xlYW51cEFsbFNlZWRzLFxyXG4gICAgICAgICAgICBtZW1vcnlTZWVkc1RvUmVtb3ZlLFxyXG4gICAgICAgICAgICB2YWxpZE1lbW9yeVNlZWRzU2VsZWN0ZWQsXHJcbiAgICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgLy89PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyBDT0RFIE5PVyBSVU5TIEZST00gbXVsdGlFZGl0Q29vcmRpbmF0b3IudHNcclxuICAgIC8vPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG59XHJcblxyXG4vKipcclxuICogbXVsdGlFZGl0Q29vcmRpbmF0b3IgY2FsbHMgdGhpcyBmdW5jdGlvblxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHRyeVJlbW92ZU1lbW9yeVNlZWRzVGltZW91dEZ1bmN0aW9uKFxyXG4gICAgY2xlYW51cEFsbFNlZWRzOiBib29sZWFuLFxyXG4gICAgbGF0ZXN0Q29udmVyc2F0aW9uOiBhbnksXHJcbiAgICBtZW1vcnlTZWVkc1RvUmVtb3ZlOiBzdHJpbmdbXSxcclxuICAgIHZhbGlkTWVtb3J5U2VlZHNTZWxlY3RlZDogc3RyaW5nW11cclxuKTogUHJvbWlzZTx2b2lkPntcclxuXHJcbiAgICAvLyBTaG9ydGN1dCB0byBjbGVhbiBhbGwgc2VlZHMuXHJcbiAgICBpZiAoY2xlYW51cEFsbFNlZWRzID09PSB0cnVlKSB7XHJcbiAgICAgICAgcmVtb3ZlQWxsTWVtb3J5V3JhcHBlcnMobGF0ZXN0Q29udmVyc2F0aW9uKTtcclxuXHJcbiAgICAgICAgdXBkYXRlTWVtb3J5U2VlZHNTZWxlY3RlZChbXSk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgc2V0Q29uZmlnU2NoZW1hdGljcyh7XHJcbiAgICAgICAgICAgIG1lbW9yeVNlZWRzU2VsZWN0ZWQ6IFtdLFxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gTm9ybWFsIFBhdGggLSBJdGVyYXRlIHRocm91Z2ggYWxsIG9iamVjdHMsIGxvY2F0ZSBzcGVjaWZpYyBzZWVkcyBhbmQgcmVtb3ZlIHRoZW0uXHJcbiAgICAgICAgY29uc3QgbWVtb3J5U2VlZHNSZW1vdmVkID0gYXdhaXQgbWVtb3J5U2VlZHNDbGVhbnVwKFxyXG4gICAgICAgICAgICBsYXRlc3RDb252ZXJzYXRpb24sXHJcbiAgICAgICAgICAgIG1lbW9yeVNlZWRzVG9SZW1vdmUsXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgY29uc3QgbWVtb3J5U2VlZHNTdGlsbFZhbGlkID0gdmFsaWRNZW1vcnlTZWVkc1NlbGVjdGVkLmZpbHRlcihcclxuICAgICAgICAgICAgKG1lbW9yeVNlZWQpID0+ICFtZW1vcnlTZWVkc1JlbW92ZWQuaW5jbHVkZXMobWVtb3J5U2VlZCksXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgdXBkYXRlTWVtb3J5U2VlZHNTZWxlY3RlZChtZW1vcnlTZWVkc1N0aWxsVmFsaWQpO1xyXG5cclxuICAgICAgICBzZXRDb25maWdTY2hlbWF0aWNzKHtcclxuICAgICAgICAgICAgbWVtb3J5U2VlZHNTZWxlY3RlZDogbWVtb3J5U2VlZHNTdGlsbFZhbGlkLFxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59XHJcblxyXG4vKipcclxuICogQWxsIHNlZWRzIGhhdmUgYmVlbiByZW1vdmVkIGZyb20gTWVtb3JpZXMgdG8gSW5qZWN0IGluIFBsdWdpblxyXG4gKiBSZW1vdmUgYWxsIG1lbW9yeSBzZWVkcyBieSBsb2NhdGluZyBCRUdJTk5JTkcgLSBFTkQgTUVNT1JJRVNcclxuICogSW5kZXNjcmltaW5hdGVcclxuICovXHJcbmZ1bmN0aW9uIHJlbW92ZUFsbE1lbW9yeVdyYXBwZXJzKGxhdGVzdENvbnZlcnNhdGlvbjogYW55KTogdm9pZCB7XHJcbiAgICBmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgbGF0ZXN0Q29udmVyc2F0aW9uLm1lc3NhZ2VzID8/IFtdKSB7XHJcbiAgICAgICAgZm9yIChjb25zdCB2ZXJzaW9uIG9mIG1lc3NhZ2UudmVyc2lvbnMgPz8gW10pIHtcclxuICAgICAgICAgICAgY29uc3QgcHJlcHJvY2Vzc2VkQ29udGVudCA9IHZlcnNpb24ucHJlcHJvY2Vzc2VkPy5jb250ZW50O1xyXG5cclxuICAgICAgICAgICAgaWYgKCFwcmVwcm9jZXNzZWRDb250ZW50KSB7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgZm9yIChjb25zdCBjb250ZW50IG9mIHByZXByb2Nlc3NlZENvbnRlbnQpIHtcclxuICAgICAgICAgICAgICAgIGlmIChjb250ZW50LnR5cGUgIT09IFwidGV4dFwiIHx8ICFjb250ZW50LnRleHQpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBjb250ZW50LnRleHQgPSBjb250ZW50LnRleHQucmVwbGFjZShcclxuICAgICAgICAgICAgICAgICAgICAvXFxbQkVHSU5OSU5HIE9GIE1FTU9SSUVTXFxdW1xcc1xcU10qP1xcW0VORCBPRiBNRU1PUklFU1xcXVxccyovZyxcclxuICAgICAgICAgICAgICAgICAgICBcIlwiLFxyXG4gICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIFJlbW92ZSBvbmx5IHNwZWNpZmljIHNlZWRzLiBMZWF2ZSB0aGUgb25lcyxcclxuICogcHJldmlvdXNseSBpbmplY3RlZCB0aGF0IGFyZSBzdGlsbCBzZWxlY3RlZCBhbG9uZS5cclxuICogVGhpcyByZXR1cm5zIGEgc3RyaW5nIGJ1dCBQRSBtb2RlbCBkZXBlbmRlbnQgdmVyc2lvbiByZXR1cm5zIHZvaWQgYmVjYXVzZSB0aGUgUEVNRCBleGVjdXRlcyBpdCdzIHRhc2sgZHVyaW5nIHRoZSAyIHNlY29uZCB3YWl0IHRpbWVvdXQsXHJcbiAqIGFmdGVyIHRoZSBtZXNzYWdlIGlzIGFscmVhZHkgc2VudCB0byB0aGUgbW9kZWwuIEEgcmV0dXJuIGNhbm5vdCBiZSBleHBlY3RlZCBmcm9tIGEgZGV0YWNoZWQgcHJvY2Vzcy4gRm9yIHRoaXMgdmVyc2lvbiB3ZSBjYW4gc3RpbGwgdXRpbGl6ZVxyXG4gKiB0aGUgcmV0dXJuZWQgdmFsdWUuXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBtZW1vcnlTZWVkc0NsZWFudXAoXHJcbiAgICBsYXRlc3RDb252ZXJzYXRpb246IGFueSxcclxuICAgIG1lbW9yeVNlZWRzVG9SZW1vdmU6IHN0cmluZ1tdLFxyXG4pOiBQcm9taXNlPHN0cmluZ1tdPiB7XHJcblxyXG4gICAgLy8gVXNlciB3YW50cyB0byByZW1vdmUgbWVtb3J5IHNlZWRzIHRoYXQgd2VyZSBhcHBlbmRlZCB0aHJvdWdoIHRoZSBwcm9tcHQgcHJlcHJvY2Vzc29yXHJcbiAgICAvLyBNYWtlIHN1cmUgdGhlIHByZXByb2Nlc3NlZCB0ZXh0IGV4aXN0c1xyXG4gICAgZm9yIChjb25zdCBtZXNzYWdlIG9mIGxhdGVzdENvbnZlcnNhdGlvbi5tZXNzYWdlcykge1xyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IHZlcnNpb24gb2YgbWVzc2FnZS52ZXJzaW9ucyA/PyBbXSkge1xyXG5cclxuICAgICAgICAgICAgY29uc3QgcHJlcHJvY2Vzc2VkQ29udGVudCA9IHZlcnNpb24ucHJlcHJvY2Vzc2VkPy5jb250ZW50O1xyXG5cclxuICAgICAgICAgICAgaWYgKCFwcmVwcm9jZXNzZWRDb250ZW50KSB7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gTG9vcCB0aHJvdWdoIGVhY2ggaXRlbSB0byBzZWUgaWYgc2VlZHMgdG8gcmVtb3ZlIGV4aXN0XHJcbiAgICAgICAgICAgIC8vIEJhc2VkIG9mZiBvdXIgc3RydWN0dXJlIHNlZWRzIHdpbGwgYWx3YXlzIGJlIGluIHRoZSBwcmVwcm9jZXNzZWQgY29udGVudCBcclxuICAgICAgICAgICAgZm9yIChjb25zdCBjb250ZW50IG9mIHByZXByb2Nlc3NlZENvbnRlbnQpIHtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAoY29udGVudC50eXBlICE9PSBcInRleHRcIiB8fCAhY29udGVudC50ZXh0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBzZWVkTmFtZSBvZiBtZW1vcnlTZWVkc1RvUmVtb3ZlKSB7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGVzY2FwZWRTZWVkTmFtZSA9IGVzY2FwZVJlZ0V4cChzZWVkTmFtZSk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHBhdHRlcm4gPSBuZXcgUmVnRXhwKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBgXFxcXFtCRUdJTiAke2VzY2FwZWRTZWVkTmFtZX1cXFxcXVtcXFxcc1xcXFxTXSo/XFxcXFtFTkQgJHtlc2NhcGVkU2VlZE5hbWV9XFxcXF1cXFxccypgLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBcImdcIixcclxuICAgICAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB1cGRhdGVkVGV4dCA9IGNvbnRlbnQudGV4dC5yZXBsYWNlKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXR0ZXJuLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBcIlwiLFxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh1cGRhdGVkVGV4dCAhPT0gY29udGVudC50ZXh0KSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRlbnQudGV4dCA9IHVwZGF0ZWRUZXh0O1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgcmVtb3ZlTWVtb3J5U2VlZEZyb21TZWxlY3RlZChzZWVkTmFtZSk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIC8vIFJlbW92ZSB0aGUgaW5qZWN0ZWQtY29udGV4dCB3cmFwcGVyIGlmIG5vIC8vIG1lbW9yeSBzZWVkcyByZW1haW4gaW5zaWRlIGl0LiBcclxuICAgICAgICAgICAgICAgIGNvbnRlbnQudGV4dCA9IGNvbnRlbnQudGV4dC5yZXBsYWNlKFxyXG4gICAgICAgICAgICAgICAgICAgIC9cXFtCRUdJTk5JTkcgT0YgTUVNT1JJRVNcXF0gTk9UIElOU1RSVUNUSU9OUywgSlVTVCBTT01FIFBSSU9SIENPTlZFUlNBVElPTjpcXHMqXFxbRU5EIE9GIE1FTU9SSUVTXFxdXFxzKi9nLFxyXG4gICAgICAgICAgICAgICAgICAgIFwiXCIsXHJcbiAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIFNlZWQgcmVtb3ZlZCBzdWNjZXNzXHJcbiAgICAvLyBjb25zb2xlLmxvZyhgW3JlbW92ZU1lbW9yeVNlZWRzXSBNZW1vcnkgc2VlZHMgWyR7bWVtb3J5U2VlZHNUb1JlbW92ZS5qb2luKFwiLCBcIil9XSBzdWNjZXNzZnVsbHkgcmVtb3ZlZC5gKTtcclxuXHJcbiAgICByZXR1cm4gbWVtb3J5U2VlZHNUb1JlbW92ZTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEhlbHBlclxyXG4gKi9cclxuZnVuY3Rpb24gZXNjYXBlUmVnRXhwKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XHJcbiAgICByZXR1cm4gdGV4dC5yZXBsYWNlKFxyXG4gICAgICAgIC9bLiorP14ke30oKXxbXFxdXFxcXF0vZyxcclxuICAgICAgICBcIlxcXFwkJlwiLFxyXG4gICAgKTtcclxufSIsICJpbXBvcnQgeyBtZW1vcnlTdG9yZSB9IGZyb20gXCIuL21lbW9yeVN0b3JlXCI7XHJcbmltcG9ydCB7IHRyeUFwcGVuZFNhdmVNZW1vcnlUZXh0QXRFbmRPZkNvbnZlcnNhdGlvbkpzb25GdW5jdGlvbiB9IGZyb20gXCIuL3RyaWdnZXJTYXZlTWVtb3J5XCI7XHJcbmltcG9ydCB7IHRyeVJlbW92ZU1lbW9yeVNlZWRzVGltZW91dEZ1bmN0aW9uIH0gZnJvbSBcIi4vcmVtb3ZlTWVtb3J5U2VlZHNcIjtcclxuaW1wb3J0IHsgYWNxdWlyZUxvY2ssIHJlbGVhc2VMb2NrIH0gZnJvbSBcIi4vYWNxdWlyZUxvY2tGaWxlXCI7XHJcbmltcG9ydCB7IHByb21wdFByb2Nlc3NvckNvbnN0cnVjdE1lc3NhZ2VOdW1iZXJUYWcsIHNjYW5Gb3JDb252ZXJzYXRpb25GaWxlVGhydUZ1bGxDb252ZXJzYXRpb25EaXJlY3RvcnlTY2FuIH0gZnJvbSBcIi4vcHJvbXB0UHJlcHJvY2Vzc29yXCI7XHJcbmltcG9ydCB7IENoYXRNZXNzYWdlIH0gZnJvbSBcIkBsbXN0dWRpby9zZGtcIjtcclxuaW1wb3J0IHsgdGFibGVPZkNvbXBhY3Rpb25zTWFpbiwgdHJ5QXBwZW5kQ29tcGFjdGlvblN1bW1hcnlGdW5jdGlvbiwgdHJ5QXBwZW5kVE9DVHJhaWxGdW5jdGlvbiB9IGZyb20gXCIuL3RhYmxlT2ZDb21wYWN0aW9uc1wiO1xyXG5pbXBvcnQgeyB0cnlBcHBlbmRUYWJsZU9mTWVtb3JpZXNDb250ZW50RnVuY3Rpb24sIHRyeVJldHJhY3RPbGRUb21zRnVuY3Rpb24gfSBmcm9tIFwiLi90YWJsZU9mTWVtb3JpZXNcIjtcclxuaW1wb3J0IHsgam9pbiB9IGZyb20gXCJub2RlOnBhdGhcIjtcclxuXHJcbmltcG9ydCB7IFxyXG4gICAgcmVhZEZpbGUsIFxyXG4gICAgd3JpdGVGaWxlLFxyXG4gICAgb3BlbixcclxuICAgIHVubGluayxcclxufSBmcm9tIFwibm9kZTpmcy9wcm9taXNlc1wiO1xyXG5cclxuaW1wb3J0IHtcclxuICAgIHJlc2V0UGVuZGluZ1NhdmVNZW1vcnksXHJcbiAgICBnZXRDb252ZXJzYXRpb25GaWxlTmFtZSwgXHJcbiAgICBzZXRQZW5kaW5nVG9tQ29tbWFuZCxcclxuICAgIHRha2VDb252ZXJzYXRpb25PcGVyYXRpb25zLFxyXG4gICAgZ2V0Q29udmVyc2F0aW9uT3BlcmF0aW9ucyxcclxuICAgIGdldFZhbGlkYXRlZENvbnZlcnNhdGlvblJvb3REaXJlY3RvcnksXHJcbiAgICBzZXRDb250ZXh0Q2xlYW51cFBsdWdpbkluVXNlLFxyXG4gICAgc2V0Q29udGV4dENsZWFudXBDb252ZXJzYXRpb25OYW1lLFxyXG4gICAgZ2V0Q29udGV4dENsZWFudXBDb252ZXJzYXRpb25OYW1lLFxyXG4gICAgLy8gZ2V0Q2hhdEhpc3RvcnksXHJcbn0gZnJvbSBcIi4vY29uZmlnXCI7XHJcblxyXG4vLyBpbXBvcnQgeyBzdG9yZUFuZFByZXBhcmVIaXN0b3J5TWVzc2FnZXNGb3JNb2RlbCB9IGZyb20gXCIuL3Rvb2xzUHJvdmlkZXJcIjtcclxuXHJcbmNvbnN0IG11bHRpRWRpdENvb3JkaW5hdG9yV3JpdGVRdWV1ZTogc3RyaW5nW10gPSBbXTtcclxubGV0IG11bHRpRWRpdENvb3JkaW5hdG9ySW5kZXggPSAwO1xyXG5sZXQgaW5NZW1vcnlDb252ZXJzYXRpb246IGFueSB8IG51bGwgPSBudWxsO1xyXG5sZXQgc3RhYmFsaXplZDogYm9vbGVhbiA9IGZhbHNlO1xyXG5sZXQgcmVzb2x2ZU1lY1N0YXRlQ2hhbmdlOiAoKCkgPT4gdm9pZCkgfCBudWxsID0gbnVsbDtcclxubGV0IG1lY1N0YXRlQ2hhbmdlZCA9IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XHJcbiAgICByZXNvbHZlTWVjU3RhdGVDaGFuZ2UgPSByZXNvbHZlO1xyXG59KTtcclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBtdWx0aUVkaXRDb29yZGluYXRvcihcclxuICAgIGV4aXRSZXF1ZXN0ZWQ6IGJvb2xlYW4sXHJcbiAgICB1c2VyVGV4dDogc3RyaW5nLFxyXG4gICAgbWVzc2FnZXM6IENoYXRNZXNzYWdlW10sXHJcbik6IFByb21pc2U8dm9pZD57XHJcblxyXG4gICAgaWYgKGdldENvbnZlcnNhdGlvbk9wZXJhdGlvbnMoKS5sZW5ndGggPT09IDApIHtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3Qgcm9vdERpcmVjdG9yeSA9IGF3YWl0IG1lbW9yeVN0b3JlLmdldFJvb3REaXJlY3RvcnkoKTtcclxuXHJcbiAgICBjb25zdCBjb252ZXJzYXRpb25GaWxlTmFtZSA9IGdldENvbnZlcnNhdGlvbkZpbGVOYW1lKCk7XHJcblxyXG4gICAgdHJ5e1xyXG4gICAgICAgIC8vIENvbnN0cnVjdCB0aGUgcGF0aCB0byB0aGUgY29udmVyc2F0aW9uIGZpbGVcclxuICAgICAgICBjb25zdCBjb252ZXJzYXRpb25EaXJlY3RvcnkgPSBnZXRWYWxpZGF0ZWRDb252ZXJzYXRpb25Sb290RGlyZWN0b3J5KCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGNvbnZlcnNhdGlvbkZpbGUgPSBqb2luKFxyXG4gICAgICAgICAgICBjb252ZXJzYXRpb25EaXJlY3RvcnksXHJcbiAgICAgICAgICAgIGNvbnZlcnNhdGlvbkZpbGVOYW1lLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIC8vIFByZXBhcmUganNvbiBmaWxlIHRvIGJlIHJlYWRhYmxlIGFuZCBhc3NpZ24gdG8gdmFyaWFibGVcclxuICAgICAgICAvLyB3aXRoIGFuIGF0dGVtcHRlZCByZWNvdmVyeS5cclxuICAgICAgICBjb25zdCBjb252ZXJzYXRpb24gPSBhd2FpdCByZWFkQ29udmVyc2F0aW9uV2l0aFJlY292ZXJ5KFxyXG4gICAgICAgICAgICBjb252ZXJzYXRpb25EaXJlY3RvcnksIFxyXG4gICAgICAgICAgICBjb252ZXJzYXRpb25GaWxlTmFtZSwgXHJcbiAgICAgICAgICAgIHJvb3REaXJlY3RvcnksIFxyXG4gICAgICAgICAgICB1c2VyVGV4dFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIC8vIENvbnZlcnNhdGlvbiB3YXMgdW51c2FibGUgZXhpdCB0aGlzIGZ1bmN0aW9uLFxyXG4gICAgICAgIC8vIHRoaXMgdHVybiB0byBXUklURSB0aGUgY29udmVyc2F0aW9uIGZpbGUgaXMgbG9zdC5cclxuICAgICAgICBpZiAoY29udmVyc2F0aW9uID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGNvbnN0IGNvbnZlcnNhdGlvbk9wZXJhdGlvbnMgPSB0YWtlQ29udmVyc2F0aW9uT3BlcmF0aW9ucygpO1xyXG5cclxuICAgICAgICAvLyBTbmFwc2hvdHRpbmcgYXNzaXN0YW50TGFzdE1lc3NhZ2VkQXQgZmllbGQgKHNvIHdhdGNoZXIga25vd3Mgd2hlbiBtb2RlbCBpcyBmaW5pc2hlZCB3aXRoIGl0J3MgcmVzcG9uc2UpXHJcbiAgICAgICAgY29uc3Qgb3JpZ2luYWxBc3Npc3RhbnRMYXN0TWVzc2FnZWRBdCA9IGNvbnZlcnNhdGlvbi5hc3Npc3RhbnRMYXN0TWVzc2FnZWRBdDtcclxuXHJcbiAgICAgICAgLy8gTG9jayBjcmVhdGVkIGFmdGVyIHdlIGRpZCB0aGUgZmlyc3QgcmVhZCB0byBlc3RhYmxpc2ggdGhlIG9yaWdpbmFsQXNzaXN0YW50TGFzdE1lc3NhZ2VkQXRcclxuICAgICAgICBjb25zdCBsb2NrRmlsZSA9IGAke2NvbnZlcnNhdGlvbkZpbGV9LmxvY2tgO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IGZ1bmN0aW9uTmFtZSA9IFwibXVsdGlFZGl0Q29vcmRpbmF0b3JcIjtcclxuXHJcbiAgICAgICAgbGV0IGxvY2tPd25lck5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcclxuXHJcbiAgICAgICAgY29uc3QgcG9sbEludGVydmFsID0gMjAwO1xyXG5cclxuICAgICAgICBsZXQgYXNzaXN0YW50VXBkYXRlSGFuZGxlZCA9IGZhbHNlO1xyXG5cclxuICAgICAgICAvLyBBc3NpZ25pbmcgZWFjaCBNRUMgYSB1bmlxdWUgbmFtZSBhbmQgcHV0dGluZyBpdCBpbiB0aGUgd2FpdCBxdWV1ZS5cclxuICAgICAgICAvLyBBIG5ldyBNRUMgbmVlZHMgYSBmcmVzaCBzdGFiaWxpdHkgY2hlY2suXHJcbiAgICAgICAgY29uc3QgY29vcmRpbmF0b3JOYW1lID0gYG11bHRpRWRpdENvb3JkaW5hdG9yXyR7KyttdWx0aUVkaXRDb29yZGluYXRvckluZGV4fWA7XHJcbiAgICAgICAgbXVsdGlFZGl0Q29vcmRpbmF0b3JXcml0ZVF1ZXVlLnB1c2goY29vcmRpbmF0b3JOYW1lKTtcclxuICAgICAgICBzdGFiYWxpemVkID0gZmFsc2U7XHJcbiAgICAgICAgbm90aWZ5TWVjU3RhdGVDaGFuZ2VkKCk7XHJcblxyXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKFxyXG4gICAgICAgIC8vICAgICBgW01FQyBRdWV1ZV0gJHtjb29yZGluYXRvck5hbWV9IGFkZGVkYCxcclxuICAgICAgICAvLyAgICAgWy4uLm11bHRpRWRpdENvb3JkaW5hdG9yV3JpdGVRdWV1ZV1cclxuICAgICAgICAvLyApO1xyXG5cclxuICAgICAgICAvLyBJbml0aWF0ZWQgcG9sbGluZyB1bnRpbCBhc3Npc3RhbnRMYXN0TWVzc2FnZWRBdCB2YWx1ZSBjaGFuZ2VzXHJcbiAgICAgICAgLy8gdGhlbiBpbml0aWF0ZSB0aGUgY29udmVyc2F0aW9uIGpzb24gb3ZlcndyaXRlXHJcbiAgICAgICAgY29uc3QgcG9sbEZvckFzc2lzdGFudFVwZGF0ZSA9IHNldEludGVydmFsKGFzeW5jICgpID0+IHtcclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGxldCBsYXRlc3RDb252ZXJzYXRpb246IGFueTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBKc29uIGZvciBzb21lIHJlYXNvbiBoYXMgcGFyc2UgZXJyb3IgVW50ZXJtaW5hdGVkIHN0cmluZyBpbiBKU09OIGF0IHBvc2l0aW9uIDMxNDQxNzkgKGxpbmUgMTMzNDcgY29sdW1uIDE3NDQzKVxyXG4gICAgICAgICAgICAgICAgLy8gd2hpY2ggY29ycmVzcG9uZHMgdG8gdGhpcyBwYXJzZS4gSSBzdXNwZWN0IGl0IG1pZ2h0IGp1c3Qgc3RpbGwgYmUgaW4gc29tZSBsaW1ibyBzdGF0ZSBiZWluZyB3cml0dGVuIGJ5XHJcbiAgICAgICAgICAgICAgICAvLyB0aGUgYXNzaXN0YW50IHNvIHdlIHdpbGwgYXR0ZW1wdCB0byBwYXJzZSBpdCBhIGZldyBtb3JlIHRpbWVzIHRvIHNlZSBpZiBpdCB3aWxsIGdpdmUgdXMgc29tZXRoaW5nIHVzYWJsZS5cclxuICAgICAgICAgICAgICAgIC8vIHNvIHdlIGRvIG5vdCBsb3NlIHRoaXMgdHVybi4gVGhpcyBvbmUgYWxsb3dzIGZvciBjb250aW51ZWQgcG9sbGluZy5cclxuICAgICAgICAgICAgICAgIGxhdGVzdENvbnZlcnNhdGlvbiA9IGF3YWl0IHJlYWRDb252ZXJzYXRpb25XaXRoUGFyc2VSZXRyaWVzKFxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnZlcnNhdGlvbkZpbGUsXHJcbiAgICAgICAgICAgICAgICAgICAgMywgICAgICAgICAgLy8gbWF4IHBhcnNlIGF0dGVtcHRzXHJcbiAgICAgICAgICAgICAgICAgICAgMTAwLCAgICAgICAgLy8gcmV0cnkgZGVsYXlcclxuICAgICAgICAgICAgICAgICAgICBcInJldHVyblwiLCAgIC8vIGVycm9yIGhhbmRsaW5nIGFjdGlvblxyXG4gICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgICAgICBpZiAobGF0ZXN0Q29udmVyc2F0aW9uID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuOyAvLyBTa2lwIHRoaXMgcG9sbCB0aWNrOyBrZWVwIHRoZSBpbnRlcnZhbCBydW5uaW5nLlxyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIENhcHR1cmluZyB0aGUgaW5kZXggZWFjaCBNRUMgc2hvdWxkIHRhcmdldCBkdXJpbmcgdGhlaXIgb3duIGluc3RhbmNlXHJcbiAgICAgICAgICAgICAgICBjb25zdCB0YXJnZXRBc3Npc3RhbnRNZXNzYWdlSW5kZXggPSBmaW5kTGFzdEFzc2lzdGFudE1lc3NhZ2VJbmRleChsYXRlc3RDb252ZXJzYXRpb24pO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAvLyBBc3Npc3RhbnQgaGFzIGZpbmlzaGVkIHJlc3BvbmRpbmcgZm9yIHRoaXMgdHVyblxyXG4gICAgICAgICAgICAgICAgaWYgKGxhdGVzdENvbnZlcnNhdGlvbi5hc3Npc3RhbnRMYXN0TWVzc2FnZWRBdCAhPT0gb3JpZ2luYWxBc3Npc3RhbnRMYXN0TWVzc2FnZWRBdCkge1xyXG4gICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgIC8vIFByZXZlbnRzIGFzeW5jIHBvbGxzIGZyb20gcmVkZWNsYXJpbmcgdGltaW5nIGNvbmZsaWN0IHN0YXRlcyBvciBydW5uaW5nIHRoZSByZXN0IG9mIHRoZXNlIGZ1bmN0aW9ucy5cclxuICAgICAgICAgICAgICAgICAgICAvLyBPbmx5IHRoZSB3aW5uZXIgd2lsbCBwcm9jZWVkIHRocm91Z2ggc28gdGhlcmUgaXMgb25seSBvbmUgaW5zdGFuY2UuXHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKGFzc2lzdGFudFVwZGF0ZUhhbmRsZWQpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgYXNzaXN0YW50VXBkYXRlSGFuZGxlZCA9IHRydWU7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIC8vIGlmICh0YXJnZXRBc3Npc3RhbnRNZXNzYWdlSW5kZXggPT09IC0xKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gICAgIGNvbnNvbGUuZXJyb3IoXCJbTUVDXSBObyBhc3Npc3RhbnQgbWVzc2FnZSBmb3VuZCBmb3IgdGhpcyB1cGRhdGUuXCIpO1xyXG4gICAgICAgICAgICAgICAgICAgIC8vICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICBjbGVhckludGVydmFsKHBvbGxGb3JBc3Npc3RhbnRVcGRhdGUpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyBJbml0aWF0ZSBQb2xsaW5nIHVudGlsIFVTRVIgU1RPUFMgVFlQSU5HIGR1cmluZyB0aGUgMiBzZWNvbmQgd2FpdCBwZXJpb2QgdG8gZWRpdCB0aGUgY29udmVyc2F0aW9uIGZpbGUuXHJcbiAgICAgICAgICAgICAgICAgICAgdm9pZCAoYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhcIltNRUNdIENsaWVudCBpbnB1dCBzdGFiaWxpdHkgcG9sbGluZyBzdGFydGVkOlwiLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgICB0aW1lOiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIH0pO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gTmVlZCB0byBhZGQgc29tZSBleHRyYSBkZWxheSB0aW1lIGlmIHVzZXIgc3BhbXMgbWVzc2FnZXMgdGhlbiBmb2xsb3dzIGl0IHdpdGggYSBsb2FkZWQgY29tbWFuZCBtZXNzYWdlOiBzYXZlIG1lbW9yeSwgVE9NIGNvbW1hbmRzXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4dGVuZGVkRGVsYXkgPSBbLi4ubXVsdGlFZGl0Q29vcmRpbmF0b3JXcml0ZVF1ZXVlXS5sZW5ndGggPCAyO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByZXF1aXJlZFN0YWJsZUR1cmF0aW9uID0gZXh0ZW5kZWREZWxheT8gMjMwMCA6IDI2MDA7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgd2FpdEZvclN0YWJsZUNsaWVudElucHV0KFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnZlcnNhdGlvbkZpbGUsIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDEwMCwgICAgICAvLyBzdGFiaWxpdHlQb2xsSW50ZXJ2YWxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXF1aXJlZFN0YWJsZUR1cmF0aW9uLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdG9yTmFtZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNvbnNvbGUubG9nKGAke2Nvb3JkaW5hdG9yTmFtZX0gaGFzIGV4aXRlZCB0aGUgc3RhYmlsaXR5IGxvb3BgKVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRoZSBsYXN0IE1FQyBpbnN0YW5jZSB3aWxsIGV4aXQgZmlyc3QgYW5kIHByZXZpb3VzIE1FQyB3aWxsIGZvbGxvdyBhZnRlci5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgZm9yY2VzIHRoZSBNRUMgdG8gZXhlY3V0ZSBpbiBvcmRlciBvZiB3aGVuIHRoZXkgZmlyc3Qgam9pbmVkIHRoZSB3cml0ZSBxdWV1ZS5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdoaWxlIChtdWx0aUVkaXRDb29yZGluYXRvcldyaXRlUXVldWVbMF0gIT09IGNvb3JkaW5hdG9yTmFtZSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBwb2xsSW50ZXJ2YWwpKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gU25hcHNob3QgdGhlIGxhc3QgTUVDIGluIHRoZSB3cml0ZXF1ZXVlIG5vdyB0aGF0IHRoZSBjbGllbnRpbnB1dCBoYXMgc3RhYmxpemVkLlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2Ugd2lsbCB0aGVuIHVzZSB0aGlzIHRvIGtub3cgd2hlbiB0byBjcmVhdGUgdGhlIHJlYWR5IGZpbGUgZm9yIENvbnRleHQgQ2xlYW51cCBQbHVnaW4uXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBmaW5hbENvb3JkaW5hdG9yTmFtZSA9IG11bHRpRWRpdENvb3JkaW5hdG9yV3JpdGVRdWV1ZVttdWx0aUVkaXRDb29yZGluYXRvcldyaXRlUXVldWUubGVuZ3RoIC0gMV07XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gV2UndmUgc3RhYmxpemVkIGFuZCBhZGRlZCB0aGUgc3RhYmFsaXplZCBjb252ZXJzYXRpb24gZmlsZSB0byBtZW1vcnksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBXZSB3aWxsIGFwcGx5IGFsbCBvdXIgZWRpdHMgdG8gdGhlIG1lbW9yeSBjb252ZXJzYXRpb24gdG8gcGVyZm9ybSBvbmx5IGEgc2luZ2xlIHdyaXRlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBsZXQgaW5NZW1vcnlDb252ZXJzYXRpb246IGFueVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGluTWVtb3J5Q29udmVyc2F0aW9uID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gSWYgbGF0ZXN0SnNvbiBoYXMgYSBwYXJzZSBlcnJvciB0cnkgYSBjb3VwbGUgcGFyc2UgYXR0ZW1wdHMgYmVmb3JlIHdlIGNvbnNpZGVyIHRoaXMgZWRpdCB0dXJuIGxvc3RcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbk1lbW9yeUNvbnZlcnNhdGlvbiA9IGF3YWl0IHJlYWRDb252ZXJzYXRpb25XaXRoUGFyc2VSZXRyaWVzKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb252ZXJzYXRpb25GaWxlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAyLCAgICAgICAgICAvLyBtYXggcGFyc2UgYXR0ZW1wdHNcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMTAwLCAgICAgICAgLy8gcmV0cnkgZGVsYXlcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXCJ0aHJvd1wiLCAgICAvLyBlcnJvciBoYW5kbGluZyBhY3Rpb25cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBwcm90ZWN0U2F2ZU1lbW9yeVR1cm4gPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxldCBsYXN0TWVzYWdlQXBwZW5kT3BlcmF0aW9uOiBhbnk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBvcGVyYXRpb24gb2YgY29udmVyc2F0aW9uT3BlcmF0aW9ucykge1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBTYXZlIE1lbW9yeSBQYXRoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG9wZXJhdGlvbi5uYW1lID09PSBcInRyeUFwcGVuZFNhdmVNZW1vcnlUZXh0QXRFbmRPZkNvbnZlcnNhdGlvbkpzb25GdW5jdGlvblwiKSB7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0cnlBcHBlbmRTYXZlTWVtb3J5VGV4dEF0RW5kT2ZDb252ZXJzYXRpb25Kc29uRnVuY3Rpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcGVyYXRpb24ucGFyYW1zLmV4aXRSZXF1ZXN0ZWQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbk1lbW9yeUNvbnZlcnNhdGlvbixcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wZXJhdGlvbi5wYXJhbXMucGVuZGluZ1NhdmVNZW1vcnksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXRBc3Npc3RhbnRNZXNzYWdlSW5kZXgsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcGVyYXRpb24ucGFyYW1zLnNhdmVkTWVtb3J5U3RhdHVzLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvdGVjdFNhdmVNZW1vcnlUdXJuID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRhYmxlIG9mIE1lbW9yaWVzIExvb2t1cCBQYXRoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcGVyYXRpb24ubmFtZSA9PT0gXCJ0cnlBcHBlbmRUYWJsZU9mTWVtb3JpZXNDb250ZW50RnVuY3Rpb25cIiAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm90ZWN0U2F2ZU1lbW9yeVR1cm4gPT09IGZhbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRyeUFwcGVuZFRhYmxlT2ZNZW1vcmllc0NvbnRlbnRGdW5jdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluTWVtb3J5Q29udmVyc2F0aW9uLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3BlcmF0aW9uLnBhcmFtcy5jb25zdHJ1Y3RlZFRhYmxlU3RyaW5nLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0QXNzaXN0YW50TWVzc2FnZUluZGV4LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ29tcGFjdGlvbiBTdW1tYXJ5IFBhdGhcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wZXJhdGlvbi5uYW1lID09PSBcInRyeUFwcGVuZENvbXBhY3Rpb25TdW1tYXJ5RnVuY3Rpb25cIiAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm90ZWN0U2F2ZU1lbW9yeVR1cm4gPT09IGZhbHNlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRyeUFwcGVuZENvbXBhY3Rpb25TdW1tYXJ5RnVuY3Rpb24oXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbk1lbW9yeUNvbnZlcnNhdGlvbixcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wZXJhdGlvbi5wYXJhbXMuY29uc3RydWN0ZWRTdW1tYXJ5U3RyaW5nLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0QXNzaXN0YW50TWVzc2FnZUluZGV4LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gQXBwZW5kIE1lc3NhZ2UgTnVtYmVyIFBhdGhcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAob3BlcmF0aW9uLm5hbWUgPT09IFwicHJvbXB0UHJvY2Vzc29yQXBwZW5kTWVzc2FnZU51bWJlclRvTGFzdEFzc2lzdGFudE1lc3NhZ2VcIikge1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvbXB0UHJvY2Vzc29yQ29uc3RydWN0TWVzc2FnZU51bWJlclRhZyhcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluTWVtb3J5Q29udmVyc2F0aW9uLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3BlcmF0aW9uLnBhcmFtcy5hc3Npc3RhbnRJbmRleCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldEFzc2lzdGFudE1lc3NhZ2VJbmRleCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdG9yTmFtZSA9PT0gZmluYWxDb29yZGluYXRvck5hbWUgJiZcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG11bHRpRWRpdENvb3JkaW5hdG9yV3JpdGVRdWV1ZVswXSA9PT0gY29vcmRpbmF0b3JOYW1lXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGFzdE1lc2FnZUFwcGVuZE9wZXJhdGlvbiA9IG9wZXJhdGlvbjtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gKG9ubHkgcGVyZm9ybWVkIGJ5IHRoZSBsYXN0IHF1ZXVlZCBNRUMpXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb29yZGluYXRvck5hbWUgPT09IGZpbmFsQ29vcmRpbmF0b3JOYW1lICYmXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG11bHRpRWRpdENvb3JkaW5hdG9yV3JpdGVRdWV1ZVswXSA9PT0gY29vcmRpbmF0b3JOYW1lXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBPbGQgVGFibGUgb2YgTWVtb3JpZXMgUmV0cmFjdGlvbiBQYXRoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAob3BlcmF0aW9uLm5hbWUgPT09IFwidHJ5UmV0cmFjdE9sZFRvbXNGdW5jdGlvblwiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0cnlSZXRyYWN0T2xkVG9tc0Z1bmN0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluTWVtb3J5Q29udmVyc2F0aW9uLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhcmdldEFzc2lzdGFudE1lc3NhZ2VJbmRleCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcGVyYXRpb24ucGFyYW1zLnJldHJhY3RPbGRUb21zLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wZXJhdGlvbi5wYXJhbXMuZW5hYmxlVG9vbHNNb2RlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBNZW1vcnkgU2VlZHMgUGF0aFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG9wZXJhdGlvbi5uYW1lID09PSBcInRyeVJlbW92ZU1lbW9yeVNlZWRzVGltZW91dEZ1bmN0aW9uXCIpIHtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0cnlSZW1vdmVNZW1vcnlTZWVkc1RpbWVvdXRGdW5jdGlvbihcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcGVyYXRpb24ucGFyYW1zLmNsZWFudXBBbGxTZWVkcyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbk1lbW9yeUNvbnZlcnNhdGlvbixcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcGVyYXRpb24ucGFyYW1zLm1lbW9yeVNlZWRzVG9SZW1vdmUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3BlcmF0aW9uLnBhcmFtcy52YWxpZE1lbW9yeVNlZWRzU2VsZWN0ZWQsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGFibGUgb2YgQ29tcGFjdGlvbiBWaXN1YWwgVHJhaWwgUGF0aCAoTmVlZHMgdG8gcXVlcnkgdGhlIG1vZGVsIHNvIGdvZXMgbGFzdClcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChvcGVyYXRpb24ubmFtZSA9PT0gXCJ0cnlBcHBlbmRUT0NUcmFpbEZ1bmN0aW9uXCIpIHtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0cnlBcHBlbmRUT0NUcmFpbEZ1bmN0aW9uKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGluTWVtb3J5Q29udmVyc2F0aW9uLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wZXJhdGlvbi5wYXJhbXMubWF0Y2hpbmdGaWxlc0FuZE5ld0FkZGl0aW9ucyxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0YXJnZXRBc3Npc3RhbnRNZXNzYWdlSW5kZXgsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBBY3F1aXJlIGxvY2ssIGVhY2ggTUVDIGluc3RhbmNlIHdpbGwgaGF2ZSB0aGVpciBvd24gbG9jayBhbmQgcmVsZWFzZSB0aGVpciBvd24gbG9ja1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gcmVsZWFzZUxvY2sgZnVuY3Rpb24gd2lsbCB1bmxpbmsgdGhlIGxvY2sgZmlsZSBvbmNlIHRoZSBsb2NrIHF1ZXVlIGhhcyB2YWNhdGVkLlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbG9ja093bmVyTmFtZSA9IGF3YWl0IGFjcXVpcmVMb2NrKGxvY2tGaWxlLCBmdW5jdGlvbk5hbWUpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgaXMgdGhlIGxhc3QgcXVldWVkIE1FQywgY3JlYXRlIHRoZSByZWFkeWZpbGUgZm9yIENvbnRleHQgQ2xlYW51cC5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIENoZWNrcyB0aGF0IHRoZSBNRUMgbmFtZSBtYXRjaGVzIHdobyB3YXMgcmVnaXN0ZXJlZCBhcyB0aGUgbGFzdCBNRUMgaW4gdGhlIHdyaXRlIHF1ZXVlXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBUaGVuIGNoZWNrcyBpZiB0aGV5IGhhdmUgcmVhY2hlZCB0aGUgZmlyc3QgcG9zaXRpb24gb2YgdGhlIHF1ZXVlLlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvb3JkaW5hdG9yTmFtZSA9PT0gZmluYWxDb29yZGluYXRvck5hbWUgJiZcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBtdWx0aUVkaXRDb29yZGluYXRvcldyaXRlUXVldWVbMF0gPT09IGNvb3JkaW5hdG9yTmFtZVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gUmVwbGFjZSB0aGUgY29udmVyc2F0aW9uIGZpbGUgd2l0aCB0aGUgb25lIGluIG1lbW9yeSB3aGVyZSB3ZSd2ZSBhcHBsaWVkIGFsbCBNRUMgb3BlcmF0aW9ucyB0by5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBXZSB0cmlwbGUgY2hlY2sgdGhhdCB0aGUgbGFzdE1lc2FnZUFwcGVuZE9wZXJhdGlvbi5wYXJhbXMgbWVzc2FnZSBudW1iZXIgaGFzIHN0dWNrIHRvIHRoZSBhY3R1YWxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBjb252ZXJzYXRpb24gZmlsZSwgaWYgbm90IHdlIHJldHJ5IHVwIHRvIDMgdGltZXMuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgd3JpdGVWZXJpZml5V2l0aFJlYXNzdXJhbmNlKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb252ZXJzYXRpb25GaWxlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpbk1lbW9yeUNvbnZlcnNhdGlvbixcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbGFzdE1lc2FnZUFwcGVuZE9wZXJhdGlvbixcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0QXNzaXN0YW50TWVzc2FnZUluZGV4LFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRleHRDbGVhbnVwUGx1Z2luSW5Vc2UgPSBhd2FpdCBjcmVhdGVBQ29vcmRpbmF0aW9uUmVhZHlGaWxlKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb252ZXJzYXRpb24sIFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb252ZXJzYXRpb25GaWxlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjb250ZXh0Q2xlYW51cFBsdWdpbkluVXNlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldENvbnRleHRDbGVhbnVwUGx1Z2luSW5Vc2UoY29udGV4dENsZWFudXBQbHVnaW5JblVzZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1cnJlbnRDQ05hbWUgPSBnZXRDb250ZXh0Q2xlYW51cENvbnZlcnNhdGlvbk5hbWUoKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKGN1cnJlbnRDQ05hbWUgPT09IFwiXCIpIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldENvbnRleHRDbGVhbnVwQ29udmVyc2F0aW9uTmFtZShpbk1lbW9yeUNvbnZlcnNhdGlvbi5uYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaW5NZW1vcnlDb252ZXJzYXRpb24gPSBudWxsO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBpZiAoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gICAgIGNvbnRleHRDbGVhbnVwUGx1Z2luSW5Vc2UgJiYgXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gICAgIC8vIGdldENoYXRIaXN0b3J5KCkgPT09IG51bGxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyAgICAgYXdhaXQgc3RvcmVBbmRQcmVwYXJlSGlzdG9yeU1lc3NhZ2VzRm9yTW9kZWwobWVzc2FnZXMpO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIGNvbnNvbGUubG9nKFwiPT09PT09PT1QTSBDb252ZXJzYXRpb24gZmlsZSByZWFkeT09PVwiLCBEYXRlLm5vdygpKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcIm11bHRpRWRpdENvb3JkaW5hdG9yIEVycm9yIGR1cmluZyBkZWxheWVkIG1lbW9yeSBzZWVkIGNsZWFudXA6XCIsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3IsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gUmVsZWFzZSBMb2NrIGZpcnN0IHNvIHN1YnNlcXVlbnQgTUVDcyBjYW4gYWNxdWlyZSBhIG5ldyBsb2NrIHRvIHByb3RlY3QgdGhlaXIgd3JpdGUgdHVyblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxvY2tPd25lck5hbWUgIT09IHVuZGVmaW5lZCkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHJlbGVhc2VMb2NrKGxvY2tGaWxlLCBsb2NrT3duZXJOYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBsb2NrT3duZXJOYW1lID0gdW5kZWZpbmVkO1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFJlbW92ZXMgdGhpcyBNRUNfSU5TVEFOQ0UgZnJvbSB0aGUgV1JJVEUgUXVldWVcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHF1ZXVlSW5kZXggPSBtdWx0aUVkaXRDb29yZGluYXRvcldyaXRlUXVldWUuaW5kZXhPZihjb29yZGluYXRvck5hbWUpO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChxdWV1ZUluZGV4ICE9PSAtMSkge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG11bHRpRWRpdENvb3JkaW5hdG9yV3JpdGVRdWV1ZS5zcGxpY2UocXVldWVJbmRleCwgMSk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCBvcGVyYXRpb24gb2YgY29udmVyc2F0aW9uT3BlcmF0aW9ucykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEJvdGggdGFibGVzIGNhbm50IGV4aXN0IGF0IHRoZSBzYW1lIHRpbWUsIGp1c3QgYm9ycm93aW5nIHRoZSBsb2dpY1xyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIHRvIHBhc3MgdGhlIHBlbmRpbmcgbWVzc2FnZSB0byB0aGUgYXNzaXN0YW50LlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3BlcmF0aW9uLm5hbWUgPT09IFwidHJ5QXBwZW5kVGFibGVPZk1lbW9yaWVzQ29udGVudEZ1bmN0aW9uXCIgfHxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3BlcmF0aW9uLm5hbWUgPT09IFwidHJ5QXBwZW5kQ29tcGFjdGlvblN1bW1hcnlGdW5jdGlvblwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNldFBlbmRpbmdUb21Db21tYW5kKFwibnVsbFwiKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG9wZXJhdGlvbi5uYW1lID09PSBcInRyeUFwcGVuZFNhdmVNZW1vcnlUZXh0QXRFbmRPZkNvbnZlcnNhdGlvbkpzb25GdW5jdGlvblwiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEJyZWFrIHRoZSBjeWNsZSwgRXhpdCBtZW1vcnkgc2F2ZSBzdGF0ZSBieSByZXNldHRpbmcgdG8gZGVmYXVsdHNcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYob3BlcmF0aW9uLnBhcmFtcy5leGl0UmVxdWVzdGVkID09PSB0cnVlKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXNldFBlbmRpbmdTYXZlTWVtb3J5KCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbm90aWZ5TWVjU3RhdGVDaGFuZ2VkKCk7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgICBgW01FQyBRdWV1ZV0gJHtjb29yZGluYXRvck5hbWV9IGZpbmlzaGVkYCxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vICAgICBbLi4ubXVsdGlFZGl0Q29vcmRpbmF0b3JXcml0ZVF1ZXVlXVxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIH0pKCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcblxyXG4gICAgICAgICAgICAgICAgY2xlYXJJbnRlcnZhbChwb2xsRm9yQXNzaXN0YW50VXBkYXRlKTtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFxyXG4gICAgICAgICAgICAgICAgICAgIFwibXVsdGlFZGl0Q29vcmRpbmF0b3IgRXJyb3IgcG9sbGluZyBmb3IgYXNzaXN0YW50IHVwZGF0ZTpcIixcclxuICAgICAgICAgICAgICAgICAgICBlcnJvcixcclxuICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgICAgICBpZiAobG9ja093bmVyTmFtZSAhPT0gdW5kZWZpbmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHJlbGVhc2VMb2NrKGxvY2tGaWxlLCBsb2NrT3duZXJOYW1lKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgbG9ja093bmVyTmFtZSA9IHVuZGVmaW5lZDtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgfSBjYXRjaCAocmVsZWFzZUVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcclxuICAgICAgICAgICAgICAgICAgICAgICAgXCJtdWx0aUVkaXRDb29yZGluYXRvciBFcnJvciByZWxlYXNpbmcgbG9jayBhZnRlciBwb2xsaW5nIGZhaWx1cmU6XCIsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlbGVhc2VFcnJvcixcclxuICAgICAgICAgICAgICAgICAgICApO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSwgcG9sbEludGVydmFsKTtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG5cclxuICAgICAgICBjb25zdCBmc0Vycm9yID0gZXJyb3IgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uO1xyXG5cclxuICAgICAgICBpZiAoZnNFcnJvci5jb2RlID09PSBcIkVJU0RJUlwiKSB7XHJcbiAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBcclxuICAgICAgICAgICAgICAgIFRoaXMgaXMgYSBrbm93biB1bnJlc29sdmFibGUgZXJyb3IuIFNjYW5zIHB1bGxlZCBpbiBhbiBlbXB0eSBzdHJpbmcgYXMgdGhlIGNvbnZlcnNhdGlvbiBmaWxlIG5hbWUuIFxyXG4gICAgICAgICAgICBgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgbXVsdGlFZGl0Q29vcmRpbmF0b3IgRXJyb3I6ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xyXG4gICAgfVxyXG59XHJcblxyXG4vLyBSZXR1cm5pbmcgYSBib29sZWFuIGluZGljYXRpbmcgd2hldGhlciB0aGUgY29udGV4dCBjbGVhbnVwIHBsdWdpbiBpcyBiZWluZyB1c2VkXHJcbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUFDb29yZGluYXRpb25SZWFkeUZpbGUoXHJcbiAgICBjb252ZXJzYXRpb246IGFueSxcclxuICAgIGNvbnZlcnNhdGlvbkZpbGU6IHN0cmluZyxcclxuKTogUHJvbWlzZTxib29sZWFuPiB7XHJcbiAgICBjb25zdCBlbmFibGVkUGx1Z2luc0FycmF5ID0gY29udmVyc2F0aW9uLnBsdWdpbnM7XHJcblxyXG4gICAgY29uc3QgaGFzQ29udGV4dENsZWFudXAgPSBlbmFibGVkUGx1Z2luc0FycmF5LnNvbWUoXHJcbiAgICAgICAgKHBsdWdpbjogc3RyaW5nKSA9PiBwbHVnaW4uaW5jbHVkZXMoXCJjb250ZXh0LWNsZWFudXBcIiksXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IHJlYWR5RmlsZSA9IGAke2NvbnZlcnNhdGlvbkZpbGV9LnBlcnNpc3RpbmctbWVtb3JpZXMtZmluYWwtd3JpdGUucmVhZHlgO1xyXG5cclxuICAgIGlmIChoYXNDb250ZXh0Q2xlYW51cCkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGhhbmRsZSA9IGF3YWl0IG9wZW4ocmVhZHlGaWxlLCBcInd4XCIpO1xyXG4gICAgICAgICAgICBhd2FpdCBoYW5kbGUuY2xvc2UoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIGNvbnNvbGUubG9nKFxyXG4gICAgICAgICAgICAvLyAgICAgXCI9PT09PSBQTSBmaW5hbC13cml0ZSByZWFkeSBmaWxlIGNyZWF0ZWQgPT09PT1cIixcclxuICAgICAgICAgICAgLy8gICAgIHJlYWR5RmlsZSxcclxuICAgICAgICAgICAgLy8gICAgIERhdGUubm93KClcclxuICAgICAgICAgICAgLy8gKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zdCBmc0Vycm9yID0gZXJyb3IgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uO1xyXG5cclxuICAgICAgICAgICAgaWYgKGZzRXJyb3IuY29kZSAhPT0gXCJFRVhJU1RcIikge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGF3YWl0IHVubGluayhyZWFkeUZpbGUpO1xyXG5cclxuICAgICAgICAgICAgLy8gY29uc29sZS5sb2coXHJcbiAgICAgICAgICAgIC8vICAgICBcIj09PT09IHN0YWxlIFBNIGZpbmFsLXdyaXRlIHJlYWR5IGZpbGUgcmVtb3ZlZCA9PT09PVwiLFxyXG4gICAgICAgICAgICAvLyAgICAgcmVhZHlGaWxlLFxyXG4gICAgICAgICAgICAvLyAgICAgRGF0ZS5ub3coKVxyXG4gICAgICAgICAgICAvLyApO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgaGFuZGxlID0gYXdhaXQgb3BlbihyZWFkeUZpbGUsIFwid3hcIik7XHJcbiAgICAgICAgICAgIGF3YWl0IGhhbmRsZS5jbG9zZSgpO1xyXG5cclxuICAgICAgICAgICAgLy8gY29uc29sZS5sb2coXHJcbiAgICAgICAgICAgIC8vICAgICBcIj09PT09IFBNIGZpbmFsLXdyaXRlIHJlYWR5IGZpbGUgcmVjcmVhdGVkID09PT09XCIsXHJcbiAgICAgICAgICAgIC8vICAgICByZWFkeUZpbGUsXHJcbiAgICAgICAgICAgIC8vICAgICBEYXRlLm5vdygpXHJcbiAgICAgICAgICAgIC8vICk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgXHJcbiAgICByZXR1cm4gaGFzQ29udGV4dENsZWFudXA7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBBbGxvd3MgcmV0dXJuIHRvIG1haW4gcHJvbXB0IHByZXByb2Nlc3NvciBmdW5jdGlvbiB3aXRob3V0IHRocm93aW5nXHJcbiAqIFBlcmZvcm1zIG9uZSBmdWxsIGRpcmVjdG9yeSBzY2FuIHRvIHRyeSBhbmQgcmVjb3ZlciB0aGlzIGF0dGVtcHQgZm9yIGEgdW5rbm93biBDRk5cclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIHJlYWRDb252ZXJzYXRpb25XaXRoUmVjb3ZlcnkoXHJcbiAgICBjb252ZXJzYXRpb25EaXJlY3Rvcnk6IHN0cmluZyxcclxuICAgIGNvbnZlcnNhdGlvbkZpbGVOYW1lMjogc3RyaW5nLFxyXG4gICAgcm9vdERpcmVjdG9yeTogc3RyaW5nLFxyXG4gICAgdXNlclRleHQ6IHN0cmluZyxcclxuKTogUHJvbWlzZTxhbnkgfCBudWxsPiB7XHJcbiAgICBjb25zdCByZWFkQ29udmVyc2F0aW9uID0gYXN5bmMgKGZpbGVOYW1lOiBzdHJpbmcpID0+IHtcclxuICAgICAgICBjb25zdCBmaWxlUGF0aCA9IGpvaW4oY29udmVyc2F0aW9uRGlyZWN0b3J5LCBmaWxlTmFtZSk7XHJcblxyXG4gICAgICAgIHJldHVybiByZWFkQ29udmVyc2F0aW9uV2l0aFBhcnNlUmV0cmllcyhcclxuICAgICAgICAgICAgZmlsZVBhdGgsXHJcbiAgICAgICAgICAgIDIsXHJcbiAgICAgICAgICAgIDIwMCxcclxuICAgICAgICAgICAgXCJ0aHJvd1wiLFxyXG4gICAgICAgICk7XHJcbiAgICB9O1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgICAgcmV0dXJuIGF3YWl0IHJlYWRDb252ZXJzYXRpb24oY29udmVyc2F0aW9uRmlsZU5hbWUyKTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc3QgZnNFcnJvciA9IGVycm9yIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcclxuXHJcbiAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICBmc0Vycm9yLmNvZGUgIT09IFwiRUlTRElSXCIgJiZcclxuICAgICAgICAgICAgIShlcnJvciBpbnN0YW5jZW9mIFN5bnRheEVycm9yKVxyXG4gICAgICAgICkge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIHJlYWQgY29udmVyc2F0aW9uIGZpbGU6XCIsIGVycm9yKTtcclxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zb2xlLndhcm4oXHJcbiAgICAgICAgICAgIFwiT3JpZ2luYWwgY29udmVyc2F0aW9uIHJlYWQgZmFpbGVkOyBhdHRlbXB0aW5nIGZ1bGwtZGlyZWN0b3J5IHJlY292ZXJ5OlwiLFxyXG4gICAgICAgICAgICBlcnJvcixcclxuICAgICAgICApO1xyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xyXG4gICAgICAgIHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2NhbkZvckNvbnZlcnNhdGlvbkZpbGVUaHJ1RnVsbENvbnZlcnNhdGlvbkRpcmVjdG9yeVNjYW4oXHJcbiAgICAgICAgICAgICAgICAgICAgcm9vdERpcmVjdG9yeSxcclxuICAgICAgICAgICAgICAgICAgICB1c2VyVGV4dCxcclxuICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgY29uc3QgcmVjb3ZlcmVkRmlsZU5hbWUgPSBnZXRDb252ZXJzYXRpb25GaWxlTmFtZSgpO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmICghcmVjb3ZlcmVkRmlsZU5hbWU/LnRyaW0oKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFwiVW5hYmxlIHRvIHJlY292ZXIgY29udmVyc2F0aW9uIGZpbGU6IGZpbGVuYW1lIGlzIGVtcHR5LlwiLFxyXG4gICAgICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVzb2x2ZShudWxsKTtcclxuICAgICAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgcmVzb2x2ZShhd2FpdCByZWFkQ29udmVyc2F0aW9uKHJlY292ZXJlZEZpbGVOYW1lKSk7XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFxyXG4gICAgICAgICAgICAgICAgICAgIFwiRmFpbGVkIHRvIHJlY292ZXIgb3IgcmVhZCBjb252ZXJzYXRpb24gZmlsZTpcIixcclxuICAgICAgICAgICAgICAgICAgICBlcnJvcixcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICByZXNvbHZlKG51bGwpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSwgMjAwKTtcclxuICAgIH0pO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiB3YWl0Rm9yU3RhYmxlQ2xpZW50SW5wdXQoXHJcbiAgICBjb252ZXJzYXRpb25GaWxlOiBzdHJpbmcsXHJcbiAgICBzdGFiaWxpdHlQb2xsSW50ZXJ2YWw6IG51bWJlcixcclxuICAgIHJlcXVpcmVkU3RhYmxlRHVyYXRpb246IG51bWJlcixcclxuICAgIGNvb3JkaW5hdG9yTmFtZTogc3RyaW5nLFxyXG4pOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuICAgIGxldCBwcmV2aW91c0NsaWVudElucHV0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XHJcbiAgICBsZXQgc3RhYmxlU2luY2U6IG51bWJlciB8IG51bGwgPSBudWxsO1xyXG5cclxuICAgIHdoaWxlICh0cnVlKSB7XHJcbiAgICAgICAgaWYgKHN0YWJhbGl6ZWQpIHtcclxuICAgICAgICAgICAgLy8gY29uc29sZS5sb2coXHJcbiAgICAgICAgICAgIC8vICAgICBgW01FQyAke2Nvb3JkaW5hdG9yTmFtZX1dIFNoYXJlZCBzdGFiaWxpdHkgZmxhZyBpcyBUUlVFYCxcclxuICAgICAgICAgICAgLy8gKTtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBzdGF0ZUNoYW5nZVByb21pc2UgPSBtZWNTdGF0ZUNoYW5nZWQ7XHJcblxyXG4gICAgICAgIGNvbnN0IGZpbmFsQ29vcmRpbmF0b3JOYW1lID1cclxuICAgICAgICAgICAgbXVsdGlFZGl0Q29vcmRpbmF0b3JXcml0ZVF1ZXVlW1xyXG4gICAgICAgICAgICAgICAgbXVsdGlFZGl0Q29vcmRpbmF0b3JXcml0ZVF1ZXVlLmxlbmd0aCAtIDFcclxuICAgICAgICAgICAgXTtcclxuXHJcbiAgICAgICAgLy8gT25seSB0aGUgbGFzdCBNRUMgcG9sbHMgdGhlIGNvbnZlcnNhdGlvbiBmaWxlLlxyXG4gICAgICAgIC8vIEFsbCBvdGhlciBNRUNzIHdhaXQgZm9yIHRoZSBzaGFyZWQgc3RhYmlsaXR5IGZsYWcuXHJcbiAgICAgICAgaWYgKGNvb3JkaW5hdG9yTmFtZSAhPT0gZmluYWxDb29yZGluYXRvck5hbWUpIHtcclxuICAgICAgICAgICAgLy8gU2xlZXAgdW50aWwgdGhlIHF1ZXVlIGNoYW5nZXMgb3Igc3RhYmlsaXR5IGlzIGRlY2xhcmVkLlxyXG4gICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhgW01FQyAke2Nvb3JkaW5hdG9yTmFtZX1dIFdlbnQgdG8gc2xlZXBgKVxyXG4gICAgICAgICAgICBhd2FpdCBzdGF0ZUNoYW5nZVByb21pc2U7XHJcbiAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgbGV0IHN0YWJpbGl0eUNvbnZlcnNhdGlvbjogeyBjbGllbnRJbnB1dD86IHN0cmluZyB9O1xyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBzdGFiaWxpdHlKc29uID0gYXdhaXQgcmVhZEZpbGUoXHJcbiAgICAgICAgICAgICAgICBjb252ZXJzYXRpb25GaWxlLFxyXG4gICAgICAgICAgICAgICAgXCJ1dGYtOFwiLFxyXG4gICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgc3RhYmlsaXR5Q29udmVyc2F0aW9uID0gSlNPTi5wYXJzZShzdGFiaWxpdHlKc29uKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBpZiAoZXJyb3IgaW5zdGFuY2VvZiBTeW50YXhFcnJvcikge1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PlxyXG4gICAgICAgICAgICAgICAgICAgIHNldFRpbWVvdXQocmVzb2x2ZSwgc3RhYmlsaXR5UG9sbEludGVydmFsKSxcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgaWYgKHN0YWJhbGl6ZWQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBjdXJyZW50Q2xpZW50SW5wdXQgPSBzdGFiaWxpdHlDb252ZXJzYXRpb24uY2xpZW50SW5wdXQ7XHJcbiAgICAgICAgY29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcclxuXHJcbiAgICAgICAgaWYgKHN0YWJsZVNpbmNlID09PSBudWxsKSB7XHJcbiAgICAgICAgICAgIHByZXZpb3VzQ2xpZW50SW5wdXQgPSBjdXJyZW50Q2xpZW50SW5wdXQ7XHJcbiAgICAgICAgICAgIHN0YWJsZVNpbmNlID0gbm93O1xyXG4gICAgICAgIH0gZWxzZSBpZiAoY3VycmVudENsaWVudElucHV0ICE9PSBwcmV2aW91c0NsaWVudElucHV0KSB7XHJcbiAgICAgICAgICAgIHByZXZpb3VzQ2xpZW50SW5wdXQgPSBjdXJyZW50Q2xpZW50SW5wdXQ7XHJcbiAgICAgICAgICAgIHN0YWJsZVNpbmNlID0gbm93O1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgaW5wdXRJc1N0YWJsZSA9XHJcbiAgICAgICAgICAgIG5vdyAtIHN0YWJsZVNpbmNlID49IHJlcXVpcmVkU3RhYmxlRHVyYXRpb247XHJcblxyXG4gICAgICAgIC8vIGNvbnNvbGUubG9nKGBbTUVDICR7Y29vcmRpbmF0b3JOYW1lfV0gU3RhYmlsaXR5IGNoZWNrYCwge1xyXG4gICAgICAgIC8vICAgICBzdGFiYWxpemVkLFxyXG4gICAgICAgIC8vICAgICBpbnB1dElzU3RhYmxlLFxyXG4gICAgICAgIC8vICAgICBmaW5hbENvb3JkaW5hdG9yTmFtZSxcclxuICAgICAgICAvLyAgICAgc3RhYmxlRHVyYXRpb246IG5vdyAtIHN0YWJsZVNpbmNlLFxyXG4gICAgICAgIC8vICAgICByZXF1aXJlZFN0YWJsZUR1cmF0aW9uLFxyXG4gICAgICAgIC8vIH0pO1xyXG5cclxuICAgICAgICBpZiAoaW5wdXRJc1N0YWJsZSkge1xyXG4gICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhcclxuICAgICAgICAgICAgLy8gICAgIGBbTUVDICR7Y29vcmRpbmF0b3JOYW1lfV0gRGVjbGFyaW5nIHN0YWJpbGl0eWAsXHJcbiAgICAgICAgICAgIC8vICk7XHJcblxyXG4gICAgICAgICAgICBzdGFiYWxpemVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgbm90aWZ5TWVjU3RhdGVDaGFuZ2VkKCk7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PlxyXG4gICAgICAgICAgICBzZXRUaW1lb3V0KHJlc29sdmUsIHN0YWJpbGl0eVBvbGxJbnRlcnZhbCksXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJlYWRGaWxlV2l0aFJldHJpZXMoXHJcbiAgICBmaWxlUGF0aDogc3RyaW5nLFxyXG4gICAgbWF4QXR0ZW1wdHM6IG51bWJlcixcclxuICAgIHJldHJ5RGVsYXk6IG51bWJlcixcclxuKTogUHJvbWlzZTxzdHJpbmc+IHtcclxuICAgIGxldCBhdHRlbXB0cyA9IDA7XHJcblxyXG4gICAgd2hpbGUgKHRydWUpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICByZXR1cm4gYXdhaXQgcmVhZEZpbGUoZmlsZVBhdGgsIFwidXRmLThcIik7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgYXR0ZW1wdHMrKztcclxuXHJcbiAgICAgICAgICAgIGlmIChhdHRlbXB0cyA+PSBtYXhBdHRlbXB0cykge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcInJlYWRGaWxlV2l0aFJldHJpZXMgZXJyb3IgZHVyaW5nIHJlYWQgb2Y6XCIsIGZpbGVQYXRoKTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PlxyXG4gICAgICAgICAgICAgICAgc2V0VGltZW91dChyZXNvbHZlLCByZXRyeURlbGF5KSxcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn1cclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZWFkQ29udmVyc2F0aW9uV2l0aFBhcnNlUmV0cmllcyhcclxuICAgIGNvbnZlcnNhdGlvbkZpbGU6IHN0cmluZyxcclxuICAgIG1heFBhcnNlQXR0ZW1wdHM6IG51bWJlcixcclxuICAgIHJldHJ5RGVsYXk6IG51bWJlcixcclxuICAgIG9uUGFyc2VGYWlsdXJlOiBcInJldHVyblwiIHwgXCJ0aHJvd1wiID0gXCJ0aHJvd1wiLFxyXG4pOiBQcm9taXNlPGFueSB8IG51bGw+IHtcclxuICAgIGxldCBwYXJzZUF0dGVtcHRzID0gMDtcclxuXHJcbiAgICB3aGlsZSAodHJ1ZSkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGxhdGVzdEpzb24gPSBhd2FpdCByZWFkRmlsZShcclxuICAgICAgICAgICAgICAgIGNvbnZlcnNhdGlvbkZpbGUsXHJcbiAgICAgICAgICAgICAgICBcInV0Zi04XCIsXHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShsYXRlc3RKc29uKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBpZiAoIShlcnJvciBpbnN0YW5jZW9mIFN5bnRheEVycm9yKSkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHBhcnNlQXR0ZW1wdHMrKztcclxuXHJcbiAgICAgICAgICAgIGlmIChwYXJzZUF0dGVtcHRzID49IG1heFBhcnNlQXR0ZW1wdHMpIHtcclxuICAgICAgICAgICAgICAgIGlmIChvblBhcnNlRmFpbHVyZSA9PT0gXCJyZXR1cm5cIikge1xyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBudWxsO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIHRocm93IGVycm9yO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+XHJcbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KHJlc29sdmUsIHJldHJ5RGVsYXkpLFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZmluZExhc3RBc3Npc3RhbnRNZXNzYWdlSW5kZXgoY29udmVyc2F0aW9uOiBhbnkpOiBudW1iZXIge1xyXG4gICAgZm9yIChsZXQgaSA9IGNvbnZlcnNhdGlvbi5tZXNzYWdlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xyXG4gICAgICAgIGNvbnN0IG1lc3NhZ2UgPSBjb252ZXJzYXRpb24ubWVzc2FnZXNbaV07XHJcbiAgICAgICAgY29uc3Qgc2VsZWN0ZWRWZXJzaW9uID1cclxuICAgICAgICAgICAgbWVzc2FnZS52ZXJzaW9ucz8uW21lc3NhZ2UuY3VycmVudGx5U2VsZWN0ZWQgPz8gMF07XHJcblxyXG4gICAgICAgIGlmIChzZWxlY3RlZFZlcnNpb24/LnJvbGUgPT09IFwiYXNzaXN0YW50XCIpIHtcclxuICAgICAgICAgICAgcmV0dXJuIGk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiAtMTtcclxufVxyXG5cclxuZnVuY3Rpb24gbm90aWZ5TWVjU3RhdGVDaGFuZ2VkKCk6IHZvaWQge1xyXG4gICAgY29uc3QgcmVzb2x2ZSA9IHJlc29sdmVNZWNTdGF0ZUNoYW5nZTtcclxuXHJcbiAgICAvLyBDcmVhdGUgdGhlIG5leHQgbm90aWZpY2F0aW9uIGJlZm9yZSB3YWtpbmcgY3VycmVudCB3YWl0ZXJzLlxyXG4gICAgbWVjU3RhdGVDaGFuZ2VkID0gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmVOZXh0KSA9PiB7XHJcbiAgICAgICAgcmVzb2x2ZU1lY1N0YXRlQ2hhbmdlID0gcmVzb2x2ZU5leHQ7XHJcbiAgICB9KTtcclxuXHJcbiAgICByZXNvbHZlPy4oKTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gd3JpdGVWZXJpZml5V2l0aFJlYXNzdXJhbmNlKFxyXG4gICAgY29udmVyc2F0aW9uRmlsZTogc3RyaW5nLFxyXG4gICAgaW5NZW1vcnlDb252ZXJzYXRpb246IGFueSxcclxuICAgIG9wZXJhdGlvbjogYW55LFxyXG4gICAgdGFyZ2V0QXNzaXN0YW50TWVzc2FnZUluZGV4OiBudW1iZXIsXHJcbik6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgY29uc3QgbWF4QXR0ZW1wdHMgPSAzO1xyXG4gICAgY29uc3QgZXhwZWN0ZWRNZXNzYWdlTnVtYmVyID0gb3BlcmF0aW9uLnBhcmFtcy5hc3Npc3RhbnRJbmRleDtcclxuXHJcbiAgICBmb3IgKGxldCBhdHRlbXB0ID0gMTsgYXR0ZW1wdCA8PSBtYXhBdHRlbXB0czsgYXR0ZW1wdCsrKSB7XHJcbiAgICAgICAgYXdhaXQgd3JpdGVGaWxlKFxyXG4gICAgICAgICAgICBjb252ZXJzYXRpb25GaWxlLFxyXG4gICAgICAgICAgICBKU09OLnN0cmluZ2lmeShpbk1lbW9yeUNvbnZlcnNhdGlvbiwgbnVsbCwgMiksXHJcbiAgICAgICAgICAgIFwidXRmLThcIixcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBjb25zdCB3cml0dGVuQ29udGVudCA9IGF3YWl0IHJlYWRGaWxlKGNvbnZlcnNhdGlvbkZpbGUsIFwidXRmLThcIik7XHJcbiAgICAgICAgY29uc3Qgd3JpdHRlbkNvbnZlcnNhdGlvbiA9IEpTT04ucGFyc2Uod3JpdHRlbkNvbnRlbnQpO1xyXG5cclxuICAgICAgICBjb25zdCB0YXJnZXRNZXNzYWdlID0gd3JpdHRlbkNvbnZlcnNhdGlvbi5tZXNzYWdlcz8uW3RhcmdldEFzc2lzdGFudE1lc3NhZ2VJbmRleF07XHJcblxyXG4gICAgICAgIGNvbnN0IHNlbGVjdGVkVmVyc2lvbiA9XHJcbiAgICAgICAgICAgIHRhcmdldE1lc3NhZ2U/LnZlcnNpb25zPy5bXHJcbiAgICAgICAgICAgICAgICB0YXJnZXRNZXNzYWdlLmN1cnJlbnRseVNlbGVjdGVkID8/IDBcclxuICAgICAgICAgICAgXTtcclxuICAgICAgICBcclxuICAgICAgICBjb25zdCBoYXNFeHBlY3RlZE1lc3NhZ2VOdW1iZXIgPVxyXG4gICAgICAgICAgICBzZWxlY3RlZFZlcnNpb24/LnJvbGUgPT09IFwiYXNzaXN0YW50XCIgJiZcclxuICAgICAgICAgICAgc2VsZWN0ZWRWZXJzaW9uPy5zdGVwcz8uc29tZSgoc3RlcDogYW55KSA9PlxyXG4gICAgICAgICAgICAgICAgc3RlcC5jb250ZW50Py5zb21lKFxyXG4gICAgICAgICAgICAgICAgICAgIChibG9jazogYW55KSA9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlb2YgYmxvY2sudGV4dCA9PT0gXCJzdHJpbmdcIiAmJlxyXG4gICAgICAgICAgICAgICAgICAgICAgICBibG9jay50ZXh0LmluY2x1ZGVzKGAqKiptZXNzYWdlICR7ZXhwZWN0ZWRNZXNzYWdlTnVtYmVyfSoqKmApLFxyXG4gICAgICAgICAgICAgICAgKSxcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICAvLyBjb25zb2xlLmxvZyhcclxuICAgICAgICAgICAgLy8gYD09PT09PT09PT13cml0ZSBhdHRlbXB0OiAke2F0dGVtcHR9LCBcclxuICAgICAgICAgICAgLy8gZXhjcGVjdGVkIG1lc3NhZ2UgIyAke2V4cGVjdGVkTWVzc2FnZU51bWJlcn0sIFxyXG4gICAgICAgICAgICAvLyBoYXMgZXhwZWN0ZWQgIzogJHtoYXNFeHBlY3RlZE1lc3NhZ2VOdW1iZXJ9YCxcclxuICAgICAgICAvLyApXHJcbiAgICAgICAgaWYgKGhhc0V4cGVjdGVkTWVzc2FnZU51bWJlcikge1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG4gICAgICAgIFxyXG4gICAgICAgIGlmIChhdHRlbXB0ID09PSBtYXhBdHRlbXB0cykge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFxyXG4gICAgICAgICAgICAgICAgYFdyaXRlIHZlcmlmaWNhdGlvbiBmYWlsZWQgYWZ0ZXIgJHttYXhBdHRlbXB0c30gYXR0ZW1wdHM6IGAgK1xyXG4gICAgICAgICAgICAgICAgYGFzc2lzdGFudCBtZXNzYWdlIGF0IGluZGV4ICR7dGFyZ2V0QXNzaXN0YW50TWVzc2FnZUluZGV4fSBgICtcclxuICAgICAgICAgICAgICAgIGBkb2VzIG5vdCBjb250YWluIHRoZSBleHBlY3RlZCBtZXNzYWdlIG51bWJlciAke2V4cGVjdGVkTWVzc2FnZU51bWJlcn0uYCxcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn0iLCAiaW1wb3J0IHsgc2V0Q3VycmVudENvbnZlcnNhdGlvbkhpc3RvcnksIGdldEN1cnJlbnRDb252ZXJzYXRpb25IaXN0b3J5IH0gZnJvbSBcIi4vY29udmVyc2F0aW9uSGlzdG9yeUNhY2hlXCI7XHJcbmltcG9ydCB7IGdldE1lbW9yeVNlZWRzUG9vbCwgdXBkYXRlTWVtb3J5U2VlZHNTZWxlY3RlZCwgYWRkTWVtb3J5U2VlZFRvU2VsZWN0ZWQsIGdldE1lbW9yeVNlZWRzU2VsZWN0ZWQgfSBmcm9tIFwiLi9tZW1vcnlTZXNzaW9uXCI7XHJcbmltcG9ydCB7IGFjcXVpcmVMb2NrLCByZWxlYXNlTG9jayB9IGZyb20gXCIuL2FjcXVpcmVMb2NrRmlsZVwiO1xyXG5pbXBvcnQgeyBpc0VsaWdpYmxlQXNzaXN0YW50TWVzc2FnZSB9IGZyb20gXCIuL2NvbnZlcnNhdGlvblJlYWRlclwiO1xyXG5pbXBvcnQgeyBtZW1vcnlTdG9yZSB9IGZyb20gXCIuL21lbW9yeVN0b3JlXCI7XHJcbmltcG9ydCB7IHJlbW92ZU1lbW9yeVNlZWRzIH0gZnJvbSBcIi4vcmVtb3ZlTWVtb3J5U2VlZHNcIjtcclxuaW1wb3J0IHsgam9pbiwgYmFzZW5hbWUsIHJlbGF0aXZlIH0gZnJvbSBcIm5vZGU6cGF0aFwiO1xyXG5pbXBvcnQgeyBwcm9jZXNzTWVzc2FnZUZvclNhdmVNZW1vcnkgfSBmcm9tIFwiLi90cmlnZ2VyU2F2ZU1lbW9yeVwiXHJcbmltcG9ydCB7IG11bHRpRWRpdENvb3JkaW5hdG9yLCByZWFkRmlsZVdpdGhSZXRyaWVzIH0gZnJvbSBcIi4vbXVsdGlFZGl0Q29vcmRpbmF0b3JcIjtcclxuaW1wb3J0IHsgcHJvY2Vzc01lc3NhZ2VGb3JUb20sIHRhYmxlT2ZNZW1vcmllc01haW4gfSBmcm9tIFwiLi90YWJsZU9mTWVtb3JpZXNcIlxyXG5pbXBvcnQgcGF0aCBmcm9tIFwibm9kZTpwYXRoXCI7XHJcblxyXG5pbXBvcnQge1xyXG4gICAgYWRkQ29udmVyc2F0aW9uT3BlcmF0aW9uLFxyXG4gICAgZ2V0UGVuZGluZ1NhdmVNZW1vcnksXHJcbiAgICBzZXRDb250cm9sbGVyLFxyXG4gICAgZ2V0Q29udHJvbGxlcixcclxuICAgIGNvbmZpZ1NjaGVtYXRpY3MsXHJcbiAgICBzZXRDb25maWdTY2hlbWF0aWNzLFxyXG4gICAgZ2V0SW50ZXJuYWxDaGF0SUQsXHJcbiAgICBzZXRJbnRlcm5hbENoYXRJRCxcclxuICAgIGdldENvbnZlcnNhdGlvbkZpbGVOYW1lLFxyXG4gICAgc2V0Q29udmVyc2F0aW9uRmlsZU5hbWUsXHJcbiAgICBnZXRQZW5kaW5nVG9tQ29tbWFuZCxcclxuICAgIGdldFZhbGlkYXRlZExNU1Jvb3REaXJlY3RvcnksXHJcbiAgICBnZXRWYWxpZGF0ZWRNZW1vcmllc1Jvb3REaXJlY3RvcnksXHJcbn0gZnJvbSBcIi4vY29uZmlnXCI7XHJcblxyXG5pbXBvcnQgeyBcclxuICAgIHJlYWRGaWxlLFxyXG4gICAgd3JpdGVGaWxlLFxyXG4gICAgcmVhZGRpcixcclxuICAgIHN0YXQsXHJcbn0gZnJvbSBcIm5vZGU6ZnMvcHJvbWlzZXNcIjtcclxuXHJcbmltcG9ydCB0eXBlIHtcclxuICAgIENoYXRNZXNzYWdlLFxyXG4gICAgUHJvbXB0UHJlcHJvY2Vzc29yQ29udHJvbGxlcixcclxufSBmcm9tIFwiQGxtc3R1ZGlvL3Nka1wiO1xyXG5pbXBvcnQgeyBwcm9jZXNzTWVzc2FnZUZvckNvbXBhY3Rpb25TdW1tYXJ5LCB0YWJsZU9mQ29tcGFjdGlvbnNNYWluIH0gZnJvbSBcIi4vdGFibGVPZkNvbXBhY3Rpb25zXCI7XHJcblxyXG5sZXQgaW5qZWN0ZWRNZW1vcnlTZWVkczogc3RyaW5nW10gfCBudWxsID0gbnVsbDtcclxubGV0IGNsZWFudXBBbGxTZWVkczogYm9vbGVhbjtcclxuY29uc3QgcmVsYXRpb25zaGlwc0xpbWl0ID0gMTU7XHJcblxyXG4vKipcclxuKiBodHRwczovL2dpdGh1Yi5jb20vYW5oLXZ1ZGluaFxyXG4qIE1haW4gZnVuY3Rpb24gdGhhdCBkaXJlY3RzIHRoZSBmbG93IG9mIHRoZSBwbHVnaW5cclxuKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHByb21wdFByZXByb2Nlc3NvcihcclxuICAgIGN0bDogUHJvbXB0UHJlcHJvY2Vzc29yQ29udHJvbGxlcixcclxuICAgIHVzZXJNZXNzYWdlOiBDaGF0TWVzc2FnZSxcclxuKTogUHJvbWlzZTxzdHJpbmcgfCBDaGF0TWVzc2FnZT4ge1xyXG5cclxuICAgIC8vIEVzdGFibGlzaCBkaXJlY3Rvcmllc1xyXG4gICAgY29uc3QgbG1TdHVkaW9Sb290RGlyZWN0b3J5ID0gZ2V0VmFsaWRhdGVkTE1TUm9vdERpcmVjdG9yeSgpO1xyXG4gICAgY29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IGN0bC5nZXRXb3JraW5nRGlyZWN0b3J5KCk7XHJcblxyXG4gICAgLy8gRXN0YWJsaXNoIGluaXRpYWwgdmFyaWFibGUgdmFsdWVzXHJcbiAgICBjb25zdCBjb25maWcgPSBjdGwuZ2V0UGx1Z2luQ29uZmlnKGNvbmZpZ1NjaGVtYXRpY3MpO1xyXG4gICAgY29uc3QgbWVtb3J5U2VlZHNQb29sID0gZ2V0TWVtb3J5U2VlZHNQb29sKCk7XHJcbiAgICBjb25zdCBtZW1vcnlTZWVkc1NlbGVjdGVkID0gY29uZmlnLmdldChcIm1lbW9yeVNlZWRzU2VsZWN0ZWRcIikgYXMgc3RyaW5nW107XHJcbiAgICBjb25zdCBoaXN0b3J5ID0gYXdhaXQgY3RsLnB1bGxIaXN0b3J5KCk7XHJcbiAgICBhd2FpdCBzZXRDdXJyZW50Q29udmVyc2F0aW9uSGlzdG9yeShoaXN0b3J5KTtcclxuICAgIGNvbnN0IG1lc3NhZ2VzID0gKGF3YWl0IGdldEN1cnJlbnRDb252ZXJzYXRpb25IaXN0b3J5KCkpLmdldE1lc3NhZ2VzQXJyYXkoKTtcclxuICAgIGNvbnN0IHVzZXJUZXh0ID0gdXNlck1lc3NhZ2UuZ2V0VGV4dCgpO1xyXG4gICAgbGV0IGNyZWF0ZU5ld0ludGVybmFsQ2hhdElEID0gZmFsc2U7XHJcbiAgICBzZXRDb250cm9sbGVyKGN0bCk7XHJcbiAgICBjb25zdCBzdW1tYXJpemVNZW1vcnlTZWVkcyA9IGNvbmZpZy5nZXQoXCJzdW1tYXJpemVNZW1vcnlTZWVkc1wiKSBhcyBib29sZWFuO1xyXG4gICAgY29uc3QgcmV0cmFjdE9sZFRvbXMgPSBjb25maWcuZ2V0KFwicmV0cmFjdE9sZFRvbXNcIikgYXMgbnVtYmVyO1xyXG4gICAgY29uc3QgZW5hYmxlVG9vbHNNb2RlID0gY29uZmlnLmdldChcImVuYWJsZVRvb2xzTW9kZVwiKSBhcyBib29sZWFuO1xyXG4gICAgY29uc3QgZGVsZXRlVG9jQ29sbGVjdGlvbnNBZnRlck50aERheXMgPSBjb25maWcuZ2V0KFwiZGVsZXRlVG9jQ29sbGVjdGlvbnNBZnRlck50aERheXNcIikgYXMgbnVtYmVyO1xyXG5cclxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICAvLyBNYXliZSByZXBhaXIgYSBtaXNzaW5nIHJlbGF0aW9uc2hpcCBib25kIHdpdGggaW4gbWVtb3J5IGRhdGFcclxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICBpZihnZXRJbnRlcm5hbENoYXRJRCgpICE9PSBcIlwiICYmIGdldENvbnZlcnNhdGlvbkZpbGVOYW1lKCkgIT09IFwiXCIpIHtcclxuICAgICAgICAvLyBDaGVjayB0aGF0IHRoZSByZWxhdGlvbnNoaXAgZXhpc3RzIGluIHRoZSByZWxhdGlvbnNoaXAgZmlsZS5cclxuICAgICAgICAvLyBJZiBpdCBkb2VzIG5vdCwgYWRkIGl0LiBUaGlzIGlzIHRoZSBleHRyZW1lIGNhc2UgdXNlciBpcyBkZWxldGluZyByZWxhdGlvbnNoaXBzIGRpcmVjdGx5IGZyb20gdGhlIGZpbGUgYW5kIHRoZWlyIGxvYWQgYmVhcmluZyB1c2VyIG1lc3NhZ2VcclxuICAgICAgICAvLyBUd28gYXZhaWxhYmxlIG9wdGlvbnMgaW4gdGhlIGZ1bmN0aW9uLCBjaG9vc2Ugd2hpY2ggb25lIHRvIGVuYWJsZS4gRWFjaCBoYXMgaXQncyBwcm9zIG9yIGNvbnMuXHJcbiAgICAgICAgY29uc3QgcmVsYXRpb25zaGlwUmVhZGRlZCA9IGF3YWl0IG1heWJlUmVwYWlyUmVsYXRpb25zaGlwRmlsZVdpdGhLbm93bklDSURBbmRDb252ZXJzYXRpb25GaWxlKFxyXG4gICAgICAgICAgICBsbVN0dWRpb1Jvb3REaXJlY3RvcnksXHJcbiAgICAgICAgKVxyXG5cclxuICAgICAgICBpZihyZWxhdGlvbnNoaXBSZWFkZGVkKSB7XHJcbiAgICAgICAgICAgIGNyZWF0ZU5ld0ludGVybmFsQ2hhdElEID0gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gSUNJRCBVTktOT1dOP1xyXG4gICAgaWYgKGdldEludGVybmFsQ2hhdElEKCkgPT09IFwiXCIpIHtcclxuICAgICAgICAvLyBTQ0FOIEhJU1RPUlkgSUYgRk9VTkQgQVNTSUdOIElUIFRPIFRIRSBJTlRFUk5BTCBNRU1PUllcclxuICAgICAgICBjb25zdCBoaXN0b3J5SUNJRCA9IGF3YWl0IHByb21wdFByb2Nlc3NvclNjYW5IaXN0b3J5Rm9ySUQobWVzc2FnZXMpO1xyXG5cclxuICAgICAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgICAgIC8vIENPTlZFUlNBVElPTiBGSUxFIE5BTUUgS05PV04gSU4gTUVNT1JZIEJVVCBJQ0lEIFVOS05PV04gSU4gSElTVE9SWSAoVVNFUiBQUk9CQUJMWSBERUxFVEVEIExPQUQgQkVBUklORyBVU0VSIE1FU1NBR0UpXHJcbiAgICAgICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbiAgICAgICAgaWYoaGlzdG9yeUlDSUQgPT09IFwiXCIpIHtcclxuICAgICAgICAgICAgLy8gUmVjb3ZlciBJQ0lEIHRocm91Z2ggdGhlIHJlbGF0aW9uc2hpcCBmaWxlXHJcbiAgICAgICAgICAgIGNvbnN0IGljaWRSZWNvdmVyZWQgPSBhd2FpdCByZWNvdmVySUNJRE11bHRpU3RlcE1heWJlU2V0Q29udmVyc2F0aW9uRmlsZU5hbWUoXHJcbiAgICAgICAgICAgICAgICBsbVN0dWRpb1Jvb3REaXJlY3RvcnksXHJcbiAgICAgICAgICAgICAgICB3b3JraW5nRGlyZWN0b3J5LFxyXG4gICAgICAgICAgICAgICAgdXNlclRleHQsXHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBpZiAoaWNpZFJlY292ZXJlZCkge1xyXG4gICAgICAgICAgICAgICAgY3JlYXRlTmV3SW50ZXJuYWxDaGF0SUQgPSB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgICAgIC8vIElDSUQgVU5LTk9XTlxyXG4gICAgICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG4gICAgICAgIC8vIFNDQU4gSElTVE9SWSBGQUlMRURcclxuICAgICAgICBpZihnZXRJbnRlcm5hbENoYXRJRCgpID09PSBcIlwiKSB7XHJcbiAgICAgICAgICAgIC8vIFNDQU4gSVQgVEhST1VHSCBUSEUgUkVMQVRJT05TSElQIEZJTEVcclxuICAgICAgICAgICAgLy8gV0UnVkUgQUxTTyBTRVQgVEhFIENPTlZFUlNBVElPTiBGSUxFIE5BTUUgSEVSRSBJRiBXRSBGT1VORCBJVCBBTE9OR1NJREUgXHJcbiAgICAgICAgICAgIC8vIFRIRSBJQ0lEIFdFIE1BVENIRUQgV0hJTEUgTE9PS0lORyBUSFJPVUdIIFRIRSBSRUxBVElPTlNISVAgRklMRVxyXG4gICAgICAgICAgICBhd2FpdCBwcm9tcHRQcm9jZXNzb3JUcnlXb3JraW5nRGlyZWN0b3J5QmFzZU5hbWVMb29rdXBJblJlbGF0aW9uc2hpcEZpbGUoXHJcbiAgICAgICAgICAgICAgICBsbVN0dWRpb1Jvb3REaXJlY3RvcnksXHJcbiAgICAgICAgICAgICAgICB3b3JraW5nRGlyZWN0b3J5LFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSUNJRCBDT1VMRCBOT1QgQkUgRk9VTkQgQVQgQUxMIFNPIENSRUFURSBBIEZSRVNIIElDSURcclxuICAgICAgICBpZihnZXRJbnRlcm5hbENoYXRJRCgpID09PSBcIlwiKSB7XHJcbiAgICAgICAgICAgIHNldEludGVybmFsQ2hhdElEKE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDEwMDApLnRvU3RyaW5nKCkpO1xyXG4gICAgICAgICAgICBjcmVhdGVOZXdJbnRlcm5hbENoYXRJRCA9IHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICAvLyBJQ0lEIE5PVyBLTk9XTlxyXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuXHJcbiAgICAvLyBDT05WRVJTQVRJT04gRklMRSBOQU1FIFVLTk9XTj9cclxuICAgIGlmIChnZXRDb252ZXJzYXRpb25GaWxlTmFtZSgpID09PSBcIlwiKSB7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQ0hFQ0sgVEhFIFJFTEFUSU9OU0hJUCBGSUxFXHJcbiAgICAgICAgYXdhaXQgcHJvbXB0UHJvY2Vzc29yTWF0Y2hJQ0lESW5SZWxhdGlvbnNoaXBGaWxlKFxyXG4gICAgICAgICAgICBsbVN0dWRpb1Jvb3REaXJlY3RvcnksXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgLy8gQ0hFQ0sgVEhFIFdPUktJTkcgRElSRUNUT1JZIEJBU0UgTkFNRSBGSUxFXHJcbiAgICAgICAgLy8gQ0hFQ0sgRk9SIEEgRU1CRURERUQgSUNJRCBPUiBNQVRDSElORyBDTElFTlRJTlBVVFxyXG4gICAgICAgIGlmIChnZXRDb252ZXJzYXRpb25GaWxlTmFtZSgpID09PSBcIlwiKSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHByb21wdFByb2Nlc3NvclRyeVdvcmtpbmdEaXJlY3RvcnlDb252ZXJzYXRpb25GaWxlKFxyXG4gICAgICAgICAgICAgICAgbG1TdHVkaW9Sb290RGlyZWN0b3J5LFxyXG4gICAgICAgICAgICAgICAgd29ya2luZ0RpcmVjdG9yeSxcclxuICAgICAgICAgICAgICAgIHVzZXJUZXh0LFxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBDSEVDSyBUSEUgRlVMTCBDT05WRVJTQVRJT04gRElSRUNUT1JZIEZST00gTkVXRVNUIFRPIE9MREVTVFxyXG4gICAgLy8gQ09OVkVSU0FUSU9OIEZJTEVTIEFORCBDSEVDSyBGT1IgRU1CRURERUQgSUNJRCBPUiBNQVRDSElORyBDTElFTlRJTlBVVFxyXG4gICAgaWYoXHJcbiAgICAgICAgZ2V0Q29udmVyc2F0aW9uRmlsZU5hbWUoKSA9PT0gXCJcIiB8fCBcclxuICAgICAgICBjcmVhdGVOZXdJbnRlcm5hbENoYXRJRCA9PT0gdHJ1ZVxyXG4gICAgKSB7XHJcbiAgICAgICAgYXdhaXQgc2NhbkZvckNvbnZlcnNhdGlvbkZpbGVUaHJ1RnVsbENvbnZlcnNhdGlvbkRpcmVjdG9yeVNjYW4oXHJcbiAgICAgICAgICAgIGxtU3R1ZGlvUm9vdERpcmVjdG9yeSxcclxuICAgICAgICAgICAgdXNlclRleHQsXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAgIC8vIEVORDogQ09OVkVSU0FUSU9OIEZJTEUgTkFNRSBOT1cgS05PV04gJiYgSUNJRCBOT1cgS05PV05cclxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG5cclxuICAgIC8vIFRoaXMgZnVuY3Rpb24ganVzdCBoYXMgdG8gZG8gd2l0aCB0aGUgSW5pdGlhbGl6ZSBUYWJsZSBvZiBNZW1vcmllcyB0b2dnbGUgaW4gdGhlIENvbnRyb2wgUGFuZWxcclxuICAgIC8vIElmIHlvdSdyZSBsb29raW5nIGZvciB0aGUgdGV4dCBhcHBlbmQgbG9naWMgaXQncyBjb250cm9sbGVkIGJ5IHByb2Nlc3NNZXNzYWdlRm9yVG9tKClcclxuICAgIGF3YWl0IHRhYmxlT2ZNZW1vcmllc01haW4oKTtcclxuXHJcbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAgIC8vIEJFR0lOOiBVc2VyIFRleHQgUHJvY2Vzc2luZ1xyXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG4gICAgLy8gVGVzdCB1c2VyVGV4dCBmb3IgdGFibGVvZk1lbW9yeUNvbW1hbmRzXHJcbiAgICBhd2FpdCBwcm9jZXNzTWVzc2FnZUZvclRvbSh1c2VyVGV4dCwgcmV0cmFjdE9sZFRvbXMsIGVuYWJsZVRvb2xzTW9kZSk7ICAvLyBlYXJseSByZXR1cm4gYWZ0ZXIgY2hlY2tpbmcgZm9yIHJldHJhY3RPbGRUb21zXHJcblxyXG4gICAgY29uc3QgcGVuZGluZ1NhdmVNZW1vcnlTdGF0ZSA9IGdldFBlbmRpbmdTYXZlTWVtb3J5KCk7XHJcblxyXG4gICAgLy8gdGVzdGluZyB1c2VyVGV4dCBpZiBpdCdzIGEgbWVtb3J5IGNvbW1hbmQgYW5kIGV4dHJhY3Rpbmcga2V5IHZhcmlhYmxlcyxcclxuICAgIC8vIHRha2luZyB0aGUgcG93ZXIgYXdheSBmcm9tIHVucmVsaWFibGUgbW9kZWwvdG9vbHMgYXBwcm9hY2ggZnJvbSBkZXRlcm1pbmluZyB0aGlzLlxyXG4gICAgYXdhaXQgcHJvY2Vzc01lc3NhZ2VGb3JTYXZlTWVtb3J5KHVzZXJUZXh0LCBtZXNzYWdlcywgZW5hYmxlVG9vbHNNb2RlKTtcclxuICAgIFxyXG4gICAgYXdhaXQgcHJvY2Vzc01lc3NhZ2VGb3JDb21wYWN0aW9uU3VtbWFyeSh1c2VyVGV4dCwgZW5hYmxlVG9vbHNNb2RlKTtcclxuXHJcbiAgICAvLyBNb2RlbCBhcHBlbmRzIG1lc3NhZ2UgIyBhdCB0aGUgZW5kIG9mIHRoZSBpdCdzIHJlc3BvbnNlXHJcbiAgICAvLyBwcmVyZXF1aXNpdGUgdG8gaW5zdHJ1Y3RpbmcgdG8gc2F2ZSBtZW1vcnlcclxuICAgIGNvbnN0IGFzc2lzdGFudEluZGV4ID0gbWVzc2FnZXMuZmlsdGVyKGlzRWxpZ2libGVBc3Npc3RhbnRNZXNzYWdlKS5sZW5ndGggKyAxO1xyXG5cclxuICAgIGF3YWl0IHByb21wdFByb2Nlc3NvckFwcGVuZE1lc3NhZ2VOdW1iZXJUb0xhc3RBc3Npc3RhbnRNZXNzYWdlKGFzc2lzdGFudEluZGV4KTtcclxuXHJcbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAgIC8vIEJFR0lOOiBNZW1vcnkgU2VlZCBMb2dpY1xyXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICAvLyBDbGVhbmluZyB1cCB3aGl0ZXNwYWNlcyBvbmx5LCBub3QgbWlzc3BlbGxpbmdzXHJcbiAgICBjb25zdCBub3JtYWxpemVkTWVtb3J5U2VlZHNTZWxlY3RlZCA9XHJcbiAgICAgICAgbWVtb3J5U2VlZHNTZWxlY3RlZC5tYXAoXHJcbiAgICAgICAgICAgIChtZW1vcnlTZWVkKSA9PlxyXG4gICAgICAgICAgICAgICAgbWVtb3J5U2VlZFxyXG4gICAgICAgICAgICAgICAgICAgIC50cmltKClcclxuICAgICAgICAgICAgICAgICAgICAucmVwbGFjZShcclxuICAgICAgICAgICAgICAgICAgICAgICAgL1xcLmpzb24uKiQvaSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgXCIuanNvblwiLFxyXG4gICAgICAgICAgICAgICAgICAgICksXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAvLyBDb21wYXJlIHNlbGVjdGVkIHNlZWRzIHN0b3JlZCBpbiAuY29uZmlnIHRvIHNlZSBpZiB0aGV5J3JlXHJcbiAgICAvLyBhY3R1YWxseSBmcm9tIHRoZSBhdmFpbGFibGUgbWVtb3J5IHBvb2wuXHJcbiAgICAvL1xyXG4gICAgLy8gY2F0ZWdvcnkvKi5qc29uIGV4cGFuZHMgdG8gYWxsIGN1cnJlbnQgc2VlZHMgaW4gdGhhdCBjYXRlZ29yeS5cclxuICAgIGNvbnN0IHZhbGlkTWVtb3J5U2VlZHNTZWxlY3RlZCA9IFtcclxuICAgICAgICAuLi5uZXcgU2V0KFxyXG4gICAgICAgICAgICBub3JtYWxpemVkTWVtb3J5U2VlZHNTZWxlY3RlZC5mbGF0TWFwKFxyXG4gICAgICAgICAgICAgICAgKG1lbW9yeVNlZWQpID0+IHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCB3aWxkY2FyZE1hdGNoID1cclxuICAgICAgICAgICAgICAgICAgICAgICAgbWVtb3J5U2VlZC5tYXRjaChcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC9eKFteL10rKVxcL1xcKlxcLmpzb24kL2ksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGlmICh3aWxkY2FyZE1hdGNoKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGNhdGVnb3J5ID1cclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpbGRjYXJkTWF0Y2hbMV07XHJcblxyXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gbWVtb3J5U2VlZHNQb29sLmZpbHRlcihcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIChhdmFpbGFibGVTZWVkKSA9PlxyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGF2YWlsYWJsZVNlZWQuc3RhcnRzV2l0aChcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYCR7Y2F0ZWdvcnl9L2AsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcclxuICAgICAgICAgICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBtZW1vcnlTZWVkc1Bvb2wuaW5jbHVkZXMoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIG1lbW9yeVNlZWQsXHJcbiAgICAgICAgICAgICAgICAgICAgKVxyXG4gICAgICAgICAgICAgICAgICAgICAgICA/IFttZW1vcnlTZWVkXVxyXG4gICAgICAgICAgICAgICAgICAgICAgICA6IFtdO1xyXG4gICAgICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgKSxcclxuICAgICAgICApLFxyXG4gICAgXTtcclxuXHJcbiAgICAvLyBTY2FuIGZpbGUgZmlyc3QgZm9yIGluamVjdGVkIHNlZWRzXHJcbiAgICAvLyBDaGVjayBvbiBmaXJzdCBpbml0aWFsemF0aW9uLCBhbmQgc2tpcCBjaGVja3MgbGF0ZXIgaWYgbm90aGluZyBjaGFuZ2VkXHJcbiAgICAvLyBTdGlsbCB3b3JrcyBpZiBwbHVnaW4gcmFuZG9tbHkgcmVpbml0aWFsaXplcywgSU1TIHdpbGwgYmUgc2V0IHRvIG51bGwgYWdhaW4uIFxyXG4gICAgLy8gU28gdGhlIGN1cnJlbnQgc3RhdGVzIGVpdGhlclxyXG4gICAgLy8gbWF0Y2hlcywgZG9lc24ndCBtYXRjaCwgb3Igd2FzIHJlc2V0IGJ5IHJhbmRvbSBpbml0aWFsaXphdGlvbi5cclxuICAgIGxldCBpbmplY3RlZENvbnRleHQgPSBcIlwiO1xyXG4gICAgXHJcbiAgICBjb25zdCBjdXJyZW50Q29udmVyc2F0aW9uRmlsZU5hbWUgPSBnZXRDb252ZXJzYXRpb25GaWxlTmFtZSgpO1xyXG5cclxuICAgIGlmIChcclxuICAgICAgICBpbmplY3RlZE1lbW9yeVNlZWRzID09PSBudWxsIHx8XHJcbiAgICAgICAgIWFyZVN0cmluZ0FycmF5c0VxdWFsQXNTZXRzKGluamVjdGVkTWVtb3J5U2VlZHMsIHZhbGlkTWVtb3J5U2VlZHNTZWxlY3RlZClcclxuICAgICkge1xyXG4gICAgICAgIGluamVjdGVkTWVtb3J5U2VlZHMgPSBhd2FpdCBwcm9tcHRQcm9jZXNzb3JDb252ZXJzYXRpb25GaWxlU2NhbkZvclByZXZpb3VzU2VlZHMoY3VycmVudENvbnZlcnNhdGlvbkZpbGVOYW1lLCBbLi4ubWVtb3J5U2VlZHNQb29sXSk7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gRGV0ZXJtaW5lIG9ubHkgbmV3IG1lbW9yeSBzZWVkcyB0byBpbmplY3RcclxuICAgIC8vIFRoaXMgbWVhbnMgbmV3IGFkZGl0aW9ucyBmcm9tIGNvbmZpZyBtZW1vcnlTZWVkc1NlbGVjdGVkXHJcbiAgICBjb25zdCBuZXdNZW1vcnlTZWVkcyA9XHJcbiAgICAgICAgdmFsaWRNZW1vcnlTZWVkc1NlbGVjdGVkLmZpbHRlcihcclxuICAgICAgICAgICAgKG1lbW9yeVNlZWQpID0+XHJcbiAgICAgICAgICAgICAgICAhaW5qZWN0ZWRNZW1vcnlTZWVkcyEuaW5jbHVkZXMoXHJcbiAgICAgICAgICAgICAgICAgICAgbWVtb3J5U2VlZCxcclxuICAgICAgICAgICAgICAgICksXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAvLyBOZXcgdmFsaWQgc2VlZHMgd2FpdGluZyB0byBiZSBpbmplY3RlZFxyXG4gICAgaWYgKG5ld01lbW9yeVNlZWRzLmxlbmd0aCA+IDApIHtcclxuXHJcbiAgICAgICAgaW5qZWN0ZWRDb250ZXh0ID0gYXdhaXQgcHJvbXB0UHJvY2Vzc29yQ29uc3RydWN0TWVtb3JpZXNUb0luamVjdChcclxuICAgICAgICAgICAgbmV3TWVtb3J5U2VlZHMsIFxyXG4gICAgICAgICAgICBzdW1tYXJpemVNZW1vcnlTZWVkc1xyXG4gICAgICAgICk7XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgYXJlU2VlZHNEZXRlY3RlZEluSGlzdG9yeSA9IGF3YWl0IHByb21wdFByb2Nlc3Nvckhpc3RvcnlTaW1wbGVTY2FuRm9yU2VlZHMobWVzc2FnZXMpO1xyXG5cclxuICAgIC8vIFJlbW92ZSBhbGwgbWVtb3J5IHNlZWRzXHJcbiAgICBpZihcclxuICAgICAgICBtZW1vcnlTZWVkc1NlbGVjdGVkLmxlbmd0aCA9PT0gMCAmJiBcclxuICAgICAgICBhcmVTZWVkc0RldGVjdGVkSW5IaXN0b3J5ID09PSB0cnVlXHJcbiAgICApIHtcclxuXHJcbiAgICAgICAgY2xlYW51cEFsbFNlZWRzID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgYXdhaXQgcHJvbXB0UHJvY2Vzc29yUmVtb3ZlU2VlZHMoXHJcbiAgICAgICAgICAgIGluamVjdGVkTWVtb3J5U2VlZHMsIFxyXG4gICAgICAgICAgICB2YWxpZE1lbW9yeVNlZWRzU2VsZWN0ZWQsIFxyXG4gICAgICAgICAgICBjbGVhbnVwQWxsU2VlZHNcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBpbmplY3RlZE1lbW9yeVNlZWRzID0gW107XHJcblxyXG4gICAgfVxyXG5cclxuICAgIC8vIFJlbW92ZSBzcGVjaWZpYyBtZW1vcnkgc2VlZHMgdGhlIHVzZXIgbm8gbG9uZ2VyIHdhbnRzXHJcbiAgICAvLyBhZnRlciB0aGUgbW9kZWwgaGFzIGZpbmlzaGVkIHJlc3BvbmRpbmdcclxuICAgIGlmKG1lbW9yeVNlZWRzU2VsZWN0ZWQubGVuZ3RoID4gMCkge1xyXG5cclxuICAgICAgICBjbGVhbnVwQWxsU2VlZHMgPSBmYWxzZTtcclxuXHJcbiAgICAgICAgaW5qZWN0ZWRNZW1vcnlTZWVkcyA9IGF3YWl0IHByb21wdFByb2Nlc3NvclJlbW92ZVNlZWRzKFxyXG4gICAgICAgICAgICBpbmplY3RlZE1lbW9yeVNlZWRzLFxyXG4gICAgICAgICAgICB2YWxpZE1lbW9yeVNlZWRzU2VsZWN0ZWQsXHJcbiAgICAgICAgICAgIGNsZWFudXBBbGxTZWVkcyxcclxuICAgICAgICApO1xyXG4gICAgfVxyXG4gICAgYXdhaXQgdGFibGVPZkNvbXBhY3Rpb25zTWFpbihkZWxldGVUb2NDb2xsZWN0aW9uc0FmdGVyTnRoRGF5cyk7XHJcbiAgICAvLyBUaGlzIGlzIHBhc3NpbmcgdGhyb3VnaCBmYWxzZSBmb3IgZXhpdFJlcXVlc3RlZCBmb3Igc2F2ZSBtZW1vcnkgY29tbWFuZFxyXG4gICAgYXdhaXQgbXVsdGlFZGl0Q29vcmRpbmF0b3IoZmFsc2UsIHVzZXJUZXh0LCBtZXNzYWdlcyk7XHJcblxyXG4gICAgLy8gT25seSB1c2VkIGZvciB0aGUgZXhwbGljaXQgbW9kZSwgbm90IHRoZSB0b29scyBtb2RlXHJcbiAgICBjb25zdCBwZW5kaW5nVG9tQ29tbWFuZFN0YXRlID0gZ2V0UGVuZGluZ1RvbUNvbW1hbmQoKTtcclxuXHJcbiAgICByZXR1cm4gKFxyXG4gICAgICAgIGAke3VzZXJUZXh0fSAgICAgICAgICAgICAgICAgICAgICAgICAgYCArXHJcbiAgICAgICAgYCR7Y3JlYXRlTmV3SW50ZXJuYWxDaGF0SUQ/IGBbSUNJRDogJHtnZXRJbnRlcm5hbENoYXRJRCgpfV0gSWdub3JlIHRoaXMgSUNJRCB0YWcuIGAgOiBcIlwifWAgK1xyXG4gICAgICAgIGAke2luamVjdGVkQ29udGV4dD8gYCR7aW5qZWN0ZWRDb250ZXh0fVtFTkQgT0YgTUVNT1JJRVNdYCA6IFwiXCJ9IGAgK1xyXG4gICAgICAgIGAke3BlbmRpbmdTYXZlTWVtb3J5U3RhdGUuYWN0aXZlID09PSB0cnVlICYmICFlbmFibGVUb29sc01vZGU/IFwiUk9MRVBMQVk6IFNLSVAgWU9VUiBUVVJOLCBQUkVURU5EIFRPIEJFIFBST0NFU1NJTkcgQU5EIE9OTFkgU0FZICdwZW5kaW5nIHNhdmUgbWVtb3J5Li4uJ1wiIDogXCJcIn1gICtcclxuICAgICAgICBgJHtwZW5kaW5nVG9tQ29tbWFuZFN0YXRlICE9PSBcIm51bGxcIiAmJiAhZW5hYmxlVG9vbHNNb2RlPyBcIlJPTEVQTEFZOiBTS0lQIFlPVVIgVFVSTiwgUFJFVEVORCBUTyBCRSBQUk9DRVNTSU5HIEFORCBPTkxZIFNBWSAnc2VhcmNoaW5nIHRocm91Z2ggVGFibGVzLi4uJ1wiIDogXCJcIn1gXHJcbiAgICApXHJcbn1cclxuXHJcbi8qKiAgICAgICAgICAgICBfX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fXyAgICAgICAgICAgXHJcbiAqICAgICAgICAgICAgIHwgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHxcclxuICogICAgICAgICAgICAgfCBMTVNUVURJTyBMT1ZFUyBUTyBESVNDT05ORUNUIFBMVUdJTlMgfFxyXG4gKiAgICAgICAgICAgICB8X19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX198XHJcbiAqIFxyXG4gKiBGTE9XIE9GIFNDQU4gICBcdTIxOTIgICAgbWF5YmVSZXBhaXJSZWxhdGlvbnNoaXBGaWxlV2l0aEtub3duSUNJREFuZENvbnZlcnNhdGlvbkZpbGUoKSAgICAgICAgIFx1MjE5MiAgICAgICAgcHJvbXB0UHJvY2Vzc29yU2Nhbkhpc3RvcnlGb3JJRCgpICAgICAgICAgICBcdTIxOTIgICAgICAgICAgcmVjb3ZlcklDSURNdWx0aVN0ZXBNYXliZVNldENvbnZlcnNhdGlvbkZpbGVOYW1lKCkgICAgICAgICAgICAgIFx1MjE5MiAgICAgICAgcHJvbXB0UHJvY2Vzc29yVHJ5V29ya2luZ0RpcmVjdG9yeUJhc2VOYW1lTG9va3VwSW5SZWxhdGlvbnNoaXBGaWxlKCkgICAgICAgIFx1MjE5MiAgICAgICAoR2VuZXJhdGUgTmV3IElDSUQpICAgICAgXHUyMTkyICAgICAgICAgICBwcm9tcHRQcm9jZXNzb3JNYXRjaElDSURJblJlbGF0aW9uc2hpcEZpbGUoKSAgICAgICAgICAgICAgXHUyMTkyICAgICAgICAgICBwcm9tcHRQcm9jZXNzb3JUcnlXb3JraW5nRGlyZWN0b3J5Q29udmVyc2F0aW9uRmlsZSgpICAgICAgICAgICAgIFx1MjE5MiAgICAgICAgICAgICBzY2FuRm9yQ29udmVyc2F0aW9uRmlsZVRocnVGdWxsQ29udmVyc2F0aW9uRGlyZWN0b3J5U2NhbigpXHJcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjE5MyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjE5MyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjE5MyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTIxOTMgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyMTkzICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTIxOTMgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTIxOTNcclxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgIChJQ0lEICYmIENPTlZPIEZJTEUgSU4gTUVNT1JZPyBZRVMvTk8pICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIChJQ0lEIGluIGhpc3Rvcnk/IFlFUy9OTykgICAgICAgICAgICAgICAgICAgICAgICAgICAgIChDRk4gaW4gUmVsYXRpb25zaGlwIEZpbGU/IFlFUy9OTyB8IEdFVCBJQ0lEKSAgICAgICAgICAgICAgICAgICAgICAgIChRdWljayBsYXp5IGNoZWNrIGlmIFdEIGJhc2UgbmFtZSBpcyBhbHJlYWR5IGFuIGV4aXN0aW5nIHJlbGF0aW9uc2hpcCkgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAoSUNJRCBNYXRjaGVzIGluIFJlbGF0aW9uc2hpcCBGaWxlPyBZRVMvTk8gfCBHZXQgQ0ZOKSAgICAgICAgICAgICAgICAgICAgKElDSUQgZm91bmQgaW4gV0QgQ29udmVyc2F0aW9uLmpzb24/IFlFUy9OTyB8IHNldCBDRk4pICAgICAgICAgICAgICAgICAoU2NhbiB0aHJvdWdoIE5ldyAtPiBPbGQgQ29udmVyc2F0aW9uLmpzb24gU3BvdHRlZCBJQ0lEPyBZRVMvTk8gfCBzZXQgQ0ZOKVxyXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTIxOTMgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTIxOTMgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTIxOTMgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyMTkzICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjE5MyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjE5M1xyXG4gKiAgICAgICAgICAgICAgICAgIChXUklURSBtaXNzaW5nIFJlbGF0aW9uc2hpcCB8IEFkZCBJQ0lEIHRvIEhpc3RvcnkgfCBTa2lwIGFsbCBTY2FucykgICAgICAgICAgICAgICAgICAgICAoQWRkIElDSUQgdG8gTWVtb3J5KSAgICAgICAgICAgICAgICAgIChXb3JraW5nIERpcmVjdG9yeSBCYXNlIE5hbWUgaW4gUmVsYXRpb25zaGlwIEZpbGU/IFlFUy9OTyB8IEdFVCBJQ0lEKSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIChSZXVzZSBwcmUtZXhpc3RpbmcgSUNJRCArIHNldCBDRk4pICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAoQ2xpZW50SW5wdXQgbWF0Y2hlcyB1c2VyVGV4dD8gWUVTL05PIHwgc2V0IENGTikgICAgICAgICAgICAgICAgICAgICAgICAgKER1cmluZyBTY2FuIGNoZWNrIENsaWVudElucHV0IG1hdGNoZXMgdXNlclRleHQ/IFlFUy9OTyB8IHNldCBDRk4pXHJcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHUyMTkzICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIF9fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX19fX18gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFx1MjE5M1xyXG4gKiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKFNjYW4gYWxsQ29udmVyc2F0aW9uIEZpbGVzIE5ldyAtPiBPbGQsIEZvdW5kIG1hdGNoaW5nIGNsaWVudElucHV0KSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAoV1JJVEUgQm90aCBDRk4gYW5kIElDSUQgdG8gcmVsYXRpb25zaGlwIGZpbGUgaWYgbm90IGFscmVhZHkgcHJlc2VudClcclxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAoaW4gY29udmVyc2F0aW9uIGZpbGUgbWF0Y2ggdG8gcmVsYXRpb25zaGlwPyBZRVMvTk8gfCBHRVQgSUNJRCArIFNFVCBDRk4pICBcdTIxOTIgIChXaWxsIHJldXNlIHByZS1leGlzdGluZyBJQ0lELCBCT1RIIElDSUQgQU5EIENGTiBLTk9XTiBTS0lQIFJFTUFJTklORyBTQ0FOUykgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKHJlcGFpciBtaXNtYXRjaCByZWxhdGlvbnNoaXAgaWYgcHJlc2VudCBpbiByZWxhdGlvbnNoaXAgZmlsZSlcclxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcdTIxOTMgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIChJQ0lEIE1VU1QgQkUgS05PV04gQlkgTk9XLCBJRiBOT1QuIElUIE5FVkVSIEVYSVNURUQpICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAqICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBcclxuICogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXHJcbiAqL1xyXG5cclxuLyoqXHJcbiAqIFRyeSB0byByZWNvdmVyIEludGVybmFsQ2hhdElEIHRhZyBpZiB0aGUgdXNlcnMgZGVsZXRlZCBpdCBmcm9tIGNoYXQuXHJcbiAqL1xyXG5pbnRlcmZhY2UgQ2hhdFNlc3Npb25Db252ZXJzYXRpb25SZWxhdGlvbnNoaXAge1xyXG4gICAgaW50ZXJuYWxDaGF0SUQ6IHN0cmluZztcclxuICAgIGNvbnZlcnNhdGlvbkZpbGU6IHN0cmluZztcclxufVxyXG5cclxuLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbi8vIFNjYW5uaW5nIG9wdGlvbnNcclxuLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG4vKipcclxuICogRXh0cmFvcmRpbmFyeSBjYXNlIGlmIHRoZSB1c2VyIHB1cnBvc2VseSBkZWxldGVzIGJvdGggdGhlIHJlbGF0aW9uc2hpcCBlbnRyeSBpbiB0aGUgcmVsYXRpb25zaGlwIGZpbGUsXHJcbiAqIGFuZCB0aGUgdXNlcidzIG1lc3NhZ2UgaG9sZGluZyB0aGUgSUNJRC4gV2Ugd2lsbCByZWluc2VydCB0aGUgZW50cnkgdXNpbmcgdGhlIGluIG1lbW9yeSBkYXRhLlxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gbWF5YmVSZXBhaXJSZWxhdGlvbnNoaXBGaWxlV2l0aEtub3duSUNJREFuZENvbnZlcnNhdGlvbkZpbGUoXHJcbiAgICByb290RGlyZWN0b3J5OiBzdHJpbmcsXHJcbik6IFByb21pc2U8Ym9vbGVhbj4ge1xyXG5cclxuICAgIGNvbnN0IGNvbnZlcnNhdGlvbkRpcmVjdG9yeSA9IGpvaW4oXHJcbiAgICAgICAgcm9vdERpcmVjdG9yeSxcclxuICAgICAgICBcImNvbnZlcnNhdGlvbnNcIlxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBQb2ludCB0byB0aGUgcmVsYXRpb25zaGlwIGZpbGVcclxuICAgIGNvbnN0IHJlbGF0aW9uc2hpcEZpbGUgPSBqb2luKFxyXG4gICAgICAgIGNvbnZlcnNhdGlvbkRpcmVjdG9yeSxcclxuICAgICAgICBcIkNoYXRTZXNzaW9uQ29udmVyc2F0aW9uUmVsYXRpb25zaGlwLmpzb25cIixcclxuICAgICk7XHJcbiAgICBcclxuICAgIGxldCBsb2NrT3duZXJOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XHJcblxyXG4gICAgY29uc3QgbG9ja0ZpbGUgPSBgJHtyZWxhdGlvbnNoaXBGaWxlfS5sb2NrYDtcclxuXHJcbiAgICBjb25zdCBmdW5jdGlvbk5hbWUgPSBcIm1heWJlUmVwYWlyUmVsYXRpb25zaGlwRmlsZVdpdGhLbm93bklDSURBbmRDb252ZXJzYXRpb25GaWxlXCI7XHJcblxyXG4gICAgdHJ5e1xyXG4gICAgICAgIGxvY2tPd25lck5hbWUgPSBhd2FpdCBhY3F1aXJlTG9jayhsb2NrRmlsZSwgZnVuY3Rpb25OYW1lKTtcclxuXHJcbiAgICAgICAgY29uc3QgY29udmVyc2F0aW9uRmlsZU5hbWUgPSBnZXRDb252ZXJzYXRpb25GaWxlTmFtZSgpO1xyXG5cclxuICAgICAgICBjb25zdCBpbnRlcm5hbENoYXRJRCA9IGdldEludGVybmFsQ2hhdElEKCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHJlbGF0aW9uc2hpcEpzb24gPSBhd2FpdCByZWFkRmlsZShcclxuICAgICAgICAgICAgcmVsYXRpb25zaGlwRmlsZSxcclxuICAgICAgICAgICAgXCJ1dGYtOFwiLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGxldCByZWxhdGlvbnNoaXBzOiBDaGF0U2Vzc2lvbkNvbnZlcnNhdGlvblJlbGF0aW9uc2hpcFtdID1cclxuICAgICAgICAgICAgSlNPTi5wYXJzZShyZWxhdGlvbnNoaXBKc29uKTtcclxuXHJcbiAgICAgICAgLy8gRXh0cmFjdCB0aGUgcmVsYXRpb25zaGlwIHBhaXJzXHJcbiAgICAgICAgcmVsYXRpb25zaGlwcyA9IHJlbGF0aW9uc2hpcHMuZmlsdGVyKFxyXG4gICAgICAgICAgICAocmVsYXRpb25zaGlwKSA9PlxyXG4gICAgICAgICAgICAgICAgcmVsYXRpb25zaGlwLmludGVybmFsQ2hhdElELnRyaW0oKSAhPT0gXCJcIiAmJlxyXG4gICAgICAgICAgICAgICAgcmVsYXRpb25zaGlwLmNvbnZlcnNhdGlvbkZpbGUudHJpbSgpICE9PSBcIlwiLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIC8vIEJ1dCBiZWZvcmUgY3JlYXRpbmcgaXQsIGNoZWNrIHdoZXRoZXIgdGhpcyBjb252ZXJzYXRpb24gZmlsZSBhbHJlYWR5IGhhcyBhIHJlbGF0aW9uc2hpcCxcclxuICAgICAgICAvLyByZWdhcmRsZXNzIG9mIHdoZXRoZXIgaXRzIElDSUQgbWF0Y2hlcyB0aGUgaW4tbWVtb3J5IElDSUQuXHJcbiAgICAgICAgY29uc3QgZXhpc3RpbmdSZWxhdGlvbnNoaXAgPSByZWxhdGlvbnNoaXBzLmZpbmQoXHJcbiAgICAgICAgICAgIHJlbGF0aW9uc2hpcCA9PlxyXG4gICAgICAgICAgICAgICAgcmVsYXRpb25zaGlwLmNvbnZlcnNhdGlvbkZpbGUgPT09IGNvbnZlcnNhdGlvbkZpbGVOYW1lLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGlmIChleGlzdGluZ1JlbGF0aW9uc2hpcCkge1xyXG4gICAgICAgICAgICAvLyBUaGlzIGNvbnZlcnNhdGlvbiBmaWxlIGFscmVhZHkgaGFzIGFuIGVzdGFibGlzaGVkIElDSUQuXHJcbiAgICAgICAgICAgIC8vIEFkb3B0IGl0IGluc3RlYWQgb2YgY3JlYXRpbmcgYSBkdXBsaWNhdGUgcmVsYXRpb25zaGlwLlxyXG4gICAgICAgICAgICBpZiAoZXhpc3RpbmdSZWxhdGlvbnNoaXAuaW50ZXJuYWxDaGF0SUQgIT09IGludGVybmFsQ2hhdElEKSB7XHJcbiAgICAgICAgICAgICAgICBzZXRJbnRlcm5hbENoYXRJRChleGlzdGluZ1JlbGF0aW9uc2hpcC5pbnRlcm5hbENoYXRJRCk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFRoZSBleGFjdCByZWxhdGlvbnNoaXAgd2UgaGF2ZSBpbiBtZW1vcnkgaXMgbWlzc2luZyBmcm9tIHRoZSByZWxhdGlvbnNoaXAgZmlsZS4gQ0hPT1NFIE9OTFkgT05FIE9QVElPTiEhXHJcbiAgICAgICAgLy8gVGhhdCBjYW4gb25seSBtZWFuIHRoZSB1c2VyIGRlbGV0ZWQgdGhlIGxvYWQgYmVhcmluZyB1c2VyIG1lc3NhZ2UgYW5kIGRlbGV0ZWQgdGhlIHJlbGF0aW9uc2hpcCBtYW51YWxseVxyXG5cclxuICAgICAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgICAgIC8vIE9QVElPTiAxOiBSRVBBSVIgVEhFIFJFTEFUSU9OU0hJUCBGSUxFIFdJVEggSU4gTUVNT1JZIERBVEEgXHJcbiAgICAgICAgLy8gKG11c3QgY3JlYXRlIGEgbG9jayBmaWxlIHdpdGggaXQncyBpbmhlcmVudCBkZWxheSlcclxuICAgICAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgICAgIHJlbGF0aW9uc2hpcHMucHVzaCh7XHJcbiAgICAgICAgICAgIGludGVybmFsQ2hhdElELFxyXG4gICAgICAgICAgICBjb252ZXJzYXRpb25GaWxlOiBjb252ZXJzYXRpb25GaWxlTmFtZSxcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gS2VlcCBvbmx5IHRoZSBuZXdlc3QgcmVsYXRpb25zaGlwcy5cclxuICAgICAgICBpZiAocmVsYXRpb25zaGlwcy5sZW5ndGggPiByZWxhdGlvbnNoaXBzTGltaXQpIHtcclxuICAgICAgICAgICAgcmVsYXRpb25zaGlwcyA9IHJlbGF0aW9uc2hpcHMuc2xpY2UoLXJlbGF0aW9uc2hpcHNMaW1pdCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBhd2FpdCB3cml0ZUZpbGUoXHJcbiAgICAgICAgICAgIHJlbGF0aW9uc2hpcEZpbGUsXHJcbiAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHJlbGF0aW9uc2hpcHMsIG51bGwsIDIpLFxyXG4gICAgICAgICAgICBcInV0Zi04XCIsXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgcmV0dXJuIHRydWU7XHJcblxyXG4gICAgICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICAgICAgLy8gT1BUSU9OIDI6IFJFU0VUIFRIRSBJTiBNRU1PUlkgREFUQSBTTyBXRSBDQU4gR08gVEhST1VHSCBUSEUgTk9STUFMIFBST0NFU1MgT0YgQ1JFQVRJTkcgQSBCUkFORCBORVcgTElOSyBcclxuICAgICAgICAvLyAobm8gbG9jayBmaWxlIG5lZWRlZCwgbm8gZGVsYXksIGp1c3QgYSBxdWljayByZWFkIG9mIHRoZSByZWxhdGlvbnNoaXAgZmlsZSlcclxuICAgICAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgICAgIC8vIGlmICghcmVsYXRpb25zaGlwKSB7XHJcbiAgICAgICAgLy8gICAgIHNldENvbnZlcnNhdGlvbkZpbGVOYW1lKFwiXCIpO1xyXG4gICAgICAgIC8vICAgICBzZXRJbnRlcm5hbENoYXRJRChcIlwiKTtcclxuICAgICAgICAvLyB9XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAvLyBtb3ZlIGFsb25nXHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgIGlmIChsb2NrT3duZXJOYW1lICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgYXdhaXQgcmVsZWFzZUxvY2sobG9ja0ZpbGUsIGxvY2tPd25lck5hbWUpO1xyXG4gICAgICAgICAgICBsb2NrT3duZXJOYW1lID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gZmFsc2U7XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBTY2FucyBoaXN0b3J5IGZvciBhbnkgZXhpc2l0aW5nIElDSUQuXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBwcm9tcHRQcm9jZXNzb3JTY2FuSGlzdG9yeUZvcklEKFxyXG4gICAgbWVzc2FnZXM6IENoYXRNZXNzYWdlW10sXHJcbik6IFByb21pc2U8c3RyaW5nPiB7XHJcblxyXG4gICAgbGV0IHNlYXJjaGVkSW50ZXJuYWxDaGF0SUQgPSBcIlwiO1xyXG5cclxuICAgIGZvciAoY29uc3QgbWVzc2FnZSBvZiBtZXNzYWdlcykge1xyXG4gICAgICAgIGlmICgobWVzc2FnZSBhcyBhbnkpLmRhdGEucm9sZSAhPT0gXCJ1c2VyXCIpIHtcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBmb3IgKGNvbnN0IGNvbnRlbnQgb2YgKG1lc3NhZ2UgYXMgYW55KS5kYXRhLmNvbnRlbnQgPz8gW10pIHtcclxuICAgICAgICAgICAgaWYgKGNvbnRlbnQudHlwZSAhPT0gXCJ0ZXh0XCIgfHwgIWNvbnRlbnQudGV4dCkge1xyXG4gICAgICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGNvbnN0IG1hdGNoID0gY29udGVudC50ZXh0Lm1hdGNoKFxyXG4gICAgICAgICAgICAgICAgL1xcW0lDSUQ6XFxzKihcXGQrKVxcXS9cclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChtYXRjaCkge1xyXG4gICAgICAgICAgICAgICAgc2VhcmNoZWRJbnRlcm5hbENoYXRJRCA9IG1hdGNoWzFdO1xyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChzZWFyY2hlZEludGVybmFsQ2hhdElEICE9PSBcIlwiKSB7XHJcbiAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuXHJcbiAgICAvLyBTbyBpdCBkb2VzIG5vdCBvdmVyd3JpdGUgYW4gSUNJRCBhbHJlYWR5IGtub3duIGluIG1lbW9yeSwgYnV0IG5vbmUgZXhpc3QgaW4gaGlzdG9yeSh1c2VyIGRlbGV0ZWQgaXQpXHJcbiAgICBpZihzZWFyY2hlZEludGVybmFsQ2hhdElEICE9PSBcIlwiKXtcclxuICAgICAgICBzZXRJbnRlcm5hbENoYXRJRChzZWFyY2hlZEludGVybmFsQ2hhdElEKTtcclxuICAgIH1cclxuXHJcbiAgICByZXR1cm4gc2VhcmNoZWRJbnRlcm5hbENoYXRJRDtcclxufVxyXG5cclxuLyoqXHJcbiAqIElDSUQgbWFya2VyIGluIGhpc3RvcnkgaGFzIGJlZW4gbG9zdCwgd2Ugd2lsbCB0cnkgdG8gcmVjb3ZlciB0aGUgQ0ZOIGZpcnN0IHRocm91Z2ggdmFyaW91cyBtZXRob2RzIHRvXHJcbiAqIHJlLWVzdGFibGlzaCB0aGUgcGFzdCBJQ0lEIHVzZWQuXHJcbiAqIENGTiBhbHJlYWR5IGluIG1lbW9yeSBcdTIxOTIgY2hlY2sgaXQgYWdhaW5zdCB0aGUgcmVsYXRpb25zaGlwIGZpbGVcclxuICogQ0ZOIGluIG1lbW9yeSBtaXNzaW5nIFx1MjE5MiBjaGVjayBXRCBiYXNlIG5hbWUgYWdhaW5zdCByZWxhdGlvbnNoaXAgZmlsZVxyXG4gKiBXRCBCYXNlIE5hbWUgZmFpbHMgY2hlY2sgXHUyMTkyIGNoZWNrIGZyb20gbmV3ZXN0IHRvIG9sZGVzdCBjb252ZXJzYXRpb24gZmlsZXMgdG8gbWF0Y2ggY2xpZW50SW5wdXQgdG8gdXNlclRleHQgPSBtYXRjaCBtZWFucyB3ZSBub3cga25vdyB0aGUgdHJ1ZSBjb252ZXJzYXRpb24gZmlsZSBuYW1lXHJcbiAqIGNoZWNrIGZvciB0aGUgcHJlLWV4aXN0aW5nIHJlbGF0aW9uc2hpcCBpbiB0aGUgcmVsYXRpb25zaGlwIGZpbGUgYW5kIHJldXNlIGl0LiBSZWluamVjdCB0aGUgcmUtZXN0YWJsaXNoZWQgSUNJRC5cclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIHJlY292ZXJJQ0lETXVsdGlTdGVwTWF5YmVTZXRDb252ZXJzYXRpb25GaWxlTmFtZShcclxuICAgIHJvb3REaXJlY3Rvcnk6IHN0cmluZyxcclxuICAgIHdvcmtpbmdEaXJlY3Rvcnk6IHN0cmluZyxcclxuICAgIHVzZXJUZXh0OiBzdHJpbmcsXHJcbik6IFByb21pc2U8Ym9vbGVhbj57XHJcblxyXG4gICAgY29uc3QgY29udmVyc2F0aW9uRmlsZU5hbWUgPSBnZXRDb252ZXJzYXRpb25GaWxlTmFtZSgpO1xyXG4gICAgXHJcbiAgICBjb25zdCBjb252ZXJzYXRpb25EaXJlY3RvcnkgPSBqb2luKFxyXG4gICAgICAgIHJvb3REaXJlY3RvcnksXHJcbiAgICAgICAgXCJjb252ZXJzYXRpb25zXCJcclxuICAgICk7XHJcblxyXG4gICAgLy8gUG9pbnQgdG8gdGhlIHJlbGF0aW9uc2hpcCBmaWxlXHJcbiAgICBjb25zdCByZWxhdGlvbnNoaXBGaWxlID0gam9pbihcclxuICAgICAgICBjb252ZXJzYXRpb25EaXJlY3RvcnksXHJcbiAgICAgICAgXCJDaGF0U2Vzc2lvbkNvbnZlcnNhdGlvblJlbGF0aW9uc2hpcC5qc29uXCIsXHJcbiAgICApO1xyXG5cclxuICAgIC8vIENvbnZlcnNhdGlvbiBGaWxlIE5hbWUgc3RpbGwgYXZhaWxhYmxlIGluIG1lbW9yeVxyXG4gICAgaWYoY29udmVyc2F0aW9uRmlsZU5hbWUgIT09IFwiXCIpIHtcclxuICAgICAgICB0cnl7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlbGF0aW9uc2hpcEpzb24gPSBhd2FpdCByZWFkRmlsZShcclxuICAgICAgICAgICAgICAgIHJlbGF0aW9uc2hpcEZpbGUsXHJcbiAgICAgICAgICAgICAgICBcInV0Zi04XCIsXHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCByZWxhdGlvbnNoaXBzOiBDaGF0U2Vzc2lvbkNvbnZlcnNhdGlvblJlbGF0aW9uc2hpcFtdID1cclxuICAgICAgICAgICAgICAgIEpTT04ucGFyc2UocmVsYXRpb25zaGlwSnNvbik7XHJcblxyXG4gICAgICAgICAgICBjb25zdCByZWxhdGlvbnNoaXAgPSByZWxhdGlvbnNoaXBzLmZpbmQoXHJcbiAgICAgICAgICAgICAgICAocmVsYXRpb25zaGlwKSA9PiByZWxhdGlvbnNoaXAuY29udmVyc2F0aW9uRmlsZSA9PT0gY29udmVyc2F0aW9uRmlsZU5hbWVcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGlmKHJlbGF0aW9uc2hpcCkge1xyXG4gICAgICAgICAgICAgICAgc2V0SW50ZXJuYWxDaGF0SUQocmVsYXRpb25zaGlwLmludGVybmFsQ2hhdElEKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgIH0gY2F0Y2gge1xyXG4gICAgICAgICAgICAvLyBtb3ZlIGFsb25nXHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIC8vIEZBTExCQUNLOiBKVVNUIEEgUVVJQ0sgTE9PSyBVUCBJRiBJVCBXT1JLUyBJVCBXT1JLUywgSUYgTk9UIFRIQVQnUyBBTEwgV0UgQ0FOIERPXHJcbiAgICAvLyBDb252ZXJzYXRpb24gRmlsZSBOYW1lIGZyb20gV29ya2luZyBEaXJlY3RvcnlcclxuICAgIGNvbnN0IGRpcmVjdG9yeUJhc2VOYW1lRnJvbVdEID0gYmFzZW5hbWUod29ya2luZ0RpcmVjdG9yeSk7XHJcblxyXG4gICAgY29uc3QgY29udmVyc2F0aW9uRmlsZU5hbWVXRCA9IGAke2RpcmVjdG9yeUJhc2VOYW1lRnJvbVdEfS5jb252ZXJzYXRpb24uanNvbmA7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgICBjb25zdCByZWxhdGlvbnNoaXBKc29uID0gYXdhaXQgcmVhZEZpbGUoXHJcbiAgICAgICAgICAgIHJlbGF0aW9uc2hpcEZpbGUsXHJcbiAgICAgICAgICAgIFwidXRmLThcIixcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBjb25zdCByZWxhdGlvbnNoaXBzOiBDaGF0U2Vzc2lvbkNvbnZlcnNhdGlvblJlbGF0aW9uc2hpcFtdID1cclxuICAgICAgICAgICAgSlNPTi5wYXJzZShyZWxhdGlvbnNoaXBKc29uKTtcclxuXHJcbiAgICAgICAgY29uc3QgcmVsYXRpb25zaGlwID0gcmVsYXRpb25zaGlwcy5maW5kKFxyXG4gICAgICAgICAgICAocmVsYXRpb25zaGlwKSA9PiByZWxhdGlvbnNoaXAuY29udmVyc2F0aW9uRmlsZSA9PT0gY29udmVyc2F0aW9uRmlsZU5hbWVXRFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGlmKHJlbGF0aW9uc2hpcCkge1xyXG4gICAgICAgICAgICBzZXRJbnRlcm5hbENoYXRJRChyZWxhdGlvbnNoaXAuaW50ZXJuYWxDaGF0SUQpO1xyXG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcclxuICAgICAgICB9XHJcbiAgICB9IGNhdGNoIHtcclxuICAgICAgICAvLyBtb3ZlIGFsb25nXHJcbiAgICB9XHJcblxyXG4gICAgLy8gQ2hlY2sgY2xpZW50SW5wdXQgb2YgYWxsIHRoZSBjb252ZXJzYXRpb25zIGluIGRpcmVjdG9yeSBzdGFydGluZyBmcm9tIHRoZSBuZXdlc3QgY29udmVyc2F0aW9uIGZpbGVcclxuICAgIC8vIE5vIGF1dGhvcml0eSB0byBvdmVyd3JpdGUsIGp1c3QgY29tcGFyaW5nIHRoZSBjb252ZXJzYXRpb24gZmlsZSBmb3VuZCB0byB0aGUgcmVsYXRpb25zaGlwIGZpbGVcclxuICAgIGNvbnN0IGFsbENvbnZlcnNhdGlvbkZpbGVzID0gYXdhaXQgZmluZEFsbENvbnZlcnNhdGlvbkZpbGVzKGNvbnZlcnNhdGlvbkRpcmVjdG9yeSk7XHJcblxyXG4gICAgZm9yIChjb25zdCBjb252ZXJzYXRpb25GaWxlIG9mIGFsbENvbnZlcnNhdGlvbkZpbGVzKSB7XHJcblxyXG4gICAgICAgIGNvbnN0IGNvbnZlcnNhdGlvbkpzb24gPSBhd2FpdCByZWFkRmlsZShcclxuICAgICAgICAgICAgY29udmVyc2F0aW9uRmlsZSxcclxuICAgICAgICAgICAgXCJ1dGYtOFwiLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIC8vIEZpbmQgYSBtYXRjaGluZyBjbGllbnRJbnB1dCB0ZXh0IHRoYXQgbWF0Y2hlcyB0aGUgbWFqb3JpdHkgb2YgdGhlIHVzZXIncyBpbnB1dFxyXG4gICAgICAgIC8vIFNvbWV0aW1lcyBjbGllbnRJbnB1dCBkaWQgbm90IGZ1bGx5IHJlZ2lzdGVyIGFsbCBvZiB0aGUgdXNlcidzIGlucHV0IGJ5IHRoZSB0aW1lIHdlIHJlYWQgaXRcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBjb252ZXJzYXRpb24gPSBKU09OLnBhcnNlKGNvbnZlcnNhdGlvbkpzb24pO1xyXG5cclxuICAgICAgICAgICAgY29uc3Qgbm9ybWFsaXplID0gKHM6IHN0cmluZyk6IHN0cmluZyA9PlxyXG4gICAgICAgICAgICAgICAgKHMgPz8gXCJcIilcclxuICAgICAgICAgICAgICAgICAgICAudHJpbSgpXHJcbiAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xccysvZywgXCIgXCIpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgY2xpZW50SW5wdXQgPSBub3JtYWxpemUoY29udmVyc2F0aW9uLmNsaWVudElucHV0KTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGlucHV0ID0gbm9ybWFsaXplKHVzZXJUZXh0KTtcclxuXHJcbiAgICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgICAgIGNsaWVudElucHV0Lmxlbmd0aCA+IDAgJiZcclxuICAgICAgICAgICAgICAgIGlucHV0LnN0YXJ0c1dpdGgoY2xpZW50SW5wdXQpXHJcbiAgICAgICAgICAgICkge1xyXG4gICAgICAgICAgICAgICAgLy8gSWYgd2UgYWxyZWFkeSBleHBlbmRlbmQgdGhlIHByb2Nlc3NpbmcgcG93ZXIgdG8gY29uZmlybSB0aGUgY29udmVyc2F0aW9uIGZpbGUgbmFtZVxyXG4gICAgICAgICAgICAgICAgLy8gd2UgbWlnaHQgYXMgd2VsbCBzZXQgaXQuXHJcbiAgICAgICAgICAgICAgICBzZXRDb252ZXJzYXRpb25GaWxlTmFtZShcclxuICAgICAgICAgICAgICAgICAgICBub3JtYWxpemVKc29uRmlsZU5hbWUoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGdldENvbnZlcnNhdGlvblJlbGF0aXZlUGF0aChcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnZlcnNhdGlvbkRpcmVjdG9yeSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnZlcnNhdGlvbkZpbGUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICksXHJcbiAgICAgICAgICAgICAgICAgICAgKSxcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgICAgICBcclxuICAgICAgICAgICAgICAgIC8vIENoZWNrIHJlbGF0aW9uc2hpcCBmaWxlIGZvciBhIG1hdGNoaW5nIGludGVybmFsIGNoYXQgSURcclxuICAgICAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVsYXRpb25zaGlwSnNvbiA9IGF3YWl0IHJlYWRGaWxlKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICByZWxhdGlvbnNoaXBGaWxlLFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBcInV0Zi04XCIsXHJcbiAgICAgICAgICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVsYXRpb25zaGlwczogQ2hhdFNlc3Npb25Db252ZXJzYXRpb25SZWxhdGlvbnNoaXBbXSA9XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIEpTT04ucGFyc2UocmVsYXRpb25zaGlwSnNvbik7XHJcblxyXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlbGF0aW9uc2hpcCA9IHJlbGF0aW9uc2hpcHMuZmluZChcclxuICAgICAgICAgICAgICAgICAgICAgICAgKHJlbGF0aW9uc2hpcCkgPT4gcmVsYXRpb25zaGlwLmNvbnZlcnNhdGlvbkZpbGUgPT09IGdldENvbnZlcnNhdGlvbkZpbGVOYW1lKClcclxuICAgICAgICAgICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICBpZihyZWxhdGlvbnNoaXApIHtcclxuICAgICAgICAgICAgICAgICAgICAgICAgc2V0SW50ZXJuYWxDaGF0SUQocmVsYXRpb25zaGlwLmludGVybmFsQ2hhdElEKTtcclxuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgfSBjYXRjaCB7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gbW92ZSBhbG9uZ1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGJyZWFrO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBjYXRjaCB7XHJcbiAgICAgICAgICAgIC8vIElnbm9yZSBtYWxmb3JtZWQgY29udmVyc2F0aW9uIGZpbGVzIGFuZCBjb250aW51ZSBzY2FubmluZy5cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG59XHJcblxyXG4vKipcclxuICogQ2hlYXAgY2hlY2sgdG8gc2VlIGlmIGEgY29udmVyc2F0aW9uIGZpbGUgbmFtZSBjYW4gYmUgZGVyaXZlZCBmcm9tIHRoZSB3b3JraW5nIGRpcmVjdG9yeSBiYXNlIG5hbWVcclxuICogV0QgYmFzZSBuYW1lIHNvbWV0aW1lcyBoYXMgcmFuZG9tIGFscGhhbnVtZXJpYyBzdWZmaXhlc1xyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gcHJvbXB0UHJvY2Vzc29yVHJ5V29ya2luZ0RpcmVjdG9yeUJhc2VOYW1lTG9va3VwSW5SZWxhdGlvbnNoaXBGaWxlKFxyXG4gICAgcm9vdERpcmVjdG9yeTogc3RyaW5nLFxyXG4gICAgd29ya2luZ0RpcmVjdG9yeTogc3RyaW5nLFxyXG4pOlByb21pc2U8dm9pZD4ge1xyXG5cclxuICAgIC8vIENvbnN0cnVjdCB0aGUgcGF0aCB0byB0aGUgY29udmVyc2F0aW9uIGZvbGRlclxyXG4gICAgY29uc3QgY29udmVyc2F0aW9uRGlyZWN0b3J5ID0gam9pbihcclxuICAgICAgICByb290RGlyZWN0b3J5LFxyXG4gICAgICAgIFwiY29udmVyc2F0aW9uc1wiLFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBQb2ludCB0byB0aGUgcmVsYXRpb25zaGlwIGZpbGVcclxuICAgIGNvbnN0IHJlbGF0aW9uc2hpcEZpbGUgPSBqb2luKFxyXG4gICAgICAgIGNvbnZlcnNhdGlvbkRpcmVjdG9yeSxcclxuICAgICAgICBcIkNoYXRTZXNzaW9uQ29udmVyc2F0aW9uUmVsYXRpb25zaGlwLmpzb25cIixcclxuICAgICk7XHJcblxyXG4gICAgLy8gRXh0cmFjdCB0aGUgYmFzZW5hbWUgb2YgdGhlIHdvcmtpbmcgZGlyZWN0b3J5XHJcbiAgICBjb25zdCB3b3JraW5nRGlyZWN0b3J5QmFzZU5hbWUgPSBiYXNlbmFtZSh3b3JraW5nRGlyZWN0b3J5KTtcclxuXHJcbiAgICAvLyBQb2ludCB0byB0aGUgcG90ZW50aWFsIGNvbnZlcnNhdGlvbiBmaWxlXHJcbiAgICBjb25zdCBjb252ZXJzYXRpb25GaWxlTmFtZSA9IGAke3dvcmtpbmdEaXJlY3RvcnlCYXNlTmFtZX0uY29udmVyc2F0aW9uLmpzb25gO1xyXG5cclxuICAgIC8vIFRyeSB0byByZWFkIHRoZSByZWxhdGlvbnNoaXAgZmlsZVxyXG4gICAgdHJ5IHtcclxuICAgICAgICBjb25zdCByZWxhdGlvbnNoaXBKc29uID0gYXdhaXQgcmVhZEZpbGUoXHJcbiAgICAgICAgICAgIHJlbGF0aW9uc2hpcEZpbGUsXHJcbiAgICAgICAgICAgIFwidXRmLThcIixcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBjb25zdCByZWxhdGlvbnNoaXBzOiBDaGF0U2Vzc2lvbkNvbnZlcnNhdGlvblJlbGF0aW9uc2hpcFtdID1cclxuICAgICAgICAgICAgSlNPTi5wYXJzZShyZWxhdGlvbnNoaXBKc29uKTtcclxuXHJcbiAgICAgICAgLy8gU2VhcmNoIGZyb20gbmV3ZXN0IHRvIG9sZGVzdC5cclxuICAgICAgICAvLyBHcmFiIHRoZSBuZXdlc3QgcmVsYXRpb25zaGlwIHRoYXQgbWF0Y2hlcyB0aGUgY292ZXJzYXRpb24gZmlsZSBuYW1lXHJcbiAgICAgICAgLy8gVGhlcmUgY2Fubm90IGJlIHR3byBjb252ZXJzYXRpb25zIGZpbGVzIHdpdGggdGhlIHNhbWUgZXhhY3QgbmFtZSBpbiBhIGZvbGRlclxyXG4gICAgICAgIC8vIEF0IHdvcnN0IHdlIGFyZSBnb2luZyB0byByZXVzZSBhbiBhYmFuZG9uZWQgSUNJRCByYXRoZXIgdGhhbiBtYWtpbmcgYSBuZXcgb25lXHJcbiAgICAgICAgZm9yIChcclxuICAgICAgICAgICAgbGV0IGkgPSByZWxhdGlvbnNoaXBzLmxlbmd0aCAtIDE7XHJcbiAgICAgICAgICAgIGkgPj0gMDtcclxuICAgICAgICAgICAgaS0tXHJcbiAgICAgICAgKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlbGF0aW9uc2hpcCA9IHJlbGF0aW9uc2hpcHNbaV07XHJcblxyXG4gICAgICAgICAgICBpZiAocmVsYXRpb25zaGlwLmNvbnZlcnNhdGlvbkZpbGUgPT09IGNvbnZlcnNhdGlvbkZpbGVOYW1lKSB7XHJcblxyXG4gICAgICAgICAgICAgICAgLy8gSWYgdGhlIGNvbnZlcnNhdGlvbiBmaWxlIGlzIG1hdGNoZWQsIHNldCB0aGUgY29udmVyc2F0aW9uIGZpbGUgbmFtZSBpbiBtZW1vcnlcclxuICAgICAgICAgICAgICAgIHNldENvbnZlcnNhdGlvbkZpbGVOYW1lKG5vcm1hbGl6ZUpzb25GaWxlTmFtZShjb252ZXJzYXRpb25GaWxlTmFtZSkpO1xyXG5cclxuICAgICAgICAgICAgICAgIC8vIElmIGEgbWF0Y2hpbmcgcmVsYXRpb25zaGlwIGlzIGZvdW5kLCByZXR1cm4gaXRzIGludGVybmFsQ2hhdElEXHJcbiAgICAgICAgICAgICAgICBzZXRJbnRlcm5hbENoYXRJRChyZWxhdGlvbnNoaXAuaW50ZXJuYWxDaGF0SUQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKFwicHJvbXB0UHJvY2Vzc29yVHJ5V29ya2luZ0RpcmVjdG9yeUJhc2VOYW1lTG9va3VwSW5SZWxhdGlvbnNoaXBGaWxlIGVycm9yOlwiLCBlcnJvcik7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBRdWljayBjaGVjayB0byBtYXRjaCBhbiBpbnRlcm5hbCBjaGF0IElEIGFnYWluc3QgdGhlIHJlbGF0aW9uc2hpcCBmaWxlIHRvIGRlcml2ZSB0aGUgY29udmVyc2F0aW9uIGZpbGUgbmFtZVxyXG4gKi9cclxuYXN5bmMgZnVuY3Rpb24gcHJvbXB0UHJvY2Vzc29yTWF0Y2hJQ0lESW5SZWxhdGlvbnNoaXBGaWxlKFxyXG4gICAgcm9vdERpcmVjdG9yeTogc3RyaW5nLFxyXG4pOiBQcm9taXNlPHZvaWQ+IHtcclxuXHJcbiAgICAvLyBDb25zdHJ1Y3QgdGhlIHBhdGggdG8gdGhlIGNvbnZlcnNhdGlvbiBmb2xkZXJcclxuICAgIGNvbnN0IGNvbnZlcnNhdGlvbkRpcmVjdG9yeSA9IGpvaW4oXHJcbiAgICAgICAgcm9vdERpcmVjdG9yeSxcclxuICAgICAgICBcImNvbnZlcnNhdGlvbnNcIixcclxuICAgICk7XHJcblxyXG4gICAgLy8gUG9pbnQgdG8gdGhlIHJlbGF0aW9uc2hpcCBmaWxlXHJcbiAgICBjb25zdCByZWxhdGlvbnNoaXBGaWxlID0gam9pbihcclxuICAgICAgICBjb252ZXJzYXRpb25EaXJlY3RvcnksXHJcbiAgICAgICAgXCJDaGF0U2Vzc2lvbkNvbnZlcnNhdGlvblJlbGF0aW9uc2hpcC5qc29uXCIsXHJcbiAgICApO1xyXG5cclxuICAgIC8vIEZldGNoIGN1cnJlbnQgaW50ZXJuYWwgY2hhdCBJRFxyXG4gICAgY29uc3QgY3VycmVudEludGVybmFsQ2hhdElEID0gZ2V0SW50ZXJuYWxDaGF0SUQoKTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICAgIGNvbnN0IHJlbGF0aW9uc2hpcEpzb24gPSBhd2FpdCByZWFkRmlsZShcclxuICAgICAgICAgICAgcmVsYXRpb25zaGlwRmlsZSxcclxuICAgICAgICAgICAgXCJ1dGYtOFwiLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGNvbnN0IHJlbGF0aW9uc2hpcHM6IENoYXRTZXNzaW9uQ29udmVyc2F0aW9uUmVsYXRpb25zaGlwW10gPVxyXG4gICAgICAgICAgICBKU09OLnBhcnNlKHJlbGF0aW9uc2hpcEpzb24pO1xyXG5cclxuICAgICAgICBjb25zdCByZWxhdGlvbnNoaXAgPSByZWxhdGlvbnNoaXBzLmZpbmQoXHJcbiAgICAgICAgICAgIChyZWxhdGlvbnNoaXApID0+IHJlbGF0aW9uc2hpcC5pbnRlcm5hbENoYXRJRCA9PT0gY3VycmVudEludGVybmFsQ2hhdElEXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgaWYgKHJlbGF0aW9uc2hpcCkge1xyXG5cclxuICAgICAgICAgICAgLy8gSWYgYSBtYXRjaGluZyByZWxhdGlvbnNoaXAgaXMgZm91bmQsIHNldCBpdCdzIGNvbnZlcnNhdGlvbiBmaWxlIG5hbWVcclxuICAgICAgICAgICAgc2V0Q29udmVyc2F0aW9uRmlsZU5hbWUobm9ybWFsaXplSnNvbkZpbGVOYW1lKHJlbGF0aW9uc2hpcC5jb252ZXJzYXRpb25GaWxlKSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgICBjb25zb2xlLmVycm9yKGBwcm9tcHRQcm9jZXNzb3JNYXRjaElDSURJblJlbGF0aW9uc2hpcEZpbGUgZXJyb3I6ICR7ZXJyb3IubWVzc2FnZX1gKTtcclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIENoZWNrIHRvIHNlZSBpZiBXb3JraW5nIERpcmVjdG9yeSBiYXNlIG5hbWUgbGlua3MgdG8gYSBjb252ZXJzYXRpb24gZmlsZSwgaWYgaXQgZG9lcyBjaGVjayBmb3IgdGhlIElDSURcclxuICogb3IgY2xpZW50SW5wdXQgaW4gdGhlIGZpbGUgdG8gdmFsaWRhdGUgdGhlIGNvbnZlcnNhdGlvbiBmaWxlIG5hbWVcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIHByb21wdFByb2Nlc3NvclRyeVdvcmtpbmdEaXJlY3RvcnlDb252ZXJzYXRpb25GaWxlKFxyXG4gICAgcm9vdERpcmVjdG9yeTogc3RyaW5nLFxyXG4gICAgd29ya2luZ0RpcmVjdG9yeTogc3RyaW5nLFxyXG4gICAgdXNlclRleHQ6IHN0cmluZyxcclxuKTpQcm9taXNlPHZvaWQ+IHtcclxuXHJcbiAgICAvLyBDb25zdHJ1Y3QgdGhlIHBhdGggdG8gdGhlIGNvbnZlcnNhdGlvbiBmb2xkZXJcclxuICAgIGNvbnN0IGNvbnZlcnNhdGlvbkRpcmVjdG9yeSA9IGpvaW4oXHJcbiAgICAgICAgcm9vdERpcmVjdG9yeSxcclxuICAgICAgICBcImNvbnZlcnNhdGlvbnNcIixcclxuICAgICk7XHJcblxyXG4gICAgLy8gRXh0cmFjdCB0aGUgYmFzZW5hbWUgb2YgdGhlIHdvcmtpbmcgZGlyZWN0b3J5XHJcbiAgICBjb25zdCB3b3JraW5nRGlyZWN0b3J5QmFzZU5hbWUgPSBiYXNlbmFtZSh3b3JraW5nRGlyZWN0b3J5KTtcclxuXHJcbiAgICAvLyBQb2ludCB0byB0aGUgcG90ZW50aWFsIGNvbnZlcnNhdGlvbiBmaWxlXHJcbiAgICBjb25zdCBjb252ZXJzYXRpb25GaWxlTmFtZSA9IGAke3dvcmtpbmdEaXJlY3RvcnlCYXNlTmFtZX0uY29udmVyc2F0aW9uLmpzb25gO1xyXG5cclxuICAgIC8vIENvbnN0cnVjdCB0aGUgcGF0aCB0byB0aGUgY29udmVyc2F0aW9uIGZpbGVcclxuICAgIGNvbnN0IGNvbnZlcnNhdGlvbkZpbGVQYXRoID0gam9pbihcclxuICAgICAgICBjb252ZXJzYXRpb25EaXJlY3RvcnksXHJcbiAgICAgICAgY29udmVyc2F0aW9uRmlsZU5hbWUsXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IGN1cnJlbnRJbnRlcm5hbENoYXRJRCA9IGdldEludGVybmFsQ2hhdElEKCk7XHJcblxyXG4gICAgdHJ5IHtcclxuXHJcbiAgICAgICAgLy8gUGFyc2UgdGhlIGNvbnZlcnNhdGlvbiBmaWxlXHJcbiAgICAgICAgY29uc3QgY29udmVyc2F0aW9uSnNvbiA9IGF3YWl0IHJlYWRGaWxlKFxyXG4gICAgICAgICAgICBjb252ZXJzYXRpb25GaWxlUGF0aCxcclxuICAgICAgICAgICAgXCJ1dGYtOFwiLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGNvbnN0IGNvbnZlcnNhdGlvbiA9IEpTT04ucGFyc2UoY29udmVyc2F0aW9uSnNvbik7XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGZvciB0aGUgZW1iZWRkZWQgSUNJRFxyXG4gICAgICAgIGNvbnN0IGludGVybmFsQ2hhdElEUGF0dGVybiA9IG5ldyBSZWdFeHAoXHJcbiAgICAgICAgICAgIGBcXFxcW0lDSUQ6XFxcXHMqJHtjdXJyZW50SW50ZXJuYWxDaGF0SUR9XFxcXF1gLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGlmIChpbnRlcm5hbENoYXRJRFBhdHRlcm4udGVzdChjb252ZXJzYXRpb25Kc29uKSkge1xyXG4gICAgICAgICAgICBzZXRDb252ZXJzYXRpb25GaWxlTmFtZShub3JtYWxpemVKc29uRmlsZU5hbWUoY29udmVyc2F0aW9uRmlsZU5hbWUpKTtcclxuXHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGlmIHRoZSBjb252ZXJzYXRpb24gZmlsZSBoYXMgYSBtYXRjaGluZyBjbGllbnRJbnB1dFxyXG4gICAgICAgIGNvbnN0IG5vcm1hbGl6ZSA9IChzOiBzdHJpbmcpOiBzdHJpbmcgPT5cclxuICAgICAgICAgICAgKHMgPz8gXCJcIilcclxuICAgICAgICAgICAgICAgIC50cmltKClcclxuICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXHMrL2csIFwiIFwiKTtcclxuXHJcbiAgICAgICAgY29uc3QgY2xpZW50SW5wdXQgPSBub3JtYWxpemUoY29udmVyc2F0aW9uLmNsaWVudElucHV0KTtcclxuXHJcbiAgICAgICAgY29uc3QgaW5wdXQgPSBub3JtYWxpemUodXNlclRleHQpO1xyXG5cclxuICAgICAgICAvLyBGaW5kIGEgbWF0Y2hpbmcgY2xpZW50SW5wdXQgdGV4dCB0aGF0IG1hdGNoZXMgdGhlIG1ham9yaXR5IG9mIHRoZSB1c2VyJ3MgaW5wdXRcclxuICAgICAgICAvLyBTb21ldGltZXMgY2xpZW50SW5wdXQgZGlkIG5vdCBmdWxseSByZWdpc3RlciBhbGwgb2YgdGhlIHVzZXIncyBpbnB1dCBieSB0aGUgdGltZSB3ZSByZWFkIGl0XHJcbiAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICBjbGllbnRJbnB1dC5sZW5ndGggPiAwICYmXHJcbiAgICAgICAgICAgIGlucHV0LnN0YXJ0c1dpdGgoY2xpZW50SW5wdXQpXHJcbiAgICAgICAgKSB7XHJcbiAgICAgICAgICAgIHNldENvbnZlcnNhdGlvbkZpbGVOYW1lKG5vcm1hbGl6ZUpzb25GaWxlTmFtZShjb252ZXJzYXRpb25GaWxlTmFtZSkpO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgICAgaWYgKGVycm9yLmNvZGUgIT09IFwiRU5PRU5UXCIpIHtcclxuICAgICAgICAgICAgdGhyb3cgZXJyb3I7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBGaWxlIGRvZXNuJ3QgZXhpc3QgXHUyMDE0IHNpbGVudGx5IG1vdmUgYWxvbmcuXHJcbiAgICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBFeHBlbnNpdmUgZnVsbCBkaXJlY3Rvcnkgc2NhbiBvZiBhbGwgY29udmVyc2F0aW9uIGZpbGVzIGZyb20gbmV3ZXN0IHRvIG9sZGVzdCB1bnRpbCBhIG1hdGNoIGlzIGZvdW5kIGJldHdlZW5cclxuICogdGhlIHVzZXIncyBpbnB1dCBhbmQgYSBjb252ZXJzYXRpb24gZmlsZSdzIGNsaWVudElucHV0IG9yIElDSUQgbWFya2VyLlxyXG4gKiBIaWdoZXN0IGF1dGhvcml0eSB0byByZXdyaXRlIHRoZSByZWxhdGlvbnNoaXAgZmlsZSB0byB1cGRhdGUgb3IgcmVtb3ZlIG1pc21hdGNoZWQgcGFpcnMuXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2NhbkZvckNvbnZlcnNhdGlvbkZpbGVUaHJ1RnVsbENvbnZlcnNhdGlvbkRpcmVjdG9yeVNjYW4oXHJcbiAgICByb290RGlyZWN0b3J5OiBzdHJpbmcsXHJcbiAgICB1c2VyVGV4dDogc3RyaW5nLFxyXG4pOlByb21pc2U8dm9pZD4ge1xyXG5cclxuICAgIGNvbnN0IGNvbnZlcnNhdGlvbkRpcmVjdG9yeSA9IGpvaW4oXHJcbiAgICAgICAgcm9vdERpcmVjdG9yeSxcclxuICAgICAgICBcImNvbnZlcnNhdGlvbnNcIlxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBhbGxDb252ZXJzYXRpb25GaWxlcyA9IGF3YWl0IGZpbmRBbGxDb252ZXJzYXRpb25GaWxlcyhjb252ZXJzYXRpb25EaXJlY3RvcnkpO1xyXG5cclxuICAgIGNvbnN0IGN1cnJlbnRJbnRlcm5hbENoYXRJRCA9IGdldEludGVybmFsQ2hhdElEKCk7XHJcblxyXG4gICAgY29uc3QgaW50ZXJuYWxDaGF0SURQYXR0ZXJuID0gbmV3IFJlZ0V4cChcclxuICAgICAgICBgXFxcXFtJQ0lEOlxcXFxzKiR7Y3VycmVudEludGVybmFsQ2hhdElEfVxcXFxdYCxcclxuICAgICk7XHJcblxyXG4gICAgZm9yIChjb25zdCBjb252ZXJzYXRpb25GaWxlIG9mIGFsbENvbnZlcnNhdGlvbkZpbGVzKSB7XHJcblxyXG4gICAgICAgIGNvbnN0IGNvbnZlcnNhdGlvbkpzb24gPSBhd2FpdCByZWFkRmlsZShcclxuICAgICAgICAgICAgY29udmVyc2F0aW9uRmlsZSxcclxuICAgICAgICAgICAgXCJ1dGYtOFwiLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGZvciB0aGUgZW1iZWRkZWQgSUNJRFxyXG4gICAgICAgIGlmIChpbnRlcm5hbENoYXRJRFBhdHRlcm4udGVzdChjb252ZXJzYXRpb25Kc29uKSkge1xyXG5cclxuICAgICAgICAgICAgc2V0Q29udmVyc2F0aW9uRmlsZU5hbWUoXHJcbiAgICAgICAgICAgICAgICBub3JtYWxpemVKc29uRmlsZU5hbWUoXHJcbiAgICAgICAgICAgICAgICAgICAgZ2V0Q29udmVyc2F0aW9uUmVsYXRpdmVQYXRoKFxyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb252ZXJzYXRpb25EaXJlY3RvcnksXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnZlcnNhdGlvbkZpbGUsXHJcbiAgICAgICAgICAgICAgICAgICAgKSxcclxuICAgICAgICAgICAgICAgICksXHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBicmVhaztcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIEZpbmQgYSBtYXRjaGluZyBjbGllbnRJbnB1dCB0ZXh0IHRoYXQgbWF0Y2hlcyB0aGUgbWFqb3JpdHkgb2YgdGhlIHVzZXIncyBpbnB1dFxyXG4gICAgICAgIC8vIFNvbWV0aW1lcyBjbGllbnRJbnB1dCBkaWQgbm90IGZ1bGx5IHJlZ2lzdGVyIGFsbCBvZiB0aGUgdXNlcidzIGlucHV0IGJ5IHRoZSB0aW1lIHdlIHJlYWQgaXRcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBjb252ZXJzYXRpb24gPSBKU09OLnBhcnNlKGNvbnZlcnNhdGlvbkpzb24pO1xyXG5cclxuICAgICAgICAgICAgY29uc3Qgbm9ybWFsaXplID0gKHM6IHN0cmluZyk6IHN0cmluZyA9PlxyXG4gICAgICAgICAgICAgICAgKHMgPz8gXCJcIilcclxuICAgICAgICAgICAgICAgICAgICAudHJpbSgpXHJcbiAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xccysvZywgXCIgXCIpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgY2xpZW50SW5wdXQgPSBub3JtYWxpemUoY29udmVyc2F0aW9uLmNsaWVudElucHV0KTtcclxuICAgICAgICAgICAgY29uc3QgaW5wdXQgPSBub3JtYWxpemUodXNlclRleHQpO1xyXG5cclxuICAgICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICAgICAgY2xpZW50SW5wdXQubGVuZ3RoID4gMCAmJlxyXG4gICAgICAgICAgICAgICAgaW5wdXQuc3RhcnRzV2l0aChjbGllbnRJbnB1dClcclxuICAgICAgICAgICAgKSB7XHJcbiAgICAgICAgICAgICAgICBzZXRDb252ZXJzYXRpb25GaWxlTmFtZShcclxuICAgICAgICAgICAgICAgICAgICBub3JtYWxpemVKc29uRmlsZU5hbWUoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGdldENvbnZlcnNhdGlvblJlbGF0aXZlUGF0aChcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnZlcnNhdGlvbkRpcmVjdG9yeSxcclxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnZlcnNhdGlvbkZpbGUsXHJcbiAgICAgICAgICAgICAgICAgICAgICAgICksXHJcbiAgICAgICAgICAgICAgICAgICAgKSxcclxuICAgICAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgfSBjYXRjaCB7XHJcbiAgICAgICAgICAgIC8vIElnbm9yZSBtYWxmb3JtZWQgY29udmVyc2F0aW9uIGZpbGVzIGFuZCBjb250aW51ZSBzY2FubmluZy5cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgLy8gUG9pbnQgdG8gdGhlIHJlbGF0aW9uc2hpcCBmaWxlXHJcbiAgICBjb25zdCByZWxhdGlvbnNoaXBGaWxlID0gam9pbihcclxuICAgICAgICBjb252ZXJzYXRpb25EaXJlY3RvcnksXHJcbiAgICAgICAgXCJDaGF0U2Vzc2lvbkNvbnZlcnNhdGlvblJlbGF0aW9uc2hpcC5qc29uXCIsXHJcbiAgICApO1xyXG5cclxuICAgIGxldCBsb2NrT3duZXJOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XHJcblxyXG4gICAgY29uc3QgbG9ja0ZpbGUgPSBgJHtyZWxhdGlvbnNoaXBGaWxlfS5sb2NrYDtcclxuXHJcbiAgICBjb25zdCBmdW5jdGlvbk5hbWUgPSBcInNjYW5Gb3JDb252ZXJzYXRpb25GaWxlVGhydUZ1bGxDb252ZXJzYXRpb25EaXJlY3RvcnlTY2FuXCI7XHJcblxyXG4gICAgLy8gV2Ugc2hvdWxkIG5vdyBoYXZlIGJvdGggSUNJRCBhbmQgQ29udmVyc2F0aW9uRmlsZU5hbWUgaW4gbWVtb3J5XHJcbiAgICAvLyBDaGVjayB0aGUgcmVsYXRpb25zaGlwIGZpbGUgaWYgaXQgYWxyZWFkeSBleGlzdHMsIGlmIG5vdCB3ZSBuZWVkIHRvIGNyZWF0ZSBpdFxyXG4gICAgdHJ5IHtcclxuICAgICAgICBsb2NrT3duZXJOYW1lID0gYXdhaXQgYWNxdWlyZUxvY2sobG9ja0ZpbGUsIGZ1bmN0aW9uTmFtZSk7XHJcblxyXG4gICAgICAgIGxldCByZXNvbHZlZENvbnZlcnNhdGlvbkZpbGVOYW1lID0gZ2V0Q29udmVyc2F0aW9uRmlsZU5hbWUoKTtcclxuICAgICAgICBsZXQgcmVzb2x2ZWRJbnRlcm5hbENoYXRJRCA9IGdldEludGVybmFsQ2hhdElEKCk7XHJcblxyXG4gICAgICAgIC8vIEV4aXQgZG9uJ3QgYXR0ZW1wdCB0byB3cml0ZVxyXG4gICAgICAgIGlmIChyZXNvbHZlZENvbnZlcnNhdGlvbkZpbGVOYW1lID09PSBcIlwiIHx8IHJlc29sdmVkSW50ZXJuYWxDaGF0SUQgPT09IFwiXCIpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgY29uc3QgcmVsYXRpb25zaGlwSnNvbiA9IGF3YWl0IHJlYWRGaWxlKFxyXG4gICAgICAgICAgICByZWxhdGlvbnNoaXBGaWxlLFxyXG4gICAgICAgICAgICBcInV0Zi04XCIsXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgY29uc3QgcmVsYXRpb25zaGlwczogQ2hhdFNlc3Npb25Db252ZXJzYXRpb25SZWxhdGlvbnNoaXBbXSA9XHJcbiAgICAgICAgICAgIEpTT04ucGFyc2UocmVsYXRpb25zaGlwSnNvbik7XHJcblxyXG4gICAgICAgIGNvbnN0IHJlbGF0aW9uc2hpcCA9IHJlbGF0aW9uc2hpcHMuZmluZChcclxuICAgICAgICAgICAgKHJlbGF0aW9uc2hpcCkgPT4gcmVsYXRpb25zaGlwLmludGVybmFsQ2hhdElEID09PSByZXNvbHZlZEludGVybmFsQ2hhdElEICYmXHJcbiAgICAgICAgICAgICAgICByZWxhdGlvbnNoaXAuY29udmVyc2F0aW9uRmlsZSA9PT0gcmVzb2x2ZWRDb252ZXJzYXRpb25GaWxlTmFtZSxcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGV5IGFscmVhZHkgcGVyZmVjdGx5IG1hdGNoIHdlIGRvbid0IG5lZWQgdG8gZG8gYW55dGhpbmdcclxuICAgICAgICBpZiAocmVsYXRpb25zaGlwKSB7XHJcbiAgICAgICAgICAgIHNldENvbnZlcnNhdGlvbkZpbGVOYW1lKG5vcm1hbGl6ZUpzb25GaWxlTmFtZShyZWxhdGlvbnNoaXAuY29udmVyc2F0aW9uRmlsZSkpO1xyXG4gICAgICAgICAgICBzZXRJbnRlcm5hbENoYXRJRChyZWxhdGlvbnNoaXAuaW50ZXJuYWxDaGF0SUQpO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIC8vIENoZWNrIHdoZXRoZXIgdGhpcyBjb252ZXJzYXRpb24gZmlsZSBhbHJlYWR5IGhhcyBhIHJlbGF0aW9uc2hpcCxcclxuICAgICAgICAgICAgLy8gcmVnYXJkbGVzcyBvZiB3aGV0aGVyIGl0cyBJQ0lEIG1hdGNoZXMgdGhlIGluLW1lbW9yeSBJQ0lELlxyXG4gICAgICAgICAgICAvLyBUaGlzIGNvZGUgc25pcHBldCB3YXMgdG8gYWRkcmVzcyB0aGUgY29tcGFuaW9uIHBsdWdpbiB3aGljaCBzaGFyZXMgdGhlIHNhbWUgbG9naWMgZnJvbVxyXG4gICAgICAgICAgICAvLyBhc3NpZ25pbmcgaXQncyBvd24gdG8gdGhlIGZpbGUgaWYgdGhlIHdpbm5lciBhbHJlYWR5IGVzdGFibGlzaGVkIGFuZCBpY2lkIGluIHRoZSByZWxhdGlvbnNoaXAgZmlsZVxyXG4gICAgICAgICAgICAvLyBhdCB0aGUgZm9sbG93aW5nIHNlY29uZCB1bml4IHRpbWVzdGFtcC4gaW1hZ2luZSAxMCBtcyBiZWZvcmUgdGhlIG5leHQgc2Vjb25kIHRpY2tzIGFuZCB0aGUgbG9zZXIgbGFnZ2VkIGJlaGluZCBvZlxyXG4gICAgICAgICAgICAvLyBhbmQgY3JlYXRlZCBhIG5ldyBpY2lkIG9uIHRoZSBmb2xsb3dpbmcgc2Vjb25kLlxyXG4gICAgICAgICAgICBjb25zdCBleGlzdGluZ1JlbGF0aW9uc2hpcCA9IHJlbGF0aW9uc2hpcHMuZmluZChcclxuICAgICAgICAgICAgICAgIHJlbGF0aW9uc2hpcCA9PlxyXG4gICAgICAgICAgICAgICAgICAgIHJlbGF0aW9uc2hpcC5jb252ZXJzYXRpb25GaWxlID09PSByZXNvbHZlZENvbnZlcnNhdGlvbkZpbGVOYW1lLFxyXG4gICAgICAgICAgICApO1xyXG5cclxuICAgICAgICAgICAgaWYgKGV4aXN0aW5nUmVsYXRpb25zaGlwKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBUaGlzIGNvbnZlcnNhdGlvbiBmaWxlIGFscmVhZHkgaGFzIGFuIGVzdGFibGlzaGVkIElDSUQuXHJcbiAgICAgICAgICAgICAgICAvLyBBZG9wdCBpdCBpbnN0ZWFkIG9mIGNyZWF0aW5nIGEgZHVwbGljYXRlIHJlbGF0aW9uc2hpcC5cclxuICAgICAgICAgICAgICAgIGlmIChleGlzdGluZ1JlbGF0aW9uc2hpcC5pbnRlcm5hbENoYXRJRCAhPT0gcmVzb2x2ZWRJbnRlcm5hbENoYXRJRCkge1xyXG4gICAgICAgICAgICAgICAgICAgIHNldEludGVybmFsQ2hhdElEKGV4aXN0aW5nUmVsYXRpb25zaGlwLmludGVybmFsQ2hhdElEKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gdXBkYXRlIHRoZSB2YWx1ZXMgYWZ0ZXIgcHJldmlvdXMgYWRvcHRpb25zLlxyXG4gICAgICAgIHJlc29sdmVkQ29udmVyc2F0aW9uRmlsZU5hbWUgPSBnZXRDb252ZXJzYXRpb25GaWxlTmFtZSgpO1xyXG4gICAgICAgIHJlc29sdmVkSW50ZXJuYWxDaGF0SUQgPSBnZXRJbnRlcm5hbENoYXRJRCgpO1xyXG5cclxuICAgICAgICAvLyBJZiB0aGVyZSB3YXMgbm90IGEgcGVyZmVjdCBtYXRjaCwgd2UgbmVlZCB0byBjcmVhdGUgYSBuZXcgb25lIG9yIG1vZGlmeSBhbiBvbGQgZXhpc3RpbmcgcmVsYXRpb25zaGlwXHJcblxyXG4gICAgICAgIGNvbnN0IG1hdGNoaW5nSW5kZXhlcyA9IHJlbGF0aW9uc2hpcHNcclxuICAgICAgICAgICAgLm1hcCgocmVsYXRpb25zaGlwLCBpbmRleCkgPT4gKHtcclxuICAgICAgICAgICAgICAgIHJlbGF0aW9uc2hpcCxcclxuICAgICAgICAgICAgICAgIGluZGV4LFxyXG4gICAgICAgICAgICB9KSlcclxuICAgICAgICAgICAgLmZpbHRlcihcclxuICAgICAgICAgICAgICAgICh7IHJlbGF0aW9uc2hpcCB9KSA9PlxyXG4gICAgICAgICAgICAgICAgICAgIHJlbGF0aW9uc2hpcC5pbnRlcm5hbENoYXRJRCA9PT0gcmVzb2x2ZWRJbnRlcm5hbENoYXRJRCB8fFxyXG4gICAgICAgICAgICAgICAgICAgIHJlbGF0aW9uc2hpcC5jb252ZXJzYXRpb25GaWxlID09PSByZXNvbHZlZENvbnZlcnNhdGlvbkZpbGVOYW1lLFxyXG4gICAgICAgICAgICApO1xyXG5cclxuICAgICAgICBpZiAobWF0Y2hpbmdJbmRleGVzLmxlbmd0aCA+IDApIHtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGZpbHRlcmVkUmVsYXRpb25zaGlwcyA9IHJlbGF0aW9uc2hpcHMuZmlsdGVyKFxyXG4gICAgICAgICAgICAgICAgKF8sIGluZGV4KSA9PlxyXG4gICAgICAgICAgICAgICAgICAgICFtYXRjaGluZ0luZGV4ZXMuc29tZShcclxuICAgICAgICAgICAgICAgICAgICAgICAgKG1hdGNoKSA9PiBtYXRjaC5pbmRleCA9PT0gaW5kZXgsXHJcbiAgICAgICAgICAgICAgICAgICAgKSxcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGZpbHRlcmVkUmVsYXRpb25zaGlwcy5wdXNoKHtcclxuICAgICAgICAgICAgICAgIGludGVybmFsQ2hhdElEOiByZXNvbHZlZEludGVybmFsQ2hhdElELFxyXG4gICAgICAgICAgICAgICAgY29udmVyc2F0aW9uRmlsZTogcmVzb2x2ZWRDb252ZXJzYXRpb25GaWxlTmFtZSxcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCByZWxhdGlvbnNoaXBzVG9Xcml0ZSA9XHJcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZFJlbGF0aW9uc2hpcHMubGVuZ3RoID4gcmVsYXRpb25zaGlwc0xpbWl0XHJcbiAgICAgICAgICAgICAgICAgICAgPyBmaWx0ZXJlZFJlbGF0aW9uc2hpcHMuc2xpY2UoLXJlbGF0aW9uc2hpcHNMaW1pdClcclxuICAgICAgICAgICAgICAgICAgICA6IGZpbHRlcmVkUmVsYXRpb25zaGlwcztcclxuXHJcbiAgICAgICAgICAgIGF3YWl0IHdyaXRlRmlsZShcclxuICAgICAgICAgICAgICAgIHJlbGF0aW9uc2hpcEZpbGUsXHJcbiAgICAgICAgICAgICAgICBKU09OLnN0cmluZ2lmeShyZWxhdGlvbnNoaXBzVG9Xcml0ZSwgbnVsbCwgNCksXHJcbiAgICAgICAgICAgICAgICBcInV0Zi04XCIsXHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgIH0gZWxzZSB7XHJcblxyXG4gICAgICAgICAgICByZWxhdGlvbnNoaXBzLnB1c2goe1xyXG4gICAgICAgICAgICAgICAgaW50ZXJuYWxDaGF0SUQ6IHJlc29sdmVkSW50ZXJuYWxDaGF0SUQsXHJcbiAgICAgICAgICAgICAgICBjb252ZXJzYXRpb25GaWxlOiByZXNvbHZlZENvbnZlcnNhdGlvbkZpbGVOYW1lLFxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHJlbGF0aW9uc2hpcHNUb1dyaXRlID1cclxuICAgICAgICAgICAgICAgIHJlbGF0aW9uc2hpcHMubGVuZ3RoID4gcmVsYXRpb25zaGlwc0xpbWl0XHJcbiAgICAgICAgICAgICAgICAgICAgPyByZWxhdGlvbnNoaXBzLnNsaWNlKC1yZWxhdGlvbnNoaXBzTGltaXQpXHJcbiAgICAgICAgICAgICAgICAgICAgOiByZWxhdGlvbnNoaXBzO1xyXG5cclxuICAgICAgICAgICAgYXdhaXQgd3JpdGVGaWxlKFxyXG4gICAgICAgICAgICAgICAgcmVsYXRpb25zaGlwRmlsZSxcclxuICAgICAgICAgICAgICAgIEpTT04uc3RyaW5naWZ5KHJlbGF0aW9uc2hpcHNUb1dyaXRlLCBudWxsLCA0KSxcclxuICAgICAgICAgICAgICAgIFwidXRmLThcIixcclxuICAgICAgICAgICAgKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICAgIGNvbnNvbGUuZXJyb3IoYHNjYW5Gb3JDb252ZXJzYXRpb25GaWxlVGhydUZ1bGxDb252ZXJzYXRpb25EaXJlY3RvcnlTY2FuIGVycm9yOiAke2Vycm9yLm1lc3NhZ2V9YCk7XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgIGlmIChsb2NrT3duZXJOYW1lICE9PSB1bmRlZmluZWQpIHtcclxuICAgICAgICAgICAgYXdhaXQgcmVsZWFzZUxvY2sobG9ja0ZpbGUsIGxvY2tPd25lck5hbWUpO1xyXG4gICAgICAgICAgICBsb2NrT3duZXJOYW1lID0gdW5kZWZpbmVkO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuLyoqXHJcbiAqIEhlbHBlciBmb3IgdGhlIGZ1bGwgc2Nhbm5pbmcgb2YgYWxsIGNvbnZlcnNhdGlvbiBmaWxlcyB0byBmaW5kIHRoZSBJQ0lEXHJcbiAqL1xyXG5hc3luYyBmdW5jdGlvbiBmaW5kQWxsQ29udmVyc2F0aW9uRmlsZXMoXHJcbiAgICBjb252ZXJzYXRpb25zRGlyZWN0b3J5OiBzdHJpbmcsXHJcbik6IFByb21pc2U8c3RyaW5nW10+IHtcclxuXHJcbiAgICBjb25zdCBjb252ZXJzYXRpb25GaWxlczogc3RyaW5nW10gPSBbXTtcclxuXHJcbiAgICBhc3luYyBmdW5jdGlvbiBzZWFyY2hEaXJlY3RvcnkoXHJcbiAgICAgICAgZGlyZWN0b3J5OiBzdHJpbmcsXHJcbiAgICApOiBQcm9taXNlPHZvaWQ+IHtcclxuXHJcbiAgICAgICAgY29uc3QgZW50cmllcyA9IGF3YWl0IHJlYWRkaXIoZGlyZWN0b3J5LCB7XHJcbiAgICAgICAgICAgIHdpdGhGaWxlVHlwZXM6IHRydWUsXHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZnVsbFBhdGggPSBqb2luKFxyXG4gICAgICAgICAgICAgICAgZGlyZWN0b3J5LFxyXG4gICAgICAgICAgICAgICAgZW50cnkubmFtZSxcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChlbnRyeS5pc0ZpbGUoKSkge1xyXG4gICAgICAgICAgICAgICAgaWYgKCBlbnRyeS5uYW1lID09PSBcIkNoYXRTZXNzaW9uQ29udmVyc2F0aW9uUmVsYXRpb25zaGlwLmpzb25cIikge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgICAgICAgICBlbnRyeS5uYW1lLmVuZHNXaXRoKFwiLmxvY2tcIikgfHxcclxuICAgICAgICAgICAgICAgICAgICBlbnRyeS5uYW1lLmVuZHNXaXRoKFwiLnJlYWR5XCIpIHx8XHJcbiAgICAgICAgICAgICAgICAgICAgZW50cnkubmFtZS5lbmRzV2l0aChcIi5jb3B5XCIpXHJcbiAgICAgICAgICAgICAgICApIHtcclxuICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgICAgICBjb252ZXJzYXRpb25GaWxlcy5wdXNoKGZ1bGxQYXRoKTtcclxuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAoZW50cnkuaXNEaXJlY3RvcnkoKSkge1xyXG4gICAgICAgICAgICAgICAgYXdhaXQgc2VhcmNoRGlyZWN0b3J5KGZ1bGxQYXRoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIFxyXG4gICAgYXdhaXQgc2VhcmNoRGlyZWN0b3J5KGNvbnZlcnNhdGlvbnNEaXJlY3RvcnkpO1xyXG5cclxuICAgIGNvbnN0IGZpbGVzV2l0aE1vZGlmaWVkVGltZSA9IGF3YWl0IFByb21pc2UuYWxsKFxyXG4gICAgICAgIGNvbnZlcnNhdGlvbkZpbGVzLm1hcChhc3luYyAoZmlsZVBhdGgpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZmlsZVN0YXRzID0gYXdhaXQgc3RhdChmaWxlUGF0aCk7XHJcblxyXG4gICAgICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICAgICAgZmlsZVBhdGgsXHJcbiAgICAgICAgICAgICAgICBtb2RpZmllZFRpbWU6IGZpbGVTdGF0cy5tdGltZU1zLFxyXG4gICAgICAgICAgICB9O1xyXG4gICAgICAgIH0pLFxyXG4gICAgKTtcclxuXHJcbiAgICBmaWxlc1dpdGhNb2RpZmllZFRpbWUuc29ydChcclxuICAgICAgICAoYSwgYikgPT4gYi5tb2RpZmllZFRpbWUgLSBhLm1vZGlmaWVkVGltZSxcclxuICAgICk7XHJcblxyXG4gICAgcmV0dXJuIGZpbGVzV2l0aE1vZGlmaWVkVGltZS5tYXAoXHJcbiAgICAgICAgKGZpbGUpID0+IGZpbGUuZmlsZVBhdGgsXHJcbiAgICApO1xyXG59XHJcblxyXG4vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbi8vIE1lbW9yeSBTZWVkc1xyXG4vLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcblxyXG4vKipcclxuKiBTaG9ydGN1dCB0byB0cmlnZ2VyIGEgcXVpY2sgY2xlYW51cCBvZiBhbGwgdGhlIG1lbW9yeSBzZWVkcyBpbiBjb252ZXJzYXRpb24gZmlsZVxyXG4qIHdoZW4gdXNlciBoYXMgcmVtb3ZlZCBhbGwgc2VlZHMgaW4gTWVtb3JpZXMgdG8gSW5qZWN0LlxyXG4qIFJhdGhlciB0aGFuIHRoZSBtb3JlIGV4cGVuc2l2ZSByb3V0ZSBvZiBtYXRoY2luZyBhbmQgcmVtb3Zpbmcgc2VlZHMgb25lIGJ5IG9uZS5cclxuKi9cclxuYXN5bmMgZnVuY3Rpb24gcHJvbXB0UHJvY2Vzc29ySGlzdG9yeVNpbXBsZVNjYW5Gb3JTZWVkcyhcclxuICAgIG1lc3NhZ2VzOiBDaGF0TWVzc2FnZVtdLFxyXG4pOiBQcm9taXNlPGJvb2xlYW4+IHtcclxuXHJcbiAgICBmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgbWVzc2FnZXMpIHtcclxuICAgICAgICBpZiAoL1xcW0JFR0lOIC4qXFwuanNvblxcXS8udGVzdChtZXNzYWdlLmdldFRleHQoKSkpIHtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuLyoqXHJcbiogU2NhbiBjb252ZXJzYXRpb24gZmlsZSBmb3IgcGFzdCBzZWVkcyBpbmplY3RlZC4gVGhpcyBhbGxvd3MgdXNlcnNcclxuKiB0byBzdGFydCB0aGUgc2Vzc2lvbiB3aXRoIHRoZSBjb3JyZWN0IGluamVjdGVkTWVtb3J5U2VlZHMgKyBtZW1vcnlTZWVkc1NlbGVjdGVkIHN0YXRlLlxyXG4qIFRyYWRlIG9mZiBvdmVyIHVzaW5nIGhpc3Rvcnkgc2NhbjogbW9yZSByZXNvdXJjZXMgZXhwZW5kZWQgZm9yIGFjY3VyYWN5IGFuZCByZWxpYWJpbGl0eVxyXG4qL1xyXG5hc3luYyBmdW5jdGlvbiBwcm9tcHRQcm9jZXNzb3JDb252ZXJzYXRpb25GaWxlU2NhbkZvclByZXZpb3VzU2VlZHMoXHJcbiAgICBjb252ZXJzYXRpb25GaWxlTmFtZTogc3RyaW5nLFxyXG4gICAgbWVtb3J5U2VlZHNQb29sOiBzdHJpbmdbXSxcclxuKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xyXG5cclxuICAgIGNvbnN0IHJvb3REaXJlY3RvcnkgPSBhd2FpdCBtZW1vcnlTdG9yZS5nZXRSb290RGlyZWN0b3J5KCk7XHJcblxyXG4gICAgY29uc3QgY29udmVyc2F0aW9uRGlyZWN0b3J5ID0gam9pbihcclxuICAgICAgICByb290RGlyZWN0b3J5LFxyXG4gICAgICAgIFwiY29udmVyc2F0aW9uc1wiLFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBjb252ZXJzYXRpb25GaWxlUGF0aCA9IGpvaW4oXHJcbiAgICAgICAgY29udmVyc2F0aW9uRGlyZWN0b3J5LFxyXG4gICAgICAgIGNvbnZlcnNhdGlvbkZpbGVOYW1lLFxyXG4gICAgKTtcclxuXHJcbiAgICBsZXQgZm91bmRQYXN0SW5qZWN0ZWRNZW1vcnlTZWVkOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgICAgLy8gRXhpdCBxdWlldGx5IGlmIHRoZSBjb252ZXJzYXRpb24gcGF0aCByZXNvbHZlcyB0byBhIGRpcmVjdG9yeS5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBpbmZvID0gYXdhaXQgc3RhdChjb252ZXJzYXRpb25GaWxlUGF0aCk7XHJcblxyXG4gICAgICAgICAgICBpZiAoaW5mby5pc0RpcmVjdG9yeSgpKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLndhcm4oXCJbTWVtb3J5U2Nhbl0gU2tpcHBpbmcgZGlyZWN0b3J5OlwiLCB7XHJcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogY29udmVyc2F0aW9uRmlsZVBhdGgsXHJcbiAgICAgICAgICAgICAgICAgICAgZmlsZU5hbWU6IGNvbnZlcnNhdGlvbkZpbGVOYW1lLFxyXG4gICAgICAgICAgICAgICAgICAgIGlzRmlsZTogaW5mby5pc0ZpbGUoKSxcclxuICAgICAgICAgICAgICAgICAgICBpc0RpcmVjdG9yeTogaW5mby5pc0RpcmVjdG9yeSgpLFxyXG4gICAgICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGZvdW5kUGFzdEluamVjdGVkTWVtb3J5U2VlZDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGVyciA9IGVycm9yIGFzIE5vZGVKUy5FcnJub0V4Y2VwdGlvbjtcclxuXHJcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihcIltNZW1vcnlTY2FuXSBDYW5ub3QgaW5zcGVjdCBjb252ZXJzYXRpb24gcGF0aDpcIiwge1xyXG4gICAgICAgICAgICAgICAgcGF0aDogY29udmVyc2F0aW9uRmlsZVBhdGgsXHJcbiAgICAgICAgICAgICAgICBmaWxlTmFtZTogY29udmVyc2F0aW9uRmlsZU5hbWUsXHJcbiAgICAgICAgICAgICAgICBjb2RlOiBlcnIuY29kZSxcclxuICAgICAgICAgICAgICAgIG1lc3NhZ2U6IGVyci5tZXNzYWdlLFxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiBmb3VuZFBhc3RJbmplY3RlZE1lbW9yeVNlZWQ7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBjb252ZXJzYXRpb25Db250ZW50ID0gYXdhaXQgcmVhZEZpbGVXaXRoUmV0cmllcyhcclxuICAgICAgICAgICAgY29udmVyc2F0aW9uRmlsZVBhdGgsIFxyXG4gICAgICAgICAgICAyLCAgICAgIC8vIG1heEF0dGVtcHRzXHJcbiAgICAgICAgICAgIDIwMCwgICAgLy8gcmV0cnlEZWxheVxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGNvbnN0IG1hdGNoZXMgPSBjb252ZXJzYXRpb25Db250ZW50Lm1hdGNoQWxsKFxyXG4gICAgICAgICAgICAvXFxbQkVHSU4gKFteXFxdXSspXFxdL2csXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IG1lbW9yeVNlZWQgPSBtYXRjaFsxXS50cmltKCk7XHJcblxyXG4gICAgICAgICAgICAvLyBPbmx5IHRyYWNrIG1lbW9yeSBzZWVkcyBmb3VuZCBpbiB0aGUgY29udmVyc2F0aW9uXHJcbiAgICAgICAgICAgIC8vIHRoYXQgZXhpc3QgaW4gdGhlIGN1cnJlbnQgbWVtb3J5IHBvb2wuXHJcbiAgICAgICAgICAgIGlmIChcclxuICAgICAgICAgICAgICAgIG1lbW9yeVNlZWRzUG9vbC5pbmNsdWRlcyhtZW1vcnlTZWVkKSAmJlxyXG4gICAgICAgICAgICAgICAgLy8gQXZvaWQgdHJhY2tpbmcgdGhlIHNhbWUgbWVtb3J5IHNlZWQgbW9yZSB0aGFuIG9uY2UuXHJcbiAgICAgICAgICAgICAgICAhZm91bmRQYXN0SW5qZWN0ZWRNZW1vcnlTZWVkLmluY2x1ZGVzKG1lbW9yeVNlZWQpXHJcbiAgICAgICAgICAgICkge1xyXG4gICAgICAgICAgICAgICAgZm91bmRQYXN0SW5qZWN0ZWRNZW1vcnlTZWVkLnB1c2gobWVtb3J5U2VlZCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHVwZGF0ZU1lbW9yeVNlZWRzU2VsZWN0ZWQoZm91bmRQYXN0SW5qZWN0ZWRNZW1vcnlTZWVkKTtcclxuXHJcbiAgICAgICAgc2V0Q29uZmlnU2NoZW1hdGljcyh7XHJcbiAgICAgICAgICAgIG1lbW9yeVNlZWRzU2VsZWN0ZWQ6IGZvdW5kUGFzdEluamVjdGVkTWVtb3J5U2VlZCxcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgcmV0dXJuIGZvdW5kUGFzdEluamVjdGVkTWVtb3J5U2VlZDtcclxuXHJcbiAgICB9IGNhdGNoIChlcnJvcjogYW55KSB7XHJcbiAgICAgICAgY29uc29sZS5lcnJvcihgcHJvbXB0UHJvY2Vzc29yQ29udmVyc2F0aW9uRmlsZVNjYW5Gb3JQcmV2aW91c1NlZWRzIGVycm9yOiAke2Vycm9yfWApXHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIGZvdW5kUGFzdEluamVjdGVkTWVtb3J5U2VlZDtcclxufVxyXG5cclxuLyoqXHJcbiogTUVNT1JJRVMgU0VFRCBTRUNUSU9OXHJcbiogQ29uc3RydWN0b3IgZm9yIHRoZSBmaW5hbCBtZW1vcmllcyB0ZXh0IHRvIGZlZWQgaW50byB0aGUgcHJvbXB0IHByZXByb2Nlc3NvclxyXG4qL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcHJvbXB0UHJvY2Vzc29yQ29uc3RydWN0TWVtb3JpZXNUb0luamVjdChcclxuICAgIG5ld01lbW9yeVNlZWRzOiBzdHJpbmdbXSxcclxuICAgIHN1bW1hcml6ZU1lbW9yeVNlZWRzOiBib29sZWFuLFxyXG4pOiBQcm9taXNlPHN0cmluZz57XHJcblxyXG4gICAgY29uc3QgbWVtb3JpZXNEaXJlY3RvcnkgPSBnZXRWYWxpZGF0ZWRNZW1vcmllc1Jvb3REaXJlY3RvcnkoKTtcclxuICAgIGxldCBjcmVhdGVkSW5qZWN0ZWRDb250ZXh0ID0gXCJcIjtcclxuXHJcbiAgICBjcmVhdGVkSW5qZWN0ZWRDb250ZXh0ID0gXCJbQkVHSU5OSU5HIE9GIE1FTU9SSUVTXSBOT1QgSU5TVFJVQ1RJT05TLCBKVVNUIFNPTUUgUFJJT1IgQ09OVkVSU0FUSU9OOlxcblxcblwiO1xyXG5cclxuICAgIC8vIEdvaW5nIHRvIGdyYWIgdGhlIGNvbnRlbnRzIG9mIHRoZSBzZWVkcyB3ZSdyZSBnb2luZyB0byBpbmplY3RcclxuICAgIC8vIHRoZW4gYnVpbGQgaXQgaW50byBhIG1lbW9yeVNlZWQgc3RyaW5nIHRoYXQgdGhlIG1vZGVsIGNhbiBkaWdlc3QgYXNcclxuICAgIC8vIGEgcGFzdCBjb252ZXJzYXRpb24ga25vd2luZyB3aGF0IHRoZSB1c2VyIGFza2VkIGFuZCB0aGUgYXNzaXN0YW50IHJlc3BvbmRlZFxyXG4gICAgZm9yIChcclxuICAgICAgICBjb25zdCBtZW1vcnlTZWVkXHJcbiAgICAgICAgb2YgbmV3TWVtb3J5U2VlZHNcclxuICAgICkge1xyXG4gICAgICAgIGNvbnN0IFtjYXRlZ29yeSwgZmlsZW5hbWVdID1cclxuICAgICAgICAgICAgbWVtb3J5U2VlZC5zcGxpdChcIi9cIik7XHJcblxyXG4gICAgICAgIGNvbnN0IGZpbGVQYXRoID1cclxuICAgICAgICAgICAgcGF0aC5qb2luKFxyXG4gICAgICAgICAgICAgICAgbWVtb3JpZXNEaXJlY3RvcnksXHJcbiAgICAgICAgICAgICAgICBjYXRlZ29yeSxcclxuICAgICAgICAgICAgICAgIGZpbGVuYW1lLFxyXG4gICAgICAgICAgICApO1xyXG5cclxuICAgICAgICBjb25zdCBjb250ZW50cyA9XHJcbiAgICAgICAgICAgIGF3YWl0IHJlYWRGaWxlKFxyXG4gICAgICAgICAgICAgICAgZmlsZVBhdGgsXHJcbiAgICAgICAgICAgICAgICBcInV0Zi04XCIsXHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgIGNvbnN0IHNlZWRzID0gSlNPTi5wYXJzZShcclxuICAgICAgICAgICAgY29udGVudHMsXHJcbiAgICAgICAgKSBhcyBBcnJheTx7XHJcbiAgICAgICAgICAgIGRhdGU6IHN0cmluZztcclxuICAgICAgICAgICAgcm9vdF9pbnB1dDogc3RyaW5nO1xyXG4gICAgICAgICAgICBkaXJlY3RfaW5wdXQ6IHN0cmluZztcclxuICAgICAgICAgICAgb3V0cHV0OiBzdHJpbmc7XHJcbiAgICAgICAgfT47XHJcblxyXG4gICAgICAgIGlmIChzZWVkcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBXZSBhcmUgZXN0YWJsaXNoaW5nIHRoZSB0aW1lbGluZSBvZiB0aGUgY29udmVyc2F0aW9uXHJcbiAgICAgICAgLy8gU28gdGhlIG1vZGVsIGtub3dzIHdoZW4gaXQgaGFwcGVuZWQgYW5kIGp1c3QgYmVjYXVzZVxyXG4gICAgICAgIC8vIHdlIG1hZGUgdGhlIGRhdGEgYXZhaWxhYmxlIGR1cmluZyBjcmVhdGlvblxyXG4gICAgICAgIGNvbnN0IGRhdGVzID1cclxuICAgICAgICAgICAgc2VlZHNcclxuICAgICAgICAgICAgICAgIC5tYXAoXHJcbiAgICAgICAgICAgICAgICAgICAgKHNlZWQpID0+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlZWQuZGF0ZSxcclxuICAgICAgICAgICAgICAgIClcclxuICAgICAgICAgICAgICAgIC5maWx0ZXIoQm9vbGVhbilcclxuICAgICAgICAgICAgICAgIC5zb3J0KCk7XHJcblxyXG4gICAgICAgIGNvbnN0IGVhcmxpZXN0RGF0ZSA9XHJcbiAgICAgICAgICAgIGRhdGVzWzBdO1xyXG5cclxuICAgICAgICBjb25zdCBsYXRlc3REYXRlID1cclxuICAgICAgICAgICAgZGF0ZXNbZGF0ZXMubGVuZ3RoIC0gMV07XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gU2lnbmFsZXIgb2YgdGhlIG1lbW9yeSBibG9jayB3ZSdyZSB1c2luZyBmb3IgZnV0dXJlIHJlbW92YWxcclxuICAgICAgICBjcmVhdGVkSW5qZWN0ZWRDb250ZXh0ICs9XHJcbiAgICAgICAgICAgIGBbQkVHSU4gJHttZW1vcnlTZWVkfV1cXG5gO1xyXG5cclxuICAgICAgICBjcmVhdGVkSW5qZWN0ZWRDb250ZXh0ICs9XHJcbiAgICAgICAgICAgIGBEQVRFOiBCZXR3ZWVuICR7ZWFybGllc3REYXRlfSAtICR7bGF0ZXN0RGF0ZX1cXG5cXG5gO1xyXG4gICAgICAgIFxyXG4gICAgICAgIGNvbnN0IG1lbW9yeUJsb2NrQ29udGVudFN0YXJ0ID0gY3JlYXRlZEluamVjdGVkQ29udGV4dC5sZW5ndGg7XHJcblxyXG4gICAgICAgIC8vIFdlIGdyb3VwIHNpbWlsYXIgUSAmIEEgdW5kZXIgdGhlIHNhbWUgdG9waWNcclxuICAgICAgICAvLyBhcyB0byBub3Qgd2FzdGUgdG9rZW5zIGFwcGVuZGluZyBhIHRvcGljIHRvIGVhY2ggZXhjaGFuZ2VcclxuICAgICAgICBjb25zdCB0b3BpY3MgPVxyXG4gICAgICAgICAgICBuZXcgTWFwPFxyXG4gICAgICAgICAgICAgICAgc3RyaW5nLFxyXG4gICAgICAgICAgICAgICAgQXJyYXk8e1xyXG4gICAgICAgICAgICAgICAgICAgIGRhdGU6IHN0cmluZztcclxuICAgICAgICAgICAgICAgICAgICByb290X2lucHV0OiBzdHJpbmc7XHJcbiAgICAgICAgICAgICAgICAgICAgZGlyZWN0X2lucHV0OiBzdHJpbmc7XHJcbiAgICAgICAgICAgICAgICAgICAgb3V0cHV0OiBzdHJpbmc7XHJcbiAgICAgICAgICAgICAgICB9PlxyXG4gICAgICAgICAgICA+KCk7XHJcblxyXG4gICAgICAgIGZvciAoY29uc3Qgc2VlZCBvZiBzZWVkcykge1xyXG4gICAgICAgICAgICBjb25zdCByb290SW5wdXQgPVxyXG4gICAgICAgICAgICAgICAgc2VlZC5yb290X2lucHV0LnRyaW0oKTtcclxuXHJcbiAgICAgICAgICAgIGlmICghdG9waWNzLmhhcyhyb290SW5wdXQpKSB7XHJcbiAgICAgICAgICAgICAgICB0b3BpY3Muc2V0KFxyXG4gICAgICAgICAgICAgICAgICAgIHJvb3RJbnB1dCxcclxuICAgICAgICAgICAgICAgICAgICBbXSxcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRvcGljc1xyXG4gICAgICAgICAgICAgICAgLmdldChyb290SW5wdXQpIVxyXG4gICAgICAgICAgICAgICAgLnB1c2goc2VlZCk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBsZXQgdG9waWNOdW1iZXIgPSAxO1xyXG5cclxuICAgICAgICBmb3IgKFxyXG4gICAgICAgICAgICBjb25zdCBbXHJcbiAgICAgICAgICAgICAgICByb290SW5wdXQsXHJcbiAgICAgICAgICAgICAgICB0b3BpY1NlZWRzLFxyXG4gICAgICAgICAgICBdIG9mIHRvcGljc1xyXG4gICAgICAgICkge1xyXG4gICAgICAgICAgICBjcmVhdGVkSW5qZWN0ZWRDb250ZXh0ICs9XHJcbiAgICAgICAgICAgICAgICBgVE9QSUNfJHt0b3BpY051bWJlcn06ICR7cm9vdElucHV0fVxcbmA7XHJcblxyXG4gICAgICAgICAgICBmb3IgKFxyXG4gICAgICAgICAgICAgICAgY29uc3Qgc2VlZFxyXG4gICAgICAgICAgICAgICAgb2YgdG9waWNTZWVkc1xyXG4gICAgICAgICAgICApIHtcclxuICAgICAgICAgICAgICAgIGNyZWF0ZWRJbmplY3RlZENvbnRleHQgKz1cclxuICAgICAgICAgICAgICAgICAgICBgVVNFUjogJHtzZWVkLmRpcmVjdF9pbnB1dH1cXG5gO1xyXG5cclxuICAgICAgICAgICAgICAgIGNyZWF0ZWRJbmplY3RlZENvbnRleHQgKz1cclxuICAgICAgICAgICAgICAgICAgICBgQVNTSVNUQU5UOiAke3NlZWQub3V0cHV0fVxcblxcbmA7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIHRvcGljTnVtYmVyICs9IDE7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICAvLyBSZWNvbnN0cnVjdHMgdGhlIGNvbnRlbnRzIHRvIGEgc3VtbWFyeSBpbnN0ZWFkLlxyXG4gICAgICAgIGlmIChzdW1tYXJpemVNZW1vcnlTZWVkcykge1xyXG4gICAgICAgICAgICBjb25zdCBtZW1vcnlCbG9ja0NvbnRlbnQgPSBjcmVhdGVkSW5qZWN0ZWRDb250ZXh0LnNsaWNlKFxyXG4gICAgICAgICAgICAgICAgbWVtb3J5QmxvY2tDb250ZW50U3RhcnQsXHJcbiAgICAgICAgICAgICk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBzdW1tYXJpemVkQ29udGVudCA9IGF3YWl0IG1vZGVsQ2FsbFRvU3VtbWFyaXplTWVtb3J5U2VlZChtZW1vcnlCbG9ja0NvbnRlbnQpO1xyXG5cclxuICAgICAgICAgICAgY3JlYXRlZEluamVjdGVkQ29udGV4dCA9XHJcbiAgICAgICAgICAgICAgICBjcmVhdGVkSW5qZWN0ZWRDb250ZXh0LnNsaWNlKDAsIG1lbW9yeUJsb2NrQ29udGVudFN0YXJ0KSArXHJcbiAgICAgICAgICAgICAgICBzdW1tYXJpemVkQ29udGVudCArXHJcbiAgICAgICAgICAgICAgICBcIlxcblxcblwiO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gSW5kaWNhdGVzIHRoZSBlbmQgb2YgdGhlIG1lbW9yeSBibG9ja1xyXG4gICAgICAgIGNyZWF0ZWRJbmplY3RlZENvbnRleHQgKz1cclxuICAgICAgICAgICAgYFtFTkQgJHttZW1vcnlTZWVkfV1cXG5cXG5gO1xyXG5cclxuICAgICAgICAvLyBCZWZvcmUgdGhpcyB0aW1lIGluamVjdGVkTWVtb3J5U2VlZHMgd2lsbCBubyBsb25nZXIgYmUgbnVsbFxyXG4gICAgICAgIC8vIEl0IG5lZWRlZCB0byBzdGFydCBhcyBudWxsIGZvciBhIHByaW9yIGlmIGNoZWNrXHJcbiAgICAgICAgaWYoaW5qZWN0ZWRNZW1vcnlTZWVkcyAhPT0gbnVsbCl7XHJcbiAgICAgICAgICAgIGluamVjdGVkTWVtb3J5U2VlZHMucHVzaChcclxuICAgICAgICAgICAgICAgIG1lbW9yeVNlZWQsXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBhZGRNZW1vcnlTZWVkVG9TZWxlY3RlZChtZW1vcnlTZWVkKTtcclxuICAgIH1cclxuXHJcbiAgICBzZXRDb25maWdTY2hlbWF0aWNzKHttZW1vcnlTZWVkc1NlbGVjdGVkOiBnZXRNZW1vcnlTZWVkc1NlbGVjdGVkKCl9KTtcclxuXHJcbiAgICByZXR1cm4gY3JlYXRlZEluamVjdGVkQ29udGV4dDtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gbW9kZWxDYWxsVG9TdW1tYXJpemVNZW1vcnlTZWVkKFxyXG4gICAgbWVtb3J5QmxvY2tDb250ZW50OiBzdHJpbmcsXHJcbik6IFByb21pc2U8c3RyaW5nPiB7XHJcbiAgICBjb25zdCBjbGllbnQgPSBnZXRDb250cm9sbGVyKCkuY2xpZW50O1xyXG4gICAgY29uc3QgbW9kZWwgPSBhd2FpdCBjbGllbnQubGxtLm1vZGVsKCk7XHJcbiAgICBcclxuICAgIGNvbnN0IHByb21wdCA9IGBcclxuICAgICAgICBUaGUgdXNlciBuZWVkcyB5b3UgdGhlIGFzc2lzdGFudCB0byByaWdvcm91c2x5IGNvbmRlbnNlIHRoZSBmb2xsb3dpbmcgTUVTU0FHRSBISVNUT1JZIGV4Y2hhbmdlIGJldHdlZW4gYSB1c2VyIGFuZCBhc3Npc3RhbnQuXHJcblxyXG4gICAgICAgIERpc2NhcmQgYW55dGhpbmcgdGhhdCBzZWVtcyByZXBldGl0aXZlLCBtaW5vciwgb3Igb2YgbGl0dGxlIHZhbHVlLiBEbyBub3QgbG9zZSBhbnkgaW1wb3J0YW50IGRldGFpbHMgb2YgdGhlIGV4Y2hhbmdlLiBSZXR1cm4gYSBzdHJpbmcuXHJcblxyXG4gICAgICAgIFtCRUdJTk5JTkcgT0YgTUVTU0FHRSBISVNUT1JZXTogXHJcbiAgICAgICAgJHttZW1vcnlCbG9ja0NvbnRlbnR9XHJcbiAgICAgICAgW0VORCBPRiBNRVNTQUdFIEhJU1RPUlldXHJcbiAgICAgICAgYC50cmltKCk7XHJcblxyXG4gICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgbW9kZWwucmVzcG9uZChcclxuICAgICAgICBwcm9tcHQsXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgICB0ZW1wZXJhdHVyZTogMCxcclxuICAgICAgICB9LFxyXG4gICAgKTtcclxuXHJcbiAgICBjb25zdCBjbGVhbmVkVGV4dCA9IHJlc3VsdC5jb250ZW50XHJcbiAgICAgICAgLnJlcGxhY2UoXHJcbiAgICAgICAgICAgIC9eW1xcc1xcU10qP19fTE1fU1RVRElPX0lOVEVSTkFMX0xTRVBfU1lOVEhFVElDX1JFQVNPTklOR19FTkRfW0EtWmEtejAtOV0rX18vaSxcclxuICAgICAgICAgICAgXCJcIixcclxuICAgICAgICApXHJcbiAgICAgICAgLnJlcGxhY2UoL15bXFxzXFxTXSo/YGBgKD86anNvbik/XFxzKi9pLCBcIlwiKVxyXG4gICAgICAgIC5yZXBsYWNlKC9cXHMqYGBgW1xcc1xcU10qJC9pLCBcIlwiKVxyXG4gICAgICAgIC50cmltKCk7XHJcblxyXG4gICAgcmV0dXJuIGNsZWFuZWRUZXh0O1xyXG59XHJcblxyXG4vKipcclxuKiBTaW1wbGUgbWlkZGxlbWFuIHRvIGZpZ3VyZSBvdXQgd2hpY2ggdmFsaWQgbWVtb3JpZXMgdGhlIHVzZXIgY2hvc2UgdG8gcmVtb3ZlXHJcbiovXHJcbmFzeW5jIGZ1bmN0aW9uIHByb21wdFByb2Nlc3NvclJlbW92ZVNlZWRzKFxyXG4gICAgaW5qZWN0ZWRNZW1vcnlTZWVkczogc3RyaW5nW10sXHJcbiAgICB2YWxpZE1lbW9yeVNlZWRzU2VsZWN0ZWQ6IHN0cmluZ1tdLFxyXG4gICAgY2xlYW51cEFsbFNlZWRzOiBib29sZWFuLFxyXG4pOiBQcm9taXNlPHN0cmluZ1tdPiB7XHJcblxyXG4gICAgLy8gSGVyZSB3ZSBjaGVjayBpZiB0aGVyZSB3ZXJlIGFjdHVhbGx5IHNlZWRzIHJlbW92ZWQgYnkgdGhlIHVzZXJcclxuICAgIGNvbnN0IG1lbW9yeVNlZWRzVG9SZW1vdmUgPVxyXG4gICAgICAgIGluamVjdGVkTWVtb3J5U2VlZHMuZmlsdGVyKFxyXG4gICAgICAgICAgICAobWVtb3J5U2VlZCkgPT5cclxuICAgICAgICAgICAgICAgICF2YWxpZE1lbW9yeVNlZWRzU2VsZWN0ZWQuaW5jbHVkZXMoXHJcbiAgICAgICAgICAgICAgICAgICAgbWVtb3J5U2VlZCxcclxuICAgICAgICAgICAgICAgICksXHJcbiAgICAgICAgKTtcclxuICAgIFxyXG4gICAgLy8gU2Vjb25kIGNoZWNrIHRvIG1ha2Ugc3VyZSB0aGVyZSdzIGFjdHVhbGx5IHNvbWV0aGluZyB0byByZW1vdmVcclxuICAgIGlmKG1lbW9yeVNlZWRzVG9SZW1vdmUubGVuZ3RoID4gMCkge1xyXG5cclxuICAgICAgICBhd2FpdCByZW1vdmVNZW1vcnlTZWVkcyh2YWxpZE1lbW9yeVNlZWRzU2VsZWN0ZWQsIG1lbW9yeVNlZWRzVG9SZW1vdmUsIGNsZWFudXBBbGxTZWVkcyk7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIHZhbGlkTWVtb3J5U2VlZHNTZWxlY3RlZDtcclxufVxyXG5cclxuLyoqXHJcbiogSGVscGVyc1xyXG4qL1xyXG5mdW5jdGlvbiBhcmVTdHJpbmdBcnJheXNFcXVhbEFzU2V0cyhcclxuICAgIGE6IHN0cmluZ1tdLFxyXG4gICAgYjogc3RyaW5nW10sXHJcbik6IGJvb2xlYW4ge1xyXG4gICAgY29uc3QgYVNldCA9IG5ldyBTZXQoYSk7XHJcbiAgICBjb25zdCBiU2V0ID0gbmV3IFNldChiKTtcclxuXHJcbiAgICBpZiAoYVNldC5zaXplICE9PSBiU2V0LnNpemUpIHtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcblxyXG4gICAgcmV0dXJuIFsuLi5hU2V0XS5ldmVyeSgodmFsdWUpID0+IGJTZXQuaGFzKHZhbHVlKSk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVKc29uRmlsZU5hbWUoanNvbkZpbGVOYW1lOiBzdHJpbmcpe1xyXG5cclxuICAgIHJldHVybiBqc29uRmlsZU5hbWUucmVwbGFjZSgvKFxcLmpzb24pLiokLywgXCIkMVwiKTtcclxufVxyXG5cclxuLyoqXHJcbiAqIEZsb3cgaXMgcHJvbXB0IHByZXByb2Nlc3NvciBcdTIxOTIgcHJvbXB0UHJvY2Vzc29yQXBwZW5kTWVzc2FnZU51bWJlclRvTGFzdEFzc2lzdGFudE1lc3NhZ2UgXHUyMTkyIG11bHRpRWRpdENvb3JkaW5hdG9yXHJcbiAqIFx1MjE5MiBwcm9tcHRQcm9jZXNzb3JDb25zdHJ1Y3RNZXNzYWdlTnVtYmVyVGFnIFx1MjE5MiBtdWx0aUVkaXRDb29yZGluYXRvcihjb252ZXJzYXRpb24uanNvbiB3cml0ZSlcclxuICovXHJcbmFzeW5jIGZ1bmN0aW9uIHByb21wdFByb2Nlc3NvckFwcGVuZE1lc3NhZ2VOdW1iZXJUb0xhc3RBc3Npc3RhbnRNZXNzYWdlKFxyXG4gICAgYXNzaXN0YW50SW5kZXg6IG51bWJlcixcclxuKTogUHJvbWlzZTx2b2lkPiB7XHJcblxyXG4gICAgYWRkQ29udmVyc2F0aW9uT3BlcmF0aW9uKFxyXG4gICAgICAgIFwicHJvbXB0UHJvY2Vzc29yQXBwZW5kTWVzc2FnZU51bWJlclRvTGFzdEFzc2lzdGFudE1lc3NhZ2VcIixcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIGFzc2lzdGFudEluZGV4LFxyXG4gICAgICAgIH0sXHJcbiAgICApO1xyXG59XHJcblxyXG4vKipcclxuICogQ29uc3RydWN0cyB0aGUgTWVzc2FnZSBOdW1iZXIgVGFnXHJcbiAqIEFwcGVuZHMgdGhlIGNvbnRlbnQgYmxvY2sgYWZ0ZXIgdGhlIGFzc2lzdGFudCByZXNwb25zZVxyXG4gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIHByb21wdFByb2Nlc3NvckNvbnN0cnVjdE1lc3NhZ2VOdW1iZXJUYWcoXHJcbiAgICBjb252ZXJzYXRpb246IGFueSxcclxuICAgIGFzc2lzdGFudEluZGV4OiBudW1iZXIsXHJcbiAgICB0YXJnZXRBc3Npc3RhbnRNZXNzYWdlSW5kZXg6IG51bWJlcixcclxuKTogdm9pZCB7XHJcblxyXG4gICAgLy8gRmluZCB0aGUgbGFzdCBhc3Npc3RhbnQgbWVzc2FnZSBmb3IgdGhpcyBNRUMgaW5zdGFuY2VcclxuICAgIGNvbnN0IGFzc2lzdGFudE1lc3NhZ2UgPSBjb252ZXJzYXRpb24ubWVzc2FnZXNbdGFyZ2V0QXNzaXN0YW50TWVzc2FnZUluZGV4XTtcclxuXHJcbiAgICBpZiAoIWFzc2lzdGFudE1lc3NhZ2UpIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJObyBhc3Npc3RhbnQgbWVzc2FnZSBmb3VuZC5cIik7XHJcbiAgICB9XHJcblxyXG4gICAgLy8gR2V0IHRoZSBsYXN0IHZlcnNpb25cclxuICAgIGNvbnN0IGFzc2lzdGFudFZlcnNpb24gPVxyXG4gICAgICAgIGFzc2lzdGFudE1lc3NhZ2U/LnZlcnNpb25zPy5bXHJcbiAgICAgICAgICAgIGFzc2lzdGFudE1lc3NhZ2UuY3VycmVudGx5U2VsZWN0ZWQgPz8gMFxyXG4gICAgICAgIF07XHJcbiAgICAgXHJcbiAgICBpZiAoIWFzc2lzdGFudFZlcnNpb24pIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJBc3Npc3RhbnQgbWVzc2FnZSBoYXMgbm8gdmVyc2lvbnMuXCIpO1xyXG4gICAgfVxyXG5cclxuICAgIC8vIEZpbmQgZGVidWdJbmZvQmxvY2tcclxuICAgIGNvbnN0IGRlYnVnSW5mb0luZGV4ID0gYXNzaXN0YW50VmVyc2lvbi5zdGVwcy5maW5kSW5kZXgoXHJcbiAgICAgICAgKHN0ZXA6IGFueSkgPT4gc3RlcC50eXBlID09PSBcImRlYnVnSW5mb0Jsb2NrXCIsXHJcbiAgICApO1xyXG5cclxuICAgIC8vIENyZWF0ZSB0aGUgbmV3IGNvbnRlbnQgYmxvY2tcclxuICAgIGNvbnN0IG1hcmtlckJsb2NrID0ge1xyXG4gICAgICAgIHR5cGU6IFwiY29udGVudEJsb2NrXCIsXHJcbiAgICAgICAgc3RlcElkZW50aWZpZXI6IFN0cmluZyhEYXRlLm5vdygpKSxcclxuICAgICAgICBjb250ZW50OiBbXHJcbiAgICAgICAgICAgIHtcclxuICAgICAgICAgICAgdHlwZTogXCJ0ZXh0XCIsXHJcbiAgICAgICAgICAgIHRleHQ6IGBcXG5cXG4qKiptZXNzYWdlICR7YXNzaXN0YW50SW5kZXh9KioqYCxcclxuICAgICAgICAgICAgZnJvbURyYWZ0TW9kZWw6IGZhbHNlLFxyXG4gICAgICAgICAgICB0b2tlbnNDb3VudDogMSxcclxuICAgICAgICAgICAgaXNTdHJ1Y3R1cmFsOiBmYWxzZSxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICBdLFxyXG4gICAgICAgIGRlZmF1bHRTaG91bGRJbmNsdWRlSW5Db250ZXh0OiBmYWxzZSxcclxuICAgICAgICBzaG91bGRJbmNsdWRlSW5Db250ZXh0OiBmYWxzZSxcclxuICAgICAgICB9O1xyXG5cclxuICAgICAgICBjb25zdCBtYXJrZXJFeGlzdHMgPSBhc3Npc3RhbnRWZXJzaW9uLnN0ZXBzLnNvbWUoXHJcbiAgICAgICAgKHN0ZXA6IGFueSkgPT5cclxuICAgICAgICAgICAgc3RlcC50eXBlID09PSBcImNvbnRlbnRCbG9ja1wiICYmXHJcbiAgICAgICAgICAgIHN0ZXAuY29udGVudD8uc29tZShcclxuICAgICAgICAgICAgICAgIChjb250ZW50QmxvY2s6IGFueSkgPT5cclxuICAgICAgICAgICAgICAgICAgICBjb250ZW50QmxvY2sudHlwZSA9PT0gXCJ0ZXh0XCIgJiZcclxuICAgICAgICAgICAgICAgICAgICBjb250ZW50QmxvY2sudGV4dCA9PT0gYFxcblxcbioqKm1lc3NhZ2UgJHthc3Npc3RhbnRJbmRleH0qKipgLFxyXG4gICAgICAgICAgICApLFxyXG4gICAgKTtcclxuXHJcbiAgICAvLyBUcnkgdG8gYWRkIG1hcmtlciBibG9jayBvYmplY3QgYmVmb3JlIGRlYnVnLlxyXG4gICAgLy8gSWYgdGhhdCBkb2Vzbid0IGV4aXN0IGp1c3QgYWRkIGFmdGVyIHRoZSBsYXN0IHJvbGU6IGFzc2lzdGFudCBjb250ZW50IGJsb2NrLlxyXG4gICAgY29uc3QgaW5zZXJ0SW5kZXggPVxyXG4gICAgICAgIGRlYnVnSW5mb0luZGV4ICE9PSAtMVxyXG4gICAgICAgICAgICA/IGRlYnVnSW5mb0luZGV4XHJcbiAgICAgICAgICAgIDogYXNzaXN0YW50VmVyc2lvbi5zdGVwcy5sZW5ndGg7XHJcblxyXG4gICAgaWYgKCFtYXJrZXJFeGlzdHMpIHtcclxuICAgICAgICBhc3Npc3RhbnRWZXJzaW9uLnN0ZXBzLnNwbGljZShcclxuICAgICAgICAgICAgaW5zZXJ0SW5kZXgsXHJcbiAgICAgICAgICAgIDAsXHJcbiAgICAgICAgICAgIG1hcmtlckJsb2NrLFxyXG4gICAgICAgICk7XHJcbiAgICB9XHJcbn1cclxuXHJcbi8qKlxyXG4gKiBUbyBjYXB0dXJlIHRoZSBjb252ZXJzYXRpb24gZmlsZXMgdGhhdCBhcmUgd2l0aGluIG5lc3RlZCBmb2xkZXJzXHJcbiAqL1xyXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29udmVyc2F0aW9uUmVsYXRpdmVQYXRoKFxyXG4gICAgY29udmVyc2F0aW9uc0RpcmVjdG9yeTogc3RyaW5nLFxyXG4gICAgY29udmVyc2F0aW9uRmlsZVBhdGg6IHN0cmluZyxcclxuKTogc3RyaW5nIHtcclxuICAgIHJldHVybiByZWxhdGl2ZShcclxuICAgICAgICBjb252ZXJzYXRpb25zRGlyZWN0b3J5LFxyXG4gICAgICAgIGNvbnZlcnNhdGlvbkZpbGVQYXRoLFxyXG4gICAgKS5zcGxpdChwYXRoLnNlcCkuam9pbihcIi9cIik7XHJcbn0iLCAiaW1wb3J0IHsgbWVtb3J5U3RvcmUgfSBmcm9tIFwiLi9tZW1vcnlTdG9yZVwiO1xyXG5pbXBvcnQgeyBqb2luIH0gZnJvbSBcIm5vZGU6cGF0aFwiO1xyXG5pbXBvcnQgeyByZWFkZGlyLCB1bmxpbmssIHJtZGlyIH0gZnJvbSBcIm5vZGU6ZnMvcHJvbWlzZXNcIjtcclxuaW1wb3J0IHsgcmVtb3ZlTWVtb3J5U2VlZEZyb21Qb29sLCBnZXRNZW1vcnlTZWVkc1Bvb2wgfSBmcm9tIFwiLi9tZW1vcnlTZXNzaW9uXCI7XHJcbmltcG9ydCB7IHNldENvbmZpZ1NjaGVtYXRpY3MgfSBmcm9tIFwiLi9jb25maWdcIlxyXG5pbXBvcnQgeyBkZWxldGVNZW1vcnlGcm9tVGFibGVPZk1lbW9yaWVzIH0gZnJvbSBcIi4vdGFibGVPZk1lbW9yaWVzXCI7XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZGVsZXRlTWVtb3J5U2VlZEZpbGUoXHJcbiAgICBtZW1vcnlTZWVkOiBzdHJpbmcsXHJcbik6IFByb21pc2U8c3RyaW5nPiB7XHJcblxyXG4gICAgY29uc3Qgbm9ybWFsaXplZE1lbW9yeVNlZWQgPSBtZW1vcnlTZWVkXHJcbiAgICAgICAgLnRyaW0oKVxyXG4gICAgICAgIC5zcGxpdChcIi5qc29uXCIpWzBdICsgXCIuanNvblwiO1xyXG5cclxuICAgIGNvbnN0IFtjYXRlZ29yeSwgZmlsZW5hbWVdID0gbm9ybWFsaXplZE1lbW9yeVNlZWQuc3BsaXQoXCIvXCIpO1xyXG5cclxuICAgIHRyeXtcclxuICAgICAgICBjb25zdCBtZW1vcmllc0RpcmVjdG9yeSA9IGF3YWl0IG1lbW9yeVN0b3JlLmdldE1lbW9yaWVzRGlyZWN0b3J5KCk7XHJcblxyXG4gICAgICAgIGNvbnN0IG1lbW9yeUZpbGUgPSBqb2luKFxyXG4gICAgICAgICAgICBtZW1vcmllc0RpcmVjdG9yeSxcclxuICAgICAgICAgICAgY2F0ZWdvcnksXHJcbiAgICAgICAgICAgIGZpbGVuYW1lLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIC8vIERlbGV0ZSB0aGUgZmlsZSBpZiBpdCBleGlzdFxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGF3YWl0IHVubGluayhtZW1vcnlGaWxlKTtcclxuXHJcbiAgICAgICAgICAgIC8vIFRoZSBtZW1vcnkgZmlsZSB3YXMgZGVsZXRlZCBzdWNjZXNzZnVsbHksIHNvIHJlbW92ZSBpdHMgVE9NIGVudHJ5LlxyXG4gICAgICAgICAgICBsZXQgdG9tRmlsZU5hbWUgPSBcIlwiO1xyXG5cclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIHRvbUZpbGVOYW1lID0gYXdhaXQgZGVsZXRlTWVtb3J5RnJvbVRhYmxlT2ZNZW1vcmllcyhcclxuICAgICAgICAgICAgICAgICAgICBtZW1vcmllc0RpcmVjdG9yeSxcclxuICAgICAgICAgICAgICAgICAgICBjYXRlZ29yeSxcclxuICAgICAgICAgICAgICAgICAgICBmaWxlbmFtZSxcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgICAgICAvLyBjb25zb2xlLmVycm9yKFxyXG4gICAgICAgICAgICAgICAgLy8gICAgIGBGYWlsZWQgdG8gcmVtb3ZlIFwiJHtub3JtYWxpemVkTWVtb3J5U2VlZH1cIiBmcm9tICR7dG9tRmlsZU5hbWV9OmAsXHJcbiAgICAgICAgICAgICAgICAvLyAgICAgZXJyb3IsXHJcbiAgICAgICAgICAgICAgICAvLyApO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICByZW1vdmVNZW1vcnlTZWVkRnJvbVBvb2wobm9ybWFsaXplZE1lbW9yeVNlZWQpO1xyXG5cclxuICAgICAgICAgICAgc2V0Q29uZmlnU2NoZW1hdGljcyh7bWVtb3J5U2VlZHNQb29sOiBbLi4uZ2V0TWVtb3J5U2VlZHNQb29sKCldfSk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgICAgICAgaWYgKGVycm9yLmNvZGUgPT09IFwiRU5PRU5UXCIpIHtcclxuICAgICAgICAgICAgICAgIC8vIGNvbnNvbGUuZXJyb3IoYGRlbGV0ZU1lbW9yeVNlZWRGaWxlIEVycm9yOiBNZW1vcnkgc2VlZCBcIiR7bm9ybWFsaXplZE1lbW9yeVNlZWR9XCIgd2FzIG5vdCBmb3VuZC5gKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICBcclxuICAgICAgICAvLyBDaGVjayBpZiBmb2xkZXIgaXMgZW1wdHlcclxuICAgICAgICAvLyBEZWxldGUgZm9sZGVyIGlmIGVtcHR5XHJcbiAgICAgICAgY29uc3QgY2F0ZWdvcnlEaXJlY3RvcnkgPSBqb2luKFxyXG4gICAgICAgICAgICBtZW1vcmllc0RpcmVjdG9yeSxcclxuICAgICAgICAgICAgY2F0ZWdvcnksXHJcbiAgICAgICAgKTtcclxuXHJcbiAgICAgICAgY29uc3QgcmVtYWluaW5nRmlsZXMgPSBhd2FpdCByZWFkZGlyKFxyXG4gICAgICAgICAgICBjYXRlZ29yeURpcmVjdG9yeSxcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBpZiAocmVtYWluaW5nRmlsZXMubGVuZ3RoID09PSAwKSB7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBybWRpcihjYXRlZ29yeURpcmVjdG9yeSk7XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yOiBhbnkpIHtcclxuICAgICAgICAgICAgICAgIGlmIChlcnJvci5jb2RlICE9PSBcIkVQRVJNXCIgJiYgZXJyb3IuY29kZSAhPT0gXCJFTk9URU1QVFlcIikge1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIGNvbnNvbGUuZXJyb3IoYGRlbGV0ZU1lbW9yeVNlZWRGaWxlIEVycm9yOiBDYXRlZ29yeSBEaXJlY3RvcnkgXCIke2NhdGVnb3J5RGlyZWN0b3J5fVwiIHdhcyBub3QgZm91bmQuYCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIHJldHVybiBgTWVtb3J5IHNlZWQgXCIke25vcm1hbGl6ZWRNZW1vcnlTZWVkfVwiIGRlbGV0ZWQgc3VjY2Vzc2Z1bGx5LmA7XHJcblxyXG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xyXG4gICAgICAgIGlmIChlcnJvci5jb2RlID09PSBcIkVOT0VOVFwiKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBgZGVsZXRlTWVtb3J5U2VlZEZpbGUgRXJyb3I6IE1lbW9yeSBzZWVkIFwiJHtub3JtYWxpemVkTWVtb3J5U2VlZH1cIiB3YXMgbm90IGZvdW5kLmA7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiBgTWVtb3J5IHNlZWQgXCIke25vcm1hbGl6ZWRNZW1vcnlTZWVkfVwiIGRlbGV0ZWQgc3VjY2Vzc2Z1bGx5LmA7XHJcbn0iLCAiaW1wb3J0IHR5cGUgeyBQZW5kaW5nU2F2ZU1lbW9yeSB9IGZyb20gXCIuL2NvbmZpZ1wiXHJcbmltcG9ydCB7IHRvb2wsIFRvb2wsIFRvb2xzUHJvdmlkZXJDb250cm9sbGVyIH0gZnJvbSBcIkBsbXN0dWRpby9zZGtcIjtcclxuaW1wb3J0IHsgYWRkTWVtb3J5U2VlZFRvUG9vbCwgZ2V0TWVtb3J5U2VlZHNQb29sIH0gZnJvbSBcIi4vbWVtb3J5U2Vzc2lvblwiO1xyXG5pbXBvcnQgeyBkZWxldGVNZW1vcnlTZWVkRmlsZSB9IGZyb20gXCIuL2RlbGV0ZU1lbW9yeVNlZWRGaWxlc1wiO1xyXG5pbXBvcnQgeyBjb25maWdTY2hlbWF0aWNzLCBnZXRQZW5kaW5nU2F2ZU1lbW9yeSwgc2V0UGVuZGluZ1NhdmVNZW1vcnksIH0gZnJvbSBcIi4vY29uZmlnXCI7XHJcbmltcG9ydCB7IHByb21wdFByb2Nlc3NvckNvbnN0cnVjdE1lbW9yaWVzVG9JbmplY3QgfSBmcm9tIFwiLi9wcm9tcHRQcmVwcm9jZXNzb3JcIjtcclxuaW1wb3J0IHsgbXVsdGlTYXZlTWVtb3J5LCBzYXZlTWVtb3J5IH0gZnJvbSBcIi4vdHJpZ2dlclNhdmVNZW1vcnlcIjtcclxuaW1wb3J0IHsgeiB9IGZyb20gXCJ6b2RcIjtcclxuXHJcbmltcG9ydCB7IFxyXG4gICAgY29uc3RydWN0VE9NU3VtbWFyaWVzTG9va3VwVGFibGUsIFxyXG4gICAgZm9ybWF0QXNUYWJsZVN0cmluZywgXHJcbiAgICBmb3JtYXRNZW1vcnlQYWNrYWdlLCBcclxuICAgIHRhYmxlT2ZNZW1vcmllc0RpcmVjdExvb2t1cCwgXHJcbiAgICB0YWJsZU9mTWVtb3JpZXNTdW1tYXJpZXNMb29rdXAgXHJcbn0gZnJvbSBcIi4vdGFibGVPZk1lbW9yaWVzXCI7XHJcblxyXG5pbXBvcnQge1xyXG4gICAgY29tcGFjdGlvblNlZWRFeGlzdHMsIFxyXG4gICAgY29tcGFjdGlvblRvTWVtb3J5U2VlZFRyYW5zZmVyLCBcclxuICAgIGNyZWF0ZUNvbXBhY3Rpb25TdW1tYXJ5LCBcclxuICAgIGVuQ29tcGFjdGlvblNlZWRFeGlzdHMsIFxyXG4gICAgbGlzdENvbXBhY3Rpb25TZWVkc1xyXG59IGZyb20gXCIuL3RhYmxlT2ZDb21wYWN0aW9uc1wiO1xyXG5cclxubGV0IGFscmVhZHlUcmlnZ2VyZWQgPSBmYWxzZTtcclxuXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB0b29sc1Byb3ZpZGVyKFxyXG4gIGN0bDogVG9vbHNQcm92aWRlckNvbnRyb2xsZXJcclxuKTogUHJvbWlzZTxUb29sW10+IHtcclxuICAgIGNvbnN0IHRvb2xzOiBUb29sW10gPSBbXTtcclxuICAgIGNvbnN0IGNvbmZpZyA9IGN0bC5nZXRQbHVnaW5Db25maWcoY29uZmlnU2NoZW1hdGljcyk7XHJcbiAgICBjb25zdCBtZW1vcnlGaWxlVG9EZWxldGUgPSBjb25maWcuZ2V0KFwiZGVsZXRlTWVtb3J5U2VlZHNGaWxlXCIpIGFzIHN0cmluZztcclxuICAgIGNvbnN0IGVuYWJsZVRvb2xzTW9kZSA9IGNvbmZpZy5nZXQoXCJlbmFibGVUb29sc01vZGVcIikgYXMgYm9vbGVhbjtcclxuICAgIGNvbnN0IGVuZ3JhaW5Db21wYWN0aW9uID0gY29uZmlnLmdldChcImVuZ3JhaW5Db21wYWN0aW9uXCIpIGFzIHN0cmluZztcclxuXHJcbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgLy8gTW9uaXRvciBmb3IgU2hhZG93IENvcHkgUHJvdmlkZWQgZnJvbSBDb250ZXh0IENsZWFudXAgUGx1Z2luXHJcbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgY29uc3QgaXNWYWxpZENvbXBhY3Rpb25GaWxlTmFtZSA9IC9eLitfY1xcZCtfcFxcZCtcXC5qc29uJC9pLnRlc3QoZW5ncmFpbkNvbXBhY3Rpb24pO1xyXG5cclxuICAgIGlmKGlzVmFsaWRDb21wYWN0aW9uRmlsZU5hbWUpIHtcclxuICAgICAgICBpZihhbHJlYWR5VHJpZ2dlcmVkID09PSBmYWxzZSkge1xyXG4gICAgICAgICAgICBhbHJlYWR5VHJpZ2dlcmVkID0gdHJ1ZTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IGlzVmFsaWRDb21wYWN0aW9uU2VlZCA9IGF3YWl0IGNvbXBhY3Rpb25TZWVkRXhpc3RzKGVuZ3JhaW5Db21wYWN0aW9uKTtcclxuXHJcbiAgICAgICAgICAgIGlmKGlzVmFsaWRDb21wYWN0aW9uU2VlZCkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZG9lc0VuQ29tcGFjdGlvbkFscmVhZHlFeGlzdCA9IGF3YWl0IGVuQ29tcGFjdGlvblNlZWRFeGlzdHMoZW5ncmFpbkNvbXBhY3Rpb24pO1xyXG4gICAgICAgICAgICAgICAgXHJcbiAgICAgICAgICAgICAgICBpZiAoIWRvZXNFbkNvbXBhY3Rpb25BbHJlYWR5RXhpc3QpIHtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBjb21wYWN0aW9uVG9NZW1vcnlTZWVkVHJhbnNmZXIoZW5ncmFpbkNvbXBhY3Rpb24pO1xyXG5cclxuICAgICAgICAgICAgICAgICAgICAvLyBJbmplY3QgbmV3IG1lbW9yeSBzZWVkIGludG8gdGhlIGF2YWlsYWJsZSBtZW1vcnkgc2VlZHMgcG9vbFxyXG4gICAgICAgICAgICAgICAgICAgIGFkZE1lbW9yeVNlZWRUb1Bvb2woYGVuX2NvbXBzLyR7ZW5ncmFpbkNvbXBhY3Rpb259YCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgYWxyZWFkeVRyaWdnZXJlZCA9IGZhbHNlO1xyXG4gICAgICAgIH07XHJcbiAgICB9XHJcblxyXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAgIC8vIE1FTU9SWSBTRUVEIERFTEVUSU9OXHJcbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgY29uc3Qgbm9ybWFsaXplZE1lbW9yeUZpbGVUb0RlbGV0ZSA9IG1lbW9yeUZpbGVUb0RlbGV0ZS50cmltKClcclxuXHJcbiAgICBjb25zdCB3aWxkY2FyZE1hdGNoID1cclxuICAgICAgICBub3JtYWxpemVkTWVtb3J5RmlsZVRvRGVsZXRlLm1hdGNoKFxyXG4gICAgICAgICAgICAvXihbXi9dKylcXC9cXCpcXC5qc29uJC9pLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgaWYgKFxyXG4gICAgICAgIHdpbGRjYXJkTWF0Y2ggJiZcclxuICAgICAgICBub3JtYWxpemVkTWVtb3J5RmlsZVRvRGVsZXRlICE9PSBcIlwiXHJcbiAgICApIHtcclxuICAgICAgICAvLyBIYW5kbGUgd2lsZGNhcmQgZGVsZXRpb25cclxuICAgICAgICBjb25zdCBjYXRlZ29yeSA9IHdpbGRjYXJkTWF0Y2hbMV07XHJcblxyXG4gICAgICAgIGNvbnN0IG1lbW9yeVNlZWRzVG9EZWxldGUgPVxyXG4gICAgICAgICAgICBnZXRNZW1vcnlTZWVkc1Bvb2woKS5maWx0ZXIoXHJcbiAgICAgICAgICAgICAgICAobWVtb3J5U2VlZCkgPT5cclxuICAgICAgICAgICAgICAgICAgICBtZW1vcnlTZWVkLnN0YXJ0c1dpdGgoXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGAke2NhdGVnb3J5fS9gLFxyXG4gICAgICAgICAgICAgICAgICAgICksXHJcbiAgICAgICAgICAgICk7XHJcbiAgICAgICAgXHJcbiAgICAgICAgLy8gQ2F0ZWdvcnkgZG9lcyBub3QgZXhpc3QgaW4gdGhlIG1lbW9yeSBwb29sIFx1MjE5MiBkbyBub3RoaW5nXHJcbiAgICAgICAgaWYgKG1lbW9yeVNlZWRzVG9EZWxldGUubGVuZ3RoICE9PSAwKSB7XHJcbiAgICAgICAgICAgIGZvciAoY29uc3QgbWVtb3J5U2VlZCBvZiBtZW1vcnlTZWVkc1RvRGVsZXRlKSB7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBkZWxldGVNZW1vcnlTZWVkRmlsZShtZW1vcnlTZWVkKTtcclxuICAgICAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJkZWxldGVkIFwiLCBtZW1vcnlTZWVkKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuXHJcbiAgICB9IGVsc2UgaWYgKFxyXG4gICAgICAgIC8vIE5vcm1hbCBmaWxlIGRlbGV0aW9uXHJcbiAgICAgICAgbm9ybWFsaXplZE1lbW9yeUZpbGVUb0RlbGV0ZSAhPT0gXCJcIiAmJlxyXG4gICAgICAgIGdldE1lbW9yeVNlZWRzUG9vbCgpLmluY2x1ZGVzKG5vcm1hbGl6ZWRNZW1vcnlGaWxlVG9EZWxldGUpXHJcbiAgICApIHtcclxuICAgICAgICBhd2FpdCBkZWxldGVNZW1vcnlTZWVkRmlsZShub3JtYWxpemVkTWVtb3J5RmlsZVRvRGVsZXRlKTtcclxuXHJcbiAgICAgICAgY29uc29sZS5sb2coXCJkZWxldGVkIFwiLCBub3JtYWxpemVkTWVtb3J5RmlsZVRvRGVsZXRlKTtcclxuICAgIH1cclxuXHJcbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgLy8gTUVNT1JZIFNFRUQgRlVaWlkgUkVDQUxMXHJcbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgY29uc3QgbWVtb3J5U2VlZFJlY2FsbCA9IHRvb2woe1xyXG4gICAgICAgIG5hbWU6IFwibWVtb3J5X3NlZWRfcmVjYWxsXCIsXHJcblxyXG4gICAgICAgIGRlc2NyaXB0aW9uOlxyXG4gICAgICAgICAgICBgVGhpcyB0b29sIGlzIHVzZWQgZm9yIHdoZW4gdGhlIHVzZXIgd2FudHMgdGhlIGFzc2lzdGFudCB0byBzZWFyY2ggdGhyb3VnaCB0aGVpciBtZW1vcmllcyBkaXJlY3RvcnkgdG8gcmVjb2xsZWN0IHdoaWNoIG1lbW9yeSBmaWxlIGJlc3QgbWF0Y2hlcyB0aGUgbWVtb3J5IHRoZXkgYXJlIHRyeWluZyB0byBsb2NhdGUuYCArXHJcbiAgICAgICAgICAgIGBUaGlzIHRvb2wgc2hvdWxkIG5vdCBiZSB1c2VkIHRvIGRpcmVjdGx5IHJldHJpZXZlIGEgbWVtb3J5IGZpbGUncyBmdWxsIGNvbnRlbnQuYCtcclxuICAgICAgICAgICAgYFRoaXMgdG9vbCBvbmx5IHJldHVybnMgdXAgdG8gdGhyZWUgcmVzdWx0cyBjb250YWluaW5nIGEgbWVtb3J5IGZpbGVuYW1lIGFsb25nIHdpdGggaXQncyBzdW1tYXJ5LmAgK1xyXG4gICAgICAgICAgICBgUHJlc2VudCB0aGUgcmVzdWx0cyB0byB0aGUgdXNlciBiZWZvcmUgY2FsbGluZyB0aGlzIHRvb2wgYWdhaW4uYCArXHJcbiAgICAgICAgICAgICdJbmNsdWRlIHRoaXMgZm9sbG93aW5nIHRhZyBcIlx1RDgzRFx1RENFNiAqKk1lbW9yeSBQYWNrYWdlKipcIiBhdCB0aGUgYmVnaW5uaW5nIG9mIHlvdXIgcmVzcG9uc2UsIGluY2x1ZGluZyB0aGUgXHVEODNEXHVEQ0U2IGVtb2ppLCBhcyB0aGUgdGl0bGUuJyArXHJcbiAgICAgICAgICAgICdUaGUgcmVzdWx0cyB3aWxsIGJlIHJldHVybmVkIGFzIGEgc3RyaW5nIHByZXBhcmVkIHRvIGJlIGRpc3BsYXllZCBhcyBhIG1hcmtkb3duIHRhYmxlLicsXHJcbiAgXHJcbiAgICAgICAgcGFyYW1ldGVyczoge1xyXG4gICAgICAgICAgICB1c2VyUXVlcnk6IHpcclxuICAgICAgICAgICAgLnN0cmluZygpXHJcbiAgICAgICAgICAgIC50cmltKClcclxuICAgICAgICAgICAgLm1pbigxKVxyXG4gICAgICAgICAgICAuZGVzY3JpYmUoXHJcbiAgICAgICAgICAgICAgICBcIlRoZSB1c2VyJ3MgcHJvdmlkZWQgcXVlcnkgb2YgdGhlIG1lbW9yeSB0aGV5IGFyZSB0cnlpbmcgdG8gaGF2ZSB0aGUgYXNzaXN0YW50IHJlY29sbGVjdCBmb3IgdGhlbS5cIlxyXG4gICAgICAgICAgICApLFxyXG4gICAgICAgIH0sXHJcblxyXG4gICAgICAgIGltcGxlbWVudGF0aW9uOiBhc3luYyAocGFyYW1zOiB7XHJcbiAgICAgICAgICAgIHVzZXJRdWVyeTogc3RyaW5nO1xyXG4gICAgICAgIH0pID0+IHtcclxuICAgICAgICAgICAgY29uc3QgeyB1c2VyUXVlcnkgfSA9IHBhcmFtcztcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHJldHVyblBhY2thZ2UgPSBhd2FpdCB0YWJsZU9mTWVtb3JpZXNTdW1tYXJpZXNMb29rdXAodXNlclF1ZXJ5KTtcclxuXHJcbiAgICAgICAgICAgIGlmIChyZXR1cm5QYWNrYWdlID09PSBcIlwiKSByZXR1cm4gXCJubyBtYXRjaCBmb3VuZFwiO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgdGFibGVmaWVkUmV0dXJuUGFja2FnZSA9IGNvbnN0cnVjdFRPTVN1bW1hcmllc0xvb2t1cFRhYmxlKHJldHVyblBhY2thZ2UpO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAgICAgIHRhYmxlZmllZFJldHVyblBhY2thZ2UsXHJcbiAgICAgICAgICAgIF0uam9pbihcIlxcblwiKTtcclxuICAgICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAgIC8vIFRhYmxlIE9mIE1lbW9yaWVzIExvb2tVcFxyXG4gICAgLy8tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAgIGNvbnN0IHRhYmxlT2ZNZW1vcmllc1JlY2FsbCA9IHRvb2woe1xyXG4gICAgICAgIG5hbWU6IFwidGFibGVfb2ZfbWVtb3JpZXNfbG9va3VwXCIsXHJcblxyXG4gICAgICAgIGRlc2NyaXB0aW9uOlxyXG4gICAgICAgICAgICBgVGhpcyB0b29sIGlzIHVzZWQgZm9yIHdoZW4gdGhlIHVzZXIgd2FudHMgdGhlIGFzc2lzdGFudCB0byBkaXNwbGF5IHRvIHRoZW0gdGhlIHRhYmxlIG9mIG1lbW9yaWVzLmAgK1xyXG4gICAgICAgICAgICBgVGhlIHRhYmxlIG9mIG1lbW9yaWVzIG9ubHkgY29udGFpbnMgbWV0YWRhdGEgYW5kIHN1bW1hcmllcyBvZiBtZW1vcnkgZmlsZXMuYCArXHJcbiAgICAgICAgICAgIGBBbHdheXMgZmlyc3QgYXNrIGZvciB0aGUgdXNlciB0byBjbGFyaWZ5IHdoaWNoIHNwZWNpZmljIE1lbW9yaWVzIFRhYmxlIHRoZXkgd291bGQgbGlrZSB0byBsb29rIHVwOyB0aGVpciBvcHRpb25zIGFyZSBUT01fQS1KLCBUT01fSy1RLCBUT01fUi1aLiBUaGUgc2hvcnRoYW5kIHZlcnNpb25zIG9mIHRoZXNlIGFyZSB0b21haiwgdG9ta3EsIGFuZCB0b21yei5gICtcclxuICAgICAgICAgICAgYFByZXNlbnQgdGhlIHJlc3VsdHMgdG8gdGhlIHVzZXIgYmVmb3JlIGNhbGxpbmcgdGhpcyB0b29sIGFnYWluLmAgK1xyXG4gICAgICAgICAgICAnSW5jbHVkZSB0aGlzIGZvbGxvd2luZyB0YWcgXCJcdUQ4M0RcdURDRTYgKipNZW1vcnkgUGFja2FnZSoqXCIgYXQgdGhlIGJlZ2lubmluZyBvZiB5b3VyIHJlc3BvbnNlLCBpbmNsdWRpbmcgdGhlIFx1RDgzRFx1RENFNiBlbW9qaSwgYXMgdGhlIHRpdGxlLicgK1xyXG4gICAgICAgICAgICAnVGhlIHJlc3VsdHMgd2lsbCBiZSByZXR1cm5lZCBhcyBhIHN0cmluZyBwcmVwYXJlZCB0byBiZSBkaXNwbGF5ZWQgYXMgYSBtYXJrZG93biB0YWJsZS4nLFxyXG5cclxuICAgICAgICBwYXJhbWV0ZXJzOiB7XHJcbiAgICAgICAgICAgIHRhYmxlVG9Mb29rVXA6IHpcclxuICAgICAgICAgICAgLnN0cmluZygpXHJcbiAgICAgICAgICAgIC50cmltKClcclxuICAgICAgICAgICAgLm1pbigxKVxyXG4gICAgICAgICAgICAuZGVzY3JpYmUoXCJBdmFpbGFibGUgTWVtb3JpZXMgVGFibGVzOiAnVE9NX0EtSicsICdUT01fSy1RJywgJ1RPTV9SLVonXCIpLFxyXG4gICAgICAgIH0sXHJcblxyXG4gICAgICAgIGltcGxlbWVudGF0aW9uOiBhc3luYyAocGFyYW1zOiB7XHJcbiAgICAgICAgICAgIHRhYmxlVG9Mb29rVXA6IHN0cmluZztcclxuICAgICAgICB9KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHsgdGFibGVUb0xvb2tVcCB9ID0gcGFyYW1zO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgcmV0dXJuUGFja2FnZSA9IGF3YWl0IHRhYmxlT2ZNZW1vcmllc0RpcmVjdExvb2t1cCh0YWJsZVRvTG9va1VwKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChyZXR1cm5QYWNrYWdlID09PSBcIlwiKSByZXR1cm4gXCJubyBtYXRjaCBmb3VuZFwiO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgdGFibGVmaWVkUmV0dXJuUGFja2FnZSA9IGZvcm1hdEFzVGFibGVTdHJpbmcocmV0dXJuUGFja2FnZSk7XHJcblxyXG4gICAgICAgICAgICByZXR1cm4gW1xyXG4gICAgICAgICAgICAgICAgdGFibGVmaWVkUmV0dXJuUGFja2FnZSxcclxuICAgICAgICAgICAgXS5qb2luKFwiXFxuXCIpO1xyXG4gICAgICAgIH0sXHJcbiAgICB9KTtcclxuXHJcbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgLy8gVGFibGUgT2YgTWVtb3JpZXMgTG9va1VwXHJcbiAgICAvLy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxyXG4gICAgY29uc3QgZGlyZWN0TWVtb3J5TG9va3VwID0gdG9vbCh7XHJcbiAgICAgICAgbmFtZTogXCJkaXJlY3RfbWVtb3J5X2xvb2t1cFwiLFxyXG5cclxuICAgICAgICBkZXNjcmlwdGlvbjpcclxuICAgICAgICAgICAgYFRoaXMgdG9vbCBpcyB1c2VkIGZvciB3aGVuIHRoZSB1c2VyIHdhbnRzIHRoZSBhc3Npc3RhbnQgdG8gZmV0Y2ggdGhlbSBhIHNwZWNpZmljIG1lbW9yeS5gICtcclxuICAgICAgICAgICAgYFRoaXMgcmVxdWVzdCBtdXN0IGluY2x1ZGUgYSByZXF1aXJlZCAuanNvbiBzdWZmaXggZm9yIHRoZSBtZW1vcnkgbmFtZS4gQW55IHJlcXVlc3QgbGFja2luZyBhIC5qc29uIHN1ZmZpeCBtZWFucyB0aGlzIGlzIG5vdCB0aGUgcmlnaHQgdG9vbCB0byB1c2UuYCArXHJcbiAgICAgICAgICAgIGBQcmVzZW50IHRoZSByZXN1bHRzIHRvIHRoZSB1c2VyIGJlZm9yZSBjYWxsaW5nIHRoaXMgdG9vbCBhZ2Fpbi5gICtcclxuICAgICAgICAgICAgJ0luY2x1ZGUgdGhpcyBmb2xsb3dpbmcgdGFnIFwiXHVEODNEXHVEQ0U2ICoqTWVtb3J5IFBhY2thZ2UqKlwiIGF0IHRoZSBiZWdpbm5pbmcgb2YgeW91ciByZXNwb25zZSwgaW5jbHVkaW5nIHRoZSBcdUQ4M0RcdURDRTYgZW1vamksIGFzIHRoZSB0aXRsZS4nICtcclxuICAgICAgICAgICAgJ1RoZSByZXN1bHRzIHdpbGwgYmUgcmV0dXJuZWQgYXMgYSBzdHJpbmcgcHJlcGFyZWQgdG8gYmUgZGlzcGxheWVkIGFzIGEgbWFya2Rvd24gdGFibGUuJyxcclxuXHJcbiAgICAgICAgcGFyYW1ldGVyczoge1xyXG4gICAgICAgICAgICBtZW1vcnlKc29uVG9Mb29rVXA6IHpcclxuICAgICAgICAgICAgLnN0cmluZygpXHJcbiAgICAgICAgICAgIC50cmltKClcclxuICAgICAgICAgICAgLm1pbigxKVxyXG4gICAgICAgICAgICAuZGVzY3JpYmUoXCJUaGUgZnVsbCBuYW1lIG9mIHRoZSBtZW1vcnkgbWF0Y2hpbmcgdGhlIHN0cnVjdHVyZSA8Y2F0ZWdvcnlfbmFtZT4vPGZpbGVfbmFtZT4uanNvblwiKSxcclxuICAgICAgICB9LFxyXG5cclxuICAgICAgICBpbXBsZW1lbnRhdGlvbjogYXN5bmMgKHBhcmFtczoge1xyXG4gICAgICAgICAgICBtZW1vcnlKc29uVG9Mb29rVXA6IHN0cmluZztcclxuICAgICAgICB9KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHsgbWVtb3J5SnNvblRvTG9va1VwIH0gPSBwYXJhbXM7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBtZW1vcnlTZWVkc1Bvb2wgPSBnZXRNZW1vcnlTZWVkc1Bvb2woKTtcclxuICAgICAgICAgICAgY29uc3QgcmVxdWVzdGVkU2VlZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcclxuXHJcbiAgICAgICAgICAgIGZvciAoY29uc3Qgc2VlZCBvZiBtZW1vcnlTZWVkc1Bvb2wpIHtcclxuICAgICAgICAgICAgICAgIC8vIEFjY2VwdCBvbmx5IGV4YWN0IHNlZWQgcGF0aHMgbWVudGlvbmVkIGluIHRoZSB1c2VyIHRleHQuXHJcbiAgICAgICAgICAgICAgICBpZiAobWVtb3J5SnNvblRvTG9va1VwLmluY2x1ZGVzKHNlZWQpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVxdWVzdGVkU2VlZHMuYWRkKHNlZWQpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgICAgIC8vIEV4cGFuZCBjYXRlZ29yeS8qLmpzb24gb25seSBmb3Iga25vd24gY2F0ZWdvcmllcy5cclxuICAgICAgICAgICAgICAgIGNvbnN0IHNsYXNoSW5kZXggPSBzZWVkLmluZGV4T2YoXCIvXCIpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHNsYXNoSW5kZXggPT09IC0xKSBjb250aW51ZTtcclxuXHJcbiAgICAgICAgICAgICAgICBjb25zdCBjYXRlZ29yeSA9IHNlZWQuc2xpY2UoMCwgc2xhc2hJbmRleCk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCB3aWxkY2FyZCA9IGAke2NhdGVnb3J5fS8qLmpzb25gO1xyXG5cclxuICAgICAgICAgICAgICAgIGlmIChtZW1vcnlKc29uVG9Mb29rVXAuaW5jbHVkZXMod2lsZGNhcmQpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmVxdWVzdGVkU2VlZHMuYWRkKHNlZWQpO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCB2YWxpZGF0ZWRTZWVkc1RvRmV0Y2ggPSBbLi4ucmVxdWVzdGVkU2VlZHNdO1xyXG5cclxuICAgICAgICAgICAgaWYgKHZhbGlkYXRlZFNlZWRzVG9GZXRjaC5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgICAgIHJldHVybiBgSW52YWxpZCBtZW1vcnkgbmFtZS4gVGhlIGNvcnJlY3Qgc3RydWN0dXJlIGlzIDxjYXRlZ29yeV9uYW1lPi88ZmlsZV9uYW1lPi5qc29uLiBcXG5cXG4gVGhlc2UgYXJlIGN1cnJlbnRseSB0aGUgb25seSBhdmFpbGFibGUgbWVtb3JpZXM6ICR7bWVtb3J5U2VlZHNQb29sLmpvaW4oXCIsIFwiKX1gO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBBbHdheXMgcmV0dXJucyBjb250ZW50IGlmIHRoZSBtZW1vcnkgZXhpc3QuXHJcbiAgICAgICAgICAgIGNvbnN0IHJldHVyblBhY2thZ2UgPSBhd2FpdCBwcm9tcHRQcm9jZXNzb3JDb25zdHJ1Y3RNZW1vcmllc1RvSW5qZWN0KFxyXG4gICAgICAgICAgICAgICAgdmFsaWRhdGVkU2VlZHNUb0ZldGNoLFxyXG4gICAgICAgICAgICAgICAgZmFsc2UsICAgICAgICAgICAgICAgICAgICAgIC8vIERvIG5vdCBzdW1tYXJpemUgc2VlZHNcclxuICAgICAgICAgICAgKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHRhYmxlZmllZFJldHVyblBhY2thZ2UgPSBmb3JtYXRNZW1vcnlQYWNrYWdlKHJldHVyblBhY2thZ2UpO1xyXG5cclxuICAgICAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAgICAgIHRhYmxlZmllZFJldHVyblBhY2thZ2UsXHJcbiAgICAgICAgICAgIF0uam9pbihcIlxcblwiKTtcclxuICAgICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICAvLyBUYWJsZSBPZiBNZW1vcmllcyBMb29rVXBcclxuICAgIC8vLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICBjb25zdCBjb21wYWN0aW9uU3VtbWFyeUZldGNoID0gdG9vbCh7XHJcbiAgICAgICAgbmFtZTogXCJjb21wYWN0aW9uX2ZpbGVfZmV0Y2hcIixcclxuXHJcbiAgICAgICAgZGVzY3JpcHRpb246XHJcbiAgICAgICAgICAgIGBUaGlzIHRvb2wgaXMgdXNlZCBmb3Igd2hlbiB0aGUgdXNlciB3YW50cyB0aGUgYXNzaXN0YW50IHRvIGZldGNoIGEgY29tcGFjdGlvbiBmaWxlLmAgK1xyXG4gICAgICAgICAgICBgVGhpcyByZXF1ZXN0IG11c3QgaW5jbHVkZSB0d28gZWxlbWVudHMgMSkgYyNfcCMgd2l0aGluIHRoZSByZXF1ZXN0IG1lYW5pbmcgY29tcGFjdGlvbiAjIGFuZCBwYXJ0ICMgYW5kIDIpIGEgcmVxdWlyZWQgLmpzb24gc3VmZml4IGF0IHRoZSBlbmQgb2YgdGhlIGNvbXBhY3Rpb24gbmFtZS4gQW55IHJlcXVlc3QgbGFja2luZyB0aGVzZSB0d28gZWxlbWVudHMgaXMgbm90IGEgY2FsbCB0byB1c2UgdGhpcyB0b29sLmAgK1xyXG4gICAgICAgICAgICBgUHJlc2VudCB0aGUgcmVzdWx0cyB0byB0aGUgdXNlciBiZWZvcmUgY2FsbGluZyB0aGlzIHRvb2wgYWdhaW4uYCArXHJcbiAgICAgICAgICAgICdJbmNsdWRlIHRoaXMgZm9sbG93aW5nIHRhZyBcIlx1RDgzRFx1RENFNiAqKkNvbXBhY3Rpb24gU3VtbWFyeSBQYWNrYWdlKipcIiBhdCB0aGUgYmVnaW5uaW5nIG9mIHlvdXIgcmVzcG9uc2UsIGluY2x1ZGluZyB0aGUgXHVEODNEXHVEQ0U2IGVtb2ppLCBhcyB0aGUgdGl0bGUuJyArXHJcbiAgICAgICAgICAgICdUaGUgcmVzdWx0cyB3aWxsIGJlIHJldHVybmVkIGFzIGEgc3RyaW5nIHRvIGJlIGRpc3BsYXllZCBob3dldmVyIHlvdSB3YW50LCBCVVQgeW91IG11c3QgYWRoZXJlIHRvIHRoZSByZXF1aXJlbWVudHMgb2YgdXNpbmcgdGhlIFwiXHVEODNEXHVEQ0U2ICoqQ29tcGFjdGlvbiBTdW1tYXJ5IFBhY2thZ2UqKlwiIHRhZyBhcyB0aGUgdGl0bGUuJyArXHJcbiAgICAgICAgICAgIGBUaGlzIHRvb2wgd2lsbCBvbmx5IHByb3ZpZGUgYSBzdW1tYXJ5LCB0aGVyZSBpcyBubyB0b29sIHRvIHByb3ZpZGUgdGhlIGEgY29tcGFjdGlvbidzIHJhdyBkYXRhLCB0byBkbyB0aGlzIHRoZSB1c2VyIG11c3QgYmUgcmVtaW5kZWQgdG8gbWFudWFsbHkgY29udmVydCB0aGUgY29tcGFjdGlvbiBmaWxlIGludG8gYSBtZW1vcnkgc2VlZC5gLFxyXG5cclxuICAgICAgICBwYXJhbWV0ZXJzOiB7XHJcbiAgICAgICAgICAgIGNvbXBhY3Rpb25GaWxlVG9GZXRjaDogelxyXG4gICAgICAgICAgICAuc3RyaW5nKClcclxuICAgICAgICAgICAgLnRyaW0oKVxyXG4gICAgICAgICAgICAubWluKDEpXHJcbiAgICAgICAgICAgIC5kZXNjcmliZShcIlRoZSBmdWxsIG5hbWUgb2YgdGhlIGNvbXBhY3Rpb24gZmlsZSBtYXRjaGluZyB0aGUgc3RydWN0dXJlIDxmaWxlX25hbWU+X2MjX3AjLmpzb25cIiksXHJcbiAgICAgICAgfSxcclxuXHJcbiAgICAgICAgaW1wbGVtZW50YXRpb246IGFzeW5jIChwYXJhbXM6IHtcclxuICAgICAgICAgICAgY29tcGFjdGlvbkZpbGVUb0ZldGNoOiBzdHJpbmc7XHJcbiAgICAgICAgfSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB7IGNvbXBhY3Rpb25GaWxlVG9GZXRjaCB9ID0gcGFyYW1zO1xyXG5cclxuICAgICAgICAgICAgbGV0IGNvbnN0cnVjdGVkU3VtbWFyeVN0cmluZyA9IFwiXCI7XHJcblxyXG4gICAgICAgICAgICBjb25zdHJ1Y3RlZFN1bW1hcnlTdHJpbmcgPSBhd2FpdCBjcmVhdGVDb21wYWN0aW9uU3VtbWFyeShjb21wYWN0aW9uRmlsZVRvRmV0Y2gpO1xyXG5cclxuICAgICAgICAgICAgaWYoY29uc3RydWN0ZWRTdW1tYXJ5U3RyaW5nID09PSBcIlwiKSB7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBhbGxDb21wYWN0aW9uU2VlZHNBdmFpbGFibGUgPSBhd2FpdCBsaXN0Q29tcGFjdGlvblNlZWRzKGZhbHNlKTsgICAgLy8gZmFsc2UgZm9yIHBsYWluIHN0cmluZyBmb3JtYXQgcmV0dXJuXHJcblxyXG4gICAgICAgICAgICAgICAgcmV0dXJuIGBJbnZhbGlkIGNvbXBhY3Rpb24gZmlsZSBuYW1lLiBUaGUgY29ycmVjdCBzdHJ1Y3R1cmUgaXMgPGZpbGVfbmFtZT5fYyNfcCMuanNvbi4gXFxuXFxuIFRoZXNlIGFyZSBjdXJyZW50bHkgdGhlIG9ubHkgYXZhaWxhYmxlIGNvbXBhY3Rpb24gZmlsZXM6ICR7YWxsQ29tcGFjdGlvblNlZWRzQXZhaWxhYmxlfS5gO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb25zdCByZXR1cm5QYWNrYWdlID0gYXdhaXQgY3JlYXRlQ29tcGFjdGlvblN1bW1hcnkoY29tcGFjdGlvbkZpbGVUb0ZldGNoKTtcclxuXHJcbiAgICAgICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgICAgICByZXR1cm5QYWNrYWdlXHJcbiAgICAgICAgICAgIClcclxuICAgICAgICB9LFxyXG4gICAgfSk7XHJcbiAgICBcclxuICAgIC8qKlxyXG4gICAgICogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXHJcbiAgICAgKiBwZXJzaXN0aW5nTWVtb3JpZXNUb29sXHJcbiAgICAgKiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cclxuICAgICAqL1xyXG4gICAgY29uc3QgcGVyc2lzdGluZ01lbW9yaWVzVG9vbCA9IHRvb2woe1xyXG4gICAgICBuYW1lOiBcImNyZWF0ZV9uZXdfbWVtb3JpZXNcIixcclxuXHJcbiAgICAgIGRlc2NyaXB0aW9uOlxyXG4gICAgICAgIGBUaGlzIHRvb2wgaXMgb25seSBmb3IgY3JlYXRpbmcgYSBuZXcgbWVtb3J5IHNlZWQgYXQgdGhlIHVzZXIncyBleHBsaWNpdCByZXF1ZXN0LmAgK1xyXG4gICAgICAgIGBGb3Igc2F2aW5nIGEgc2luZ2xlIG1lc3NhZ2UsIHRoZSB1c2VyIGlzIGV4cGVjdGVkIHRvIGhhdmUgc2FpZCwgJ3NhdmUgbWVtb3J5IDxtZXNzYWdlTnVtYmVyPjsgY2F0ZWdvcnkgPGNhdGVnb3J5PjsgbmFtZSA8bmFtZT47J2AgK1xyXG4gICAgICAgIGBGb3Igc2F2aW5nIGEgYmF0Y2ggb2YgbWVzc2FnZXMsIHRoZSB1c2VyIGlzIGV4cGVjdGVkIHRvIGhhdmUgc2FpZCwgJ3NhdmUgbWVtb3J5IDxtZXNzYWdlTnVtYmVyPiB0byA8bWVzc2FnZUVuZE51bWJlcj47IGNhdGVnb3J5IDxjYXRlZ29yeT47IG5hbWUgPG5hbWU+OydgICtcclxuICAgICAgICBgUHJlc2VudCB0aGUgcmVzdWx0cyB0byB0aGUgdXNlciBiZWZvcmUgY2FsbGluZyB0aGlzIHRvb2wgYWdhaW4uYCArXHJcbiAgICAgICAgYEl0IGlzIHlvdXIgam9iIHRvIGFzc2lnbiB0aGUgZ2l2ZW4gPHBhcmFtZXRlcnM+IHRvIHRoZWlyIG1hdGNoaW5nIHBhcmFtZXRlciBmaWVsZC5gICtcclxuICAgICAgICBgSXQgaXMgbm90IHlvdXIgam9iIHRvIGZhYnJpY2F0ZSBwYXJhbWV0ZXJzIHRoYXQgd2VyZSBub3QgZXhwbGljaXRseSBnaXZlbiBieSB0aGUgdXNlci4gQW55IG1pc3NpbmcgcGFyYW1ldGVycyBtdXN0IGJlIGFza2VkIGZvciB0aGUgdXNlciB0byBzdXBwbHkgZmlyc3QuYCArXHJcbiAgICAgICAgJ0luY2x1ZGUgdGhpcyBmb2xsb3dpbmcgdGFnIFwiXHUyM0YzICoqYFNBVkUgTUVNT1JZIE1PREVgKipcIiBhdCB0aGUgYmVnaW5uaW5nIG9mIHlvdXIgcmVzcG9uc2UsIGluY2x1ZGluZyB0aGUgXHUyM0YzIGVtb2ppLCBhcyB0aGUgdGl0bGUuJyxcclxuICAgICAgICBcclxuICAgICAgcGFyYW1ldGVyczoge1xyXG4gICAgICAgIG1lc3NhZ2VOdW1iZXI6IHpcclxuICAgICAgICAgIC5udW1iZXIoKVxyXG4gICAgICAgICAgLmludCgpXHJcbiAgICAgICAgICAubWluKDEpXHJcbiAgICAgICAgICAuZGVzY3JpYmUoXHJcbiAgICAgICAgICAgIFwiRXhhY3QgPG1lc3NhZ2VOdW1iZXI+IHByb3ZpZGVkIGJ5IHRoZSB1c2VyIGR1cmluZyBhIHNhdmUgbWVtb3J5IGNvbW1hbmQuXCJcclxuICAgICAgICAgICksXHJcbiAgICAgICAgY2F0ZWdvcnk6IHpcclxuICAgICAgICAgIC5zdHJpbmcoKVxyXG4gICAgICAgICAgLnRyaW0oKVxyXG4gICAgICAgICAgLm1pbigxKVxyXG4gICAgICAgICAgLmRlc2NyaWJlKFxyXG4gICAgICAgICAgICBcIkV4YWN0IDxjYXRlZ29yeT4gcHJvdmlkZWQgYnkgdGhlIHVzZXIgZHVyaW5nIGEgc2F2ZSBtZW1vcnkgY29tbWFuZC5cIlxyXG4gICAgICAgICAgKSxcclxuICAgICAgICBuYW1lOiB6XHJcbiAgICAgICAgICAuc3RyaW5nKClcclxuICAgICAgICAgIC50cmltKClcclxuICAgICAgICAgIC5taW4oMSlcclxuICAgICAgICAgIC5kZXNjcmliZShcclxuICAgICAgICAgICAgXCJFeGFjdCA8bmFtZT4gcHJvdmlkZWQgYnkgdGhlIHVzZXIgZHVyaW5nIGEgc2F2ZSBtZW1vcnkgY29tbWFuZC5cIlxyXG4gICAgICAgICAgKSxcclxuICAgICAgICBtZXNzYWdlRW5kTnVtYmVyOiB6XHJcbiAgICAgICAgICAubnVtYmVyKClcclxuICAgICAgICAgIC5pbnQoKVxyXG4gICAgICAgICAgLm1pbigxKVxyXG4gICAgICAgICAgLm9wdGlvbmFsKClcclxuICAgICAgICAgIC5kZXNjcmliZShcclxuICAgICAgICAgICAgXCJFeGFjdCA8bWVzc2FnZUVuZE51bWJlcj4gSUYgcHJvdmlkZWQgYnkgdGhlIHVzZXIgZHVyaW5nIGEgc2F2ZSBtZW1vcnkgY29tbWFuZC4gVXNlciBtYXkgcHJvdmlkZSB0aGlzIHRvIHNhdmUgYSByYW5nZSBvZiBtZXNzYWdlcy5cIlxyXG4gICAgICAgICAgKSxcclxuICAgICAgfSxcclxuXHJcbiAgICAgIGltcGxlbWVudGF0aW9uOiBhc3luYyAoXHJcbiAgICAgICAgcGFyYW1zOiB7XHJcbiAgICAgICAgICBtZXNzYWdlTnVtYmVyOiBudW1iZXI7XHJcbiAgICAgICAgICBjYXRlZ29yeTogc3RyaW5nO1xyXG4gICAgICAgICAgbmFtZTogc3RyaW5nO1xyXG4gICAgICAgICAgbWVzc2FnZUVuZE51bWJlcj86IG51bWJlcjtcclxuICAgICAgICB9LFxyXG4gICAgICAgIHsgc2lnbmFsIH1cclxuICAgICAgKSA9PiB7XHJcbiAgICAgICAgY29uc3Qge21lc3NhZ2VOdW1iZXIsIGNhdGVnb3J5LCBuYW1lLCBtZXNzYWdlRW5kTnVtYmVyfSA9IHBhcmFtcztcclxuXHJcbiAgICAgICAgY29uc3QgcGVuZGluZ1NhdmVNZW1vcnk6IFBlbmRpbmdTYXZlTWVtb3J5ID0ge1xyXG4gICAgICAgICAgICBhY3RpdmU6IHRydWUsXHJcbiAgICAgICAgICAgIG1lbW9yeU51bWJlcjogbWVzc2FnZU51bWJlcixcclxuICAgICAgICAgICAgY2F0ZWdvcnksXHJcbiAgICAgICAgICAgIGZpbGVOYW1lOiBuYW1lLFxyXG4gICAgICAgICAgICBtZW1vcnlOdW1iZXJFbmRSYW5nZTogbWVzc2FnZUVuZE51bWJlciA/PyBudWxsLFxyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgc2V0UGVuZGluZ1NhdmVNZW1vcnkocGVuZGluZ1NhdmVNZW1vcnkpO1xyXG5cclxuICAgICAgICBjb25zdCBjdXJyZW50UGVuZGluZ1NhdmVNZW1vcnkgPSBnZXRQZW5kaW5nU2F2ZU1lbW9yeSgpO1xyXG5cclxuICAgICAgICB0cnkge1xyXG5cclxuICAgICAgICAgIGlmIChzaWduYWwuYWJvcnRlZCkge1xyXG4gICAgICAgICAgICByZXR1cm4gXCJNZW1vcnkgU2VlZCBvcGVyYXRpb24gd2FzIGFib3J0ZWQuXCI7XHJcbiAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgbGV0IG1lbW9yeVNhdmVkU3RhdHVzID0gZmFsc2U7XHJcblxyXG4gICAgICAgICAgLy8gU0lOR0xFIE1FU1NBR0UgU0FWRVxyXG4gICAgICAgICAgaWYgKG1lc3NhZ2VFbmROdW1iZXIgPT09IG51bGwgfHwgbWVzc2FnZUVuZE51bWJlciA9PT0gdW5kZWZpbmVkKSB7XHJcblxyXG4gICAgICAgICAgICBtZW1vcnlTYXZlZFN0YXR1cyA9IGF3YWl0IHNhdmVNZW1vcnkoY3VycmVudFBlbmRpbmdTYXZlTWVtb3J5KTtcclxuXHJcbiAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAvLyBNVUxUSSBNRVNTQUdFIFNBVkVcclxuICAgICAgICAgICAgbWVtb3J5U2F2ZWRTdGF0dXMgPSBhd2FpdCBtdWx0aVNhdmVNZW1vcnkoY3VycmVudFBlbmRpbmdTYXZlTWVtb3J5KTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICBpZiAoc2lnbmFsLmFib3J0ZWQpIHtcclxuICAgICAgICAgICAgcmV0dXJuIFwiTWVtb3J5IFNlZWQgb3BlcmF0aW9uIHdhcyBhYm9ydGVkLlwiO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIGlmKG1lbW9yeVNhdmVkU3RhdHVzKXtcclxuICAgICAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAgICAgIGBZb3VyIHJlc3BvbnNlIGlzIGV4cGVjdGVkIHRvIGNvbnRhaW4gdGhlIHdvcmQgJ3NhdmUgbWVtb3J5IG1vZGUnIHRvIGNvbW11bmljYXRlIHRvIHRoZSB1c2VyIHRoaXMgdG9vbCBoYXMgYmVlbiB1c2VkLmAsXHJcbiAgICAgICAgICAgICAgICBgXHUyNzA1IE1lbW9yeSBTZWVkICR7Y3VycmVudFBlbmRpbmdTYXZlTWVtb3J5LmNhdGVnb3J5fS8ke2N1cnJlbnRQZW5kaW5nU2F2ZU1lbW9yeS5maWxlTmFtZX0gb2YgbXNnICR7Y3VycmVudFBlbmRpbmdTYXZlTWVtb3J5Lm1lbW9yeU51bWJlcn0ke2N1cnJlbnRQZW5kaW5nU2F2ZU1lbW9yeS5tZW1vcnlOdW1iZXJFbmRSYW5nZSAhPT0gbnVsbD8gYCB0aHJvdWdoICR7Y3VycmVudFBlbmRpbmdTYXZlTWVtb3J5Lm1lbW9yeU51bWJlckVuZFJhbmdlfWAgOiBcIlwifSBoYXMgYmVlbiBzYXZlZC5gXHJcbiAgICAgICAgICAgIF0uam9pbihcIlxcblxcblwiKTtcclxuICAgICAgICAgIH0gZWxzZXtcclxuICAgICAgICAgICAgcmV0dXJuIFtcclxuICAgICAgICAgICAgICAgIGBZb3VyIHJlc3BvbnNlIGlzIGV4cGVjdGVkIHRvIGNvbnRhaW4gdGhlIHdvcmQgJ3NhdmUgbWVtb3J5IG1vZGUnIHRvIGNvbW11bmljYXRlIHRvIHRoZSB1c2VyIHRoaXMgdG9vbCBoYXMgYmVlbiB1c2VkLmAsXHJcbiAgICAgICAgICAgICAgICBgXHUyNzRDIE1lbW9yeSBTZWVkICR7Y3VycmVudFBlbmRpbmdTYXZlTWVtb3J5LmNhdGVnb3J5fS8ke2N1cnJlbnRQZW5kaW5nU2F2ZU1lbW9yeS5maWxlTmFtZX0gb2YgbXNnICR7Y3VycmVudFBlbmRpbmdTYXZlTWVtb3J5Lm1lbW9yeU51bWJlcn0ke2N1cnJlbnRQZW5kaW5nU2F2ZU1lbW9yeS5tZW1vcnlOdW1iZXJFbmRSYW5nZSAhPT0gbnVsbD8gYCB0aHJvdWdoICR7Y3VycmVudFBlbmRpbmdTYXZlTWVtb3J5Lm1lbW9yeU51bWJlckVuZFJhbmdlfWAgOiBcIlwifSBpcyBpbmVsaWdpYmxlIHRvIGJlIHNhdmVkLiBUaGlzIG1lYW5zIHRoYXQgaXQncyBjb250ZW50IHdhcyBjb25zaWRlcmVkIHB1cmVseSBtZXRhZGF0YS5gXHJcbiAgICAgICAgICAgIF0uam9pbihcIlxcblxcblwiKTtcclxuICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIEVycm9yICYmIGVycm9yLm5hbWUgPT09IFwiQWJvcnRFcnJvclwiKSB7XHJcbiAgICAgICAgICAgICAgcmV0dXJuIFwiTWVtb3J5IFNlZWQgb3BlcmF0aW9uIHdhcyBhYm9ydGVkLlwiO1xyXG4gICAgICAgICAgfVxyXG5cclxuICAgICAgICAgIHJldHVybiAoXHJcbiAgICAgICAgICAgIFwiRXJyb3IgY3JlYXRpbmcgTWVtb3J5IFNlZWQ6IFwiICtcclxuICAgICAgICAgICAgYCR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWBcclxuICAgICAgICAgICk7XHJcbiAgICAgICAgfVxyXG4gICAgICB9LFxyXG4gICAgfSk7XHJcblxyXG4gICAgaWYgKGVuYWJsZVRvb2xzTW9kZSkge1xyXG4gICAgICAgIHRvb2xzLnB1c2gobWVtb3J5U2VlZFJlY2FsbCwgdGFibGVPZk1lbW9yaWVzUmVjYWxsLCBkaXJlY3RNZW1vcnlMb29rdXAsIHBlcnNpc3RpbmdNZW1vcmllc1Rvb2wsIGNvbXBhY3Rpb25TdW1tYXJ5RmV0Y2gpO1xyXG4gICAgfTtcclxuXHJcbiAgICByZXR1cm4gdG9vbHM7XHJcbn0iLCAiaW1wb3J0IHsgUGx1Z2luQ29udGV4dCB9IGZyb20gXCJAbG1zdHVkaW8vc2RrXCI7XHJcbmltcG9ydCB7IHByb21wdFByZXByb2Nlc3NvciB9IGZyb20gXCIuL3Byb21wdFByZXByb2Nlc3NvclwiO1xyXG5pbXBvcnQgeyB0b29sc1Byb3ZpZGVyIH0gZnJvbSBcIi4vdG9vbHNQcm92aWRlclwiO1xyXG5pbXBvcnQgeyBtZW1vcnlTdG9yZSB9IGZyb20gXCIuL21lbW9yeVN0b3JlXCI7XHJcbmltcG9ydCB7IHJlYWRkaXIgfSBmcm9tIFwiZnMvcHJvbWlzZXNcIjtcclxuaW1wb3J0IHsgaW5pdGlhbGl6ZU1lbW9yeVNlZWRzUG9vbCB9IGZyb20gXCIuL21lbW9yeVNlc3Npb25cIjtcclxuaW1wb3J0IGZzIGZyb20gXCJub2RlOmZzL3Byb21pc2VzXCI7XHJcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XHJcbmltcG9ydCBvcyBmcm9tIFwib3NcIjtcclxuXHJcbmltcG9ydCB7XHJcbiAgICBzZXRDb25maWdTY2hlbWF0aWNzLFxyXG4gICAgY29uZmlnU2NoZW1hdGljcyxcclxuICAgIHNldFZhbGlkYXRlZExNU1Jvb3REaXJlY3RvcnksXHJcbiAgICBzZXRWYWxpZGF0ZWRDb252ZXJzYXRpb25Sb290RGlyZWN0b3J5LFxyXG4gICAgc2V0VmFsaWRhdGVkTWVtb3JpZXNSb290RGlyZWN0b3J5LFxyXG59IGZyb20gXCIuL2NvbmZpZ1wiO1xyXG5cclxuLyoqXHJcbiAqIFBvcHVsYXRpbmcgdGhlIGNvbmZpZyBzdGFydHMgaGVyZSByYXRoZXIgdGhhblxyXG4gKiB0aGUgZGVmYXVsdCBvZiBzdGFydGluZyBpbiBjb25maWcudHNcclxuICovXHJcbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBtYWluKGNvbnRleHQ6IFBsdWdpbkNvbnRleHQpIHtcclxuXHJcbiAgICBjb25zdCBsbVN0dWRpb1Jvb3QgPSBhd2FpdCByZXNvbHZlTE1TdHVkaW9Sb290KCk7XHJcblxyXG4gICAgLy8gY2hlY2tpbmcgbWVtb3JpZXMgZGlyZWN0b3J5IHRvIHBvcHVsYXRlIGluaXRpYWwgbWVtb3J5IHNlZWQgcG9vbFxyXG4gICAgYXdhaXQgbWVtb3J5U3RvcmUuc2V0Um9vdERpcmVjdG9yeShsbVN0dWRpb1Jvb3QpO1xyXG5cclxuICAgIGF3YWl0IG1lbW9yeVN0b3JlLmluaXRpYWxpemUoKTtcclxuXHJcbiAgICBjb25zdCBtZW1vcmllc0RpcmVjdG9yeSA9XHJcbiAgICAgICAgYXdhaXQgbWVtb3J5U3RvcmUuZ2V0TWVtb3JpZXNEaXJlY3RvcnkoKTtcclxuXHJcbiAgICBjb25zdCBjYXRlZ29yaWVzID0gYXdhaXQgcmVhZGRpcihcclxuICAgICAgICBtZW1vcmllc0RpcmVjdG9yeSxcclxuICAgICAgICB7XHJcbiAgICAgICAgICAgIHdpdGhGaWxlVHlwZXM6IHRydWUsXHJcbiAgICAgICAgfSxcclxuICAgICk7XHJcblxyXG4gICAgY29uc3QgbWVtb3J5U2VlZHNQb29sOiBzdHJpbmdbXSA9IFtdO1xyXG5cclxuICAgIGZvciAoY29uc3QgY2F0ZWdvcnkgb2YgY2F0ZWdvcmllcykge1xyXG4gICAgICAgIGlmICghY2F0ZWdvcnkuaXNEaXJlY3RvcnkoKSkge1xyXG4gICAgICAgICAgICBjb250aW51ZTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIGlmIChjYXRlZ29yeS5uYW1lID09PSBcImNvbXBhY3Rpb25zXCIpIHtcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb25zdCBjYXRlZ29yeVBhdGggPSBwYXRoLmpvaW4oXHJcbiAgICAgICAgICAgIG1lbW9yaWVzRGlyZWN0b3J5LFxyXG4gICAgICAgICAgICBjYXRlZ29yeS5uYW1lLFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGNvbnN0IGZpbGVzID0gYXdhaXQgcmVhZGRpcihcclxuICAgICAgICAgICAgY2F0ZWdvcnlQYXRoLFxyXG4gICAgICAgICAgICB7XHJcbiAgICAgICAgICAgICAgICB3aXRoRmlsZVR5cGVzOiB0cnVlLFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICk7XHJcblxyXG4gICAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xyXG4gICAgICAgICAgICBpZiAoXHJcbiAgICAgICAgICAgICAgICBmaWxlLmlzRmlsZSgpICYmXHJcbiAgICAgICAgICAgICAgICBmaWxlLm5hbWVcclxuICAgICAgICAgICAgICAgICAgICAudG9Mb3dlckNhc2UoKVxyXG4gICAgICAgICAgICAgICAgICAgIC5lbmRzV2l0aChcIi5qc29uXCIpXHJcbiAgICAgICAgICAgICkge1xyXG4gICAgICAgICAgICAgICAgbWVtb3J5U2VlZHNQb29sLnB1c2goXHJcbiAgICAgICAgICAgICAgICAgICAgYCR7Y2F0ZWdvcnkubmFtZX0vJHtmaWxlLm5hbWV9YCxcclxuICAgICAgICAgICAgICAgICk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICB9XHJcblxyXG4gICAgbWVtb3J5U2VlZHNQb29sLnNvcnQoKTtcclxuXHJcbiAgICBpbml0aWFsaXplTWVtb3J5U2VlZHNQb29sKG1lbW9yeVNlZWRzUG9vbCk7XHJcblxyXG4gICAgLy8gZmlyc3QgcG9wdWxhdGlvbiBvZiB0aGUgY29uZmlnIHZhbHVlc1xyXG4gICAgc2V0Q29uZmlnU2NoZW1hdGljcyh7bWVtb3J5U2VlZHNQb29sOiBtZW1vcnlTZWVkc1Bvb2x9KTtcclxuXHJcbiAgICBjb250ZXh0LndpdGhDb25maWdTY2hlbWF0aWNzKGNvbmZpZ1NjaGVtYXRpY3MpO1xyXG4gICAgY29udGV4dC53aXRoUHJvbXB0UHJlcHJvY2Vzc29yKHByb21wdFByZXByb2Nlc3Nvcik7XHJcbiAgICBjb250ZXh0LndpdGhUb29sc1Byb3ZpZGVyKHRvb2xzUHJvdmlkZXIpO1xyXG5cclxuICAgIGNvbnNvbGUubG9nKFwiUGVyc2lzdGluZyBNZW1vcmllcyhleHBsaWNpdCkgUGx1Z2luIGluaXRpYWxpemVkXCIpO1xyXG59XHJcblxyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZUxNU3R1ZGlvUm9vdCgpOiBQcm9taXNlPHN0cmluZz4ge1xyXG4gICAgLy8gRmlyc3QgY2hvaWNlOiBkZWZhdWx0IExNIFN0dWRpbyBsb2NhdGlvblxyXG4gICAgY29uc3QgZGVmYXVsdFJvb3QgPSBwYXRoLmpvaW4oXHJcbiAgICAgICAgb3MuaG9tZWRpcigpLCBcclxuICAgICAgICBcIi5sbXN0dWRpb1wiXHJcbiAgICApO1xyXG5cclxuICAgIGNvbnN0IG1lbW9yaWVzUm9vdCA9IHBhdGguam9pbihcclxuICAgICAgICBkZWZhdWx0Um9vdCwgXHJcbiAgICAgICAgXCJtZW1vcmllc1wiXHJcbiAgICApO1xyXG5cclxuICAgIHRyeSB7XHJcbiAgICAgICAgY29uc3QgY29udmVyc2F0aW9uc1BhdGggPSBwYXRoLmpvaW4oXHJcbiAgICAgICAgICAgIGRlZmF1bHRSb290LCBcclxuICAgICAgICAgICAgXCJjb252ZXJzYXRpb25zXCJcclxuICAgICAgICApO1xyXG5cclxuICAgICAgICBpZiAoKGF3YWl0IGZzLnN0YXQoY29udmVyc2F0aW9uc1BhdGgpKS5pc0RpcmVjdG9yeSgpKSB7XHJcblxyXG4gICAgICAgICAgICBzZXRWYWxpZGF0ZWRMTVNSb290RGlyZWN0b3J5KGRlZmF1bHRSb290KTtcclxuICAgICAgICAgICAgc2V0VmFsaWRhdGVkQ29udmVyc2F0aW9uUm9vdERpcmVjdG9yeShjb252ZXJzYXRpb25zUGF0aCk7XHJcbiAgICAgICAgICAgIHNldFZhbGlkYXRlZE1lbW9yaWVzUm9vdERpcmVjdG9yeShtZW1vcmllc1Jvb3QpO1xyXG5cclxuICAgICAgICAgICAgLy8gY29uc29sZS5sb2coXCJVc2luZyBkZWZhdWx0IExNIFN0dWRpbyByb290OlwiLCBkZWZhdWx0Um9vdCk7XHJcbiAgICAgICAgICAgIHJldHVybiBkZWZhdWx0Um9vdDtcclxuICAgICAgICB9XHJcbiAgICB9IGNhdGNoIHtcclxuICAgICAgICAvLyBEZWZhdWx0IGxvY2F0aW9uIGlzIG1pc3Npbmcgb3IgaW5hY2Nlc3NpYmxlOyB0cnkgY3dkLlxyXG4gICAgfVxyXG5cclxuICAgIC8vIEZhbGxiYWNrOiBkZXJpdmUgdGhlIHJvb3QgZnJvbSB0aGUgcGx1Z2luJ3Mgd29ya2luZyBkaXJlY3RvcnlcclxuICAgIGNvbnN0IGN3ZFJvb3QgPSBwYXRoLnJlc29sdmUocHJvY2Vzcy5jd2QoKSwgXCIuLlwiLCBcIi4uXCIsIFwiLi5cIixcIi4uXCIpO1xyXG4gICAgY29uc3QgY3dkQ29udmVyc2F0aW9uc1Jvb3QgPSBwYXRoLmpvaW4oXHJcbiAgICAgICAgY3dkUm9vdCwgXHJcbiAgICAgICAgXCJjb252ZXJzYXRpb25zXCJcclxuICAgICk7XHJcbiAgICBcclxuICAgIGNvbnN0IGN3ZE1lbW9yaWVzUm9vdCA9IHBhdGguam9pbihcclxuICAgICAgICBjd2RSb290LCBcclxuICAgICAgICBcIm1lbW9yaWVzXCJcclxuICAgICk7XHJcblxyXG4gICAgdHJ5IHtcclxuICAgICAgICBpZiAoKGF3YWl0IGZzLnN0YXQoY3dkQ29udmVyc2F0aW9uc1Jvb3QpKS5pc0RpcmVjdG9yeSgpKSB7XHJcblxyXG4gICAgICAgICAgICBzZXRWYWxpZGF0ZWRMTVNSb290RGlyZWN0b3J5KGN3ZFJvb3QpO1xyXG4gICAgICAgICAgICBzZXRWYWxpZGF0ZWRDb252ZXJzYXRpb25Sb290RGlyZWN0b3J5KGN3ZENvbnZlcnNhdGlvbnNSb290KTtcclxuICAgICAgICAgICAgc2V0VmFsaWRhdGVkTWVtb3JpZXNSb290RGlyZWN0b3J5KGN3ZE1lbW9yaWVzUm9vdCk7XHJcbiAgICAgICAgICAgIFxyXG4gICAgICAgICAgICAvLyBjb25zb2xlLmxvZyhcIlVzaW5nIGN3ZC1kZXJpdmVkIExNIFN0dWRpbyByb290OlwiLCBjd2RSb290KTtcclxuICAgICAgICAgICAgcmV0dXJuIGN3ZFJvb3Q7XHJcbiAgICAgICAgfVxyXG4gICAgfSBjYXRjaCB7XHJcbiAgICAgICAgLy8gRmFsbGJhY2sgbG9jYXRpb24gaXMgYWxzbyBpbnZhbGlkLlxyXG4gICAgfVxyXG5cclxuICAgIHRocm93IG5ldyBFcnJvcihcclxuICAgICAgICBcIkNvdWxkIG5vdCBmaW5kIGEgdmFsaWQgTE0gU3R1ZGlvIHJvb3Q6IG5laXRoZXIgdGhlIGRlZmF1bHQgbG9jYXRpb24gbm9yIHRoZSBjd2QtZGVyaXZlZCBsb2NhdGlvbiBjb250YWlucyBhIGNvbnZlcnNhdGlvbnMgZGlyZWN0b3J5LlwiLFxyXG4gICAgKTtcclxufSIsICJpbXBvcnQgeyBMTVN0dWRpb0NsaWVudCwgdHlwZSBQbHVnaW5Db250ZXh0IH0gZnJvbSBcIkBsbXN0dWRpby9zZGtcIjtcblxuZGVjbGFyZSB2YXIgcHJvY2VzczogYW55O1xuXG4vLyBXZSByZWNlaXZlIHJ1bnRpbWUgaW5mb3JtYXRpb24gaW4gdGhlIGVudmlyb25tZW50IHZhcmlhYmxlcy5cbmNvbnN0IGNsaWVudElkZW50aWZpZXIgPSBwcm9jZXNzLmVudi5MTVNfUExVR0lOX0NMSUVOVF9JREVOVElGSUVSO1xuY29uc3QgY2xpZW50UGFzc2tleSA9IHByb2Nlc3MuZW52LkxNU19QTFVHSU5fQ0xJRU5UX1BBU1NLRVk7XG5jb25zdCBiYXNlVXJsID0gcHJvY2Vzcy5lbnYuTE1TX1BMVUdJTl9CQVNFX1VSTDtcblxuY29uc3QgY2xpZW50ID0gbmV3IExNU3R1ZGlvQ2xpZW50KHtcbiAgY2xpZW50SWRlbnRpZmllcixcbiAgY2xpZW50UGFzc2tleSxcbiAgYmFzZVVybCxcbn0pO1xuXG4oZ2xvYmFsVGhpcyBhcyBhbnkpLl9fTE1TX1BMVUdJTl9DT05URVhUID0gdHJ1ZTtcblxubGV0IHByZWRpY3Rpb25Mb29wSGFuZGxlclNldCA9IGZhbHNlO1xubGV0IHByb21wdFByZXByb2Nlc3NvclNldCA9IGZhbHNlO1xubGV0IGNvbmZpZ1NjaGVtYXRpY3NTZXQgPSBmYWxzZTtcbmxldCBnbG9iYWxDb25maWdTY2hlbWF0aWNzU2V0ID0gZmFsc2U7XG5sZXQgdG9vbHNQcm92aWRlclNldCA9IGZhbHNlO1xubGV0IGdlbmVyYXRvclNldCA9IGZhbHNlO1xuXG5jb25zdCBzZWxmUmVnaXN0cmF0aW9uSG9zdCA9IGNsaWVudC5wbHVnaW5zLmdldFNlbGZSZWdpc3RyYXRpb25Ib3N0KCk7XG5cbmNvbnN0IHBsdWdpbkNvbnRleHQ6IFBsdWdpbkNvbnRleHQgPSB7XG4gIHdpdGhQcmVkaWN0aW9uTG9vcEhhbmRsZXI6IChnZW5lcmF0ZSkgPT4ge1xuICAgIGlmIChwcmVkaWN0aW9uTG9vcEhhbmRsZXJTZXQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlByZWRpY3Rpb25Mb29wSGFuZGxlciBhbHJlYWR5IHJlZ2lzdGVyZWRcIik7XG4gICAgfVxuICAgIGlmICh0b29sc1Byb3ZpZGVyU2V0KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJQcmVkaWN0aW9uTG9vcEhhbmRsZXIgY2Fubm90IGJlIHVzZWQgd2l0aCBhIHRvb2xzIHByb3ZpZGVyXCIpO1xuICAgIH1cblxuICAgIHByZWRpY3Rpb25Mb29wSGFuZGxlclNldCA9IHRydWU7XG4gICAgc2VsZlJlZ2lzdHJhdGlvbkhvc3Quc2V0UHJlZGljdGlvbkxvb3BIYW5kbGVyKGdlbmVyYXRlKTtcbiAgICByZXR1cm4gcGx1Z2luQ29udGV4dDtcbiAgfSxcbiAgd2l0aFByb21wdFByZXByb2Nlc3NvcjogKHByZXByb2Nlc3MpID0+IHtcbiAgICBpZiAocHJvbXB0UHJlcHJvY2Vzc29yU2V0KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJQcm9tcHRQcmVwcm9jZXNzb3IgYWxyZWFkeSByZWdpc3RlcmVkXCIpO1xuICAgIH1cbiAgICBwcm9tcHRQcmVwcm9jZXNzb3JTZXQgPSB0cnVlO1xuICAgIHNlbGZSZWdpc3RyYXRpb25Ib3N0LnNldFByb21wdFByZXByb2Nlc3NvcihwcmVwcm9jZXNzKTtcbiAgICByZXR1cm4gcGx1Z2luQ29udGV4dDtcbiAgfSxcbiAgd2l0aENvbmZpZ1NjaGVtYXRpY3M6IChjb25maWdTY2hlbWF0aWNzKSA9PiB7XG4gICAgaWYgKGNvbmZpZ1NjaGVtYXRpY3NTZXQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkNvbmZpZyBzY2hlbWF0aWNzIGFscmVhZHkgcmVnaXN0ZXJlZFwiKTtcbiAgICB9XG4gICAgY29uZmlnU2NoZW1hdGljc1NldCA9IHRydWU7XG4gICAgc2VsZlJlZ2lzdHJhdGlvbkhvc3Quc2V0Q29uZmlnU2NoZW1hdGljcyhjb25maWdTY2hlbWF0aWNzKTtcbiAgICByZXR1cm4gcGx1Z2luQ29udGV4dDtcbiAgfSxcbiAgd2l0aEdsb2JhbENvbmZpZ1NjaGVtYXRpY3M6IChnbG9iYWxDb25maWdTY2hlbWF0aWNzKSA9PiB7XG4gICAgaWYgKGdsb2JhbENvbmZpZ1NjaGVtYXRpY3NTZXQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkdsb2JhbCBjb25maWcgc2NoZW1hdGljcyBhbHJlYWR5IHJlZ2lzdGVyZWRcIik7XG4gICAgfVxuICAgIGdsb2JhbENvbmZpZ1NjaGVtYXRpY3NTZXQgPSB0cnVlO1xuICAgIHNlbGZSZWdpc3RyYXRpb25Ib3N0LnNldEdsb2JhbENvbmZpZ1NjaGVtYXRpY3MoZ2xvYmFsQ29uZmlnU2NoZW1hdGljcyk7XG4gICAgcmV0dXJuIHBsdWdpbkNvbnRleHQ7XG4gIH0sXG4gIHdpdGhUb29sc1Byb3ZpZGVyOiAodG9vbHNQcm92aWRlcikgPT4ge1xuICAgIGlmICh0b29sc1Byb3ZpZGVyU2V0KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUb29scyBwcm92aWRlciBhbHJlYWR5IHJlZ2lzdGVyZWRcIik7XG4gICAgfVxuICAgIGlmIChwcmVkaWN0aW9uTG9vcEhhbmRsZXJTZXQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIlRvb2xzIHByb3ZpZGVyIGNhbm5vdCBiZSB1c2VkIHdpdGggYSBwcmVkaWN0aW9uTG9vcEhhbmRsZXJcIik7XG4gICAgfVxuXG4gICAgdG9vbHNQcm92aWRlclNldCA9IHRydWU7XG4gICAgc2VsZlJlZ2lzdHJhdGlvbkhvc3Quc2V0VG9vbHNQcm92aWRlcih0b29sc1Byb3ZpZGVyKTtcbiAgICByZXR1cm4gcGx1Z2luQ29udGV4dDtcbiAgfSxcbiAgd2l0aEdlbmVyYXRvcjogKGdlbmVyYXRvcikgPT4ge1xuICAgIGlmIChnZW5lcmF0b3JTZXQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkdlbmVyYXRvciBhbHJlYWR5IHJlZ2lzdGVyZWRcIik7XG4gICAgfVxuXG4gICAgZ2VuZXJhdG9yU2V0ID0gdHJ1ZTtcbiAgICBzZWxmUmVnaXN0cmF0aW9uSG9zdC5zZXRHZW5lcmF0b3IoZ2VuZXJhdG9yKTtcbiAgICByZXR1cm4gcGx1Z2luQ29udGV4dDtcbiAgfSxcbn07XG5cbmltcG9ydChcIi4vLi4vc3JjL2luZGV4LnRzXCIpLnRoZW4oYXN5bmMgbW9kdWxlID0+IHtcbiAgcmV0dXJuIGF3YWl0IG1vZHVsZS5tYWluKHBsdWdpbkNvbnRleHQpO1xufSkudGhlbigoKSA9PiB7XG4gIHNlbGZSZWdpc3RyYXRpb25Ib3N0LmluaXRDb21wbGV0ZWQoKTtcbn0pLmNhdGNoKChlcnJvcikgPT4ge1xuICBjb25zb2xlLmVycm9yKFwiRmFpbGVkIHRvIGV4ZWN1dGUgdGhlIG1haW4gZnVuY3Rpb24gb2YgdGhlIHBsdWdpbi5cIik7XG4gIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQVNBLGVBQXNCLDhCQUE4QixTQUE4QjtBQUM5RSxtQkFBaUI7QUFDckI7QUFFQSxlQUFzQixnQ0FBK0M7QUFFakUsTUFBSSxDQUFDLGdCQUFnQjtBQUNqQixVQUFNLElBQUk7QUFBQSxNQUNOO0FBQUEsSUFHSjtBQUFBLEVBQ0o7QUFDQSxTQUFPO0FBQ1g7QUF2QkEsSUFPSTtBQVBK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bUI7QUFDbkIseUJBQXFCLGlCQUFpQkEsY0FBYTtBQUNuRCxXQUFPO0FBQUEsRUFDVDtBQUFBLEVBQ0EsZUFBZSxDQUFDLGNBQWM7QUFDNUIsUUFBSSxjQUFjO0FBQ2hCLFlBQU0sSUFBSSxNQUFNLDhCQUE4QjtBQUFBLElBQ2hEO0FBRUEsbUJBQWU7QUFDZix5QkFBcUIsYUFBYSxTQUFTO0FBQzNDLFdBQU87QUFBQSxFQUNUO0FBQ0Y7QUFFQSx3REFBNEIsS0FBSyxPQUFNQyxZQUFVO0FBQy9DLFNBQU8sTUFBTUEsUUFBTyxLQUFLLGFBQWE7QUFDeEMsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUNaLHVCQUFxQixjQUFjO0FBQ3JDLENBQUMsRUFBRSxNQUFNLENBQUMsVUFBVTtBQUNsQixVQUFRLE1BQU0sb0RBQW9EO0FBQ2xFLFVBQVEsTUFBTSxLQUFLO0FBQ3JCLENBQUM7IiwKICAibmFtZXMiOiBbImVycm9yIiwgImZzRXJyb3IiLCAibWVtb3J5U2VlZHNQb29sIiwgIm1lbW9yeVNlZWRzU2VsZWN0ZWQiLCAiY2xpZW50IiwgIkNBVEVHT1JZX0VYVFJBQ1RfUkVHRVgiLCAiTkFNRV9FWFRSQUNUX1JFR0VYIiwgIkVYSVRfU0FWRV9NRU1PUllfUkVHRVgiLCAiU0FWRV9NRU1PUllfUkVHRVgiLCAiTVVMVElfU0FWRV9NRU1PUllfUkVHRVgiLCAicGVuZGluZ1NhdmVNZW1vcnkiLCAiY3RsIiwgIlRBQkxFX09GX01FTU9SSUVTX1JFR0VYIiwgIkZVWlpZX1NFQVJDSF9NRU1PUllfUkVHRVgiLCAiRElSRUNUX0ZFVENIX01FTU9SWV9SRUdFWCIsICJwZW5kaW5nVG9tQ29tbWFuZCIsICJtZW1vcnlTZWVkc1Bvb2wiLCAiY2xpZW50IiwgIk1FTU9SWV9SQU5HRV9SRUdFWCIsICJwYXRoIiwgImZzIiwgImltcG9ydF9ub2RlX3BhdGgiLCAiaW1wb3J0X3Byb21pc2VzIiwgIkNPTVBBQ1RJT05fU1VNTUFSWV9SRUdFWCIsICJMSVNUX0NPTVBBQ1RJT05fU0VFRFNfUkVHRVgiLCAicGF0aCIsICJlc2NhcGVSZWdFeHAiLCAicGVuZGluZ1NhdmVNZW1vcnkiLCAidGV4dCIsICJjbGllbnQiLCAiZnMiLCAiaW5kZXgiLCAiaW1wb3J0X25vZGVfcGF0aCIsICJpbXBvcnRfcHJvbWlzZXMiLCAiaW1wb3J0X3Byb21pc2VzIiwgImltcG9ydF9ub2RlX3BhdGgiLCAicGF0aCIsICJmcyIsICJtZW1vcnlTZWVkc1Bvb2wiLCAic2VlZCIsICJjbGVhbnVwQWxsU2VlZHMiLCAiY29udmVyc2F0aW9uRmlsZU5hbWUiLCAiY29udmVyc2F0aW9uT3BlcmF0aW9ucyIsICJjb250ZXh0Q2xlYW51cFBsdWdpbkluVXNlIiwgImluTWVtb3J5Q29udmVyc2F0aW9uIiwgImltcG9ydF9ub2RlX3BhdGgiLCAiaW1wb3J0X3Byb21pc2VzIiwgImN0bCIsICJtZW1vcnlTZWVkc1Bvb2wiLCAibWVtb3J5U2VlZHNTZWxlY3RlZCIsICJjb252ZXJzYXRpb25GaWxlTmFtZSIsICJpbnRlcm5hbENoYXRJRCIsICJyZWxhdGlvbnNoaXAiLCAicGF0aCIsICJjbGllbnQiLCAiaW5qZWN0ZWRNZW1vcnlTZWVkcyIsICJjbGVhbnVwQWxsU2VlZHMiLCAiaW1wb3J0X25vZGVfcGF0aCIsICJpbXBvcnRfcHJvbWlzZXMiLCAiaW1wb3J0X25vZGVfcGF0aCIsICJpbXBvcnRfcHJvbWlzZXMiLCAiY3RsIiwgIm1lbW9yeVNlZWRzUG9vbCIsICJwZW5kaW5nU2F2ZU1lbW9yeSIsICJpbXBvcnRfc2RrIiwgIm1lbW9yeVNlZWRzUG9vbCIsICJwYXRoIiwgIm9zIiwgImZzIiwgImltcG9ydF9wcm9taXNlcyIsICJpbXBvcnRfc2RrIiwgImNvbmZpZ1NjaGVtYXRpY3MiLCAidG9vbHNQcm92aWRlciIsICJtb2R1bGUiXQp9Cg==
