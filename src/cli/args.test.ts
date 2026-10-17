import { describe, expect, test } from "bun:test";
import { parseArgs } from "./args";

const cmd = (line: string) => parseArgs(line.split(" ").filter(Boolean)).command;

describe("parseArgs", () => {
	test("help by default", () => {
		expect(cmd("")).toEqual({ kind: "help" });
		expect(cmd("repos --help")).toEqual({ kind: "help" });
	});

	test("repositories", () => {
		expect(cmd("repos --connectable")).toEqual({ kind: "repos", connectable: true });
		expect(cmd("repos connect acme/app")).toEqual({ kind: "repos.connect", repo: "acme/app" });
		expect(cmd("repos set acme/app --auto-review off --panel none")).toEqual({
			kind: "repos.set",
			repo: "acme/app",
			autoReview: false,
			panelId: null,
		});
		expect(cmd("repos set acme/app --max-auto-rounds 2")).toMatchObject({ maxAutoRounds: 2 });
		expect(cmd("repos set acme/app --gate all")).toMatchObject({ gate: "all" });
		expect(() => cmd("repos set acme/app --gate some")).toThrow("--gate");
		expect(cmd("repos set acme/app --agent-files off")).toMatchObject({ agentFiles: false });
		expect(cmd("repos set acme/app --max-auto-rounds none")).toMatchObject({ maxAutoRounds: null });
		expect(() => cmd("repos set acme/app --max-auto-rounds 0")).toThrow("--max-auto-rounds");
		expect(cmd("repos set acme/app --bot-max-rounds 0")).toMatchObject({ botMaxRounds: 0 });
		expect(cmd("repos set acme/app --bot-max-rounds default")).toMatchObject({
			botMaxRounds: null,
		});
		expect(() => cmd("repos set acme/app --bot-max-rounds 51")).toThrow("--bot-max-rounds");
		const blank = () => parseArgs(["repos", "set", "acme/app", "--bot-max-rounds", " "]);
		expect(blank).toThrow("--bot-max-rounds");
		expect(cmd("repos set acme/app --step-back-after-rounds 0")).toMatchObject({
			stepBackAfterRounds: 0,
		});
		expect(cmd("repos set acme/app --step-back-after-rounds default")).toMatchObject({
			stepBackAfterRounds: null,
		});
		expect(() => cmd("repos set acme/app --step-back-after-rounds 51")).toThrow(
			"--step-back-after-rounds",
		);
		expect(cmd("repos set acme/app --inline-suggestions on")).toMatchObject({
			inlineSuggestions: true,
		});
		expect(() => cmd("repos set acme/app --inline-suggestions yes")).toThrow(
			"--inline-suggestions must be on or off",
		);
	});

	test("panel editing", () => {
		expect(
			cmd("panel add-reviewer --provider openai --model gpt-5 --effort high --name=Sharp"),
		).toEqual({
			kind: "panel.addReviewer",
			panelId: undefined,
			provider: "openai",
			modelId: "gpt-5",
			reasoningEffort: "high",
			name: "Sharp",
			systemPrompt: undefined,
		});
		expect(cmd("panel add-reviewer --role security")).toEqual({
			kind: "panel.addReviewer",
			role: "security",
		});
		expect(cmd("panel add-reviewer --role performance --provider google")).toMatchObject({
			role: "performance",
			provider: "google",
			modelId: undefined,
		});
		expect(cmd("panel roles")).toEqual({ kind: "panel.roles" });
		expect(cmd("panel set --budget none")).toMatchObject({ kind: "panel.set", budgetUsd: null });
		expect(cmd("panel set --budget 2.5")).toMatchObject({ budgetUsd: 2.5 });
	});

	test("review --wait takes an optional timeout in seconds", () => {
		expect(cmd("review acme/app#12 --wait")).toMatchObject({ wait: true, trigger: false });
		expect(cmd("review acme/app#12 --trigger --wait --timeout 90")).toMatchObject({
			wait: true,
			trigger: true,
			timeoutSeconds: 90,
		});
		expect(() => cmd("review acme/app#12 --timeout 90")).toThrow("only go with --wait");
		expect(cmd("review acme/app#12 --wait --sha abc1234")).toMatchObject({ sha: "abc1234" });
		expect(() => cmd("review acme/app#12 --wait --sha main")).toThrow("commit sha");
		expect(() => cmd("review acme/app#12 --wait --timeout soon")).toThrow("positive number");
		expect(() => cmd("review acme/app#12 --wait --timeout 0")).toThrow("positive number");
	});

	test("login and logout", () => {
		expect(cmd("login")).toEqual({
			kind: "login",
			url: undefined,
			scopes: undefined,
			name: undefined,
		});
		expect(cmd("login --url https://x.convex.site --scopes read,repos:write --name ci")).toEqual({
			kind: "login",
			url: "https://x.convex.site",
			scopes: "read,repos:write",
			name: "ci",
		});
		expect(cmd("logout")).toEqual({ kind: "logout" });
		expect(() => cmd("login --bogus 1")).toThrow("unknown option --bogus");
	});

	test("a panel member is named with --reviewer, or the older --agent", () => {
		expect(cmd("panel remove-reviewer --reviewer r1")).toMatchObject({ agentId: "r1" });
		expect(cmd("panel update-member --agent r2 --effort low")).toMatchObject({
			agentId: "r2",
			reasoningEffort: "low",
		});
		expect(() => cmd("panel remove-reviewer")).toThrow("--reviewer is required");
	});

	test("pull requests as owner/name#123 or owner/name 123", () => {
		expect(cmd("review acme/app#12 --trigger")).toEqual({
			kind: "review",
			repo: "acme/app",
			pr: 12,
			trigger: true,
			panelId: undefined,
			wait: false,
			timeoutSeconds: undefined,
		});
		expect(cmd("findings acme/app 12 --all")).toEqual({
			kind: "findings",
			repo: "acme/app",
			pr: 12,
			all: true,
		});
		expect(cmd("findings dismiss abc123")).toEqual({
			kind: "findings.dismiss",
			findingId: "abc123",
		});
		expect(cmd("findings dismiss abc123 --reason false_positive")).toEqual({
			kind: "findings.dismiss",
			findingId: "abc123",
			reason: "false_positive",
		});
		expect(cmd("findings dismiss abc123 --agent codex --note why")).toMatchObject({
			agent: "codex",
			note: "why",
		});
		expect(() => cmd("findings dismiss abc123 --reason nope")).toThrow("--reason must be one of");
		expect(cmd("findings reopen acme/app#12 F3")).toEqual({
			kind: "findings.reopen",
			repo: "acme/app",
			pr: 12,
			ref: "F3",
		});
		expect(cmd("findings reopen abc123")).toEqual({ kind: "findings.reopen", findingId: "abc123" });
		expect(() => cmd("findings reopen acme/app#12")).toThrow("expected a finding like F3");
		expect(() => cmd("findings reopen")).toThrow("expected a finding id");
	});

	test("--json is global", () => {
		expect(parseArgs(["keys", "--json"])).toEqual({ command: { kind: "keys" }, json: true });
	});

	test("mistakes are usage errors, not silent defaults", () => {
		for (const line of [
			"frobnicate",
			"repos connect not-a-repo",
			"panel add-reviewer --provider openai",
			"panel add-reviewer --provider openai --model m --effort extreme",
			"review acme/app",
			"repos --conectable",
			"sessions --status done",
			"sessions --limit 0",
			"panel set --budget -3",
			"panel add-reviewer --provider",
			"panel add-reviewer",
			"panel add-reviewer --role security --model m",
		]) {
			expect(() => cmd(line)).toThrow();
		}
	});

	test("feedback", () => {
		expect(
			cmd("feedback acme/app#7 F3 down --reason false-positive --note why --agent codex"),
		).toEqual({
			kind: "feedback",
			repo: "acme/app",
			pr: 7,
			ref: "F3",
			rating: "down",
			reason: "false_positive",
			note: "why",
			agent: "codex",
		});
		expect(cmd("feedback acme/app 7 review up")).toMatchObject({ ref: "review", rating: "up" });
		expect(() => cmd("feedback acme/app#7 F3")).toThrow("expected up or down");
		expect(() => cmd("feedback acme/app#7 #3 up")).toThrow("expected a finding like F3");
		expect(() => cmd("feedback acme/app#7 F3 up --reason meh")).toThrow("--reason must be one of");
	});

	test("knowledge prints a repo's document or replaces it from a file or stdin", () => {
		expect(cmd("knowledge acme/app")).toEqual({ kind: "knowledge", repo: "acme/app" });
		expect(cmd("knowledge set acme/app notes.md")).toEqual({
			kind: "knowledge.set",
			repo: "acme/app",
			source: "notes.md",
		});
		expect(cmd("knowledge set acme/app -")).toMatchObject({ source: "-" });
		expect(() => cmd("knowledge")).toThrow("owner/name");
		expect(() => cmd("knowledge set acme/app")).toThrow("Markdown file");
		expect(() => cmd("knowledge set notes.md")).toThrow("owner/name");
	});
});

