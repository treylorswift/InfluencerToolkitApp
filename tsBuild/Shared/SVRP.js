"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var Error;
(function (Error) {
    Error["NotLoggedIn"] = "NotLoggedIn";
    Error["Unauthorized"] = "Unauthorized";
    Error["InvalidMethod"] = "InvalidMethod";
    Error["InvalidParams"] = "InvalidParams";
    Error["InvalidInternalResponse"] = "InvalidInternalResponse";
    Error["Internal"] = "Internal";
    Error["Timeout"] = "Timeout";
    Error["Unknown"] = "Unknown";
})(Error = exports.Error || (exports.Error = {}));
function ErrorFromString(s) {
    //if there is no error object, we shouldn't create one.. leave it undefined
    if (s === undefined || s === null)
        return undefined;
    if (typeof (s) !== "string") {
        console.log("ErrorFromString - input was not a string type: " + typeof (s) + " - " + JSON.stringify(s));
        return Error.Unknown;
    }
    var err = Error[s];
    if (err === undefined) {
        console.log("ErrorFromString - unrecognized string code: " + s);
        err = Error.Unknown;
    }
    return err;
}
exports.ErrorFromString = ErrorFromString;
class Response {
    //the idea here is that the constructor takes a raw json
    //fresh off a websocket or http response, and make sure the contents
    //map into the Response object as defined by typescript
    constructor(json) {
        this.success = json.success === true;
        if (this.success === false)
            this.error = ErrorFromString(json.error);
        else
            this.error = undefined;
        //all other property names are to be decoded/validated by subclasses of Response
    }
}
exports.Response = Response;
//# sourceMappingURL=SVRP.js.map