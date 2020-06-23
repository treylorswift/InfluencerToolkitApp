import * as IPCAPI from "../Shared/IPCAPI.js"
import * as ClientApi from "../Shared/ClientApi.js"
import {UserLogin} from "../Shared/TwitterAuth.js"

import {MessagingCampaignSortType} from "../Shared/IPCAPI.js"
import * as SVRP from "../Shared/SVRP.js"
import { SVDOMComponent } from "./SVDOMComponent.js"
import { SVDOMHost } from "./SVDOMHost.js"

//only support a single / default messaging campaign from this UI currently
let g_campaignId = 'default'

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
    destElement:HTMLElement;

    async BuildCache(cmd:IPCAPI.BuildFollowerCacheCommands)
    {
        let statusResult;
        let errorMessage = 'Sorry, something went wrong. Unable to retreive your followers right now.';

        try
        {
            statusResult = await IPCAPI.GetFollowerCacheStatus();
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

        if (statusResult.status===IPCAPI.FollowerCacheStatusEnum.InProgress)
        {
            alert("Follower download is in progress.");
            return;
        }

        if (cmd===IPCAPI.BuildFollowerCacheCommands.Rebuild)
        {
            if (statusResult.status===IPCAPI.FollowerCacheStatusEnum.Complete)
            {
                if (!confirm("Are you sure you want to rebuild? It takes about 15 minutes for 75k followers."))
                    return;
            }
        }

        let buildCacheResult = await IPCAPI.BuildFollowerCache(cmd);
        if (!buildCacheResult.success)
        {
            console.log("BuildCache error: " + buildCacheResult.error);
            alert(errorMessage);
            return;
        }

        this.UpdateStatus();

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

                        //refresh the status displayed
                        this.UpdateStatus();
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
        this.destElement = em;
        this.UpdateStatus();
    }

    async UpdateStatus()
    {
        let cacheStatusResponse = await IPCAPI.GetFollowerCacheStatus();

        let progressHtml =
            `<div id="progress" style="display:inline-block; margin-left: 4px; height:15px; width:100px; border:1px solid #d8d8d8"></div>`

        let html = '';

        let progressShown = false;
        let rebuildShown = false;
        let resumeShown = false;

        if (cacheStatusResponse.status===IPCAPI.FollowerCacheStatusEnum.None)
        {
            html += `Let's get started and retreive your followers from Twitter. <button id="rebuildCache">Retreive Follower List</button>`
            rebuildShown = true;
        }
        else
        if (cacheStatusResponse.status===IPCAPI.FollowerCacheStatusEnum.Incomplete)
        {
            html += `Your last follower download didn't finish. <button id="resumeCache">Resume Downloading Followers</button>`
            resumeShown = true;
        }
        else
        if (cacheStatusResponse.status===IPCAPI.FollowerCacheStatusEnum.Complete)
        {
            html += `Followers download complete. <button id="rebuildCache">Refresh Downloaded Followers</button>`
            rebuildShown = true;
        }
        else
        if (cacheStatusResponse.status===IPCAPI.FollowerCacheStatusEnum.InProgress)
        {
            html +=
                `<div style="display:flex; align-items:center">
                Follower Download Progress: ${progressHtml}
                </div>`
            progressShown = true;
        }

        this.destElement.innerHTML = html;

        this.progressComponent = new ProgressComponent(this);
        if (progressShown)
        {
            this.progressComponent.Render(this.destElement.querySelector('#progress'));
            this.progressComponent.SetProgressPercent(cacheStatusResponse.completionPercent);
        }

        if (rebuildShown)
            this.MapEvent(this.destElement,'rebuildCache','click',()=>this.BuildCache(IPCAPI.BuildFollowerCacheCommands.Rebuild));
        if (resumeShown)
            this.MapEvent(this.destElement,'resumeCache','click',()=>this.BuildCache(IPCAPI.BuildFollowerCacheCommands.Resume));
    }
}
class QueryComponent extends SVDOMComponent
{
    resultsDiv:HTMLElement = null;
    sortElement:HTMLInputElement = null;
    tagsElement:HTMLInputElement = null;
    messageElement:HTMLInputElement = null;
    sendButton:HTMLElement = null;
    sendLimit:HTMLInputElement = null;

