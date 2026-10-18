/**
 * `codepanel budget …` (GET and POST /api/v1/budget), `codepanel
 * auto-reload …` (GET and POST /api/v1/auto-reload) and a repository's
 * review switches (`repos switches`, `repos set --switches`). The text
 * form says what changed; --json prints the whole state before and after.
 */
import {
	type AutoReload,
	type AutoReloadChange,
	type BudgetChange,
	type BudgetState,
	type CodePanelClient,
	REPO_SWITCHES,
	type RepoSwitch,
	type ReviewSwitchesUpdate,
	type ReviewSwitchStates,
} from "../lib/client";
import { noExtra, type Reader, repoArg } from "./tokens";
import { UsageError } from "./usageError";

export type SettingsCommand =
	| { kind: "budget"; repo?: string }
	| {
			kind: "budget.set";
			monthlyUsd?: number | "default" | null;
			repo?: string;
			capUsd?: number | null;
	  }
	| { kind: "repos.switches"; repo: string }
	| { kind: "autoReload" }
	| {
			kind: "autoReload.set";
			enabled?: boolean;
			thresholdUsd?: number;
			packUsd?: number;
			monthlyCapUsd?: number;
	  };

function amount(flag: string, value: string): number {
	const n = value.trim() === "" ? Number.NaN : Number(value);
	if (!Number.isFinite(n) || n <= 0) throw new UsageError(`--${flag} must be a positive amount`);
	return n;
}

/** `--cap 20|none`; absent leaves the limit. */
function capFlag(r: Reader): number | null | undefined {
	const value = r.flag("cap");
	if (value === undefined) return undefined;
	return value === "none" ? null : amount("cap", value);
}

/** `--monthly 50|default|none`; absent leaves the budget. */
function monthlyFlag(r: Reader): number | "default" | null | undefined {
	const value = r.flag("monthly");
	if (value === undefined || value === "default") return value;
	return value === "none" ? null : amount("monthly", value);
}

export function parseBudget(positionals: string[], r: Reader): SettingsCommand {
	const [sub, ...rest] = positionals;
	if (sub !== "set") return { kind: "budget", repo: sub === undefined ? undefined : repoArg(sub) };
	if (rest.length > 0) throw new UsageError("budget set takes --repo, not a positional repository");
	const repoFlag = r.flag("repo");
	const command = {
		kind: "budget.set" as const,
		monthlyUsd: monthlyFlag(r),
		repo: repoFlag === undefined ? undefined : repoArg(repoFlag),
		capUsd: capFlag(r),
	};
	if (command.capUsd !== undefined && !command.repo) throw new UsageError("--cap needs --repo");
	if (command.monthlyUsd === undefined && command.capUsd === undefined) {
		throw new UsageError("budget set needs --monthly, or --repo with --cap");
	}
	return command;
}

function optionalAmount(r: Reader, flag: string): number | undefined {
	const value = r.flag(flag);
	return value === undefined ? undefined : amount(flag, value);
}

const AUTO_RELOAD_SUBCOMMANDS = ["on", "off", "set"];

/** `auto-reload`, or `auto-reload on|off|set [--threshold <usd>] [--pack <usd>] [--cap <usd>]`. */
export function parseAutoReload(positionals: string[], r: Reader): SettingsCommand {
	const [sub, ...rest] = positionals;
	noExtra(rest);
	if (sub === undefined) return { kind: "autoReload" };
	if (!AUTO_RELOAD_SUBCOMMANDS.includes(sub))
		throw new UsageError("auto-reload takes on, off or set");
	const values = {
		thresholdUsd: optionalAmount(r, "threshold"),
		packUsd: optionalAmount(r, "pack"),
		monthlyCapUsd: optionalAmount(r, "cap"),
	};
	if (sub === "set" && Object.values(values).every((v) => v === undefined)) {
		throw new UsageError("auto-reload set needs --threshold, --pack or --cap");
	}
	return { kind: "autoReload.set", enabled: sub === "set" ? undefined : sub === "on", ...values };
}

const SWITCH_VALUES: Record<string, boolean | null> = { on: true, off: false, default: null };

/** `--switches NAME=on,NAME=off,NAME=default`. */
export function switchesFlag(value: string | undefined): ReviewSwitchesUpdate | undefined {
	if (value === undefined) return undefined;
	const update: ReviewSwitchesUpdate = {};
	for (const pair of value.split(",")) {
		const [name = "", setting = ""] = pair.trim().split("=");
		if (
			!(REPO_SWITCHES as readonly string[]).includes(name) ||
			!Object.hasOwn(SWITCH_VALUES, setting)
		) {
			throw new UsageError(
				`--switches takes NAME=on|off|default, comma separated; NAME is one of ${REPO_SWITCHES.join(", ")}`,
			);
		}
		update[name as RepoSwitch] = SWITCH_VALUES[setting] ?? null;
	}
	return update;
}

