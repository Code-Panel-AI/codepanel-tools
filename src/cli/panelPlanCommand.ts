/**
 * `codepanel panel recommend|apply|restore` (GET /api/v1/panels/recommend,
 * POST /panels/apply and /panels/restore). The text form lists the seats and
 * the estimate; --json prints the whole answer, including apply's undo.
 */
import type { CodePanelClient, PanelApplied, PanelRecommendation } from "../lib/client";
import {
	applyPanel,
	type GoalLevel,
	type PanelGoalArgs,
	type PanelUndo,
	recommendPanel,
	restorePanel,
} from "../lib/panelPlanClient";
import { readSource } from "./input";
import { type Reader, repoArg } from "./tokens";
import { UsageError } from "./usageError";

export type PanelPlanCommand =
	| ({ kind: "panel.recommend" } & PanelGoalArgs)
	| ({ kind: "panel.apply" } & PanelGoalArgs)
	| { kind: "panel.restore"; file: string };

const LEVELS: readonly GoalLevel[] = ["low", "medium", "high"];

function level(r: Reader, name: string): GoalLevel | undefined {
	const value = r.flag(name);
	if (value === undefined) return undefined;
	if (!(LEVELS as readonly string[]).includes(value)) {
		throw new UsageError(`--${name} must be one of: ${LEVELS.join(", ")}`);
	}
	return value as GoalLevel;
}

function maxUsd(r: Reader): number | undefined {
	const value = r.flag("max-usd-per-pr");
	if (value === undefined) return undefined;
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0)
		throw new UsageError("--max-usd-per-pr must be a positive amount");
	return n;
}

function goal(r: Reader): PanelGoalArgs {
	const repo = r.flag("repo");
	return {
		cost: level(r, "cost"),
		quality: level(r, "quality"),
		repo: repo === undefined ? undefined : repoArg(repo),
		panelId: r.flag("panel"),
		roles: r
			.flag("roles")
			?.split(",")
			.map((s) => s.trim())
			.filter(Boolean),
		provider: r.flag("provider"),
		maxUsdPerPr: maxUsd(r),
	};
}

export function parsePanelPlan(
	sub: "recommend" | "apply" | "restore",
	r: Reader,
): PanelPlanCommand {
	if (sub === "restore") return { kind: "panel.restore", file: r.required("file") };
	return { kind: sub === "recommend" ? "panel.recommend" : "panel.apply", ...goal(r) };
}

/** apply's whole --json output, or just its undo object. */
function undoFrom(text: string): PanelUndo {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new UsageError("--file must hold the JSON of panel apply --json, or its undo object");
	}
	const record = (parsed ?? {}) as { undo?: PanelUndo };
	return record.undo ?? (parsed as PanelUndo);
}

export async function executePanelPlan(command: PanelPlanCommand, client: CodePanelClient) {
	const { kind, ...args } = command;
	if (kind === "panel.recommend") return recommendPanel(client, args as PanelGoalArgs);
	if (kind === "panel.apply") return applyPanel(client, args as PanelGoalArgs);
	await restorePanel(client, undoFrom(await readSource(command.file)));
	return { ok: true };
}

const usd = (n: number | null) => (n === null ? "unpriced" : `$${n.toFixed(4)}`);

function formatRecommendation(r: PanelRecommendation): string {
	const seat = (s: PanelRecommendation["orchestrator"]) =>
		`${s.model} (${s.provider}, ${s.tier}, ${s.reasoningEffort} effort${s.source === "credits" ? ", credits" : ""}) ${usd(s.usdPerRound)}`;
	const lines = [
		`For cost ${r.goal.cost}, quality ${r.goal.quality}${r.repo ? ` on ${r.repo}` : ""}:`,
		...r.reviewers.map((s) => `  ${s.name}: ${seat(s)}`),
		`  Orchestrator: ${seat(r.orchestrator)}`,
		`About $${r.estimate.usdPerRound.toFixed(3)} a round, $${r.estimate.usdPerPr.toFixed(3)} a pull request (${r.estimate.basis === "repo_history" ? `from ${r.estimate.sampleRounds} recent rounds` : "typical round, assumed"}).`,
		...(r.comparison
			? [
					`Current panel on the same profile: ${usd(r.comparison.currentUsdPerRound)} per round; estimated reduction per PR: ${usd(r.comparison.estimatedReductionUsdPerPr)}.`,
					r.comparison.note,
				]
			: []),
		r.estimate.note,
		...r.budget.changes.map((c) => `  ${c}`),
	];
	if (r.budget.fits === false) lines.push(`Still over $${r.budget.maxUsdPerPr} a pull request.`);
	lines.push(r.target.note);
	return lines.join("\n");
}

export function formatPanelPlan(command: PanelPlanCommand, result: unknown): string {
	if (command.kind === "panel.recommend") {
		const r = result as PanelRecommendation;
		const next = r.unchanged
			? "The panel already runs this setup."
			: "Apply it with codepanel panel apply and the same options.";
		return `${formatRecommendation(r)}\n${next}`;
	}
	if (command.kind === "panel.restore") return "Panel restored.";
	const applied = result as PanelApplied;
	const done = applied.recommendation.unchanged ? "Already set up; nothing changed." : "Applied.";
	const json = JSON.stringify(applied.undo).replaceAll("'", "'\\''");
	const undo = `echo '${json}' | codepanel panel restore --file -`;
	return `${done} Panel ${applied.panelId}.\n${formatRecommendation(applied.recommendation)}\nUndo: ${undo}`;
}
