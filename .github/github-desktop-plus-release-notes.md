GitHub Desktop Plus v3.5.13-alpha1

## **Changes and improvements:**

- [#173] Added a new "Pull branch" context menu item in the Branches list. This allows you to ensure a branch is up to date without checking it out first. Thank you @anaseeem!

- [#177] Enhanced multi-window support: If multiple Desktop Plus windows are open, opening a repo will now focus the window that already has it open instead of the last focused window.

- [#179] Allow hiding the "Generate commit message with Copilot" option.  
  Go to File > Options > Copilot > Models and select "None (hide Copilot button)" in the model selection dropdown.

- [#180] **Flatpak:**  Fixed `git-lfs` not being found when "Load Git hook environment variables from shell" is enabled.

- **Flatpak:** Added a warning message in the Git Hooks configuration menu.  
  Git hooks run inside the Flatpak sandbox and cannot access programs installed on your system (such as version managers, linters, or other tools your hooks rely on).



## **Fixes:**

- [#170] **macOS:** Updated Electron version to fix a crash when right-clicking the native window title bar.

- [#172] Fixed grammar in the Stashed Changes view: "Restore to Changes" -> "Restore Changes".
