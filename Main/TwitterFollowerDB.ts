//there is an issue with typescript not realizing that 'Twitter' here is a class,
//so there are some @ts-ignore lines in here to suppress the incorrect warnings
import * as Twitter from 'twitter-lite';
import * as crypto from 'crypto';

import {DelaySeconds} from './Delay'

import {TwitterFollower} from './TwitterUser';
import * as DB from 'better-sqlite3';
import {MessageEvent, MessagingCampaign} from './MessagingCampaign'
import {FollowerCacheStatusEnum} from '../Shared/IPCAPI'
import {FollowerCacheQuery,FollowerCacheQueryResult} from '../Shared/IPCAPI'

export type TwitterFollower = 
{
    id_str:string
    screen_name:string
    bio_tags:Array<string>
    followers_count:number
}

//the db architecture is gonna have to look something like this
//
//followers table - id_str, screen name, follower count (indexed column), bio/description, etc
//
//tags table - tag, id_str
//
//to do the query, you would do something like this
//
//select * from tags table where tag equals [tag a, tag b, tag c]
//that will tell you all users who matched the tags
//
//you then have to join that with
//
//select * from followers table ORDER BY follower count
//
//what happens if someone changes their bio later?
//we need to be able to detect that change to remove the non-existing tags that remain in the tags table, and
//also add new tags that were not there before. this means we have to store their bio/description and 
//when we notice that its changed, remove all entries in the tag table that match their id.. then add new entries for the tags in their new bio

//we keep a row in the Tasks table as we are pulling in followers so we know how far along we are (and, coming back later, we can see whether we finished or
//need to resume)
type FollowerTaskProgress = {cursor:string, completionPercent:number, startTime:Date, finishTime:Date}

export class TwitterDB
{
    private db:DB = null;
    
    GetDB():DB { return this.db; }

