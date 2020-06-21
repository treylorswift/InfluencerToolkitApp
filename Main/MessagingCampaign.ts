import * as crypto from 'crypto'
import * as fs from 'fs'

//there is an issue with typescript not realizing that 'Twitter' here is a class,
//so there are some @ts-ignore lines in here to suppress the incorrect warnings
import * as Twitter from 'twitter-lite';

import {TwitterFollower} from './TwitterUser'
import {TwitterUser} from './TwitterUser'
import {AppPermissionLevel} from './TwitterUser'

import {DelaySeconds} from './Delay'

export class MessagingCampaign
{
    message:string
    campaign_id:string
    sort:"influence" | "recent"
    scheduling:"burst" | "spread"
    dryRun:boolean
    count?:number
    filter?:
    {
        tags?:Array<string>
    }

    static fromJSON(json:any):MessagingCampaign
    {
        var campaign = new MessagingCampaign();

        //must have valid message content
        if (!json.message)
        {
            console.log("MessagingCampaign - No message specified, can't continue");
            return null;
        }
        else
        if (typeof(json.message)!=='string')
        {
            console.log("MessagingCampaign - Invalid message specified: " + JSON.stringify(json.message));
            return null;
        }
        campaign.message = json.message;

        //if no campaign_id specified, generate it from the hash of the
        //message content
        campaign.campaign_id = json.campaign_id;
        if (!campaign.campaign_id)
            campaign.campaign_id = crypto.createHash("sha256").update(campaign.message).digest("hex");
        else
        if (typeof(campaign.campaign_id)==='number')
            campaign.campaign_id = (campaign.campaign_id as number).toString();
        else
        if (typeof(campaign.campaign_id)!=='string')
        {
            //any other kind of campaign id in the json is invalid
            console.log("MessagingCampaign - Invalid campaign_id specified: " + JSON.stringify(campaign.campaign_id));
            return null;
        }

        //make sure count, if specified, is a number
        campaign.count = json.count;
        if (campaign.count && typeof(campaign.count)!=='number')
        {
            console.log("MessagingCampaign - Invalid count specified: " + JSON.stringify(campaign.count));
            return null;
        }

        //make sure dryRun, if specified, is a boolean
        if (json.dryRun && typeof(json.dryRun)!=='boolean')
        {
            console.log("MessagingCampaign - Invalid dryRun specified: " + JSON.stringify(json.dryRun));
            return null;
        }
        campaign.dryRun = (json.dryRun===true);

        //make sure 'sort', if specified, is a string and is either 'influence' or 'recent'
        campaign.sort = json.sort;
        if (!campaign.sort)
            campaign.sort = "influence";
        else
        if (typeof(campaign.sort)!=='string' ||
            (campaign.sort!=='influence' && campaign.sort!=='recent'))
        {
            console.log("MessagingCampaign - Invalid sort specified: " + JSON.stringify(campaign.sort));
            return null;
        }

        //make sure 'scheduling', if specified, is a string and is either 'burst' or 'spread'
        campaign.scheduling = json.scheduling;
        if (!campaign.scheduling)
            campaign.scheduling = "burst";
        else
        if (typeof(campaign.scheduling)!=='string' ||
            (campaign.scheduling!=='burst' && campaign.scheduling!=='spread'))
        {
            console.log("MessagingCampaign - Invalid scheduling specified: " + JSON.stringify(campaign.scheduling));
            return null;
        }

        //make sure filter, if specified, is an object
        campaign.filter = json.filter;
        if (campaign.filter && typeof(campaign.filter)!=='object')
        {
            console.log("MessagingCampaign - Invalid filter specified: " + JSON.stringify(campaign.filter));
            return null;
        }

        if (campaign.filter)
        {
            //make sure if filter tags are specified, they are an array
            campaign.filter.tags = json.filter.tags;
            if (campaign.filter.tags && !Array.isArray(campaign.filter.tags))
            {
                console.log("MessagingCampaign - Invalid filter tags specified: " + JSON.stringify(campaign.filter.tags));
                return null;
            }

            if (campaign.filter.tags)
            {
                //make sure each tag is a string. numbers are ok, but are converted to string
                for (var i=0; i<campaign.filter.tags.length; i++)
                {
                    var tag = campaign.filter.tags[i];
                    if (typeof(tag)!=='string')
                    {
                        if (typeof(tag)==='number')
                            campaign.filter.tags[i] = (tag as number).toString();
                        else
                        {
                            console.log("MessagingCampaign - Invalid filter tag specified: " + JSON.stringify(tag));
                            return null;
                        }
                    }
                }
            }
        }

        //whew. campaign is valid

        return campaign;
    }
}

