import { describe, expect, test } from "bun:test";
import { parseArgs, USAGE } from "./args";
import { prArg, tokenize } from "./tokens";

const cmd = (line: string) => parseArgs(line.split(" ").filter(Boolean)).command;

describe("boolean options with an inline value", () => {
	test("false turns the option off, so --trigger=false does not start a paid review", () => {
		for (const off of ["false", "FALSE", "0"]) {
			expect(cmd(`review acme/app#1 --trigger=${off}`)).toMatchObject({ trigger: false });
		}
		expect(cmd("review acme/app#1 --wait=false")).toMatchObject({ wait: false });
		expect(cmd("review acme/app#1 --wait=0")).toMatchObject({ wait: false });
		expect(cmd("findings acme/app#1 --all=false")).toMatchObject({ all: false });
		expect(cmd("repos --connectable=false")).toEqual({ kind: "repos", connectable: false });
		expect(parseArgs(["keys", "--json=false"]).json).toBe(false);
	});

	test("true and 1 turn it on", () => {
		expect(cmd("review acme/app#1 --trigger=true")).toMatchObject({ trigger: true });
		expect(cmd("review acme/app#1 --wait=TRUE")).toMatchObject({ wait: true });
		expect(cmd("findings acme/app#1 --all=1")).toMatchObject({ all: true });
		expect(parseArgs(["keys", "--json=true"]).json).toBe(true);
	});

	test("the last one wins", () => {
		expect(cmd("review acme/app#1 --trigger --trigger=false")).toMatchObject({ trigger: false });
		expect(cmd("review acme/app#1 --trigger=false --trigger")).toMatchObject({ trigger: true });
	});

	test("anything else is a usage error", () => {
		for (const bad of ["no", "yes", "", "2", "maybe"]) {
			expect(() => parseArgs(["review", "acme/app#1", `--trigger=${bad}`])).toThrow(
				"--trigger must be true or false",
			);
		}
	});

	test("an option set to false still has to belong to the command", () => {
		expect(() => cmd("whoami --all=false")).toThrow("unknown option --all");
	});
});

describe("unknown options", () => {
	test("are named as unknown instead of swallowing the next word", () => {
		expect(() => cmd("whoami --jsn")).toThrow("unknown option --jsn");
		expect(() => cmd("--verbose review acme/app#1")).toThrow("unknown option --verbose");
		expect(() => cmd("review acme/app#1 --verbose")).toThrow("unknown option --verbose");
		expect(() => cmd("review acme/app#1 --nope=1")).toThrow("unknown option --nope");
		for (const word of ["constructor", "toString", "__proto__"]) {
			expect(() => cmd(`review acme/app#1 --trigger=${word}`)).toThrow("must be true or false");
		}
	});

	test("a single-dash option is a typo, not an argument; `-` alone is still stdin", () => {
		expect(() => cmd("whoami -x")).toThrow("unknown option -x");
		expect(() => cmd("session s1 -json")).toThrow("unknown option -json");
		expect(tokenize(["--note", "-fix"]).flags.get("note")).toBe("-fix");
		for (const word of ["-x=1", "-x.", "-fix!"]) {
			expect(() => parseArgs(["whoami", word])).toThrow(`unknown option ${word}`);
		}
		expect(cmd("knowledge set acme/app -")).toMatchObject({ source: "-" });
		expect(() => cmd("ask acme/app#1 why -x")).toThrow("put text that starts with a dash after --");
		const ask = (...words: string[]) => parseArgs(["ask", "acme/app#1", ...words]).command;
		expect(ask("-fix this?")).toMatchObject({ question: "-fix this?" });
		expect(ask("--", "-x", "--wait", "why?")).toMatchObject({ question: "-x --wait why?" });
		expect(ask("why -x")).toMatchObject({ question: "why -x" });
	});

	test("a known option that takes a value still reads the next word", () => {
		expect(tokenize(["--panel", "p1", "review"]).positionals).toEqual(["review"]);
		expect(() => tokenize(["--panel"])).toThrow("--panel needs a value");
		expect(() => tokenize(["--panel", "--wait"])).toThrow("--panel needs a value");
	});
});

