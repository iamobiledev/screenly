#!/usr/bin/env bash
set -euo pipefail

unsigned_build="${MAC_UNSIGNED_BUILD:-false}"

if [[ "${unsigned_build}" != "true" ]]; then
  required_variables=(
    APPLE_ID
    APPLE_APP_PASSWORD
    APPLE_TEAM_ID
  )

  for variable in "${required_variables[@]}"; do
    if [[ -z "${!variable:-}" ]]; then
      echo "Missing required environment variable: ${variable}" >&2
      exit 1
    fi
  done
fi

command -v xcodegen >/dev/null || {
  echo "XcodeGen is required: brew install xcodegen" >&2
  exit 1
}

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project_directory="$(cd "${script_directory}/.." && pwd)"
build_directory="${project_directory}/build/release"
archive_path="${build_directory}/Screenly.xcarchive"
staging_directory="${build_directory}/dmg"
output_path="${build_directory}/Screenly.dmg"
marketing_version="${MAC_APP_VERSION:-0.1.0}"
build_number="${MAC_BUILD_NUMBER:-1}"
expected_bundle_identifier="com.screenly.recorder"

rm -rf "${build_directory}"
mkdir -p "${staging_directory}"

cd "${project_directory}"
xcodegen generate

if [[ "${unsigned_build}" == "true" ]]; then
  xcodebuild \
    -project Screenly.xcodeproj \
    -scheme Screenly \
    -configuration Release \
    -archivePath "${archive_path}" \
    archive \
    MARKETING_VERSION="${marketing_version}" \
    CURRENT_PROJECT_VERSION="${build_number}" \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO
else
  xcodebuild \
    -project Screenly.xcodeproj \
    -scheme Screenly \
    -configuration Release \
    -archivePath "${archive_path}" \
    archive \
    DEVELOPMENT_TEAM="${APPLE_TEAM_ID}" \
    MARKETING_VERSION="${marketing_version}" \
    CURRENT_PROJECT_VERSION="${build_number}" \
    CODE_SIGN_STYLE=Manual \
    CODE_SIGN_IDENTITY="Developer ID Application"
fi

application_path="${archive_path}/Products/Applications/Screenly.app"
info_plist="${application_path}/Contents/Info.plist"
bundle_identifier="$(
  /usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "${info_plist}"
)"

if [[ "${bundle_identifier}" != "${expected_bundle_identifier}" ]]; then
  echo "Unexpected bundle identifier: ${bundle_identifier}" >&2
  echo "Expected: ${expected_bundle_identifier}" >&2
  exit 1
fi

if [[ "${unsigned_build}" == "true" ]]; then
  codesign \
    --force \
    --deep \
    --options runtime \
    --sign - \
    --identifier "${bundle_identifier}" \
    --requirements "=designated => identifier \"${bundle_identifier}\"" \
    --entitlements "${project_directory}/Screenly/Resources/Screenly.entitlements" \
    "${application_path}"
fi

codesign --verify --deep --strict --verbose=2 "${application_path}"

designated_requirement="$(
  codesign --display --requirements - "${application_path}" 2>&1 |
    awk '/^designated => / { print; exit }'
)"
if [[ "${designated_requirement}" != *"identifier \"${bundle_identifier}\""* ]]; then
  echo "Unexpected designated requirement: ${designated_requirement}" >&2
  exit 1
fi

ditto "${application_path}" "${staging_directory}/Screenly.app"
ln -s /Applications "${staging_directory}/Applications"

hdiutil create \
  -volname Screenly \
  -srcfolder "${staging_directory}" \
  -ov \
  -format UDZO \
  "${output_path}"

if [[ "${unsigned_build}" != "true" ]]; then
  codesign \
    --force \
    --timestamp \
    --sign "Developer ID Application" \
    "${output_path}"

  xcrun notarytool submit "${output_path}" \
    --apple-id "${APPLE_ID}" \
    --password "${APPLE_APP_PASSWORD}" \
    --team-id "${APPLE_TEAM_ID}" \
    --wait

  xcrun stapler staple "${output_path}"
  xcrun stapler validate "${output_path}"
fi

shasum -a 256 "${output_path}" | tee "${output_path}.sha256"

echo "Release ready: ${output_path}"
