GitHub Desktop Plus v3.5.13-beta4

Upstream: [GitHub Desktop 3.5.13-beta4 release notes](https://github.com/desktop/desktop/releases/tag/release-3.5.13-beta4)

> This upstream release includes several worktree-related fixes that were upstreamed from our fork.

---

## **Changes and improvements:**

- [#158] When a linked worktree is deleted outside the app, we now attempt to automatically switch to the main worktree instead of showing an error.

- [#188] Display [Conventional Commit](https://www.conventionalcommits.org/en/v1.0.0/) prefixes as badges in the commit list. This lets you quickly identify the type of commit (e.g., feat, fix, chore) at a glance.  
  If you prefer to hide these badges, you can do so in "Options" > "Appearance" > "Show Conventional Commits prefixes as badges".

- Branches that are in use by another worktree are no longer disabled on the branch list. Instead, we now adhere to the upstream behavior and switch to the corresponding worktree when a branch is selected.

- Repository indicators (local changes, branch name, etc.) are now loaded much faster by avoiding network requests on the initial load.  
  Some indicators like "This branch is behind" / "Unpulled changes" that require network will load asynchronously after the initial load, like before.

## **Fixes:**

- [#190] **Debian:** Fixed broken installation in Debian Forky/Sid by updating a dependency to its new name.

- [#192] When "Show worktrees in repository list" is enabled, the repository filter / search box now correctly allows searching for worktrees by name.

- [#193] Fixed a visual bug where the "Search commits" field clips outside its bounds when the side panel is small. Thank you @JBTastic!
