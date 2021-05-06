//  Copyright 2021 Eric S. Pooch

const Discord = require('discord.js');
const ICAL = require('ical.js');
const IcalExpander = require('ical-expander');
const fs = require('fs');

const client = new Discord.Client();
try {
  var auth = require('./auth.json');
} catch (err) {
  console.error( err.message);
  console.error("You need to add your Discord bot user token to", './auth.json', 'in this format:\n\
{\n  "token": "<token for your discord app>"\n}');
   process.exit();
}
//const https = require('https');
const request = require('request');

const config = './icicles.json';
var prefix = "%";           // This will change to a mention shortly

const msHour = 3600000    // 1000*60*60 // 1 hr in ms;
const msDay = msHour*24;  //1000*60*60*24; // 1 day in ms;

// This is our IcicleMap
var channelmap;

// Runtime settings.
var verbose = false;
process.argv.forEach((argument) => { 
  if (argument == '-v' || argument == '--verbose') {
    verbose = true;
  }
});


// Map of channel id keys and corresponding icicle object values.
class IcicleMap extends Map {
  constructor( filePath ) {
    super();

    if (fs.existsSync( filePath )) {
      // Restore the saved settings.
      try {
        const jsonText = fs.readFileSync(filePath, 'utf8');
        //console.log(jsonText);
        var tempMap = new Map(JSON.parse(jsonText));

      } catch (err) {
        console.log("Error reading ", filePath,  " : ", err.message);
        //try to rename bad file so we don't overwrite with empty later.
        try {
          fs.renameSync(filePath, filePath+'.bad');
        } catch (err) {
          console.log("Error renaming ", filePath,  " : ", err.message);
          //nothing else we can do. If it cant read or rename, probably fs issue.
        }
        return this;
      }
      // Add a new icicle for each of the config file entries
      tempMap.forEach((value, key) => { this.set(key, new Icicle(value)) });
      if (verbose) {console.log(this)};
    }
  }
  
  save( filePath ) {
    // Save the new subscription settings.
    try {
      // Don't want setInterval or discord client properties serialized.
      const jsonText = JSON.stringify(Array.from(this.entries()), (k,v) =>
        (['interval', 'client', 'name'].includes(k)) ? undefined : v, 2);
      fs.writeFileSync(filePath, jsonText, {encoding:'utf8', flag:'w'});
    } catch (err) {
      console.log("Error writing ", filePath,  " : ", err.message);
    }
  }
  
}

// constructior is either the 3 listed arguments, or a property list.
function Icicle(id, url, startDate) {
//function Icicle(id, url, startDate) {
  if (url) {
    this.id = id;       // discord channel id
    this.url = url;     // url to the calendar feed
    //	this.options = urlToHttpOptions(url);
    this.startDate = (startDate) ? startDate : new Date(); // date & time of the orignal subscription request
  } else {
    Object.assign(this, id); // get all of the properties from first argument
  }
  this.startDate = new Date(this.startDate);  // easiest to always convert to date
  this.period = (this.period >= msHour) ? this.period: msDay; // default period is 1 day
  
  // The following are not saved to file:
  this.name;      // iCal calendar name from the ics file x-wr-calname.
  this.interval;  // setInterval, in case we need to cancel.
  this.client;    // Discord client.
  //console.log(this);
}


Icicle.prototype.syncSubscription = function(client) {
  // Start the daily delivery at same time of day as saved icicle.
  // This is useful after restarting the script.
  // Get the ms of day for now.
  var msofday = Date.now() - new Date().setHours(0,0,0,0);
  // Get the ms of day for the start.
  var msofice = this.startDate.getTime() - new Date(this.startDate).setHours(0,0,0,0);
  // Determine how long to wait from now.
  var delayms = msofice - msofday;
  // if start is earlier, add 1 day in ms.
  if (delayms < 0) { delayms = delayms + this.period }; 
  // Run a single update to get close events.
  this.deliverOnce(client);
  // Wait until the same time of day as the saved icicle to restart the daily delivery updates.
  setTimeout(() => { this.startSubscription(client); }, delayms);
}

