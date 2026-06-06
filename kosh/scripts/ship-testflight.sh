#!/usr/bin/env bash
# ship-testflight.sh — archive Kosh and produce a TestFlight-ready IPA.
#
# Run:   KOSH_TEAM_ID=YOURTEAMID ./scripts/ship-testflight.sh
#
# What this does:
#   1. Sanity checks: working tree clean, KOSH_TEAM_ID set, paid team.
#   2. Bumps CFBundleVersion (TestFlight requires monotonically increasing).
#   3. xcodebuild archive in Release.
#   4. xcodebuild -exportArchive → ./build/Kosh.ipa, ready for TestFlight.
#   5. Prints "next step": drag the IPA into Transporter.app, or run
#      `xcrun altool --upload-app -f build/Kosh.ipa -t ios -u <apple-id> -p <app-specific-pw>`.
#
# Prerequisites (one-time, in App Store Connect — do this once your
# Apple Developer Program enrollment is approved):
#   - Register bundle id `com.anchit.kosh` under Identifiers
#     → https://developer.apple.com/account/resources/identifiers/list
#   - Create app record in App Store Connect with that bundle id
#     → https://appstoreconnect.apple.com/apps  (My Apps → +)
#     (Pick name "Kosh", primary language English, SKU = anything you like.)
#   - Make sure Xcode is signed in to your paid team:
#     Xcode → Settings → Accounts → Apple ID → Manage Certificates →
#     create an "Apple Distribution" certificate.
#   - Install Transporter from the Mac App Store (free), OR generate an
#     app-specific password at https://appleid.apple.com for altool uploads.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -z "${KOSH_TEAM_ID:-}" ]]; then
  echo "✘ KOSH_TEAM_ID is not set."
  echo "  Run with:  KOSH_TEAM_ID=ABC123DEF4 $0"
  echo "  (Find your paid team ID in App Store Connect → Membership.)"
  exit 1
fi

# Refuse to ship a dirty tree — every TestFlight build should be
# reproducible from a git sha.
if ! git diff-index --quiet HEAD --; then
  echo "✘ Working tree has uncommitted changes. Commit or stash first."
  git status --short
  exit 1
fi

INFOPLIST="ios/Kosh/Info.plist"
CURRENT_BUILD=$(plutil -extract CFBundleVersion raw "$INFOPLIST")
CURRENT_VERSION=$(plutil -extract CFBundleShortVersionString raw "$INFOPLIST")
NEXT_BUILD=$((CURRENT_BUILD + 1))

echo "▸ Current version: $CURRENT_VERSION  build $CURRENT_BUILD"
echo "▸ Bumping CFBundleVersion → $NEXT_BUILD"
plutil -replace CFBundleVersion -string "$NEXT_BUILD" "$INFOPLIST"

# Stage the bump in a commit so the shipped IPA is tied to a git sha.
git add "$INFOPLIST"
git commit -m "Bump iOS build to $NEXT_BUILD for TestFlight" >/dev/null

ARCHIVE_PATH="$REPO_ROOT/build/Kosh.xcarchive"
EXPORT_PATH="$REPO_ROOT/build"
EXPORT_OPTIONS="$REPO_ROOT/scripts/ExportOptions.plist"
rm -rf "$REPO_ROOT/build"
mkdir -p "$EXPORT_PATH"

# Generate ExportOptions.plist with the user's team id baked in. Using
# `app-store-connect` method + automatic signing matches what TestFlight
# expects; the bundle id check is implicit (Xcode validates against the
# registered app record).
cat > "$EXPORT_OPTIONS" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>$KOSH_TEAM_ID</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>uploadSymbols</key>
  <true/>
  <key>destination</key>
  <string>export</string>
</dict>
</plist>
EOF

echo "▸ Archiving (Release)…"
xcodebuild \
  -workspace ios/Kosh.xcworkspace \
  -scheme Kosh \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$KOSH_TEAM_ID" \
  archive

echo "▸ Exporting IPA…"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -exportPath "$EXPORT_PATH"

IPA="$EXPORT_PATH/Kosh.ipa"
if [[ ! -f "$IPA" ]]; then
  echo "✘ Export finished but $IPA not found. Look in $EXPORT_PATH:"
  ls -la "$EXPORT_PATH"
  exit 1
fi

echo
echo "✔ Archive + export done."
echo "  IPA: $IPA"
echo
echo "▸ Next step (pick one):"
echo "  A. Drag $IPA into Transporter.app, click Deliver."
echo "  B. Or upload from CLI:"
echo "     xcrun altool --upload-app -f \"$IPA\" -t ios \\"
echo "       -u <your-apple-id> -p <app-specific-password>"
echo
echo "▸ Then go to https://appstoreconnect.apple.com/apps → Kosh → TestFlight,"
echo "  wait ~10 min for processing, add yourself as an internal tester."