test("rounds takes a count, +N, stop or reset for one pull request", () => {
	expect(parseArgs(["rounds", "acme/app#7", "+1"]).command).toEqual({
		kind: "rounds",
		repo: "acme/app",
		pr: 7,
		rounds: "+1",
	});
	expect(parseArgs(["rounds", "acme/app", "7", "stop"]).command).toMatchObject({ rounds: "stop" });
	expect(() => parseArgs(["rounds", "acme/app#7"])).toThrow("number of rounds");
});

test("ask takes an optional finding and the rest as the question", () => {
	expect(cmd("ask acme/app#7 f3 is renew() called first? --agent codex --timeout 60")).toEqual({
		kind: "ask",
		repo: "acme/app",
		pr: 7,
		ref: "F3",
		question: "is renew() called first?",
		agent: "codex",
		timeoutSeconds: 60,
	});
	expect(cmd("ask acme/app 7 why so slow?")).toMatchObject({ question: "why so slow?" });
	expect(() => cmd("ask acme/app#7 F3")).toThrow("expected a question");
});

test("learnings, learn and learning name a repository and a learning like L3", () => {
	expect(cmd("learnings acme/app")).toEqual({ kind: "learnings", repo: "acme/app" });
	expect(cmd("learn acme/app renew() goes first --scope convex/reviews/ --pr 7")).toEqual({
		kind: "learn",
		repo: "acme/app",
		text: "renew() goes first",
		scope: "convex/reviews/",
		pr: 7,
		agent: undefined,
	});
	expect(cmd("learning acme/app l3 down --reason false-positive --agent codex")).toMatchObject({
		kind: "learning",
		ref: "L3",
		rating: "down",
		reason: "false_positive",
		agent: "codex",
	});
	expect(() => cmd("learn acme/app")).toThrow("text");
	expect(() => cmd("learning acme/app 3 up")).toThrow("L3");
	expect(() => cmd("learning acme/app L3 maybe")).toThrow("up or down");
	expect(() => cmd("learn acme/app x --pr abc")).toThrow("--pr");
	expect(() => cmd("frobnicate")).toThrow("unknown command: frobnicate");
});

