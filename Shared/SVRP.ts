export interface Call
{
    method:string
    sequence?:number
}

export enum Error
{
    NotLoggedIn="NotLoggedIn",
    Unauthorized="Unauthorized",
    InvalidMethod="InvalidMethod",
    InvalidParams="InvalidParams",
    InvalidInternalResponse="InvalidInternalResponse", //some service we called upon to complete the call returned an invalid response
    Internal="Internal",//some internal logic failed
    Timeout="Timeout",
    Unknown="Unknown"
}

export function ErrorFromString(s:string)
{
    //if there is no error object, we shouldn't create one.. leave it undefined
    if (s===undefined || s===null)
        return undefined;
    
    if (typeof(s)!=="string")
    {
        console.log("ErrorFromString - input was not a string type: " + typeof(s) + " - " + JSON.stringify(s));
        return Error.Unknown;
    }

    var err:Error = Error[s];
    if (err===undefined)
    {
        console.log("ErrorFromString - unrecognized string code: " + s);
        err = Error.Unknown;
    }
    return err;
}

export class Response
{
    success:boolean
    error?:Error
    errorMessage?:any
    sequence?:number

    //the idea here is that the constructor takes a raw json
    //fresh off a websocket or http response, and make sure the contents
    //map into the Response object as defined by typescript
    constructor(json:any)
    {
        this.success = json.success===true;
        if (this.success===false)
            this.error = ErrorFromString(json.error);
        else
            this.error = undefined;

        //all other property names are to be decoded/validated by subclasses of Response
    }
}

//a function that handles an incoming call and returns a response (to send back to the caller)
export type CallHandler = (json:Call)=>Promise<Response>
export type TCallHandler<inT,outT> = (json:inT)=>Promise<outT>

//a function that takes receipt of a response once a call is made and the results are returned
export type ResponseHandler = (json:Response)=>void
