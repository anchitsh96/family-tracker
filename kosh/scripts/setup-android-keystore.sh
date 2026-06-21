#!/usr/bin/env bash
# setup-android-keystore.sh — one-time generator for the release signing keystore.
#
# Run ONCE per development machine. Stores the keystore at
# kosh/android/keystore/kosh-release.keystore and writes a properties
# file with the passwords at kosh/android/keystore/keystore.properties.
# Both files are gitignored.
#
# Run:  ./scripts/setup-android-keystore.sh
#
# You'll be prompted twice for a keystore password. CHOOSE A STRONG ONE
# and STORE IT in your password manager — losing this keystore means
# Android won't let you push updates to existing installs.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

KEYSTORE_DIR="$REPO_ROOT/android/keystore"
KEYSTORE_FILE="$KEYSTORE_DIR/kosh-release.keystore"
PROPS_FILE="$KEYSTORE_DIR/keystore.properties"

if [[ -f "$KEYSTORE_FILE" ]]; then
  echo "✘ Keystore already exists at $KEYSTORE_FILE"
  echo "  If you want to regenerate, delete it first — but that PERMANENTLY"
  echo "  breaks update-installs of Kosh on any device using the old keystore."
  exit 1
fi

mkdir -p "$KEYSTORE_DIR"

JAVA_HOME_RESOLVED="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
KEYTOOL="$JAVA_HOME_RESOLVED/bin/keytool"
if [[ ! -x "$KEYTOOL" ]]; then
  echo "✘ keytool not found at $KEYTOOL"
  echo "  Install a JDK 17+ (or Android Studio), then retry."
  exit 1
fi

read -s -p "Keystore password (>= 8 chars): " KS_PASS
echo
read -s -p "Re-enter keystore password: " KS_PASS_2
echo
if [[ "$KS_PASS" != "$KS_PASS_2" ]]; then
  echo "✘ Passwords don't match."
  exit 1
fi
if [[ ${#KS_PASS} -lt 8 ]]; then
  echo "✘ Password must be at least 8 characters."
  exit 1
fi

# Use the same password for the keystore and the key entry. Simpler to
# remember and there's no real benefit to separating them for a single-
# key store like this one.
"$KEYTOOL" -genkeypair \
  -keystore "$KEYSTORE_FILE" \
  -storepass "$KS_PASS" \
  -alias kosh \
  -keypass "$KS_PASS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 36500 \
  -dname "CN=Kosh, O=Personal, L=Bengaluru, S=KA, C=IN" \
  -storetype JKS

cat > "$PROPS_FILE" <<EOF
# Read by scripts/ship-android.sh. Gitignored — do not commit.
KOSH_KEYSTORE_PATH=$KEYSTORE_FILE
KOSH_KEYSTORE_PASS=$KS_PASS
KOSH_KEY_ALIAS=kosh
KOSH_KEY_PASS=$KS_PASS
EOF
chmod 600 "$PROPS_FILE" "$KEYSTORE_FILE"

echo
echo "✔ Keystore created at $KEYSTORE_FILE"
echo "✔ Properties written to $PROPS_FILE"
echo
echo "Next steps:"
echo "  1. Save the password to your password manager (label it 'Kosh Android keystore')."
echo "  2. Back up $KEYSTORE_FILE somewhere safe — losing it breaks future updates."
echo "  3. Run: npm run ship:android"
