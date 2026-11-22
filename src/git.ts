// Checking out a base revision so the gate can measure a change rather than a
// snapshot.
//
// A detached `git worktree` is used rather than stash/checkout because the gate
// runs against a working tree that may be dirty and, in CI, is the thing being
// built. Nothing here ever mutates the caller's checkout.

import { rm } from "node:fs/promises";
import { runTool, withTempDir } from "./process.ts";

/**
 * Run git in `cwd` and return its trimmed stdout. git is not one of the pinned
 * analysers: its output here (a SHA, a worktree) does not affect the
 * measurement, only which tree is measured, so it comes from PATH.
 */
async function git(args: string[], cwd: string): Promise<string> {
	const { stdout } = await runTool({ bin: "git", args, name: "git", cwd });
	return stdout.trim();
}

/**
 * Resolve the commit a change should be compared against.
 *
 * The merge base, not the base branch tip: comparing against the tip would
 * attribute every change that landed on the base branch since this one forked
 * to the PR under review.
 *
 * When there is no merge base in the clone, the ref itself is used, with a
 * warning. A shallow CI checkout of a pull request's merge commit needs this:
 * there the base SHA is the merge base, but the clone has too little history
 * for git to prove it. On a shallow clone of a branch tip the same fallback is
 * wrong, so the warning names the fix.
 */
export async function resolveBase(ref: string, root: string): Promise<string> {
	try {
		return await git(["merge-base", "HEAD", ref], root);
	} catch {
		console.error(
			`::warning::no merge base of HEAD and ${ref} in this clone, so ${ref} itself is the base. ` +
				"That is correct for a pull request's merge commit; elsewhere, fetch more history " +
				"(fetch-depth: 0).",
		);
		return await git(["rev-parse", ref], root);
	}
}

/**
 * Run `fn` on a throwaway detached worktree of `ref`, and remove the worktree
 * afterwards, also when `fn` throws. The files must be on disk for the
 * analysers to parse them, so the checkout is a real one.
 */
export async function withWorktree<T>(
	{ ref, root }: { ref: string; root: string },
	fn: (path: string) => Promise<T>,
): Promise<T> {
	return withTempDir("slop-base-", async (path) => {
		// `git worktree add` accepts the directory because it is empty.
		await git(["worktree", "add", "--detach", "--quiet", path, ref], root);
		try {
			return await fn(path);
		} finally {
			// Prune the registration too; removing the directory alone would leave
			// a stale entry in .git/worktrees that `git worktree list` keeps showing.
			await git(["worktree", "remove", "--force", path], root).catch(async () => {
				await rm(path, { recursive: true, force: true });
				// Best effort: a leaked registration is untidy, not incorrect.
				await git(["worktree", "prune"], root).catch(() => "");
			});
		}
	});
}
