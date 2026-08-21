"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getCapabilities,
  isProductionRuntimeReady,
} from "@/features/applications/desktop-bridge";
import {
  acceptResumeProposal,
  advanceOnboardingStep,
  createResumeProposals,
  declineResumeProposal,
  deleteAvatar,
  fetchLocalAiReadiness,
  fetchProfileResumes,
  runLocalAiSelfTest,
  sanitizedErrorMessage,
  updateProfile,
  uploadAvatar,
} from "../api";
import { dispatchProfileReadinessRefresh } from "../events";
import { useProfile } from "../ProfileProvider";
import { composeProductReadiness } from "../readiness";
import {
  ONBOARDING_STEP_LABELS,
  ONBOARDING_STEPS,
  type ApplicantProfile,
  type AvatarCrop,
  type LocalAiProposal,
  type LocalAiReadiness,
  type OnboardingStep,
  type ProfileResume,
} from "../types";
import {
  ApplicationFactsForm,
  factsFromProfile,
  factsToFields,
  type ApplicationFactsDraft,
} from "./ApplicationFactsForm";
import { AvatarCropper } from "./AvatarCropper";
import { ExtractionReview } from "./ExtractionReview";
import { FileDropZone } from "./FileDropZone";
import { TextField } from "./FieldEditors";
import { ReadinessPanel } from "./ReadinessPanel";
import { ResumeDocumentManager } from "./ResumeDocumentManager";

function stepIndex(step: string): number {
  const index = ONBOARDING_STEPS.indexOf(step as OnboardingStep);
  return index >= 0 ? index : 0;
}

function previousStep(step: OnboardingStep): OnboardingStep | null {
  const index = stepIndex(step);
  return index > 0 ? ONBOARDING_STEPS[index - 1]! : null;
}

