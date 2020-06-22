import * as SVRP from './SVRP.js';

var g_logAll = true;

if (g_logAll)
    console.log("SVElectronIPC logging all calls");

//the SVElectronIPC is used to make calls, and receive responses,
//both from the renderer process to the main process, and the main process to the renderer process
//
//they both use this same .ts file.
//
//the logic here at the top establishes sendFunc and setReceiveFunc
//sendFunc - what the rest of the code below uses to send calls to the other side
//setReceiveFunc - the code below says "hey, incoming calls come here..." by providing a function argument to setReceiveFunc
//
//
let sendFunc:(arg:any)=>void = null;
let setReceiveFunc:(func:(arg:any)=>void)=>void =  null;

//wire into window.IPC (if the renderer process)
//if that fails, wire ino
try
{
    //in the browser, this will attach to the IPC methods
    //established in preload.js
    sendFunc = (window as any).IPC.send;
    setReceiveFunc = (window as any).IPC.receive;
    if (!sendFunc)
        console.log("SVElectronIPC in browser - sendFunc not found!");
    if (!setReceiveFunc)
        console.log("SVElectronIPC in browser - setReceiveFunc not found!");
}
catch (err)
{
    //outside the browser, assume this is the main process
    //the below 'require' statements will actually work in the main process
    //
    //note that the main process only sends messages to the main browser window,
    //which must be exported from Main.ts and established by the time the below
    //code runs
    const main = require("../Main/Main");
    const electron = require("electron");

    sendFunc = (arg:any):void =>
    {
        if (main.g_mainWindow)
            main.g_mainWindow.webContents.send("IPC", arg);
        else
            console.log("sendFunc - g_mainWindow not found!");
    };

    setReceiveFunc = (func:(arg)=>void):void =>
    {
        electron.ipcMain.on("IPC", (event, arg) => func(arg));
    }
}

//used for Call() below, and subsequent response handling
class PromiseFunctions
{
    private resolve:Function
    private reject:Function
    protected finished:boolean;

    constructor(resolve:Function,reject:Function)
    {
        this.resolve = resolve;
        this.reject = reject;
        this.finished = false;
    }

    Finished():boolean
    {
        return this.finished;
    }

    Resolve(json:any)
    {
        if (this.finished===true)
        {
            console.log("PromiseFunctions.Resolve - already finished, can't resolve");
            console.trace();
            return;
        }

        this.resolve(json);
        this.finished = true;
    }

    Reject(json:any)
    {
        if (this.finished===true)
        {
            console.log("PromiseFunctions.Reject - already finished, can't reject");
            console.trace();
            return;
        }

        this.reject(json);
        this.finished = true;
    }
}

export class SVElectronIPC extends SVRP.Transport
{
    //calls are matched by their method name, a string
    callHandlers:Map<string,SVRP.CallHandler>;

    //responses are matched by the sequence identiier, a number
    responseHandlers:Map<number,PromiseFunctions>;
    sequence:number;

    constructor()
    {
        super();
        this.callHandlers = new Map<string,SVRP.CallHandler>();
        this.responseHandlers = new Map<number,PromiseFunctions>();
        this.sequence = 0;

        //calls coming into the process come in here
        setReceiveFunc(async (json) =>
        {
            if (json.method!==undefined)
            {
                //its a call, handle it
                let resp = await this.HandleIncomingCall(json as SVRP.Call);
                        
                //send a response back only if a sequence was defined on the call
                if (json.sequence!==undefined)
                {
                    if (g_logAll)
                        console.log('IncomingCallResponse: ' + JSON.stringify(resp));

                    //fill in the correct sequence if they forgot to
                    if (resp.sequence===undefined)
                        resp.sequence = json.sequence;

                    sendFunc(resp);
                }
            }
            else
            if (json.success!==undefined)
            {
                //its a response, handle it
                this.HandleIncomingResponse(json as SVRP.Response);
            }
        });
    }

    //setup a function to handle a particular incoming json call
    SetHandler<T extends {new (...args: any):SVRP.Call}>(className: T, func:SVRP.CallHandler)
    {
        //have to temporarily instantiate a call to get its method
        //little inefficient but better to do this way for type safety
        let tempInstance = new className();
        this.callHandlers.set(tempInstance.method,func);
    }

    private async HandleIncomingCall(json:SVRP.Call):Promise<SVRP.Response>
    {
        if (g_logAll)
           console.log('IncomingCall: ' + JSON.stringify(json));

        var handler = this.callHandlers.get(json.method);
        if (!handler)
        {
            console.log("HandleIncomingCall - no handler for method: " + json.method);
            return {success:false, error:SVRP.Error.InvalidMethod, sequence:json.sequence};
        }

        try
        {
            return handler(json);
        }
        catch (err)
        {
            console.log("HandleIncomingCall - exception in handler");
            console.error(err);
            return {success:false, error:SVRP.Error.Unknown, sequence:json.sequence};
        }
    }

    private async HandleIncomingResponse(json:SVRP.Response)
    {
        if (g_logAll)
           console.log('IncomingResponse: ' + JSON.stringify(json));

        var handler = this.responseHandlers.get(json.sequence);
        if (!handler)
        {
            console.log("HandleIncomingResponse - no handler for sequence: " + json.sequence + " - data discarded: " + JSON.stringify(json));
            return;
        }
        
        if (handler.Finished()!==true)
        {
            handler.Resolve(json);
        }
        else
        {
            console.log("HandleIncomingResponse - handler was already finished, data discarded: " + JSON.stringify(json));
        }

        this.responseHandlers.delete(json.sequence);
    }

    CallNoResponse(c:SVRP.Call)
    {
        //we determine the contents of the 'sequence'
        //main difference is that a sequence is not added to the call json,
        //so the other side will know not to send back a response
        //we will also not create a response handler in anticipation of it..
        delete c.sequence;

        if (g_logAll)
            console.log('CallNoResponse: ' + JSON.stringify(c));

        //store these promise functions in our map so that this Call can be resolved later
        //when a matching sequence comes back from the other side
        sendFunc(c);
    }


    Call<T extends SVRP.Call>(c:T):Promise<SVRP.Response>
    {
        return new Promise((resolve,reject)=>
        {
            //we determine the contents of the 'sequence'
            c.sequence = this.sequence;

            if (g_logAll)
                console.log('Call: ' + JSON.stringify(c));

            //store these promise functions in our map so that this Call can be resolved later
            //when a matching sequence comes back from the other side
            this.responseHandlers.set(this.sequence, new PromiseFunctions(resolve,reject));
            sendFunc(c);

            this.sequence++;
        });
    }
}
