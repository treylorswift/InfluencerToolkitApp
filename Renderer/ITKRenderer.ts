import * as IPCAPI from "../Shared/IPCAPI.js"
import * as SVRP from "../Shared/SVRP.js"
import { SVDOMComponent } from "./SVDOMComponent.js"
import { SVDOMHost } from "./SVDOMHost.js"
import { SVElectronIPC } from "../Shared/SVElectronIPC.js";
import {HomePage} from "./HomePage.js"

class LoginPage extends SVDOMComponent
{
    ckey:HTMLInputElement = null;
    csec:HTMLInputElement = null;
    rememberMe:HTMLInputElement = null;

    Login = async ()=>
    {
        let args = 
        {
            appAuth: 
            {
                consumer_key: this.ckey.value,
                consumer_secret: this.csec.value
            },
            saveUserAuth:this.rememberMe.checked
        };
        

        let result = await IPCAPI.Login(args);
        
        if (!result.userLogin)
        {
            console.error(JSON.stringify(result));
            if (result.errorMessage)
                alert(`Sorry, we're having trouble logging you in. ${result.errorMessage}`);
            return;
        }

        this.GetSite().RouteTo("/"); //ok we're logged in go home
    }

    async Render(em:Element)
    {
        var html = 
           `<br/><br/>
            Enter your Twitter App API keys<br/><br/>
            You can obtain keys <a href="https://apps.twitter.com" target="_blank">here</a></br /><br/>
            As a precaution for your own sake, consider supplying keys that do not have permission to send direct messages.<br/><br/>
            Consumer Key <input type="text" id="consumer_key" ><br /><br/>
            Consumer Secret <input type="text" id="consumer_secret" ><br /><br/>
            <button id="login">Login with Twitter</button>
            <input id="rememberMe" type="checkbox">Remember Me`;

        em.innerHTML = html;

        this.MapEvent(em,"login","click",this.Login);
        this.ckey = em.querySelector('#consumer_key');
        this.csec = em.querySelector('#consumer_secret');
        this.rememberMe = em.querySelector('#rememberMe');

        //grab the current Twitter app API keys (if they have been saved to disk.. would be there if any
        //previous login worked, or partially worked with good app keys but perhaps a bad user password)
        try
        {
            let appAuthRequest = new IPCAPI.GetAppAuth();
            let result = await appAuthRequest.Call() as IPCAPI.GetAppAuthResponse;
            if (result.appAuth)
            {
                this.ckey.value = result.appAuth.consumer_key;
                this.csec.value = result.appAuth.consumer_secret;
            }
        }
        catch (err)
        {
            console.error(err);
        }

    }
}


export class Site extends SVDOMHost
{
    routerContentElement:HTMLElement;
    
    private static g_site:Site = null;
    static GetSite():Site
    {
        return Site.g_site;
    }

    constructor()
    {
        super();
        if (Site.g_site)
        {
            console.log("Site.g_site already exists, should never have multiple Site instantiations");
            return;
        }
        Site.g_site = this;

        this.routerContentElement = null;

        var map = 
        {
            "/":HomePage,
            "/login":LoginPage,
        };

        this.InitRoutes(map);

        window.addEventListener('popstate', (event) =>
        {
            //console.log(inspect(event));
            this.RouteTo(event.state.path,{pushState:false});
        }, false);
    }

    GetSite():SVDOMHost
    {
        return this;
    }

    GetRouteContentElement():HTMLElement
    {
        return this.routerContentElement;
    }
    
    async Render(em:HTMLElement)
    {
        try
        {
            //apply the title bar and router content div
            em.innerHTML = `
                <div id="titleBar" style="text-align:center">Influencer Toolkit</div>
                <div id="routerContentId"></div>`;

            this.routerContentElement = em.querySelector('#routerContentId');   

            //first make sure our session cookie is valid and we're logged in
            let userLoginResponse = await IPCAPI.GetUserLogin();
            
            //if they're not logged in, we either tell them that they're not authorized, or show them
            //the login page where they can try to login
            if (!userLoginResponse.userLogin)
            {
                //render the login page
                this.RouteTo("/login");
                return;
            }
                
            //default route, go to /home            
            await this.RouteTo("/");
        }
        catch (err)
        {
            console.log("error");
        }
    }

    async onload()
    {
        SVRP.SetTransport(new SVElectronIPC());
        this.Render(document.getElementById("site"));
    }

}
