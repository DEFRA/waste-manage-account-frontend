# spec-clarify

Turns a Jira story, bug or idea into a spec in `specs/`, in the format the team uses, by asking
you questions one topic at a time. It is the first step of every story in this repo: the spec is
what reviewers approve and what the implementation is checked against.

The agent-facing procedure is in [SKILL.md](SKILL.md); this file is for developers.

## When to use it

- A new story is ready for refinement and needs a spec before development.
- A bug needs a spec with reproduction steps and acceptance criteria.
- An idea is still vague and you want it shaped into something actionable, or found to be an
  epic that needs [spec-breakdown](../spec-breakdown/README.md).

## How to start it

| Tool        | How                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------- |
| Claude Code | `/spec-clarify REGEN-150 Let a user change the contact email address for their account`  |
| Codex       | `$spec-clarify` (or pick it from `/skills`), then give the story key and one line        |
| Either      | Ask in plain words: "write the spec for REGEN-150"; the skill loads from its description |

Have the Jira story text, its comments and the prototype or design pages to hand. The agent
cannot read Jira or the prototype, so it will ask you to paste what matters and will cite them by
title, version and date.

## What happens

1. It reads `AGENTS.md`, `doc/rules/quality-assurance.md`, the existing specs and the code the
   story touches, then asks about the problem, who benefits, scope, acceptance criteria, risks,
   priority and size. Answer one topic at a time; say "don't know" where you don't and it becomes
   an Open Question.
2. It writes `specs/NNN-slug.md` with the standard sections: metadata table,
   Problem/Opportunity, Proposed Solution, Acceptance Criteria, Out of Scope, Decisions, Open
   Questions, Dependencies, Risks, Notes. The acceptance criteria start from the GOV.UK defaults
   in `doc/rules/quality-assurance.md` (prototype match, Design System components, WCAG 2.2 AA,
   supported browsers, server-side validation with the error summary, works without JavaScript
   and CSS, no regression) and name the journeys that must fail.
3. It shows you the summary and adjusts until the spec says what you meant.
4. It tells you whether the work fits one pull request or needs splitting with `spec-breakdown`.

It never writes code, never touches another spec, and never edits a delivered spec; a change to
something an earlier spec decided is recorded in the new spec's Decisions, naming that spec.

## What you get

A spec with the sections listed above, in `specs/`. The folder holds one spec so far,
`specs/001-defra-id-implementation-plan.md`, which is a plan rather than a story spec; the first
spec this skill writes becomes the reference example for the next.

## Afterwards

- Open the spec as its own pull request if the work is more than one slice, so the team reviews
  the plan before the code.
- Run `spec-breakdown` if the spec needs more than one pull request.
- Implement it, by hand or with an agent; the review skills check the pull request against the
  spec's acceptance criteria and its "How to test" section.
