---
name: writing-style
description: Plain-language writing rules (distilled from the Microsoft Writing Style Guide and the Google developer documentation style guide) for every developer-facing writing surface, including PR titles and descriptions, issues and tickets, findings docs, handoffs, READMEs, runbooks, CLI output and error messages, and all text inside internal tools an agent builds (labels, buttons, empty states, help text, tooltips, chart titles, column headers). Use this skill whenever you are about to write or edit any of those, even if the user only says "write it up", "make a ticket", "file an issue", "add a label", "build me a dashboard", or "open a PR". Also use it when reviewing or rewriting someone else's PR, issue, ticket, or tool text.
---

# Technical writing style

Rules for the text an agent writes: PRs, issues, docs, CLI output, and the words inside internal tools. Distilled from the [Microsoft Writing Style Guide](https://learn.microsoft.com/en-us/style-guide/welcome/) and the [Google developer documentation style guide](https://developers.google.com/style). Where the two guides differ, the rule here picks one.

The reader is usually a reviewer or maintainer who scans first and reads second. Every rule below exists to make scanning work.

## The six rules that do most of the work

1. **Lead with the point.** First sentence of a PR, ticket, section, or tooltip carries the thing the reader came for. Front-load keywords in headings and list items so the eye catches them while scanning.
1. **Talk like a person.** Contractions (it's, you'll, don't). Short everyday words. Second person ("you") for instructions, never "we" or "the user". Read it aloud; if you wouldn't say it, rewrite it.
1. **Start with a verb.** Instructions, steps, button labels, PR titles, and most sentences open with the action. Cut "you can", "there is/are", "in order to", "it is possible to".
1. **One idea per sentence, under 26 words.** Short paragraphs (three to seven lines). Break long ones. Fragments are fine when they scan.
1. **Say what happened, not how impressive it is.** No pre-announcing, no "excitingly", no novelty framing, no "simply/easy/quickly/just". State the change, the reason, the effect.
1. **Be consistent.** Same word for the same thing every time. Same sentence shape for parallel items. Same capitalization pattern everywhere (sentence case).

## Mechanics that apply everywhere

| Topic                | Rule                                                                                                                                                | Do                                                   | Don't                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| Capitalization       | Sentence case for titles, headings, labels, buttons. Capitalize only the first word and proper nouns.                                               | Add a connection                                     | Add A Connection                                         |
| Serial comma         | Use it in lists of three or more.                                                                                                                   | Linux, macOS, and Windows                            | Linux, macOS and Windows                                 |
| End punctuation      | None on titles, headings, labels, buttons, or short list items. Full sentences in lists get a period.                                               | **Save chart**                                       | **Save chart.**                                          |
| Spelling             | US English.                                                                                                                                         | behavior, color, center                              | behaviour, colour, centre                                |
| Dashes               | Em dashes closed up, no spaces around them. Use them sparingly; a comma, colon, or period usually reads better. Hyphens only in compound modifiers. | Run the gate—lint, types, and tests—before you push. | Run the gate — lint, types, and tests — before you push. |
| Numbers              | Numerals for everything measurable, including 1 through 9. Spell out only when a number starts a sentence.                                          | 3 retries, 12 users                                  | three retries                                            |
| Dates                | Unambiguous: `Sep 17, 2026` or `2026-09-17`. Never `9/17` or `17/9`.                                                                                | Sep 17, 2026                                         | 9/17/26                                                  |
| Acronyms             | Define on first use unless the reader is guaranteed to know it.                                                                                     | pull request (PR)                                    | PR (undefined, to a non-engineer)                        |
| Exclamation marks    | Don't.                                                                                                                                              | Done.                                                | Done!                                                    |
| "Please"             | Don't, in instructions or UI.                                                                                                                       | Enter a date.                                        | Please enter a date.                                     |
| Link text            | Describe the destination. Never "here", "this", or a bare URL. Punctuation goes outside the link.                                                   | See [the deploy runbook](/runbooks/deploy).          | Click [here](/runbooks/deploy).                          |
| Directional language | Never "above", "below", "left", "right-hand". Use "earlier", "following", or name the element.                                                      | In the following table                               | In the table below                                       |
| Bold                 | UI element names in bold when you tell someone to use them. Nothing else in bold except a single warning label.                                     | Click **Run query**.                                 | Click the "Run query" button.                            |
| Code font            | Commands, file paths, field values, identifiers, anything typed literally.                                                                          | `git pull`                                           | git pull                                                 |
| Conditions           | Put the condition before the instruction.                                                                                                           | If the build fails, rerun it.                        | Rerun the build if it fails.                             |
| Location             | Say where before what.                                                                                                                              | In the **Filters** pane, select **Last 7 days**.     | Select **Last 7 days** in the **Filters** pane.          |
| Double negatives     | Rewrite positively.                                                                                                                                 | You can continue without a path.                     | A missing path won't stop you from continuing.           |

## By surface

### PR titles and descriptions

Title: a conventional-commit line, `type(scope): summary`, because the title becomes the squash-merge commit subject. Imperative summary, lowercase after the colon, 72 characters or fewer. Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`. `fix(cli): stop the nightly cache miss on empty lists`, not `Nightly cache fix` or `Fixed the bug where...`.

Description, in this order, each as short as truth allows:

1. **What changed** (one or two sentences, plain English first, then the mechanism).
1. **Why** (the observed problem or the ask, with a link to the ticket or thread).
1. **How to verify** (numbered steps a reviewer can follow; commands in code font).
1. **What it does not do** (scope boundary, only if a reviewer might assume otherwise).

Skip any section that would be empty. A PR that renames a file needs one line. No headings for a three-line description. No "This PR..." openers; start with the verb or the noun that changed.

### Issues and tickets

Title: what needs to happen or what is wrong, in the reader's words, sentence case. `Device tokens not saved for sign-ups after Sep 3`, not `Token issue`.

Body: the observed behavior, the expected behavior, how to reproduce or where to look, and the ask. Numbers and file paths beat adjectives. Link the PR, the query, the doc. State the current status.

Comments: lead with the decision or the finding. One comment, one subject.

### Findings docs, handoffs, READMEs, runbooks

Headings in sentence case, front-loaded with the keyword, no trailing punctuation, no skipped levels. A table of contents when the doc runs past one screen.

Procedures: numbered steps, one action per step, imperative verb first, location before action, result in the same paragraph as the action. `Optional:` prefix for optional steps. Single-step procedures are a sentence, not a list. Don't repeat a procedure; link to it.

### CLI output, error messages, and internal tool text

This is text read at a glance: terminal output, error messages, logs, and the UI of internal tools.

- **CLI output:** the result on the first line, the detail after it. One finding per line, location first (`src/cli.ts:42`) so editors and terminals can jump to it. Exit code and output agree: a failure prints why and exits non-zero.
- **Buttons and actions:** verb first, sentence case, one to three words. `Run query`, `Export CSV`, `Clear filters`. Never `Submit`, `OK`, or `Click here`.
- **Labels and column headers:** the thing, sentence case, no colon. `Messages per day`, not `Messages Per Day:`.
- **Empty states:** what belongs here plus the one action that fills it. `No runs yet. Run a query to see results.`
- **Error messages:** what went wrong, then how to fix it, in that order. Never "Invalid", "Error", "Oops", or a stack trace as the whole message. `Date must be on or before today. Pick an earlier date.` In a CLI: `Unknown flag --repot. Did you mean --report?`
- **Help text and tooltips:** one sentence, under 15 words, no period if it's a fragment.
- **Chart titles:** the metric and the window. `Active users, last 30 days`. Axis labels carry the unit.
- **Loading and status:** present tense, what is happening. `Loading last 7 days`, not `Please wait...`.
- **Confirmations:** name the consequence, not the mechanism. `Delete 12 rows? This can't be undone.`
- **Never rely on color alone** to carry state; pair it with a text label. Every icon-only control gets a visible or accessible label.

## Kill list

Delete or replace on sight. Each of these either hedges, pads, or condescends.

- Filler adverbs: simply, just, easily, quickly, actually, basically, essentially, genuinely, honestly, really, very
- Throat-clearing: "it's worth noting", "please note", "at this time", "in order to", "it is important to", "as you can see", "note that"
- Weak openers: "there is/are/were", "you can" (when not about permission), "this PR/ticket/doc..."
- Pre-announcing and novelty: "excitingly", "we found that", "surprisingly", "game-changing", "the most important thing"
- Vague pointers: "click here", "this", "it" with no clear referent, "above", "below"
- Jargon that has a plain twin: utilize (use), leverage (use), in the event that (if), prior to (before), subsequent to (after), functionality (feature), via (through, with)
- Marketing tone in internal text: "seamless", "robust", "powerful", "intuitive", "delightful"

## Before you hand it over

Run this pass on anything longer than a sentence:

1. Read the first line alone. Does it carry the point? If not, move the point there.
1. Search for every word in the kill list. Delete or replace.
1. Check every heading, label, and button for Title Case and trailing punctuation.
1. Check every link's text reads as a destination on its own.
1. Read it aloud once. Rewrite any sentence you stumbled on.

## Reference

For the rule on a specific case (how to name a checkbox, format a keyboard shortcut, write alt text, structure a table), read `references/style-guide-rules.md`. It holds the fuller distillation of both guides with their own before/after examples, organized by topic with a table of contents.