export class MessagingCampaignManager
{
    private user:TwitterUser;

    //@ts-ignore
    private twitter:Twitter;

    private campaign:MessagingCampaign;
    private recipients:Array<TwitterFollower>;

    private nextRecipientIndex:number;
    private totalSent:number;
    private totalToSend:number;
    private messageHistory:MessageHistory;
    
    //@ts-ignore
    constructor(user:TwitterUser, campaign:MessagingCampaign)
    {
        this.user = user;
        this.twitter = user.GetTwitterClient();
        this.campaign = campaign;
        this.recipients = null;


        this.nextRecipientIndex = 0;
        this.totalSent = 0;
        this.totalToSend = 0;

        //dont load the history until we actually need to run the campaign
        this.messageHistory = null;
    }

    //we keep a separate history for dry runs so that they simulate
    //exactly the same way a live run would..
    //later when you want to do a live run.. you don't mistakenly
    //look at the dry run history..
    private GetMessageHistoryFileName()
    {
        let screen_name = this.user.GetScreenName();

        let fileName = `./${screen_name}.messageHistory`;
        if (this.campaign.dryRun===true)
            fileName += '.dryRun.json';
        else
            fileName += '.json';
        return fileName;
    }

    private LoadMessageHistory()
    {
        try
        {
            var json = JSON.parse(fs.readFileSync(this.GetMessageHistoryFileName(),'utf-8'));

            var msgHistory = new MessageHistory();

            //extract the message events
            for (var i=0; i<json.events.length; i++)
            {
                let event = json.events[i] as MessageEventJson;
                msgHistory.events.push({campaign_id:event.campaign_id,recipient:event.recipient, time:new Date(event.time)});
            }

            //extract the campaign / recipient / date maps
            var campaignKeys = Object.keys(json.campaigns);
            for (var i=0; i<campaignKeys.length; i++)
            {
                var recipientMap = json.campaigns[campaignKeys[i]];
                var recipientKeys = Object.keys(recipientMap);

                var newRecipientMap = new Map<string,Date>();
                for (var j=0; j<recipientKeys.length; j++)
                {
                    newRecipientMap.set(recipientKeys[j], new Date(recipientMap[recipientKeys[j]]));
                }

                msgHistory.campaigns.set(campaignKeys[i],newRecipientMap);
            }

            //load succeeded, store it to this.messageHistory
            this.messageHistory = msgHistory;
        }
        catch (err)
        {
            //ENOENT is ok and means we dont have a message history yet. any other error
            //is critical and we must stop
            if (err.code!=="ENOENT")
            {
                console.log("LoadMessageHistory unexpected error: ");
                console.error(err);
                process.exit(-1);
            }

            //if we get here it just means there was no existing message history. so we need to
            //create a new empty one
            this.messageHistory = new MessageHistory();
        }
    }

    private SaveMessageHistory()
    {
        try
        {
            //the events array can convert to json without any special handling
            var json:any = {};
            json.events = this.messageHistory.events;

            //the campaign maps are trickier and can't be written directly, must
            //be converted from Map<>s to basic json maps

            //the campaign map needs to end up looking like this:
            //"campaign_id":
            //{
            //  "recipient_id":<date they were sent this campaign message>
            //}
            //must convert the Map of strings to json maps before writing
            json.campaigns = {};

            this.messageHistory.campaigns.forEach((value:RecipientMap,campaign_id:string,map:CampaignMap):void =>
            {
                json.campaigns[campaign_id] = {};

                this.messageHistory.campaigns.get(campaign_id).forEach((date:Date,recipient_id:string,map:RecipientMap):void =>
                {
                    json.campaigns[campaign_id][recipient_id] = date.toISOString();
                });
            });

            fs.writeFileSync(this.GetMessageHistoryFileName(),JSON.stringify(json,null,2));
        }
        catch (err)
        {
            console.log("Error writing message history, can't continue:");
            console.error(err);
            process.exit(-1);
        }
    }

