import * as RPC from './RPC';
import * as TwitterAuth from './TwitterAuth';

////////////////////
//Client API
//(methods the server can call on the client
///////////////////////

//////////////////////////
//Notify Message Sent
/////////////////////////

export function NotifyMessageSent(args:NotifyMessageSentCall["args"])
{
    new NotifyMessageSentCall(args).CallNoResponse();
}

export class NotifyMessageSentCall extends RPC.Call
{
    method = "NotifyMessageSent"

    constructor(args:NotifyMessageSentCall["args"])
    {
        super();
        this.args = args;
    }

    args: {
        campaignId: string,

        //the person this event is notifying about
        recipientScreenName: string,
        recipientDate: number, //should be convertible to Date via new Date(date)

        //the total we've sent so far
        totalSent:number,
        //how many more remain to be sent
        totalRemaining:number
    }
}

/////////////////
//Notify Message Campaign Started / Stopped
///////////////////

export function NotifyMessageCampaignStarted()
{
    new NotifyMessageCampaignStartedCall().CallNoResponse();
}

export class NotifyMessageCampaignStartedCall extends RPC.Call
{
    method = "NotifyMessageCampaignStarted"
}

export function NotifyMessageCampaignStopped()
{
    new NotifyMessageCampaignStoppedCall().CallNoResponse();
}

export class NotifyMessageCampaignStoppedCall extends RPC.Call
{
    method = "NotifyMessageCampaignStopped"
}