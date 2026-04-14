GitHub Desktop Plus v3.5.8

Upstream: [GitHub Desktop 3.5.8 release notes](https://github.com/desktop/desktop/releases/tag/release-3.5.8)

---

## **Changes and improvements:**

- [#105] We now support displaying **worktrees in the repository sidebar** list. Thank you @ignatremizov!  
  To enable it, go to `File` > `Options` > `Appearance` and check the box for "Show worktrees in repository sidebar".

- [#129] When the current local branch is ahead and behind the remote branch, added a new **Reset and pull** option to the pull dropdown. This will discard your local commits and pull the latest changes from the remote branch (similar to the existing "Force push" option but the other way around).

- [#131] You can now change the font family and size that will be used in the diff view. Thank you @kingdo10!  
  To change the font settings, go to `File` > `Options` > `Appearance`.

- [#126] When creating a new worktree, [.worktreeinclude](https://code.claude.com/docs/en/common-workflows#copy-gitignored-files-to-worktrees) files are now respected, and the files specified in them will be copied to the new worktree.  

- Show a frendlier error message when trying to delete a worktree or branch with uncommitted changes.

## **Fixes:**

- Worktrees that contain submodules can now be deleted without errors.

- The "Pull all" button now correctly pulls changes in linked worktrees as well.

- [#130] Fixed a visual bug where the hovered commit was not highlighted when using drag and drop to squash commits.

- Fixed a problem where some context menus (*"Open with ..."*) displayed the globally configured external editor name instead of the repository-specific one.
