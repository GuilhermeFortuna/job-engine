# Job Engine Local-First Product Direction

**Status:** Owner direction captured; implementation pending  
**Audience:** Product planners, implementation agents, and reviewers  
**Purpose:** Record the intended evolution of Job Engine as a local, personal,
multi-profile job-hunting system with useful batch Auto Apply and local AI.

## 1. Product purpose

Job Engine is intended to run locally as a personal job-hunting application. It
is not being designed first as a hosted multi-tenant service. The application
should take advantage of the user's local machine, keep applicant data local by
default, and optimize for completing real job-search and application workflows.

The primary owner machine currently provides:

- 16 CPU cores and 32 threads
- 32 GB of system RAM
- An NVIDIA RTX 2060 with 6 GB of VRAM

This hardware should be treated as useful execution capacity. Local CPU and RAM
make concurrent catalog, browser, parsing, and application work practical. The
GPU makes compact local language models practical. Local execution does not
incur per-token or per-job processing charges, although time, memory, VRAM, and
external website limits remain finite resources.

## 2. Intended user experience

The application should support a complete personal workflow:

1. Create or select an applicant profile.
2. Complete simple guided onboarding.
3. Search for jobs across roles and industries.
4. Review jobs and explicitly select several suitable positions.
5. Choose the applicant profile and resume for the batch.
6. Authorize Auto Apply once for the exact selected jobs.
7. Let a durable local queue process supported applications concurrently.
8. Intervene only when an application presents a genuine unresolved exception.
9. Review progress, failures, submissions, and receipts in the application.

The system must not be limited to software-engineering jobs. The repository may
retain technology-oriented filters where they are useful, but product copy,
profiles, search, onboarding, and application automation must support other job
families. Another person, such as the owner's mother, should be able to use the
same local installation with her own isolated profile and application data.

Job Engine may later use profile information to rank or suggest suitable jobs.
The profile model should support that future capability, but the user remains
responsible for selecting which jobs enter an application batch. Job suggestion
logic is not authorization to apply autonomously.

## 3. Applicant profiles

Applicant identity must become a first-class product concept rather than one
global application-settings record.

Each applicant profile must have isolated:

- identity and contact information
- avatar
- resumes and supporting documents
- employment and education history
- skills, languages, certifications, and professional links
- location, remote-work, compensation, relocation, and travel preferences
- work-authorization and sponsorship facts
- reusable application answers and answer history
- optional demographic-answer preferences
- Auto Apply preferences and readiness state
- application batches, runs, exceptions, and history

The UI must provide an obvious profile switcher. Search, job selection, batch
authorization, and application history must always make the active applicant
clear. Information from one profile must never be silently combined with or
used for another profile.

Every authorized application batch must freeze the selected applicant profile,
resume, relevant answer/profile versions, selected job IDs, and automation mode.
Later profile edits must not silently change an already authorized batch.

### Profile picture

Each profile may have an optional picture selected through a file picker or
drag-and-drop flow. The application should copy it into managed local storage,
offer a simple crop/preview experience, and display it in the profile page,
profile switcher, onboarding summary, and batch-authorization summary.

A profile picture is a local avatar by default. It must not be uploaded as part
of a job application unless a separate application-photo capability is
explicitly enabled and selected by the user.

## 4. Guided onboarding

Onboarding must replace the current developer-oriented setup experience. A user
must not need to understand repository directories, configure resume paths,
write Markdown, edit JSON, or enter internal identifiers to become ready.

The intended onboarding flow is:

### Step 1: Create the applicant

- Enter a display name and optionally select a profile picture.
- Create an isolated applicant workspace.

### Step 2: Add a resume

- Select or drag in a normal resume file, initially PDF or DOCX.
- Copy the source into managed local storage.
- Preserve an application-ready file for later upload.
- Extract a proposed profile from the resume using deterministic parsing and,
  when configured, the local AI provider.

