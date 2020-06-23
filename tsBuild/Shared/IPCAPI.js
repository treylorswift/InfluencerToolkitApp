"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const SVRP = require("./SVRP");
///////////////
//Server Api
//(calls the client can make to the server)
//////////////
//////////////////////
//Get App Auth keys
/////////////////////
//returns whatever Twitter app API keys were last used to log a user in.
//they are saved to disk after the first successful login and persist across app launches
async function GetAppAuth() {
    return new GetAppAuthCall().Call();
}
exports.GetAppAuth = GetAppAuth;
class GetAppAuthCall extends SVRP.Call {
    constructor() {
        super(...arguments);
        this.method = "GetAppAuth";
    }
}
exports.GetAppAuthCall = GetAppAuthCall;
class GetAppAuthResponse extends SVRP.Response {
}
exports.GetAppAuthResponse = GetAppAuthResponse;
//////////////////////
//Get User login
/////////////////////
//returns info for the currently logged in user
async function GetUserLogin() {
    return new GetUserLoginCall().Call();
}
exports.GetUserLogin = GetUserLogin;
class GetUserLoginCall extends SVRP.Call {
    constructor() {
        super(...arguments);
        this.method = "GetUserLogin";
    }
}
exports.GetUserLoginCall = GetUserLoginCall;
class GetUserLoginResponse extends SVRP.Response {
}
exports.GetUserLoginResponse = GetUserLoginResponse;
//to initiate login from the user-facing UI, that request must include the Twitter app API keys.
//they are either typed in by the user, or (if they were typed and saved previously)
//loaded from disk when the app starts. presumably the UI has called GetAppAuth to obtain those
//stored api keys prior to calling this. Or, the user has typed them in manually
async function Login(args) {
    return new LoginCall(args).Call();
}
exports.Login = Login;
class LoginCall extends SVRP.Call {
    constructor(args) {
        super();
        this.method = "Login";
        this.args = args;
    }
}
exports.LoginCall = LoginCall;
class LoginResponse extends SVRP.Response {
}
exports.LoginResponse = LoginResponse;
/////////////////////////
///Follower Cache Status
/////////////////////////
async function GetFollowerCacheStatus() {
    return new GetFollowerCacheStatusCall().Call();
}
exports.GetFollowerCacheStatus = GetFollowerCacheStatus;
class GetFollowerCacheStatusCall extends SVRP.Call {
    constructor() {
        super(...arguments);
        this.method = "GetFollowerCacheStatus";
    }
}
exports.GetFollowerCacheStatusCall = GetFollowerCacheStatusCall;
var FollowerCacheStatusEnum;
(function (FollowerCacheStatusEnum) {
    FollowerCacheStatusEnum["None"] = "None";
    FollowerCacheStatusEnum["Incomplete"] = "Incomplete";
    FollowerCacheStatusEnum["InProgress"] = "InProgress";
    FollowerCacheStatusEnum["Complete"] = "Complete"; //a cache exists and no operation is being performed right now
})(FollowerCacheStatusEnum = exports.FollowerCacheStatusEnum || (exports.FollowerCacheStatusEnum = {}));
class GetFollowerCacheStatusResponse extends SVRP.Response {
}
exports.GetFollowerCacheStatusResponse = GetFollowerCacheStatusResponse;
/////////////////////////////////////////
//BuildCache
//////////////////////////
async function BuildFollowerCache(command) {
    return new BuildFollowerCacheCall({ command: command }).Call();
}
exports.BuildFollowerCache = BuildFollowerCache;
class BuildFollowerCacheCall extends SVRP.Call {
    constructor(args) {
        super();
        this.method = "BuildFollowerCache";
        this.args = args;
    }
}
exports.BuildFollowerCacheCall = BuildFollowerCacheCall;
var BuildFollowerCacheCommands;
(function (BuildFollowerCacheCommands) {
    BuildFollowerCacheCommands[BuildFollowerCacheCommands["Rebuild"] = 0] = "Rebuild";
    BuildFollowerCacheCommands[BuildFollowerCacheCommands["Resume"] = 1] = "Resume";
})(BuildFollowerCacheCommands = exports.BuildFollowerCacheCommands || (exports.BuildFollowerCacheCommands = {}));
async function QueryFollowerCache(q) {
    return new QueryFollowerCacheCall({ query: q }).Call();
}
exports.QueryFollowerCache = QueryFollowerCache;
class QueryFollowerCacheCall extends SVRP.Call {
    constructor(args) {
        super();
        this.method = "QueryFollowerCache";
        this.args = args;
    }
}
exports.QueryFollowerCacheCall = QueryFollowerCacheCall;
class QueryFollowerCacheResponse extends SVRP.Response {
}
exports.QueryFollowerCacheResponse = QueryFollowerCacheResponse;
async function RunMessagingCampaign(c) {
    return new RunMessagingCampaignCall({ campaign: c }).Call();
}
exports.RunMessagingCampaign = RunMessagingCampaign;
class RunMessagingCampaignCall extends SVRP.Call {
    constructor(args) {
        super();
        this.method = "RunMessagingCampaign";
        this.args = args;
    }
}
exports.RunMessagingCampaignCall = RunMessagingCampaignCall;
//# sourceMappingURL=IPCAPI.js.map