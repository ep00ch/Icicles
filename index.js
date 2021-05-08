//  Copyright 2021 Eric S. Pooch
var verbose = false;
process.argv.forEach((argument) => { 
  if (argument == '-v' || argument == '--verbose') {
    verbose = true;
  }
});

const Discord = require('discord.js');
const fs = require('fs');
const Icicle = require('./icicle');

require('./ical-exp.js');

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

const config = './icicles.json';
var prefix = "%";           // This will change to a mention shortly

// This is our IcicleMap
var channelmap;

// Runtime settings.



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

client.on('ready', () => {
  //  console.log(client);
  client.user.setActivity('Calendars', { type: 'WATCHING' });
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
