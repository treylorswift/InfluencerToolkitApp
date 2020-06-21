import * as TwitterAuth from '../Shared/TwitterAuth'
import * as fs from 'fs';
import * as crypto from 'crypto';

//there is an issue with typescript not realizing that 'Twitter' here is a class,
//so there are some @ts-ignore lines in here to suppress the incorrect warnings
import * as Twitter from 'twitter-lite';

import {MessagingCampaign} from './MessagingCampaign'
import {MessagingCampaignManager} from './MessagingCampaign'
import {DelaySeconds} from './Delay'

export type TwitterFollower = 
{
    id_str:string
    screen_name:string
    bio_tags:Array<string>
    followers_count:number
}

type FollowerCacheProgress = {cursor:string, lastFollowerId:string, lastFollowerScreenName:string, totalRetreived:number}

export interface TwitterFollowerCache
{
    LoadCache():Array<TwitterFollower>
    //@ts-ignore
    async BuildFollowerCache(twitter:Twitter):Promise<Array<TwitterFollower>>
}

class TwitterFollowerDiskCache implements TwitterFollowerCache
{
    private screen_name:string;
    private fileName:string;
    private progressFileName:string;
    private anyWritten:boolean;

    constructor(screen_name:string)
    {
        this.screen_name = screen_name;
        this.fileName = `./${this.screen_name}.followers.json`
        this.progressFileName = `./${this.screen_name}.followers.progress.json`
        this.anyWritten = false;
    }

    private GetPriorProgress():FollowerCacheProgress
    {
        //was some previous cache process interrupted?
        try
        {
            var priorProgress = JSON.parse(fs.readFileSync(this.progressFileName,'utf-8'));
            return priorProgress as FollowerCacheProgress;
        }
        catch (err)
        {
            //if there's an error loading prior progress, just act as though we had no prior progress
        }
        return null;
    }

    private BeginWriting()
    {
        //overwrite the cache file
        fs.writeFileSync(this.fileName,'[\n');

        //blow away any existing progress file
        this.DeleteProgressFile();

        this.anyWritten = false;
    }

    private SaveProgress(progress:FollowerCacheProgress)
    {
        fs.writeFileSync(this.progressFileName,JSON.stringify(progress));
    }

    private async WriteFollower(follower:any)
    {
        var str = '';
        if (this.anyWritten)
        {
            //if we've already written a follower, before we add this one we need to stick a ,\n at the end of the previous line
            str = ',\n';
        }
        
        //we dont really need to cache the entire blob, really only want some of them
        //currently we store:
        //id_str
        //description
        //followers_count
        //location
        //name
        //screen_name
        //verified
        var filtered_follower = {};
        var keep_keys = ["id_str","description","followers_count","location","name","screen_name","verified"];
        for (var i=0; i<keep_keys.length; i++)
            filtered_follower[keep_keys[i]] = follower[keep_keys[i]];

        //we'll add a line to the .json for this follower:
        str += JSON.stringify(filtered_follower);

        while (1)
        {
            try
            {
                fs.appendFileSync(this.fileName, str);
                break;
            }
            catch (err)
            {
                if (err.code!=="EBUSY")
                {
                    console.log(`Error writing ${this.fileName}, can't continue.`);
                    console.error(err);
                    process.exit(-1);
                }

                //error was 'EBUSY' - delay and try to write again in a quarter second
                await DelaySeconds(0.25)
            }
        }

        this.anyWritten = true;
    }

    private EndWriting()
    {
        fs.appendFileSync(this.fileName,'\n]');
        this.DeleteProgressFile();
    }

    private DeleteProgressFile()
    {
        try
        {
            fs.unlinkSync(this.progressFileName); //delete the progress file
        }
        catch (err)
        {}
    }

    LoadCache():Array<TwitterFollower>
    {
        try
        {
            var followers = new Array<TwitterFollower>();
            var json = JSON.parse(fs.readFileSync(this.fileName,'utf-8'));
            for (var i=0; i<json.length; i++)
            {
                //add a subset of this follower info to our in-memory array
                followers.push({screen_name:json[i].screen_name,id_str:json[i].id_str,followers_count:json[i].followers_count,bio_tags:json[i].description.split(' ')});
            }
            return followers;
        }
        catch (err)
        {
            if (err.code!=="ENOENT")
            {
                console.log(`TwitterFollowerCache - LoadCache error loading ${this.fileName} - cache will be rebuilt:`);
                console.error(err);
            }
            return null;
        }
    }

