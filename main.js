"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const TwitterAuth = require("./TwitterAuth");
const Twitter = require("twitter-lite");
const http = require('http');
const https = require('https');
const bodyParser = require('body-parser');
var CALLBACK_URL = 'http://localhost:3000/auth/twitter/callback';
// Define our dependencies
var express = require('express');
var session = require('express-session');
//var useragent       = require('express-useragent');
var passport = require('passport');
var TwitterStrategy = require('passport-twitter').Strategy;
//this is used to encrypt session cookies - in production, should be in an environment variable defined on the server
const SESSION_SECRET = 'vnyfw87ynfch3/AFV(FW(IFCN@A@O#J$F)FANJC@IEQEN';
// Initialize Express and middlewares
var sessionParser = session({ secret: SESSION_SECRET, resave: false, saveUninitialized: false });
var app = express();
app.use(sessionParser);
//app.use(useragent.express());
app.use(passport.initialize());
app.use(passport.session());
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }));
app.use(bodyParser.json({ limit: '5mb' }));
passport.serializeUser(function (user, cb) {
    cb(null, user);
});
passport.deserializeUser(function (obj, cb) {
    cb(null, obj);
});
app.get('/auth/twitter', async (req, res) => {
    //app auth keys are submitted as query parameters from the form on the login page
    let app_auth;
    try {
        app_auth =
            {
                consumer_key: req.query.consumer_key,
                consumer_secret: req.query.consumer_secret
            };
    }
    catch (err) {
        console.log("Error retreiving app api keys from query parameters:");
        console.error(err);
        res.send(`<html><head><body>Sorry, the API keys you provided were invalid. <a href="/">Try again.</a></body></head></html>`);
        return;
    }
    //verify that the app keys are valid before attempting to log the user in via oauth
    try {
        //@ts-ignore
        let testClient = new Twitter({
            consumer_key: req.query.consumer_key,
            consumer_secret: req.query.consumer_secret
        });
        const response = await testClient.getBearerToken();
        //no error means the keys were valid
        //store them for later use
        try {
            fs.writeFileSync(g_appAuthFileName, JSON.stringify(app_auth, null, 2));
            g_appAuth = app_auth;
        }
        catch (err) {
            console.error(err);
            res.send(`<html><head><body>Error saving your keys to disk, sorry. <a href="/">Try again.</a></body></head></html>`);
            return;
        }
    }
    catch (err) {
        console.error(err);
        res.send(`<html><head><body>Sorry, the API keys you provided were invalid. <a href="/">Try again.</a></body></head></html>`);
        return;
    }
    //use twitter oauth to obtain user access token and secret
    passport.use(new TwitterStrategy({
        consumerKey: app_auth.consumer_key,
        consumerSecret: app_auth.consumer_secret,
        callbackURL: CALLBACK_URL
    }, async function (token, tokenSecret, profile, cb) {
        //verify that these user auth keys are good
        try {
            let user_auth = {
                access_token_key: token,
                access_token_secret: tokenSecret
            };
            //no error means the keys were valid
            //store them for later use
            try {
                fs.writeFileSync(g_userAuthFileName, JSON.stringify(user_auth, null, 2));
                g_userAuth = user_auth;
            }
            catch (err) {
                console.error(err);
                res.send(`<html><head><body>Error saving your keys to disk, sorry. <a href="/">Try again.</a></body></head></html>`);
                cb(err, null);
                return;
            }
            cb(null, profile);
        }
        catch (err) {
            console.log("Error attempting to validate user auth keys:");
            console.error(err);
            cb(err, null);
        }
    }));
    let funcToCall = passport.authenticate('twitter');
    funcToCall(req, res);
});
// Set route for OAuth redirect
app.get('/auth/twitter/callback', passport.authenticate('twitter', { successRedirect: '/checkUserAuth', failureRedirect: '/checkUserAuth' }));
class User {
}
//after oauth login we do a final check here just so we can show them an error on this landing page if
//something went wrong
app.get('/checkUserAuth', (req, res) => {
    //we should have both app auth and user auth by now, if we dont, something went wrong
    if (!g_appAuth || !g_userAuth)
        res.send('<html><body><br/><br/>Error acquiring user auth keys, sorry. You might try directly obtaining them from https://apps.twitter.com, manually inserting them into user_auth.json, and restarting. Or, <a href="/">Try again.</a></body></html>');
    else
        res.redirect('/');
});
//once we obtain app auth and user auth keys, we won't require login
let g_appAuth = null;
let g_userAuth = null;
app.get('/', (req, res) => {
    if (g_appAuth && g_userAuth) {
        res.send('<html><body><br/><br/>You can run the command line now.</body></html>');
        return;
    }
    //prefill the app keys if the user has already entered valid ones in the past
    let consumer_key = '';
    let consumer_secret = '';
    if (g_appAuth) {
        consumer_key = g_appAuth.consumer_key;
        consumer_secret = g_appAuth.consumer_secret;
    }
    res.send(`
        <html>
        <head>
        <script>
        function login()
        {
            let key = document.getElementById('consumer_key').value;
            let secret = document.getElementById('consumer_secret').value;
            window.location = \`/auth/twitter?consumer_key=\${key}&consumer_secret=\${secret}\`
        }
        </script>
        </head>
        <body>
            <br/><br/>
            Enter your Twitter App API keys<br/><br/>
            You can obtain keys <a href="https://apps.twitter.com">here</a></br /><br/>
            As a precaution for your own sake, consider supplying keys that do not have permission to send direct messages.<br/><br/>
            Consumer Key <input type="text" id="consumer_key" value="${consumer_key}"><br /><br/>
            Consumer Secret <input type="text" id="consumer_secret" value="${consumer_secret}"><br /><br/>
            <button onclick="login()">Login with Twitter</button>
        </body></head></html>`);
});
//setup static paths 
//app.use(express.static('./www'));
let g_appAuthFileName = './app_auth.json';
let g_userAuthFileName = './user_auth.json';
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
    let user_auth = TwitterAuth.TryLoadUserAuth(g_userAuthFileName);
    if (!user_auth)
        return false;
    try {
        //@ts-ignore
        let testClient = new Twitter({
            consumer_key: app_auth.consumer_key,
            consumer_secret: app_auth.consumer_secret,
            access_token_key: user_auth.access_token_key,
            access_token_secret: user_auth.access_token_secret // from your User (oauth_token_secret)
        });
        //verify that the app_auth and user_auth info is useable
        var verifyOK = await testClient.get("account/verify_credentials");
        //no error means the keys were valid
        g_userAuth = user_auth;
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
function createWindow() {
    // Create the browser window.
    let mainWindow = new electron_2.BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });
    electron_2.Menu.setApplicationMenu(null);
    // and load the index.html of the app.
    //mainWindow.loadFile('index.html')
    mainWindow.loadURL('http://localhost:3000');
    //navigating seems to alter the window title.. can we please just keep it the way it should be? kthx
    mainWindow.webContents.on('page-title-updated', () => {
        mainWindow.setTitle(electron_1.app.getName());
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
    const httpServer = http.createServer(app);
    httpServer.listen(3000, function () {
        //server is running, start electron
        // This method will be called when Electron has finished
        // initialization and is ready to create browser windows.
        // Some APIs can only be used after this event occurs.
        electron_1.app.whenReady().then(() => {
            createWindow();
            electron_1.app.on('activate', function () {
                // On macOS it's common to re-create a window in the app when the
                // dock icon is clicked and there are no other windows open.
                if (electron_2.BrowserWindow.getAllWindows().length === 0)
                    createWindow();
            });
        });
        console.log('localhost listening on port 3000!');
    });
}
main();
//# sourceMappingURL=main.js.map