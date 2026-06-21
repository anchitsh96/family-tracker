#!/usr/bin/env bash
# ship-android.sh — build a signed release APK ready to sideload to Dad's phone.
#
# Run:   npm run ship:android
#
# Output: kosh/android/app/build/outputs/apk/release/app-release.apk
# Send that file to Dad via email / Drive / AirDrop-equivalent. He taps
# it to install (Android prompts "install from unknown source" the first
# time; on updates it says "update existing").
#
# Prerequisites:
#   - Java 17+ (Android Studio bundles one — we use that by default).
#   - Android SDK + platform-tools (Android Studio installs both).
#   - Run scripts/setup-android-keystore.sh ONCE to generate the
#     signing keystore. Lost keystore = can't update existing installs.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Toolchain — sensible Mac defaults; override via env if your install differs.
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

if [[ ! -x "$JAVA_HOME/bin/java" ]]; then
  echo "✘ Java not found at $JAVA_HOME"
  echo "  Install Android Studio (bundles Java 17) or set JAVA_HOME."
  exit 1
fi
if [[ ! -d "$ANDROID_HOME/platform-tools" ]]; then
  echo "✘ Android SDK not found at $ANDROID_HOME"
  echo "  Install via Android Studio → Settings → Languages & Frameworks → Android SDK,"
  echo "  or set ANDROID_HOME."
  exit 1
fi

# Keystore
KEYSTORE_DIR="$REPO_ROOT/android/keystore"
PROPS_FILE="$KEYSTORE_DIR/keystore.properties"
if [[ ! -f "$PROPS_FILE" ]]; then
  echo "✘ Keystore properties missing at $PROPS_FILE"
  echo "  Run: ./scripts/setup-android-keystore.sh"
  exit 1
fi
# shellcheck disable=SC1090
source "$PROPS_FILE"
if [[ ! -f "$KOSH_KEYSTORE_PATH" ]]; then
  echo "✘ Keystore file missing at $KOSH_KEYSTORE_PATH"
  exit 1
fi

# Prebuild Android if android/ is missing (someone cloned the repo fresh).
if [[ ! -d "$REPO_ROOT/android/app" ]]; then
  echo "▸ android/ missing — running expo prebuild…"
  npx expo prebuild --platform android --no-install
fi

# Refuse to ship from a dirty tree — every release should map to a sha.
if ! git diff-index --quiet HEAD --; then
  echo "✘ Working tree has uncommitted changes. Commit or stash first."
  git status --short
  exit 1
fi

# Bump versionCode so successive APKs install as updates. Reads the
# current versionCode from android/app/build.gradle, increments, writes
# back, commits the bump.
GRADLE_FILE="$REPO_ROOT/android/app/build.gradle"
CURRENT_CODE=$(grep -E "^\s*versionCode\s+[0-9]+" "$GRADLE_FILE" | grep -oE "[0-9]+" | head -1)
NEXT_CODE=$((CURRENT_CODE + 1))
echo "▸ Bumping versionCode → $NEXT_CODE"
# Use a delimiter that's safe in case of unusual indentation.
sed -i.bak -E "s/(^\s*versionCode\s+)[0-9]+/\1$NEXT_CODE/" "$GRADLE_FILE"
rm -f "$GRADLE_FILE.bak"

# android/ is gitignored in this repo (Expo bare workflow regenerates
# it), so we don't bother committing the bump — re-running prebuild will
# regenerate the same versionCode unless we tracked it via app.json.
# TODO: move versionCode to app.json so the bump survives prebuild.

echo "▸ Assembling release APK…"
cd android
./gradlew assembleRelease \
  -Pandroid.injected.signing.store.file="$KOSH_KEYSTORE_PATH" \
  -Pandroid.injected.signing.store.password="$KOSH_KEYSTORE_PASS" \
  -Pandroid.injected.signing.key.alias="$KOSH_KEY_ALIAS" \
  -Pandroid.injected.signing.key.password="$KOSH_KEY_PASS"

APK="$REPO_ROOT/android/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "$APK" ]]; then
  echo "✘ Build finished but APK not found at $APK"
  exit 1
fi

echo
echo "✔ APK ready: $APK"
ls -lh "$APK"
echo
echo "▸ Next step:"
echo "  - Send the APK to Dad via email / Drive / WhatsApp / USB."
echo "  - First install: he'll need to allow 'install from unknown source'"
echo "    for the app delivering the APK (Settings → Apps → Special access)."
echo "  - Subsequent installs: Android prompts 'update existing app'."