    //@ts-ignore
    async BuildFollowerCache(twitter:Twitter):Promise<Array<TwitterFollower>>
    {
        try
        {
            //first get the profile to determine the expected follower count
            let showResult = await twitter.get("users/show", {screen_name:this.screen_name, include_entities:false});
            let totalExpectedFollowers = showResult.followers_count;

            console.log(`Retreiving ${totalExpectedFollowers} followers for ${this.screen_name}..`);

            let cursor = '';
            var totalFollowersRetreived = 0;

            //check to see if some prior build was in progress
            let priorProgress = this.GetPriorProgress();
            let priorProgressErrorCount = 0;

            if (priorProgress)
            {
                //pickup where we left off
                cursor = priorProgress.cursor;
                totalFollowersRetreived = priorProgress.totalRetreived;

                console.log("Resuming prior follower cache operation");
                console.log("  Total retreived so far: " + priorProgress.totalRetreived);
                console.log("  Last follower retreived: " + priorProgress.lastFollowerScreenName);
  
                //we know there is already at least 1 line/follower in the followers.json we are writing
                //so this should be set to true to reflect that. triggers appending of ",\n" at 
                //the end of the previous line when the next follower is written
                this.anyWritten = true;

                //further down below, after the ids have been retreived for this cursor,
                //we will skip through all the ids until we find priorProgress.lastFollowerId,
                //then resume our query with the follower immediately after
            }
            else
            {
                //just start over
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
                        idsResult = await twitter.get("followers/ids", options);
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

                //this check will only occur once.. if we are resuming a prior cache, we must skip through
                //this chunk of ids until we find the last one we wrote.. and resume processing the ids
                //after it. there is a non-zero chance this approach will not work, the cursor may not return
                //exactly the same things it returned last time, the lastFollowerId we stored may not be found
                //in the list returned by that cursor.. in those cases we have to just start over.
                //the resume feature is really meant for situations where there's a crash or you need to only briefly
                //stop this process before resuming soon after
                if (priorProgress)
                {
                    let foundIndex = -1;
                    for (var i=0; i<idsResult.ids.length; i++)
                    {
                        if (idsResult.ids[i]===priorProgress.lastFollowerId)
                        {
                            foundIndex = i;
                            break;
                        }
                    }

                    if (foundIndex>=0)
                    {
                        //we need to splice the array here and only process the entries that come after it
                        idsResult.ids = idsResult.ids.slice(foundIndex+1);
                    }
                    else
                    {
                        //if we didnt find the follower where we expected, the only sensible explanation is that
                        //that follower has subsequently unfollowed, OR, enough new people have followed in the
                        //meantime that this follower was pushed off the page at the 'cursor' where it was previously,
                        //and it will be found on the next page (hopefully).
                        //
                        //we allow this error to happen one time while we check the next page.. if its not on 
                        //the next page, we have to just give up and start over

                        if (priorProgressErrorCount===0)
                        {
                            //see whether we can find the priorProgress.lastFollowerId on the next page..
                            priorProgressErrorCount++;

                            //are we already on the last page? bummer. finished.
                            if (idsResult.next_cursor_str==="0")
                                break;

                            //more pages to go..
                            cursor = idsResult.next_cursor_str;
                            continue;
                        }

                        console.log("Error attempting to resume follower cache operation, rebuilding follower cache from scratch.");

                        //our attempt to resume failed, we must start over
                        priorProgress = null;
                        cursor = '';
                        totalFollowersRetreived = 0;
                        this.BeginWriting();

                        continue;
                    }

                    priorProgress = null; //we dont need this anymore
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
                            usersResult = await twitter.post('users/lookup', {user_id:userIds});
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
                        //save this user to the cache
                        await this.WriteFollower(usersResult[i]);
                        totalFollowersRetreived++;

                        //save our progress in a separate file so we can resume later if we
                        //get aborted
                        let progress:FollowerCacheProgress = {
                            cursor:cursor,
                            lastFollowerId:usersResult[i].id_str,
                            lastFollowerScreenName:usersResult[i].screen_name,
                            totalRetreived:totalFollowersRetreived
                        }

                        this.SaveProgress(progress);
                    }

                    numProcessed += numToProcess;
                }

                //last page of ids? finished.
                if (idsResult.next_cursor_str==="0")
                    break;

                //more pages to go..
                cursor = idsResult.next_cursor_str;

                //spit out some progress
                console.log(`Retreived ${totalFollowersRetreived} of ${totalExpectedFollowers}..`);
            }

            console.log(`Finished retreiving followers for ${this.screen_name}, total received: ${totalFollowersRetreived} - total expected: ${totalExpectedFollowers}`);
            this.EndWriting();

            //now load the cache back only reading out the info we care about
            return this.LoadCache();
        }
        catch (err)
        {
            console.log("TwitterUser - BuildFollowerCache error:");
            console.error(err);
            return null;
        }
    }
}


