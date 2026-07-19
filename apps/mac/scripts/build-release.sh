#!/usr/bin/env bash
set -euo pipefail

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

rm -rf "${build_directory}"
mkdir -p "${staging_directory}"

cd "${project_directory}"
xcodegen generate

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

application_path="${archive_path}/Products/Applications/Screenly.app"
codesign --verify --deep --strict --verbose=2 "${application_path}"

ditto "${application_path}" "${staging_directory}/Screenly.app"
ln -s /Applications "${staging_directory}/Applications"

hdiutil create \
  -volname Screenly \
  -srcfolder "${staging_directory}" \
  -ov \
  -format UDZO \
  "${output_path}"

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
shasum -a 256 "${output_path}" | tee "${output_path}.sha256"

echo "Release ready: ${output_path}"
