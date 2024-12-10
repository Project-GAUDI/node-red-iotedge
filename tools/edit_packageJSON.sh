#!/bin/bash

name="@project-gaudi\/node-red-iotedge"
description="Based on node-red-contrib-azure-iot-edge-module v1.0.4"
target="package.json"
author="Toyota Industries Corporation"
lisence="MIT"
version=${VERSION}
sdkVersion=${SDK_VERSION}

sed -i 's/\"name\": \".*\",/\"name\": \"'"${name}"'\",/g' "${target}"
sed -i 's/\"version\": \".*\",/\"version\": \"'"${version}"'\",/g' "${target}"
sed -i 's/\"description\": \".*\",/\"description\": \"'"${description}"'\",/g' "${target}"
sed -i 's/\"azure-iot-device\": \".*\"/\"@project-gaudi\/gaudi-iot-device\": \"'"${sdkVersion}"'\"/g' "${target}"
sed -i 's/\"azure-iot-device-amqp\": \".*\"/\"@project-gaudi\/gaudi-iot-device-amqp\": \"'"${sdkVersion}"'\"/g' "${target}"
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