export enum AppPermissionLevel
{
    Read,
    ReadWrite,
    ReadWriteDirectMessages
}

export class TwitterUser
{
    // @ts-ignore
    private client:Twitter;
    private permissionLevel:AppPermissionLevel = AppPermissionLevel.Read;

    //their twitter handle ('screen_name' in twitter api) gets filled in after a successful
    //call to Init().
    private screen_name:string = null;

    constructor()
    {
    }


    async Init(app_auth:TwitterAuth.AppAuth, user_auth:TwitterAuth.UserLogin):Promise<boolean>
    {
        try
        {
            //not sure why theres an issue with the twitter-lite typescript definitions issuing a false warning here
            //@ts-ignore
            this.client = new Twitter({
              subdomain: "api", // "api" is the default (change for other subdomains)
              version: "1.1", // version "1.1" is the default (change for other subdomains)
              consumer_key: app_auth.consumer_key, // from Twitter.
              consumer_secret: app_auth.consumer_secret, // from Twitter.
              access_token_key: user_auth.access_token_key, // from your User (oauth_token)
              access_token_secret: user_auth.access_token_secret // from your User (oauth_token_secret)
            });

            //verify that the app_auth and user_auth info is useable
            var results = await this.client.get("account/verify_credentials")

            //examine headers to determine app permissions
            let x_access_level = results._headers.get('x-access-level');
            switch (x_access_level)
            {
                case 'read': this.permissionLevel = AppPermissionLevel.Read; break;
                case 'read-write': this.permissionLevel = AppPermissionLevel.ReadWrite; break;
                case 'read-write-directmessages': this.permissionLevel = AppPermissionLevel.ReadWriteDirectMessages; break;
                default:
                    console.log(`Unrecognized x-access-level: ${x_access_level}, can't continue`);
                    return false;
                    break;
            }

            //store some info that will be helpful as we proceed..
            this.screen_name = results.screen_name;
            return true;
        }
        catch (err)
        {
          console.error(err);
          return false;
        }
    }

    GetPermissionLevel():AppPermissionLevel { return this.permissionLevel; }

    GetScreenName():string
    {
        if (!this.screen_name)
            console.log("TwitterUser.GetScreenName - this.screen_name not defined, Init() must succeed first");
        
        return this.screen_name;
    }

    //returns the followers for 'this' Twitter user
    async GetFollowers(options?:{forceRebuild?:boolean}):Promise<Array<TwitterFollower>>
    {
        if (!this.screen_name)
        {
            console.log("TwitterUser - GetFollowers - this.screen_name not defined, Init() must succeed first");
            return null;
        }

        return this.GetFollowersForUser(this.screen_name,options);
    }

    //returns followers for the specified Twitter user
    async GetFollowersForUser(screen_name:string, options?:{forceRebuild?:boolean}):Promise<Array<TwitterFollower>>
    {        
        let cache = new TwitterFollowerDiskCache(screen_name);

        //if they specified that we must force our refresh of the cache, do so
        if (options && options.forceRebuild===true)
        {
            return cache.BuildFollowerCache(this.client);
        }

        var followers = cache.LoadCache();
        if (followers)
            return followers;

        //cache didnt exist or load failed, have to retreive and cache (again)
        return cache.BuildFollowerCache(this.client);
    }

    //@ts-ignore
    GetTwitterClient():Twitter
    {
        return this.client;
    }

}