    Init():boolean
    {
        this.db = new DB('TwitterFollowerDB.db');//, { verbose: console.log });

        //configure for WAL mode which gets a performance boost
        this.db.pragma('journal_mode = WAL');

        try
        {
            //make sure the essential tables are initialized

            //TwitterUsers tracks any/all the users on twitter we might be concerned with
            //
            //in theory screen_name should be unique, and would be unique in twitter's own databases,
            //but since we are only incrementally replicating parts of their DB, it's possible people could
            //change screen names and our db would not be aware of it until some later time.. the main
            //unique id that will never change is id_str. so that is the only field marked UNIQUE in the table
            let createUsers = this.db.prepare(`
                CREATE TABLE IF NOT EXISTS TwitterUsers (
                    id_str TEXT NOT NULL UNIQUE PRIMARY KEY,
                    screen_name TEXT NOT NULL,
                    name TEXT NOT NULL,
                    verified INTEGER,
                    statuses_count INTEGER,
                    friends_count INTEGER,
                    followers_count INTEGER,
                    description TEXT NOT NULL,
                    profile_image_url_https TEXT
                );
            `);

            createUsers.run();

            //create an index on the followers_count so they will sort by followers quickly
            let createFollowersCountIndex = this.db.prepare(`
                CREATE INDEX IF NOT EXISTS TwitterFollowersCountIndex ON TwitterUsers (
	                "followers_count"
                );
            `);

            createFollowersCountIndex.run();

            //tags just establishes which tags are present in
            //which users bio. the description/bio field in the TwitterUser table is checked for changes
            //whenever a user is added / re-added to the TwitterUsers table. if their description changes,
            //all their tags previously in the Tags table are removed.. and then new tags are created for
            //the new description
            //
            //the unique constraint ensures we dont store the same tag more than once for the same user
            //(if a user has the same word in their bio in multiple places for example)
            let createTags = this.db.prepare(`
                CREATE TABLE IF NOT EXISTS TwitterTags (
                    tag TEXT NOT NULL COLLATE NOCASE,
                    id_str TEXT NOT NULL,
                    UNIQUE(tag,id_str) ON CONFLICT IGNORE
                );
            `);

            createTags.run();

            //create an index on the tags so they can be matched quickly
            let createTagIndex = this.db.prepare(`
                CREATE INDEX IF NOT EXISTS TwitterTagIndex ON TwitterTags (
            	    "tag"
                );
            `);
            createTagIndex.run();

            //establishes who follows who
            //id_str is the one who follows id_str_followee
            //
            //prior to (re)building follower cache data for any user, all rows
            //from this table where followee===user are removed.. (ie, all records of ppl
            //following that user are removed because we are about to rebuild that information)

            //'age' is an integer that comes from the ordering of results from the twitter api
            //according to api docs, the follower results are returned in order of how recently
            //the user followed. so the first one in the list is the newest follower, and this DB
            //entry here, the age of that follow would be 0. as you dig deeper into the follower list,
            //the age gets older. the number itself doesnt represent any period of time, it's just
            //used for ordering them

            //the unique constraint ensures we wont accidently create duplicate rows that store
            //the same follower-followee relationship more than once
            let createFollowers = this.db.prepare(`
                CREATE TABLE IF NOT EXISTS TwitterFollowers (
                    id_str TEXT NOT NULL,
                    id_str_followee TEXT NOT NULL,
                    age INTEGER,
                    UNIQUE(id_str,id_str_followee) ON CONFLICT IGNORE
                );
            `);

            createFollowers.run();


            //we keep track of which users we have built up follower info for
            //As we are building up the db we keep track of our progress (so that we can recover where we left off)
            //we also note the time we start and the time we end.
            //
            //it is assumed that if a task row does not have a finish time, the task is either in progress (currently)
            //or it was started at some time in the past and never finished. the other info in the row can be used
            //to resume the task.
            let createFollowerTasks = this.db.prepare(`
                CREATE TABLE IF NOT EXISTS TwitterFollowerTasks (
                    id_str TEXT NOT NULL UNIQUE PRIMARY KEY,
                    cursor TEXT DEFAULT "",
                    completion_percent INTEGER DEFAULT 0,
                    start_time INTEGER DEFAULT -1,
                    finish_time INTEGER DEFAULT -1
                );
            `);
            
            createFollowerTasks.run();

            //establishes who has been contacted by which campaign(s)
            //the 'date' is the time when the user was contacted, and
            //being an integer, equates to javascript Date().getTime()
            let createMessageHistory = this.db.prepare(`
                CREATE TABLE IF NOT EXISTS TwitterMessageHistory (
                    campaign_id TEXT NOT NULL,
                    id_str TEXT NOT NULL,
                    date INTEGER
                );
            `);

            createMessageHistory.run();

            //the dry run message history is the same as the normal
            //message history but it is stored separately so that
            //the two histories dont conflict with each other when
            //testing dry runs and subsequently doing live runs
            let createDryRunMessageHistory = this.db.prepare(`
                CREATE TABLE IF NOT EXISTS TwitterDryRunMessageHistory (
                    campaign_id TEXT NOT NULL,
                    id_str TEXT NOT NULL,
                    date INTEGER
                );
            `);

            createDryRunMessageHistory.run();

        }
        catch (err)
        {
            console.log("Error initializing TwitterDB:");
            console.log(err);
            return false;
        }
    }

}

export type FollowerCacheStatus =
{
    status:FollowerCacheStatusEnum,
    completionPercent:number
}


//this class manages the process of actually downloading the followers as well
//as querying that data later
export abstract class TwitterFollowerCacheBase
{
    //@ts-ignore
    twitter:Twitter = null;
    screen_name:string = null;
    id_str:string = null;
    totalExpectedFollowers:number = 0;
    buildInProgress:boolean = false;

