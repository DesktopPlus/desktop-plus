Desktop Plus v3.6.1

Upstream:
- [GitHub Desktop 3.6.0 release notes](https://github.com/desktop/desktop/releases/tag/release-3.6.0)
- [GitHub Desktop 3.6.1 release notes](https://github.com/desktop/desktop/releases/tag/release-3.6.1)

---

## Name change

This is the first release under the new "Desktop Plus" / "GH Desktop Plus" branding!  
We are still the same GitHub Desktop fork, lead by the same maintainer (@pol-rivero), just with a new name and a new logo.

Thank you very much to @ghedwards for generously giving me the ownership of the *"desktop-plus"* organization name!

> [!CAUTION]
> ## Breaking changes
> - **All platforms:** The executable name for the application has changed from `github-desktop-plus` to `desktop-plus`.
> - **All platforms:** The executable name for the CLI has changed from `github-desktop-plus-cli` to `desktop-plus-cli`.
> - **Linux (non-Flatpak):** The `.desktop` file name has changed from `github-desktop-plus.desktop` to `desktop-plus.desktop`.
>
> If you have any **scripts**, **shortcuts**, **aliases** or **.desktop drop-ins** that reference the old names, please update them to the new ones.

### Stuff you *don't* need to worry about

- I'll update the package names progressively in future releases, and plan to use each platform's migration tools to minimize the amount of manual intervention required.
- The app's config location has changed due to the new name, but the app settings are automatically migrated on first launch so you don't need to worry about that.


## **Changes and improvements:**

- [#138] New branding and logo. Thank you @matebitte for the new logo design!

- Include Lucide ISC license in the app's About dialog. Thank you @guplem!

- All of the app's telemetry (which is inherited from the upstream project) has been fully disabled.

- In addition to migrating the old **GitHub Desktop Plus** config to the new **Desktop Plus** directory, the app can now also automatically migrate your settings from **GitHub Desktop** (upstream project). This should make the transition from upstream much smoother for new users.

- Fixed a visual bug where the theme preview in the Appearance settings page would flicker momentarily the first time the page is opened.