    private SendMessage = async (recipient:TwitterFollower):Promise<boolean>=>
    {
        //respect the campaign's dryRun setting
        let actuallySendMessage = this.campaign.dryRun!==true;
        
        //loop until we're actually able to send without any response error
        while (1)
        {
            try
            {
                if (actuallySendMessage)
                {
                    let params = 
                    {
                        event:
                        {
                            type: 'message_create',
                            message_create:
                            {
                                target: { recipient_id: recipient.id_str },
                                message_data: { text: this.campaign.message }
                            }
                        }
                    }

                    let response = await this.twitter.post('direct_messages/events/new', params);
                }

                //no response error means the send succeeded, add to the history and save it
                var curDate = new Date();

                //update the message history log with this event
                //the events are used to track how many of our 1000-messages-per-24-hours we've used up
                this.messageHistory.events.push({campaign_id:this.campaign.campaign_id, recipient:recipient.id_str, time:curDate});

                //update the recipient map for this campaign so we remember that this recipient has
                //already received this campaign. we store the current date into the map, which
                //implicitly means that the follower was sent this campaign at that date/time

                //create the recipient map for this campaign if it doesnt exist yet
                var recipientMap = this.messageHistory.campaigns.get(this.campaign.campaign_id);
                if (!recipientMap)
                {
                    recipientMap = new Map<string,Date>();
                    this.messageHistory.campaigns.set(this.campaign.campaign_id, recipientMap);
                }

                //update the entry for this recipient. they received this campaign on 'curDate'
                recipientMap.set(recipient.id_str, curDate);

                //save the history back to wherever its being stored    
                this.SaveMessageHistory();

                return true;
            }
            catch (err)
            {
                //detect read-only application error - we shouldn't get this error because we should have checked
                //permissions by now and forced ourselves into a dry run mode.. but just in case, catch the error so
                //we dont needlessly retry over and over
                if (typeof(err.error)==='string' && (err.error as string).startsWith('Read-only'))
                {
                    console.log(`Send to ${recipient.screen_name} denied, app access is read-only`);
                    return false;
                }
                else
                //handle going over the rate limit..
                if (err && Array.isArray(err.errors) && err.errors[0] && err.errors[0].code===88)
                {
                    console.log('Unexpectedly hit api rate limit, waiting 1 minute before attempting again');
                }
                else
                //handle rejected sends..
                if (err && Array.isArray(err.errors) && err.errors[0] && err.errors[0].code===349)
                {
                    console.log(`Send to ${recipient.screen_name} was denied, they may have unfollowed or blocked you.`);
                    return false;
                }
                else
                {
                    console.log('Unexpected Twitter API response error, retrying in 1 minute:');
                    console.error(err);
                }
                await DelaySeconds(60);
            }
        }
    }

    private ProcessMessages = ()=>
    {
        //have we sent as many as we intended to?
        if (this.totalSent>=this.totalToSend)
        {
            console.log(`MessagingCampaign complete, sent ${this.totalSent} messages`);
            return;
        }

        let recipientIndex = this.nextRecipientIndex;

        if (recipientIndex>=this.recipients.length)
        {
            console.log(`MessagingCampaign complete, no more eligible followers to message, sent ${this.totalSent} of ${this.totalToSend} messages`);
            return;
        }

        //figure out when it is safe to start sending the next message
        //max of 1000 can be sent in 24 hour window
        //campaign scheduling may dictate a more evenly spread distribution of sends
        var delay = this.messageHistory.CalcMillisToWaitUntilNextSend(this.campaign);
        if (delay.timeToWait>0)
        {
            var curDate = new Date();
            var sendDate = new Date(curDate.getTime() + delay.timeToWait);
            if (delay.reason===SendDelayReason.RateLimit)
            {
                console.log(`Hit Twitter Direct Message API Rate Limit at ${curDate.toString()}`);
                console.log(`                     sending next message at ${sendDate.toString()}`);
            }
            else
            {
                console.log(`Spread scheduling will send next message at ${sendDate.toString()}`);
            }
        }


        setTimeout(async ()=>
        {
            var sendOK = await this.SendMessage(this.recipients[recipientIndex]);
            if (sendOK)
            {
                //not every send will succeed, for example if the follower has unfollwed since the last time
                //we cached followers and can't be DM'd anymore
                console.log(`Sent ${this.totalSent+1} of ${this.totalToSend} - ${this.recipients[recipientIndex].screen_name}`);
                this.totalSent++;
            }

            //on to the next recipient, keep on going
            this.nextRecipientIndex++;
            setTimeout(this.ProcessMessages, 0);
        }, delay.timeToWait);
    }

