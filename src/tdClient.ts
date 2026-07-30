interface ApiResponse<T> {
  ok: boolean;
  result?: T;
  error?: string;
  traceback?: string;
}

/**
 * Thin HTTP client for the WebServer DAT bridge running inside TouchDesigner
 * (installed by td/setup_mcp.py). All commands go through POST /api as
 * {cmd, args} and come back as {ok, result} or {ok: false, error, traceback}.
 */
export class TdClient {
  constructor(readonly baseUrl: string) {}

  async api<T = unknown>(
    cmd: string,
    args: Record<string, unknown> = {},
    timeoutMs = 30_000,
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(new URL('/api', this.baseUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cmd, args }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Cannot reach TouchDesigner at ${this.baseUrl} (${detail}). ` +
          `Make sure TouchDesigner is running and the MCP bridge is installed: ` +
          `paste td/setup_mcp.py into a Text DAT and run it (or paste it into the Textport). ` +
          `If you changed the port, set the TD_WEBSERVER_URL environment variable for this MCP server.`,
      );
    }
    if (!res.ok) {
      throw new Error(`TouchDesigner WebServer returned HTTP ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as ApiResponse<T>;
    if (!json.ok) {
      const tb = json.traceback ? `\n${json.traceback}` : '';
      throw new Error(`TouchDesigner error: ${json.error ?? 'unknown error'}${tb}`);
    }
    return json.result as T;
  }
}
