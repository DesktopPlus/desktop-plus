#!/bin/bash

set -e

APPIMAGE_FILE="$1"
RUNNER_ARCH="$2"
if [ -z "$APPIMAGE_FILE" ] || [ -z "$RUNNER_ARCH" ]; then
  echo "Usage: $0 <AppImage file> <filename architecture part> <AppImage architecture>"
  exit 1
fi

if [ "$RUNNER_ARCH" = "arm64" ]; then
  FILENAME_ARCH_PART="arm64"
  APPIMAGE_ARCH="aarch64"
elif [ "$RUNNER_ARCH" = "x64" ]; then
  FILENAME_ARCH_PART="x86_64"
  APPIMAGE_ARCH="x86_64"
else 
  echo "Unsupported architecture: $RUNNER_ARCH"
  exit 1
fi

REPO_OWNER="desktop-plus"
REPO_NAME="desktop-plus"
RELEASES_ZSYNC_PATTERN="DesktopPlus-*-linux-$FILENAME_ARCH_PART.AppImage.zsync"

extract_appimage_noexec() {
  local f="$1"
  local outdir="$2"

  local offset
  offset="$(python3 - "$f" <<'PY'
import struct, sys
with open(sys.argv[1], "rb") as fp:
    h = fp.read(64)
bitness, endianness = struct.unpack("4x B B 58x", h)
fmt = (">" if endianness == 2 else "<") + (
    "40x Q 10x H H 2x" if bitness == 2 else "32x L 10x H H 14x"
)
shoff, shentsize, shnum = struct.unpack(fmt, h)
print(shoff + shentsize * shnum)
PY
)"

  rm -rf "$outdir"
  unsquashfs -o "$offset" -d "$outdir" "$f"
}


# Extract AppImage contents
cd "$(dirname "$APPIMAGE_FILE")"
sudo chown -R "$(whoami)" .
APPIMAGE_FILE=$(basename "$APPIMAGE_FILE")
extract_appimage_noexec "$APPIMAGE_FILE" squashfs-root

TAG="latest"  # https://github.com/AppImage/AppImageSpec/blob/master/draft.md#release-name-values
UPDATE_INFO="gh-releases-zsync|$REPO_OWNER|$REPO_NAME|$TAG|$RELEASES_ZSYNC_PATTERN"

curl -L -o appimagetool https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage
chmod +x appimagetool

# Embed update info and re-pack (this will generate the .zsync file)
ARCH="$APPIMAGE_ARCH" ./appimagetool -u "$UPDATE_INFO" squashfs-root "$APPIMAGE_FILE"

# Cleanup
rm -rf squashfs-root appimagetool
