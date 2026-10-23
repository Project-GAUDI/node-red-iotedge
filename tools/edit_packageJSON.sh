#!/bin/bash

name="@project-gaudi\/node-red-iotedge"
description="Node-RED-IoTEdge"
target="package.json"
author="Toyota Industries Corporation"
lisence="MIT"
# version=${VERSION}
version='7.0.0'
url="https://github.com/Project-GAUDI/node-red-iotedge"

sed -i 's/\"name\": \".*\",/\"name\": \"'"${name}"'\",/g' "${target}"
sed -i 's/\"version\": \".*\",/\"version\": \"'"${version}"'\",/g' "${target}"
sed -i 's/\"description\": \".*\",/\"description\": \"'"${description}"'\",/g' "${target}"
sed -i 's|"author": ".*",|"author": "'"${author}"'", |g' "${target}"
sed -i 's|"license": ".*"|"license": "'"${lisence}"'"|g' "${target}"

grep -q '"repository"' "${target}" || \
sed -i '/"node-red": {/i \
  "repository": { \
    "type": "git",\
    "url": "git+https://github.com/Project-GAUDI/node-red-iotedge" \
  },' "${target}"

grep -q '"bugs"' "${target}" || \
sed -i '/"node-red": {/i \
  "bugs": { \
    "url": "https://github.com/Project-GAUDI/node-red-iotedge/issues" \
  },' "${target}"

grep -q '"homepage"' "${target}" || \
sed -i '/"node-red": {/i \
  "homepage": "https://github.com/Project-GAUDI/node-red-iotedge#readme",' "${target}"