    //if they update the query ui before a previous query has finished, we wait
    //for the previous query to finish.
    //we keep a queue of 1 query (representing the most recent query attempt) to run
    //after the completion of the previous query.
    queryRunning:boolean = false;
    deferredQuery:IPCAPI.FollowerCacheQuery = null;
    parent:HomePage = null;

    //by default we will show all followers including ones weve contacted
    contactedVisible:boolean = true;
    toggleContactedButton:HTMLElement = null;

    campaignRunning:boolean = false;
    
    constructor(parent:HomePage)
    {
        super(parent);
        this.parent = parent;
    }

    RunQuery = async ()=>
    {
        var sort = this.sortElement.value as MessagingCampaignSortType;
        let tags = this.tagsElement.value.split(' ');

        let query = 
        {
            campaignId:g_campaignId,
            tags:tags,
            sort:sort,
            offset:0,
            limit:50,
            includeContacted:this.contactedVisible,
            useDryRunMessageHistory:true
        }

        if (this.queryRunning)
        {
            this.deferredQuery = query;
            return;
        }


        this.queryRunning = true;
        //this loop exists to make sure that any queries queued
        //while processing this query get immediately executed when
        //this query finishes.
        while (1)
        {
            try
            {
                let results = await IPCAPI.QueryFollowerCache(query);

                //display the results
                this.RenderResults(results);

                if (this.deferredQuery)
                {
                    //there was a query queued up while the previous query was processing.
                    //we should loop and run that query now
                    query = this.deferredQuery;
                    this.deferredQuery = null;
                }
                else
                {
                    //there is no deferred query to do, we can 
                    //break out of this loop
                    break;
                }
            }
            catch (err)
            {
                console.log("Error while processing query: " + JSON.stringify(query));
                console.error(err);
                break;
            }
        }
        this.queryRunning = false;

    }
    
    RenderResults(results:IPCAPI.QueryFollowerCacheResponse)
    {
        let html = '';
        for (var i=0; i<results.followers.length; i++)
        {
            let f = results.followers[i];
            let imgUrl = f.profileImageUrl;
            if (!imgUrl)
                imgUrl = "https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png"
            
            let contactedString = 'No'
            if (results.followers[i].contactDate)
                contactedString = 'Yes'
                
            html +=
               `<div id="row-${f.screenName}" class="followerRowDeleter">
                <div class="followerRow" onclick="window.open('https://twitter.com/${f.screenName}', '_blank')">
                    <div class="followerIcon"><img class="followerIconImg" src="${imgUrl}"></div>
                    <div class="followerName">${f.name}</div>
                    <div class="followerScreenName">${f.screenName}</div>
                    <div class="followerFollowersCount">${f.followersCount}</div>
                    <div id="contacted-${f.screenName}" class="followerContacted">${contactedString}</div>
                </div>
                </div>`
        }

        this.resultsDiv.innerHTML = html;
    }

    RunCampaign = async () =>
    {
        if (this.campaignRunning)
        {
            alert("Messaging campaign already running, please wait for it to finish");
            return;
        }

        var sort = this.sortElement.value as MessagingCampaignSortType;
        let tags = this.tagsElement.value.split(' ');
        let count = this.GetSendCount();

        let campaign:IPCAPI.MessagingCampaign =
        {
            message:this.messageElement.value,
            campaign_id:g_campaignId,
            sort:sort,
            scheduling:"burst",
            dryRun:true,
            count:count,
            filter:
            {
                tags:tags
            }
        }

        this.campaignRunning = true;

        let startOK = await IPCAPI.RunMessagingCampaign(campaign);
        if (startOK.success!==true)
        {
            alert('Unable to start sending messages: ' + startOK.errorMessage);
            this.campaignRunning = false;
            return;
        }
    }

    ToggleContacted = ()=>
    {
        if (this.contactedVisible)
        {
            this.contactedVisible = false;
            this.toggleContactedButton.innerHTML = "Show Contacted"
        }
        else
        {
            this.contactedVisible = true;
            this.toggleContactedButton.innerHTML = "Hide Contacted"
        }
        this.RunQuery();
    }

    //returns null if the send count field is empty/blank
    GetSendCount():number
    {
        if (this.sendLimit.value==='')
            return null;

        let count = 0;
        try
        {
            let count = parseInt(this.sendLimit.value);
            return count;
        }
        catch (err)
        {
            return null;
        }
    }

