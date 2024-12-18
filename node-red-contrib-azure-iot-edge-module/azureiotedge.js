module.exports = function (RED) {
    'use strict'

    var TransportAmqp = require('@project-gaudi/gaudi-iot-device').Amqp;
    var TransportMqtt = require('azure-iot-device-mqtt').Mqtt;

    var TransportProtocol = "Amqp";         // 使用プロトコルの設定(Amqp/Mqtt)
    var Transport = null;
    if (TransportProtocol === "Amqp") {
        Transport = TransportAmqp;
    }
    else {
        Transport = TransportMqtt;
    }

    var Client = require('gaudi-iot-device').ModuleClient;
    var Message = require('gaudi-iot-device').Message;

    // azure-iot-commonはazure-iot-device他の依存関係に含まれているためdepenedenciesには含めていない
    var MyExponentialBackOffWithJitter = require('azure-iot-common').ExponentialBackOffWithJitter;
    var myErrors = require('azure-iot-common').errors;

    var myErrorFilter = require('./myErrorFilter');

    var statusEnum = {
        disconnected: { color: "red", text: "Disconnected" },
        connected: { color: "green", text: "Connected" },
        sent: { color: "blue", text: "Sending message" },
        received: { color: "yellow", text: "Receiving message" },
        reported: { color: "blue", text: "Sending reported properties" },
        desired: { color: "yellow", text: "Receiving desired properties" },
        method: { color: "yellow", text: "Receiving direct method" },
        response: { color: "blue", text: "Sending method response" },
        error: { color: "grey", text: "Error" }
    };

    var edgeClient;
    var moduleTwin;
    var methodResponses = [];

    // Function to create the IoT Edge Client 
    function IoTEdgeClient(config) {
        // Store node for further use
        var node = this;
        node.connected = false;

        // Create the Node-RED node
        RED.nodes.createNode(this, config);

        // Create the IoT Edge client
        Client.fromEnvironment(Transport, function (err, client) {
            if (err) {
                node.error('Module Client creation error:' + err);
            }
            else {
                client.on('error', function (err) {
                    node.error('Module Client error:' + err);
                });
                client.on('preDisconnect', function (msg) {
                    node.error('Module Client preDisconnect:' + msg);
                });
                client.on('disconnect', function (err) {
                    node.error('Module Client disconnected:' + JSON.stringify(err));
                });
                node.log('Module Client created.');
                var result = setTimeoutOptions(client, node);
                if (false === result) {
                    return;
                }
                // メッセージ容量上限
                const defaultMaxSize = 256 * 1024;
                // const maxSize = 256 * 1024 - 167;
                // 検証で求められた上限は上記の値だが、下記のメソッドで少し余裕(1KB)を持たせて差し引いている
                client.maxSize = getMaxMessageSize(node, defaultMaxSize);
                // input名オブジェクト
                client.inputNames = {};
                // input名追加兼チェック用関数
                client.addInputName = function (inputName, id) {
                    var result = false;
                    if (false == (inputName in client.inputNames)) {
                        node.debug("Add input name = " + inputName);
                        client.inputNames[inputName] = id;
                        result = true;
                    }
                    node.debug("inputNames: " + JSON.stringify(client.inputNames));
                    return result;
                }
                // input名削除用関数
                client.removeInputName = function (inputName, id) {
                    if (true == (inputName in client.inputNames)) {
                        if (id == client.inputNames[inputName]) {
                            node.debug("Remove input name = " + inputName + ", id = " + id);
                            delete client.inputNames[inputName];
                        }
                    }
                    node.debug("inputNames: " + JSON.stringify(client.inputNames));
                }
                client.removeAllInputNames = function () {
                    client.inputNames = {};
                }
                // connect to the Edge instance
                client.open(function (err) {
                    if (err) {
                        node.error('Module Client open error:' + err);
                        throw err;
                    } else {
                        node.log('Module Client connected.');
                        edgeClient = client;
                        client.getTwin(function (err, twin) {
                            if (err) {
                                node.error('Could not get the module twin: ' + err);
                                throw err;
                            } else {
                                node.log('Module twin created.');
                                node.trace('Twin contents:');
                                node.trace(JSON.stringify(twin.properties));

                                node.on('close', function () {
                                    node.log('Azure IoT Edge Module Client closed.');
                                    edgeClient = null;
                                    moduleTwin = null;
                                    client.removeAllInputNames();
                                    twin.removeAllListeners();
                                    client.removeAllListeners();
                                    client.close();
                                });
                                moduleTwin = twin;
                            }
                        });
                    }
                });
            }
        });
    }

    // Function to create the Module Twin 
    function ModuleTwin(config) {
        // Store node for further use
        var node = this;

        // Create the Node-RED node
        RED.nodes.createNode(this, config);
        setStatus(node, statusEnum.disconnected);

        // Get the twin
        getTwin(node).then(function (twin) {
            setStatus(node, statusEnum.connected);
            // Register for changes
            twin.on('properties.desired', function (delta) {
                setStatus(node, statusEnum.desired);
                node.log('New desired properties received.');
                node.trace('New desired properties: ' + JSON.stringify(delta));
                node.send({ payload: delta, topic: "desired" })
                setStatus(node, statusEnum.connected);
            });

            node.on('input', function (msg) {
                setStatus(node, statusEnum.reported);
                var messageJSON = null;

                if (typeof (msg.payload) != "string") {
                    messageJSON = msg.payload;
                } else {
                    //Converting string to JSON Object
                    messageJSON = JSON.parse(msg.payload);
                }

                twin.properties.reported.update(messageJSON, function (err) {
                    if (err) throw err;
                    node.log('Twin state reported.');
                    setStatus(node, statusEnum.connected);
                });
            });
        })
            .catch(function (err) {
                node.error('Module Twin error:' + err);
            });

        node.on('close', function (done) {
            setStatus(node, statusEnum.disconnected);
            done();
        });
    }

    // Module input to receive input from edgeHub
    function ModuleInput(config) {
        // Store node for further use
        var node = this;
        node.input = config.input;
        node.alive = true;          // ノードの生存フラグをon

        // Create the Node-RED node
        RED.nodes.createNode(this, config);
        setStatus(node, statusEnum.disconnected);
        getClient(node).then(function (client) {
            setStatus(node, statusEnum.connected);
            // Act on module input messages
            node.log("Module Input created: " + node.input);

            node.client = client;

            var onInputMessage = function (inputName, msg) {

                // ノードがclose済みの場合、イベントを削除のみを行う。
                // ※ 本来closeコールバック内で処理すべきだが、そうするとメッセージ受信ができなくなるケースが発生するため、
                //    このタイミングで実施している。
                //
                //　【メッセージ受信ができなくなるケース】　
                //     条件：ModuleInputの再作成をして、「変更したフロー」または「変更したノード」でデプロイ
                //     動作：
                //       1.フローのstop
                //       2.ノードのclose処理 ⇒ clientの無効化(非同期)
                //       3.フローのstart
                //       4.ノードのcreate ⇒ clientの有効化
                //       5.(2.clientの無効化が遅れて実行)

                if (false === node.alive) {
                    client.off('inputMessage', onInputMessage);
                    return;
                }

                outputMessage(client, node, inputName, msg);
            }

            var isOnly = client.addInputName(node.input, node.id);
            if (false == isOnly) {
                node.error("Input Name duplicated.");
                setStatus(node, statusEnum.error);
            }

            client.on('inputMessage', onInputMessage);
        })
            .catch(function (err) {
                node.error("Module Input can't be loaded: " + err);
            });

        node.on('close', function (done) {
            setStatus(node, statusEnum.disconnected);
            node.alive = false;         // ノードの生存フラグをoff
            node.client.removeInputName(node.input, node.id);
            done();
        });
    }

    // Module output to send output to edgeHub 
    function ModuleOutput(config) {
        // Store node for further use
        var node = this;
        node.output = config.output;

        // Create the Node-RED node
        RED.nodes.createNode(this, config);
        setStatus(node, statusEnum.disconnected);
        getClient(node).then(function (client) {
            setStatus(node, statusEnum.connected);
            // React on input from node-red
            node.log("Module Output created: " + node.output);
            node.on('input', function (msg) {
                setStatus(node, statusEnum.sent);
                sendMessageToEdgeHub(client, node, msg, node.output);
            });
        })
            .catch(function (err) {
                node.error("Module Output can't be loaded: " + err);
            });

        node.on('close', function (done) {
            setStatus(node, statusEnum.disconnected);
            done();
        });
    }

    // Module method to receive methods from IoT Hub 
    function ModuleMethod(config) {
        // Store node for further use
        var node = this;
        node.method = config.method;

        // Create the Node-RED node
        RED.nodes.createNode(this, config);
        setStatus(node, statusEnum.disconnected);
        getClient(node).then(function (client) {
            setStatus(node, statusEnum.connected);
            var mthd = node.method;
            node.log('Direct Method created: ' + mthd);
            client.onMethod(mthd, function (request, response) {
                // Set status
                setStatus(node, statusEnum.method);
                node.log('Direct Method called: ' + request.methodName);

                if (request.payload) {
                    node.trace('Method Payload:' + JSON.stringify(request.payload));
                    node.send({ payload: request.payload, topic: "method", method: request.methodName });
                }
                else {
                    node.send({ payload: null, topic: "method", method: request.methodName });
                }

                getResponse(node).then(function (rspns) {
                    var responseBody;
                    if (typeof (rspns.response) != "string") {
                        // Turn message object into string 
                        responseBody = JSON.stringify(rspns.response);
                    } else {
                        responseBody = rspns.response;
                    }
                    response.send(rspns.status, responseBody, function (err) {
                        if (err) {
                            node.error('Failed sending method response: ' + err);
                        } else {
                            node.log('Successfully sent method response.');
                        }
                    });
                })
                    .catch(function (err) {
                        node.error("Failed sending method response: response not received.");
                    });
                // reset response
                node.response = null;

                setStatus(node, statusEnum.connected);
            });

            // Set method response on input
            node.on('input', function (msg) {
                var method = node.method;
                methodResponses.push(
                    { method: method, response: msg.payload, status: msg.status }
                );
                node.trace("Module Method response set through node input: " + JSON.stringify(methodResponses.find(function (m) { return m.method === method })));
            });
        })
            .catch(function (err) {
                node.error("Module Method can't be loaded: " + err);
            });

        node.on('close', function (done) {
            setStatus(node, statusEnum.disconnected);
            done();
        });
    }

    function setTimeoutOptions(client, node) {
        try {
            node.trace("setTimeoutOptions start.");
            client.setMaxOperationTimeout(getMaxOperationTimeout(node));
            client.setRetryPolicy(new MyExponentialBackOffWithJitter(true, getErrorFilter(node)));
        } catch (err) {
            node.error("setTimeoutOptions failed.: " + err);
            return false;
        }
        return true;
    }

    function getMaxOperationTimeout(node) {
        node.trace("getMaxOperationTimeout start.");
        var strtimeout = process.env.AzureIoTMaxOperationTimeout || "3600000";
        var timeout = parseInt(strtimeout);
        if (true == isNaN(timeout)) {
            throw new Error("AzureIoTMaxOperationTimeout is not Number.:" + strtimeout);
        }
        node.debug("timeout = " + strtimeout);
        return timeout;
    }

    function getErrorFilter(node) {
        node.trace("getErrorFilter start.");
        var errorFilter = new myErrorFilter.myErrorFilter();
        var retryErrorFilter = process.env.RetryErrorFilter || "";
        if ("" != retryErrorFilter) {
            var retryErrorFilterList = retryErrorFilter.split(",");
            for (var counter = 0; counter < retryErrorFilterList.length; counter++) {
                var keyValue = retryErrorFilterList[counter].split("=");
                try {
                    var value = toBoolean(keyValue[1].trim());
                    var key = keyValue[0].trim();
                    errorFilter[key] = value;
                    node.debug(`ErrorFilter ${key} = ${value} set.`);
                }
                catch (err) {
                    throw new Error("RetryErrorFilter format error.:" + retryErrorFilterList[counter]);
                }
            }
        }
        node.debug("ErrorFilter : " + JSON.stringify(errorFilter, null, "\t"));
        return errorFilter;
    }

    function getMaxMessageSize(node, defaultMaxSize) {
        // 最大メッセージ容量上限
        const maxMessageSize = 16 * 1024 * 1024;
        node.trace("getMaxMessageSize start.");
        var retMaxMessageSize = defaultMaxSize;
        var strMessageSizeLimitExpansion = process.env.MessageSizeLimitExpansion || "";
        try {
            if ("" != strMessageSizeLimitExpansion) {
                var boolMessageSizeLimitExpansion = toBoolean(strMessageSizeLimitExpansion);
                if (boolMessageSizeLimitExpansion) {
                    retMaxMessageSize = maxMessageSize;
                }
            }
        }
        catch (err) {
            node.log("MessageSizeLimitExpansion format error. Set default value.");
        }

        // 1KB分の余裕をもたせる
        retMaxMessageSize = retMaxMessageSize - 1024;

        node.debug("MaxMessageSize : " + retMaxMessageSize);

        return retMaxMessageSize;
    }

    function toBoolean(data) {
        var returnValue = false;
        if (data.toLowerCase() === 'true') {
            returnValue = true;
        }
        else if (data.toLowerCase() === 'false') {
            returnValue = false;
        }
        else {
            throw new Error("Data(" + data + ") is not boolean.");
        }

        return returnValue;
    }

    function calcWaitTime(timeOut, count) {
        var retWaitTime = timeOut * ((count % 10) + 1);
        return retWaitTime;
    }

    // Get module client using promise, and retry, and slow backoff
    function getClient(node) {
        node.trace("getClient start.");
        var timeOut = 1000;
        var maxOperationTimeOut = getMaxOperationTimeout(node);

        // Retrieve client using progressive promise to wait for module client to be opened
        var promise = Promise.reject();
        var retries = 0;
        var waitTime = 0;
        var waitTimeTotal = 0;
        while (waitTimeTotal < maxOperationTimeOut) {
            retries++;
            waitTime = calcWaitTime(timeOut, retries);
            waitTimeTotal = waitTimeTotal + waitTime;
            promise = promise.catch(function () {
                if (edgeClient) {
                    node.trace("Got Module Client.");
                    return edgeClient;
                }
                else {
                    throw new Error("Module Client not initiated..");
                }
            })
            .catch(function rejectDelay(reason) {
                retries++;
                return new Promise(function (resolve, reject) {
                    waitTime = calcWaitTime(timeOut, retries);
                    waitTimeTotal = waitTimeTotal + waitTime;
                    node.debug("setTimeout start. retries = " + retries + ", waitTime = " + waitTime + ", waitTimeTotal = " + waitTimeTotal);
                    setTimeout(reject.bind(null, reason), waitTime);
                });
            });
        }
        retries = 0;
        waitTimeTotal = 0;

        node.trace("getClient end.");
        return promise;
    }

    // Get module twin using promise, and retry, and slow backoff
    function getTwin(node) {
        node.trace("getTwin start.");
        var timeOut = 1000;
        var maxOperationTimeOut = getMaxOperationTimeout(node);

        // Retrieve twin using progressive promise to wait for module twin to be opened
        var promise = Promise.reject();
        var retries = 0;
        var waitTime = 0;
        var waitTimeTotal = 0;
        while (waitTimeTotal < maxOperationTimeOut) {
            retries++;
            waitTime = calcWaitTime(timeOut, retries);
            waitTimeTotal = waitTimeTotal + waitTime;
            promise = promise.catch(function () {
                if (moduleTwin) {
                    node.trace("Got Module Twin.");
                    return moduleTwin;
                }
                else {
                    throw new Error("Module Twin not initiated..");
                }
            })
            .catch(function rejectDelay(reason) {
                retries++;
                return new Promise(function (resolve, reject) {
                    waitTime = calcWaitTime(timeOut, retries);
                    waitTimeTotal = waitTimeTotal + waitTime;
                    node.debug("setTimeout start. retries = " + retries + ", waitTime = " + waitTime + ", waitTimeTotal = " + waitTimeTotal);
                    setTimeout(reject.bind(null, reason), waitTime);
                });
            });
        }
        retries = 0;
        waitTimeTotal = 0;

        node.trace("getTwin end.");
        return promise;
    }

    // Get module method response using promise, and retry, and slow backoff
    function getResponse(node) {
        var retries = 20;
        var timeOut = 1000;
        var m = {};
        node.trace("Module Method node method: " + node.method);
        // Retrieve client using progressive promise to wait for module client to be opened
        var promise = Promise.reject();
        for (var i = 1; i <= retries; i++) {
            promise = promise.catch(function () {
                var methodResponse = methodResponses.find(function (m) { return m.method === node.method });
                if (methodResponse) {
                    // get the response and clean the array
                    var response = methodResponse;
                    node.trace("Module Method response object found: " + JSON.stringify(response));
                    methodResponses.splice(methodResponses.findIndex(function (m) { return m.method === node.method }), 1);
                    return response;
                }
                else {
                    throw new Error("Module Method Response not initiated..");
                }
            })
                .catch(function rejectDelay(reason) {
                    retries++;
                    return new Promise(function (resolve, reject) {
                        setTimeout(reject.bind(null, reason), timeOut * ((retries % 10) + 1));
                    });
                });
        }
        return promise;
    }

    function setSystemProperties(property, properties) {
        if (properties.getValue(property.key)) {
            var index = properties.propertyList.find(prop => prop.key === property.key)
            properties.propertyList[index] = property;
        } else {
            properties.propertyList.push(property);
        }
    }

    // This function just sends the incoming message to the node output adding the topic "input" and the input name.
    var outputMessage = function (client, node, inputName, msg) {
        var message = { payload: "" };
        try {
            // Amqpの場合、複数ModuleInputが存在し複数回complete実行されるとエラーになるため
            // input名一致時のみ実施するように変更
            // client.complete(msg, function (err) {
            //     if (err) {
            //         node.error('Failed sending message to node output:' + err);
            //         setStatus(node, statusEnum.error);
            //     }
            // });

            if (inputName === node.input) {
                // complete移動先
                client.complete(msg, function (err) {
                    if (err) {
                        if (err instanceof myErrors.DeviceMessageLockLostError) {
                            node.error('Failed sending message to node output. Nodes with the same input name may exist.:' + err);
                            setStatus(node, statusEnum.error);
                        } else {
                            node.error('Failed sending message to node output:' + err);
                            setStatus(node, statusEnum.error);
                        }
                    }
                });
                setStatus(node, statusEnum.received);
                var messageString = msg.getBytes().toString('utf8');
                var messageJSON = "";
                if (messageString) {
                    messageJSON = JSON.parse(messageString);
                }
                node.log('Processed input message:' + inputName);

                // Amqpの場合、Mqttで設定される$.cdidと$.cmidに相当するpropertyが存在しないためここで設定する。
                // 本来は不要だが、号口フローで$.cdidと$.cmidが存在する前提でフローが組まれておりエラーの原因となる。
                // そのエラー回避のための対応。
                if (TransportProtocol === "Amqp") {
                    // var propMessage = 'Add property : ';

                    // push $.cdid
                    var cdid = {
                        key: "$.cdid",
                        value: msg.transportObj.message_annotations["iothub-connection-device-id"]
                    };
                    setSystemProperties(cdid, msg.properties);
                    // propMessage += '\n   ' + JSON.stringify(cdid);

                    // push $.cmid
                    var cmid = {
                        key: "$.cmid",
                        value: msg.transportObj.message_annotations["iothub-connection-module-id"]
                    };
                    // propMessage += '\n   ' + JSON.stringify(cmid);
                    setSystemProperties(cmid, msg.properties);

                    // node.debug(propMessage);
                }

                var logMessage = 'Received Message from Azure IoT Edge: ' + inputName + '\n   Payload: ' + messageString + '\n   Properties: ' + JSON.stringify(msg.properties);
                node.trace(logMessage);

                // send to node output
                message = {
                    payload: messageJSON,
                    topic: "input",
                    input: inputName,
                    properties: msg.properties
                };
                node.send(message);
                setStatus(node, statusEnum.connected);
            }
        } catch (err) {
            node.error(err, message);
            setStatus(node, statusEnum.error);
        }
    }

    var setStatus = function (node, status) {
        node.status({ fill: status.color, shape: "dot", text: status.text });
    }

    var sendMessageToEdgeHub = function (client, node, message, output) {
        try {
            // 不要メタ情報
            const deleteMetaKey = ["$.cdid", "$.cmid"];

            var payloadSize = 0;
            var propertySize = 0;

            // Send the message to IoT Edge
            if (!output) {
                output = "output";
            }

            var messageJSON = "";
            if (message.payload) {
                if (typeof (message.payload) != "string") {
                    messageJSON = JSON.stringify(message.payload);
                } else {
                    messageJSON = message.payload;
                }
                payloadSize = Buffer.byteLength(messageJSON);
            }

            var logMessage = 'Sending Message to Azure IoT Edge: ' + output + '\n   Payload: ' + messageJSON;
            var msg = new Message(messageJSON);

            if (message.properties) {
                var propertyList = []
                if (message.properties.propertyList) {
                    // 削除対象以外を追加
                    message.properties.propertyList.forEach(property => {
                        if (property === null) {
                            throw new Error("Property has any non-object data.");
                        }
                        else if (typeof property !== "object") {
                            throw new Error("Property has any non-object data.");
                        }
                        else if (!('key' in property)) {
                            throw new Error("Property has any object that does not have 'key' item.");
                        }
                        else if (!('value' in property)) {
                            throw new Error("Property has any object that does not have 'value' item.");
                        }
                        else if (!deleteMetaKey.includes(property.key)) {
                            propertyList.push(property);
                        }
                    })
                }
                message.properties.propertyList = propertyList;

                message.properties.propertyList.forEach(property => {
                    if (property === null) {
                        throw new Error("Property has any non-object data.");
                    }
                    else if (typeof property !== "object") {
                        throw new Error("Property has any non-object data.");
                    }
                    else if (!('key' in property)) {
                        throw new Error("Property has any object that does not have 'key' item.");
                    }
                    else if (!('value' in property)) {
                        throw new Error("Property has any object that does not have 'value' item.");
                    }
                    else {
                        propertySize += Buffer.byteLength(property.key);
                        propertySize += Buffer.byteLength(JSON.stringify(property.value));
                    }
                });

                logMessage += '\n   Properties: ' + JSON.stringify(message.properties);

                // 出力メッセージのpropertyListにセット
                msg.properties.propertyList = message.properties.propertyList;
            }
            node.trace(logMessage);

            // メッセージに使用される総容量をチェック, 超過はエラー
            var totalSize = payloadSize + propertySize;
            if (client.maxSize < totalSize) {
                throw new Error("Message size is " + totalSize + " bytes which is greater than the max size " + client.maxSize + " bytes allowed.");
            }

            // Assuming only json payload
            msg.contentType = "application/json";
            msg.contentEncoding = "utf-8";

            client.sendOutputEvent(output, msg, function (err, res) {
                if (err) {
                    node.error('Error while trying to send message:' + err.toString());
                    setStatus(node, statusEnum.error);
                } else {
                    node.log('Message sent.');
                    setStatus(node, statusEnum.connected);
                }
            });
        } catch (err) {
            node.error(err, message);
            setStatus(node, statusEnum.error);
        }
    }

    // Registration of the client into Node-RED
    RED.nodes.registerType("edgeclient", IoTEdgeClient, {
        defaults: {
            module: { value: "" }
        }
    });

    // Registration of the node into Node-RED
    RED.nodes.registerType("moduletwin", ModuleTwin, {
        defaults: {
            name: { value: "Module Twin" }
        }
    });

    // Registration of the node into Node-RED
    RED.nodes.registerType("moduleinput", ModuleInput, {
        defaults: {
            input: { value: "input1" }
        }
    });

    // Registration of the node into Node-RED
    RED.nodes.registerType("moduleoutput", ModuleOutput, {
        defaults: {
            output: { value: "output1" }
        }
    });

    // Registration of the node into Node-RED
    RED.nodes.registerType("modulemethod", ModuleMethod, {
        defaults: {
            method: { value: "method1" },
            response: { value: "{}" }
        }
    });

}
