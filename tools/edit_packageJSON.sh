#!/bin/bash

# name="node-red-iotedge"
version="$1"
description="Based on node-red-contrib-azure-iot-edge-module v1.0.4"
target="package.json"

# sed -i 's/\"name\": \".*\",/\"name\": \"'"${name}"'\",/g' "${target}"
sed -i 's/\"version\": \".*\",/\"version\": \"'"${version}"'\",/g' "${target}"
sed -i 's/\"description\": \".*\",/\"description\": \"'"${description}"'\",/g' "${target}"
