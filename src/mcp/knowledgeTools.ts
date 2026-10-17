/**
 * Tools for a repository's review knowledge: the rules and notes reviewers
 * are told about, plus the verdicts on past findings, as one Markdown
 * document an agent can read, improve and send back.
 */
import { z } from "zod";
import { repo, tool } from "./define";

export const KNOWLEDGE_TOOLS = [
	tool({
		name: "get_knowledge",
		title: "Get repository knowledge",
		description:
			"A repository's review knowledge: `markdown` is one document with its review rules, notes and the verdicts on past findings, and rules, accountRules, notes and verdicts are the same data structured. Read it to see what CodePanel's reviewers are told about the repo, then improve it: compact, dedupe, fix stale or vague entries, and send the whole edited document back with replace_knowledge. The verdicts and learnings sections are read-only context (re-rate findings with rate_finding to change a verdict; use add_learning and rate_learning for learnings). Rules committed in `.codepanel/rules.md` are edited in the repository, not here.",
		input: { repo },
		writes: false,
		run: (c, a) => c.getKnowledge(a.repo),
	}),
	tool({
		name: "replace_knowledge",
		title: "Replace repository knowledge",
		description:
			"Replace a repository's review rules and notes with what the `## Rules` and `## Notes` sections of `markdown` contain. Send the whole document get_knowledge returned, edited: anything you leave out of those two sections is removed, so this is how you dedupe and compact. Each `###` heading is one entry; a rule heading ending in `(disabled)` is kept but not used. Other sections (verdicts, headers) are ignored. Returns counts of rules and notes added, updated and removed; an error says what did not parse and nothing changes. Changes take effect on the next review.",
		input: {
			repo,
			markdown: z
				.string()
				.min(1)
				.describe("The complete edited document, in the format get_knowledge returned"),
		},
		writes: true,
		run: (c, a) => c.replaceKnowledge(a.repo, a.markdown),
	}),
];
