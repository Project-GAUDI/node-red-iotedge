
'use strict';

class myErrorFilter {
    constructor() {
        this.Error = true;
        this.ArgumentError = true;
        this.ArgumentOutOfRangeError = true;
        this.DeviceMaximumQueueDepthExceededError = true;
        this.DeviceNotFoundError = true;
        this.FormatError = true;
        this.UnauthorizedError = true;
        this.NotImplementedError = true;
        this.NotConnectedError = true;
        this.IotHubQuotaExceededError = true;
        this.MessageTooLargeError = false;
        this.InternalServerError = true;
        this.ServiceUnavailableError = true;
        this.IotHubNotFoundError = true;
        this.IoTHubSuspendedError = true;
        this.JobNotFoundError = true;
        this.TooManyDevicesError = true;
        this.ThrottlingError = true;
        this.DeviceAlreadyExistsError = true;
        this.DeviceMessageLockLostError = false;
        this.InvalidEtagError = true;
        this.InvalidOperationError = true;
        this.PreconditionFailedError = true;
        this.TimeoutError = true;
        this.BadDeviceResponseError = true;
        this.GatewayTimeoutError = true;
        this.DeviceTimeoutError = true;
        this.TwinRequestError = true;
    }
}
exports.myErrorFilter = myErrorFilter;
