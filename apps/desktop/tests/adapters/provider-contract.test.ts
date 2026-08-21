import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APPROVED_GREENHOUSE_HOSTS } from "../../src/main/adapters/greenhouse";
import { APPROVED_LEVER_HOST } from "../../src/main/adapters/lever";
import { createDefaultAdapterRegistry } from "../../src/main/adapters/registry";
import { selectAdapter } from "../../src/main/adapters/selection";

const contractPath = join(
  __dirname,
  "..",
  "fixtures",
  "provider-host-path-contract.json",
);

describe("BACK-016 provider host/path contract", () => {
  const contract = JSON.parse(readFileSync(contractPath, "utf8")) as {
    providers: {
      greenhouse: { allowed_hosts: string[]; desktop_adapter_id: string };
      lever: { allowed_hosts: string[]; desktop_adapter_id: string };
    };
  };
  const registry = createDefaultAdapterRegistry();

  it("matches desktop allowlists to the shared contract fixture", () => {
    expect([...APPROVED_GREENHOUSE_HOSTS].sort()).toEqual(
      [...contract.providers.greenhouse.allowed_hosts].sort(),
    );
    expect(APPROVED_LEVER_HOST).toBe(contract.providers.lever.allowed_hosts[0]);
    expect(contract.providers.greenhouse.desktop_adapter_id).toBe("greenhouse");
    expect(contract.providers.lever.desktop_adapter_id).toBe("lever");
  });

  it("selects greenhouse and lever from contract-shaped URLs", () => {
    expect(
      selectAdapter(
        registry,
        {
          platform_adapter_id: "generic",
          application_url: "https://boards.greenhouse.io/acme/jobs/99",
        },
        "https://boards.greenhouse.io/acme/jobs/99",
      ).adapter?.adapterId,
    ).toBe("greenhouse");
    expect(
      selectAdapter(
        registry,
        {
          platform_adapter_id: "generic",
          application_url: "https://jobs.lever.co/acme/uuid/apply",
        },
        "https://jobs.lever.co/acme/uuid/apply",
      ).adapter?.adapterId,
    ).toBe("lever");
  });

  it("retains lookalike veto for contract-shaped impostors", () => {
    const result = selectAdapter(
      registry,
      {
        platform_adapter_id: "greenhouse",
        application_url: "https://evil.boards.greenhouse.io/acme/jobs/1",
        canonical_application_url: "https://boards.greenhouse.io/acme/jobs/1",
      },
      "https://evil.boards.greenhouse.io/acme/jobs/1",
    );
    expect(result.adapter).toBeNull();
    expect(result.vetoReason).toBe("LOOKALIKE_HOST");
  });
});