export function OnboardingWizard() {
  const {
    activeProfile,
    scopeKey,
    createProfile,
    refresh,
    setActiveProfileState,
    isLoading,
  } = useProfile();

  const [step, setStep] = useState<OnboardingStep>("profile");
  const [displayName, setDisplayName] = useState("");
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarCrop, setPendingAvatarCrop] = useState<AvatarCrop | null>(
    null,
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<LocalAiProposal | null>(null);
  const [facts, setFacts] = useState<ApplicationFactsDraft | null>(null);
  const [resumes, setResumes] = useState<ProfileResume[]>([]);
  const [desktopReady, setDesktopReady] = useState(false);
  const [localAi, setLocalAi] = useState<LocalAiReadiness | null>(null);
  const [selfTestBusy, setSelfTestBusy] = useState(false);

  useEffect(() => {
    if (!activeProfile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resume wizard from server onboarding_step
      setStep("profile");
      return;
    }
    const saved = activeProfile.onboarding_step as OnboardingStep;
    setStep(ONBOARDING_STEPS.includes(saved) ? saved : "profile");
    setDisplayName(activeProfile.display_name);
    setFacts(factsFromProfile(activeProfile));
  }, [activeProfile]);

  useEffect(() => {
    void getCapabilities().then((capabilities) => {
      setDesktopReady(isProductionRuntimeReady(capabilities));
    });
  }, [scopeKey, step]);

  const readiness = useMemo(
    () =>
      composeProductReadiness({
        profile: activeProfile,
        resumes,
        desktopReady,
        localAi,
      }),
    [activeProfile, resumes, desktopReady, localAi],
  );

  const persistStep = useCallback(
    async (profile: ApplicantProfile, target: OnboardingStep, completed = false) => {
      const updated = await advanceOnboardingStep(
        profile.id,
        profile.version,
        target,
        completed,
      );
      setActiveProfileState(updated);
      setStep(target);
      return updated;
    },
    [setActiveProfileState],
  );

  async function handleCreateApplicant() {
    setErrors([]);
    if (!displayName.trim()) {
      setErrors(["Enter a display name to continue."]);
      return;
    }
    setBusy(true);
    try {
      let profile = activeProfile;
      if (!profile) {
        profile = await createProfile({
          display_name: displayName.trim(),
          onboarding_step: "profile",
        });
      } else if (profile.display_name !== displayName.trim()) {
        profile = await updateProfile(profile.id, {
          expected_version: profile.version,
          display_name: displayName.trim(),
        });
        setActiveProfileState(profile);
      }

      if (pendingAvatarFile) {
        await uploadAvatar(
          profile.id,
          pendingAvatarFile,
          pendingAvatarCrop ?? undefined,
        );
        setPendingAvatarFile(null);
        setPendingAvatarCrop(null);
        if (avatarPreviewUrl) {
          URL.revokeObjectURL(avatarPreviewUrl);
          setAvatarPreviewUrl(null);
        }
        await refresh();
      }

      const latest = await persistStep(profile, "resume");
      setFacts(factsFromProfile(latest));
    } catch (err) {
      setErrors([sanitizedErrorMessage(err)]);
    } finally {
      setBusy(false);
    }
  }

  async function handleResumeContinue() {
    if (!activeProfile) {
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      const currentResumes = await fetchProfileResumes(activeProfile.id);
      setResumes(currentResumes);
      if (currentResumes.length === 0) {
        setErrors(["Upload at least one PDF or DOCX resume to continue."]);
        return;
      }
      const defaultResume =
        currentResumes.find((item) => item.is_default) ?? currentResumes[0]!;
      if (defaultResume.managed_asset_id) {
        try {
          const created = await createResumeProposals(
            activeProfile.id,
            defaultResume.managed_asset_id,
          );
          setProposal(created);
        } catch {
          setProposal(null);
        }
      }
      await persistStep(activeProfile, "review");
    } catch (err) {
      setErrors([sanitizedErrorMessage(err)]);
    } finally {
      setBusy(false);
    }
  }

  async function handleFactsContinue() {
    if (!activeProfile || !facts) {
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      const fields = factsToFields(facts);
      const updated = await updateProfile(activeProfile.id, {
        expected_version: activeProfile.version,
        ...fields,
      });
      setActiveProfileState(updated);
      await persistStep(updated, "automation");
    } catch (err) {
      setErrors([sanitizedErrorMessage(err)]);
    } finally {
      setBusy(false);
    }
  }

  async function refreshAutomationChecks() {
    const [ai, currentResumes] = await Promise.all([
      fetchLocalAiReadiness().catch(() => null),
      activeProfile
        ? fetchProfileResumes(activeProfile.id)
        : Promise.resolve([] as ProfileResume[]),
    ]);
    setLocalAi(ai);
    setResumes(currentResumes);
    const capabilities = await getCapabilities();
    setDesktopReady(isProductionRuntimeReady(capabilities));
    dispatchProfileReadinessRefresh();
  }

  async function handleAutomationContinue() {
    if (!activeProfile) {
      return;
    }
    setErrors([]);
    setBusy(true);
    try {
      await refreshAutomationChecks();
      await persistStep(activeProfile, "ready", true);
    } catch (err) {
      setErrors([sanitizedErrorMessage(err)]);
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <p role="status" aria-live="polite">
        Loading onboarding…
      </p>
    );
  }

  return (
    <div className="onboarding-wizard">
      <header className="onboarding-header">
        <h1>Set up your profile</h1>
        <p>
          Guided setup for a local personal job tool. You can revisit any step from
          Profile later.
        </p>
        {activeProfile ? (
          <p className="onboarding-active-applicant">
            Active applicant: <strong>{activeProfile.display_name}</strong>
          </p>
        ) : null}
      </header>

      <ol className="onboarding-stepper" aria-label="Onboarding progress">
        {ONBOARDING_STEPS.map((item, index) => {
          const currentIndex = stepIndex(step);
          const state =
            index < currentIndex
              ? "complete"
              : index === currentIndex
                ? "current"
                : "upcoming";
          return (
            <li key={item} data-state={state}>
              <span className="onboarding-step-index">{index + 1}</span>
              <span>{ONBOARDING_STEP_LABELS[item]}</span>
            </li>
          );
        })}
      </ol>

      {errors.length > 0 ? (
        <div className="onboarding-error-summary" role="alert" tabIndex={-1}>
          <h2>Please fix the following</h2>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="onboarding-step-panel" aria-labelledby="onboarding-step-title">
        <h2 id="onboarding-step-title">{ONBOARDING_STEP_LABELS[step]}</h2>

        {step === "profile" ? (
          <div className="onboarding-step-body">
            <TextField
              id="onboarding-display-name"
              label="Display name"
              required
              value={displayName}
              onChange={setDisplayName}
              hint="Shown in the profile switcher and application summaries."
            />
            {avatarPreviewUrl && pendingAvatarFile && !pendingAvatarCrop ? (
              <AvatarCropper
                imageUrl={avatarPreviewUrl}
                onCancel={() => {
                  URL.revokeObjectURL(avatarPreviewUrl);
                  setAvatarPreviewUrl(null);
                  setPendingAvatarFile(null);
                  setPendingAvatarCrop(null);
                }}
                onConfirm={(crop) => {
                  setPendingAvatarCrop(crop);
                }}
              />
            ) : (
              <FileDropZone
                kind="avatar"
                label="Optional profile photo"
                hint="PNG, JPEG, or WebP. You can crop after selecting."
                onFile={(file) => {
                  if (avatarPreviewUrl) {
                    URL.revokeObjectURL(avatarPreviewUrl);
                  }
                  setPendingAvatarCrop(null);
                  setPendingAvatarFile(file);
                  setAvatarPreviewUrl(URL.createObjectURL(file));
                }}
              />
            )}
            {pendingAvatarFile && pendingAvatarCrop ? (
              <p role="status">Photo ready — continue to save it with your profile.</p>
            ) : null}
            {activeProfile?.avatar_asset_id ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void deleteAvatar(activeProfile.id).then(() => refresh());
                }}
              >
                Remove current photo
              </Button>
            ) : null}
          </div>
        ) : null}

        {step === "resume" && activeProfile ? (
          <div className="onboarding-step-body">
            <ResumeDocumentManager
              profileId={activeProfile.id}
              scopeKey={scopeKey}
              onChanged={setResumes}
            />
          </div>
        ) : null}

        {step === "review" ? (
          <div className="onboarding-step-body">
            {proposal ? (
              <ExtractionReview
                proposal={proposal}
                busy={busy}
                onAcceptSelected={async ({ acceptedPaths, edits }) => {
                  if (!activeProfile) {
                    return;
                  }
                  setBusy(true);
                  try {
                    const result = await acceptResumeProposal(
                      activeProfile.id,
                      proposal.id,
                      {
                        accepted_field_paths: acceptedPaths,
                        field_edits: edits,
                        expected_profile_version: activeProfile.version,
                      },
                    );
                    setActiveProfileState(result.profile);
                    setProposal(result.proposal);
                    await persistStep(result.profile, "facts");
                    setFacts(factsFromProfile(result.profile));
                  } catch (err) {
                    setErrors([sanitizedErrorMessage(err)]);
                  } finally {
                    setBusy(false);
                  }
                }}
                onDeclineAll={async () => {
                  if (!activeProfile) {
                    return;
                  }
                  setBusy(true);
                  try {
                    if (proposal) {
                      await declineResumeProposal(
                        activeProfile.id,
                        proposal.id,
                        activeProfile.version,
                      );
                    }
                    await persistStep(activeProfile, "facts");
                  } catch (err) {
                    setErrors([sanitizedErrorMessage(err)]);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            ) : (
              <div>
                <p>
                  No automatic suggestions are available. Continue to enter application
                  facts yourself.
                </p>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (activeProfile) {
                      void persistStep(activeProfile, "facts");
                    }
                  }}
                >
                  Continue
                </Button>
              </div>
            )}
          </div>
        ) : null}

        {step === "facts" && facts ? (
          <div className="onboarding-step-body">
            <ApplicationFactsForm value={facts} onChange={setFacts} />
          </div>
        ) : null}

        {step === "automation" ? (
          <div className="onboarding-step-body">
            <p>
              We check the desktop automation runtime and your local model service.
              Search still works if the model is unavailable.
            </p>
            <Button
              type="button"
              variant="secondary"
              disabled={selfTestBusy}
              onClick={() => {
                setSelfTestBusy(true);
                void runLocalAiSelfTest()
                  .then(() => refreshAutomationChecks())
                  .catch(() => setErrors(["Unable to run the local model self-test."]))
                  .finally(() => setSelfTestBusy(false));
              }}
            >
              {selfTestBusy ? "Running self-test…" : "Run local model self-test"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void refreshAutomationChecks()}
            >
              Refresh checks
            </Button>
            <ReadinessPanel readiness={readiness} title="Current checks" />
          </div>
        ) : null}

        {step === "ready" ? (
          <div className="onboarding-step-body">
            <ReadinessPanel
              readiness={readiness}
              title="You're set"
              onRetrySelfTest={async () => {
                setSelfTestBusy(true);
                try {
                  await runLocalAiSelfTest();
                  await refreshAutomationChecks();
                } finally {
                  setSelfTestBusy(false);
                }
              }}
              selfTestBusy={selfTestBusy}
            />
            <div className="onboarding-finish-actions">
              <Link className="btn" href="/jobs">
                Search jobs
              </Link>
              <Link className="btn btn-secondary" href="/profile">
                Open Profile
              </Link>
            </div>
          </div>
        ) : null}
      </section>

      <footer className="onboarding-footer">
        <Button
          type="button"
          variant="outline"
          disabled={busy || !previousStep(step)}
          onClick={() => {
            const previous = previousStep(step);
            if (previous) {
              setStep(previous);
              setErrors([]);
            }
          }}
        >
          Back
        </Button>
        {step === "profile" ? (
          <Button type="button" disabled={busy} onClick={() => void handleCreateApplicant()}>
            {busy ? "Saving…" : "Continue"}
          </Button>
        ) : null}
        {step === "resume" ? (
          <Button type="button" disabled={busy} onClick={() => void handleResumeContinue()}>
            {busy ? "Working…" : "Continue"}
          </Button>
        ) : null}
        {step === "facts" ? (
          <Button type="button" disabled={busy} onClick={() => void handleFactsContinue()}>
            {busy ? "Saving…" : "Continue"}
          </Button>
        ) : null}
        {step === "automation" ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() => void handleAutomationContinue()}
          >
            {busy ? "Saving…" : "See readiness result"}
          </Button>
        ) : null}
      </footer>
    </div>
  );
}