### Step 3: Review extracted information

- Present ordinary form controls for contact details, employment, education,
  skills, languages, certifications, and links.
- Clearly distinguish extracted suggestions from user-confirmed facts.
- Let the user correct or decline information without editing raw structured
  data.

### Step 4: Confirm application facts and preferences

- Collect work authorization, sponsorship, availability, notice period,
  location preferences, compensation expectations, relocation, and travel
  preferences in plain language.
- Make optional demographic behavior explicit.
- Do not require every reusable answer before the user can begin searching.
  New application questions may be resolved progressively and optionally saved
  for future use.

### Step 5: Verify automation readiness

- Detect the desktop automation runtime.
- Detect the configured local-model service and selected model.
- Run a small structured-response self-test.
- Report exact missing prerequisites or failures.

### Step 6: Finish with a clear readiness result

The UI must show one understandable outcome:

- **Ready for Auto Apply**
- **Ready with exceptions**
- **Setup required**, with the exact remaining actions

After onboarding, the same information must remain editable on a dedicated
**Profile** page. The existing application-settings concepts should be presented
there as a coherent applicant profile rather than as independent technical
configuration sections.

## 5. Executable job sources and truthful capability

Job discovery sources and application platforms are different concerns.
Aggregator sources such as Himalayas, Jobicy, and Remote OK may remain useful
for finding jobs, but an aggregator listing URL is not necessarily an executable
application form.

Auto Apply should prioritize jobs obtained from or resolved to application
platforms that expose a direct and structurally automatable application path.
Greenhouse and Lever are the initial priority because Job Engine already has
browser adapters for them and their hosted application URLs and forms are
predictable enough to automate.

The catalog should add ATS-native sources or other approved sources that provide
direct application targets. For every job, the system must preserve the source
listing URL separately from the resolved application-target URL.

The user-facing action must reflect actual capability:

- Show **Auto Apply** only when a direct application target is resolved and a
  production-capable adapter can execute it.
- Show an assisted or external-application action when the job remains useful
  but cannot be completed automatically.
- Never create an Auto Apply run against a known aggregator listing page.
- Never present a generic step error or empty application workspace when the
  actual problem is an unresolved application target.

The system should deliver reliable automation for supported providers rather
than claim broad coverage over URLs that cannot lead directly to an application.

## 6. Batch Auto Apply and local concurrency

The owner must be able to select several jobs judged suitable and submit them as
one application batch. The authorization summary must identify the applicant,
resume, exact jobs, automation mode, and any known exceptions before the batch
starts.

The existing durable application queue should evolve into a visible local
pipeline with:

- multi-select job actions
- one authorization for the exact selected batch
- queued, running, needs-attention, submitted, failed, and cancelled states
- per-job progress and receipt history
- pause and resume behavior for genuine exceptions
- duplicate protection and one-shot submission reconciliation
- restart-safe persistence

Execution should use a configurable worker pool instead of a single active run.
The implementation should exploit local CPU/RAM concurrency for browser and
pipeline work while maintaining isolated run state, pages, evidence, resume
files, and applicant snapshots. Concurrency must be configurable so the owner
can tune it to the machine and external platform behavior.

Local hardware capacity does not authorize bypassing authentication, CAPTCHA,
platform access controls, or ambiguous-submission safeguards. These conditions
remain visible exceptions rather than silent retries.

## 7. Local AI

Local AI is a core intended capability, both to improve Auto Apply and to give
the owner practical experience integrating AI into a real application.

The initial target is a compact quantized model that runs effectively on the
RTX 2060 with 6 GB of VRAM. The model must remain configurable so newer and
better small models can be evaluated without redesigning the application.
Ollama or another loopback OpenAI-compatible runtime is an appropriate local
transport.

The application should use the local model for bounded, high-volume tasks such
as:

