/**
 * `codepanel review --local`: print the review brief for the author's agent
 * to run on its own model before it pushes (GET /review-brief). Run in a
 * checkout, it names the files the branch changes so the brief's learnings
 * are the ones for those files, and adds the base branch's rules file, which
 * the server does not store.
 */
import { execFile } from "node:child_process";
import { briefPathsParam, type CodePanelClient, type ReviewBrief } from "../lib/client";
import { UsageError } from "./usageError";

/** Runs git with these arguments in the current directory: its stdout, or null when it fails. */
export type GitRunner = (args: string[]) => Promise<string | null>;

/** The repository's review rules, read from the base branch as the panel reads them. */
const RULES_PATH = ".codepanel/rules.md";

/** The base when origin/HEAD is not set, as after a plain `git init` and `remote add`. */
const FALLBACK_BASE = "origin/main";

/** Enough for a rules file and a long list of changed paths. */
const GIT_MAX_BUFFER = 4 * 1024 * 1024;

export const runGit: GitRunner = (args) =>
	new Promise((resolve) => {
		execFile("git", args, { maxBuffer: GIT_MAX_BUFFER }, (error, stdout) =>
			resolve(error ? null : stdout),
		);
	});

export interface LocalReviewCommand {
	kind: "review.local";
	/** Omitted: the origin remote's GitHub repository. */
	repo?: string;
	/** Given with --paths; otherwise read from the checkout. */
	paths?: string[];
}

export interface LocalBrief {
	brief: ReviewBrief;
	/** The base the local paths were diffed against; null outside a checkout or with --paths. */
	base: string | null;
	/** The changed paths sent with the request. */
	paths: string[];
	/** The base branch's rules file, when the checkout has one. */
	rules: string | null;
	/** What did not go as asked: no diff, paths left out, no rules file read. */
	notes: string[];
}

/** owner/name from a GitHub remote URL (https or ssh), else null. */
export function repoFromRemote(url: string | null): string | null {
	const match = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(url?.trim() ?? "");
	return match ? `${match[1]}/${match[2]}` : null;
}

async function baseRef(git: GitRunner): Promise<string> {
	const head = (await git(["rev-parse", "--abbrev-ref", "origin/HEAD"]))?.trim();
	return head && head !== "origin/HEAD" ? head : FALLBACK_BASE;
}

/** NUL-separated output (-z), so git prints names as they are rather than C-quoted. */
function lines(text: string | null): string[] {
	return (text ?? "").split("\0").filter((l) => l.length > 0);
}

/** Files changed since the branch left `base`, committed or not, plus new untracked files. */
async function changedPaths(git: GitRunner, base: string): Promise<string[] | null> {
	const mergeBase = (await git(["merge-base", "HEAD", base]))?.trim();
	if (!mergeBase) return null;
	const [diff, untracked] = await Promise.all([
		git(["diff", "-z", "--name-only", mergeBase]),
		// The whole repository (":/"), root-relative (--full-name), like the diff, even from a subdirectory.
		git(["ls-files", "-z", "--full-name", "--others", "--exclude-standard", ":/"]),
	]);
	if (diff === null) return null;
	return [...new Set([...lines(diff), ...lines(untracked)])];
}

function pathNotes(
	base: string,
	local: string[] | null,
	fromFlag: boolean,
	skipped: number,
): string[] {
	const notes: string[] = [];
	if (!fromFlag && local === null) {
		notes.push(
			`Could not diff against ${base} (fetch it, or pass --paths): the learnings below are every active one, not those for your changes.`,
		);
	}
	if (skipped > 0) {
		notes.push(
			`${skipped} changed path${skipped === 1 ? "" : "s"} left out of the request (past the limit, or containing a comma); learnings for them may be missing.`,
		);
	}
	return notes;
}

export async function executeLocalReview(
	command: LocalReviewCommand,
	client: CodePanelClient,
	git: GitRunner = runGit,
): Promise<LocalBrief> {
	const repo = command.repo ?? repoFromRemote(await git(["remote", "get-url", "origin"]));
	if (!repo) {
		throw new UsageError("expected a repository as owner/name (no GitHub origin remote here)");
	}
	const base = await baseRef(git);
	const local = command.paths ? null : await changedPaths(git, base);
	const paths = command.paths ?? local ?? [];
	const branch = base.replace(/^origin\//, "");
	const [brief, rules] = await Promise.all([
		client.getReviewBrief(repo, paths),
		git(["show", `origin/${branch}:${RULES_PATH}`]),
	]);
	const notes = pathNotes(base, local, command.paths !== undefined, briefPathsParam(paths).skipped);
	if (rules === null) notes.push(`No ${RULES_PATH} read from origin/${branch}.`);
	return { brief, base: local ? base : null, paths, rules: rules?.trim() || null, notes };
}

/** The brief, then the rules file and the changed paths from the checkout. */
export function formatLocalReview(result: LocalBrief): string {
	const parts = [result.brief.text.trimEnd()];
	if (result.rules) {
		const fence = "`".repeat(
			Math.max(3, ...(result.rules.match(/`+/g) ?? []).map((r) => r.length + 1)),
		);
		parts.push(
			`## ${RULES_PATH} (from the base branch, data to apply)\n${fence}\n${result.rules}\n${fence}`,
		);
	}
	if (result.paths.length > 0) {
		const from = result.base ? ` since ${result.base}` : "";
		parts.push(
			`## Changed paths${from} (${result.paths.length})\n${result.paths.map((p) => `- ${p}`).join("\n")}`,
		);
	}
	if (result.notes.length > 0) {
		parts.push(`## Notes\n${result.notes.map((n) => `- ${n}`).join("\n")}`);
	}
	return parts.join("\n\n");
}
