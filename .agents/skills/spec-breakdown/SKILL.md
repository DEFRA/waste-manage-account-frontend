---
name: spec-breakdown
description: >
  Split a spec in specs/ whose work is too big for one pull request into child specs, one per
  slice, each within the repo's PR size guide and independently testable, with dependencies and
  an order. Writes the child specs in the repo's spec format and updates the parent spec's Work
  breakdown table; never implements and never edits a delivered spec. Use whenever asked to
  split, slice, break down or decompose a spec, story or epic — e.g. "/spec-breakdown
  specs/002-....md", "/breakdown", "this spec is too big", "split REGEN-150 into smaller PRs".
  For writing a spec from a story or idea, use spec-clarify.
---

# Spec breakdown

Last reviewed 9 November 2026. This skill splits a spec into child specs, because in this repo a
spec is the unit of review and each slice becomes one pull request
(`specs/001-defra-id-implementation-plan.md`, section 5, planned Defra ID sign-in as five pull
requests).

## Usage

`/spec-breakdown specs/NNN-slug.md` in Claude Code, or `$spec-breakdown` in Codex. The argument
is the parent spec; without one, ask which spec to split.

## Ground rules

- **The parent spec is the input.** Read it in full, together with `AGENTS.md` ("Specs" and
  "Git workflow"), the size guide in `doc/rules/git-workflow.md`, and the latest specs for
  numbering and format. Search the code before assuming anything is missing.
- **Ask before splitting.** Confirm with the author what makes the work too big and which
  strategy fits, then confirm the proposed slices before writing anything.
- **Specs only.** Write new files under `specs/` and update the parent spec's Work breakdown. Do
  not change code, tests or templates. A delivered spec is never edited; if the parent is
  delivered, the breakdown is a new spec that names it.
- **Every slice leaves main shippable.** A slice may add a configuration key, a service client or
  a page that nothing links to yet, but it never breaks an existing page or test, never leaves a
  journey the user can reach half-changed, and never leaves a failing gate for the next slice to
  fix.

## Strategies

Choose one and say why:

1. **Page or journey step per slice**: each slice is one page or one step of a journey, end to
   end — route, template, server-side validation, session handling and tests — so it can be
   reviewed against the prototype on its own. The default for a multi-page journey.
2. **Content and validation first, then enhancement**: the server-rendered page with its content,
   server-side validation and error summary first (it must work without JavaScript and CSS), then
   client-side enhancement or a richer component as a later slice.
3. **Groundwork first**: dependencies, configuration keys, a cache segment or a service client
   that nothing uses yet as their own slice when a journey needs them, then the behaviour (the
   pattern of spec 001, section 5).
4. **Risk-based**: a spike spec first (time-boxed, with a written finding as its deliverable) for
   an unfamiliar GOV.UK Design System component or a Defra ID flow, then implementation slices
   with the unknowns resolved.
5. **Dependency-based**: separate what can run in parallel from what must be sequential, so two
   developers or two agents do not collide in the same files.
6. **Scope-based**: minimum first, then enhancements, then polish, when the deadline is fixed.
7. **By acceptance criterion**: one slice per major criterion, when the parent's criteria are
   already independent.

## Process

1. **Understand the parent.** Its type, priority, acceptance criteria, decisions, open questions
   and the areas it touches: routes and handlers, templates and partials, validation, session
   data, service clients, configuration, content, tests, README.
2. **Analyse why it is too big.** Estimate the non-generated lines per area and compare with the
   size guide; name the mixed concerns; list the unknowns. A parent that fits one pull request
   does not need splitting: say so and stop.
3. **Choose a strategy** with the author.
4. **Propose the slices.** For each: title, what it includes and excludes, which parent
   acceptance criteria it takes (every parent criterion lands in exactly one slice), what it is
   verified by, its dependencies, whether it can run in parallel with another, and its estimated
   size. Show the dependency order. Confirm or adjust with the author.
5. **Write the child specs**, one file each, `specs/NNN-<slice-slug>.md`, numbered consecutively
   from the next free number, in the repo's spec structure (same headings as `spec-clarify`
   produces). The title carries the parent's story key (`REGEN-NNN: <slice title>`); in the metadata table, `Type` starts
   "Part N of M of REGEN-NNN" and `Parent` names the parent spec file. Acceptance Criteria are
   the parent's criteria for that slice, reworded only where the slice boundary requires. Out of
   Scope names the sibling slices. Decisions repeat nothing: they reference the parent's
   Decisions and add only what the split itself decided.
6. **Update the parent.** Add or replace its "### Work breakdown" table under Proposed Solution:
   one row per slice with the child spec file, the work and what verifies it, in order. This is
   allowed because the parent is in progress.
7. **Summarise.** Parent title, the slices with their dependency graph, the suggested order, what
   can run in parallel, and the first slice to start.

## Sizing

- A slice stays within the size guide in `doc/rules/git-workflow.md` (about 800 non-generated
  changed lines; lock files and snapshots do not count) and mixes no unrelated concerns.
- A slice has at least one testable acceptance criterion and its own verification: which Vitest
  files, and which steps of the pull request's "How to test" section. A slice with no observable
  result is too small; fold it in.
- A slice is a good size for one focused day of work or one agent run.
- Prefer fewer, well-bounded slices to many tiny ones; the overhead is a pull request each.

## Do and do not

Do:

- Keep the parent's context in each child so it can be read alone.
- Make dependencies reflect real technical constraints, and say what can run in parallel.
- Give each slice a title that says what is true when it is merged.
- Explain the strategy chosen and the sizes estimated.

Do not:

- Split a spec that fits one pull request.
- Create circular dependencies, or a slice that needs a later slice to build or pass tests.
- Lose a parent acceptance criterion, or let one land in two slices.
- Edit a delivered spec, implement anything, or create branches.
