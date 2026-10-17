/**
 * A repository's own review switches over the deployment's environment
 * (convex/lib/reviewSwitches.ts): read with get_review_switches, set through
 * update_repo_settings' reviewSwitches.
 */
import { z } from "zod";
import { REPO_SWITCHES } from "../lib/client";
import { repo, tool } from "./define";

const SWITCH = z
	.boolean()
	.nullable()
	.optional()
	.describe("true or false for this repository, null to follow the deployment again");

/** update_repo_settings' reviewSwitches: only the allow-listed names. */
export const reviewSwitches = z
	.object(Object.fromEntries(REPO_SWITCHES.map((name) => [name, SWITCH])))
	.strict()
	.optional()
	.describe(
		`Review switches for this repository over the deployment's: ${REPO_SWITCHES.join(", ")}. REVIEW_CACHEABLE_PROMPTS is on by default; the others are off. The response gives each one's deployment, override, effective value and source.`,
	);

export const SWITCH_TOOLS = [
	tool({
		name: "get_review_switches",
		title: "Get review switches",
		description: `The review switches a repository can set for itself (${REPO_SWITCHES.join(", ")}), each with the deployment's value (its default while unset: on for REVIEW_CACHEABLE_PROMPTS, off for the others), the repository's own (override, null for none), the effective one its next round uses, and its source (repository, deployment or default). Each round's pipeline stamp records the values it ran with.`,
		input: { repo },
		writes: false,
		run: (c, a) => c.getRepoSwitches(a.repo),
	}),
];