Icicle.prototype.startSubscription = function(client) {
  // Get one calendar now.
  this.deliverOnce(client);
  // Start the recurring subscription.
  this.interval = setInterval(this.deliverOnce, this.period, this.client);
}

Icicle.prototype.deliverOnce = function(client) {
  // Just a wrapper for request() to download the calendar at url.
  // one of the subscription methods should have added a client, but you could do it here too.
  if (client) { this.client = client; }
  if ( !this.client ) {
    return console.error("Error: No Discord client to use!");
  }
  request(this.url, this.receiveCalendar.bind(this));
}

Icicle.prototype.receiveCalendar = function(error, response, body) {
  // deal with the http responses
  if (error) { return console.error("Error: ", error); }
  
  const channel = this.client.channels.cache.get(this.id); // discord channel object from channel id.
  if (!channel) { return console.error("Error: unable to find channel id:", this.id); }

  if (response.statusCode !== 200) {
    channel.send(':bangbang: icicles received a ' + response.statusCode + ' error while loading your calendar. \
Verify the url and if it is no longer available use :\n' + prefix + 'unsubscribe');
    return console.error("Error: Received ", response && response.statusCode, "while retrieving", this.url);
  }
  this.logFuncName(body); // Print the ics if verbose on.

  const icalExpander = new IcalExpander({ ics:body, maxIterations:100 });

  if (!this.name) {
    // Get the calendar name from the ical.
    this.name = icalExpander.component.getFirstPropertyValue('x-wr-calname');
    if (verbose) {console.log('#'+ channel.name, 'Set Calendar name:', this.name);}
  }
  const allEvents = this.summarizeExpandedEvents(icalExpander);
  var dailySummary = allEvents.map(e => `${e.startDate.toJSDate().toISOString()} - ${e.summary}`).join('\n');
  
  console.log('#'+ channel.name, 'daily summary:');
  const termHours = (this.period/1000/60/60).toPrecision(2);

  if (allEvents.length) {
    // For each of today's events, set up the timeouts to call the event reminder function.
    allEvents.map(e => this.setReminder(e));
  } else {
    // set a summary for no events
    dailySummary = 'No events for the next ' + termHours + ' hours.';
  }
  // send a discord message with the title and daily summary.
  channel.send(':calendar: ' + this.name + ' events for next ' + termHours + ' hours:\n' + dailySummary);
}

Icicle.prototype.summarizeExpandedEvents = function (expander) {
  // Get all calendar events, expanding repeat events.  
  // set up the range of the events we want (now + 1 day)
  var endDate = new Date();
  endDate.setTime(endDate.getTime() + this.period);
  // endDate(endDate.getDate() + 1);

  // get all events within the term from now
  const events = expander.between(new Date(), endDate);
  // get information about each event or occurance in the events array.
  const mappedEvents = events.events.map(e => ({ startDate: e.startDate, summary: e.summary, description: e.description }));
  const mappedOccurrences = events.occurrences.map(o => ({ startDate: o.startDate, summary: o.item.summary, description: o.item.description }));
  return [].concat(mappedEvents, mappedOccurrences);
}

Icicle.prototype.setReminder = function ( event ) {
  var eta_ms = event.startDate.toJSDate().getTime() - Date.now();
  var timeout = setTimeout(() => { this.sendReminder(event);}, eta_ms ); 
  
  var shortterm = new Date(eta_ms).toISOString().slice(11,19);
  console.log('  + Setting reminder for:', event.summary, '-', event.startDate.toJSDate().toISOString(), 'in', shortterm );
}

Icicle.prototype.sendReminder = function ( event ) {
  const channel = this.client.channels.cache.get(this.id);
  console.log('#'+ channel.name, 'Reminding of:', event.summary, '-', event.startDate.toJSDate().toISOString());
  channel.send(':alarm_clock: Reminder: ' + event.summary + ' is Starting Now!\n' + event.description); //, {tts: true}
}

