import * as SVRP from './SVRP';
import * as TwitterAuth from './TwitterAuth';

//returns whatever Twitter app API keys have been successfully used and saved previously (if any)
export class GetAppAuth implements SVRP.Call
{
    method = "GetAppAuth"
}

export class GetAppAuthResponse extends SVRP.Response
{
    appAuth:TwitterAuth.AppAuth;
}

//the login from the electron app includes the Twitter app API keys.
//they are either typed in by the user, or (if they were typed and saved previously)
//loaded from disk when the app starts
export class GetUserLogin implements SVRP.Call
{
    method = "GetUserLogin"
}

export class GetUserLoginResponse extends SVRP.Response
{
    userLogin:TwitterAuth.UserLogin;
}

//the login from the electron app includes the Twitter app API keys.
//they are either typed in by the user, or (if they were typed and saved previously)
//loaded from disk when the app starts
export class Login implements SVRP.Call
{
    method = "Login"
    appAuth:TwitterAuth.AppAuth
}

export class LoginResponse extends SVRP.Response
{
    userLogin:TwitterAuth.UserLogin;
}