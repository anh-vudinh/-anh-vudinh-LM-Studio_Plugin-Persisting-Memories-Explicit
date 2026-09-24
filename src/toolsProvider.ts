import { Tool, ToolsProviderController } from "@lmstudio/sdk";
import { getMemorySeedsPool } from "./memorySession";
import { deleteMemorySeedFile } from "./deleteMemorySeedFiles"
import { configSchematics } from "./config";

/**
* ToolsProvider is serves only one purpose to listen for when user puts a memory to
* delete into the control panel
*/
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

  if (normalizedMemoryFileToDelete !== "" && 
      getMemorySeedsPool().includes(normalizedMemoryFileToDelete)
  ) {

    await deleteMemorySeedFile(normalizedMemoryFileToDelete);
    console.log("deleted ", normalizedMemoryFileToDelete)
  }

  return [];
}