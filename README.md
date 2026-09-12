# Memory Seed Plugin

Memory Seed Plugin is an LM Studio plugin that lets users preserve selected assistant responses as reusable memory seeds and inject those memories into future conversations. It stores memories as local JSON files, organizes them by category, and uses prompt preprocessing to add selected memories to the active prompt when needed.

## Table of Contents

- [Overview](#overview)
- [Setup](#setup)
- [Typical Workflow](#typical-workflow)
- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Tools](#tools)
- [Conversation Numbering](#conversation-numbering)
- [Technical Details](#technical-details)
- [Limitations and Notes](#limitations-and-notes)

## Overview

This project gives LM Studio conversations a lightweight persistent memory layer. Instead of manually copying useful answers, users can select important assistant responses, save them as memory seeds, and later choose which memories should influence a new conversation.

A memory seed captures:

- The original user intention behind the exchange.
- The direct user request that produced the saved response.
- The assistant response being remembered.
- The date the memory was saved.

The plugin keeps the available memory pool in memory, injects selected memories into prompts, and can remove previously injected memories from the stored conversation file when the user no longer wants them.

## Setup

> WIP

## Typical Workflow

1. Start a conversation in LM Studio.
2. Copy and paste, from the available memories, one or more memory seeds into the Selected Memories configuration field.
3. The plugin injects the selected memories into the current prompt when they have not already appeared in the conversation.
4. During the conversation, ask the assistant to save a specific message as a memory.
5. Provide a category and name during the request or after being prompted.
6. The plugin saves the assistant response, overall topic, user message, and date as a memory seed.
7. To stop using a memory, remove it from Selected Memories.
8. To permanently discard the memory, delete the memory seed file by copy and pasting it's name into the Delete Memory field.

## How It Works

### Prompt Preprocessing

1. Through the use of preprompt processing, the memory seed is injected alongside the user's message on the newest user's turn.
2. The added text will now be able to be referenced by the assistant.

### Saving a Memory

When the user see's a message they wish to keep as a memory, they can call on the save_memory tool by saying this to the assistant

1. User says: save memory message #, category **category_name**, name **memory_name** 
2. If category and name are not provide during the initial request the assistant "should" stop to ask for that data.

### Removing or Deleting a Memory

Removing and deleting are two distinct actions. Remove means your intention is to remove the memory from the current chat session's context. Deleting means to permanently discard the memory.

1. To remove: Just press the x on the memory bubble under the Selected Memories section. Memories not listed in Selected Memories are either not in context or were removed form context.
2. To delete: Copy and paste the exact memory name into the Delete Memory text field. It should instantly delete the memory. The plugin will not update Available Memories unless it's reinitialized. But for all future purposes the deleted memory will no longer be usable.

## Configuration

| Field | Purpose |
| --- | --- |
| deleteMemorySeedsFile | Full name of the memory to delete from the pool. Deletion is permanent. |
| memorySeedsPool | Display-only list of available memories. Users copy names from this list into Selected Memories. |
| memorySeedsSelected | Memories that should be injected into the current session. Only the listed memories persist through turns. |

## Tools

## Conversation Numbering

While enabled the plugin will force the assistant to append message # after each of it's responses.
This numbering makes it easier for users to refer to a specific exchange when asking to save a memory.

## Technical Details

- A memories folder will be created at.lmstudio/memories, and a .json that contains retains the relationship between the chat session and it's conversation file will be stored in .lmstudio/conversation.
- Injection markers: memories will be injected within blocks of BEGIN and END markers containing the memory seed path. These markers allow for later removal of the memory.
- Internal chat ID: the preprocessor will append an InternalChatID to mark the chat session. This marker helps to later identify the session and tie it to a conversation file.
- Conversation mapping: the plugin stores a relationship file that maps internal chat IDs to conversation file names. It keeps only the newest twenty relationships.
- Removal polling: when triggered memory removal polls the conversation file every two seconds until the assistant responds. Then will remove the memories from the conversation.
- Path safety: memory names are normalized, but not to correct misspellings. It is easiest to copy and paste the memory name from the list displayed in Available Memories.
- In-memory pool: the available memory pool is kept in memory and updated when files are deleted. Configuration updates may be delayed because of LM Studio plugin behavior.

## Limitations or Notes

- Injected context will not be hidden from the user, but visible to the assistant. User can ask the assistant to read out the injected context if you wish to see it.
- LM Studio's SDK does not have full support to make this implementation easy. The methods chosen to accomplish this feature was mandatory during the time of creation of this plugin.
- The plugin assumes LM Studio Windows 11 conversation files are accessible under the configured root directory.
- The Memory bubbles displayed on the plugin do not update real-time. Again another limitation of LM Studio not giving a way to send updated data upstream back to the plugin UI. The memory bubbles will update when the tool reinitializes, so when it's left idle for awhile then interacted with, or if you click the trashcan "reset" button. There are already validation checks in the backend to prevent any bugs, so don't worry about it. If you choose memories that aren't available nothing will happen. If you add, remove, or delete memories that aren't active or exist, nothing will break. It'll just be a visual bug of the UI that will refresh upon it's next initialization.