# macOS recorder deployment

This runbook documents how to build, verify, publish, and roll back the
Screenly macOS recorder. Follow it in order. Do not publish a DMG merely
because the Xcode build passed: macOS associates Screen Recording (TCC) and
Keychain access with the app's code requirement.

## Release inputs

- Source: `apps/mac`
- Xcode project specification: `apps/mac/project.yml`
- Build script: `apps/mac/scripts/build-release.sh`
- Workflow: `.github/workflows/macos-release.yml`
- Bundle identifier: `com.screenly.recorder.v2`
- Release bucket: `gs://screenly-media-screenly-503001/releases`
- Release API: `https://screenly-five.vercel.app/api/releases/macos/latest`
- Download API: `https://screenly-five.vercel.app/api/releases/macos/download`

The version in `apps/mac/project.yml` must match the version being published.

## Build with GitHub Actions

For an internal ad-hoc-signed validation build, tag the exact source commit:

```bash
git tag internal-v0.2.3 <commit-sha>
git push origin internal-v0.2.3
gh run list --workflow macos-release.yml --limit 5
```

Wait for the `Release macOS recorder` run to succeed. Record its run ID and
commit SHA. Download the artifact without rebuilding it:

```bash
gh run download <run-id> \
  --name Screenly-0.2.3 \
  --dir /tmp/screenly-release-0.2.3
```

Verify that the generated checksum matches the DMG:

```bash
actual="$(shasum -a 256 /tmp/screenly-release-0.2.3/Screenly.dmg | awk '{print $1}')"
declared="$(awk '{print $1}' /tmp/screenly-release-0.2.3/Screenly.dmg.sha256)"
test "$actual" = "$declared"
```

The build script applies the explicit designated requirement
`identifier "com.screenly.recorder.v2"` to ad-hoc builds. On macOS, verify it
before publishing:

```bash
codesign --verify --deep --strict --verbose=2 \
  /path/to/Screenly.app
codesign -d -r- --entitlements :- --verbose=4 \
  /path/to/Screenly.app
```

Both architectures must contain the same non-empty designated requirement.
Changing or removing it causes TCC and Keychain identity regressions between
ad-hoc releases.

## Publish the verified artifact

Publish the exact downloaded artifact, not a local rebuild:

```bash
version=0.2.3
project=screenly-503001
bucket=screenly-media-screenly-503001
release_dir=/tmp/screenly-release-$version
sha256="$(awk '{print $1}' "$release_dir/Screenly.dmg.sha256")"
metadata="version=$version,sha256=$sha256"

gcloud storage cp \
  "$release_dir/Screenly.dmg" \
  "gs://$bucket/releases/Screenly-$version.dmg" \
  --project "$project" \
  --content-type application/x-apple-diskimage \
  --cache-control private,max-age=31536000,immutable \
  --custom-metadata "$metadata"

gcloud storage cp \
  "$release_dir/Screenly.dmg" \
  "gs://$bucket/releases/Screenly-latest.dmg" \
  --project "$project" \
  --content-type application/x-apple-diskimage \
  --cache-control private,max-age=300 \
  --custom-metadata "$metadata"

gcloud storage cp \
  "$release_dir/Screenly.dmg.sha256" \
  "gs://$bucket/releases/Screenly-latest.dmg.sha256" \
  --project "$project" \
  --content-type text/plain \
  --cache-control private,max-age=300
```

## Verify production

Bypass the five-minute metadata cache while verifying:

```bash
curl --fail --silent \
  "https://screenly-five.vercel.app/api/releases/macos/latest?verify=$version"

curl --fail --location \
  --output "/tmp/Screenly-$version.dmg" \
  "https://screenly-five.vercel.app/api/releases/macos/download?verify=$version"

shasum -a 256 "/tmp/Screenly-$version.dmg"
```

The API version, metadata checksum, downloaded checksum, and artifact checksum
must all match. Also verify the browser receives the filename
`Screenly-<version>.dmg`.

## Roll back

Keep the last working versioned object. To roll back, copy it over the latest
object and restore its version/checksum metadata:

```bash
version=0.2.1
sha256=<known-good-sha256>
bucket=screenly-media-screenly-503001

gcloud storage cp \
  "gs://$bucket/releases/Screenly-$version.dmg" \
  "gs://$bucket/releases/Screenly-latest.dmg" \
  --content-type application/x-apple-diskimage \
  --cache-control private,max-age=300 \
  --custom-metadata "version=$version,sha256=$sha256"
```

Remove a known-bad versioned object so it cannot be installed accidentally.

## Signing modes

- Developer ID builds are signed, notarized, and suitable for normal external
  distribution. They require the Apple certificate and notarization secrets
  listed in the root `README.md`.
- Ad-hoc builds are for internal distribution. Users may need
  **Control-click → Open** once. They must keep the explicit stable designated
  requirement in `build-release.sh`.

The current stable-identity `0.2.2` validation build was produced by workflow
run `30027261023` from commit `9525f56`, with SHA-256
`b2bc32f14a05f6a8b7e466a7b1b154bacb71b5734ed866297071638503eaaa10`.
It still uses the original `com.screenly.recorder` TCC client key and must not
be used to validate recovery from stale permissions created by `0.2.1` or the
first `0.2.2` build.

## TCC identity migration

Version `0.2.3` intentionally uses the fresh bundle identifier
`com.screenly.recorder.v2`. This creates a new Screen Recording TCC row instead
of colliding with stale rows whose code requirement came from the original
ad-hoc releases. The ad-hoc designated requirement, app bundle identifier, and
Keychain service must all retain their v2 identities in later releases.

The identity migration requires users to grant Screen Recording permission and
sign in once more. After granting Screen Recording access, fully quit and
reopen Screenly before testing capture. Apple's ScreenCaptureKit flow does not
support treating an in-process refresh as a substitute for that restart.

The old row can optionally be removed after quitting both app versions:

```bash
tccutil reset ScreenCapture com.screenly.recorder
```

Do not reset `com.screenly.recorder.v2` while validating the new build.
