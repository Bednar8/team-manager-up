export interface TestConfig {
  appUrl: string;
  url: string;
  serviceRole: string;
}
export type ResourceRow = Record<string, string>;
export function localOrigin(value: string): string;
export function testConfig(appUrl?: string): TestConfig;
export class TestResources {
  constructor(
    config: TestConfig,
    options?: { directory?: string; fetcher?: (input: string, options?: RequestInit) => Promise<Response> },
  );
  config: TestConfig;
  file: string;
  api(path: string, options?: { method?: string; body?: unknown; missing?: boolean }): Promise<unknown>;
  save(): void;
  release(): void;
  data: {
    version: number;
    runId: string;
    appUrl: string;
    url: string;
    rows: Record<string, ResourceRow[]>;
    users: { id: string; email: string }[];
    objects: string[];
    status: string;
    pending: unknown;
  };
  locked: boolean;
  start(): Promise<this>;
  resume(runId: string): Promise<this>;
  cleanup(): Promise<void>;
  rows(table: string, where: Record<string, string>): Promise<ResourceRow[]>;
  capture<T>(table: string, where: Record<string, string>, action: () => Promise<T>): Promise<T>;
  signup<T>(email: string, password: string, action: () => Promise<T>): Promise<{ result: T; userId: string }>;
  createTeam<T>(userId: string, action: () => Promise<T>): Promise<T>;
  upload<T>(path: string, action: () => Promise<T>): Promise<T>;
  ownsPath(path: string): boolean;
  ownsUser(id: string): boolean;
  has(table: string, id: string): boolean;
}
export function withTestResources<T>(
  config: TestConfig,
  action: (run: TestResources) => Promise<T>,
  options?: { directory?: string; fetcher?: (input: string, options?: RequestInit) => Promise<Response> },
): Promise<T>;