    //@ts-ignore
    async Init(twitter:Twitter, screen_name:string):Promise<boolean>
    {
        console.log('TwitterFollowerCache forcing screen_name to balajis');
        screen_name = 'balajis'
        try
        {
            //first get the profile to determine the expected follower count
            let showResult = await twitter.get("users/show", {screen_name:screen_name, include_entities:false, stringify_ids:true});

            this.twitter = twitter;
            this.screen_name = screen_name;
            this.id_str = showResult.id_str;

            this.totalExpectedFollowers = showResult.followers_count;

            return true;
        }
        catch (err)
        {
            console.log("Error in TwitterFollowerCacheBase.Init:");
            console.error(err);
            return false;
        }
    }

    GetStatus():FollowerCacheStatus
    {
        //we're not in progress.. what happened last time, did we finish?
        let p = this.GetProgress();

        //no record of any cache operation.. must have never done one. so none exists
        if (!p)
            return {status:FollowerCacheStatusEnum.None, completionPercent:0};

        //if we're actively caching now, say so.. include completion percent
        if (this.buildInProgress)
            return {status:FollowerCacheStatusEnum.InProgress, completionPercent:p.completionPercent};
        
        //there's a record but its not finished. Incomplete
        if (!p.finishTime)
            return {status:FollowerCacheStatusEnum.Incomplete, completionPercent:p.completionPercent}
        
        //there is a record, it shows complete. 
        return {status:FollowerCacheStatusEnum.Complete, completionPercent:p.completionPercent};
    }

   
    abstract GetProgress():FollowerTaskProgress

    abstract GetNumStoredFollowers():number;

    abstract BeginWriting();
    abstract WriteFollowers(followers:Array<{follower:any, dbIndex:number}>); //'follower' is what comes right out of the twitter api pipe
    abstract SaveProgress(p:FollowerTaskProgress);

    abstract async Query(q:FollowerCacheQuery):Promise<Array<FollowerCacheQueryResult>>;