test("review --traceparent goes with --trigger", () => {
	const tp = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
	expect(cmd(`review acme/app#12 --trigger --traceparent ${tp}`)).toMatchObject({
		traceparent: tp,
	});
	expect(() => cmd(`review acme/app#12 --traceparent ${tp}`)).toThrow("--trigger");
});

test("quality names a repository and an optional window in days", () => {
	expect(cmd("quality acme/app")).toEqual({ kind: "quality", repo: "acme/app", days: undefined });
	expect(cmd("quality acme/app --days 14")).toMatchObject({ days: 14 });
	expect(() => cmd("quality acme/app --days soon")).toThrow("--days");
	expect(() => cmd("quality")).toThrow("owner/name");
});

describe("extra positionals are usage errors", () => {
	test("each command refuses what it has no use for", () => {
		for (const line of [
			"whoami extra",
			"models extra",
			"keys extra",
			"logout extra",
			"login extra",
			"repos connect acme/app extra",
			"repos disconnect acme/app extra",
			"repos set acme/app extra",
			"repos switches acme/app extra",
			"panel roles extra",
			"panel set extra",
			"sessions extra",
			"session abc junk",
			"review acme/app#1 junk",
			"review acme/app 1 extra",
			"findings acme/app#1 junk",
			"findings dismiss abc junk",
			"findings reopen acme/app#1 F3 junk",
			"feedback acme/app#1 F3 up junk",
			"feedback acme/app 1 review down junk",
			"rounds acme/app#1 3 junk",
			"handoff acme/app#1 junk --text hi",
			"quality acme/app junk",
			"budget acme/app junk",
			"knowledge acme/app junk",
			"knowledge set acme/app notes.md junk",
			"learnings acme/app junk",
			"learning acme/app L3 up junk",
		]) {
			expect(() => cmd(line), line).toThrow(/unexpected argument|takes --repo|give the handoff/);
		}
	});

	test("free text is still free text", () => {
		expect(cmd("learn acme/app use the helper")).toMatchObject({ text: "use the helper" });
		expect(cmd("ask acme/app#1 what does this do")).toMatchObject({
			question: "what does this do",
		});
	});
});

test("review and findings need a positive pull request number", () => {
	expect(() => cmd("review acme/app#0")).toThrow("positive whole number");
	expect(() => cmd("findings acme/app 0")).toThrow("positive whole number");
});

test("review --panel only goes with --trigger", () => {
	expect(() => cmd("review acme/app#1 --panel p1")).toThrow("--panel only goes with --trigger");
	expect(() => cmd("review acme/app#1 --wait --panel p1")).toThrow("--panel");
	expect(cmd("review acme/app#1 --trigger --panel p1")).toMatchObject({
		trigger: true,
		panelId: "p1",
	});
});

test("rounds checks its argument", () => {
	for (const ok of ["3", "+2", "0", "50", "stop", "STOP", "reset", "more", "default"]) {
		expect(cmd(`rounds acme/app#1 ${ok}`)).toMatchObject({ kind: "rounds" });
	}
	for (const bad of ["banana", "51", "+0", "+51", "-1", "1.5", "+"]) {
		expect(() => cmd(`rounds acme/app#1 ${bad}`), bad).toThrow("rounds must be");
	}
});