export function executeSettings(command: SettingsCommand, client: CodePanelClient) {
	switch (command.kind) {
		case "budget":
			return client.getBudget(command.repo);
		case "budget.set": {
			const { kind: _, ...args } = command;
			return client.setBudget(args);
		}
		case "repos.switches":
			return client.getRepoSwitches(command.repo);
		case "autoReload":
			return client.getAutoReload();
		case "autoReload.set": {
			const { kind: _, ...args } = command;
			return client.setAutoReload(args);
		}
	}
}

/** A null amount is no limit, never zero: "left unlimited" must not read as "left $0". */
const UNLIMITED = "unlimited";
const usd = (n: number | null) => (n === null ? UNLIMITED : `$${n.toFixed(2)}`);

function budgetLines(s: BudgetState): string[] {
	const a = s.account;
	// Before enforcement a limit can read "reached" while no round is refused.
	const status = (st: string) => (s.enforced ? `[${st}]` : `[${st}, not enforced]`);
	const lines = [
		`${s.month}${s.enforced ? "" : " (not enforced yet)"}`,
		`Account budget: ${usd(a.limitUsd)} (${a.source === "none" ? "no limit set" : a.source}); spent ${usd(a.spentUsd)}, held ${usd(a.heldUsd)}, left ${usd(a.remainingUsd)} ${status(a.status)}`,
	];
	const r = s.repo;
	if (!r) return lines;
	const cap = r.capUsd === null ? "no cap (account budget only)" : usd(r.capUsd);
	lines.push(
		`${r.repo} cap: ${cap}; spent ${usd(r.spentUsd)}, held ${usd(r.heldUsd)}, left ${usd(r.remainingUsd)} ${status(r.status)}`,
		`Next round: ${r.review.status}, ${r.review.remainingUsd === null ? "no limit applies" : `${usd(r.review.remainingUsd)} left`}${r.review.limitedBy ? ` (${r.review.limitedBy} limit)` : ""}`,
	);
	if (r.review.refusal) lines.push(`Refused: ${r.review.refusal}`);
	return lines;
}

function autoReloadLines(s: AutoReload): string[] {
	const pending = s.pendingSince === null ? "" : ` since ${new Date(s.pendingSince).toISOString()}`;
	const last =
		s.lastReloadAt === null ? "" : `; last reload ${new Date(s.lastReloadAt).toISOString()}`;
	const lines = [
		`Auto-reload: ${s.status}${s.offReason ? ` (${s.offReason})` : ""}${pending}`,
		`Below ${usd(s.thresholdUsd)}, buy ${usd(s.packUsd)} of credits (${usd(s.chargeUsd)} with the fee); at most ${usd(s.monthlyCapUsd)} a month`,
		`${s.month}: reloaded ${usd(s.reloadedUsd)}${last}`,
	];
	// Absent from a server older than this CLI, hence the truthiness check.
	if (s.retryAfter) {
		lines.push(
			`Stripe was unavailable; the next try waits until ${new Date(s.retryAfter).toISOString()}`,
		);
	}
	if (s.message) lines.push(s.message);
	return lines;
}

function switchLines(states: ReviewSwitchStates): string[] {
	return REPO_SWITCHES.map((name) => {
		const s = states[name];
		const value = s.effective ? "on" : "off";
		if (s.source === "default") return `${name}: ${value} (default)`;
		const own = s.override === null ? "follows the deployment" : `set ${s.override ? "on" : "off"}`;
		return `${name}: ${value} (${own}; deployment ${s.deployment ? "on" : "off"})`;
	});
}

export function formatSettings(command: SettingsCommand, result: unknown): string {
	switch (command.kind) {
		case "budget":
			return budgetLines(result as BudgetState).join("\n");
		case "budget.set": {
			const { before, after, changed } = result as BudgetChange;
			return [
				`Changed: ${changed.join(", ")}`,
				"Before:",
				...budgetLines(before),
				"After:",
				...budgetLines(after),
			].join("\n");
		}
		case "repos.switches":
			return switchLines((result as { reviewSwitches: ReviewSwitchStates }).reviewSwitches).join(
				"\n",
			);
		case "autoReload":
			return autoReloadLines(result as AutoReload).join("\n");
		case "autoReload.set": {
			const { before, after } = result as AutoReloadChange;
			return ["Before:", ...autoReloadLines(before), "After:", ...autoReloadLines(after)].join(
				"\n",
			);
		}
	}
}

/** `repos set` prints the switches when it changed them. */
export function formatRepoSet(result: unknown, changedSwitches: boolean): string {
	if (!changedSwitches) return "Done.";
	return [
		"Done.",
		...switchLines((result as { reviewSwitches: ReviewSwitchStates }).reviewSwitches),
	].join("\n");
}
