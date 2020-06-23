//classes and types used for remote procedure calls.. calls that have to cross some kind of boundary
//whether it be inter process communication, websocket communication, etc
define("Shared/SVRP", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class Call {
        Call(options) {
            return Transport.g_transport.Call(this, options);
        }
        CallNoResponse(options) {
            return Transport.g_transport.CallNoResponse(this, options);
        }
    }
    exports.Call = Call;
    var Error;
    (function (Error) {
        Error["NotLoggedIn"] = "NotLoggedIn";
        Error["Unauthorized"] = "Unauthorized";
        Error["InvalidMethod"] = "InvalidMethod";
        Error["InvalidParams"] = "InvalidParams";
        Error["InvalidInternalResponse"] = "InvalidInternalResponse";
        Error["Internal"] = "Internal";
        Error["Timeout"] = "Timeout";
        Error["Unknown"] = "Unknown";
    })(Error = exports.Error || (exports.Error = {}));
    function ErrorFromString(s) {
        //if there is no error object, we shouldn't create one.. leave it undefined
        if (s === undefined || s === null)
            return undefined;
        if (typeof (s) !== "string") {
            console.log("ErrorFromString - input was not a string type: " + typeof (s) + " - " + JSON.stringify(s));
            return Error.Unknown;
        }
        var err = Error[s];
        if (err === undefined) {
            console.log("ErrorFromString - unrecognized string code: " + s);
            err = Error.Unknown;
        }
        return err;
    }
    exports.ErrorFromString = ErrorFromString;
    class Response {
        //the idea here is that the constructor takes a raw json
        //fresh off a websocket or http response, and make sure the contents
        //map into the Response object as defined by typescript
        constructor(json) {
            this.success = json.success === true;
            if (this.success === false)
                this.error = ErrorFromString(json.error);
            else
                this.error = undefined;
            //all other property names are to be decoded/validated by subclasses of Response
        }
    }
    exports.Response = Response;
    class Transport {
    }
    Transport.g_transport = null;
    exports.Transport = Transport;
    function SetTransport(t) {
        Transport.g_transport = t;
    }
    exports.SetTransport = SetTransport;
    function SetHandler(className, func) {
        Transport.g_transport.SetHandler(className, func);
    }
    exports.SetHandler = SetHandler;
});
define("Shared/TwitterAuth", ["require", "exports", "fs"], function (require, exports, fs) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    //make sure the app auth that came from storage contains the appropriate keys and that they are at least non-empty strings
    function TypeCheckAppAuth(app_auth) {
        if (!app_auth.consumer_key || !app_auth.consumer_secret ||
            typeof (app_auth.consumer_key) !== 'string' ||
            typeof (app_auth.consumer_secret) !== 'string') {
            return false;
        }
        return true;
    }
    //will silently return null if unable to open and successfully type-check app auth key file
    function TryLoadAppAuth(fileName) {
        let app_auth;
        try {
            app_auth = JSON.parse(fs.readFileSync(fileName, 'utf-8'));
        }
        catch (err) {
            return null;
        }
        if (TypeCheckAppAuth(app_auth))
            return app_auth;
        return null;
    }
    exports.TryLoadAppAuth = TryLoadAppAuth;
    //will loudly report errors if unable to open or successfully type-check app auth key file, AND process.exit(-1)
    function LoadAppAuth(fileName) {
        let app_auth;
        try {
            app_auth = JSON.parse(fs.readFileSync(fileName, 'utf-8'));
        }
        catch (err) {
            console.log(`Error reading ${fileName}:`);
            console.error(err);
            process.exit(-1);
        }
        if (TypeCheckAppAuth(app_auth))
            return app_auth;
        console.log(`${fileName} has invalid or missing consumer_key and/or consumer_secret: ${JSON.stringify(app_auth)}`);
        process.exit(-1);
    }
    exports.LoadAppAuth = LoadAppAuth;
    //make sure the app auth that came from storage contains the appropriate keys and that they are at least non-empty strings
    function TypeCheckUserLogin(user_login) {
        if (!user_login.access_token_key || !user_login.access_token_secret ||
            !user_login.id_str || !user_login.screen_name ||
            typeof (user_login.access_token_key) !== 'string' ||
            typeof (user_login.access_token_secret) !== 'string' ||
            typeof (user_login.id_str) !== 'string' ||
            typeof (user_login.screen_name) !== 'string') {
            return false;
        }
        return true;
    }
    //will silently return null if unable to open and successfully type-check user auth key file
    function TryLoadUserLogin(fileName) {
        let user_auth;
        try {
            user_auth = JSON.parse(fs.readFileSync(fileName, 'utf-8'));
        }
        catch (err) {
            return null;
        }
        if (TypeCheckUserLogin(user_auth))
            return user_auth;
        return null;
    }
    exports.TryLoadUserLogin = TryLoadUserLogin;
    //will loudly report errors if unable to open or successfully type-check app auth key file, AND process.exit(-1)
    function LoadUserLogin(fileName) {
        let user_login;
        try {
            user_login = JSON.parse(fs.readFileSync(fileName, 'utf-8'));
        }
        catch (err) {
            console.log(`Error reading ${fileName}:`);
            console.error(err);
            process.exit(-1);
        }
        if (TypeCheckUserLogin(user_login))
            return user_login;
        console.log(`${fileName} has invalid or missing access_token_key and/or access_token_secret: ${JSON.stringify(user_login)}`);
        process.exit(-1);
    }
    exports.LoadUserLogin = LoadUserLogin;
});
define("Shared/IPCAPI", ["require", "exports", "Shared/SVRP"], function (require, exports, SVRP) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
});
define("Shared/ClientApi", ["require", "exports", "Shared/SVRP"], function (require, exports, SVRP) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    ////////////////////
    //Client API
    //(methods the server can call on the client
    ///////////////////////
    //////////////////////////
    //Notify Message Sent
    /////////////////////////
    function NotifyMessageSent(args) {
        new NotifyMessageSentCall(args).CallNoResponse();
    }
    exports.NotifyMessageSent = NotifyMessageSent;
    class NotifyMessageSentCall extends SVRP.Call {
        constructor(args) {
            super();
            this.method = "NotifyMessageSent";
            this.args = args;
        }
    }
    exports.NotifyMessageSentCall = NotifyMessageSentCall;
    /////////////////
    //Notify Message Campaign Started / Stopped
    ///////////////////
    function NotifyMessageCampaignStarted() {
        new NotifyMessageCampaignStartedCall().CallNoResponse();
    }
    exports.NotifyMessageCampaignStarted = NotifyMessageCampaignStarted;
    class NotifyMessageCampaignStartedCall extends SVRP.Call {
        constructor() {
            super(...arguments);
            this.method = "NotifyMessageCampaignStarted";
        }
    }
    exports.NotifyMessageCampaignStartedCall = NotifyMessageCampaignStartedCall;
    function NotifyMessageCampaignStopped() {
        new NotifyMessageCampaignStoppedCall().CallNoResponse();
    }
    exports.NotifyMessageCampaignStopped = NotifyMessageCampaignStopped;
    class NotifyMessageCampaignStoppedCall extends SVRP.Call {
        constructor() {
            super(...arguments);
            this.method = "NotifyMessageCampaignStopped";
        }
    }
    exports.NotifyMessageCampaignStoppedCall = NotifyMessageCampaignStoppedCall;
});
define("Renderer/SVDOMHost", ["require", "exports", "Renderer/SVDOMComponent"], function (require, exports, SVDOMComponent_js_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class PageMap {
        constructor(parent) {
            this.parent = parent;
            this.pageMap = null;
        }
        InitRoutes(json) {
            //destroy whatever pagemap is already around
            this.pageMap = new Map();
            var keys = Object.keys(json);
            for (var i = 0; i < keys.length; i++) {
                this.pageMap.set(keys[i], json[keys[i]]);
            }
        }
        GetPage(path) {
            if (!this.pageMap)
                return null;
            var ctor = this.pageMap.get(path);
            if (ctor)
                return new ctor(this.parent);
            else
                console.log(`SVDOMHost.GetPage - unrecognized path: ${path}`);
        }
    }
    ;
    class SVDOMHost extends SVDOMComponent_js_1.SVDOMComponent {
        constructor() {
            super(null);
            this.pageMap = new PageMap(this);
            this.currentPath = null;
            this.currentPage = null;
        }
        InitRoutes(map) {
            this.pageMap.InitRoutes(map);
        }
        GetCurrentRoute() {
            return { page: this.currentPage, path: this.currentPath };
        }
        async RouteTo(path, options) {
            if (!this.pageMap)
                return false;
            try {
                if (this.currentPath === path) {
                    //we're already there, we're done
                    return true;
                }
                var p = this.pageMap.GetPage(path);
                if (p) {
                    if (this.currentPage) {
                        this.currentPage.RenderCleanup();
                    }
                    this.currentPath = path;
                    this.currentPage = p;
                    this.ClearModalComponent();
                    this.ClosePopupComponent();
                    await p.Render(this.GetRouteContentElement());
                    return true;
                }
                else {
                    console.log(`RouteTo - route does not exist: ${path}`);
                }
            }
            catch (err) {
                console.error(err);
            }
            return false;
        }
    }
    exports.SVDOMHost = SVDOMHost;
});
define("Renderer/SVDOMComponent", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class SVDOMPopupHandle {
        constructor() {
            this.handle = 'popup_' + SVDOMPopupHandle.count;
            SVDOMPopupHandle.count++;
        }
    }
    SVDOMPopupHandle.count = 0;
    exports.SVDOMPopupHandle = SVDOMPopupHandle;
    class SVDOMComponent {
        constructor(parent) {
            this.parent = parent;
            if (parent)
                this.site = parent.GetSite();
            else
                this.site = null;
        }
        GetSite() {
            return this.site;
        }
        //any listeners or watches or other external references that were established during Render
        //should be cleaned up here
        async RenderCleanup() { }
        MapEvent(parentElement, id, eventName, memberFunction) {
            try {
                parentElement.querySelector(`#${id}`).addEventListener(`${eventName}`, memberFunction.bind(this));
            }
            catch (err) {
                console.log(`MapEvent error - name: "${err.name}" message: "${err.message}`);
                console.error(err);
            }
        }
        DisplayPopupComponent(x, y, component) {
            var h = new SVDOMPopupHandle();
            var parent_handle = h.handle;
            var content_handle = h.handle + '_content';
            var html = `
            <div style="position:absolute; left:${x}px; top:${y}px; box-shadow: 0 1px 1px #0000, 0 0px 2px;">
                <div id=${content_handle}></div>
            </div>`;
            var newDiv = document.createElement('div');
            newDiv.id = parent_handle;
            newDiv.innerHTML = html;
            var renderDiv = newDiv.querySelector(`#${content_handle}`);
            component.Render(renderDiv);
            //we have a root level div wherein all popups are kept
            var popupModal = document.getElementById("popup-modal");
            popupModal.appendChild(newDiv);
            popupModal.style.display = 'block';
            // When the user clicks anywhere outside of the modal, close it
            var checkOutsideClick = function (event) {
                //allow clicks within the popup, clicks outside will close it
                if (event.target == popupModal) {
                    popupModal.removeChild(newDiv);
                    component.RenderCleanup();
                    window.removeEventListener("click", checkOutsideClick);
                    popupModal.style.display = 'none';
                }
            };
            window.addEventListener("click", checkOutsideClick);
            return h;
        }
        ClosePopupComponent(h) {
            var popupModal = document.getElementById("popup-modal");
            if (!popupModal)
                return;
            if (h) {
                var em = popupModal.querySelector(`#${h.handle}`);
                if (em) {
                    popupModal.removeChild(em);
                    popupModal.style.display = 'none';
                }
            }
            else {
                popupModal.innerHTML = ""; //remove all children
                popupModal.style.display = 'none';
            }
        }
        DisplayModalMessage(message) {
            this.DisplayModalComponent(new StringMessageComponent(this, message));
        }
        DisplayModalComponent(component) {
            var modal = document.getElementById('modal');
            var modalContent = document.getElementById('modal-content');
            component.Render(modalContent);
            modal.style.display = "flex";
            // When the user clicks anywhere outside of the modal, close it
            var checkOutsideClick = function (event) {
                if (event.target == modal) {
                    modalContent.innerHTML = '';
                    component.RenderCleanup();
                    modal.style.display = "none";
                    window.removeEventListener("click", checkOutsideClick);
                }
            };
            window.addEventListener("click", checkOutsideClick);
        }
        ClearModalComponent() {
            var modal = document.getElementById('modal');
            var modalContent = document.getElementById('modal-content');
            if (modalContent)
                modalContent.innerHTML = '';
            if (modal)
                modal.style.display = "none";
        }
    }
    exports.SVDOMComponent = SVDOMComponent;
    class StringMessageComponent extends SVDOMComponent {
        constructor(parent, message) {
            super(parent);
            this.message = message;
        }
        async Render(em) {
            em.innerHTML = this.message;
        }
    }
});
define("Shared/SVElectronIPC", ["require", "exports", "Shared/SVRP"], function (require, exports, SVRP) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var g_logAll = false;
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
    let sendFunc = null;
    let setReceiveFunc = null;
    //wire into window.IPC (if the renderer process)
    //if that fails, wire ino
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
        //outside the browser, assume this is the main process
        //the below 'require' statements will actually work in the main process
        //
        //note that the main process only sends messages to the main browser window,
        //which must be exported from Main.ts and established by the time the below
        //code runs
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
    class SVElectronIPC extends SVRP.Transport {
        constructor() {
            super();
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
        SetHandler(className, func) {
            //have to temporarily instantiate a call to get its method
            //little inefficient but better to do this way for type safety
            let tempInstance = new className();
            this.callHandlers.set(tempInstance.method, func);
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
        CallNoResponse(c, options) {
            //we determine the contents of the 'sequence'
            //main difference is that a sequence is not added to the call json,
            //so the other side will know not to send back a response
            //we will also not create a response handler in anticipation of it..
            delete c.sequence;
            var log = g_logAll;
            if (options && options.log !== undefined)
                log = options.log === true;
            if (log)
                console.log('CallNoResponse: ' + JSON.stringify(c));
            //store these promise functions in our map so that this Call can be resolved later
            //when a matching sequence comes back from the other side
            sendFunc(c);
        }
        Call(c, options) {
            return new Promise((resolve, reject) => {
                //we determine the contents of the 'sequence'
                c.sequence = this.sequence;
                var log = g_logAll;
                if (options && options.log !== undefined)
                    log = options.log === true;
                if (log)
                    console.log('Call: ' + JSON.stringify(c));
                //store these promise functions in our map so that this Call can be resolved later
                //when a matching sequence comes back from the other side
                this.responseHandlers.set(this.sequence, new PromiseFunctions(resolve, reject));
                sendFunc(c);
                this.sequence++;
            });
        }
    }
    exports.SVElectronIPC = SVElectronIPC;
});
define("Renderer/HomePage", ["require", "exports", "Shared/IPCAPI", "Shared/ClientApi", "Shared/SVRP", "Renderer/SVDOMComponent"], function (require, exports, IPCAPI, ClientApi, SVRP, SVDOMComponent_js_2) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    //only support a single / default messaging campaign from this UI currently
    let g_campaignId = 'default';
    class ProgressComponent extends SVDOMComponent_js_2.SVDOMComponent {
        //expect a number 0 to 100
        SetProgressPercent(p) {
            this.progressDiv.style.width = `${p}%`;
        }
        async Render(em) {
            em.innerHTML = `<div id="progressInner" style="display:inline-block; width:0%; height:100%; background-color:rgb(88, 178, 255)"></div>`;
            this.progressDiv = em.querySelector('#progressInner');
        }
    }
    class CacheStatusComponent extends SVDOMComponent_js_2.SVDOMComponent {
        async BuildCache(cmd) {
            let statusResult;
            let errorMessage = 'Sorry, something went wrong. Unable to retreive your followers right now.';
            try {
                statusResult = await IPCAPI.GetFollowerCacheStatus();
                if (statusResult.success !== true) {
                    alert(errorMessage);
                    return;
                }
            }
            catch (err) {
                alert(errorMessage);
                console.log("BuildCache - failed to get current cache status");
                console.error(err);
                return;
            }
            if (statusResult.status === IPCAPI.FollowerCacheStatusEnum.InProgress) {
                alert("Follower download is in progress.");
                return;
            }
            if (cmd === IPCAPI.BuildFollowerCacheCommands.Rebuild) {
                if (statusResult.status === IPCAPI.FollowerCacheStatusEnum.Complete) {
                    if (!confirm("Are you sure you want to rebuild? It takes about 15 minutes for 75k followers."))
                        return;
                }
            }
            let buildCacheResult = await IPCAPI.BuildFollowerCache(cmd);
            if (!buildCacheResult.success) {
                console.log("BuildCache error: " + buildCacheResult.error);
                alert(errorMessage);
                return;
            }
            this.UpdateStatus();
            //ok build has started.. need to poll for updates
            let poll = setInterval(async () => {
                try {
                    let statusResult = await IPCAPI.GetFollowerCacheStatus();
                    if (statusResult.success) {
                        this.progressComponent.SetProgressPercent(statusResult.completionPercent);
                        if (statusResult.status !== IPCAPI.FollowerCacheStatusEnum.InProgress) {
                            //stop the interval
                            clearInterval(poll);
                            //refresh the status displayed
                            this.UpdateStatus();
                        }
                    }
                }
                catch (err) {
                    console.log("GetFollowerCacheStatus error:");
                    console.error(err);
                    clearInterval(poll);
                }
            }, 1000);
        }
        async Render(em) {
            this.destElement = em;
            this.UpdateStatus();
        }
        async UpdateStatus() {
            let cacheStatusResponse = await IPCAPI.GetFollowerCacheStatus();
            let progressHtml = `<div id="progress" style="display:inline-block; margin-left: 4px; height:15px; width:100px; border:1px solid #d8d8d8"></div>`;
            let html = '';
            let progressShown = false;
            let rebuildShown = false;
            let resumeShown = false;
            if (cacheStatusResponse.status === IPCAPI.FollowerCacheStatusEnum.None) {
                html += `Let's get started and retreive your followers from Twitter. <button id="rebuildCache">Retreive Follower List</button>`;
                rebuildShown = true;
            }
            else if (cacheStatusResponse.status === IPCAPI.FollowerCacheStatusEnum.Incomplete) {
                html += `Your last follower download didn't finish. <button id="resumeCache">Resume Downloading Followers</button>`;
                resumeShown = true;
            }
            else if (cacheStatusResponse.status === IPCAPI.FollowerCacheStatusEnum.Complete) {
                html += `Followers download complete. <button id="rebuildCache">Refresh Downloaded Followers</button>`;
                rebuildShown = true;
            }
            else if (cacheStatusResponse.status === IPCAPI.FollowerCacheStatusEnum.InProgress) {
                html +=
                    `<div style="display:flex; align-items:center">
                Follower Download Progress: ${progressHtml}
                </div>`;
                progressShown = true;
            }
            this.destElement.innerHTML = html;
            this.progressComponent = new ProgressComponent(this);
            if (progressShown) {
                this.progressComponent.Render(this.destElement.querySelector('#progress'));
                this.progressComponent.SetProgressPercent(cacheStatusResponse.completionPercent);
            }
            if (rebuildShown)
                this.MapEvent(this.destElement, 'rebuildCache', 'click', () => this.BuildCache(IPCAPI.BuildFollowerCacheCommands.Rebuild));
            if (resumeShown)
                this.MapEvent(this.destElement, 'resumeCache', 'click', () => this.BuildCache(IPCAPI.BuildFollowerCacheCommands.Resume));
        }
    }
    class QueryComponent extends SVDOMComponent_js_2.SVDOMComponent {
        constructor(parent) {
            super(parent);
            this.resultsDiv = null;
            this.sortElement = null;
            this.tagsElement = null;
            this.messageElement = null;
            this.sendButton = null;
            this.sendLimit = null;
            //if they update the query ui before a previous query has finished, we wait
            //for the previous query to finish.
            //we keep a queue of 1 query (representing the most recent query attempt) to run
            //after the completion of the previous query.
            this.queryRunning = false;
            this.deferredQuery = null;
            this.parent = null;
            //by default we will show all followers including ones weve contacted
            this.contactedVisible = true;
            this.toggleContactedButton = null;
            this.campaignRunning = false;
            this.RunQuery = async () => {
                var sort = this.sortElement.value;
                let tags = this.tagsElement.value.split(' ');
                let query = {
                    campaignId: g_campaignId,
                    tags: tags,
                    sort: sort,
                    offset: 0,
                    limit: 50,
                    includeContacted: this.contactedVisible,
                    useDryRunMessageHistory: true
                };
                if (this.queryRunning) {
                    this.deferredQuery = query;
                    return;
                }
                this.queryRunning = true;
                //this loop exists to make sure that any queries queued
                //while processing this query get immediately executed when
                //this query finishes.
                while (1) {
                    try {
                        let results = await IPCAPI.QueryFollowerCache(query);
                        //display the results
                        this.RenderResults(results);
                        if (this.deferredQuery) {
                            //there was a query queued up while the previous query was processing.
                            //we should loop and run that query now
                            query = this.deferredQuery;
                            this.deferredQuery = null;
                        }
                        else {
                            //there is no deferred query to do, we can 
                            //break out of this loop
                            break;
                        }
                    }
                    catch (err) {
                        console.log("Error while processing query: " + JSON.stringify(query));
                        console.error(err);
                        break;
                    }
                }
                this.queryRunning = false;
            };
            this.RunCampaign = async () => {
                if (this.campaignRunning) {
                    alert("Messaging campaign already running, please wait for it to finish");
                    return;
                }
                var sort = this.sortElement.value;
                let tags = this.tagsElement.value.split(' ');
                let count = this.GetSendCount();
                let campaign = {
                    message: this.messageElement.value,
                    campaign_id: g_campaignId,
                    sort: sort,
                    scheduling: "burst",
                    dryRun: true,
                    count: count,
                    filter: {
                        tags: tags
                    }
                };
                this.campaignRunning = true;
                let startOK = await IPCAPI.RunMessagingCampaign(campaign);
                if (startOK.success !== true) {
                    alert('Unable to start sending messages: ' + startOK.errorMessage);
                    this.campaignRunning = false;
                    return;
                }
            };
            this.ToggleContacted = () => {
                if (this.contactedVisible) {
                    this.contactedVisible = false;
                    this.toggleContactedButton.innerHTML = "Show Contacted";
                }
                else {
                    this.contactedVisible = true;
                    this.toggleContactedButton.innerHTML = "Hide Contacted";
                }
                this.RunQuery();
            };
            this.SendLimitChanged = () => {
                let count = this.GetSendCount();
                if (count !== null)
                    this.sendButton.innerHTML = `Send To ${count} Followers`;
                else
                    this.sendButton.innerHTML = `Send To All Followers`;
            };
            this.parent = parent;
        }
        RenderResults(results) {
            let html = '';
            for (var i = 0; i < results.followers.length; i++) {
                let f = results.followers[i];
                let imgUrl = f.profileImageUrl;
                if (!imgUrl)
                    imgUrl = "https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png";
                let contactedString = 'No';
                if (results.followers[i].contactDate)
                    contactedString = 'Yes';
                html +=
                    `<div id="row-${f.screenName}" class="followerRowDeleter">
                <div class="followerRow" onclick="window.open('https://twitter.com/${f.screenName}', '_blank')">
                    <div class="followerIcon"><img class="followerIconImg" src="${imgUrl}"></div>
                    <div class="followerName">${f.name}</div>
                    <div class="followerScreenName">${f.screenName}</div>
                    <div class="followerFollowersCount">${f.followersCount}</div>
                    <div id="contacted-${f.screenName}" class="followerContacted">${contactedString}</div>
                </div>
                </div>`;
            }
            this.resultsDiv.innerHTML = html;
        }
        //returns null if the send count field is empty/blank
        GetSendCount() {
            if (this.sendLimit.value === '')
                return null;
            let count = 0;
            try {
                let count = parseInt(this.sendLimit.value);
                return count;
            }
            catch (err) {
                return null;
            }
        }
        async Render(em) {
            let defaultMessage = `Hey there, are you interested in receiving my newsletter?

You can sign up at https://itk-signup.herokuapp.com/${this.parent.userLogin.screen_name}`;
            let html = `<div>
                Contact your followers with this message:<br/>
                <div style="display:flex; align-items:center">
                    <textarea id="message" style="padding-left:4px; resize:none; width:100%; height:60px;" type="text">${defaultMessage}</textarea>
                </div>
                <br/>
                <div style="display:flex; justify-content:space-between">
                    <div>
                        <div>Sort</div>
                        <select id="sortSelect">
                            <option value="influence">Most Followers</option>
                            <option value="recent">Recently Followed</option>
                        </select>
                    </div>
                    <div style="margin-left:12px">
                        <div>Filter</div>
                        <input id="tags" style="width:260px" type="text" placeholder="Twitter bio tags eg. health love dad">
                    </div>
                    <div style="margin-left:12px">
                        <div>Send Limit</div>
                        <input id="sendLimit" style="width:40px; margin-right:8px" type="text" placeholder="">
                    </div>
                    <div style="margin-left: 12px; align-self:stretch"><button style="height:100%" id="sendButton">Send To All Followers</button></div>
                </div>
                <br/>

            </div>
            <div class="followerHeaderRow">
                <div class="followerIcon">&nbsp</div>
                <div class="followerName">Name</div>
                <div class="followerScreenName">Twitter Handle</div>
                <div class="followerFollowersCount">Followers</div>
                <div class="followerContacted">Contacted</div>
                <div style="margin-left:auto; padding-right:4px; width:130px; text-align:right"><button id="toggleContactedButton">Hide Contacted</button></div>
            </div>
            <div id="results"></div>
        `;
            em.innerHTML = html;
            this.sortElement = em.querySelector('#sortSelect');
            this.tagsElement = em.querySelector('#tags');
            this.messageElement = em.querySelector('#message');
            this.toggleContactedButton = em.querySelector('#toggleContactedButton');
            this.sendButton = em.querySelector('#sendButton');
            this.sendLimit = em.querySelector('#sendLimit');
            this.resultsDiv = em.querySelector('#results');
            this.MapEvent(em, "sortSelect", "change", this.RunQuery);
            this.MapEvent(em, "tags", "input", this.RunQuery);
            this.MapEvent(em, "sendLimit", "input", this.SendLimitChanged);
            this.MapEvent(em, "sendButton", "click", this.RunCampaign);
            this.MapEvent(em, 'toggleContactedButton', 'click', this.ToggleContacted);
            this.RunQuery();
            /////////////////
            //sign up to handle message campaign stuff
            ////////////////
            SVRP.SetHandler(ClientApi.NotifyMessageCampaignStartedCall, async (c) => {
                this.campaignRunning = true;
                return { success: true };
            });
            SVRP.SetHandler(ClientApi.NotifyMessageCampaignStoppedCall, async (c) => {
                this.campaignRunning = false;
                return { success: true };
            });
            SVRP.SetHandler(ClientApi.NotifyMessageSentCall, async (c) => {
                //updated the Contacted column for this user to 'Yes'
                let updateContactedElement = em.querySelector(`#contacted-${c.args.recipientScreenName}`);
                if (updateContactedElement)
                    updateContactedElement.innerHTML = 'Yes';
                if (!this.contactedVisible) {
                    //make their row disappear
                    //animate the rows disappearance?
                    let updateContactedRow = em.querySelector(`#row-${c.args.recipientScreenName}`);
                    if (updateContactedRow) {
                        updateContactedRow.style.opacity = '0';
                        updateContactedRow.style.maxHeight = '0px';
                        setTimeout(() => {
                            updateContactedRow.parentElement.removeChild(updateContactedRow);
                        }, 1100);
                    }
                }
                return { success: true };
            });
        }
        async RenderCleanup() {
            //dont need these notifications anymore
            SVRP.SetHandler(ClientApi.NotifyMessageCampaignStartedCall, null);
            SVRP.SetHandler(ClientApi.NotifyMessageCampaignStoppedCall, null);
            SVRP.SetHandler(ClientApi.NotifyMessageSentCall, null);
        }
    }
    class HomePage extends SVDOMComponent_js_2.SVDOMComponent {
        constructor() {
            super(...arguments);
            this.cacheStatusComponent = new CacheStatusComponent(this);
            this.queryComponent = new QueryComponent(this);
            this.userLogin = null;
            this.promoElement = null;
            this.ClosePromo = () => {
                this.promoElement.style.display = 'none';
                window.localStorage.setItem('promoHidden', "1");
            };
        }
        async Render(em) {
            //make sure we have a valid / current login of a current user
            let userLoginResponse = await IPCAPI.GetUserLogin();
            //if they're not logged in, redirect to the login page
            if (!userLoginResponse.userLogin) {
                this.GetSite().RouteTo("/login");
                return;
            }
            this.userLogin = userLoginResponse.userLogin;
            let screen_name = userLoginResponse.userLogin.screen_name;
            let link = 'https://itk-signup.herokuapp.com';
            let promoHtml = '';
            let promoHidden = true;
            if (window.localStorage.getItem('promoHidden') !== "1") {
                promoHidden = false;
                promoHtml =
                    `<div id="promo">
                <div style="display:flex; align-items:center; border-radius:7px; padding:12px; border:1px solid #bbb">
                    <div>Create a newsletter sign up link at <a href="${link}" target="_blank">${link}</a></div>
                    <div id="closePromo" style="cursor:pointer; margin-left: auto; display:flex; justify-content:center; align-items: center; border-radius:28px; height:28px; width:28px; background-color: #deedff">X</div>
                </div><br/>
            </div>`;
            }
            var html = `
            <div style="display:flex; justify-content:center">
                <div style="display:inline; width:320px;"><img style="width:100%;height:auto" src="logo.png"></div>
            </div>
            <div style="display:flex; justify-content:center">
            <div>
                <br/>
                Hello, ${screen_name}!<br/><br/>
                <div id="cacheStatus"></div><br/>
                ${promoHtml}
                <div id="query"></div>
            </div>`;
            em.innerHTML = html;
            this.cacheStatusComponent.Render(em.querySelector('#cacheStatus'));
            this.queryComponent.Render(em.querySelector('#query'));
            if (!promoHidden) {
                this.MapEvent(em, "closePromo", "click", this.ClosePromo);
                this.promoElement = em.querySelector("#promo");
            }
        }
        async RenderCleanup() {
            this.cacheStatusComponent.RenderCleanup();
            this.queryComponent.RenderCleanup();
        }
    }
    exports.HomePage = HomePage;
});
define("Renderer/ITKRenderer", ["require", "exports", "Shared/IPCAPI", "Shared/SVRP", "Renderer/SVDOMComponent", "Renderer/SVDOMHost", "Shared/SVElectronIPC", "Renderer/HomePage"], function (require, exports, IPCAPI, SVRP, SVDOMComponent_js_3, SVDOMHost_js_1, SVElectronIPC_js_1, HomePage_js_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class LoginPage extends SVDOMComponent_js_3.SVDOMComponent {
        constructor() {
            super(...arguments);
            this.ckey = null;
            this.csec = null;
            this.rememberMe = null;
            this.Login = async () => {
                let args = {
                    appAuth: {
                        consumer_key: this.ckey.value,
                        consumer_secret: this.csec.value
                    },
                    saveUserAuth: this.rememberMe.checked
                };
                let result = await IPCAPI.Login(args);
                if (!result.userLogin) {
                    console.error(JSON.stringify(result));
                    if (result.errorMessage)
                        alert(`Sorry, we're having trouble logging you in. ${result.errorMessage}`);
                    return;
                }
                this.GetSite().RouteTo("/"); //ok we're logged in go home
            };
        }
        async Render(em) {
            let link = "https://apps.twitter.com";
            var html = `<br/>
            <div style="position:fixed; left:0; top:0; width:100vw; height:100vh; display:flex">
            <div style="margin:auto">
                <div style="display:flex; justify-content:center">
                    <div style="display:inline; width:320px;"><img style="width:100%;height:auto" src="logo.png"></div>
                </div>
                <br/>
                <div style="display:flex; justify-content:center">
                <div style="text-align:center">
                    To login, you will need to provide Twitter App API keys.<br /><br/>You can obtain keys from <a href="${link}" target="_blank">${link}</a></br /><br/>
                    <div style="display:inline-block; width:130px; text-align:right">Consumer Key</div>  <input type="text" style="width:300px" id="consumer_key" ><br /><br/>
                    <div style="display:inline-block; width:130px; text-align:right">Consumer Secret</div> <input type="text" style="width:300px" id="consumer_secret" ><br /><br/>
                    <button id="login">Login with Twitter</button><br/>
                    <input id="rememberMe" type="checkbox">Remember Me
                </div>
                </div>
            </div>
            </div>`;
            em.innerHTML = html;
            this.MapEvent(em, "login", "click", this.Login);
            this.ckey = em.querySelector('#consumer_key');
            this.csec = em.querySelector('#consumer_secret');
            this.rememberMe = em.querySelector('#rememberMe');
            //grab the current Twitter app API keys (if they have been saved to disk.. would be there if any
            //previous login worked, or partially worked with good app keys but perhaps a bad user password)
            try {
                let getAppAuthResult = await IPCAPI.GetAppAuth();
                if (getAppAuthResult.appAuth) {
                    this.ckey.value = getAppAuthResult.appAuth.consumer_key;
                    this.csec.value = getAppAuthResult.appAuth.consumer_secret;
                }
            }
            catch (err) {
                console.error(err);
            }
        }
    }
    class Site extends SVDOMHost_js_1.SVDOMHost {
        constructor() {
            super();
            if (Site.g_site) {
                console.log("Site.g_site already exists, should never have multiple Site instantiations");
                return;
            }
            Site.g_site = this;
            this.routerContentElement = null;
            var map = {
                "/": HomePage_js_1.HomePage,
                "/login": LoginPage,
            };
            this.InitRoutes(map);
            window.addEventListener('popstate', (event) => {
                //console.log(inspect(event));
                this.RouteTo(event.state.path, { pushState: false });
            }, false);
        }
        static GetSite() {
            return Site.g_site;
        }
        GetSite() {
            return this;
        }
        GetRouteContentElement() {
            return this.routerContentElement;
        }
        async Render(em) {
            try {
                //apply the title bar and router content div
                em.innerHTML = `
                <div id="routerContentId"></div>`;
                this.routerContentElement = em.querySelector('#routerContentId');
                //first make sure our session cookie is valid and we're logged in
                let userLoginResponse = await IPCAPI.GetUserLogin();
                //if they're not logged in, we either tell them that they're not authorized, or show them
                //the login page where they can try to login
                if (!userLoginResponse.userLogin) {
                    //render the login page
                    this.RouteTo("/login");
                    return;
                }
                //default route, go to /home            
                await this.RouteTo("/");
            }
            catch (err) {
                console.log("error");
            }
        }
        async onload() {
            SVRP.SetTransport(new SVElectronIPC_js_1.SVElectronIPC());
            this.Render(document.getElementById("site"));
        }
    }
    Site.g_site = null;
    exports.Site = Site;
});
//# sourceMappingURL=Renderer.js.map