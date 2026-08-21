import type { ApplicantProfile, LocalAiReadiness, ProductReadiness, ProfileResume } from "./types";

function fieldProvided(profile: ApplicantProfile, name: keyof ApplicantProfile): boolean {
  const field = profile[name];
  if (!field || typeof field !== "object" || !("state" in field)) {
    return false;
  }
  const confirmed = field as { state: string; value: unknown };
  return (
    confirmed.state === "provided" &&
    confirmed.value !== null &&
    confirmed.value !== "" &&
    !(Array.isArray(confirmed.value) && confirmed.value.length === 0)
  );
}

export function composeProductReadiness(input: {
  profile: ApplicantProfile | null;
  resumes: ProfileResume[];
  desktopReady: boolean;
  localAi: LocalAiReadiness | null;
}): ProductReadiness {
  const blockers: string[] = [];
  const exceptions: string[] = [];
  const actions: ProductReadiness["actions"] = [];

  if (!input.profile) {
    blockers.push("Create an applicant profile");
    actions.push({
      id: "create-profile",
      label: "Start onboarding",
      href: "/onboarding",
    });
  } else {
    const identityOk =
      fieldProvided(input.profile, "first_name") &&
      fieldProvided(input.profile, "last_name") &&
      fieldProvided(input.profile, "email");
    if (!identityOk) {
      blockers.push("Confirm your name and email");
      actions.push({
        id: "identity",
        label: "Complete contact details",
        href: "/profile",
      });
    }
  }

  const hasDefaultResume = input.resumes.some((resume) => resume.is_default);
  const hasAnyResume = input.resumes.length > 0;
  if (!hasAnyResume || !hasDefaultResume) {
    blockers.push("Upload a default resume");
    actions.push({
      id: "resume",
      label: "Add a resume",
      href: "/profile",
    });
  }

  if (!input.desktopReady) {
    blockers.push("Open the desktop app for Auto Apply");
    actions.push({
      id: "desktop",
      label: "Open Job Engine desktop",
    });
  }

  if (!input.localAi || !input.localAi.local_ai_ready) {
    exceptions.push(
      input.localAi?.local_ai_failure_code
        ? localAiFailureGuidance(input.localAi.local_ai_failure_code)
        : "Local AI is not ready yet",
    );
    actions.push({
      id: "local-ai",
      label: "Check local model setup",
      href: "/profile",
    });
  }

  if (input.profile && !fieldProvided(input.profile, "work_authorizations")) {
    exceptions.push("Work authorization is still unanswered");
  }
  if (input.profile && !fieldProvided(input.profile, "compensation_expectation")) {
    exceptions.push("Compensation preferences are optional but unanswered");
  }

  if (blockers.length > 0) {
    return {
      label: "Setup required",
      blockers,
      exceptions,
      actions: dedupeActions(actions),
    };
  }
  if (exceptions.length > 0) {
    return {
      label: "Ready with exceptions",
      blockers,
      exceptions,
      actions: dedupeActions(actions),
    };
  }
  return {
    label: "Ready for Auto Apply",
    blockers,
    exceptions,
    actions: [],
  };
}

function localAiFailureGuidance(code: string): string {
  switch (code) {
    case "not_configured":
      return "Configure a local model service to enable AI suggestions";
    case "runtime_unreachable":
      return "Local model service is unreachable";
    case "model_missing":
      return "Selected local model is not available";
    case "queue_full":
      return "Local model is busy — try again shortly";
    case "timeout":
      return "Local model timed out during the last check";
    case "invalid_structure":
    case "ungrounded":
      return "Local model self-test failed — retry from Profile";
    default:
      return "Local AI needs attention";
  }
}

function dedupeActions(
  actions: ProductReadiness["actions"],
): ProductReadiness["actions"] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.id)) {
      return false;
    }
    seen.add(action.id);
    return true;
  });
}