- proposing structured profile data from a resume
- classifying unfamiliar application questions
- mapping nonstandard labels to known applicant fields
- drafting grounded narrative answers from confirmed profile and job evidence
- tailoring short summaries or cover-letter content
- interpreting validation feedback and proposing the next bounded action
- supporting future explainable job matching or suggestions

The local model should not independently select jobs, own browser navigation,
upload files, activate submission, invent applicant facts, or override
deterministic application state. Browser operations remain deterministic and
auditable. Model output must use structured contracts and remain grounded in
the selected applicant's confirmed data.

Deterministic profile and reusable answers should run before AI generation.
Sensitive facts such as work authorization, sponsorship, legal attestations,
consent, and demographic responses must come from explicit profile data or user
input rather than model invention.

Several browser workers may wait on one shared local-model service. The system
should keep one GPU-resident model and coordinate inference requests instead of
loading one model copy per application. Local inference should be governed by
context, request, concurrency, timeout, and memory limits rather than artificial
per-token dollar limits. Optional cloud providers may retain separate privacy
and cost controls.

## 8. Profile page information architecture

The dedicated Profile page should provide these user-facing areas:

- **Overview:** avatar, applicant identity, contact information, and readiness
- **Resume and documents:** upload, preview, default selection, and extracted data
- **Experience:** employment, education, skills, languages, and certifications
- **Application information:** authorization, availability, compensation,
  location, and reusable answers
- **Job preferences:** desired roles, locations, remote preference, employment
  types, and compensation preferences
- **Automation:** default resume, Auto Apply preferences, local-model status,
  runtime status, and concurrency preferences
- **Readiness:** blocking gaps, warnings, and self-test results

The page must use ordinary labeled controls, repeatable editors, file pickers,
previews, and clear confirmation states. Raw JSON, repository-relative file
paths, checksums, internal UUIDs, and policy implementation details must not be
required for normal use.

## 9. Acceptance outcomes

The evolved product is successful when all of the following are true:

1. From a fresh local installation, a non-developer can create an applicant
   profile, optionally add a picture, upload a resume, review extracted facts,
   and reach a clear readiness state without editing files or JSON.
2. Two applicant profiles can coexist without sharing resumes, answers,
   preferences, application batches, or history.
3. Search and visible copy work for software-engineering and non-engineering
   roles.
4. The catalog contains jobs with direct, executable Greenhouse and Lever
   application targets.
5. Aggregator-only jobs remain useful for discovery but are not falsely labeled
   Auto Apply.
6. A user can select multiple executable jobs, choose an applicant and resume,
   authorize the exact batch once, and observe durable queue progress.
7. Multiple supported applications can make progress concurrently on the local
   machine without mixing pages, profiles, resumes, evidence, or receipts.
8. Supported routine applications fill verified data, upload the selected
   resume, answer permitted questions, submit without another routine approval,
   and record a receipt.
9. Genuine exceptions pause only the affected run and provide a specific,
   actionable explanation.
10. A configured compact local model can pass a structured self-test and assist
    with resume extraction and grounded application answers without controlling
    submission or inventing personal facts.
11. Restarting the local application preserves profiles, selected batches,
    queue state, exceptions, and terminal results.

## 10. Product boundaries

- The user selects jobs; this direction does not authorize autonomous job
  selection or mass application without an explicit selected batch.
- Local-first does not mean single-profile. It means all profiles belong to the
  local installation and remain isolated.
- Job suggestions may be added using the same profile data, but they are not a
  prerequisite for the initial batch Auto Apply delivery.
- A local avatar is not an employer-facing application photo.
- Application APIs requiring employer-owned credentials are not assumed to be
  available to an individual applicant. Direct hosted forms remain valid
  automation targets.
- Unsupported providers should have useful assisted or external paths rather
  than fabricated automatic support.
- The product should optimize for real user outcomes and visible end-to-end
  behavior, not fixture-only coverage or broad metrics over non-executable URLs.
