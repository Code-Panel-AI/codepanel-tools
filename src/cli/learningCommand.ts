/** Run and print the learning commands (learningArgs.ts). */
import type { CodePanelClient, Learning, LearningAdded, LearningRated } from "../lib/client";
import type { LearningCommand } from "./learningArgs";

export function executeLearning(
	command: LearningCommand,
	client: CodePanelClient,
): Promise<unknown> {
	const agent =
		command.kind === "learnings" ? undefined : (command.agent ?? process.env.CODEPANEL_AGENT);
	switch (command.kind) {
		case "learnings":
			return client.listLearnings(command.repo);
		case "learn": {
			const { kind: _, ...args } = command;
			return client.addLearning({ ...args, agent });
		}
		case "learning": {
			const { kind: _, ...args } = command;
			return client.rateLearning({ ...args, agent });
		}
	}
}

function state(l: Learning): string {
	const s = l.state;
	switch (s.status) {
		case "active":
			return `active (by ${s.by})`;
		case "candidate":
			return `candidate, needs ${s.needs}`;
		case "off":
			return `off (by ${s.by}${s.reason ? `, ${s.reason}` : ""})`;
		case "expired":
			return "expired (rate it up to re-confirm)";
	}
}

/** Where a drafted learning came from, so it can be checked and turned off. */
function drafted(l: Learning): string {
	if (!l.drafted) return "";
	return `\n    drafted from ${l.drafted.evidence.map((e) => e.label).join(", ")}`;
}

function formatList(learnings: Learning[]): string {
	if (learnings.length === 0)
		return "No learnings yet. Add one with: codepanel learn <owner/name> <text>";
	return learnings
		.map(
			(l) =>
				`${l.ref}  ${state(l)}  ${l.scope || "(whole repository)"}\n    ${l.text}${drafted(l)}`,
		)
		.join("\n");
}

export function formatLearning(command: LearningCommand, result: unknown): string {
	switch (command.kind) {
		case "learnings":
			return formatList(result as Learning[]);
		case "learn":
			return `Recorded ${(result as LearningAdded).ref}.`;
		case "learning": {
			const r = result as LearningRated;
			return `Rated ${r.target} ${command.rating} (${r.outcome === "created" ? "new" : "replaced your earlier rating"}).`;
		}
	}
}
