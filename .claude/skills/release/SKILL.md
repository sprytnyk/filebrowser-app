---
name: release
description: Ship a new version of the app. Bumps the version, makes a signed release commit and tag, pushes, builds the APK on this machine with `eas build --local`, writes and signs SHA256SUMS in dist/, and writes the release notes there too. Use when the user asks to release, ship, or "ship it as usual".
argument-hint: '[version, e.g. 1.3.1; derived from commits if omitted]'
disable-model-invocation: true
---

# Release

Running this skill is the user's request to commit, push, build and sign. Their global
rules still apply. Never force-push, retag or rewrite pushed history without asking first,
never add AI attribution to commits, never bypass hooks, and keep IPs and secrets out of
release notes.

Stop and report back if any step fails. Don't work around a failure.

## 1. Pre-flight

- You must be on `main`, and `git fetch origin` must show `main` neither behind nor diverged.
- **Outdated Expo packages.** Before anything else, run `npx expo-doctor`. If it reports
  packages that don't match the versions the installed SDK expects, list them (package,
  installed, expected) and ask the user whether to update them now. Don't continue the
  release until they answer.
  - **Yes:** run `npx expo install --fix`. `git diff --stat` should show only `package.json`
    and `package-lock.json`. Run `npx expo-doctor` again, then commit (unsigned, hook runs) as
    `build(deps): update expo packages to sdk <major> patch versions`. The update ships in
    this release and goes under Other in the notes.
  - **No:** keep the current versions and list the outdated packages in the report.
- **Uncommitted work** gets committed first. Make one Conventional Commit per logical change
  (unsigned) and let the pre-commit hook run. Never stage secret files, `dist/` or scratch
  files. If it's unclear whether a change belongs in the release, ask.
- Run the checks. All three must pass, except for version mismatches the user chose to keep:
  ```bash
  npx expo lint
  npx tsc --noEmit
  npx expo-doctor
  ```
  Never run `npx expo install --fix` without the user's OK.
- **README.** Compare `git log <last-tag>..HEAD` with `README.md` (Features, What it covers,
  Gaps in the server it works around, Testing). Update anything user-visible that's missing
  in a `docs(readme): ...` commit. Only refresh screenshots in `docs/screenshots/` if the
  user asks.

## 2. Version

- Last tag: `git describe --tags --abbrev=0`.
- Use the version given in `$ARGUMENTS`. If there is none, derive it with semver from the
  commits since the last tag: a `!` or `BREAKING CHANGE` means major, any `feat` means
  minor, anything else means patch. Say which version you picked and why, in one line.
- Bump the version in exactly these four spots (no other changes):
  - `app.json`: `expo.version`
  - `package.json`: `version`
  - `package-lock.json`: the top-level `version` and `packages[""].version`
- Don't touch `versionCode`. EAS increments it remotely (`appVersionSource: remote`).
- Check the bump: `git diff --stat` should show only those three files, with 4 insertions and 4 deletions.

## 3. Signed release commit and tag

Only the release commit and its tag are signed:

```bash
git add app.json package.json package-lock.json
git commit -S -m "chore(release): vX.Y.Z"
git tag -s vX.Y.Z -m vX.Y.Z
git verify-commit HEAD && git tag -v vX.Y.Z
```

The commit message is just `chore(release): vX.Y.Z`, with no body and no trailers.
If gpg pinentry times out, ask the user to run the command themselves with a `!` prefix.

## 4. Push

```bash
git push origin main
git push origin vX.Y.Z
```

If either push is rejected, stop and ask. Never force-push.

## 5. Local EAS build