    //@ts-ignore
    async Build():Promise<boolean>
    {
        try
        {
            this.buildInProgress = true;

            var startTime = new Date();
            console.log(`Retreiving ${this.totalExpectedFollowers} followers for ${this.screen_name}..`);

            let cursor = '';
            var totalFollowersRetreived = 0;

            //check to see if some prior build was in progress
            let priorProgress = this.GetProgress();

            //did that prior build ever finish?
            if (priorProgress && priorProgress.finishTime===null)
            {
                //pickup where we left off
                cursor = priorProgress.cursor;
                totalFollowersRetreived = this.GetNumStoredFollowers();

                console.log("Resuming prior follower cache operation");
                console.log("Final follower count may not match expected number since followers may have changed since the prior cache operation");
                console.log("Total retreived so far: " + totalFollowersRetreived);
            }
            else
            {
                //either there was no prior progress, or the prior progress did finish, which means
                //we want to actually rebuild from scratch
                this.BeginWriting();
            }

            while (1)
            {
                //unfortunately rate limiting imposes some bottlenecks here
                //we can only retreive 5000 follower id's at a time, and we can only make
                //15 calls in a 15 minute window. 

                //must stringify the twitter ids cause javascript cant handle the numbers
                let options:any = {stringify_ids:true, screen_name:this.screen_name};

                //include the cursor if it's been defined
                if (cursor)
                    options.cursor = cursor;

                let idsResult;
                while (1)
                {
                    try
                    {
                        idsResult = await this.twitter.get("followers/ids", options);
                        break;
                    }
                    catch (err)
                    {
                        //need to handle going over the rate limit..
                        if (err && Array.isArray(err.errors) && err.errors[0] && err.errors[0].code===88)
                        {
                            console.log('Hit api rate limit, waiting 1 minute before attempting again');
                        }
                        else
                        {
                            console.log('Unexpected Twitter API response error, retrying in 1 minute:');
                            console.error(err);
                        }
                        await DelaySeconds(60);
                    }
                }

                //now in batches of 100 we request full profile info for each of these users
                let numProcessed = 0;
                let totalToProcess = idsResult.ids.length;

                while (numProcessed<totalToProcess)
                {
                    var numToProcess = totalToProcess;

                    const MAX_PER_REQUEST = 100; //api limit
                    if (numToProcess>MAX_PER_REQUEST)
                        numToProcess = MAX_PER_REQUEST;

                    const userIds = idsResult.ids.slice(numProcessed, numProcessed+numToProcess).join(',');

                    let usersResult;
                    while (1)
                    {
                        try
                        {
                            usersResult = await this.twitter.post('users/lookup', {user_id:userIds});
                            break;
                        }
                        catch (err)
                        {
                            //need to handle going over the rate limit..
                            if (err && Array.isArray(err.errors) && err.errors[0] && err.errors[0].code===88)
                            {
                                console.log('Hit api rate limit, waiting 1 minute before attempting again');
                            }
                            else
                            {
                                console.log('Unexpected Twitter API response error, retrying in 1 minute:');
                                console.error(err);
                            }
                            await DelaySeconds(60);
                        }
                    }

                    for (var i=0; i<usersResult.length; i++)
                    {
                        //WriteFollowers accepts an array to be written.. (you can get better performance combining
                        //writes into a larger transaction)

                        //start with 1 in the array.. add up to 1 more..
                        let followersToWrite:Array<{follower:any,dbIndex:number}> = [
                            {follower:usersResult[i], dbIndex:totalFollowersRetreived}
                        ];
                        
                        totalFollowersRetreived++;

                        //can we do 2 at a time? batching to sqlite helps..
                        if (i+1<usersResult.length)
                        {
                            i++;
                            followersToWrite.push( {follower:usersResult[i], dbIndex:totalFollowersRetreived} );
                            totalFollowersRetreived++;
                        }

                        await this.WriteFollowers(followersToWrite);
                    }

                    numProcessed += numToProcess;

                    //save progress between batches of 100
                    //because of circumstances related to resuming a download at a later time,
                    //the number we expect to download might not actually be the number we download. most likely,
                    //the number we download might end up as less than the expected total.. but just in case the
                    //math is off, enforce the idea that so long as we are 'inProgress' pct, shouldn't be over 99
                    let pct = 100.0 * this.GetNumStoredFollowers() / this.totalExpectedFollowers;
                    if (pct>99)
                        pct = 99;

                    let progress:FollowerTaskProgress = {
                        cursor:cursor, //we'll resume on this same page if we need to
                        completionPercent:pct,
                        startTime:startTime,
                        finishTime:null
                    }
                    this.SaveProgress(progress);
                }

                //need to save progress.. are we totally finished?
                var finishedLastPage = idsResult.next_cursor_str==="0";

                if (finishedLastPage)
                {
                    //finished the last page? store final progress, break out of the loop
                    let progress:FollowerTaskProgress = {
                        cursor:'',
                        completionPercent:100,
                        startTime:startTime,
                        finishTime:new Date()
                    }
                    this.SaveProgress(progress);
                    break;
                }

                //because of circumstances related to resuming a download at a later time,
                //the number we expect to download might not actually be the number we download. most likely,
                //the number we download might end up as less than the expected total.. but just in case the
                //math is off, enforce the idea that so long as we are 'inProgress' pct, shouldn't be over 99
                let pct = 100.0 * this.GetNumStoredFollowers() / this.totalExpectedFollowers;
                if (pct>99)
                    pct = 99;

                let progress:FollowerTaskProgress = {
                    cursor:idsResult.next_cursor_str, //we'll resume on this next page if we need to
                    completionPercent:pct,
                    startTime:startTime,
                    finishTime:null
                }
                this.SaveProgress(progress);

                //advance cursor to next page
                cursor = idsResult.next_cursor_str;
 
                //spit out some progress
                let numStored = this.GetNumStoredFollowers();

                console.log(`Retreived ${numStored} of ${this.totalExpectedFollowers}..`);
            }


            //spit out final totals
            let numStored = this.GetNumStoredFollowers();
            console.log(`Finished retreiving followers for ${this.screen_name}, total received: ${numStored} - total expected: ${this.totalExpectedFollowers}`);
        }
        catch (err)
        {
            console.log("TwitterUser - BuildFollowerCache error:");
            console.error(err);
            this.buildInProgress = false;
            return false;
        }

        this.buildInProgress = false;
        return true;
    }
}

