import * as RPC from "../Shared/RPC.js"
import * as ServerApi from "../Shared/ServerApi.js"
import * as ClientApi from "../Shared/ClientApi.js"

import { DOMComponent } from "./DOMComponent.js"
import { HomePage } from "./HomePage.js"

//only support a single / default messaging campaign from this UI currently
let g_campaignId = 'default'

export class QueryComponent extends DOMComponent
{
    containerElement:HTMLElement = null;
    resultsDiv:HTMLElement = null;
    sortElement:HTMLInputElement = null;
    tagsElement:HTMLInputElement = null;
    messageElement:HTMLInputElement = null;
    sendButton:HTMLButtonElement = null;
    sendLimit:HTMLInputElement = null;
    sandboxCheckbox:HTMLInputElement = null;

    //if they update the query ui before a previous query has finished, we wait
    //for the previous query to finish.
    //we keep a queue of 1 query (representing the most recent query attempt) to run
    //after the completion of the previous query.
    queryRunning:boolean = false;
    deferredQuery:ServerApi.FollowerCacheQuery = null;
    parent:HomePage = null;

    //by default we show only followers who we haven't contacted
    contactedVisible:boolean = false;
    toggleContactedButton:HTMLElement = null;

    campaignRunning:boolean = false;
    
    constructor(parent:HomePage)
    {
        super(parent);
        this.parent = parent;
    }

