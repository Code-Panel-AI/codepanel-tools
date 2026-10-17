/**
 * Repository and panel commands: `codepanel repos …` and `codepanel panel …`.
 */
import {
	GATE_LEVELS,
	type GateLevel,
	type ReasoningEffort,
	type ReviewSwitchesUpdate,
} from "../lib/client";
import { type SettingsCommand, switchesFlag } from "./settingsCommand";
import { MAX_ROUNDS, noExtra, type Reader, repoArg } from "./tokens";
import { UsageError } from "./usageError";

export type SetupCommand =
	| { kind: "repos"; connectable: boolean }
	| { kind: "repos.connect"; repo: string }
	| { kind: "repos.disconnect"; repo: string }
	| {
			kind: "repos.set";
			repo: string;
			autoReview?: boolean;
			maxAutoRounds?: number | null;
			botMaxRounds?: number | null;
			stepBackAfterRounds?: number | null;
			panelId?: string | null;
			gate?: GateLevel;
			agentFiles?: boolean;
			inlineSuggestions?: boolean;
			reviewSwitches?: ReviewSwitchesUpdate;
	  }
	| { kind: "panel" }
	| { kind: "panel.roles" }
	| {
			kind: "panel.addReviewer";
			panelId?: string;
			role?: string;
			provider?: string;
			modelId?: string;
			reasoningEffort?: ReasoningEffort;
			name?: string;
			systemPrompt?: string;
	  }
	| { kind: "panel.removeReviewer"; panelId?: string; agentId: string }
	| {
			kind: "panel.updateMember";
			agentId: string;
			provider?: string;
			modelId?: string;
			reasoningEffort?: ReasoningEffort;
			systemPrompt?: string;
	  }
	| {
			kind: "panel.orchestrator";
			panelId?: string;
			provider: string;
			modelId: string;
			reasoningEffort?: ReasoningEffort;
	  }
	| { kind: "panel.set"; panelId?: string; name?: string; budgetUsd?: number | null };

function onOff(name: string, value: string | undefined): boolean | undefined {
	if (value === undefined) return undefined;
	if (value === "on" || value === "true") return true;
	if (value === "off" || value === "false") return false;
	throw new UsageError(`--${name} must be on or off`);
}

function budget(value: string | undefined): number | null | undefined {
	if (value === undefined) return undefined;
	if (value === "none") return null;
	const n = Number(value);
	if (!Number.isFinite(n) || n <= 0)
		throw new UsageError("--budget must be a positive amount or none");
	return n;
}

/** A rounds flag: a whole number from `min` to 50, or `clear` (null) to drop the setting. */
function roundsFlag(r: Reader, name: string, min: number, clear: string) {
	const value = r.flag(name);
	if (value === undefined) return undefined;
	if (value === clear) return null;
	// Number("") is 0, which would quietly set a bot ceiling of none.
	const n = value.trim() === "" ? Number.NaN : Number(value);
	if (!Number.isInteger(n) || n < min || n > MAX_ROUNDS) {
		throw new UsageError(
			`--${name} must be a whole number from ${min} to ${MAX_ROUNDS} or ${clear}`,
		);
	}
	return n;
}

/** `--gate`: which findings must be answered before the commit status passes. */
function gateLevel(value: string | undefined): GateLevel | undefined {
	if (value === undefined) return undefined;
	if (!(GATE_LEVELS as readonly string[]).includes(value)) {
		throw new UsageError(`--gate must be one of ${GATE_LEVELS.join(", ")}`);
	}
	return value as GateLevel;
}

export function parseRepos(
	sub: string | undefined,
	args: string[],
	r: Reader,
): SetupCommand | SettingsCommand {
	noExtra(sub === undefined ? args : args.slice(1));
	switch (sub) {
		case undefined:
			return { kind: "repos", connectable: r.bool("connectable") };
		case "connect":
			return { kind: "repos.connect", repo: repoArg(args[0]) };
		case "disconnect":
			return { kind: "repos.disconnect", repo: repoArg(args[0]) };
		case "set": {
			const panel = r.flag("panel");
			return {
				kind: "repos.set",
				repo: repoArg(args[0]),
				autoReview: onOff("auto-review", r.flag("auto-review")),
				maxAutoRounds: roundsFlag(r, "max-auto-rounds", 1, "none"),
				botMaxRounds: roundsFlag(r, "bot-max-rounds", 0, "default"),
				stepBackAfterRounds: roundsFlag(r, "step-back-after-rounds", 0, "default"),
				panelId: panel === "none" ? null : panel,
				gate: gateLevel(r.flag("gate")),
				inlineSuggestions: onOff("inline-suggestions", r.flag("inline-suggestions")),
				agentFiles: onOff("agent-files", r.flag("agent-files")),
				reviewSwitches: switchesFlag(r.flag("switches")),
			};
		}
		case "switches":
			return { kind: "repos.switches", repo: repoArg(args[0]) };
		default:
			throw new UsageError(`unknown repos command: ${sub}`);
	}
}

/**
 * With --role, the role fills in the name, instructions and effort, and the
 * model is suggested on the role's tier unless --provider or --model is given.
 * Without one, both are required, as before roles existed.
 */
function parseAddReviewer(r: Reader): SetupCommand {
	const role = r.flag("role");
	const provider = role ? r.flag("provider") : r.required("provider");
	const modelId = role ? r.flag("model") : r.required("model");
	if (modelId && !provider) throw new UsageError("--model needs --provider");
	return {
		kind: "panel.addReviewer",
		panelId: r.flag("panel"),
		role,
		provider,
		modelId,
		reasoningEffort: r.effort(),
		name: r.flag("name"),
		systemPrompt: r.flag("prompt"),
	};
}

/** `args` is what follows `panel`: a subcommand, which takes no positionals. */
export function parsePanel(args: string[], r: Reader): SetupCommand {
	const [sub, ...extra] = args;
	noExtra(extra);
	switch (sub) {
		case undefined:
			return { kind: "panel" };
		case "roles":
			return { kind: "panel.roles" };
		case "add-reviewer":
			return parseAddReviewer(r);
		case "remove-reviewer":
			return {
				kind: "panel.removeReviewer",
				panelId: r.flag("panel"),
				agentId: r.reviewerId(),
			};
		case "update-member":
			return {
				kind: "panel.updateMember",
				agentId: r.reviewerId(),
				provider: r.flag("provider"),
				modelId: r.flag("model"),
				reasoningEffort: r.effort(),
				systemPrompt: r.flag("prompt"),
			};
		case "orchestrator":
			return {
				kind: "panel.orchestrator",
				panelId: r.flag("panel"),
				provider: r.required("provider"),
				modelId: r.required("model"),
				reasoningEffort: r.effort(),
			};
		case "set":
			return {
				kind: "panel.set",
				panelId: r.flag("panel"),
				name: r.flag("name"),
				budgetUsd: budget(r.flag("budget")),
			};
		default:
			throw new UsageError(`unknown panel command: ${sub}`);
	}
}
