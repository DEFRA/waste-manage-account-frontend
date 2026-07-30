# Common coding standards

Adapted for this repo from the DEFRA [common coding standards](https://github.com/DEFRA/software-development-standards/blob/master/docs/standards/common_coding_standards.md) and [coding principles](https://github.com/DEFRA/software-development-standards/blob/master/docs/principles/coding_principles.md). Last synced 30 July 2026.

## Principles

- **Main is always shippable** — the main branch is always in a state of 'shippable to production': tested, styled, documented, building.
- **The code is not yours** — write and commit code for the next developer, who won't have your context. They must be able to derive intent from the code alone.
- **Work in the open** — code is open as early as possible; going private is the managed exception.
- **Code securely** and **we test our code** — every change is provably correct via tests.

## Standards

- All coding is done on a branch — no changes directly to `main`.
- All branches have CI covering code style, security checking, dependency checking, build and unit tests.
- Unit test coverage is at least **90%**. Every change has sufficient coverage and total coverage must not decrease.
- All code is reviewed by another developer before merge.
- All repos are connected to SonarQube Cloud and the Defra standard quality gate is met.
- All code is checked for security and dependency vulnerabilities — no out-of-date dependencies or libraries with known vulnerabilities.

## Readability

- No generic names: `p`, `temp`, `v`, `data2`.
- Prefer objects with named keys over positional arrays: `{ name: 'Bob', surname: 'Smith' }`, not `['Bob', 'Smith']`.
- Avoid unexplained acronyms, especially domain-specific ones.
- Name things for the intent of the thing and the person who comes after you, not what makes sense to you today.
- Stick to the conventions of the language and framework in use.
- **Separate in order to name**: break code into small subroutines whose names express intent. Aim for readable code that needs no comments.

### Comments (when unavoidable)

- Comments are code — keep them small and refactor them as the code changes.
- Document _why_ the thing is needed or why it's done this way, never the _how_.
- Comment in the right place: modules at the module declaration, functions at the function declaration.
- Only write about the code — no names, dates, or opinions.
- Never leave commented-out code; git history is the record.
- Write comments as you write the code, or you never will.

## Simplicity

- Don't code for reuse until there is a confirmed need for reuse.
- Apply the [rule of three](<https://en.wikipedia.org/wiki/Rule_of_three_(computer_programming)>) before abstracting.
- Don't break the application apart until there is a confirmed need. The path to reuse is: module/namespace → shared package → (only with proven multi-service demand) separate application.

## Documentation and licensing

- Document the _how_ for the project: how to build, run, test and use it. The README follows the DEFRA [README standards](https://github.com/DEFRA/software-development-standards/blob/master/docs/standards/readme_standards.md).
- The repo carries the Open Government Licence v3 (see `LICENCE`) and the README states the licence.
