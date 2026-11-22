// Checks that ast-grep resolves to the real binary in its platform package.
//
// The .bin entry is a stub until a postinstall replaces it, and Bun blocks
// that postinstall unless the host trusts the package. If the resolver fell
// back to .bin, every host without the trust entry would get a stub and
// every scan would fail.

import { expect, test } from "bun:test";
import { PACKAGE_DIR } from "../src/config.ts";
import { resolveTool } from "../src/tools.ts";

test("ast-grep resolves to the binary in its platform package, and it runs", async () => {
	const bin = resolveTool("ast-grep", PACKAGE_DIR);
	expect(bin).toContain(`@ast-grep/cli-${process.platform}-${process.arch}`);
	const version = await Bun.$`${bin} --version`.text();
	expect(version).toStartWith("ast-grep ");
});
