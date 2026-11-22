// Checking out a base revision so the gate can measure a change rather than a
// snapshot.
//
// A detached `git worktree` is used rather than stash/checkout because the gate
// runs against a working tree that may be dirty and, in CI, is the thing being
// built. Nothing here ever mutates the caller's checkout.

import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { runTool, ToolExitError, withTempDir } from "./process.ts";

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
 * When git finds no merge base (exit 1), the ref itself is used, with a
 * warning. A shallow CI checkout of a pull request's merge commit needs this:
 * there the base SHA is the merge base, but the clone has too little history
 * for git to prove it. On a shallow clone of a branch tip the same fallback is
 * wrong, so the warning names the fix. Any other failure, such as a bad ref
 * or a folder that is not a repository (exit 128), is an error.
 */
export async function resolveBase(ref: string, root: string): Promise<string> {
	try {
		return await git(["merge-base", "HEAD", ref], root);
	} catch (err) {
		if (!(err instanceof ToolExitError && err.exitCode === 1)) throw err;
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
 *
 * `fn` gets the worktree path that matches `root`. A worktree checks out the
 * whole repository, so when `root` is a subfolder such as `packages/app`, the
 * base must be measured at that same subfolder, or the include globs would
 * match a different tree than on the head.
 */
export async function withWorktree<T>(
	{ ref, root }: { ref: string; root: string },
	fn: (path: string) => Promise<T>,
): Promise<T> {
	return withTempDir("slop-base-", async (path) => {
		// `git worktree add` accepts the directory because it is empty.
		await git(["worktree", "add", "--detach", "--quiet", path, ref], root);
		// resolve(), not join(): the prefix ends in "/", and a trailing slash
		// would no longer match the root-relative paths the analysers report.
		const prefix = await git(["rev-parse", "--show-prefix"], root);
		try {
			return await fn(resolve(path, prefix));
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
