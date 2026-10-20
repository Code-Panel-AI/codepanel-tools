/**
 * Panel recommendations on /api/v1 (GET /panels/recommend, POST /panels/apply
 * and /panels/restore), shared by the MCP server and the CLI. Kept beside
 * client.ts rather than in it, on the same request.
 */
import type { PanelApplied, PanelRecommendation } from "./apiTypes";
import type { CodePanelClient } from "./client";

export type GoalLevel = "low" | "medium" | "high";

export interface PanelGoalArgs {
	cost?: GoalLevel;
	quality?: GoalLevel;
	repo?: string;
	panelId?: string;
	roles?: string[];
	provider?: string;
	maxUsdPerPr?: number;
}

/** apply's `undo`, with its ids as the plain strings an agent passes back. */
export type PanelUndo = Omit<PanelApplied["undo"], "panelId" | "reviewerIds"> & {
	panelId: string;
	reviewerIds: string[];
};

/** GET takes the role list as one comma-separated string. */
function query({ roles, ...rest }: PanelGoalArgs) {
	return { ...rest, roles: roles?.join(",") };
}

export const recommendPanel = (c: CodePanelClient, args: PanelGoalArgs) =>
	c.request<PanelRecommendation>("GET", "/panels/recommend", query(args));

export const applyPanel = (c: CodePanelClient, args: PanelGoalArgs) =>
	c.request<PanelApplied>("POST", "/panels/apply", { ...args });

export const restorePanel = (c: CodePanelClient, undo: PanelUndo) =>
	c.request<{ ok: true }>("POST", "/panels/restore", { ...undo });
