import { describe, expect, it } from "vitest";

import { createDefaultAdapterRegistry } from "../../src/main/adapters/registry";
import {
  inventoryPathFamily,
  selectAdapter,
} from "../../src/main/adapters/selection";
import { AshbyFormAdapter } from "../../src/main/adapters/ashby";
import { AdapterRegistry } from "../../src/main/adapters/registry";
import { GenericFormAdapter } from "../../src/main/adapters/generic";
import { GreenhouseFormAdapter } from "../../src/main/adapters/greenhouse";
import { LeverFormAdapter } from "../../src/main/adapters/lever";

describe("selectAdapter", () => {
  const registry = createDefaultAdapterRegistry();

  it("binds the platform adapter the visible host matches", () => {
    expect(
      selectAdapter(
        registry,
        { platform_adapter_id: "generic", application_url: "https://x.test" },
        "https://boards.greenhouse.io/acme/jobs/1",
      ).adapter?.adapterId,
    ).toBe("greenhouse");
  });

  it("falls back to the frozen canonical URL before the named adapter", () => {
    expect(
      selectAdapter(
        registry,
        {
          platform_adapter_id: "lever",
          application_url: "https://unknown.example.test/apply",
          canonical_application_url: "https://boards.greenhouse.io/acme/jobs/1",
        },
        "https://unknown.example.test/apply",
      ).adapter?.adapterId,
    ).toBe("greenhouse");
  });

  it("accepts the backend-named adapter only for a loopback page", () => {
    expect(
      selectAdapter(
        registry,
        {
          platform_adapter_id: "greenhouse",
          application_url: "https://127.0.0.1:8443/greenhouse/standard",
        },
        "https://127.0.0.1:8443/greenhouse/standard",
      ).adapter?.adapterId,
    ).toBe("greenhouse");
  });

  it("never lets the named adapter override a public non-matching host", () => {
    expect(
      selectAdapter(
        registry,
        {
          platform_adapter_id: "greenhouse",
          application_url: "https://careers.unknown.example.test/apply",
        },
        "https://careers.unknown.example.test/apply",
      ).adapter?.adapterId,
    ).toBe("generic");
  });

  it("vetoes a hostile lookalike visible URL even when canonical is Greenhouse", () => {
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

  it("vetoes feed listing URLs unconditionally", () => {
    const result = selectAdapter(
      registry,
      {
        platform_adapter_id: "generic",
        application_url: "https://himalayas.app/companies/acme/jobs/staff",
        canonical_application_url: "https://boards.greenhouse.io/acme/jobs/1",
      },
      "https://himalayas.app/companies/acme/jobs/staff",
    );
    expect(result.adapter).toBeNull();
    expect(result.vetoReason).toBe("FEED_LISTING_UNRESOLVED");
  });

  it("vetoes Ashby and SmartRecruiters as missing adapter evidence", () => {
    expect(
      selectAdapter(
        registry,
        {
          platform_adapter_id: "generic",
          application_url: "https://jobs.ashbyhq.com/acme/role-1",
          canonical_application_url: "https://boards.greenhouse.io/acme/jobs/1",
        },
        "https://jobs.ashbyhq.com/acme/role-1",
      ),
    ).toEqual({ adapter: null, vetoReason: "MISSING_ADAPTER_EVIDENCE" });
    expect(
      selectAdapter(
        registry,
        {
          platform_adapter_id: "generic",
          application_url: "https://jobs.smartrecruiters.com/acme/abc/slug",
        },
        "https://jobs.smartrecruiters.com/acme/abc/slug",
      ),
    ).toEqual({ adapter: null, vetoReason: "MISSING_ADAPTER_EVIDENCE" });
  });

  it("vetoes Workday via LEGAL_GATE even when canonical is Greenhouse", () => {
    expect(
      selectAdapter(
        registry,
        {
          platform_adapter_id: "greenhouse",
          application_url:
            "https://acme.myworkdayjobs.com/en-US/careers/job/Role",
          canonical_application_url: "https://boards.greenhouse.io/acme/jobs/1",
        },
        "https://acme.myworkdayjobs.com/en-US/careers/job/Role",
      ),
    ).toEqual({ adapter: null, vetoReason: "LEGAL_GATE" });
  });

  it("vetoes PLATFORM_DRIFT when visible and canonical disagree on family", () => {
    const result = selectAdapter(
      registry,
      {
        platform_adapter_id: "greenhouse",
        application_url: "https://boards.greenhouse.io/acme/jobs/1",
        canonical_application_url: "https://jobs.lever.co/acme/role/apply",
      },
      "https://boards.greenhouse.io/acme/jobs/1",
    );
    expect(result.adapter).toBeNull();
    expect(result.vetoReason).toBe("PLATFORM_DRIFT");
  });

  it("does not drive a loopback-named adapter that is capability-vetoed", () => {
    const registryWithAshby = new AdapterRegistry(
      [
        new GreenhouseFormAdapter(),
        new LeverFormAdapter(),
        new AshbyFormAdapter(),
      ],
      new GenericFormAdapter(),
    );
    const result = selectAdapter(
      registryWithAshby,
      {
        platform_adapter_id: "ashby",
        application_url: "https://127.0.0.1:8443/ashby/form",
      },
      "https://127.0.0.1:8443/ashby/form",
    );
    expect(result.adapter).toBeNull();
    expect(result.vetoReason).toBe("MISSING_ADAPTER_EVIDENCE");
  });

  it("falls approved ATS hosts with unapproved paths through to generic", () => {
    const result = selectAdapter(
      registry,
      {
        platform_adapter_id: "generic",
        application_url: "https://boards.greenhouse.io/embed/job_app",
      },
      "https://boards.greenhouse.io/embed/job_app",
    );
    expect(result.adapter?.adapterId).toBe("generic");
    expect(result.vetoReason).toBeNull();
  });
});

describe("inventoryPathFamily", () => {
  it("templates numeric and slug-id path segments", () => {
    expect(
      inventoryPathFamily("https://jobicy.com/jobs/150001-python-engineer-brazil"),
    ).toBe("jobicy.com/jobs/{id}-{slug}");
    expect(
      inventoryPathFamily("https://boards.greenhouse.io/acme/jobs/12345"),
    ).toBe("boards.greenhouse.io/acme/jobs/{id}");
    expect(
      inventoryPathFamily(
        "https://himalayas.app/companies/globex/jobs/python-engineer",
      ),
    ).toBe("himalayas.app/companies/{slug}/jobs/{slug}");
  });
});
