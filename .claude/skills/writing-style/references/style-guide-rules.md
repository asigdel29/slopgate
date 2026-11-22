# Style guide rules: Microsoft and Google, distilled

Source pages: Microsoft [Top 10 tips](https://learn.microsoft.com/en-us/style-guide/top-10-tips-style-voice), [Brand voice](https://learn.microsoft.com/en-us/style-guide/brand-voice-above-all-simple-human), [Word choice](https://learn.microsoft.com/en-us/style-guide/word-choice/), [Scannable content](https://learn.microsoft.com/en-us/style-guide/scannable-content/); Google [Highlights](https://developers.google.com/style/highlights), [Tone](https://developers.google.com/style/tone), [Procedures](https://developers.google.com/style/procedures), [UI elements](https://developers.google.com/style/ui-elements), [Link text](https://developers.google.com/style/link-text), [Accessibility](https://developers.google.com/style/accessibility). Fetched Sep 17, 2026.

## Contents

1. [Voice and tone](#1-voice-and-tone)
1. [Sentences and words](#2-sentences-and-words)
1. [Capitalization and punctuation](#3-capitalization-and-punctuation)
1. [Scannable structure](#4-scannable-structure)
1. [Procedures and steps](#5-procedures-and-steps)
1. [Referring to UI elements](#6-referring-to-ui-elements)
1. [Keyboard keys](#7-keyboard-keys)
1. [Links](#8-links)
1. [Lists and tables](#9-lists-and-tables)
1. [Accessibility](#10-accessibility)
1. [Images](#11-images)
1. [Global audience](#12-global-audience)

## 1. Voice and tone

**Microsoft's three voice principles**

- Warm and relaxed: natural, less formal, grounded in everyday conversation.
- Crisp and clear: to the point; written for scanning first, reading second.
- Ready to lend a hand: anticipate the reader's real need and answer it at the right moment.

**Google's target:** a knowledgeable friend who understands what the reader wants to do. Conversational, friendly, respectful. Not pedantic, not pushy, not cutesy.

**Do**

- Get to the point fast. Start with the key takeaway. Put the most important thing in the most noticeable spot.
- Talk like a person. Short everyday words, contractions, sentence-style capitalization.
- Bigger ideas, fewer words. Prune every excess word.
- Read it aloud to check that it sounds natural.
- Let some personality through, but keep it in the language, not in jokes.

**Don't**

- Buzzwords, jargon, or acronyms the reader may not know.
- Figurative language and metaphors.
- Placeholder phrases: "please note", "at this time".
- Repetitive sentence starters ("You can... You can... You can").
- Exclamation marks.
- Wackiness, pop-culture references, internet slang.
- "Let's do X" phrasing.
- "Simply", "easy", "quickly", "just" in instructions. They insult the reader who finds it hard.
- Pre-announcing features or work that hasn't shipped.
- "Please" in instructions. Once in a whole doc is the ceiling.

**Before and after** (written for this guide in the spirit of Microsoft's examples)

| Before                                                                                                                                                                       | After                                                                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| If you would like to change the threshold that the check uses, you can do so by editing the value in the configuration file.                                                 | To change the threshold, edit the config file.                                       |
| Invalid version                                                                                                                                                              | Enter a version like `1.4.2`.                                                        |
| Reports provide a summary of each run. A report can include the scores, the files that changed, and the trend over time. Consider saving a report if you often compare runs. | Save a report after each run to compare scores, changed files, and trends over time. |
| You can run the checks on your own machine, and you also get the same results in CI.                                                                                         | Run the checks locally and get the same results as CI.                               |

**Tone range** (written for this guide, after Google's too informal / right / too formal triangle)

| Too informal                                | Right                                                 | Too formal                                                                                            |
| ------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Whoa! This flag is seriously amazing!       | This flag prints a report of every file that changed. | The flag described herein may facilitate the generation of a report pertaining to modified files.     |
| Then—bam—nuke the cache and you're all set. | To reset the state, delete the cache folder.          | Kindly be advised that completion of this task necessitates the prior removal of the cache directory. |

## 2. Sentences and words

- **Second person.** "You", not "we" or "the user". Instructions address the reader directly.
- **Active voice.** Make clear who performs the action. "The job writes the cache", not "The cache is written".
- **Start with a verb** most of the time. Edit out "you can" when it isn't about permission. Avoid "there is / there are / there were".
- **Present tense.** "The query returns", not "will return".
- **Under 26 words per sentence.** Long sentences hide the verb.
- **Use the same word for the same thing.** Don't vary vocabulary for elegance; readers assume a new word means a new thing.
- **Don't use common words in new ways.** If "session" means something specific in your system, say so once, then use it consistently.
- **Use technical terms carefully.** Define on first use if the reader might not know it. Prefer the plain word when one exists.
- **US spelling.** Merriam-Webster is the arbiter.
- **Conditions before instructions.** "If the build fails, rerun it." The reader can skip the instruction if the condition doesn't apply.
- **Avoid double negatives** and exceptions to exceptions. "You can continue without a path", not "A missing path won't prevent you from continuing."
- **Transitions between sentences** so paragraphs flow; avoid both choppy and long-winded runs.

## 3. Capitalization and punctuation

- **Sentence case** for titles, headings, subheadings, UI labels, list items. Capitalize the first word and proper nouns only. Microsoft: "When in doubt, don't capitalize."
  - Find a Microsoft partner, not Find a Microsoft Partner
  - Limited-time offer, not Limited-Time Offer
- **No period or colon** at the end of titles, headings, subheadings, or UI titles. "Move a tile", not "Move a tile."
- **Serial comma.** "Android, iOS, and Windows".
- **One space** after periods, question marks, and colons.
- **Dashes.** Microsoft: closed em dashes, no spaces around them. Use them sparingly. En dashes only in number ranges.
- **Avoid camel case and ALL CAPS** in prose and headings; screen readers may spell them out. Convert all-caps UI labels to sentence case when you refer to them.
- **Ampersands:** write "and" except when quoting a UI label that uses "&" or in tight space.
- **Semicolons, exclamation marks, question marks:** minimize; not all screen readers voice them.

## 4. Scannable structure

- **Put first things first.** Content on the first screen gets read; the rest may not. Lead with what matters most to the reader. Readers scan in an F shape, so the upper-left corner gets the most attention.
- **Be brief, be bold, be clear.** Short headings, short sentences, short paragraphs. Use short simple words, get to the point, then stop.
- **Paragraphs of three to seven lines.** A single-line paragraph now and then is fine.
- **Front-load keywords** in headings, table entries, and the first words of paragraphs.
- **Parallel structure** for parallel things: headings at the same level, list items, table rows, comparisons.
- **Consistent formatting patterns** (bold for UI labels, code font for literals, same cross-reference syntax) act as landmarks.
- **Navigation in long documents:** a table of contents with links, sections that stand alone, "Back to top" links after long sections.
- **Headings:** a level-1 heading for the page title; don't skip levels (no h3 after h1); no empty headings; no heading with nothing under it.

## 5. Procedures and steps

- **Introduce the procedure** with a sentence that adds context beyond the heading. End with a colon if steps follow immediately, a period if other material comes first. "To customize the buttons, follow these steps:" or "Customize the buttons:". Not "To customize the buttons:" alone.
- **Imperative verb first** in every step. Not a dependent clause.
- **One action per step.** Small sequential clicks can combine with angle brackets: Click **File > New > Document**.
- **Location before action.** "In Google Docs, click **File > New > Document**", not "Click **File > New > Document** in Google Docs".
- **Goal before action** when stating a goal: "To start a new document, click **File > New > Document**".
- **Action first, result second, same paragraph.** "Click **Run**. The query results appear after the query runs."
- **Justification after the action.** "Store the private key in a secure location. You need it later."
- **Optional steps:** start with "Optional:" and a colon. Not "(Optional)".
- **Single-step procedure:** one sentence, bulleted or inline. Never a numbered list of one.
- **Sub-steps:** lowercase letters; sub-sub-steps lowercase roman numerals.
- **Complete sentences, parallel structure, consistent verb form.**
- **Include pressing Enter** as part of the step: "click the search box, type `custom function`, and then press **Enter**".
- **Prerequisites up front:** "The following hardware and software are required..."
- **One way to do it.** If several ways exist, document the shortest and simplest (prefer keyboard-accessible). Put alternatives on separate pages or tabs, not interleaved.
- **Don't repeat procedures.** Link to them: "Create a user as you did in the previous step."
- **Avoid** directional language ("above", "below", "right-hand side"), keyboard shortcuts inside steps, "please", and the empty lead-in "run the following command" (say what the command does instead).

## 6. Referring to UI elements

- **Bold the element's name** when you tell the reader to use it: In the **New project** window, select the **New activity** checkbox. No quotation marks, no "the ... button".
- **Match the label's capitalization** as shown, except convert all-caps labels to sentence case: Click **Refresh**, not **REFRESH**.
- **Don't use the label as a verb.** "Click **Save**", not "**Save** the settings". "In the **Name** box, enter...", not "**Name** the account".
- **Drop trailing ellipses** from labels: Click **Browse**, not **Browse...**.
- **Buttons:** use the label. "Click **OK**", not "Click the OK button". Icon buttons: name as the tooltip shows, icon first if you can render it. Never describe appearance ("the bell icon", "the button with three lines").
- **Element nouns:** window (desktop app), page (web), dialog (smaller window in front), pane or panel (region inside a window), section (labeled group of options), menu (not "drop-down"), command (an item in a menu; not "choice", "option", "menu item"), toolbar.
- **Text boxes:** "the **Owner** box" (Google Cloud says "field"). "In the **Name** box, enter `wsfc-1`."
- **Checkboxes:** "select the **X** checkbox" / "clear the **X** checkbox". Not "check/uncheck".
- **Radio buttons:** "Select **Do not remember passwords**" or "For **Startup mode**, select an option".
- **Tabs:** "the **Edit** tab".
- **Toggles:** "click the **Wi-Fi** toggle" / "to the on position". Never "toggle" as a verb.
- **Expanders:** "expander arrow", "expandable section". Not "zippy", "expando".
- **Prepositions:** _in_ a dialog, field, list, menu, pane, window; _on_ a page, tab, toolbar.
- **Verbs:** click, choose, drag, enable, enter, type, hold the pointer over, press, select, tap, turn on / turn off. _Press_ a key to cause an action; _enter_ or _type_ text.
- **State the goal, not the widget, when practical.** "Refresh the page" or "Expand the **Advanced options** section" beats a gesture-by-gesture script.

## 7. Keyboard keys

- Use `kbd` in HTML. Spell out modifier names: Control, Command, Option, Shift. No symbols (no ⌘).
- Letter keys uppercase: Control+S, not Control+s.
- Windows/Linux first, macOS in parentheses: "press Control+C (or Command+C on macOS)".
- Shift combinations: MODIFIER+Shift+KEY.

## 8. Links

- **Link text makes sense out of context.** Screen-reader users jump link to link. Never "click here", "this document", "here", or a bare URL.
- **Use the destination's title or a description**, capitalized as part of the sentence, important words first: "see [Load balancing and scaling](...)".
- **Keep link text short.** Don't link a whole sentence.
- **Same text, same target.** Don't reuse identical link text for different pages in one document.
- **Abbreviations inside the link:** "[Google Kubernetes Engine (GKE)](...)", not "[Google Kubernetes Engine](...) (GKE)".
- **Commands in links** include the description: "the [`--hostname` flag](...)", not "the [`--hostname`](...) flag".
- **Punctuation outside** the link: "see [Test your code](#test)."
- **No quotation marks** around link text.
- **Explain unexpected behavior:** downloads, new tabs, jumps within the page.
- **Separate adjacent links** with a character.

## 9. Lists and tables

- **Numbered lists** for sequences. **Bulleted lists** for everything else. **Description lists** for pairs (term + definition).
- Each procedure step is its own list item.
- Parallel grammar across items. Same sentence shape, same starting part of speech.
- **Tables:** introduce them in the text first (not all screen readers announce them). Header row and first column only as headers. Don't merge cells. Don't use tables unless they're the best fit; they are hard for screen readers. Never carry information in a table only through an image or symbol.

## 10. Accessibility

- Don't rely on color, size, location, or other visual cues as the only signal. Pair color with a text label.
- Left-align text. Don't center or justify.
- Define acronyms on first use and again if used rarely.
- Don't force line breaks inside sentences.
- Introduce interactive elements in the preceding text: "To see the requirements, expand the **Requirements** section."
- Forms: every input has a `label` element, placed outside the field. Native `button` elements for submission. Validation errors say what went wrong and how to fix it: "Name is a required field."
- Avoid unnecessary font formatting; screen readers describe it.
- Every part of a page reachable by keyboard. Mouseover behaviors get keyboard focus/blur equivalents.
- Color contrast at least 4.5:1 for text. Don't hide content with `display:none` if it should be read.
- No flashing or flickering elements.
- Avoid ableist language.
- The document should still work: without sound, with only sound, without images, without color, keyboard only, magnified, without punctuation.

## 11. Images

- Alt text on every image that summarizes its intent; empty alt for decorative images.
- Never put new information only in an image. Provide the text equivalent.
- No images of text, code, or terminal output. Use real text.
- Prefer SVG or high-resolution images.
- Captions or transcripts for video and audio.

## 12. Global audience

- Standard American spelling and punctuation.
- Avoid culturally specific references, idioms, and current pop culture.
- Unambiguous dates (month spelled out, or ISO `2026-09-17`).
- Avoid directional language; right-to-left layouts flip it.
- Short sentences translate better.
