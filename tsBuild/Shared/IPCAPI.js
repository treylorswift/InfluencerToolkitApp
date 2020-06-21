"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const SVRP = require("./SVRP");
//returns whatever Twitter app API keys have been successfully used and saved previously (if any)
class GetAppAuth {
    constructor() {
        this.method = "GetAppAuth";
    }
}
exports.GetAppAuth = GetAppAuth;
class GetAppAuthResponse extends SVRP.Response {
}
exports.GetAppAuthResponse = GetAppAuthResponse;
//the login from the electron app includes the Twitter app API keys.
//they are either typed in by the user, or (if they were typed and saved previously)
//loaded from disk when the app starts
class GetUserLogin {
    constructor() {
        this.method = "GetUserLogin";
    }
}
exports.GetUserLogin = GetUserLogin;
class GetUserLoginResponse extends SVRP.Response {
}
exports.GetUserLoginResponse = GetUserLoginResponse;
//the login from the electron app includes the Twitter app API keys.
//they are either typed in by the user, or (if they were typed and saved previously)
//loaded from disk when the app starts
class Login {
    constructor() {
        this.method = "Login";
    }
}
exports.Login = Login;
class LoginResponse extends SVRP.Response {
}
exports.LoginResponse = LoginResponse;
//# sourceMappingURL=IPCAPI.js.map