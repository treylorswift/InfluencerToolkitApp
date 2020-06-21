define("Shared/SVRP", ["require", "exports"], function (require, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
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
});
define("Shared/SVElectronIPC", ["require", "exports", "Shared/SVRP"], function (require, exports, SVRP) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var g_logAll = true;
    if (g_logAll)
        console.log("SVElectronIPC logging all calls");
    let sendFunc = null;
    let setReceiveFunc = null;
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
        //outside the browser, window. will throw an error
        //so we attach to the node modules like this
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
    class _SVElectronIPC {
        constructor() {
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
        SetHandler(c, func) {
            //have to temporarily instantiate a call to get its method
            //little inefficient but better to do this way for type safety
            var temp = new c();
            this.callHandlers.set(temp.method, func);
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
        CallNoResponse(c) {
            //main difference is that a sequence is not added to the call json,
            //so the other side will know not to send back a response
            //we will also not create a response handler in anticipation of it..
            if (g_logAll)
                console.log('CallNoResponse: ' + JSON.stringify(c));
            //store these promise functions in our map so that this Call can be resolved later
            //when a matching sequence comes back from the other side
            sendFunc(c);
        }
        Call(c) {
            return new Promise((resolve, reject) => {
                c.sequence = this.sequence;
                if (g_logAll)
                    console.log('Call: ' + JSON.stringify(c));
                //store these promise functions in our map so that this Call can be resolved later
                //when a matching sequence comes back from the other side
                this.responseHandlers.set(this.sequence, new PromiseFunctions(resolve, reject));
                sendFunc(c);
                this.sequence++;
            });
        }
    }
    exports.SVElectronIPC = new _SVElectronIPC();
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
define("Renderer/ITKRenderer", ["require", "exports", "Shared/IPCAPI", "Shared/SVElectronIPC", "Renderer/SVDOMComponent", "Renderer/SVDOMHost"], function (require, exports, IPCAPI, SVElectronIPC_js_1, SVDOMComponent_js_2, SVDOMHost_js_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    class HomePage extends SVDOMComponent_js_2.SVDOMComponent {
        async Render(em) {
            //make sure we have a valid / current login of a current user
            let userLoginResponse = await SVElectronIPC_js_1.SVElectronIPC.Call(new IPCAPI.GetUserLogin());
            if (userLoginResponse.success !== true) {
                this.GetSite().RouteTo("/");
                return;
            }
            let screen_name = userLoginResponse.userLogin.screen_name;
            var html = `<br/><br/>
            Welcome, ${screen_name}!`;
            em.innerHTML = html;
        }
    }
    class LoginPage extends SVDOMComponent_js_2.SVDOMComponent {
        constructor() {
            super(...arguments);
            this.ckey = null;
            this.csec = null;
            this.Login = async () => {
                let login = new IPCAPI.Login();
                login.appAuth =
                    {
                        consumer_key: this.ckey.value,
                        consumer_secret: this.csec.value
                    };
                let result = await SVElectronIPC_js_1.SVElectronIPC.Call(login);
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
            var html = `<br/><br/>
            Enter your Twitter App API keys<br/><br/>
            You can obtain keys <a href="https://apps.twitter.com" target="_blank">here</a></br /><br/>
            As a precaution for your own sake, consider supplying keys that do not have permission to send direct messages.<br/><br/>
            Consumer Key <input type="text" id="consumer_key" ><br /><br/>
            Consumer Secret <input type="text" id="consumer_secret" ><br /><br/>
            <button id="login">Login with Twitter</button>`;
            em.innerHTML = html;
            this.MapEvent(em, "login", "click", this.Login);
            this.ckey = em.querySelector('#consumer_key');
            this.csec = em.querySelector('#consumer_secret');
            //grab the current Twitter app API keys (if they have been saved to disk.. would be there if any
            //previous login worked, or partially worked with good app keys but perhaps a bad user password)
            try {
                let appAuthRequest = new IPCAPI.GetAppAuth();
                let result = await SVElectronIPC_js_1.SVElectronIPC.Call(appAuthRequest);
                if (result.appAuth) {
                    this.ckey.value = result.appAuth.consumer_key;
                    this.csec.value = result.appAuth.consumer_secret;
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
                "/": HomePage,
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
                <div id="titleBar">Influencer Toolkit</div>
                <div id="routerContentId"></div>`;
                this.routerContentElement = em.querySelector('#routerContentId');
                //first make sure our session cookie is valid and we're logged in
                var resp = await SVElectronIPC_js_1.SVElectronIPC.Call(new IPCAPI.GetUserLogin());
                //if they're not logged in, we either tell them that they're not authorized, or show them
                //the login page where they can try to login
                if (!resp.userLogin) {
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
            this.Render(document.getElementById("site"));
        }
    }
    Site.g_site = null;
    exports.Site = Site;
});
//# sourceMappingURL=UI.js.map