/**
 * Minimal type declarations for @elizaos/core (v2).
 *
 * This package uses @elizaos/core as a peerDependency. Since we cannot
 * install it in development, we declare the subset of types we need here.
 * The consuming ElizaOS runtime provides the actual implementation.
 */
declare module "@elizaos/core" {
  export interface Plugin {
    readonly name: string;
    readonly description: string;
    readonly config?: Record<string, string>;
    readonly init?: (
      config: Record<string, string>,
      runtime: IAgentRuntime,
    ) => Promise<void>;
    readonly actions?: Action[];
    readonly providers?: Provider[];
  }

  export interface Action {
    readonly name: string;
    readonly description: string;
    readonly similes: string[];
    readonly examples: unknown[][];
    readonly validate: (
      runtime: IAgentRuntime,
      message: Memory,
      state?: State,
    ) => Promise<boolean>;
    readonly handler: (
      runtime: IAgentRuntime,
      message: Memory,
      state?: State,
      options?: Record<string, unknown>,
      callback?: HandlerCallback,
    ) => Promise<unknown>;
  }

  export interface Provider {
    readonly name: string;
    readonly description: string;
    readonly get: (
      runtime: IAgentRuntime,
      message: Memory,
      state?: State,
    ) => Promise<{ text: string; data?: unknown }>;
  }

  export interface IAgentRuntime {
    getSetting(key: string): string | undefined;
  }

  export interface Memory {
    readonly content: {
      readonly text: string;
      readonly [key: string]: unknown;
    };
  }

  export interface State {
    readonly [key: string]: unknown;
  }

  export type HandlerCallback = (
    response: { text: string; data?: unknown },
    files?: unknown[],
  ) => Promise<Memory[]>;
}
