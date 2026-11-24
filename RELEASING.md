# Releasing

1. Set the new version in `module.json` and add a section for it at the top of `CHANGELOG.md` (e.g. `## 1.2.0`). Commit and push.
2. On GitHub: **Actions → Release → Run workflow → Run workflow**.
3. The workflow creates the `v<version>` tag and release, writes the version and links into `module.json`, builds `module.zip`, attaches both, and uses that version's changelog section as the release notes.

If the tag already exists, the run stops with an error: raise the version first. You can also type a version into the **Run workflow** box instead of editing `module.json`.

## Publish to the Foundry package listing

One-time setup: on foundryvtt.com, open the package's edit page and copy the **Package Release Token** (just above **Save Package**). On GitHub, add it under **Settings → Secrets and variables → Actions → New repository secret**, named `FOUNDRY_RELEASE_TOKEN`.

After the Release workflow has run:

1. **Actions → Publish to Foundry → Run workflow**.
2. Leave the version blank to publish the latest GitHub release, or type one (e.g. `1.8.0`).
3. Tick **Dry run** to have Foundry check the request without publishing. Leave it unticked to publish.

The workflow sends the version, the manifest URL of that exact release, the release page as notes, and the compatibility from the release's `module.json`. Foundry rejects a version that's already published, and allows one release per minute.
