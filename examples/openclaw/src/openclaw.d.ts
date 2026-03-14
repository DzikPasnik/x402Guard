/**
 * OpenClaw Plugin SDK type definitions.
 *
 * These types mirror the OpenClaw plugin API surface used by plugins
 * to register tools, commands, hooks, and services.
 *
 * Based on: https://docs.openclaw.ai/tools/plugin
 */

/** JSON Schema definition for tool input validation. */
export interface JsonSchema {
  readonly type: string;
  readonly properties?: Readonly<Record<string, JsonSchema & {
    readonly description?: string;
    readonly enum?: readonly string[];
    readonly items?: JsonSchema;
    readonly default?: unknown;
  }>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly description?: string;
}

/** Tool registration descriptor. */
export interface ToolDescriptor {
  /** Tool name in snake_case (e.g. "x402guard_health_check"). */
  readonly name: string;
  /** Human-readable description shown to the AI agent. */
  readonly description: string;
  /** JSON Schema validating the tool input. */
  readonly inputSchema: JsonSchema;
  /** Async handler called when the agent invokes this tool. */
  readonly handler: (input: Record<string, unknown>) => Promise<unknown>;
}

/** Command registration descriptor. */
export interface CommandDescriptor {
  readonly name: string;
  readonly description: string;
  readonly acceptsArgs?: boolean;
  readonly requireAuth?: boolean;
  readonly handler: (ctx: CommandContext) => Promise<CommandResponse>;
}

export interface CommandContext {
  readonly senderId: string;
  readonly channel: string;
  readonly isAuthorizedSender: boolean;
  readonly args?: string;
  readonly config: Record<string, unknown>;
}

export interface CommandResponse {
  readonly text: string;
  readonly data?: unknown;
}

/** Logger interface provided by OpenClaw runtime. */
export interface PluginLogger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
}

/** Plugin API provided to the register() function. */
export interface PluginApi {
  /** Register a tool the AI agent can invoke. */
  registerTool(descriptor: ToolDescriptor): void;
  /** Register a slash-command (auto-reply, no AI). */
  registerCommand(descriptor: CommandDescriptor): void;
  /** Plugin configuration (from openclaw.json entries). */
  readonly config: Readonly<Record<string, unknown>>;
  /** Logger scoped to this plugin. */
  readonly logger: PluginLogger;
}

/** Plugin export format (object style). */
export interface OpenClawPlugin {
  readonly id: string;
  readonly name: string;
  readonly configSchema?: Record<string, unknown>;
  register(api: PluginApi): void;
}