    async Run()
    {
        console.log("Beginning campaign: " + this.campaign.campaign_id);
        
        //if the campaign is a live campaign and we are lacking the necessary permissions, issue a warning and
        //force execution to be dryRun
        if (this.campaign.dryRun!==true && this.user.GetPermissionLevel()!==AppPermissionLevel.ReadWriteDirectMessages)
        {
            this.campaign.dryRun = true;
            console.log(`*** App permissions do not allow direct messages, campaign will be forced to execute as a dry run ***`);
            console.log(`*** Progress will be displayed but messages will not actually be sent ***`);
            console.log(`*** Visit https://apps.twitter.com and update permissions in order to send direct messages ***`);
        }
        else
        if (this.campaign.dryRun===true)
            console.log("*** campaign.dryRun=true, progress will be displayed but messages will not actually be sent ***");

        console.log("Campaign message: " + this.campaign.message);

        //get the users followers
        console.log(`Obtaining followers for ${this.user.GetScreenName()}..`);
        this.recipients = await this.user.GetFollowers();

        //sanity check..
        if (this.recipients.length===0)
        {
            console.log(`${this.user.GetScreenName()} doesn't have any followers, there are no followers to contact`);
            return;
        }

        //need to remove from the followers list any recipients who we have already been contacted in this campaign
        
        //load the message history now so we can determine who has already been contacted
        this.LoadMessageHistory();

        //there is room to optimize here by filtering out these users as they are retreived
        //from storage but for now this is ok
        let numAlreadyContacted = 0;
        for (var i=0; i<this.recipients.length; )
        {
            if (this.messageHistory.HasRecipientRecievedCampaign(this.recipients[i].id_str, this.campaign.campaign_id))
            {
                this.recipients.splice(i,1);
                numAlreadyContacted++;
            }
            else
            {
                i++;
            }
        }

        //if we already contacted some of the followers, spew a little info about that
        if (numAlreadyContacted>0)
        {
            //have we already contacted *everybody*?
            if (this.recipients.length===0)
            {
                console.log(`Already contacted all ${numAlreadyContacted} followers for this campaign, no one left to contact`);
                return;
            }

            console.log(`Already contacted ${numAlreadyContacted} followers for this campaign, limiting campaign to remaining ${this.recipients.length} followers`); 
        }

        //apply any filter tags
        if (this.campaign.filter && this.campaign.filter.tags && this.campaign.filter.tags.length>0)
        {
            //just build a new array of followers who pass the filter test(s)
            let filteredRecipients = new Array<TwitterFollower>();

            let keepTags = this.campaign.filter.tags;

            console.log("Applying filter, only sending to followers matching the following tags: " + keepTags.join(' '));

            //process all tags in lowercase
            for (var k=0; k<keepTags.length; k++)
            {
                keepTags[k] = keepTags[k].toLowerCase();
            }

            //iterate over all recipients, remove those that dont match any of the tags
            for (var i=0; i<this.recipients.length; i++)
            {
                let matched = false;

                //look at each tag in the recipients bio
                let userTags = this.recipients[i].bio_tags;
                for (var j=0; j<userTags.length; j++)
                {
                    //does it match any of the tags we're keeping?
                    for (var k=0; k<keepTags.length; k++)
                    {
                        if (userTags[j].toLowerCase()===keepTags[k])
                        {
                            //matched a tag, move this user to the filtered list
                            filteredRecipients.push(this.recipients[i]);
                            matched = true;
                            break;
                        }
                    }
                    //dont need to keep looking at users tags if we already matched
                    if (matched)
                        break;
                }
            }

            //proceed only with the filtered recipients
            this.recipients = filteredRecipients;
            console.log(`${this.recipients.length} eligible followers contained matching tags`);
        }

        if (this.recipients.length===0)
        {
            console.log("No followers left to contact, try another campaign or filter using different tags");
            return;
        }

        //as cached, the followers are ordered by most recently followed (according to api docs)
        //so we only need to sort if 'influence' is specified
        if (this.campaign.sort==='influence')
        {
            console.log('Sorting followers by influence');
            function influenceSort(a:TwitterFollower,b:TwitterFollower)
            {
                if (a.followers_count>b.followers_count)
                    return -1;
                if (a.followers_count<b.followers_count)
                    return 1;
                return 0;
            }

            this.recipients.sort(influenceSort);
        }
        else
        {
            console.log('Sorting followers by most-recently-followed');
        }

        
        this.totalSent = 0;
        this.totalToSend = this.recipients.length;

        //if the campaign defines a limit, we stay within that limit
        if (this.campaign.count && this.campaign.count<this.totalToSend)
            this.totalToSend = this.campaign.count;
        
        console.log(`Preparing to contact ${this.totalToSend} followers`);

        this.ProcessMessages();
    }
}

export type MessageEvent = {campaign_id:string,recipient:string, time:Date};
type MessageEventJson = {campaign_id:string,recipient:string, time:string};
type RecipientMap = Map<string,Date>;
type CampaignMap = Map<string,RecipientMap>;

