# Icicles Discord bot
Icicles ("I see cals") is a simple Discord bot that can be used to subscribe a Discord channel to an to online iCalendar (.ics) file. It will give daily notifications listing events for the day and then a reminder when the event is starting. It is especially helpful if you already have Google calendar that you use and do not want to convert everything to an integrated Discord calendar. 
It fully supports recurring events. You can't use Icicles to add or edit events in the calendar, just to watch them.


## Adding Icicles to Discord with an Invite
Sorry, Icicles is not on a public server yet. More testing to do! But you can run it on your own server or desktop with Node.js installed using the Local Installation instructions below.


## Local Installation
1. Clone this repository
2. Add an Application and 'Build-A-Bot' on Discord.
4. Copy your bot user token from Discord
5. Add a new file "./auth.json" in the repository, and add your Discord bot user token to the file in this format:
```
{
  "token": "<token for your discord app>"
}
```
6. run `npm install`
7. run `node icicles.js`


## Runtime Options
Subscriptions are stored in "./icicles.json". This file will be updated from commands sent in Discord.

You can make Icicles send some more information to the console using -v or --verbose like this:

`node icicles.js -v`


## Subscribing to a Calendar
1. Make sure that you have added Icicles to your Discord server, using the OAuth2 URL from the Application you added in Discord. There are lots of guides for this online.
1. Open the Discord channel that you want subscribed to the calendar.
1. Substituting your own URL for the bracketed text, send the Message:

`@icicles subscribe <https calendar url>`

You should get a message acknowledging the command and then a message with the daily events. Your daily updates will arrive every day at the same time you subscribed .


## Unsubscribing from a Calendar
1. Open the Discord channel that you want unsubscribed from the calendar.
1. Send the Message:

`@icicles unsubscribe`

You should get a message acknowledging the command.


## Subscribing to a Google Calendar 
1.  Open the settings for your Google calendar
2.  Find the `Access permissions` settings and click the setting for:
- [ ] Make available to public

3. Find the "Public addres in iCal format" setting and copy the url.
4. Use the instructions above to subscribe to this url.


## License
MIT license. See LICENSE.md for details. 
