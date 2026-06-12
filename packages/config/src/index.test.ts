import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatManifestError, parseProjectManifest } from "./index";

const validManifest = {
  version: 1,
  project: {
    name: "Example"
  },
  stack: {
    language: "TypeScript",
    runtime: "Node.js",
    packageManager: "pnpm",
    frameworks: []
  },
  providers: [
    {
      id: "mock",
      type: "mock",
      defaultModel: "mock-planner"
    }
  ],
  agents: [
    {
      id: "architecture-agent",
      role: "architecture",
      provider: "mock",
      model: "mock-planner",
      permissionMode: "manual"
    }
  ],
  permissions: {
    defaultMode: "manual",
    allowCommands: ["pnpm check"],
    sensitiveFiles: [".env"],
    allowNetwork: false
  }
};

describe("projectManifestSchema", () => {
  it("accepts stack, agents, providers and permissions", () => {
    const manifest = parseProjectManifest(validManifest);

    assert.equal(manifest.project.name, "Example");
    assert.equal(manifest.agents[0]?.id, "architecture-agent");
  });

  it("rejects sensitive fields anywhere in the manifest", () => {
    assert.throws(
      () =>
      parseProjectManifest({
        ...validManifest,
        providers: [{ id: "real", type: "custom", apiKey: "sk-secret" }]
      }),
      /Sensitive field "apiKey"/
    );
  });

  it("formats validation errors with readable paths", () => {
    let message = "";

    try {
      parseProjectManifest({ version: 1, project: { name: "" } });
    } catch (error) {
      message = formatManifestError(error);
    }

    assert.match(message, /project\.name:/);
  });

  it("rejects agents that reference providers missing from the manifest", () => {
    assert.throws(
      () =>
        parseProjectManifest({
          ...validManifest,
          agents: [
            {
              id: "provider-agent",
              role: "provider",
              provider: "missing",
              model: "mock-planner",
              permissionMode: "manual"
            }
          ]
        }),
      /unconfigured provider/
    );
  });

  it("accepts non-secret provider parameters", () => {
    const manifest = parseProjectManifest({
      ...validManifest,
      providers: [
        {
          id: "mock",
          type: "mock",
          defaultModel: "mock-planner",
          parameters: {
            temperature: 0,
            mode: "deterministic"
          }
        }
      ]
    });

    assert.equal(manifest.providers[0]?.parameters.temperature, 0);
  });
});