enum SendDelayReason
{
    NoDelay,
    Spread,
    RateLimit
}

type SendDelayInfo = {timeToWait:number,reason:SendDelayReason}

export class MessageHistory
{
    events:Array<MessageEvent> = new Array<MessageEvent>();
    campaigns:CampaignMap = new Map<string,RecipientMap>();

    //the time until next send is determined by
    //- history of messages sent thus far
    //- scheduling preference (burst or spread)
    //- twitter rate limit of 1000 messages per 24 hour period
    CalcMillisToWaitUntilNextSend(campaign:MessagingCampaign):SendDelayInfo
    {
        var curTime = new Date();
        let millisIn24Hours = 1000*60*60*24;

        //in initial cases there is no need to wait and we can send with no delay
        let minimumWait = 0;
        let minimumDelayReason = SendDelayReason.NoDelay;

        //spread scheduling can impose a delay after the very first sent message.
        //it will increase the minimumWait and set the minimumDelayReason appropriately (if necessary)
        if (campaign.scheduling==="spread")
        {
            //we want to evenly distribute 1000 messages over a 24 hour period
            let minimumSendInterval = millisIn24Hours / 1000;

            //spread scheduling dictates that the next send should occur minimumSendInterval after the most recently sent message.
            if (this.events.length>0)
            {
                let mostRecentSend = this.events[this.events.length-1].time;
                let timeToSend = new Date(mostRecentSend.getTime() + minimumSendInterval);

                //how much time remains between now and the time at which spread scheduling dictates we should send?
                minimumWait = timeToSend.getTime() - curTime.getTime();
                if (minimumWait>0)
                {
                    //impose minimum delay due to spread scheduling
                    minimumDelayReason = SendDelayReason.Spread;
                }
                else
                {
                    //we're already past the minimum send interval, spread scheduling imposes no additional minimum wait
                    minimumWait = 0;
                }
            }
        }

        //if we haven't yet sent 1000 messages, twitter api rate limits dont apply so we can 
        //we know we can sent the next message without further delay
        if (this.events.length<1000)
            return {timeToWait:minimumWait,reason:minimumDelayReason};

        //we HAVE sent 1000 messages... 

        //look back 1000 messages into the past. when did we send that one?
        //was it more than 24 hours ago? if so, rate limits dont apply and we can send without
        //further delay
        let indexOf1000thMessage = this.events.length - 1000;
        let event = this.events[indexOf1000thMessage];

        var twentyTwentyTwentyFourHoursAgooo = new Date(curTime.getTime() - millisIn24Hours);

        //if the 1000th message in the past is more than 24 hours old, we can send without further delay
        if (event.time.getTime() < twentyTwentyTwentyFourHoursAgooo.getTime())
            return {timeToWait:minimumWait,reason:minimumDelayReason};

        //ok so the 1000th message is within the past 24 hours. the time at which
        //we will be able to send is 24 hours after that message.
        let timeToSend = new Date(event.time.getTime() + millisIn24Hours);

        //how much time remains between now and the time at which api rate limits dictate we can send?
        let timeToWait = timeToSend.getTime() - curTime.getTime();
        if (timeToWait<0)
        {
            console.log(`Unexpected error calculating timeToWait, curTime: ${curTime} - timeToSend: ${timeToSend}`);
            timeToWait = 0;
        }

        //reconcile timeToWait against the minimumWait calculated above (possibly by spread scheduling)
        //its possible api rate limits may not dictate the delay at this point but if api rate limit
        //requires us to wait longer than the minimumWait calculated above, we must wait for the longer
        //timeToWait, and note that the reason is due to api rate limits
        if (timeToWait>minimumWait)
        {
            return {timeToWait:timeToWait, reason:SendDelayReason.RateLimit}
        }
        else
        {
            //api rate limits do not require any delay beyond the minimum already calculated so we just
            //return the minimum delay as it was already calculated
            return {timeToWait:minimumWait,reason:minimumDelayReason};
        }
    }

    HasRecipientRecievedCampaign(id_str:string, campaign_id:string):boolean
    {
        //the campaign map stores, for each recipient, what time they were sent the message
        //it could also store other things like.. the unique conversion link they were sent..
        //whether they have clicked that conversion link yet.. etc

        //get the map which contains info about the recipients who have been
        //contacted by this campaign
        var recipientMap = this.campaigns.get(campaign_id);

        //if none have been contacted yet, then obviously this recipient hasnt
        //been contacted yet
        if (!recipientMap)
            return false;

        var date = recipientMap.get(id_str);
        if (date) return true;
        return false;
    }
}
