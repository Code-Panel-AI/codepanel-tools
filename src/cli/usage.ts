/** The text `codepanel help` prints, kept apart from the parser. */
export const USAGE = `codepanel — operate CodePanel from the terminal

Sign in with "codepanel login" (codepanel.ai; --url for another deployment), or set
CODEPANEL_URL (your .convex.site URL) and CODEPANEL_TOKEN (cpk_… from Settings → API tokens),
which take precedence.

  codepanel login [--url <site url>] [--scopes read,reviews:write] [--name <label>]
  codepanel logout

  codepanel whoami
  codepanel repos [--connectable]
  codepanel repos connect <owner/name>
  codepanel repos disconnect <owner/name>
  codepanel repos set <owner/name> [--auto-review on|off] [--max-auto-rounds <n>|none] [--bot-max-rounds <n>|default] [--panel <id>|none]
                      [--step-back-after-rounds <n>|default]
                      [--gate off|critical|warning|all] [--inline-suggestions on|off] [--agent-files on|off]
                      [--switches NAME=on|off|default,...]
                      [--escalate-to <login,...>|none [--escalate-on upheld_critical,round_limit,step_back,novel]]
  codepanel repos switches <owner/name>
  codepanel spend <owner/name> [--json]
  codepanel optimize <owner/name> [--json]
  codepanel budget [owner/name]
  codepanel budget set [--monthly <usd>|default|none] [--repo <owner/name> --cap <usd>|none]
  codepanel auto-reload
  codepanel auto-reload on|off|set [--threshold <usd>] [--pack <usd>] [--cap <usd>]
  codepanel credits-first [on|off|default]
  codepanel panel
  codepanel models
  codepanel panel roles
  codepanel panel recommend [--cost low|medium|high] [--quality low|medium|high] [--repo <owner/name>] [--panel <id>] [--roles <id,id>] [--provider p] [--max-usd-per-pr <usd>]
  codepanel panel apply [--cost low|medium|high] [--quality low|medium|high] [--repo <owner/name>] [--panel <id>] [--roles <id,id>] [--provider p] [--max-usd-per-pr <usd>]
  codepanel panel restore --file <path|->
  codepanel panel add-reviewer [--panel <id>] --role <id> [--provider p [--model m]] [--effort e] [--name n] [--prompt text]
  codepanel panel add-reviewer [--panel <id>] --provider <p> --model <m> [--effort e] [--name n] [--prompt text]
  codepanel panel remove-reviewer [--panel <id>] --reviewer <id>
  codepanel panel update-member --reviewer <id> [--provider p --model m] [--effort e] [--prompt text]
  codepanel panel orchestrator [--panel <id>] --provider <p> --model <m> [--effort e]
  codepanel panel set [--panel <id>] [--name n] [--budget <usd>|none]
  codepanel keys
  codepanel review <owner/name#123> [--trigger [--traceparent <tp>]] [--panel <id>] [--wait [--timeout <secs>] [--sha <commit>]]
  codepanel review --local [owner/name] [--paths a,b]
  codepanel sessions [--repo owner/name] [--status active|completed|all] [--limit n]
  codepanel session <id>
  codepanel findings <owner/name#123> [--all]
  codepanel findings dismiss <findingId> [--reason false_positive|wrong_location|not_worth_fixing|duplicate|deferred|other]
                                         [--note text] [--agent name]
  codepanel findings reopen <owner/name#123> <F3> | <findingId>
  codepanel feedback <owner/name#123> <F3|review> up|down [--reason r] [--note text] [--agent name]
  codepanel knowledge <owner/name>
  codepanel knowledge set <owner/name> <file|->
  codepanel learnings <owner/name>
  codepanel learn <owner/name> <text...> [--scope <path>] [--pr n] [--agent name]
  codepanel learning <owner/name> L3 up|down [--reason r] [--note text] [--pr n] [--agent name]
  codepanel quality <owner/name> [--days n]
  codepanel handoff <owner/name#123> --text <note> | --file <path|-> [--sha <commit>] [--agent name]
  codepanel rounds <owner/name#123> <n|+n|stop|reset>
  codepanel ask <owner/name#123> [F3] <question> [--agent name] [--timeout <secs>]

  codepanel admin [overview]
  codepanel admin system|treasury|revenue|reviews|repos|models|quality|evals
  codepanel admin audit [--limit n]
  codepanel admin users [--cursor c]
  codepanel admin user <login>
  codepanel admin comp <login> --reason <why> [--until YYYY-MM-DD]
  codepanel admin uncomp <login> --reason <why>
  codepanel admin credit <login> <amountUsd> --reason <why> [--request-id <id>]
  codepanel admin budget <login> <amount|none|default> --reason <why>
  codepanel admin undo <auditId> --reason <why>
  codepanel admin refresh-models --reason <why>
  codepanel admin alert-test --reason <why>
  codepanel admin release <sessionId> --reason <why>
  codepanel admin inbox [--topic idea|bug|pricing|other]
  codepanel admin handle|unhandle <feedbackId> --reason <why>
  codepanel admin balance <provider> <amountUsd> --note <text> [--as-of YYYY-MM-DD]

--role sets a reviewer up from a role (see panel roles) and picks a model on its cost tier.
panel recommend proposes reviewers for a goal (cost picks tiers, quality picks roles and effort) and
changes nothing; panel apply writes it, to --repo's own panel only when --repo is given, and prints
the restore command that undoes it.
--panel defaults to your default panel. --agent defaults to $CODEPANEL_AGENT; set it when an
agent rates or asks, so its ratings are counted as an agent's (an agent's down rating with a reason
disputes the finding). Name the harness, e.g. claude-code; a Claude model id is read as claude-code
and kept as the model. ask waits for the answer (default 3 minutes). handoff gives the next review the author
agent's note: what it changed, tested, is unsure of and left out on purpose. --wait blocks until the latest review finishes, then prints it (exit 4 if the merge gate still blocks, 3 if --timeout passes first).
After a push, add --sha <commit> so an older commit's finished review is not taken for the new one.
findings reopen undoes a dismissal, including one that kept a re-reported finding closed (the
review's "reported again and not reopened" line).
review --local prints the review brief to run on your own model before a push, free and with no review
started: each seat's prompt, the gate, the rubric and the learnings for the paths changed since the base
branch (or --paths), plus the base branch's .codepanel/rules.md. Run it in a fresh-context subagent.
A triggered review carries $TRACEPARENT (or --traceparent), returned by review as traceparent.
knowledge prints a repo's review rules, notes and verdicts as Markdown; knowledge set reads the whole
edited document from a file or stdin (-) and replaces the rules and notes with it.
learn records a repo learning; an agent's (--agent, or $CODEPANEL_AGENT) waits for a person or
another identity on another pull request. learning L3 up confirms one, down turns it off.
quality prints verified precision per model and role (default 30 days, at most 90): only verdicts an
author agent cannot give itself count; "addressed by commit" is shown apart because complying inflates it.
It then prints convergence over the same window: rounds per merged pull request, how soon the gate went green,
and the rounds that ran after it was green (re-blocked when one reported a new warning), by what started them.
spend explains the UTC month's model costs and coverage. optimize reads spend suggestions, verified
quality, provider health and balanced/economy panel alternatives for the named repository; it changes
no settings. Use panel apply --repo to change that repository, and save its JSON undo object.

budget prints the account's monthly budget and, given a repository, its own cap, with this month's
own-key spend, held and left; budget set changes them and prints both before and after. A cap is checked
as well as the account budget; --cap none leaves only the account budget.
auto-reload prints credits auto-reload; on, off and set change it (--pack 25|50|100|250, --cap at least
the pack) and print it before and after. While on, a balance below the threshold charges your saved card
for the pack plus the purchase fee, up to the cap's worth of credits a month.
credits-first prints whether reviews spend CodePanel credits before your own provider keys (default on);
on, off and default change it. On, a reviewer runs on credits while the balance covers it, then on your key.
repos switches prints the review switches a repository can set for itself (REVIEW_CACHEABLE_PROMPTS,
REVIEW_REVIEWER_TOOLS, REVIEW_PRECISION_RULES, REVIEW_CHANGED_LINES, REVIEW_BASE_MERGE_SCOPE,
REVIEW_LEARNING_ATTRIBUTION, REVIEW_PROOF_GRADING, REVIEW_NOVEL_ESCALATION; the first is on by
default, the rest off); repos set --switches sets them, default following the deployment again.
admin is for operators of a deployment: it needs an admin token in CODEPANEL_ADMIN_TOKEN (minted on /admin).
Every admin write prints before and after and, when it can be reversed, the undo command. credit prints its
request id before it sends; pass it as --request-id to retry without applying twice. balance records a
provider's balance as read from its console (Treasury). release settles a review round stuck past its
lease (see admin reviews) as the watchdog would; it cannot be undone. inbox prints the messages sent through
the site's feedback form, newest first; handle marks one handled and unhandle puts it back (both audited).
quality prints the nightly rollup of review quality across every account: per model, findings, fixed,
dismissed, ratings and verified precision, then disputes by ruling and learnings. Counts only.
evals prints the latest benchmark, drift and eval workflow runs (needs ADMIN_GITHUB_ACTIONS_TOKEN set on the
deployment) and the command that shows the monthly eval envelope.
Add --json to any command for raw output.`;
