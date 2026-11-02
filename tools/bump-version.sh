#!/bin/sh
# Stamp a new app version so installed home-screen apps reload themselves.
V=$(date -u +%Y%m%d%H%M)
sed -i "s/const APP_VERSION=\"[0-9]*\"/const APP_VERSION=\"$V\"/" index.html
printf '{"v":"%s"}\n' "$V" > version.json
echo "Version $V"
