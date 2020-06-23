# Influencer Toolkit (Desktop App)

Influencer Toolkit is an influencer marketing desktop application that automates sending of direct messages to your Twitter followers, with a focus on soliciting mailing list / newsletter signups. Send up to 1000 messages per day (per Twitter guidelines).

### Features

- Node.js/Electron cross platform application

- Integrates with "Influencer Toolkit Signup", a web app for managing newsletter sign ups at https://itk-signup.herokuapp.com. Quickly create a newsletter sign up page and send the link to your followers with the Influencer Toolkit Desktop App. You'll be notified by email when people sign up.

- Downloads your complete follower list from Twitter at roughly 300k followers per hour (per Twitter limits). Download is resumable if interrupted. Followers can be updated/re-downloaded again later.

- Followers are displayed in a table and can be sorted and filtered in various ways. Sort by "Most Followers" or "Most Recently Followed". Filter by entering tags which will be matched against each user's Twitter bio.

- Message sending history is tracked in a database to ensure each follower is contacted only once. Message sends are scheduled to avoid hitting Twitter API rate limit errors.
 
- A separate "dry run" message history sandbox allows you to simulate sending of messages to see how the program operates without actually spamming people.

- Sending can be scheduled in "burst" or "spread" mode. Send your 1000 messages per day all at once or spread them out over a 24 hour period (roughly 1 message every 86 seconds).
### 

### Installation and Setup

1. Download and install a pre-built binary or install via git (instructions below)
2. Go to <https://apps.twitter.com> and create a Twitter app for testing. Generate API keys with read, write, and Direct Message permissions.
3. Run the Influencer Toolkit App, enter the API keys from step 2 and login with your Twitter account.
4. Click to download your followers.
5. While followers are downloading, visit https://itk-signup.herokuapp.com and create a mailing list sign up page.
6. When the follower download completes, you can view, sort, filter, and contact your followers.

### Pre-Built Binaries

### Developer Install
1. Make sure you have Node.js (at least version 9) and git installed 
2. `git clone https://github.com/treylorswift/InfluencerToolkitApp.git`
3. `cd InfluencerToolkitApp`
3. `npm install`
4. `npm electron-rebuild` (better-sqlite3 is a native module and depending on your node version
5. Go to <https://apps.twitter.com> and create a Twitter app for testing. Generate API keys with read, write, and Direct Message permissions.
6. `npm start` to launch the app

## Credits

- Written by [@treylorswift](https://twitter.com/treylorswift)

- Uses https://github.com/draftbit/twitter-lite/ for Twitter API access
