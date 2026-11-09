---
name: spec-clarify
description: >
  Turn a Jira story, bug or rough idea for this service into a spec in specs/, in the repo's spec
  format, by asking the author questions one topic at a time: problem, scope, testable acceptance
  criteria with negative cases, risks, priority, size. Writes specs/NNN-slug.md and nothing else;
  never implements and never edits a delivered spec. Use whenever asked to write, draft, refine
  or clarify a spec or story — e.g. "/spec-clarify REGEN-150 ...", "/clarify", "write the spec
  for REGEN-150", "turn this story into a spec", "refine this idea". For splitting a spec that is
  too big for one pull request, use spec-breakdown.
---

# Spec clarify

Last reviewed 9 November 2026. This skill produces a spec for this GOV.UK frontend in the
format below.

**Format note.** At the time of writing `specs/` holds one file,
`001-defra-id-implementation-plan.md`, which is a plan rather than a story spec, so this repo
had no settled section structure. This skill therefore uses the same sections as
waste-organisations (metadata table, Problem/Opportunity, Proposed Solution with a Work
breakdown, Acceptance Criteria, Out of Scope, Decisions, Open Questions, Dependencies, Risks,
Notes) and keeps this repo's three-digit numbering (`specs/NNN-slug.md`). The title carries the
story key (`REGEN-NNN: Title`), as PR titles and branch names do (`doc/rules/git-workflow.md`); a
repository autolink reference makes keys clickable.

You are running an idea refinement workshop with the developer. The output is a spec that a
reviewer can approve and that a developer or an agent can implement without asking the author
what was meant.

## Usage

`/spec-clarify REGEN-NNN <one-line idea>` in Claude Code, or `$spec-clarify` in Codex. Without
an argument, ask for the story key and a one-line description first.

## Ground rules

- **Ask, do not assume.** Work through the phases below one topic at a time, in chat, offering
  options where you can and waiting for the answer. Use the tool's question facility if it has
  one; plain questions in chat are fine otherwise.
- **Read before asking.** Read `AGENTS.md` (especially "Specs"), `doc/rules/quality-assurance.md`,
  the existing specs in `specs/` for prior decisions, and the code the idea touches: the routes
  under `src/server/routes/<page>/`, the auth helpers in `src/server/auth/`, the configuration
  keys in `src/config/config.js` and the templates under `src/server/common/templates/`. Confirm
  what already exists with a code search before calling anything missing.
- **Sources are referenced, not pasted.** Ask the author to paste the Jira story text, its
  comments and the prototype or design pages if you cannot read them; cite them by title, version
  and date in the spec. Never put credentials or personal data into the spec.
- **Specs only.** Write one file under `specs/`. Do not change code, tests, templates or any other
  spec. A delivered spec (its work merged, for example `001-defra-id-implementation-plan.md`) is
  never edited: a change to something it decided is recorded in the new spec's Decisions with the
  earlier spec named (`AGENTS.md`, "Specs").
- **Testable means testable here.** Every acceptance criterion names an observable result that a
  Vitest unit test (`src/**/*.test.js`, run by `npm test`; route tests render pages through
  `server.inject` and assert on the HTML with cheerio) or a numbered step in the pull request's
  "How to test" section can check. This repo has no automated journey or accessibility
  suite yet, so accessibility and browser criteria are verified by "How to test" steps (keyboard
  navigation, axe, JavaScript and CSS disabled) until one exists.

## Phases

### 1. Understand

Establish: the problem or opportunity, who benefits (people managing a waste account, the Defra
and Environment Agency teams who support them, other Waste and Circular Economy services, the
team, operations), what triggered it, and what success looks like. Then search the code and
record what is already in place (Defra ID sign-in and session handling, existing pages and
routes, configuration keys, templates and partials), with file names.

### 2. Classify

Feature, Bug, Improvement, Spike (time-boxed research — for example an unfamiliar GOV.UK Design
System pattern or a Defra ID flow), Task (no direct user impact), or Epic. An Epic is not one
spec: say so and point at `spec-breakdown`.

### 3. Scope

What is in, what is explicitly out, what the minimum is. Ask which pages and routes the work
adds or changes and whether the content and design come from a prototype. Ask about anything an
earlier spec decided that this work would change; those become Decisions that name the
superseded spec.

### 4. Acceptance criteria

