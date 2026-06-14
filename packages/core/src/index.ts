export const badockVersion = "0.1.0";

export type BadockHealth = {
  name: "BadocK";
  version: string;
  status: "ok";
  mode: "cli-first";
  runtime: string;
};

export function getBadockHealth(): BadockHealth {
  return {
    name: "BadocK",
    version: badockVersion,
    status: "ok",
    mode: "cli-first",
    runtime: process.version
  };
}

export * from "./issues";
export * from "./project";
export * from "./run-plan";
export * from "./security";
export * from "./provider";
export * from "./permissions";
export * from "./agents";
export * from "./runtime-adapter";
export * from "./issue-files";
export * from "./worktree-manager";
export * from "./run-store";
export * from "./diff-review";
export * from "./cost-tracker";
export * from "./github-sync";
