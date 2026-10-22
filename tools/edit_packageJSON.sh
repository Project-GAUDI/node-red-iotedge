#!/bin/bash
set -euo pipefail

name="@project-gaudi/node-red-iotedge"
version="${VERSION:?VERSION is required}"
sdkVersion="${SDK_VERSION:?SDK_VERSION is required}"
description="Based on node-red-contrib-azure-iot-edge-module v1.0.4"
target="package.json"

sed -i 's|"name": ".*"|"name": "'"${name}"'"|g' "${target}"
sed -i 's|"version": ".*"|"version": "'"${version}"'"|g' "${target}"
sed -i 's|"description": ".*"|"description": "'"${description}"'"|g' "${target}"
sed -i 's|"azure-iot-device": ".*"|"gaudi-iot-device": "npm:@project-gaudi/gaudi-iot-device@'"${sdkVersion}"'"|g' "${target}"
sed -i 's/\"azure-iot-device-amqp\": \".*\"/\"azure-iot-device-amqp\": \"'"1.14.4"'\"/g' "${target}"
sed -i 's/\"azure-iot-device-mqtt\": \".*\"/\"azure-iot-device-mqtt\": \"'"^1.16.4"'\"/g' "${target}"
