import * as SVRP from './SVRP';
import * as TwitterAuth from './TwitterAuth';

//returns whatever Twitter app API keys were last used to log a user in.
//they are saved to disk after the first successful login and persist across app launches
export class GetAppAuth extends SVRP.Call
{
    method = "GetAppAuth"
}

export class GetAppAuthResponse extends SVRP.Response
{
    appAuth:TwitterAuth.AppAuth;
}

//returns info for the currently logged in user
export async function GetUserLogin():Promise<GetUserLoginResponse>
{
    return new GetUserLoginCall().Call() as Promise<GetUserLoginResponse>;
}

export class GetUserLoginCall extends SVRP.Call
{
    method = "GetUserLogin"
}

export class GetUserLoginResponse extends SVRP.Response
{
    userLogin:TwitterAuth.UserLogin;
}

//to initiate login from the user-facing UI, that request must include the Twitter app API keys.
//they are either typed in by the user, or (if they were typed and saved previously)
//loaded from disk when the app starts. presumably the UI has called GetAppAuth to obtain those
//stored api keys prior to calling this. Or, the user has typed them in manually
export async function Login(args:LoginCall["args"]):Promise<LoginResponse>
{
    return new LoginCall(args).Call() as Promise<LoginResponse>;
}

export class LoginCall extends SVRP.Call
{
    method = "Login"

    constructor(args:LoginCall["args"])
    {
        super();
        this.args = args;
    }

    args: {
        //the Twitter app api keys
        appAuth:TwitterAuth.AppAuth,

        //if true, successful user login will store user api keys on disk and reload them later
        //if false, user login will not persist and login will have to be done again next time
        //the application is started
        //should correspond to a "Remember Me" checkbox next to the login button
        saveUserAuth:boolean 
    }
}

export class LoginResponse extends SVRP.Response
{
    userLogin:TwitterAuth.UserLogin;
}

/////////////////////////
///Follower Cache Status
/////////////////////////
export async function GetFollowerCacheStatus():Promise<GetFollowerCacheStatusResponse>
{
    return new GetFollowerCacheStatusCall().Call() as Promise<GetFollowerCacheStatusResponse>;
}

export class GetFollowerCacheStatusCall extends SVRP.Call
{
    method = "GetFollowerCacheStatus"
}

export enum FollowerCacheStatusEnum
{
    None="None", //no cache exists, nothing is being processed right now
    Incomplete="Incomplete", //some cache exists but it was not completed, and is not processing right now
    InProgress="InProgress", //a caching operation is in progress now, but not yet completed
    Complete="Complete" //a cache exists and no operation is being performed right now
}

export class GetFollowerCacheStatusResponse extends SVRP.Response
{
    status:FollowerCacheStatusEnum

    //if status===None, will be 0
    //if status===Partial, will be somewhere between 0-99
    //if status==Complete, will be 100
    completionPercent:number
}

/////////////////////////////////////////
//BuildCache
//////////////////////////

export async function BuildCache(command:BuildCacheCommands):Promise<SVRP.Response>
{
    return new BuildCacheCall({command:command}).Call();
}

export class BuildCacheCall extends SVRP.Call
{
    method = "BuildCache"

    constructor(args:BuildCacheCall["args"])
    {
        super();
        this.args = args;
    }

    args: {
        command:BuildCacheCommands,
    }
}

export enum BuildCacheCommands
{
    Rebuild,
    Resume
}