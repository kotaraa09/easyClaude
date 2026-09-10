---
name: explore-code
description: Find your way around a large or unfamiliar codebase without reading all of it. Use when you need to locate where something lives, learn what a file exposes, or find every place a name is used before renaming or changing it.
allowed-tools: Read, Glob, Grep, Bash
---

# Explore code

The discipline is buying information in the right order. Every step below costs less than the one after it, so a question answered at step 2 must never be answered at step 5.

Reading a file is the most expensive way to learn anything about it. It is also the first thing everyone reaches for.

## 0. Use an index if the project has one

If `mcp__graft__*` tools are available, use them first and skip to step 5. They answer these questions from a prebuilt graph, which is cheaper and more accurate than anything below.

Everything after this assumes no index exists. That is the normal case.

## 1. Name the question before searching

One of four things is true. Say which, then use only the step that answers it.

| what you need | go to |
|---|---|
| where one name is defined | step 2 |
| what a file offers | step 3 |
| every place a name is used | step 4 |
| how a whole area fits together | step 5 |

"Let me look around" is not one of these. It is how a session spends twenty reads to learn what one search would have said.

## 2. Search for the definition, do not open the file

Search for the declaration, not the bare name. The bare name matches every call site and buries the one line you want.

```bash
rg -n '(function|class|const|def|fn|type|interface|struct|impl)\s+TheName'
```

Then read **around that line**, not the file. Use `offset` and `limit` on Read, about 40 lines. Widen only if the answer is genuinely not there.

## 3. Read a file's shape before its contents

A signature list costs about a tenth of the file and answers most questions about it.

```bash
rg -n '^\s*(export |pub |public |private )?(async )?(function|class|def|fn|type|interface|struct|impl|const)\b' path/to/file
```

Read the whole file only when you must change it, or when the logic inside one function is the actual question.

## 4. Find every use before you change a name

**Warning: run this before the edit, not after.** A rename applied to three of five call sites breaks the build in a place you are not looking.

```bash
rg -n --word-regexp 'TheName'
```

Then check the places a word search misses:

- the name inside a string, for anything resolved at run time
- re-exports and barrel files that pass the name through
- test fixtures, snapshots, and configuration files
- documentation and comments that will now be wrong

Count the hits before editing. Over roughly twenty, stop and say so — that is a plan, not an edit.

## 5. Map an area from its edges

Directory names and import lines describe a project faster than its code does.

```bash
git ls-files | head -100
rg -n '^(import|from|use|require|#include)' --glob '!node_modules' -m 5
```

Imports point one way. The file everything imports and that imports little is the core. The file that imports widely and is imported by nothing is an entry point. That is usually enough to know where to start.

## 6. Do not pay twice

Say what you learned as you go: this file holds X, that name lives at Y. A fact you state once is a file you do not open again.

If you notice yourself opening a file for the second time, you did not record it the first time.

## When to stop

Two searches that find nothing mean the thing is named differently, not that you should read more files.

Say what you looked for and what you expected. Ask for the real name. A third guess costs more than the question.