describe("-h", () => {
	test("prints help like --help", () => {
		expect(cmd("-h")).toEqual({ kind: "help" });
		expect(cmd("review -h")).toEqual({ kind: "help" });
		expect(cmd("--help")).toEqual({ kind: "help" });
		expect(cmd("review --help=false acme/app#1")).toMatchObject({ kind: "review" });
	});
});

describe("prArg", () => {
	test("a pull request number is a positive whole number", () => {
		expect(prArg(["acme/app#12", "x"])).toEqual({ repo: "acme/app", pr: 12, rest: ["x"] });
		expect(prArg(["acme/app", "12"])).toEqual({ repo: "acme/app", pr: 12, rest: [] });
		for (const bad of [["acme/app#0"], ["acme/app", "0"], ["acme/app#00"]]) {
			expect(() => prArg(bad)).toThrow("positive whole number");
		}
		expect(() => prArg(["acme/app#99999999999999999999"])).toThrow("positive whole number");
		expect(() => prArg(["acme/app#-1"])).toThrow("owner/name#123");
	});

	test("rest holds only what was given", () => {
		expect(prArg(["acme/app#12"]).rest).toEqual([]);
	});
});

// Every invocation USAGE and the CLI docs show must keep parsing.
const PLACEHOLDERS: Record<string, string> = {
	"owner/name#123": "acme/app#12",
	"owner/name": "acme/app",
	findingId: "abc123",
	F3: "F3",
	L3: "L3",
	file: "notes.md",
	commit: "abc1234",
	NAME: "REVIEW_REVIEWER_TOOLS",
	e: "high",
	r: "false_positive",
	n: "3",
	usd: "5",
	amountUsd: "5",
	amount: "5",
	"YYYY-MM-DD": "2027-01-31",
	secs: "30",
	p: "x",
	m: "x",
	text: "x",
	name: "x",
	site_url: "https://x.convex.site",
};
/** One word of a usage line as something typeable: the first alternative, placeholders filled. */
function sample(word: string): string {
	const wrapped = word.startsWith("<");
	const first = (word.split("|")[0] ?? "").replace(/^<|>$/g, "").replace(/\.\.\.$/, "");
	const [name = "", value] = first.split("=");
	const filled = (key: string) => PLACEHOLDERS[key] ?? (wrapped ? "x" : key);
	return value === undefined ? filled(name) : `${filled(name)}=${filled(value)}`;
}

function usageLines(): string[] {
	const joined = USAGE.replace(/\n {10,}/g, " ").replace("<site url>", "<site_url>");
	return joined.split("\n").filter((l) => l.startsWith("  codepanel "));
}

function invocations(line: string, withOptional: boolean): string[] {
	let text = (line.trim().split(" | ")[0] ?? "").replace(/^codepanel /, "");
	text = withOptional ? text.replace(/[[\]]/g, "") : text.replace(/\[[^[\]]*\]/g, "");
	while (text.includes("[")) text = text.replace(/\[[^[\]]*\]/g, "");
	return text
		.split(/\s+/)
		.filter(Boolean)
		.map((w) => sample(w));
}

describe("every documented invocation parses", () => {
	test("USAGE, with and without its optional parts", () => {
		const lines = usageLines();
		expect(lines.length).toBeGreaterThan(30);
		for (const line of lines) {
			// `budget set` is only meaningful with an option, so its bare form is refused.
			const bare = line.includes("budget set") ? [true] : [false, true];
			for (const withOptional of bare) {
				const argv = invocations(line, withOptional);
				const parsed = (): unknown => parseArgs(argv);
				expect(parsed, argv.join(" ")).not.toThrow();
				expect(parseArgs(argv).command.kind, argv.join(" ")).not.toBe("help");
			}
		}
	});
});
