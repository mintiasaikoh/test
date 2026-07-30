#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TdClient } from './tdClient.js';
import { registerTools } from './tools.js';

const TD_URL = process.env.TD_WEBSERVER_URL ?? 'http://127.0.0.1:9981';

async function main(): Promise<void> {
  const server = new McpServer({ name: 'touchdesigner-mcp', version: '0.1.0' });
  registerTools(server, new TdClient(TD_URL));
  await server.connect(new StdioServerTransport());
  console.error(`touchdesigner-mcp: stdio server started (TouchDesigner bridge: ${TD_URL})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
