# CodePanel tools

The command-line client, local MCP server and coding-agent plugin for
[CodePanel](https://codepanel.ai), which reviews GitHub pull requests with a
panel of AI models. They talk to CodePanel's [HTTP API](https://codepanel.ai/docs/api).
CodePanel itself is a hosted service; this repository holds only the clients.

## Claude Code plugin

```bash
claude plugin install codepanel --marketplace Code-Panel-AI/codepanel-tools
```

Other agents (Codex, Cursor and more) install the skills with
`npx skills add Code-Panel-AI/codepanel-tools`. See [Connect your agent](https://codepanel.ai/docs/coding-agents).

## CLI and local MCP server

Both run with [Bun](https://bun.sh).

```bash
git clone https://github.com/Code-Panel-AI/codepanel-tools.git
cd codepanel-tools
bun install
bun run codepanel -- login
```

- CLI: [codepanel.ai/docs/cli](https://codepanel.ai/docs/cli)
- Local MCP server (`bun src/mcp/server.ts`): [codepanel.ai/docs/mcp-server](https://codepanel.ai/docs/mcp-server).
  Most agents can use the remote server at `https://codepanel.ai/mcp` instead, with nothing to install.

## Contributing

This repository is exported from CodePanel's private repository, which the
same code also serves from (the remote MCP server runs these tool
definitions). Pull requests here can't be merged directly; open an issue, and
a fix lands in the next export.

## License

[MIT](LICENSE)
