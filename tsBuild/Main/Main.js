"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const TwitterAuth = require("../Shared/TwitterAuth");
const TwitterUser_1 = require("./TwitterUser");
const Twitter = require("twitter-lite");
//once we obtain app auth and user auth keys, we won't require login
let g_appAuth = null;
let g_userLogin = null;
let g_twitterUser = null;
let g_appAuthFileName = './app_auth.json';
let g_userLoginFileName = './user_auth.json';
async function ValidateAppAndUserAuth() {
    let app_auth = TwitterAuth.TryLoadAppAuth(g_appAuthFileName);
    if (!app_auth)
        return false;
    try {
        //@ts-ignore
        let testClient = new Twitter({
            consumer_key: app_auth.consumer_key,
            consumer_secret: app_auth.consumer_secret,
        });
        const bearerOK = await testClient.getBearerToken();
        //no error means the keys were valid, store them to the global
        //and proceed to check user auth keys
        g_appAuth = app_auth;
    }
    catch (err) {
        console.log("Error validating stored app auth keys:");
        console.error(err);
        return false;
    }
    let user_login = TwitterAuth.TryLoadUserLogin(g_userLoginFileName);
    if (!user_login)
        return false;
    //ok see if we can create a TwitterUser using the app and user keys
    let user = new TwitterUser_1.TwitterUser();
    let initOK = await user.Init(app_auth, user_login);
    if (initOK) {
        g_userLogin = user_login;
        g_twitterUser = user;
        return true;
    }
    return false;
}
//////////////////
//Electron stuff
/////////////
// Modules to control application life and create native browser window
const electron_1 = require("electron");
const electron_2 = require("electron");
const path = require('path');
electron_1.app.commandLine.appendSwitch('auto-detect', 'false');
electron_1.app.commandLine.appendSwitch('no-proxy-server');
exports.g_mainWindow = null;
const SVElectronIPC_1 = require("../Shared/SVElectronIPC");
const IPCAPI = require("../Shared/IPCAPI");
const SVRP = require("../Shared/SVRP");
//route all SVRP.Call/SetHandlers through SVElectronIPC
SVRP.SetTransport(new SVElectronIPC_1.SVElectronIPC());
/////////////////
//GetAppAuth - returns Twitter App API keys
////////////////
SVRP.SetHandler(IPCAPI.GetAppAuth, async (json) => {
    return { success: true, appAuth: g_appAuth };
});
////////////////
//GetUserLogin - returns Twitter user API keys, twitter id_str and screen_name (obtained via oauth and verify_credentials api call)
//////////////
SVRP.SetHandler(IPCAPI.GetUserLoginCall, async (json) => {
    return { success: true, userLogin: g_userLogin };
});
/////////////////////////
//GetFollowerCacheStatus
////////////////
SVRP.SetHandler(IPCAPI.GetFollowerCacheStatusCall, async (json) => {
    if (!g_twitterUser) {
        console.log("Cant call GetFollowerCacheStatus when g_twitterUser is invalid");
        return { success: false, status: IPCAPI.FollowerCacheStatusEnum.None, completionPercent: 0, error: SVRP.Error.Internal };
    }
    let status = g_twitterUser.GetFollowerCache().GetStatus();
    return { success: true, status: status.status, completionPercent: status.completionPercent };
});
/////////////
//BuildCache
///////////////
SVRP.SetHandler(IPCAPI.BuildCacheCall, async (c) => {
    if (!g_twitterUser) {
        console.log("Cant call BuildCacheCall when g_twitterUser is invalid");
        return { success: false, error: SVRP.Error.Internal };
    }
    g_twitterUser.GetFollowerCache().BuildFollowerCache().then((value) => {
        console.log("build cache complete");
    });
    return { success: true };
});
//when the renderer attempts a login, it includes the Twitter app api keys
SVRP.SetHandler(IPCAPI.LoginCall, async (c) => {
    //verify that the app keys are valid before attempting to log the user in via oauth
    try {
        //@ts-ignore
        let testClient = new Twitter({
            consumer_key: c.args.appAuth.consumer_key,
            consumer_secret: c.args.appAuth.consumer_secret
        });
        const response = await testClient.getBearerToken();
        //if there's no error by now, the keys were good.. continue below..
    }
    catch (err) {
        let msg = "Unable to authenticate Twitter app API keys";
        console.log(msg);
        console.error(err);
        return { success: false, userLogin: null, error: SVRP.Error.InvalidParams, errorMessage: msg };
    }
    //no error means the keys were valid
    //store them on disk for later use
    try {
        fs.writeFileSync(g_appAuthFileName, JSON.stringify(c.args.appAuth, null, 2));
        g_appAuth = c.args.appAuth;
    }
    catch (err) {
        let msg = "Error saving Twitter api API keys to disk";
        console.log(msg);
        console.error(err);
        return { success: false, userLogin: null, error: SVRP.Error.Internal, errorMessage: msg };
    }
    //now attempt oauth login in separate window
    let oauthWindow = null;
    let oauthResult = null;
    try {
        let info = {
            key: c.args.appAuth.consumer_key,
            secret: c.args.appAuth.consumer_secret
        };
        const oauth = require(`oauth-electron-twitter`);
        oauthWindow = new electron_2.BrowserWindow({ webPreferences: { nodeIntegration: false } });
        oauthResult = await oauth.login(info, oauthWindow);
    }
    catch (err) {
        console.log("Error running oauth-electron-twitter");
        console.log(err);
    }
    if (oauthWindow)
        oauthWindow.close();
    if (!oauthResult) {
        return { success: false, userLogin: null, error: SVRP.Error.Internal, errorMessage: "Twitter Login Failed" };
    }
    //now verify we can use these keys
    let user = new TwitterUser_1.TwitterUser();
    let initOK = await user.Init(g_appAuth, g_userLogin);
    if (!initOK) {
        return { success: false, userLogin: null, error: SVRP.Error.Internal, errorMessage: "Unable to verify Twitter user credentials" };
    }
    try {
        let userLogin = {
            access_token_key: oauthResult.token,
            access_token_secret: oauthResult.tokenSecret,
            id_str: user.GetIdStr(),
            screen_name: user.GetScreenName()
        };
        //if they requested to store the keys, store them
        if (c.args.saveUserAuth)
            fs.writeFileSync(g_userLoginFileName, JSON.stringify(userLogin, null, 2));
        g_userLogin = userLogin;
        g_twitterUser = user;
        return { success: true, userLogin: userLogin };
    }
    catch (err) {
        let msg = "Error saving Twitter user login to disk";
        console.log(msg);
        console.error(err);
        return { success: false, userLogin: null, error: SVRP.Error.Internal, errorMessage: msg };
    }
});
function createWindow() {
    // Create the browser window.
    let mainWindow = new electron_2.BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    exports.g_mainWindow = mainWindow;
    //  Menu.setApplicationMenu(null);
    //why was this in index.html originally?
    //    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'">
    //    <meta http-equiv="X-Content-Security-Policy" content="default-src 'self'; script-src 'self'">
    // and load the index.html of the app.
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
    //mainWindow.loadURL('http://localhost:3000');
    //navigating seems to alter the window title.. can we please just keep it the way it should be? kthx
    mainWindow.webContents.on('page-title-updated', () => {
        mainWindow.setTitle(electron_1.app.getName());
    });
    mainWindow.webContents.on('new-window', function (e, url) {
        e.preventDefault();
        require('electron').shell.openExternal(url);
    });
    // Open the DevTools.
    // mainWindow.webContents.openDevTools()
}
// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
electron_1.app.on('window-all-closed', function () {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
async function main() {
    //before we start, check to see if we have valid app auth and user auth keys already.
    //if so, we won't need to ask the user for them
    await ValidateAppAndUserAuth();
    electron_1.app.whenReady().then(() => {
        createWindow();
        electron_1.app.on('activate', function () {
            // On macOS it's common to re-create a window in the app when the
            // dock icon is clicked and there are no other windows open.
            if (electron_2.BrowserWindow.getAllWindows().length === 0)
                createWindow();
        });
    });
}
main();
//# sourceMappingURL=Main.js.map