Icicle.prototype.logFuncName = function ( string, force ) {
  if (verbose || force ) {
    console.log("--", this.constructor.name +"."+ Icicle.prototype.logFuncName.caller.name+"()", string);
  }
}

client.on('ready', () => {
  //  console.log(client);

  console.log(`Logged in as ${client.user.tag}!`);
 
  // Load the subscriptions from file.
  channelmap = new IcicleMap( config );
  // Tell each subscription to sync with their saved start time.
  channelmap.forEach((icicle) => {  icicle.syncSubscription(client); } );
  console.log('Loaded channel settings');
  prefix = '<@!'+client.user.id+'> ';
});

client.on('message', msg => {
  // if we wrote the message or it doesn't start with a mention, don't parse it.
  if (msg.author.id === client.user.id || !msg.content.startsWith('<@')) return;
  
  // A string to help to make logging more descriptive.
  const chaninfo = '>'+ msg.guild.name + ' #'+ msg.channel.name;
  if (verbose) {console.log( chaninfo, msg.content)};
  
  // when you copy-paste a mention, it shows as a role. Check for this for ease of use.
  const icicleRole = (msg.mentions.roles.size > 0 && msg.mentions.roles.values().next().value.name=='icicles');
  if (!(msg.mentions.has(client.user) || icicleRole )) { return };

  if (msg.member && !msg.member.hasPermission('ADMINISTRATOR')) {
    return console.log(chaninfo, msg.author.username, 'has insufficient permissions to command icicles.');
  }
  const chanid = msg.channel.id;
  const message = msg.content.split(' ');
  var command = message[1];
  
  if (command === 'iphone') {
    if (channelmap.has(chanid)) {
      msg.reply('To subscribe to this calendar feed on an iphone, use your iphone to open:\n\Settings -> Calendar -> Add Account -> Other -> Add Subscribed Calendar\n\
Then, enter the server: ' + channelmap.get(chanid).url + ' and touch "Next". Verify the settings, and touch "Next" again. \
Or, you can add the feed to your iCloud calendar instead.');
    }
  } else if (command === 'subscribe') {
    if (channelmap.has(chanid)) {
      msg.reply(':bangbang: Unsubscribe from existing feed first, by using:\n' + prefix + 'unsubscribe');
      return;
    }
    var icicle = new Icicle( chanid, message[2], msg.createdAt );
    channelmap.set(chanid, icicle);
    msg.reply('\n:calendar_spiral: Subscribing to: ' + icicle.url + '. You can too!');
    console.log(chaninfo, ' Subscribing to ', icicle.url);
    // Start the subscription now.
    icicle.startSubscription(client);
    // Save the new subscription settings to file.
    channelmap.save(config);
    
  } else if (command === 'unsubscribe') {
    if (channelmap && channelmap.has(chanid)) {
      // Stop the daily calendar loading function.
      clearInterval(channelmap.get(chanid).interval);
      channelmap.delete(chanid);
      msg.reply('\n:calendar_spiral: Unsubscription complete. You may get some pending reminders until the end of the day.');
      console.log(chaninfo, 'Unsubscribed.');
      // Save the new subscription settings to file.
      channelmap.save(config);
    } else {
      msg.reply('\n:bangbang: This channel is not currently subscribed to any feeds.');
    }
  } else {
    msg.reply('Hi! I am icicles ("ics cals" or "I see cals"). I am a simple bot that subscribes to public calendar feeds. \
I will send daily updates to your discord channel listing events in the next 24 hours, \
and I will send reminders when the events are starting.\n\
To use me:\n\
  enter the Discord channel that you want to keep updated,\n\
  substituting [ics url] with your calendar feed url (to a ".ics" file), send the message:\n\
  '+ prefix + 'subscribe [ics url]\n\
When you are done with me, send the message:\n\
  '+ prefix + 'unsubscribe\n\
Make sure to always mention me when you want me to do something!');
    return;
  }
});


client.login(auth.token);
