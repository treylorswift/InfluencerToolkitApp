import * as IPCAPI from "../Shared/IPCAPI.js"
import * as SVRP from "../Shared/SVRP.js"
import { SVDOMComponent } from "./SVDOMComponent.js"
import { SVDOMHost } from "./SVDOMHost.js"

class ProgressComponent extends SVDOMComponent
{

    progressDiv:HTMLElement;

    //expect a number 0 to 100
    SetProgressPercent(p:number)
    {
        this.progressDiv.style.width = `${p}%`
    }

    async Render(em:Element)
    {
        em.innerHTML = `<div id="progressInner" style="display:inline-block; width:0%; height:100%; background-color:rgb(88, 178, 255)"></div>`;
        this.progressDiv = em.querySelector('#progressInner');
    }

}

class CacheStatusComponent extends SVDOMComponent
{
    progressComponent:ProgressComponent;

    RebuildCache = async ()=>
    {
        let buildCacheResult = await IPCAPI.BuildCache(IPCAPI.BuildCacheCommands.Rebuild);
        if (!buildCacheResult.success)
            console.log("BuildCache error: " + buildCacheResult.error);
    }

    async BuildCache(cmd:IPCAPI.BuildCacheCommands)
    {
        let buildCacheResult = await IPCAPI.BuildCache(cmd);
        if (!buildCacheResult.success)
        {
            console.log("BuildCache error: " + buildCacheResult.error);
            return;
        }
        //ok build has started.. need to poll for updates
        let poll = setInterval(async ()=>
        {
            try
            {
                let statusResult = await IPCAPI.GetFollowerCacheStatus();
                if (statusResult.success)
                {
                    this.progressComponent.SetProgressPercent(statusResult.completionPercent);
                    if (statusResult.status!==IPCAPI.FollowerCacheStatusEnum.InProgress)
                    {
                        //stop the interval
                        clearInterval(poll);
                    }
                }
            }
            catch (err)
            {
                console.log("GetFollowerCacheStatus error:");
                console.error(err);
                clearInterval(poll);
            }
        },1000);

    }

    async Render(em:HTMLElement)
    {
        let cacheStatusResponse = await IPCAPI.GetFollowerCacheStatus();

        let html = '';

        if (cacheStatusResponse.status===IPCAPI.FollowerCacheStatusEnum.None)
            html += `Let's get started and retreive your followers from Twitter. <button id="rebuildCache">Retreive Follower List</button>`
        else
        if (cacheStatusResponse.status===IPCAPI.FollowerCacheStatusEnum.Incomplete)
            html += `Looks like the last follower download didn't finished. <button id="resumeCache">Finish Downloading Followers</button>`
        else
        if (cacheStatusResponse.status===IPCAPI.FollowerCacheStatusEnum.Complete)
            html += `All followers downloaded successfully. You can rebuild your follower list if you want.<button id="rebuildCache">Rebuild Follower List</button>`
        else
        if (cacheStatusResponse.status===IPCAPI.FollowerCacheStatusEnum.InProgress)
            html += `Followers are downloading now...`

        html += `<Br/><br/>
            <div style="display:flex">
                Progress<div id="progress" style="display:inline-block; margin-left: 4px; height:15px; width:100px; border:1px solid #d8d8d8"></div>
            </div>`

        em.innerHTML = html;

        this.progressComponent = new ProgressComponent(this);
        this.progressComponent.Render(em.querySelector('#progress'));
        this.progressComponent.SetProgressPercent(cacheStatusResponse.completionPercent);

        this.MapEvent(em,'rebuildCache','click',()=>this.BuildCache(IPCAPI.BuildCacheCommands.Rebuild));
        this.MapEvent(em,'resumeCache','click',()=>this.BuildCache(IPCAPI.BuildCacheCommands.Resume));

    }
}

export class HomePage extends SVDOMComponent
{
    cacheStatusComponent:CacheStatusComponent;
    
    constructor(parent:SVDOMComponent)
    {
        super(parent);
        this.cacheStatusComponent = new CacheStatusComponent(this);
    }

    async Render(em:Element)
    {
        //make sure we have a valid / current login of a current user
        let userLoginResponse = await IPCAPI.GetUserLogin();

        //if they're not logged in, redirect to the login page
        if (!userLoginResponse.userLogin)
        {
            this.GetSite().RouteTo("/login");
            return;
        }

        
        let screen_name = userLoginResponse.userLogin.screen_name;

        var html = 
           `<br/><br/>
            Welcome, ${screen_name}!<br/><br/>
            <div id="cacheStatus"></div>`;
        
        em.innerHTML = html;
        this.cacheStatusComponent.Render(em.querySelector('#cacheStatus'));

    }
}