export enum SendDelayReason
{
    NoDelay,
    Spread,
    RateLimit
}

type SendDelayInfo = {millisToWait:number,reason:SendDelayReason}

export class MessageHistory
{
    twitterDB:TwitterDB;
    db:DB;

    campaign:MessagingCampaign;
    tableName:string;

    //we keep the most recently sent 1000 messages in memory because we need to refer to those
    //in order to properly schedule sends
    events:Array<MessageEvent>;

    constructor(campaign:MessagingCampaign)
    {
        this.campaign = campaign;

        this.twitterDB = new TwitterDB();
        this.twitterDB.Init();
        this.db = this.twitterDB.GetDB();
        this.events = new Array<MessageEvent>();

        this.tableName = 'TwitterMessageHistory';
        if (campaign.dryRun===true)
            this.tableName = 'TwitterDryRunMessageHistory';
        
        //get the most recent 1000 messages sent
        try
        {
            let initCacheCmd = this.db.prepare(`SELECT * FROM ${this.tableName} WHERE campaign_id=? ORDER BY date DESC LIMIT 1000`);
            let result = initCacheCmd.all([this.campaign.campaign_id]);

            for (var i=0; i<result.length; i++)
            {
                this.events.push({campaign_id:result[i].campaign_id,recipient:result[i].id_str,time:new Date(result[i].date)});
            }
        }
        catch (err)
        {
            console.log("Error initializing MessageHistory in-mem cache");
            console.error(err);
        }
    }

    StoreMessageEvent(e:MessageEvent):boolean
    {
        try
        {
            if (e.campaign_id!==this.campaign.campaign_id)
            {
                console.log("StoreMessageEvent - incorrect campaign id");
                return false;
            }

            let storeCmd = this.db.prepare(`INSERT INTO ${this.tableName} VALUES(?,?,?)`);

            storeCmd.run([e.campaign_id, e.recipient, e.time.getTime()]);

            //store this into the in memory event cache
            this.events.push(e);

            //we dont need to keep more than 1000 events in memory
            if (this.events.length>=1001)
                this.events.shift();

            return true;
        }
        catch (err)
        {
            console.log("StoreMessageEvent error:");
            console.error(err);
            return false;
        }
    }

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
            return {millisToWait:minimumWait,reason:minimumDelayReason};

        //we HAVE sent 1000 messages... 

        //look back 1000 messages into the past. when did we send that one?
        //was it more than 24 hours ago? if so, rate limits dont apply and we can send without
        //further delay
        let indexOf1000thMessage = this.events.length - 1000;
        let event = this.events[indexOf1000thMessage];

        var twentyTwentyTwentyFourHoursAgooo = new Date(curTime.getTime() - millisIn24Hours);

        //if the 1000th message in the past is more than 24 hours old, we can send without further delay
        if (event.time.getTime() < twentyTwentyTwentyFourHoursAgooo.getTime())
            return {millisToWait:minimumWait,reason:minimumDelayReason};

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
            return {millisToWait:timeToWait, reason:SendDelayReason.RateLimit}
        }
        else
        {
            //api rate limits do not require any delay beyond the minimum already calculated so we just
            //return the minimum delay as it was already calculated
            return {millisToWait:minimumWait,reason:minimumDelayReason};
        }
    }

}

export class TwitterFollowerCacheSQL extends TwitterFollowerCacheBase
{
    twitterDB:TwitterDB;
    db:DB;