    RunQuery = async ()=>
    {
        var sort = this.sortElement.value as ServerApi.MessagingCampaignSortType;
        let tags = this.tagsElement.value.split(' ');

        let query = 
        {
            campaignId:g_campaignId,
            tags:tags,
            sort:sort,
            offset:0,
            limit:50,
            includeContacted:this.contactedVisible,
            useDryRunMessageHistory:this.sandboxCheckbox.checked
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
                let results = await ServerApi.QueryFollowerCache(query);

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
    
    RenderResults(results:ServerApi.QueryFollowerCacheResponse)
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

    ConvertUIStateToCampaign():ServerApi.MessagingCampaign
    {
        var sort = this.sortElement.value as ServerApi.MessagingCampaignSortType;
        let tags = this.tagsElement.value.split(' ');
        let count = this.GetSendCount();

        let campaign:ServerApi.MessagingCampaign =
        {
            message:this.messageElement.value,
            campaign_id:g_campaignId,
            sort:sort,
            scheduling:"burst",
            dryRun:this.sandboxCheckbox.checked,
            count:count,
            filter:
            {
                tags:tags
            }
        }

        return campaign;
    }



    RunCampaign = async () =>
    {
        if (this.campaignRunning)
        {
            this.DisplayModalMessage("Sending in progress, please wait for it to finish.");
            return;
        }

        let campaign = this.ConvertUIStateToCampaign();

        this.campaignRunning = true;
        this.sendButton.disabled = true;

        let startOK = await ServerApi.RunMessagingCampaign(campaign);
        if (startOK.success!==true)
        {
            this.DisplayModalMessage('Unable to start sending messages: ' + startOK.errorMessage);
            this.campaignRunning = false;
            return;
        }
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

    SandboxCheckboxChanged = () =>
    {
        if (!this.sandboxCheckbox.checked)
        {
            this.DisplayModalMessage('<center>With "Sandbox" unchecked, clicking "Send Messages" will send real direct messages.<br/><br/>Be careful!</center>');
        }
        this.SaveUIStateToLocalStorage();
        this.RunQuery();
    }

    SendLimitChanged = () =>
    {
        let count = this.GetSendCount();
        if (count!==null)
        {
            let msg = `Send To ${count} Follower`;
            if (count>1)
                msg += 's';

            this.sendButton.innerHTML = msg;
        }
        else
            this.sendButton.innerHTML = `Send To All Followers`;

        this.SaveUIStateToLocalStorage();
    }

    SortChanged = ()=>
    {
        this.SaveUIStateToLocalStorage();
        this.RunQuery();
    }

    TagsChanged = ()=>
    {
        this.SaveUIStateToLocalStorage();
        this.RunQuery();
    }

    UpdateContactedButton(showContacted:boolean)
    {
        if (showContacted)
        {
            this.toggleContactedButton.innerHTML = "Show Contacted"
        }
        else
        {
            this.toggleContactedButton.innerHTML = "Hide Contacted"
        }
    }

    ToggleContacted = ()=>
    {
        this.contactedVisible = !this.contactedVisible;
        this.UpdateContactedButton(this.contactedVisible);
        this.RunQuery();
        this.SaveUIStateToLocalStorage();
    }

    SaveUIStateToLocalStorage()
    {
        let uiState =
        {
            message:this.messageElement.value,
            sort:this.sortElement.value,
            sandbox:this.sandboxCheckbox.checked,
            sendLimit:this.sendLimit.value,
            tags:this.tagsElement.value,
            showContacted:this.contactedVisible
        }

        localStorage.setItem('uiState',JSON.stringify(uiState));
    }

    LoadUIStateFromLocalStorage()
    {
        try
        {
            let c = JSON.parse(localStorage.getItem('uiState'));

            try { this.messageElement.value = c.message; } catch (err) {}
            try { this.sortElement.value = c.sort; } catch (err) {}
            try { this.sandboxCheckbox.checked = c.sandbox; } catch (err) {}
            try { this.sendLimit.value = c.sendLimit; } catch (err) {}
            try { this.tagsElement.value = c.tags; } catch (err) {}
            try { this.contactedVisible = c.showContacted; } catch (err) {}

            this.UpdateContactedButton(this.contactedVisible);
        }
        catch (err)
        {
            console.log("LoadUIStateFromLocalStorage error:");
            console.error(err);

            //init ui
            this.messageElement.value = this.GetDefaultMessage();
            this.sortElement.value = 'influence';
            this.sandboxCheckbox.checked = true;
            this.sendLimit.value = '';
            this.tagsElement.value = '';
            this.contactedVisible = false;
            this.UpdateContactedButton(this.contactedVisible);
        }

        this.RunQuery();
    }

    SetVisible(visible:boolean)
    {
        if (visible)
            this.containerElement.style.display = 'block';
        else
            this.containerElement.style.display = 'none';
    }

    GetDefaultMessage():string
    {
        return `Hey there, are you interested in receiving my newsletter?

You can sign up at https://itk-signup.herokuapp.com/${this.parent.userLogin.screen_name}`;
    }

    async Render(em:HTMLElement)
    {
    
        let html = 
           `<div>
                Compose a message to your followers:<br/>
                <div style="display:flex; align-items:center">
                    <textarea id="message" spellcheck="false" class="messageTextArea" type="text">${this.GetDefaultMessage()}</textarea>
                </div>
                <br/>
                <div style="display:flex; justify-content:flex-start; align-items:flex-end">
                    <div>
                        <div>Sort</div>
                        <select id="sortSelect">
                            <option value="influence">Most Followers</option>
                            <option value="recent">Recently Followed</option>
                        </select>
                    </div>
                    <div style="margin-left:16px">
                        <div>Filter</div>
                        <input id="tags" spellcheck="false" style="width:260px" type="text" placeholder="Twitter bio tags eg. health love dad">
                    </div>
                    <div style="margin-left:16px">
                        <div>Send Limit</div>
                        <input id="sendLimit" style="width:40px; margin-right:8px" type="text" placeholder="" value="1">
                    </div>
                    <div style="margin-left: 16px; flex-grow:1"><input style="margin-left:0" id="sandboxCheckbox" type="checkbox" checked>Sandbox<br/><button id="sendButton" style="width:100%">Send To 1 Follower</button></div>
                </div>
                <br/>

            </div>
            <div class="followerHeaderRow">
                <div class="followerIcon">&nbsp</div>
                <div class="followerName">Name</div>
                <div class="followerScreenName">Twitter Handle</div>
                <div class="followerFollowersCount">Followers</div>
                <div class="followerContacted">Contacted</div>
                <div style="margin-left:auto; padding-right:4px; width:130px; text-align:right"><button id="toggleContactedButton">Show Contacted</button></div>
            </div>
            <div id="results"></div>
        `;
        em.innerHTML = html;
        this.containerElement = em;
        this.sortElement = em.querySelector('#sortSelect');
        this.tagsElement = em.querySelector('#tags');
        this.messageElement = em.querySelector('#message');
        this.sandboxCheckbox = em.querySelector('#sandboxCheckbox');

        this.toggleContactedButton = em.querySelector('#toggleContactedButton');
        this.sendButton = em.querySelector('#sendButton');
        this.sendLimit = em.querySelector('#sendLimit');

        this.resultsDiv = em.querySelector('#results');

        this.MapEvent(em, "sortSelect", "change", this.SortChanged);
        this.MapEvent(em, "tags", "input", this.TagsChanged);
        this.MapEvent(em, "sendLimit", "input", this.SendLimitChanged);
        this.MapEvent(em, "sandboxCheckbox", "change", this.SandboxCheckboxChanged);
        this.MapEvent(em, 'toggleContactedButton', 'click',this.ToggleContacted);
        this.MapEvent(em, "sendButton", "click", this.RunCampaign);

        this.LoadUIStateFromLocalStorage();

        /////////////////
        //sign up to handle message campaign stuff
        ////////////////
        RPC.SetHandler(ClientApi.NotifyMessageCampaignStartedCall, async (c:ClientApi.NotifyMessageCampaignStartedCall):Promise<RPC.Response> =>
        {
            this.campaignRunning = true;
            return {success:true};
        });

        RPC.SetHandler(ClientApi.NotifyMessageCampaignStoppedCall, async (c:ClientApi.NotifyMessageCampaignStoppedCall):Promise<RPC.Response> =>
        {
            this.sendButton.disabled = false;
            this.campaignRunning = false;
            return {success:true};
        });

        RPC.SetHandler(ClientApi.NotifyMessageSentCall, async (c:ClientApi.NotifyMessageSentCall):Promise<RPC.Response> =>
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
                    },1500);
                }
            }
            return {success:true};
        });
    }


    async RenderCleanup()
    {
        //dont need these notifications anymore
        RPC.SetHandler(ClientApi.NotifyMessageCampaignStartedCall, null);
        RPC.SetHandler(ClientApi.NotifyMessageCampaignStoppedCall, null);
        RPC.SetHandler(ClientApi.NotifyMessageSentCall, null);
    }

}
