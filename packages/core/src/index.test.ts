import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getBadockHealth } from "./index";

describe("getBadockHealth", () => {
  it("reports the CLI-first core as healthy", () => {
    assert.deepEqual(
      {
        name: getBadockHealth().name,
        status: getBadockHealth().status,
        mode: getBadockHealth().mode
      },
      {
      name: "BadocK",
      status: "ok",
      mode: "cli-first"
      }
    );
  });
});