Three to twelve criteria, each one line, each checkable by a test or a "How to test" step. Start
from the default criteria in `doc/rules/quality-assurance.md`, made specific to this story:
screens and content match the prototype or wireframe; GOV.UK Design System components
(govuk-frontend), never hand-rolled ones; WCAG 2.2 AA; all supported browsers including mobile;
server-side validation for every field with the GOV.UK error message and error summary patterns;
the journey works without client-side JavaScript and CSS; no existing functionality regressed.
Cover the negative paths as carefully as the positive — the journeys that must fail: invalid or
missing input (which message, which field the error summary links to), an unauthenticated user
(redirected to sign-in and back to the requested page afterwards), an unauthorised user (the 403
page), session expiry mid-journey, a back-end call that fails. Map Jira scenarios to criteria by
number. Bugs get current behaviour, expected behaviour, steps to reproduce and impact in
Problem/Opportunity, and a criterion that the bug no longer occurs.

### 5. Risk and dependencies

Unknowns, risky areas (Defra ID and session handling, configuration and secrets, an unfamiliar
GOV.UK component, content that still needs sign-off, a back-end API that does not exist yet),
dependencies on other stories or teams, and a risk level (low, medium, high) with the reason. For
high uncertainty, propose a spike spec first.

### 6. Priority

P0 critical (blocking), P1 high, P2 medium (default), P3 low, P4 backlog, with the rationale.

### 7. Size

Estimate the pull requests the work needs. A spec is one pull request when its non-generated
change stays within the size guide in `doc/rules/git-workflow.md` and mixes no unrelated concerns
(a new page or journey, a configuration change, a refactor). If it needs more, either write the
Work breakdown table (slices with what each is verified by) or stop and recommend
`spec-breakdown` on the finished spec.

### 8. Write the spec

Path: `specs/NNN-slug.md`, where `NNN` is the next number after the highest in `specs/` (three
digits, zero-padded, as `001` is) and the slug comes from the story title. Use this structure,
with the section headings exactly as written:

```markdown
# REGEN-NNN: Title

|          |                                                                                                             |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| Type     | Feature / Bug / Improvement / Spike / Task, with one sentence on what changes and what does not             |
| Priority | P0 to P4 with the rationale                                                                                 |
| Parent   | Parent story or epic, if any                                                                                |
| Risk     | Low / Medium / High (see Risks)                                                                             |
| Source   | Jira story and comments by date, prototype or design pages by title and version, refinement answers by date |

## Problem/Opportunity

## Proposed Solution

(subsections as needed: pages and routes, content, form fields and validation, session data,
calls to other services, configuration, code layout, tests; end with "### Work breakdown" when
the work is more than one slice)

## Acceptance Criteria

- [ ] one line per criterion, Jira scenario numbers in brackets

## Out of Scope

## Decisions

| Topic | Decision                                                         |
| ----- | ---------------------------------------------------------------- |
| ...   | what was decided, when, why; name any earlier spec it supersedes |

## Open Questions

## Dependencies

## Risks

## Notes
```

British English, absolute dates, no pasted sources, no personal data. Keep the Proposed Solution
concrete enough to implement from: route paths, template names, field names with their error
messages, session keys, configuration keys, and file and folder names that follow the existing
layout (`src/server/routes/<page>/` with colocated `*.test.js`) and `doc/rules/javascript-nodejs.md`.

### 9. Present and confirm

Show the author the type, priority, title, acceptance criteria and open questions, and ask
whether the spec says what they meant. Adjust until it does.

### 10. Next steps

Say which applies: the spec is one pull request and development can start; it needs
`spec-breakdown`; it needs a spike first; or open questions block it and who can answer them. A
spec can be reviewed as its own pull request before implementation starts; recommend that for
anything larger than one slice.

## Do and do not

Do:

- Push for concrete, testable criteria and for the negative cases, including what the journey
  does without client-side JavaScript.
- Make exclusions explicit; Out of Scope is where scope creep is stopped.
- Name the earlier spec whenever a decision changes something it decided.
- Record who decided what and when in Decisions, so the spec is a record, not just a plan.
- Keep the spec within one pull request or hand over to `spec-breakdown`.

Do not:

- Accept vague criteria ("make validation better", "improve the page").
- Skip the "why"; the Problem/Opportunity section is what a reviewer judges the solution against.
- Edit a delivered spec, or paste its text into the new one.
- Start implementing, create branches, or change anything outside `specs/`.
- Invent Jira keys, dates or decisions; ask.
