import * as ServerApi from "../Shared/ServerApi.js"
import { DOMComponent } from "./DOMComponent.js"
import { ProgressComponent } from './ProgressComponent.js'
import { HomePage } from './HomePage.js'

//displays status of the follower cache, also displays buttons which can be used to trigger download / resume / re-download of followers
export class FollowerCacheComponent extends DOMComponent
{
    progressComponent:ProgressComponent = null;
    destElement:HTMLElement = null;
    progressInterval:any = null;
    parent:HomePage = null;

    constructor(parent:HomePage)
    {
        super(parent);
        this.parent = parent;
    }

    MonitorProgress()
    {
        if (this.progressInterval)
        {
            //already monitoring
            return;
        }

        //ok build has started.. need to poll for updates
        this.progressInterval = setInterval(async ()=>
        {
            try
            {
                let statusResult = await ServerApi.GetFollowerCacheStatus();
                if (statusResult.success)
                {
                    this.progressComponent.SetProgressPercent(statusResult.completionPercent);
                    if (statusResult.status!==ServerApi.FollowerCacheStatusEnum.InProgress)
                    {
                        
                        //stop the interval
                        clearInterval(this.progressInterval);
                        this.progressInterval = null;

                        //refresh the status displayed
                        this.UpdateStatusUI();

                        if (statusResult.status===ServerApi.FollowerCacheStatusEnum.Complete)
                        {
                            //make sure its visible
                            this.parent.queryComponent.SetVisible(true);

                            //if complete, run a query
                            this.parent.queryComponent.RunQuery();
                        }
                    }
                }
            }
            catch (err)
            {
                console.log("MonitorProgress error:");
                console.error(err);
                clearInterval(this.progressInterval);
            }
        },2000);

    }

    async BuildCache(cmd:ServerApi.BuildFollowerCacheCommands)
    {
        //before sending a build command we check what the current status is and make sure
        //it makes sense to send a build command.
        //
        //reasons why we wouldn't send a build command:
        //- attempt at getting cache status failed
        //- cache status indicates its in progress on a download already
        //- cache indicates its already complete - prompt user 'are you sure you want to rebuild?'
        //- ??
        //- profit

        let statusResult;
        let errorMessage = 'Sorry, something went wrong. Unable to retreive your followers right now.';

        try
        {
            statusResult = await ServerApi.GetFollowerCacheStatus();
            if (statusResult.success!==true)
            {
                alert(errorMessage);
                return;
            }
        }
        catch (err)
        {
            alert(errorMessage);
            console.log("BuildCache - failed to get current cache status");
            console.error(err);
            return;
        }

        if (statusResult.status===ServerApi.FollowerCacheStatusEnum.InProgress)
        {
            alert("Follower download is in progress.");
            return;
        }

        if (cmd===ServerApi.BuildFollowerCacheCommands.Rebuild)
        {
            if (statusResult.status===ServerApi.FollowerCacheStatusEnum.Complete)
            {
                if (!confirm("Are you sure you want to rebuild? It takes about 15 minutes for 75k followers."))
                    return;
            }
        }

        let buildCacheResult = await ServerApi.BuildFollowerCache(cmd);
        if (!buildCacheResult.success)
        {
            console.log("BuildCache error: " + buildCacheResult.error);
            alert(errorMessage);
            return;
        }

        this.UpdateStatusUI();
        this.MonitorProgress();
    }

    async Render(em:HTMLElement)
    {
        this.destElement = em;
        this.UpdateStatusUI();
    }

    async UpdateStatusUI()
    {
        let cacheStatusResponse = await ServerApi.GetFollowerCacheStatus();

        let progressHtml =
            `<div id="progress" style="display:inline-block; margin-left: 4px; height:15px; width:100px; border:1px solid #d8d8d8"></div>`

        let html = '';

        let progressShown = false;
        let rebuildShown = false;
        let resumeShown = false;

        if (cacheStatusResponse.status===ServerApi.FollowerCacheStatusEnum.None)
        {
            html += `Let's get started and retreive your followers from Twitter. <button id="rebuildCache">Download Followers</button>`
            rebuildShown = true;
        }
        else
        if (cacheStatusResponse.status===ServerApi.FollowerCacheStatusEnum.Incomplete)
        {
            html += `Your last follower download didn't finish. <button id="resumeCache">Resume Downloading Followers</button>`
            resumeShown = true;
        }
        else
        if (cacheStatusResponse.status===ServerApi.FollowerCacheStatusEnum.Complete)
        {
            html += `${cacheStatusResponse.totalStoredFollowers} followers <button id="rebuildCache">Refresh Followers</button>`
            //make sure query ui gets displayed

            rebuildShown = true;
        }
        else
        if (cacheStatusResponse.status===ServerApi.FollowerCacheStatusEnum.InProgress)
        {
            html +=
                `<div style="display:flex; align-items:center">
                Follower Download Progress: ${progressHtml}
                </div>`
            progressShown = true;
            //make sure we are monitoring progress (might already be but just make sure)
            this.MonitorProgress();
        }

        this.destElement.innerHTML = html;

        this.progressComponent = new ProgressComponent(this);
        if (progressShown)
        {
            this.progressComponent.Render(this.destElement.querySelector('#progress'));
            this.progressComponent.SetProgressPercent(cacheStatusResponse.completionPercent);
        }

        if (rebuildShown)
            this.MapEvent(this.destElement,'rebuildCache','click',()=>this.BuildCache(ServerApi.BuildFollowerCacheCommands.Rebuild));
        if (resumeShown)
            this.MapEvent(this.destElement,'resumeCache','click',()=>this.BuildCache(ServerApi.BuildFollowerCacheCommands.Resume));
    }
}
