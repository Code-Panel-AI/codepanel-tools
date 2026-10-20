import { expect, test } from "bun:test";
import { parseArgs } from "./args";

test("spend and optimization require an explicit repository and reject extra arguments", () => {
	for (const kind of ["spend", "optimize"] as const) {
		expect(parseArgs([kind, "repackify/repackify", "--json"])).toEqual({
			command: { kind, repo: "repackify/repackify" },
			json: true,
		});
		expect(() => parseArgs([kind])).toThrow();
		expect(() => parseArgs([kind, "bad"])).toThrow();
		expect(() => parseArgs([kind, "repackify/repackify", "extra"])).toThrow();
	}
});
