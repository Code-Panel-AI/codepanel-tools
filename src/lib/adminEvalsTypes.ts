/** GET /admin/evals (convex/admin/evalsValidators.ts). The CLI prints a summary. */
import type { AdminReport } from "./adminClient";

export interface AdminEvalRun {
	id: number;
	status: string;
	conclusion: string | null;
	createdAt: number;
	event: string;
	url: string;
}

export interface AdminEvalWorkflow {
	file: string;
	label: string;
	cadence: string;
	url: string;
	read: boolean;
	httpStatus: number | null;
	runs: AdminEvalRun[];
}

export interface AdminEvals extends AdminReport {
	/** False without the optional ADMIN_GITHUB_ACTIONS_TOKEN; `workflows` is then empty. */
	configured: boolean;
	repo: string;
	actionsUrl: string;
	tokenEnv: string;
	workflows: AdminEvalWorkflow[];
	envelope: { command: string; note: string };
}
