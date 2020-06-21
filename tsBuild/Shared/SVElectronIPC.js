"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const SVRP = require("./SVRP.js");
var g_logAll = true;
if (g_logAll)
    console.log("SVElectronIPC logging all calls");
let sendFunc = null;
let setReceiveFunc = null;
try {
    //in the browser, this will attach to the IPC methods
    //established in preload.js
    sendFunc = window.IPC.send;
    setReceiveFunc = window.IPC.receive;
    if (!sendFunc)
        console.log("SVElectronIPC in browser - sendFunc not found!");
    if (!setReceiveFunc)
        console.log("SVElectronIPC in browser - setReceiveFunc not found!");
}
catch (err) {
    //outside the browser, window. will throw an error
    //so we attach to the node modules like this
    const main = require("../Main/Main");
    const electron = require("electron");
    sendFunc = (arg) => {
        if (main.g_mainWindow)
            main.g_mainWindow.webContents.send("IPC", arg);
        else
            console.log("sendFunc - g_mainWindow not found!");
    };
    setReceiveFunc = (func) => {
        electron.ipcMain.on("IPC", (event, arg) => func(arg));
    };
}
//used for Call() below, and subsequent response handling
class PromiseFunctions {
    constructor(resolve, reject) {
        this.resolve = resolve;
        this.reject = reject;
        this.finished = false;
    }
    Finished() {
        return this.finished;
    }
    Resolve(json) {
        if (this.finished === true) {
            console.log("PromiseFunctions.Resolve - already finished, can't resolve");
            console.trace();
            return;
        }
        this.resolve(json);
        this.finished = true;
    }
    Reject(json) {
        if (this.finished === true) {
            console.log("PromiseFunctions.Reject - already finished, can't reject");
            console.trace();
            return;
        }
        this.reject(json);
        this.finished = true;
    }
}
class _SVElectronIPC {
    constructor() {
        this.callHandlers = new Map();
        this.responseHandlers = new Map();
        this.sequence = 0;
        //calls coming into the process come in here
        setReceiveFunc(async (json) => {
            if (json.method !== undefined) {
                //its a call, handle it
                let resp = await this.HandleIncomingCall(json);
                //send a response back only if a sequence was defined on the call
                if (json.sequence !== undefined) {
                    if (g_logAll)
                        console.log('IncomingCallResponse: ' + JSON.stringify(resp));
                    //fill in the correct sequence if they forgot to
                    if (resp.sequence === undefined)
                        resp.sequence = json.sequence;
                    sendFunc(resp);
                }
            }
            else if (json.success !== undefined) {
                //its a response, handle it
                this.HandleIncomingResponse(json);
            }
        });
    }
    //setup a function to handle a particular incoming json call
    SetHandler(c, func) {
        //have to temporarily instantiate a call to get its method
        //little inefficient but better to do this way for type safety
        var temp = new c();
        this.callHandlers.set(temp.method, func);
    }
    async HandleIncomingCall(json) {
        if (g_logAll)
            console.log('IncomingCall: ' + JSON.stringify(json));
        var handler = this.callHandlers.get(json.method);
        if (!handler) {
            console.log("HandleIncomingCall - no handler for method: " + json.method);
            return { success: false, error: SVRP.Error.InvalidMethod, sequence: json.sequence };
        }
        try {
            return handler(json);
        }
        catch (err) {
            console.log("HandleIncomingCall - exception in handler");
            console.error(err);
            return { success: false, error: SVRP.Error.Unknown, sequence: json.sequence };
        }
    }
    async HandleIncomingResponse(json) {
        if (g_logAll)
            console.log('IncomingResponse: ' + JSON.stringify(json));
        var handler = this.responseHandlers.get(json.sequence);
        if (!handler) {
            console.log("HandleIncomingResponse - no handler for sequence: " + json.sequence + " - data discarded: " + JSON.stringify(json));
            return;
        }
        if (handler.Finished() !== true) {
            handler.Resolve(json);
        }
        else {
            console.log("HandleIncomingResponse - handler was already finished, data discarded: " + JSON.stringify(json));
        }
        this.responseHandlers.delete(json.sequence);
    }
    CallNoResponse(c) {
        //main difference is that a sequence is not added to the call json,
        //so the other side will know not to send back a response
        //we will also not create a response handler in anticipation of it..
        if (g_logAll)
            console.log('CallNoResponse: ' + JSON.stringify(c));
        //store these promise functions in our map so that this Call can be resolved later
        //when a matching sequence comes back from the other side
        sendFunc(c);
    }
    Call(c) {
        return new Promise((resolve, reject) => {
            c.sequence = this.sequence;
            if (g_logAll)
                console.log('Call: ' + JSON.stringify(c));
            //store these promise functions in our map so that this Call can be resolved later
            //when a matching sequence comes back from the other side
            this.responseHandlers.set(this.sequence, new PromiseFunctions(resolve, reject));
            sendFunc(c);
            this.sequence++;
        });
    }
}
exports.SVElectronIPC = new _SVElectronIPC();
//# sourceMappingURL=SVElectronIPC.js.map