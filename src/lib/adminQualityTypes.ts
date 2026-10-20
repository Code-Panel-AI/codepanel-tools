/** GET /admin/quality (convex/admin/qualityPageValidators.ts). The CLI prints a summary. */
import type { AdminReport } from "./adminClient";

export interface AdminVerified {
	truePositives: number;
	falsePositives: number;
	sample: number;
	/** Null below `minSample` verdicts, with `interval`. */
	precision: number | null;
	interval: { low: number; high: number } | null;
}

export interface AdminQualityModel {
	model: string;
	provider: string;
	modelId: string;
	reported: number;
	fixed: number;
	dismissed: number;
	dismissedByReason: Record<string, number>;
	up: number;
	down: number;
	upFromAgents: number;
	downFromAgents: number;
	verified: AdminVerified;
}

export interface AdminQuality extends AdminReport {
	/** When the nightly rollup ran; null before its first run. */
	asOf: number | null;
	days: number;
	since: number | null;
	repos: number;
	findings: number;
	unattributed: number;
	truncated: boolean;
	minSample: number;
	stuckHours: number;
	overall: { reported: number; fixed: number; verified: AdminVerified };
	models: { rows: AdminQualityModel[]; truncated: boolean };
	disputes: {
		opened: number;
		disputers: number;
		withdrawn: number;
		upheld: number;
		revised: number;
		closed: number;
		pending: number;
		waiting: number;
		stuck: number;
	};
	learnings: {
		created: number;
		drafted: number;
		ratedUp: number;
		ratedDown: number;
		turnedOff: number;
		active: number;
		total: number;
	};
}
