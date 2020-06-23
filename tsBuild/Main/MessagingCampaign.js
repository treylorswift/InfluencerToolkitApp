"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto = require("crypto");
const ClientApi = require("../Shared/ClientApi");
const TwitterUser_1 = require("./TwitterUser");
const TwitterFollowerDB_1 = require("./TwitterFollowerDB");
const Delay_1 = require("./Delay");
const Delay_2 = require("./Delay");
class MessagingCampaign {
    static fromJSON(json) {
        var campaign = new MessagingCampaign();
        //must have valid message content
        if (!json.message) {
            console.log("MessagingCampaign - No message specified, can't continue");
            return null;
        }
        else if (typeof (json.message) !== 'string') {
            console.log("MessagingCampaign - Invalid message specified: " + JSON.stringify(json.message));
            return null;
        }
        campaign.message = json.message;
        //if no campaign_id specified, generate it from the hash of the
        //message content
        campaign.campaign_id = json.campaign_id;
        if (!campaign.campaign_id)
            campaign.campaign_id = crypto.createHash("sha256").update(campaign.message).digest("hex");
        else if (typeof (campaign.campaign_id) === 'number')
            campaign.campaign_id = campaign.campaign_id.toString();
        else if (typeof (campaign.campaign_id) !== 'string') {
            //any other kind of campaign id in the json is invalid
            console.log("MessagingCampaign - Invalid campaign_id specified: " + JSON.stringify(campaign.campaign_id));
            return null;
        }
        //make sure count, if specified, is a number, and if it is a number, make sure it is >0
        campaign.count = json.count;
        if (campaign.count === undefined) //force to null
            campaign.count = null;
        if (campaign.count !== null) {
            if (typeof (campaign.count) !== 'number') {
                console.log("MessagingCampaign - Invalid count specified: " + JSON.stringify(campaign.count));
                return null;
            }
            if (campaign.count <= 0) {
                console.log("MessagingCampaign - campaign.count is 0, rejecting campaign");
                return null;
            }
        }
        //make sure dryRun, if specified, is a boolean
        if (json.dryRun && typeof (json.dryRun) !== 'boolean') {
            console.log("MessagingCampaign - Invalid dryRun specified: " + JSON.stringify(json.dryRun));
            return null;
        }
        campaign.dryRun = (json.dryRun === true);
        //make sure 'sort', if specified, is a string and is either 'influence' or 'recent'
        campaign.sort = json.sort;
        if (!campaign.sort)
            campaign.sort = "influence";
        else if (typeof (campaign.sort) !== 'string' ||
            (campaign.sort !== 'influence' && campaign.sort !== 'recent')) {
            console.log("MessagingCampaign - Invalid sort specified: " + JSON.stringify(campaign.sort));
            return null;
        }
        //make sure 'scheduling', if specified, is a string and is either 'burst' or 'spread'
        campaign.scheduling = json.scheduling;
        if (!campaign.scheduling)
            campaign.scheduling = "burst";
        else if (typeof (campaign.scheduling) !== 'string' ||
            (campaign.scheduling !== 'burst' && campaign.scheduling !== 'spread')) {
            console.log("MessagingCampaign - Invalid scheduling specified: " + JSON.stringify(campaign.scheduling));
            return null;
        }
        //make sure filter, if specified, is an object
        campaign.filter = json.filter;
        if (campaign.filter && typeof (campaign.filter) !== 'object') {
            console.log("MessagingCampaign - Invalid filter specified: " + JSON.stringify(campaign.filter));
            return null;
        }
        if (campaign.filter) {
            //make sure if filter tags are specified, they are an array
            campaign.filter.tags = json.filter.tags;
            if (campaign.filter.tags && !Array.isArray(campaign.filter.tags)) {
                console.log("MessagingCampaign - Invalid filter tags specified: " + JSON.stringify(campaign.filter.tags));
                return null;
            }
            if (campaign.filter.tags) {
                //make sure each tag is a string. numbers are ok, but are converted to string
                for (var i = 0; i < campaign.filter.tags.length; i++) {
                    var tag = campaign.filter.tags[i];
                    if (typeof (tag) !== 'string') {
                        if (typeof (tag) === 'number')
                            campaign.filter.tags[i] = tag.toString();
                        else {
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
exports.MessagingCampaign = MessagingCampaign;
class MessagingCampaignManager {
    //@ts-ignore
    constructor(user, campaign) {
        this.SendMessage = async (recipient) => {
            //respect the campaign's dryRun setting
            let actuallySendMessage = this.campaign.dryRun !== true;
            //loop until we're actually able to send without any response error
            while (1) {
                try {
                    if (actuallySendMessage) {
                        let params = {
                            event: {
                                type: 'message_create',
                                message_create: {
                                    target: { recipient_id: recipient.idStr },
                                    message_data: { text: this.campaign.message }
                                }
                            }
                        };
                        let response = await this.twitter.post('direct_messages/events/new', params);
                    }
                    //no response error means the send succeeded, add to the history and save it
                    var curDate = new Date();
                    this.messageHistory.StoreMessageEvent({
                        campaign_id: this.campaign.campaign_id,
                        recipient: recipient.idStr,
                        time: curDate
                    });
                    this.totalSent++;
                    console.log(`Sent message #${this.totalSent} to ${recipient.screenName}`);
                    //notify the client of the send
                    ClientApi.NotifyMessageSent({
                        campaignId: this.campaign.campaign_id,
                        recipientScreenName: recipient.screenName,
                        recipientDate: curDate.getTime(),
                        totalRemaining: 0,
                        totalSent: this.totalSent
                    });
                    return true;
                }
                catch (err) {
                    //detect read-only application error - we shouldn't get this error because we should have checked
                    //permissions by now and forced ourselves into a dry run mode.. but just in case, catch the error so
                    //we dont needlessly retry over and over
                    if (typeof (err.error) === 'string' && err.error.startsWith('Read-only')) {
                        console.log(`Send to ${recipient.screenName} denied, app access is read-only`);
                        return false;
                    }
                    else 
                    //handle going over the rate limit..
                    if (err && Array.isArray(err.errors) && err.errors[0] && err.errors[0].code === 88) {
                        console.log('Unexpectedly hit api rate limit, waiting 1 minute before attempting again');
                    }
                    else 
                    //handle rejected sends..
                    if (err && Array.isArray(err.errors) && err.errors[0] && err.errors[0].code === 349) {
                        console.log(`Send to ${recipient.screenName} was denied, they may have unfollowed or blocked you.`);
                        return false;
                    }
                    else {
                        console.log('Unexpected Twitter API response error, retrying in 1 minute:');
                        console.error(err);
                    }
                    await Delay_1.DelaySeconds(60);
                }
            }
        };
        this.user = user;
        this.twitter = user.GetTwitterApi();
        this.campaign = campaign;
        this.totalSent = 0;
        this.messageHistory = null;
    }
    async Run() {
        console.log("Beginning campaign: " + this.campaign.campaign_id);
        //if the campaign is a live campaign and we are lacking the necessary permissions, issue a warning and
        //force execution to be dryRun
        if (this.campaign.dryRun !== true && this.user.GetPermissionLevel() !== TwitterUser_1.PermissionLevel.ReadWriteDirectMessages) {
            this.campaign.dryRun = true;
            console.log(`*** App permissions do not allow direct messages, campaign will be forced to execute as a dry run ***`);
            console.log(`*** Progress will be displayed but messages will not actually be sent ***`);
            console.log(`*** Visit https://apps.twitter.com and update permissions in order to send direct messages ***`);
        }
        else if (this.campaign.dryRun === true)
            console.log("*** campaign.dryRun=true, progress will be displayed but messages will not actually be sent ***");
        console.log("Campaign message: " + this.campaign.message);
        //we query for 1000 results at a time from the DB and move through them one by one
        //until we're done
        let maxQuerySizePerLoop = 1000;
        //setup message history for this campaign
        this.messageHistory = new TwitterFollowerDB_1.MessageHistory(this.campaign);
        let tags = null;
        if (this.campaign.filter && this.campaign.filter.tags)
            tags = this.campaign.filter.tags;
        //the campaign may or may not specify a 'count' to limit how many followers
        //get contacted. if it doesn't specify a count, we will attempt to go all the way through
        //the entire follower list
        let limitByCount = false;
        let count = 0;
        if (this.campaign.count !== null) {
            limitByCount = true;
            count = this.campaign.count;
        }
        while (1) {
            let queryLimit = maxQuerySizePerLoop;
            //dont query more than count (if specified) asks for..
            if (limitByCount && queryLimit > count)
                queryLimit = count;
            //note that no offset is used because as messages are sent,
            //the query itsef will, upon the next invocation, not include
            //the people who were sent messages before
            let q = {
                campaignId: this.campaign.campaign_id,
                includeContacted: false,
                sort: this.campaign.sort,
                tags: tags,
                limit: queryLimit,
                offset: 0,
                useDryRunMessageHistory: this.campaign.dryRun
            };
            try {
                let results = await this.user.GetFollowerCache().Query(q);
                if (results.length === 0) {
                    //no more left to send, we're done
                    return;
                }
                for (var i = 0; i < results.length; i++) {
                    //figure out when it is safe to start sending the next message
                    //max of 1000 can be sent in 24 hour window
                    //campaign scheduling may dictate a more evenly spread distribution of sends
                    var delay = this.messageHistory.CalcMillisToWaitUntilNextSend(this.campaign);
                    if (delay.millisToWait > 0) {
                        var curDate = new Date();
                        var sendDate = new Date(curDate.getTime() + delay.millisToWait);
                        if (delay.reason === TwitterFollowerDB_1.SendDelayReason.RateLimit) {
                            console.log(`Hit Twitter Direct Message API Rate Limit at ${curDate.toString()}`);
                            console.log(`                     sending next message at ${sendDate.toString()}`);
                        }
                        else {
                            console.log(`Spread scheduling will send next message at ${sendDate.toString()}`);
                        }
                    }
                    //wait for delay
                    await Delay_2.DelayMilliseconds(delay.millisToWait);
                    var sendOK = await this.SendMessage(results[i]);
                    if (sendOK) {
                        //nothing to really do if send fails, errors will be printed by SendMessage
                    }
                }
                //ok that batch is done, check against the count limitation (if it exists)
                if (this.campaign.count !== undefined && this.campaign.count !== null) {
                    this.campaign.count -= results.length;
                    if (this.campaign.count <= 0) {
                        //we're done
                        return;
                    }
                }
            }
            catch (err) {
                console.log('Error in GetFollowerCache().Query(), aborting');
                console.error(err);
                return;
            }
        }
    }
}
exports.MessagingCampaignManager = MessagingCampaignManager;
//# sourceMappingURL=MessagingCampaign.js.map