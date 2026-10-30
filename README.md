# Persisting Memories Explicit Plugin for LM Studio (converted to Hybrid)

- **This Plugin** - [GitHub - Explicit](https://github.com/anh-vudinh/-anh-vudinh-LM-Studio_Plugin-Persisting-Memories-Explicit) | [LMStudio](https://lmstudio.ai/anhuvdinh/persisting-memories-explicit)

- **Optional Companion Plugin** - [GitHub - Context Cleanup](https://github.com/anh-vudinh/LM-Studio_Context-Cleanup) | [LMStudio](https://lmstudio.ai/anhuvdinh/context-cleanup)

>**If you would like to look at the pictures, you can see them in the GitHub readme.**

The Persisting Memories Explicit plugin (Hybrid) is an LM Studio plugin that lets users preserve selected assistant responses as reusable memory seeds and inject those memories into future conversations. It stores memories as local JSON files, organizes them by category, and uses prompt preprocessing to add selected memories to the active prompt when needed.

- Tested working on Windows 11 Pro 25H2 | LM Studio 0.4.27
(Pathing is relative and nothing should be hardcoded specifically for Windows; this should work with Linux and macOS too.)

**Sorry about the tiny bug fixes or changes after the big update. I guess my brain was fried and now that it's decompressing these things popped up.**

## Bugfix (10/29/2026)
- My choice of correction on 10/27/2026 for the compaction seed conversion field checker implementation was flawed. I had forgotten that "await timeouts" do not play well with LM Studio's processing flow. Users who did not clear out the conversion field after they used it or did not break the full command apart would experience a 2-second delay after each new user message sent which was the await timeout holding things up. I've properly disconnected the conversion process now from the normal flow.

- New memory seeds created should immediately be added to the available memory seed pool in the backend. I must have introduced this bug a while back when I was refactoring to clean up my code, maybe I thought it was an unnecessary duplication and forgot why I was pushing the new seed to two different arrays so I got rid of one. I'm not sure but it's back and fixed. (plugin UI will still not show it until reinitialization).

## Updated (10/30/2026)

- Entire Readme has been updated to match the plugin's current state, so I highly encourage users to read it starting at [Configuration](#configuration). The functionality you knew of before remains the same, but there are many new additions. If you're interested in the technical bits, it can be read in the [Technical Details](#technical-details). The Technical Details will not alter how you engage with this plugin, but some users may find it nice to know what changes occurred under the hood to make this plugin reach its current state. The tooltips of the plugin have also been updated. Hover them for more information or if you forgot the commands associated with that feature.

- ⚙️ Initialize Table of Memories now has logic to remove stale/abandoned memory TOM entries. The normal delete memory logic should handle removing these, but this extra layer of insurance will account for when the user manually deletes the memory folders/files through the file explorer.

- Added a repetition blocker to the 🗑️ Delete Memory field. Sometimes the deletion command could be sent twice. The first time deleted the memory and the second time would just try but then exit when it saw the memory didnt exist anymore. I didn't mind it before, but I might as well add it.

- Expanded ↩️ and 🔥 features configuration max to 30.

## Final Thoughts

Probably the final big update. I am satisfied with this plugin's current state.
As for my Model Dependent version I've decided to discontinue it. It will continue to work as-is from its last version paired with an older version of the Context Cleanup Plugin.

## Table of Contents

- [Overview](#overview)
- [Setup](#setup)
- [Typical Workflow](#typical-workflow)
- [Configuration](#configuration)
- [Features](#features)
- [Technical Details](#technical-details)
- [Limitations or Notes](#limitations-or-notes)

## Overview

This project gives LM Studio conversations a lightweight persisting memory layer. Instead of manually copying useful answers, users can select important assistant responses, save them as memory seeds, and later choose which memories to inject into a new conversation.

These memories are stored in their respective files and can be injected into the conversation through the Plugin's UI. Users can additionally pull up a reference table containing each memory along with its summary overview.

<details>
<summary>Click to expand image of memory file contents</summary>
<img src="screenshots\memory-seed-json.jpg" alt="Image of memory file contents">
</details>

## Setup

From LM Studio Website: Install from the LM Studio Hub then enable the plugin.

From GitHub Source Code: Open PowerShell/terminal, navigate to the root folder of the plugin you downloaded where you can see the README, package, and manifest. Enter `lms dev -i -y`. Plugin should now be available in LM Studio.

## Typical Workflow

1. Start a conversation in LM Studio.
2. Copy and paste, from the `Available Memories`, one or more memory seeds into the `Memories to Inject` configuration field.
3. Using the prompt preprocessor, the plugin injects the `Memories to Inject` into the user's current turn.
4. During the conversation, ask the assistant to save a specific message as a memory, using the specific trigger phrase `"save memory #"` (example: `save memory 5; category recipes; name chicken thighs`).
5. Provide a `category` and `name` during the request or afterwards when asked.
6. The plugin saves the assistant response, overall topic, user message, and date as a memory seed.
7. To stop using a memory, remove it from `Memories to Inject`.
8. To permanently delete a memory, type the memory seed's full name into the `Delete Memory` field. This field only handles one memory at a time. Deletion confirmation is outputted in the LM Studio console, but it is safe to assume that if you have typed the memory's name correctly in this field, it's deleted.

## Configuration

<img src="screenshots\plugin-control-panel-updated.jpg" alt="Image of Plugin Control Panel">

| Field | Values | Purpose |
| --- | --- | --- |
| 🛠️ Switch to Tool Call Mode | Boolean · `ON / OFF` | Allows the user to switch between using the Explicit version or the Model Dependent version. Disabled = Explicit. Enabled = Model Dependent |
| 🗑️ Delete Memory | `String` | Full name of the memory to delete. Deletion is permanent. Bubbles will not update until reinitialization — this is a UI limitation of LM Studio. |
| Available Memories | `NONE` | Display-only: a list of available memories. Users can copy names from this list into **Memories to Inject** or **Delete Memory**. |
| 🧠 Memories to Inject | `String` | Memories that should be injected into the current session. Only the listed memories persist through turns. |
| 📝 Summarize Memory Injected | Boolean · `ON / OFF` | Instead of injecting the memory file contents verbatim, have the model summarize their contents before injection. This will only affect memories injected while this option is toggled ON. |
| 📦 Table of Memories | `NONE` | A simple reference to the TOM names in case you forget them. |
| ⚙️ Initialize Table of Memories | Boolean · `ON / OFF` | Users are expected to toggle this ON and send a user message one time. This will create and build your TOM tables in the memories folder. After the TOMs are initialized keep the option toggled OFF unless you need to reinitialize the tables. |
| ↩️ Retract TOM & TOC older than `<N>` turns | Numeric · `0 = OFF, max 30`  | Replaces all TOM and TOC tables with 'Content Retracted' if they are not the `<N>`th newest assistant messages. This is to manage your context window. TOMs are supposed to just be a quick reference to locate your memories. You are expected to use the Memories to Inject feature to keep memories in context. |
| 🔥 Delete Compactions older than `<N>` days | Numeric · `0 = OFF, max 30` | Requires Context Cleanup Plugin: Will automatically delete compactions that are older than the days you set. This will also delete everything associated with that compaction. It's TOC_Entity, TOC_Summaries, TOC_Seeds, and TOC_Collections entry will all be cleared. |
| 🌱 Compaction ➠ Memory Seed | `String` | Requires Context Cleanup Plugin: This is where you can engrain a compaction into a memory seed. Type in the full name of the compaction seed you wish to turn into a memory seed. Follow the expected format. |

## Features

### Tool Call Mode

<img src="screenshots\tool-call-mode.jpg" alt="Image of tool call toggle">
<br>

Toggled OFF runs the Explicit mode.
   - Pros: 
      1. Reliable scripted outputs.
      2. Easier on the backend to filter out junk data from being saved.
      3. Misbehaving models cannot decide to spam tool calls.
      4. Does not double up consumption of the context window.
      5. The exact parameters you give are used.
      6. Faster to retrieve data. Goes from: command -> data fetch -> overwrite last assistant message.
   - Cons:
      1. Nothing in regards to functionality. With my queuing systems and many retry/resolve functions added I've basically made a workaround to offset the past trade off.
      2. Cannot have model chain tool calls.
      3. You must remember the verbiage to the commands. I've made the commands very loose with many misspelling/shorthand alternatives already. They're also in the tooltips.

Toggled ON runs the Model Dependent (tool calls) mode.
   - Pros:
      1. Chained tool calls. You can go from asking the model to recall a memory to fetching the exact memory file.
      2. You can use casual language to invoke tool calls.
   - Cons:
      1. Reliability depends entirely on the model. (I've tested and fine-tuned the tool descriptions until the models I play with behaved within reason)
      2. The randomness of the assistant's replies requires more allowance from the backend to filter out its junk outputs (I did what I could to influence something reliable to optimize this like using emojis)
      3. The model can use parameters that it fabricates. (The model learns from patterns, based on the tool description it should ask for missing fields, but if you teach it the pattern that you're okay with it just using whatever parameters or if you repeat a parameter many times, it will begin to believe that when the user does not give parameters it means it should use the last known parameters.)
      4. Patterns override hard rules.
      5. Doubling of context used. When results must be fetched it goes from: request -> data fetch -> return to model(payload) -> model returns to user(duplicated payload)
      6. Spamming tool calls, with the tools available to it, if it wants to dig through the memory summaries and dig all the way to retrieve memory file it can do so. If the assistant isn't satisfied or an error occurs it may try as many parameters as it wants until it's satisfied.
      7. Data presentation varies. I literally handed the model a pre-formatted markdown table string with the tool directly asking to return it to the user that way. Yet assistant's may decide to feed you the raw string in a code block, display it properly, or extrapolate it into its own text format. Even when I tested the directions in the return package, the assistant would often choose to ignore it.

Do not take this Pros and Cons list as something to influence your decision of which version to use. Test both out yourself, Toggle ON or OFF, you can make that final choice. This list is just to lay out the nuances. Also by expanding my Explicit version to allow for tool calls I've also given the "Model Dependent version"(the new toggle), better backend logic and functions to work with. These functions were made to be more advanced because the Explicit version required them to be so. Now those improvements are also shared by the "Model Dependent version".

### Memory Injection

1. Inject a single memory by copying it's `<category>/<name>.json` into the Memories to Inject field.

2. Inject all memories within a category by using a `*` wildcard, `<category_folder>/*.json`.
   Users will not be allowed to create a file named `*` or `*.json` to protect this feature. (memory/file names like `few*many` will be allowed)
   <details>
   <summary>Click to expand Picture of batch inject wildcard.</summary>
   <img src="screenshots\memory-seed-wildcard.jpg" alt="Image of batch inject wildcard">
   </details>
   <br>

3. Users can have the model summarize their selected Memories to Inject by toggling its option ON prior to adding the memory seed and sending their user message. This will reduce the token footprint but may sacrifice some finer details compared to injecting the raw memory seed. Can be useful if you decided to compile multiple parts of a compaction seed into one memory seed, but it might take a while to generate the summary.
   <details>
   <summary>Click to expand Picture of batch inject wildcard.</summary>
   <img src="screenshots\summarize-memory-injected.jpg" alt="Image of summarize memory toggle">
   </details>
   <br>

### Saving a Memory

When the user sees a message they wish to keep as a memory, they can call on the `save_memory` tool by saying this to the assistant:

1. Single memory save:

   User says: `save memory #; category <category_name>; name <memory_name>`. (Refer to REGEX for allowed verbiage)
   - Usable delimiters are `;` or `,` or `.`
   - Prefixes like `category` and/or `name` are required.
   <details>
   <summary>Click to expand image of save memory mode</summary>
   <img src="screenshots\chat-save-memory-mode.jpg" alt="Image of save memory mode">
   </details>
   <br>

2. Batch memory save:

   User says: `save memory <message #> to <message #>; category <category>; name <name>`. (Refer to REGEX for allowed verbiage)
   User messages that are just save memory commands will be filtered out and not saved to the file during the batch process.
   <details>
   <summary>Click to expand Picture of batch memory save.</summary>
   <img src="screenshots\memory-seed-batch-save.jpg" alt="Image of batch memory save">
   </details>
   <br>

3. SAVE MEMORY REGEX. Each line is a phrase pattern. Only the keywords highlighted in green are required. Keywords are split into sets, each of those sets have variations of the words allowed to accommodate for misspellings. You can alternatively use these misspellings to shorthand commands. You only need to use one word of the set. For the Explicit mode `svmem4`is equivalent of the full command `save memory 4`. If you don't like shorthand and prefer plain English you can say `the category is <category_name>` that is equivalent to `category <category_name>`. To exit the save memory mode `exit save memory`, you must spell EXIT correctly, there is no optional variation. In Tool Call Mode the Model will interpret your save command so some shorthands might confuse the model. If you say `svmem4` it may understand you're asking for teh save command but might not understand that you specified message 4. It's good to double check what parameters it used in the tool call.
   <details>
   <summary>Click to expand Picture of Save Memory command verbiage</summary>
   <img src="screenshots\save-memory-command-variations.jpg" alt="Image of save command variations">
   </details>
   <br>

### Removing or Deleting a Memory

Removing and deleting are two distinct actions. **Remove** means your intention is to remove the memory from the current chat session's context. **Deleting** means you wish to permanently discard the memory — there is no undo.
   <br>
   <details>
   <summary>Click to expand image of remove and delete</summary>
   <img src="screenshots\plugin-control-panel-delete-or-remove-memory.jpg" alt="Image of plugin remove and delete">
   </details>
   <br>

1. To remove: Just press the X on the memory bubble under the **Memories to Inject** section. Memories not listed in **Memories to Inject** are either not in context or will be removed in the next turn.

2. To delete: Copy and paste the exact memory name into the **Delete Memory** text field. The full memory name includes the suffix `.json`, like `recipes/chicken_thighs.json`. It should instantly delete the memory. The plugin will not visually update `Available Memories` unless it's reinitialized or reconnected. But for all purposes, the deleted memory is no longer recognized.

3. To delete a whole category by using a `*` wildcard: `<category_folder>/*.json`. This removes the whole folder, there is no recovery.
   <details>
   <summary>Click to expand Picture of category wildcard delete.</summary>
   <img src="screenshots\category-wildcard-delete.jpg" alt="Image of wildcard delete">
   </details>
   <br>

## Table of Memories

**The TOMs feature is not a replacement for the Memories to Inject feature. TOMs should be used to help you locate or identify which memories you want to inject, not to keep memories in context.**

1. **Initialize Table of Memories:** It is extremely important that you toggle ON the `Initialize Table of Memories` at least once and send a user message. The content of that message does not matter. The purpose of the toggle is to create the TOM_A-J, TOM_K-Q, and TOM_R-Z files. These files will house summaries and metadata of the memories you've created. If you created memory seeds with an earlier version of my plugin this toggle will populate those older memories into their respective TOMs.
   <details>
   <summary>Click to expand image of tom file</summary>
   <img src="screenshots\example-of-tom-file.jpg" alt="Image of tom file">
   </details>
   <br>

2. **Table of Memories Lookup:** You can ask the assistant to retrieve the respective TOM by their full name or shorthand version of their name. (Refer to TOM REGEX for allowed verbiage)
   <details>
   <summary>Click to expand image of direct lookup of TOM contents</summary>
   <img src="screenshots\table-of-memories-lookup.jpg" alt="Image of direct lookup of TOM contents">
   </details>
   <br>

3. **Table of Memory Fuzzy Search:** Or if you only slightly remember what the memory was about, you can ask the assistant to help recall it with your fuzzy memory and to return up to 5 top guesses.
   <details>
   <summary>Click to expand image of memory recall</summary>
   <img src="screenshots\fuzzy-memory-recall.jpg" alt="Image of memory recall">
   </details>
   <br>
   <details>
   <summary>Click to expand image of direct and fuzzy search verbiage</summary>
   <img src="screenshots\tom-fuzzy-direct-regex.jpg" alt="Image of Direct and Fuzzy search verbiage">
   </details>
   <br>

4. **Table of Memory Direct Memory Fetch:** Users may ask the assistant to fetch a specific memory JSON file. The exact command is `fetch memory <category_name>/<file_name>.json`. This is the minimum structure. Look at the Regex picture for optional verbiage. Wildcard `*` behavior is also allowed, this will display to you a table of all the memory files within that category.
   <details>
   <summary>Click to expand image of direct memory fetch</summary>
   <img src="screenshots\direct-memory-fetch.jpg" alt="Image of direct memory fetch">
   </details>
   <br>

5. **Retract TOMs & TOCs older than `<N>` turns:** This will replace all TOM content that is older than the last Nth user messages with `Content Retracted`. This was done to free up context window being held up by old TOMs that you've already consumed.
   <details>
   <summary>Click to expand image content retracted feature</summary>
   <img src="screenshots\content-retracted.jpg" alt="Image of content retracted feature">
   </details>
   <br>

6. TOM REGEX (allowed verbiage). Type the keywords `table` and `memories` in one message, the ordering does not matter. You will be reminded to give a table name if you did not provide one in the first message. `TOM_A-J`, `TOM_K-Q`, `TOM_R-Z` are your options. Shorthand of the table names like `tomrz` works, so does other variations like `tom-rz`. 
   <details>
   <summary>Click to expand image of memory recall</summary>
   <img src="screenshots\tom-regex.jpg" alt="Image of TOM allowed verbiage">
   </details>
   <br>

## Compactions (X-PLUGIN)

**This is specifically a cross plugin feature with Context Cleanup rev8+ from LM Studio or v4.0+ from GitHub. If you do not have the proper version of them currently running together, these cross plugin features will not work.**

<img src="screenshots\cc-control-panel.jpg" alt="Image of Context Cleanup control panel">

1. **Threshold to auto cleanup:** This setting is the starting point of allowing the compaction feature. While this is enabled [100 = disabled] it will block the Keep first and Keep last truncation. When you've passed the threshold your messages will be truncated down to the setting of your keep first and keep last. This is required to be enabled to use the Compact a Memory feature.

2. **Compact a Memory after Threshold Truncation:** If this is enabled and you've met all requirements to compact a memory, when you've reached the threshold to auto clean up the Context Cleanup plugin will create a `.copy` of your chatMessage history stored right next to your `<file_name>.conversation.json` within the conversation folder. After every turn, the Persisting Memories Explicit plugin will check that folder to see if a `.copy` ever appeared. When it does the PM-E will use the contents of that file to create a compaction seed and delete the `.copy` once it's finished. That data will now be organized in your `~/.lmstudio/memories/compactions` folder.

3. **Compaction Folders:** These are the file and folders important to the compaction feature.
   - ***TOC_Collections:*** Holds the compaction seed membership belonging to which day. This way they can be auto deleted.
   - ***TOC_Entity:*** Holds a file split by each new day. Each file holds all of the same values as my **Table of Memories Lookup** picture. When you convert a compaction seed into a memory seed it will use this data. So there's no additional query to the model.
   - ***TOC_Seeds:*** Hold the data for each compaction split into parts. The data is the same as my **Table of Memory Direct Memory Fetch** picture. When you make it a memory seed this is the raw data that will be injected as a memory. Direct transfer so no additional queries to the model.
   - ***TOC_Summaries:*** Holds the summaries of the TOC_Seeds. The TOC_Seeds are your organized compactions, if you compacted at 50% I already split it into 2 parts, so if I allowed users to inject the raw data back it would be consuming your context window by 25% immediately. The approach is that you can retrieve a summary of the seeds instead, this should help remind you of what's in there. If it's important convert it to a memory seed then inject it verbatim. Summaries are created on-demand, I don't assume every compaction is relevant. When you've request a summary to be created for the first time it will be stored in the TOC_Summaries, if you request for the summary again it will give you the cached version instead of calling for a repeated summary, saving a wasted model call.
   - ***en_comps:*** No longer relevant, I decided to let users reassign the engrained compaction seed into a normal memory seed with user chosen category and file name.
   <details>
   <summary>Click to expand image of toc folders</summary>
   <img src="screenshots\TOC_Folders.jpg" alt="Image of TOC folders">
   </details>
   <br>

4. **Compaction Broken into Parts:** Each compaction is broken into parts. It'd be silly to think a 80% compaction file could be reasonably loaded back in if you need it mid conversation. So I've broken it into 3 to 4 equal parts. This way you can reasonably reload them.

5. **Fetch Compaction Summary:** Users can fetch a compaction file summary by using the command `fetch compaction <file_name>_c#_p#.json`. The full name must be used. In tools mode if a non-existent name is requested, the backend will return to the model all the available compaction files. The user can alter their request from there.
   <details>
   <summary>Click to expand image of fetch compaction summary</summary>
   <img src="screenshots\fetch-compaction-summary.jpg" alt="Image of fetch compaction summary">
   </details>
   <br>

6. **List Compaction Seeds:** If you forgot what compaction seeds you have, simply use the command, `list compaction seeds`. There is a strict requirement for the spelling of `list and seeds`. With this list you can quickly copy and paste the exact name of the compaction seed you wish to get a summary on, or to copy/paste to convert it into a memory seed.
   <details>
   <summary>Click to expand image of compaction list</summary>
   <img src="screenshots\list-compaction-seeds.jpg" alt="Image of compaction list">
   </details>
   <br> 

7. **Compaction Warning & Trail:** The Context Cleanup plugin will ask the assistant to warn the user when they've approached the auto Context Cleanup threshold with compaction enabled. The persisting memories Explicit plugin will begin compaction at the beginning of the following turn and append a compaction trail message to the latest assistant message.
   <details>
   <summary>Click to expand image of compaction warning and trail</summary>
   <img src="screenshots\compaction-warning-and-trail.jpg" alt="Image of compaction warning and trail">
   </details>
   <br>

8. **Convert a Compaction Seed into a Memory Seed:** The way to do this is by using the 🌱 Compaction ➠ Memory Seed text field. Type in `<name_of_compaction_c#_p#.json> >> <category_name>/<file_name>.json` The double **>>** is a requirement. It will be accessible as an available memory although your plugin UI might not immediately show it. That's an LM Studio problem. If you want all of a compaction seed's parts assigned to the same memory, change the # following the `_p#` while leaving the memory seed name the same. I caution you against this though because if you compacted at 50% threshold and got 3 parts, that single memory seed will consume 50% of your context window the next time you load that single memory seed that you packed with all 3 parts. Output of the transfer is in the console logs.
   - There is one caveat to this conversion. Once you have converted a compaction seed to a memory seed once, the compaction seed is ineligible to be saved to another memory seed. This was a method I chose to prevent accidental conversions being made on the same file as users edited the 🌱 Compaction ➠ Memory Seed text field. To make your compaction seed eligible again, go to the `~/.lmstudio/memories/compactions/TOC_Collections.json` and remove that specific compaction seed's name from any `engrained_fileName:[]` it is a part of; there can only be one instance of the compaction seed name, so no need to look for a duplicate once you have found it.
      <details>
      <summary>Click to expand image of TOC_ Collections</summary>
      <img src="screenshots\TOC_Collections.jpg" alt="Image of TOC_Collections">
      </details>
      <br>

9. **Injecting a Summarized Version of the Former Compaction Seed:** If you chose the route of merging multiple compaction parts into one memory seed you can consider using the 📝 Summarize Memory Injected feature to try and condense that memory seed while you inject it. It should reduce it down to be bearable compared to injecting the raw converted compaction seed.

10. **Compaction auto delete:** You can set the number of days that should pass before a compaction date group(compactions will belong to the date group of the date they were created) is auto deleted. If you set the value to 7, when any group becomes older than 7 days, all their related compaction files will be deleted. This way, your collection of compaction seeds won't grow indefinitely.

## Conversation Numbering

- The plugin will append a message # after each of the assistant's responses. This numbering makes it easier for users to refer to a specific exchange when asking to save a memory. The improved Explicit version should append to every assistant message eventually. Users spamming the assistant with messages should no longer lose the turn to write. Use the appending of the message # as the visual signal that the backend has finished all it's processing.

   <img src="screenshots\chat-message-N.jpg" alt="Image of Chat Message">

## Technical Details

> NEW SECTION
- **Backend Processing Finished Signal:** Now that the message # appending is reliable to even apply to past queued messages, you can now rely on that as the indicator the backend has caught up and performed it's work. This is very important to note because the assistant may want to hallucinate information to you and trick you into believing that was actually backend data presented. If you have run a TOM or Save command and see the assistant's thinking block and lacking a message # appended you are most likely looking at something the assistant concocted on it's own. Whatever it responded will be replaced shortly with the correct text.

- **Read/Parse Conversation File Retries:** Because accessing the conversation file is important I've now implemented some retry functions to try and recover a failed read/parse attempt. This way if the plugin is trying to read the file while the assistant is actively altering it, it won't throw an error, give up immediately, and consider the write operation lost.

- **No More Timeout Method:** Moved away from polling (assistant finished updating conversation file) → timeout (2-seconds) → WRITE. This method when the user started typing a new message immediately without giving a 2-second grace period after the assistant finished responding would cause some write actions to not resolve on that current turn. These functions were the message # appending, the removal of memory seeds, the insertions of the save memory mode text, and the insertion of the new TOM tables. Why it worked before is I had the assistant relay to the user a message like `pending save memory...` which gave time to replace the assistant's last message and acted as the "wait" timer for the user. But imagine the scenario where the assistant learns the pattern and instead of displaying the expected `pending save memory...` it hallucinates the request for missing fields or pretends to "save" the memory. Which the user then would just engage as they would. Usually it was fine, as long as the parameters were given, but rare times not. Long story short I switched to polling (assistant finished updating) → polling (user stopped typing) → WRITE.

- **Polling UserInput Stability Method:** There are two players who can destabilize the conversation file, the assistant and the user. Previously I only accounted for the assistant. To make this work I deduced that the user typing also destabilized the conversation file and worked around that too. The new polling method allows users to continue with their conversation if they don’t feel like giving the 2-second grace period. In the backend the operations will continue to queue up, and when the user eventually gives the 2-second grace period, all the operations will be resolved together in one write action.
   <details>
   <summary>Click to expand image of memory recall</summary>
   <img src="screenshots\retroactive-update.gif" alt="Image of new polling method effects">
   </details>
   <br>

- **Optimized Multiple Unresolved MECs queued to one READ/WRITE Action:** Now that I've added a MEC queue so no operations get lost or unresolved, the old method inherently assigned one read and write per MEC operation. To not waste user resources I've implemented a system where only the last MEC(newest) will perform the final read of the conversation file, load it into memory, and starting from the first MEC(oldest), they will apply all their edits to the parsed file in memory. When all have done their operations the last MEC will perform the final write action.

- **Sleeping Multi-Edit-Coordinators:** When multiple MECs were queued they would all need to check when conditions were met so they could perform their operations. This meant every queued MEC would need to poll, if 10 MECs got queued because the user never gave it a chance to resolve over 10 turns, it meant 10 pollers constantly and simultaneously asking for the green light. I've chopped it down to a system where only the last MEC holds responsibility to poll for the green light. While the other MECs "go to sleep". When the last MEC sees the green light, all the other MECs are woken up and perform their actions in the order of FIFO from the write queue.

- **Final Write Assurance:** Now after the final write of the conversation file, it will be checked for a matching message # appended. This message # is the signal that the write operation succeeded. If the message # was missing, up to 2 more attempts will be taken to get the changes to stick, up to a maximum of 3 including the first write. If we ultimately failed to write the changes an error will be printed to the console, and within the chat session you will visually not see a message # appended.

- **Removing Consumed TOMs & TOCs efficiently:** With my new feature to remove old TOMs you have "consumed" in the chat, I've stored within the config.ts the last index that was checked to scrub the latest TOM. That index as long as it remains usable in memory will act as the start point to the next cleanup cycle. This way resources are spared from iterating from the very beginning of the conversation. But again I must reiterate that LMS loves to disconnect plugins during idle or errors, if the plugin is reinitialized that shortcut value will be lost and must be reestablished after a new cycle starting from the beginning of the file.

- **Power of the Emojis:** `🚨 ⏳ ✅ ❌ 📦` These emojis if they appear in the first 8(+2 UTF) characters of the assistant message will make that assistant message ineligible for saving. What you can do with this knowledge is if you are planning to do a batch memory save, and there are certain assistant messages you wish to exclude rather than calling the save in multiple batches is for you to edit the assistant's message and put one of these emojis at the very beginning. The backend will spot the emoji and skip that message from saving. 📦 emoji has an additional function of having it's content retracted  if the feature is enabled.

- **More Flexible AcquireLock:** Previously the lock I created allowed ownership once per function. That was fine when I only ran MEC once, but with the transition to allowing for multiple queued MECs each instance then lacked a unique identity. When MEC1 finished it's job it would release it's lock even if MEC2 was still in queue. This happened because they both registered themselves as MEC. So to fix this I gave each instance its own suffix which allowed them to utilize the lock system after I added (you guessed it) another "queue" or array which allows multiple owners to own the same lock function.

- **Save Command Timeout Continuation/Recovery:** If your last action was trying to save a memory and your plugin timed out/reinitialized, you walked away, or the in memory values lost their state, there is potential to re-enter you into the save memory mode as long as the assistant's last message to you contained the '⏳ **`SAVE MEMORY MODE`**' tag. The values in the `known -` field will be the bookmark of your last incomplete values. This is more of a convenience QOL feature, it's about the flow, because sure you could just type the whole save command properly. This QOL feature allows you to start a save command, walk away or switch tabs and browse the internet for 18 seconds (which is the idle time limit to disconnect plugins) and come back and provide the missing fields.
   <details>
   <summary>Click to expand image of save message rejection</summary>
   <img src="screenshots\save-command-continuation.jpg" alt="Image of save command continuation">
   </details>
   <br>

- **No More Saving Save Commands To Memory:** In the pursuit of freedom to do whatever, even do odd things, I left the door open for users to save command outputs to a memory seed. I decided to retract that option and close that door to save processing power. My goal to make this Explicit version perform better took precedence.
   <details>
   <summary>Click to expand image of save message rejection</summary>
   <img src="screenshots\reject-save-messages.jpg" alt="Image of save message rejection">
   </details>
   <br>

- **ROLEPLAY Tag:** I got better results for model compliance by using a roleplay tag. With the roleplay tag I saw that the model was more willing to "play along". Although on rare occasions it playing along would allow it to hallucinate as though it was directly using a save memory system or TOM lookup system by regurgitating old data in the chat session. Regardless that data would be replaced by the backend with the correct information. It's just a loss of time waiting for the assistant to finish up it's hallucinated response. 

- **On Hover Tool Tips Enhanced:** The tooltips have been revamped to be more helpful. Tooltips on hover will display to you a reminder of what the commands are for that specific feature.

- **Reduced Plugin Words:** All the text was fine when my plugin just had a few interactable options but now it's expanded and to cut down on the text clutter I've moved much of informative/caution text to the tooltips.

- **Emojis in Control Panel:** I just thought it would help users quickly recognize the fields they are looking for and to break apart the wall of text from the many options.

- **TOMs & TOCs Removal Combined:** The logic to remove TOCs is piggybacked off the TOMs removal logic. Meaning that The retraction setting now applies to message payloads. 

- **Compaction Trail:** At first I envisioned making the compaction trail something the assistant could work backwards from to retrieve compactions into context if it thought those compactions had data it needed, but I discarded that feature. Nothing would have been able to stop a bad assistant from crawling and pulling back everything into context just because it felt like it. So now the compaction trail is just a visual for users, it's not even considered as part of the context that the assistant can interact with. If you wish to make a compaction relevant covert it to a memory seed, and then anything you could do with a memory seed you can do with that former compaction seed.

- **Maximum Optimization Tradeoff:** By incorporating the Model Dependent tool calls into this Explicit version, I've had to slightly "unoptimized" some functions and take some actions to try and influence the model to output something my plugin could latch onto. I found this in the form of emojis. At first I was using the emojis for the Explicit version because I thought it made it look nicer, but when I found out the output of the model couldn't be relied on, I tested emojis within the return package and found out if the return package contained an emoji the assistant was more than likely going to use that exact emoji in it's response. So basically instead of just locating the emoji as the first character, my backend logic now needs to search the first 10-20 characters. If my Explicit version could expect to find a tag in the first few words, the tool calls version may need to check the entire string. So that is the basic trade off.

- **.Ready File Creation:** The ready file is no longer a signal to say that PM-E has caught up in it's processing lifecycle. Its purpose now is to be a signal that PM-E has finished it's lifecycle. Context Cleanup plugin will use the ready file as a signal to now begin it's process rather than wait for the .lock file to be removed.

- **Stale .Ready File Cleanup:** At first I decided against making a cleaner for stale ready files where you deleted the chat session before Context Cleanup got a chance to consume the ready file. They were 0KB files and just sitting there, no real harm other than making the conversation folder look cluttered. I changed my mind in favor of tidiness and have added a low processing jerry rigged stale ready file cleanup. For the first 1 minute of every 30 minutes the plugin will check the conversation folder for any ready file older than 10 seconds and remove them. That's at least 48 checks in 24 hours I figure eventually users would land within that window. I could have added a toggle but my plugin control panel is getting too cluttered.

- **Refactoring:** 
   - Removed some states that the timeout method needed to operate properly which this new polling/polling method does not need to consider.
   - Refactored all the hardcoded TOM ranges to a single variable point in config.ts.
   - Added markdown symbols to the Save Memory Model to make it more visually digestible.
   - TOM prompts to let the model know it's okay to return nothing.
   - A few functions now return booleans instead of void. These booleans are serving as a success or failure signal.

- **Bugfix?** There was an issue where I could force an edge case scenario where if I spammed the assistant, overloaded it, stalled it, or did very out of the ordinary/unrealistic user behaviors I could get the plugin to fail to register the conversation file name or have read and parse errors. However after adding my additional read/parse recovery methods and silent failure on acquiring the CFN during the scan, and giving it one more attempt to acquire it at the beginning of the MEC process, I have not been able to encounter those errors again. So I don't know if I really fixed it or not. All I know is it hasn't happened at all during my testing and use over the past days. One factor of the failure comes from empty.conversation.json, this empty.conversation.json is created when you use the chat session that is auto created after loading a model. With properly created files UNIX_timestamped.conversation.json, I don't think I ever saw that problem.

- **LM Studio Root Directory Relative Location:** Made the `~/.lmstudio` folder location semi-dynamic. If your `.lmstudio` folder is in the default location, the plugin will have no problems pathing to the right folders. If you've moved your `.lmstudio` folder out of the default location of the User folder, this plugin will now locate the relative position of your `.lmstudio` root folder based on the root folder of where this plugin lives.

> OLD SECTION
- **Multi-Edit Coordinator:** The function that consolidates all the write functions so they can be executed at a single place and at a single time.

- **Ready File for Context Cleanup Plugin:** This plugin will create a `<file_name>-persisting-memories-final-write.ready` file to give the green light to the Context Cleanup plugin that it's operations are done. CC will then proceed with it's operations.

- **Lock File:** This plugin will create a `<file_name>.lock` file to protect the conversation file while it's being updated. Currently in this system as it has evolved it may be just a safeguard not currently doing much other than protecting `ChatSessionConversationRelationship` which is low priority. The Contect Cleanup plugin is already now regulated to waiting to consuming the ready file, and the write functions have all been consolidated to the MEC who is now directing things through a write queue FIFO and last person is responsible for the final write structure.

- **Memories folder:** a `memories` folder at `~/.lmstudio`, and a `ChatSessionConversationRelationship.json` file that retains the relationship between the chat session and its conversation file will be stored in `~/.lmstudio/conversations`.

- **Memory Injection Tags:**: Memories will be injected within their blocks of `[BEGIN category/name.json]` and `[END category/name.json]` tags. These tags allow for later removal of the memory.

- **Internal ChatID (ICID):**: Unix_Timestamp ID which will appended by the prompt preprocessor. This `[ICID]` will allow the plugin to find which conversation file is associated with the specific chat session.

- **Conversation Mapping:** The plugin stores a relationship file `ChatSessionConversationRelationship.json` in `~/.lmstudio/conversations`. This is a mapping of the relationship between the `ICID` and `conversation file`. It keeps only the newest 15 relationships so the file size stays small and serves as a quick and cheap lookup resource to re-establish the paired relationship. LM Studio reinitializes and disconnects plugins regularly so storing these values in memory is impossible for reliability.

- **Memory Seed Names:** Memory names are normalized, but not to correct misspellings. It's easiest to copy and paste the memory name from the list displayed in `Available Memories` into the text field of `Memories to Inject`. Make sure you've copied the full memory name including the `.json`.

- **UI Desync:** LM Studio does not give any backend way to update the plugin UI. It will update when the plugin reinitializes or reconnects after an idle time out. Just assume whatever you do it up to date in the backend. If you just added a memory and you know it's full name while it's not in the UI, you can directly Inject it, same with the deletion function.

## Limitations or Notes

- I had only 3 options to fully execute this:
   1. **PredictionLoopHandler** overtook the default structure of LM Studio, which ultimately is bad for compatibility with other plugins.

   2. **Rely on the unreliable model** — in short `toolsProvider` and hope the model adheres to the rules and tool usage descriptions. Which given enough time they would take everything definitive as suggestions and recognize patterns as rules to repeat.

   3. **Real-time conversation.json editing** — most complex method, I had to figure out many things about the quirks of how LM Studio Chat functions. Even the exact timing when the conversation file could be edited became a hidden factor.

- Injected context will be hidden from the user, but visible to the assistant. User can ask the assistant to read out the injected memory if you wish to see it. Just know that making the assistant read it out will basically now have that content within your preprocessed message and the assistant's reply which effectively doubles the context window usage for that piece of re-duplicated data.

- LM Studio's SDK does not have full support to make this implementation easy. The methods chosen to accomplish this feature were mandatory during the time of creation of this plugin.

- The plugin assumes LM Studio conversation files are accessible under the configured root directory at `~/.lmstudio/conversations`. Regardless, I did not hardcode paths, the paths are all relative to the default folders of LM Studio.