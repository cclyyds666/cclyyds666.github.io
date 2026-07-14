# Project instructions

## Planning before edits

Before making any code edits for a task:

1. Write or append the implementation plan to `docs/project-plan.md` (same file as `D:\myweb\cclyyds666.github.io\docs\project-plan.md` in the main checkout).
2. Include: problem, approach, files to change, and verification steps.
3. Only after the plan is written in that document, start editing code.
4. Do **not** use plan mode for this repository workflow; write the plan into the project doc and implement.

## Git delivery

This is a personal repository. When Claude finishes an implementation task and the requested changes pass their relevant checks:

1. Commit the changes on the current feature/worktree branch.
2. Push that branch to `origin`.
3. Automatically integrate the branch into `origin/main` and push `main` without asking again.
4. Prefer a fast-forward update when `origin/main` is an ancestor of the feature branch.
5. Never force-push, rewrite published history, bypass hooks, or push failing changes.
6. If `main` has diverged, fetch it, integrate it normally, resolve conflicts carefully, rerun relevant checks, then push. Stop and ask only when a conflict or failed check cannot be resolved safely.

The user's standing authorization covers these branch pushes and normal merges to `main` for this repository.
