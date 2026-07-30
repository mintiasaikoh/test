import { z } from 'zod';
import screenshot from 'screenshot-desktop';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { TdClient } from './tdClient.js';

type Content =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

interface ToolResult {
  content: Content[];
  isError?: boolean;
  [key: string]: unknown;
}

function ok(data: unknown): ToolResult {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }] };
}

function fail(err: unknown): ToolResult {
  const text = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text', text }], isError: true };
}

async function run(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err) {
    return fail(err);
  }
}

interface CaptureResult {
  imageBase64: string;
  width: number;
  height: number;
  format: string;
}

const parameterValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])),
  z.object({ expr: z.string().describe('A TouchDesigner Python expression, e.g. "absTime.seconds"') }),
]);

export function registerTools(server: McpServer, td: TdClient): void {
  server.registerTool(
    'td_info',
    {
      title: 'Get TouchDesigner info',
      description:
        'Get TouchDesigner version, project name/folder, FPS and current frame. ' +
        'Call this first to verify the connection to TouchDesigner is working.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => run(async () => ok(await td.api('info'))),
  );

  server.registerTool(
    'td_list_operators',
    {
      title: 'List operators',
      description:
        'List operators (nodes) in the TouchDesigner network under a parent COMP. ' +
        'Returns path, name, type, family and error state for each operator.',
      inputSchema: {
        parent: z
          .string()
          .default('/')
          .describe("Path of the parent COMP, e.g. '/' or '/project1'"),
        depth: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(1)
          .describe('How many levels deep to search (1 = direct children only)'),
        family: z
          .enum(['TOP', 'CHOP', 'SOP', 'DAT', 'MAT', 'COMP'])
          .optional()
          .describe('Only return operators of this family'),
        namePattern: z
          .string()
          .optional()
          .describe("Glob pattern for operator names, e.g. 'noise*'"),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => run(async () => ok(await td.api('list_ops', args))),
  );

  server.registerTool(
    'td_get_operator',
    {
      title: 'Get operator details',
      description:
        'Get details of one operator: type, parameters (with values/expressions), ' +
        'input/output connections, errors and warnings.',
      inputSchema: {
        path: z.string().describe("Full path of the operator, e.g. '/project1/noise1'"),
        includeParameters: z
          .boolean()
          .default(true)
          .describe('Include the full parameter list (can be long)'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => run(async () => ok(await td.api('get_op', args))),
  );

  server.registerTool(
    'td_create_operator',
    {
      title: 'Create operator',
      description:
        'Create a new operator in the network. opType uses TouchDesigner Python class names, ' +
        "e.g. 'noiseTOP', 'moviefileinTOP', 'levelTOP', 'constantCHOP', 'geoCOMP', 'textDAT'. " +
        'Optionally set initial parameters in the same call.',
      inputSchema: {
        parent: z.string().default('/project1').describe('Path of the parent COMP to create the operator in'),
        opType: z.string().describe("Operator type as Python class name, e.g. 'noiseTOP'"),
        name: z.string().optional().describe('Node name (auto-numbered if omitted or taken)'),
        nodeX: z.number().optional().describe('X position in the network editor'),
        nodeY: z.number().optional().describe('Y position in the network editor'),
        parameters: z
          .record(parameterValueSchema)
          .optional()
          .describe(
            'Initial parameter values, keyed by parameter name. ' +
              'Use {"expr": "..."} for expressions, arrays for multi-value patterns.',
          ),
      },
    },
    async (args) => run(async () => ok(await td.api('create_op', args))),
  );

  server.registerTool(
    'td_set_parameters',
    {
      title: 'Set parameters',
      description:
        'Set parameter values on an operator. Keys are parameter names (see td_get_operator). ' +
        'Values may be numbers, strings, booleans, arrays (for name patterns matching multiple ' +
        "parameters, e.g. 't?' -> [0.5, 0.2, 0]) or {\"expr\": \"...\"} to set a Python expression.",
      inputSchema: {
        path: z.string().describe('Full path of the operator'),
        parameters: z.record(parameterValueSchema).describe('Parameter name -> value map'),
      },
    },
    async (args) => run(async () => ok(await td.api('set_pars', args))),
  );

  server.registerTool(
    'td_delete_operator',
    {
      title: 'Delete operator',
      description: 'Delete an operator from the network. This cannot be undone via MCP.',
      inputSchema: {
        path: z.string().describe('Full path of the operator to delete'),
      },
      annotations: { destructiveHint: true },
    },
    async (args) => run(async () => ok(await td.api('delete_op', args))),
  );

  server.registerTool(
    'td_connect_operators',
    {
      title: 'Connect operators',
      description: 'Wire the output of one operator into the input of another (both must be in the same network).',
      inputSchema: {
        fromPath: z.string().describe('Path of the source operator'),
        fromOutput: z.number().int().min(0).default(0).describe('Output connector index on the source'),
        toPath: z.string().describe('Path of the destination operator'),
        toInput: z.number().int().min(0).default(0).describe('Input connector index on the destination'),
      },
    },
    async (args) => run(async () => ok(await td.api('connect', args))),
  );

  server.registerTool(
    'td_capture_top',
    {
      title: 'Capture TOP image',
      description:
        'Render the current image of a TOP (texture operator) and return it as a PNG so you can ' +
        'SEE what TouchDesigner is producing. Use this to visually check renders, compositions and ' +
        'color grading. For the TouchDesigner UI itself (network editor, dialogs), use td_screenshot instead.',
      inputSchema: {
        path: z.string().describe("Path of the TOP to capture, e.g. '/project1/out1'"),
        maxWidth: z
          .number()
          .int()
          .min(16)
          .max(4096)
          .default(1280)
          .describe('Downscale the capture to at most this width (keeps aspect ratio)'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ path, maxWidth }) =>
      run(async () => {
        const r = await td.api<CaptureResult>('capture_top', { path, maxWidth }, 60_000);
        return {
          content: [
            { type: 'image', data: r.imageBase64, mimeType: 'image/png' },
            { type: 'text', text: `${path} (${r.width}x${r.height}, ${r.format})` },
          ],
        };
      }),
  );

  server.registerTool(
    'td_screenshot',
    {
      title: 'Screenshot of the screen',
      description:
        'Take a screenshot of the screen of the machine running this MCP server, so you can see ' +
        'the actual TouchDesigner UI: network editor, parameter dialogs, error popups, Textport. ' +
        'For the rendered output of a specific TOP, prefer td_capture_top (sharper and lighter).',
      inputSchema: {
        displayIndex: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Which display to capture (0-based). Omit for the primary display.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ displayIndex }) =>
      run(async () => {
        let buf: Buffer;
        let label = 'primary display';
        if (displayIndex !== undefined) {
          const displays = await screenshot.listDisplays();
          const d = displays[displayIndex];
          if (!d) {
            return fail(
              new Error(`Display ${displayIndex} not found (${displays.length} display(s) available)`),
            );
          }
          buf = await screenshot({ format: 'png', screen: d.id });
          label = `display ${displayIndex}${d.name ? ` (${d.name})` : ''}`;
        } else {
          buf = await screenshot({ format: 'png' });
        }
        return {
          content: [
            { type: 'image', data: buf.toString('base64'), mimeType: 'image/png' },
            { type: 'text', text: `Screenshot of ${label}` },
          ],
        };
      }),
  );

  server.registerTool(
    'td_get_errors',
    {
      title: 'Get errors and warnings',
      description: 'Scan the network recursively and list all operators that currently have errors or warnings.',
      inputSchema: {
        parent: z.string().default('/').describe('COMP to scan from'),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => run(async () => ok(await td.api('get_errors', args))),
  );

  server.registerTool(
    'td_execute_python',
    {
      title: 'Execute Python in TouchDesigner',
      description:
        'Run arbitrary Python code inside TouchDesigner and return the repr() of the result plus ' +
        'anything printed to stdout. Full access to the td module (op(), project, ui, ...). ' +
        'Use this for anything the other tools do not cover (timeline control, saving the project, ' +
        'MIDI/OSC setup, custom COMP internals, etc.). State persists between calls.',
      inputSchema: {
        code: z.string().describe('Python source code. A single expression returns its value.'),
      },
    },
    async (args) => run(async () => ok(await td.api('exec', args, 60_000))),
  );
}