    constructor()
    {
        super();
        this.twitterDB = new TwitterDB();
        this.twitterDB.Init();
        this.db = this.twitterDB.GetDB();
    }

    async Query(q:FollowerCacheQuery):Promise<Array<FollowerCacheQueryResult>>
    {
        //we must return a list of followers who
        //1) are following us
        //2) who have not yet been contacted by this campaign
        //3) are filtered by the tags specified in the query
        let messageHistoryTable = 'TwitterMessageHistory';
        if (q.useDryRunMessageHistory)
            messageHistoryTable = 'TwitterDryRunMessageHistory';

        try
        {
            let queryString =
               `SELECT TwitterFollowers.id_str,
                       TwitterUsers.screen_name,
                       TwitterUsers.name,
                       TwitterUsers.description,
                       TwitterFollowers.age,
                       TwitterUsers.followers_count,
                       TwitterUsers.profile_image_url_https,
                       (
                           SELECT date
                           FROM ${messageHistoryTable}
                           WHERE campaign_id=? AND id_str=TwitterFollowers.id_str
                       ) as contact_date
                FROM TwitterFollowers
                INNER JOIN TwitterUsers
                ON TwitterFollowers.id_str=TwitterUsers.id_str `
         
            let queryValues = [q.campaignId];

            //before we process tags.. need to pre-process and clean out any empty/invalid tags
            if (q.tags && !Array.isArray(q.tags))
            {
                console.log('Query - tags passed in was not a valid array: ' + JSON.stringify(q.tags));
                return null;
            }

            if (q.tags)
            {
                for (var i=0; i<q.tags.length; i++)
                {
                    //check for empty tag and if found, remove
                    if (q.tags[i]==="")
                    {
                        q.tags.splice(i,1);
                        i--;
                    }
                }
            }

            /////////////////////
            //build up the WHERE clause
            //1) always require that the follower table row actually match us (ie, we only want ppl who are following us)
            //2) optionally include a WHERE <date contacted> 'is NULL' check on the message history to only include the row if the follower hasnt been contacted yet
            //3) optionally include a WHERE <number of tags matched> >= 1 check on the tags table to require that the tags array have at least 1 match
            /////////////////////
            queryString +=
                `WHERE TwitterFollowers.id_str_followee=? `;
                
            queryValues.push(this.id_str);

            //if the query specifically does not want to include
            //results of people we've already contacted, we need to add an additional WHERE clause
            //to strip them out
            if (q.includeContacted!==true)
            {
                //make sure 
                queryString += ` AND contact_date is NULL `;

            }

            //add a clause for tag matching
            if (q.tags && q.tags.length>0)
            {
                //need to generate a string that looks like (?,?,?,?...) with a single ? for each tag we're looking for
                let tagMatchString = '(';
                for (var i=0; i<q.tags.length; i++)
                {
                    tagMatchString += '?'
                    if (i<q.tags.length-1)
                        tagMatchString += ','
                }
                tagMatchString += ')'

                queryString += `AND 1 <=
                    (
                        SELECT COUNT(*)
                        FROM TwitterTags
                        WHERE TwitterTags.id_str=TwitterFollowers.id_str AND TwitterTags.tag in ${tagMatchString}
                    ) `

                for (var i=0; i<q.tags.length; i++)
                    queryValues.push(q.tags[i]);
            }

            //WHERE clause is done.. now add ORDER BY

            if (!q.sort || q.sort==='influence')
                queryString += `ORDER BY TwitterUsers.followers_count DESC`;
            else
                queryString += `ORDER BY TwitterFollowers.age ASC`;
            
            //now add LIMIT..

            if (q.offset>0 && q.limit>0)
            {
                queryString += ` LIMIT ?,?`
                queryValues.push(q.offset.toString());
                queryValues.push(q.limit.toString());
            }
            else
            if (q.limit>0)
            {
                queryString += ` LIMIT ?`
                queryValues.push(q.limit.toString());
            }
            else
            if (q.offset>0)
            {
                queryString += ` OFFSET ?`
                queryValues.push(q.offset.toString());
            }

            let queryCommand = this.db.prepare(queryString);

            let results = queryCommand.all(queryValues);

            let arr = new Array<FollowerCacheQueryResult>();
            for (var i=0; i<results.length; i++)
            {
                let r = results[i];
                arr.push({
                    idStr:r.id_str,
                    screenName:r.screen_name,
                    name:r.name,
                    description:r.description,
                    age:r.age,
                    followersCount:r.followers_count,
                    contactDate:r.contact_date,
                    profileImageUrl:r.profile_image_url_https
                });
            }

            return arr;
        }
        catch (err)
        {
            console.log("Error running Query:");
            console.error(err);
            return null;
        }
    }

