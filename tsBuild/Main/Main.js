"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const TwitterAuth = require("../Shared/TwitterAuth");
const Twitter = require("twitter-lite");
//once we obtain app auth and user auth keys, we won't require login
let g_appAuth = null;
let g_userLogin = null;
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
    try {
        //@ts-ignore
        let testClient = new Twitter({
            consumer_key: app_auth.consumer_key,
            consumer_secret: app_auth.consumer_secret,
            access_token_key: user_login.access_token_key,
            access_token_secret: user_login.access_token_secret // from your User (oauth_token_secret)
        });
        //verify that the app_auth and user_auth info is useable
        var verifyOK = await testClient.get("account/verify_credentials");
        //no error means the keys were valid
        g_userLogin = user_login;
        return true;
    }
    catch (err) {
        console.log("Error validating stored app auth keys:");
        console.error(err);
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
SVElectronIPC_1.SVElectronIPC.SetHandler(IPCAPI.GetAppAuth, async (json) => {
    return { success: true, appAuth: g_appAuth };
});
SVElectronIPC_1.SVElectronIPC.SetHandler(IPCAPI.GetUserLogin, async (json) => {
    return { success: true, userLogin: g_userLogin };
});
//when the renderer attempts a login, it includes the Twitter app api keys
SVElectronIPC_1.SVElectronIPC.SetHandler(IPCAPI.Login, async (c) => {
    //verify that the app keys are valid before attempting to log the user in via oauth
    try {
        //@ts-ignore
        let testClient = new Twitter({
            consumer_key: c.appAuth.consumer_key,
            consumer_secret: c.appAuth.consumer_secret
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
        fs.writeFileSync(g_appAuthFileName, JSON.stringify(c.appAuth, null, 2));
        g_appAuth = c.appAuth;
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
            key: c.appAuth.consumer_key,
            secret: c.appAuth.consumer_secret
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
    let verifyResult = null;
    try {
        //@ts-ignore
        let testClient = new Twitter({
            consumer_key: c.appAuth.consumer_key,
            consumer_secret: c.appAuth.consumer_secret,
            access_token_key: oauthResult.token,
            access_token_secret: oauthResult.tokenSecret
        });
        //verify that the app_auth and user_auth info is useable
        verifyResult = await testClient.get("account/verify_credentials");
    }
    catch (err) {
        console.log("verify_credentials failed");
        console.error(err);
        return { success: false, userLogin: null, error: SVRP.Error.Internal, errorMessage: "Unable to verify Twitter user credentials" };
    }
    try {
        let userLogin = {
            access_token_key: oauthResult.token,
            access_token_secret: oauthResult.tokenSecret,
            id_str: verifyResult.id_str,
            screen_name: verifyResult.screen_name
        };
        fs.writeFileSync(g_userLoginFileName, JSON.stringify(userLogin, null, 2));
        g_userLogin = userLogin;
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