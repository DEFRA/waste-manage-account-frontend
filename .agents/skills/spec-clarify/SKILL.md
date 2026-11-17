---
name: spec-clarify
description: >
  Turn a Jira story, bug or rough idea for this service into a spec in specs/, in the repo's spec
  format, by asking the author questions one topic at a time: problem, scope, testable acceptance
  criteria with negative cases, risks, priority, size. Writes one spec file in specs/, named with
  the story's ticket id, and nothing else; never implements and never edits a delivered spec. Use
  whenever asked to write, draft, refine or clarify a spec or story — e.g.
  "/spec-clarify ABC-123 ...", "/clarify", "write the spec for ABC-123", "turn this story into a
  spec", "refine this idea". Every spec has a Work breakdown, one slice per pull request, also
  when there is only one; work is never split into child specs.
---

# Spec clarify

Last reviewed 17 November 2026. This skill produces a spec for this GOV.UK frontend in the
format below.

**Format note.** At the time of writing `specs/` holds one file,
`001-defra-id-implementation-plan.md`, which is a plan rather than a story spec, so this repo
had no settled section structure. This skill therefore uses the same sections as
waste-organisations (metadata table, Problem/Opportunity, Proposed Solution with a Work
breakdown, Acceptance Criteria, Out of Scope, Decisions, Open Questions, Dependencies, Risks,
Notes) and the same file name, `specs/NNNN-<ticket-id>-slug.md`: a four-digit number, then the
story's Jira key exactly as Jira gives it, whatever its project. A spec that already exists is
never renamed: the delivered plan keeps its three-digit name. The title carries the same key (`<ticket-id>: Title`), as PR titles and branch
names do (`doc/rules/git-workflow.md`); a repository autolink reference makes keys clickable.
Never write a project prefix into a rule or a skill: the real key comes from the story.

You are running an idea refinement workshop with the developer. The output is a spec that a
reviewer can approve and that a developer or an agent can implement without asking the author
what was meant.

## Usage

`/spec-clarify <ticket-id> <one-line idea>` in Claude Code, or `$spec-clarify` in Codex. Without
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
spec: say so and ask which of its stories to specify first.

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

Estimate the pull requests the work needs and write the Work breakdown table in every spec, also
when the work is one pull request: the table then has one slice. The reader finds the number of
pull requests in the same place in every spec, and "build slice 1 of spec NNNN" always works. A
spec is one pull request when its non-generated change stays within the size guide in
`doc/rules/git-workflow.md` and mixes no unrelated concerns (a new page or journey, a
configuration change, a refactor); say so, with the estimate, in a line above the table. If it
needs more, slice it: the spec stays one file and is never split into child specs. Each slice is
one pull request, built on its own and in order ("build slice 1 of spec NNNN"); when every slice
is merged, the spec's development is complete. Write each slice to stand alone:

- **One slice is still a table.** Its Work names what the pull request builds, as any slice does,
  and its Verified by names the Vitest files and every acceptance criterion.
- **Slice a pull request, not a task.** A slice has its own observable result and its own tests.
  Never a "README", "tests" or "run the full gate" slice: documentation, tests and the full gate
  belong to every slice.
- **Work says what the slice builds and where it stops.** Name the routes, templates, files,
  session or configuration keys, and the Proposed Solution subsections it implements. Where a
  reader could expect more, say what is left to a later slice.
- **Verified by is provable.** Name the Vitest files or the "How to test" steps and the result
  they show, and the acceptance criteria the slice satisfies.
- **Order is build order.** A slice may rely only on earlier slices, and every slice leaves main
  shippable: nothing needs a later slice to pass the gate, and no page is left half-built or
  linked before it works.
- **Do not over-slice.** Split only for the size guide or for mixed concerns. Fold a slice with
  nothing of its own to verify into its neighbour; prefer fewer, well-bounded slices to many small
  ones, since each costs a review.
- **Every acceptance criterion is covered by a slice.** Confirm the slices with the author before
  writing them.

Keep the heading and the three columns exactly as the structure below gives them, with the slice
number alone in the first column: the `slice-deliver` skill reads the table to find a slice.

### 8. Write the spec

Path: `specs/NNNN-<ticket-id>-slug.md`, where `NNNN` is the next number after the highest in
`specs/` (four digits, zero-padded: `0002` follows the delivered `001`) and the slug comes from
the story title. Use this structure, with the section headings exactly as written:

```markdown
# <ticket-id>: Title

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
calls to other services, configuration, code layout, tests; always end with "### Work
breakdown", one slice per pull request, a single slice when the work is one pull request)

### Work breakdown

(one line: how many pull requests the work needs and why, with the size estimate)

| Slice | Work                                     | Verified by                                           |
| ----- | ---------------------------------------- | ----------------------------------------------------- |
| 1     | what the slice builds and where it stops | the Vitest files and the acceptance criteria it meets |

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

Say which applies: the Work breakdown has one slice and development can start; it has several
slices and development starts with slice 1; it needs a spike first; or open questions block it
and who can answer them. A spec can be reviewed as its own pull request before implementation starts; recommend that for
anything larger than one slice.

## Do and do not

Do:

- Push for concrete, testable criteria and for the negative cases, including what the journey
  does without client-side JavaScript.
- Make exclusions explicit; Out of Scope is where scope creep is stopped.
- Name the earlier spec whenever a decision changes something it decided.
- Record who decided what and when in Decisions, so the spec is a record, not just a plan.
- Write the Work breakdown in every spec: one slice when the work fits one pull request,
  otherwise slices that each stand alone.

Do not:

- Accept vague criteria ("make validation better", "improve the page").
- Skip the "why"; the Problem/Opportunity section is what a reviewer judges the solution against.
- Edit a delivered spec, or paste its text into the new one.
- Start implementing, create branches, or change anything outside `specs/`.
- Invent Jira keys, dates or decisions; ask.