    GetNumStoredFollowers():number
    {
        try
        {
            let getFollowerCount = this.db.prepare('SELECT COUNT(*) from TwitterFollowers WHERE id_str_followee=?');
            let result = getFollowerCount.get([this.id_str]);
            
            return result["COUNT(*)"];
        }
        catch (err)
        {
            console.log("Error in GetNumStoredFollowers:");
            console.error(err);
            return null;
        }
    }

    SaveProgress(progress:FollowerTaskProgress)
    {
        try
        {
            //update the task table with our progress
            let updateTaskTable = this.db.prepare('REPLACE INTO TwitterFollowerTasks (id_str,cursor,completion_percent,start_time,finish_time) VALUES (?,?,?,?,?)');

            //check these values and make sure we store someting sensible that we are prepared for later
            //when we pull this data back out of the db

            let cursor = progress.cursor ? progress.cursor : '';
            
            let completionPercent = progress.completionPercent;
            if (typeof(completionPercent)!=='number')
                completionPercent = 0;
            if (completionPercent<0) completionPercent = 0;
            if (completionPercent>100) completionPercent = 100;

            let startTime = progress.startTime ? progress.startTime.getTime() : new Date().getTime();

            let finishTime = progress.finishTime ? progress.finishTime.getTime() : -1;

            updateTaskTable.run([this.id_str, cursor, completionPercent, startTime, finishTime]);
        }
        catch (err)
        {
            console.log("Error in StoreProgress:");
            console.error(err);
        }
    }

    GetProgress():FollowerTaskProgress
    {
        try
        {
            //pull the row from the task table with our name on it, it'll tell us
            //whether we are in-progress on a cache operation, whether we've completed one already, etc
            //
            //if finish_time is an actual time value (analogous to Date().getTime) then we know the
            //last operation completed and we have a valid DB of followers for this.id_str
            let getProgress = this.db.prepare('SELECT * from TwitterFollowerTasks WHERE id_str=?');
            let result = getProgress.get([this.id_str]);

            if (!result)
                return null;
            
            let p:FollowerTaskProgress = {
                cursor:result.cursor,
                completionPercent:result.completion_percent,
                startTime:null,
                finishTime:null
            };

            if (result.start_time>0)
                p.startTime = new Date(result.start_time);

            if (result.finish_time>0)
                p.finishTime = new Date(result.finish_time);

            return p;
        }
        catch (err)
        {
            console.log("Error in GetProgress:");
            console.error(err);
            return null;
        }
    }


    BeginWriting()
    {
        //need to remove old follower entries before adding new ones
        try
        {
            //any row where this user is the followee, that row needs to go
            let removeFollowers = this.db.prepare('DELETE FROM TwitterFollowers WHERE id_str_followee=(@id_str)');
            removeFollowers.run({id_str:this.id_str});

            let p:FollowerTaskProgress = {
                cursor:'',
                completionPercent:0,
                startTime:null,
                finishTime:null
            };

            this.SaveProgress(p);
        }
        catch (err)
        {
            console.log("Error removing old follower data from DB:");
            console.error(err);
        }
    }

    //use to measure how fast we are writing followers / investigate sqlite3 performance issues
    //timerStart:Date = null;
    //timerCount:number = 0;

