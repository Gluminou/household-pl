#!/bin/sh
# New build after a data-only change (receipts), so installed apps reload.
# Keeps the version number, date and What's new notes in version.json.
# For a change people should see in What's new: node tools/release.mjs patch "What changed"
V=$(date -u +%Y%m%d%H%M)
sed -i "s/const APP_VERSION=\"[0-9]*\"/const APP_VERSION=\"$V\"/" index.html
node -e 'const fs=require("fs");let j={};try{j=JSON.parse(fs.readFileSync("version.json","utf8"))}catch(e){};j.v=process.argv[1];fs.writeFileSync("version.json",JSON.stringify(j,null,2)+"\n")' "$V"
echo "Version $V"