    SendLimitChanged = () =>
    {
        let count = this.GetSendCount();
        if (count!==null)
            this.sendButton.innerHTML = `Send To ${count} Followers`;
        else
            this.sendButton.innerHTML = `Send To All Followers`;
    }

    async Render(em:HTMLElement)
    {
        let defaultMessage =
            `Hey there, are you interested in receiving my newsletter?

You can sign up at https://itk-signup.herokuapp.com/${this.parent.userLogin.screen_name}`;

        let html = 
           `<div>
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

        this.MapEvent(em, 'toggleContactedButton', 'click',this.ToggleContacted);


        this.RunQuery();

        /////////////////
        //sign up to handle message campaign stuff
        ////////////////
        SVRP.SetHandler(ClientApi.NotifyMessageCampaignStartedCall, async (c:ClientApi.NotifyMessageCampaignStartedCall):Promise<SVRP.Response> =>
        {
            this.campaignRunning = true;
            return {success:true};
        });

        SVRP.SetHandler(ClientApi.NotifyMessageCampaignStoppedCall, async (c:ClientApi.NotifyMessageCampaignStoppedCall):Promise<SVRP.Response> =>
        {
            this.campaignRunning = false;
            return {success:true};
        });

        SVRP.SetHandler(ClientApi.NotifyMessageSentCall, async (c:ClientApi.NotifyMessageSentCall):Promise<SVRP.Response> =>
        {
            //updated the Contacted column for this user to 'Yes'
            let updateContactedElement = em.querySelector(`#contacted-${c.args.recipientScreenName}`);
            if (updateContactedElement)
                updateContactedElement.innerHTML = 'Yes';

            if (!this.contactedVisible)
            {
                //make their row disappear
                //animate the rows disappearance?
                let updateContactedRow = em.querySelector(`#row-${c.args.recipientScreenName}`) as HTMLElement;
                if (updateContactedRow)
                {
                    updateContactedRow.style.opacity = '0';
                    updateContactedRow.style.maxHeight = '0px';
                    setTimeout(()=>
                    {
                        updateContactedRow.parentElement.removeChild(updateContactedRow);
                    },1100);
                }
            }
            return {success:true};
        });
    }


    async RenderCleanup()
    {
        //dont need these notifications anymore
        SVRP.SetHandler(ClientApi.NotifyMessageCampaignStartedCall, null);
        SVRP.SetHandler(ClientApi.NotifyMessageCampaignStoppedCall, null);
        SVRP.SetHandler(ClientApi.NotifyMessageSentCall, null);
    }

}
export class HomePage extends SVDOMComponent
{
    cacheStatusComponent = new CacheStatusComponent(this);
    queryComponent = new QueryComponent(this);
    userLogin:UserLogin = null;
    promoElement:HTMLElement = null;

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

        this.userLogin = userLoginResponse.userLogin;

        let screen_name = userLoginResponse.userLogin.screen_name;

        let link = 'https://itk-signup.herokuapp.com';

        let promoHtml = ''
        let promoHidden = true;
        if (window.localStorage.getItem('promoHidden')!=="1")
        {
            promoHidden = false;
            promoHtml = 
               `<div id="promo">
                <div style="display:flex; align-items:center; border-radius:7px; padding:12px; border:1px solid #bbb">
                    <div>Create a newsletter sign up link at <a href="${link}" target="_blank">${link}</a></div>
                    <div id="closePromo" style="cursor:pointer; margin-left: auto; display:flex; justify-content:center; align-items: center; border-radius:28px; height:28px; width:28px; background-color: #deedff">X</div>
                </div><br/>
            </div>`;
        }

        var html = 
           `
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
            </div>`
        em.innerHTML = html;

        this.cacheStatusComponent.Render(em.querySelector('#cacheStatus'));
        this.queryComponent.Render(em.querySelector('#query'));

        if (!promoHidden)
        {
            this.MapEvent(em,"closePromo","click",this.ClosePromo);
            this.promoElement = em.querySelector("#promo");
        }
    }

    async RenderCleanup()
    {
        this.cacheStatusComponent.RenderCleanup();
        this.queryComponent.RenderCleanup();
    }

    ClosePromo = ()=>
    {
        this.promoElement.style.display = 'none';
        window.localStorage.setItem('promoHidden',"1");
    }
}