    async WriteFollowers(followers:Array<{follower:any, dbIndex:any}>):Promise<boolean>
    {
        var str = '';

        try
        {
            //we must group several db actions into a single transaction otherwise this follower caching is gonna be too damn slow

            let innerTransactions = () =>
            {
                for (var i=0; i<followers.length; i++)
                {
                    /*
                    //profiling code.. every 500 followers, spits out how many followers per second you're writing
                    if (this.timerStart===null)
                        this.timerStart = new Date();

                    this.timerCount++;
                    if (this.timerCount===500)
                    {
                        //print some stats
                        let curTime = new Date();
                        let millis = curTime.getTime() - this.timerStart.getTime();
                        console.log('followers per second: ' + (500/(millis/1000)) );
                        this.timerCount = 0;
                        this.timerStart = curTime;
                    }
                    */

                    let follower = followers[i].follower;
                    let dbIndex = followers[i].dbIndex;

                    //before we update the entry for this follower in the TwitterUsers table,
                    //we need to check the description/bio to see if it has changed
                    //if so, we need to update our tags table to reflect the current tags in their bio

                    //what bio/description is currently in the db?
                    let getCurBio = this.db.prepare(`SELECT description from TwitterUsers WHERE id_str=${follower.id_str}`);
                    let result = getCurBio.get();
            
                    //we will insert tags for this user UNLESS the description we've got cached
                    //in the db right now matches the one we're inserting
                    let insertTags = true;

                    if (result)
                    {
                        //if the description/bio hasnt changed, we dont need to insert tags. just update the screenname/followercount/etc
                        if (result.description===follower.description)
                        {
                            insertTags = false;
                        }
                        else
                        {
                            //need to remove old tags before inserting current ones
                            let removeTags = this.db.prepare('DELETE FROM TwitterTags WHERE id_str=(@id_str)');
                            removeTags.run({id_str:follower.id_str});
                        }
                    }

                   if (insertTags)
                   {
                        let tags = follower.description.split(' ');

                        //remove any tags that are a single character or less
                        for (let ii=0; ii<tags.length;)
                        {
                            if (tags[ii].length<=1)
                                tags.splice(ii,1);
                            else
                                ii++;
                        }

                        //should probably do further tag cleanup
                        //-remove punctuation sitting on either edge of the tag
                        //remove all punctuation?

                        //insert 1 row for each tag, mapping the tag to this users id
                        const insert = this.db.prepare('INSERT INTO TwitterTags (tag,id_str) VALUES (@tag, @id_str)');

                        for (const tag of tags) insert.run({tag:tag,id_str:follower.id_str});
                    }

                    //ok, tags have been handled. update the entry for the user itself

                    const replaceUser = this.db.prepare('REPLACE INTO TwitterUsers (id_str,screen_name,name,verified,statuses_count,friends_count,followers_count,description,profile_image_url_https) VALUES (?,?,?,?,?,?,?,?,?)');
                
                    //save a little space if we know they havent changed away from the default profile image
                    let profile_image_url_https = follower.profile_image_url_https;
                    if (follower.default_profile_image)
                        profile_image_url_https = '';

                    let replaceResult = replaceUser.run([follower.id_str, follower.screen_name, follower.name, follower.verified?1:0, follower.statuses_count, follower.friends_count, follower.followers_count, follower.description, profile_image_url_https]);
                   
                    //now add this follower/followee relationship to the followers table
                    const insertFollower = this.db.prepare('INSERT INTO TwitterFollowers (id_str, id_str_followee, age) VALUES (?,?,?)');

                    //this follower is following us...
                    insertFollower.run([follower.id_str, this.id_str, dbIndex]);
                }
            }

            const outerTransaction = this.db.transaction(innerTransactions);
            let result = outerTransaction();
        }
        catch (err)
        {
            console.error(err);
            return false;
        }
        return true;
    }
}