The APK is built on this machine with `eas build --local`. It runs the same steps as an EAS
cloud build, from the committed tree (the gitignored `android/` folder isn't used). EAS still
signs it with the keystore it manages, downloaded just for the build, and still bumps
`versionCode` remotely. The only traffic to EAS is checking the project and fetching that
keystore.

**Toolchain.** It isn't in the shell profile, so pass it on the command line:

- JDK 17: `/usr/lib/jvm/java-17-openjdk-amd64`
- Android SDK: `~/Android/Sdk`, with `platforms;android-<compileSdk>`,
  `build-tools;<buildTools>` and `ndk;<ndkVersion>`. Read those three values from
  `node_modules/react-native/gradle/libs.versions.toml`, since they change with the SDK. If one
  is missing from `~/Android/Sdk`, stop and give the user the
  `~/Android/Sdk/cmdline-tools/latest/bin/sdkmanager "<package>"` command to install it.

**Build.** `dist/vX.Y.Z` must not exist yet; the build copies the APK there:

```bash
mkdir dist/vX.Y.Z
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 ANDROID_HOME=$HOME/Android/Sdk \
  EAS_LOCAL_BUILD_ARTIFACTS_DIR=$PWD/dist/vX.Y.Z \
  npx eas-cli@latest build -p android --profile preview --local --non-interactive
```

The user may want to watch the build. If so, give them the command to run in their own
terminal and continue once they say it finished. Otherwise run it yourself with
`run_in_background`, sending its output to a log file in the scratchpad, and wait for the
notification. It takes about 10–20 minutes. Don't poll.

If the build fails, report the error from the end of the log (Gradle's "What went wrong"
block) and stop.

## 6. Artifacts in dist/

`dist/` is gitignored. The build leaves one APK with a generated name in `dist/vX.Y.Z`.
Rename it:

```bash
ls dist/vX.Y.Z/*.apk   # exactly one
mv dist/vX.Y.Z/<generated>.apk dist/vX.Y.Z/filebrowser-app-vX.Y.Z.apk
```

**Same signing key as before.** Android only installs an update signed with the same key as
the installed app. Compare the certificate with the previous release's APK:

```bash
APKSIGNER="$HOME/Android/Sdk/build-tools/<buildTools>/apksigner"
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 "$APKSIGNER" verify --print-certs dist/vX.Y.Z/filebrowser-app-vX.Y.Z.apk | grep 'SHA-256'
JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64 "$APKSIGNER" verify --print-certs dist/<previous>/filebrowser-app-<previous>.apk | grep 'SHA-256'
```

The two digests must match. If they don't, stop: users couldn't update without uninstalling.

Then, from `dist/vX.Y.Z`, write, sign and verify the checksums:

```bash
sha256sum filebrowser-app-vX.Y.Z.apk > SHA256SUMS
gpg --batch --yes --local-user 0xC00C0F0D647BD3C6 --armor --detach-sign SHA256SUMS
gpg --verify SHA256SUMS.asc SHA256SUMS
sha256sum -c SHA256SUMS
```

The signature must say Good, from `0xC00C0F0D647BD3C6`.

## 7. Release notes

Write them from the commits since the previous tag, in plain words, and say why a change
matters when it isn't obvious. Leave out sections that would be empty. Save them to
`dist/vX.Y.Z/RELEASE_NOTES.md` (the content below, without the fence), so they sit next to
the APK and checksums. Leave the notes out of `SHA256SUMS`: they quote the checksums, so they
are written after signing. Also give them in one fenced `markdown` block in the report, ready
to paste into the GitHub release:

```markdown
## FileBrowser Quantum for Android vX.Y.Z

### Features

- **Short title.** What changed and why it helps.

### Fixes

- What was broken and what happens now.

### Other

- Dependency updates, README and screenshot changes.

Tested against FileBrowser Quantum v2.0.1-stable.

### Verify

gpg --verify SHA256SUMS.asc SHA256SUMS
sha256sum -c SHA256SUMS

Signing key: 0xC00C0F0D647BD3C6

SHA-256:
<contents of SHA256SUMS>
```

## 8. Report

Report briefly:

- the version and tag
- the commits that went in
- outdated Expo packages the user chose to keep, if any
- that the build ran locally, and that its signing certificate matches the previous release
- the four files in `dist/vX.Y.Z/` (APK, `SHA256SUMS`, `SHA256SUMS.asc`, `RELEASE_NOTES.md`) and the
  verification result
- the release notes block
- leftovers, such as running test containers or `adb reverse`

Don't test on the phone yourself unless the user asks.
