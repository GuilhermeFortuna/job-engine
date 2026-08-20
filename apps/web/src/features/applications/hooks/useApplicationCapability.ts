"use client";

import { useMemo } from "react";
import { useApplicationReadiness } from "./useApplicationReadiness";
import { useDesktopCapability } from "./useDesktopCapability";
import {
  CHECKING_CAPABILITY,
  resolveApplicationCapability,
  type CapabilityInputs,
} from "../projections";

export interface ApplicationCapabilityIdentity {
  readonly readinessRevision: number;
  readonly desktopRevision: number;
  readonly readinessLoading: boolean;
  readonly desktopLoading: boolean;
  readonly productionRuntimeAvailable: boolean;
  readonly applicationUrl: string | null | undefined;
  readonly profileExists: boolean;
  readonly registeredResumeExists: boolean;
  readonly providerTier: CapabilityInputs["providerTier"];
}

export function useApplicationCapability(
  applicationUrl: string | null | undefined,
  providerTier: CapabilityInputs["providerTier"],
) {
  const readiness = useApplicationReadiness();
  const desktop = useDesktopCapability();
  const productionRuntimeAvailable =
    desktop.capabilities?.productionRuntime === true;
  const profileExists = readiness.profile !== null;
  const registeredResumeExists = readiness.resumes.length > 0;
  const capability =
    readiness.isLoading || desktop.isLoading
      ? CHECKING_CAPABILITY
      : resolveApplicationCapability({
          productionRuntimeAvailable,
          applicationUrl,
          profileExists,
          registeredResumeExists,
          providerTier,
        });
  const confirmationIdentity = useMemo<ApplicationCapabilityIdentity>(
    () => ({
      readinessRevision: readiness.revision ?? 0,
      desktopRevision: desktop.revision,
      readinessLoading: readiness.isLoading,
      desktopLoading: desktop.isLoading,
      productionRuntimeAvailable,
      applicationUrl,
      profileExists,
      registeredResumeExists,
      providerTier,
    }),
    [
      applicationUrl,
      desktop.isLoading,
      desktop.revision,
      productionRuntimeAvailable,
      profileExists,
      providerTier,
      readiness.isLoading,
      readiness.revision,
      registeredResumeExists,
    ],
  );

  return {
    capability,
    confirmationIdentity,
    readiness,
  };
}
