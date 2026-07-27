// Checking out a base revision so the gate can measure a change rather than a
// snapshot.
//
// A detached `git worktree` is used rather than stash/checkout because the gate
// runs against a working tree that may be dirty and, in CI, is the thing being
// built. Nothing here ever mutates the caller's checkout.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTool } from "./process.ts";

/**
 * `git` is not one of the pinned analysers — it is ambient, and its output here
 * (a SHA, a worktree) does not affect the measurement, only which tree is
 * measured. So it resolves from PATH rather than through bin.ts.
 */
async function git(args: string[], cwd: string): Promise<string> {
	const { stdout } = await runTool("git", "git", args, { cwd, root: cwd });
	return stdout.trim();
}

export async function isGitRepository(root: string): Promise<boolean> {
	try {
		return (await git(["rev-parse", "--is-inside-work-tree"], root)) === "true";
	} catch {
		return false;
	}
}

/**
 * Resolve the commit a change should be compared against.
 *
 * The merge base, not the base branch tip: comparing against the tip would
 * attribute every change that landed on the base branch since this one forked to
 * the PR under review.
 */
export async function resolveBase(ref: string, root: string): Promise<string> {
	try {
		return await git(["merge-base", "HEAD", ref], root);
	} catch {
		// No common ancestor (unrelated histories, or a shallow clone that did not
		// fetch deeply enough). Fall back to the ref itself and let the caller's
		// error surface if it is unusable.
		return await git(["rev-parse", ref], root);
	}
}

export type Worktree = {
	path: string;
	dispose: () => Promise<void>;
};

/**
 * Materialise `ref` in a throwaway worktree.
 *
 * `--detach` avoids creating a branch, and `--no-checkout` is deliberately NOT
 * used: the files have to be on disk for the analysers to parse them.
 */
export async function checkoutWorktree(ref: string, root: string): Promise<Worktree> {
	const path = await mkdtemp(join(tmpdir(), "slop-base-"));

	// mkdtemp created it, but `git worktree add` insists on making the directory
	// itself unless the existing one is empty — it is, so this succeeds.
	await git(["worktree", "add", "--detach", "--quiet", path, ref], root);

	return {
		path,
		dispose: async () => {
			// Prune the registration first; removing the directory alone would leave
			// a stale entry in .git/worktrees that `git worktree list` keeps showing.
			try {
				await git(["worktree", "remove", "--force", path], root);
			} catch {
				await rm(path, { recursive: true, force: true });
				try {
					await git(["worktree", "prune"], root);
				} catch {
					// Best effort: a leaked registration is untidy, not incorrect.
				}
			}
		},
	};
}
