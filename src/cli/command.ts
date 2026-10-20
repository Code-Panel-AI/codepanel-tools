/** Every command the CLI parses (args.ts), as a discriminated union. */

import type { AdminCommand } from "./adminArgs";
import type { AskCommand, FeedbackCommand } from "./feedbackArgs";
import type { HandoffCommand } from "./handoffArgs";
import type { KnowledgeCommand } from "./knowledgeArgs";
import type { LearningCommand } from "./learningArgs";
import type { PanelPlanCommand } from "./panelPlanCommand";
import type { QualityCommand } from "./qualityCommand";
import type { ReviewCommand } from "./reviewArgs";
import type { SettingsCommand } from "./settingsCommand";
import type { SetupCommand } from "./setupArgs";
import type { SpendCommand } from "./spendCommand";

export type Command =
	| { kind: "help" }
	| { kind: "whoami" }
	| { kind: "models" }
	| { kind: "keys" }
	| { kind: "login"; url?: string; scopes?: string; name?: string }
	| { kind: "logout" }
	| SpendCommand
	| SetupCommand
	| PanelPlanCommand
	| ReviewCommand
	| FeedbackCommand
	| AskCommand
	| KnowledgeCommand
	| LearningCommand
	| QualityCommand
	| SettingsCommand
	| AdminCommand
	| HandoffCommand;
