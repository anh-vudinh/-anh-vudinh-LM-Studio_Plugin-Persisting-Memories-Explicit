import { Tool, ToolsProviderController } from "@lmstudio/sdk";
import { getMemorySeedsPool } from "./memorySession";
import { deleteMemorySeedFile } from "./deleteMemorySeedFiles"
import { configSchematics } from "./config";

export async function toolsProvider(
  ctl: ToolsProviderController
): Promise<Tool[]> {
  const config = ctl.getPluginConfig(configSchematics);
  const memoryFileToDelete = config.get("deleteMemorySeedsFile") as string;

  /**
  * Deletion logic is handled here because tools can get the real-time state
  * of the deleteMemorySeedsFile config field.
  * Prompt preprocessor would have only caught it after a message is sent.
  * Wasn't any other option.
  */
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

  return [];
}