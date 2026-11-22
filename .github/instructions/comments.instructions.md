---
applyTo: "**/*.ts,**/*.tsx,**/*.swift"
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.swift"
---

# Comments

A comment must answer a question that the code cannot answer. A comment that tells what the code does is noise.

## Write the why, not the what

- Do not restate the signature. `// returns the user` above `function getUser(): User` is a finding. Delete the comment and improve the name.
- Record decisions in comments. Tell why the code has this shape, what breaks if the order changes, and which incident caused a guard.
- Tell what the platform does that forced a workaround. The code cannot show a fact about a different system.
- Put one short block above a function or a module. Do not scatter line comments through the body.
- Name the issue, the postmortem or the document behind a constraint. A reader cannot verify a reason that has no source.

## Keep comments true

- A comment that the code contradicts is worse than no comment. Change the comment in the same diff as the code.
- Do not keep code in comments. Git keeps the history.
- The verbosity metric does not count comment lines. A real explanation costs nothing at the gate, and a deleted comment gains nothing.

## Header and doc comments

- Each new file starts with a header comment that tells what the file is for.
- Each new or changed type and member has a doc comment that tells its purpose: what it does and why, not how.
- On an exported function whose contract is not clear from its name and types, the doc comment also gives:
  - the failure modes,
  - what the function does not do,
  - which lifetime the caller owns.
