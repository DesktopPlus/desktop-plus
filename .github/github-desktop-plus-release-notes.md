GitHub Desktop Plus v3.5.9-beta2

Upstream: [GitHub Desktop 3.5.9-beta2 release notes](https://github.com/desktop/desktop/releases/tag/release-3.5.9-beta2)

---

## **Changes and improvements:**

- Added a one-time temporary banner to promote [this discussion](https://github.com/pol-rivero/github-desktop-plus/discussions/140) about a future change to our name and logo.

- [#134] Allow showing a minimap at the right side of the diff view. It shows a small overview of the entire file, which helps to quickly navigate to a specific part of the file. Thank you @kingdo10!  
  To enable it, click the "Diff options" menu (gear icon at the top right of the diff view) and select "Show minimap".

- [#134] Allow expanding the entire file (not only the changed lines) in the diff view by clicking the "Show whole file" button at the top right of the diff view. This is especially useful when the minimap is enabled. Thank you @kingdo10!

- Improved the speed of some Bitbucket API calls by using the correct page size. This should speed up listing repositories and pull requests when the list is long.

- Added custom icons for the "View in Bitbucket" and "View on GitLab" buttons in the "No local changes" view.


## **Fixes:**

- Fixed loading of Bitbucket repositories (File > Clone repository > Bitbucket tab) by replacing a deprecated (removed) Bitbucket API endpoint.

- Show the correct editor name in the "Resolve Conflicts" dialog when the current repository has a custom editor override.
