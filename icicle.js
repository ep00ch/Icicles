//  Copyright 2021 Eric S. Pooch
require('./ical-exp');


const msHour = 3600000;    // 1000*60*60 // 1 hr in ms;
const msDay = msHour*24;  //1000*60*60*24; // 1 day in ms;

class Icicle {
// constructior is either the 3 listed arguments, or a property list.
  constructor(id, url, startDate) {
    //function Icicle(id, url, startDate) {
    if (url) {
      this.id = id;       // discord channel id
      this.url = url;     // url to the calendar feed
      //  this.options = urlToHttpOptions(url);
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
    this.timeLeft;  // Time left from when remdinder first set.
    //console.log(this);
    // Handle our own callbacks by default
    this.summaryCallback = this.sendSummary;
    this.reminderCallback = this.sendReminder;
  }
  
  
  syncSubscription (client) {
    // Start the daily delivery at same time of day as saved icicle.
    // This is useful after restarting the script.
    // Get the ms of day for now.
    var msofday = Date.now() - new Date().setHours(0,0,0,0);
    // Get the ms of day for the start.
    var msofice = this.startDate.getTime() - new Date(this.startDate).setHours(0,0,0,0);
    // Determine how long to wait from now.
    var delayms = msofice - msofday;
    // if start is earlier, add 1 day in ms.
    if (delayms < 0) { delayms = delayms + this.period }
    // Run a single update to get close events.
    this.deliverOnce(client); // 
    // Wait until the same time of day as the saved icicle to restart the daily delivery updates.
    setTimeout(() => { this.startSubscription(client); }, delayms);
  }
  
  startSubscription (client, periodCallback, reminderCallback) {
    if (periodCallback || reminderCallback) {
      // Set both if either is set, so caller can turn off if null.
      this.periodCallback = periodCallback;
      this.reminderCallback = reminderCallback;
    }
    // Get one calendar now.
    this.deliverOnce(client);
    // Start the recurring subscription.
    this.interval = setInterval(this.deliverOnce, this.period, this.client);
  }
  
  deliverOnce (client) {
    // Save the discord client and wrap http client to download the calendar at url.
    if (client) { this.client = client; }
    if ( !this.client ) {
      return console.error("Error: No Discord client to use!");
    }
    ICAL.componentFromURL(this.url, this.receiveCalendar.bind(this)); // is the bind still necessary?
  }
  
  receiveCalendar (error, response, component) {
    // deal with the http responses
    if (error) { return console.error("Error: ", error); }
    
    const channel = this.client.channels.cache.get(this.id); // discord channel object from channel id.
    if (!channel) { return console.error("Error: unable to find channel id:", this.id); }
    
    
    if (response.statusCode < 200 || response.statusCode > 299) {
      channel.send(':bangbang: icicles received a ' + response.statusCode + ' error while loading your calendar. \
                   Verify the url and if it is no longer available use :\n' + prefix + 'unsubscribe');
      return console.error("Error: Received ", response && response.statusCode, "while retrieving", this.url);
    }
    
    if (!this.name) {
      // Get the calendar name from the ical.
      this.name = component.getFirstPropertyValue('x-wr-calname');
      //console.log('#'+ channel.name, 'Set Calendar name:', this.name);
    }
    const allEvents = this.summarizeNearEvents(component);
    if (this.summaryCallback)
      this.summaryCallback(allEvents, this); // sendSummary() by default;
  }
  
  summarizeNearEvents (component) {
    // Get all calendar events, expanding repeat events.  
    // set up the range of the events we want (now + 1 day)
    var endDate = new Date();
    endDate.setTime(endDate.getTime() + this.period);
    // endDate(endDate.getDate() + 1);
    
    // get all events within the term from now
    const events = component.getEvents().between(new Date(), endDate);
    // get information about each event or occurance in the events array.
    const mappedEvents = events.events.map(e => ({ startDate: e.startDate, summary: e.summary, description: e.description }));
    const mappedOccurrences = events.occurrences.map(o => ({ startDate: o.startDate, summary: o.item.summary, description: o.item.description }));
    const concatEvents = [].concat(mappedEvents, mappedOccurrences);
    concatEvents.map(e => e.startDate=e.startDate.toJSDate()); // Convert the date strings to date objects
    return concatEvents.sort((a, b) => (a.startDate.getTime() > b.startDate.getTime()) ? true : false);
  }

  sendSummary (events) { // the default summaryCallback();
    var dailySummary = events.map(e => `${e.startDate.toUTCString()} - ${e.summary}`).join('\n');
    const channel = this.client.channels.cache.get(this.id); // discord channel object from channel id.

    console.log('#'+ channel.name, 'daily summary:');
    const termHours = (this.period/msHour).toPrecision(2);
    
    if (events.length) {
      // For each of today's events, set up the timeouts to call the event reminder function.
      events.map(e => this.setReminder(e));
    } else {
      // set a summary for no events
      dailySummary = 'No events for the next ' + termHours + ' hours.';
    }
    // send a discord message with the title and daily summary.
    channel.send(':calendar: ' + this.name + ' events for next ' + termHours + ' hours:\n' + dailySummary);
  }
    
  setReminder ( event ) {
    var eta_ms = event.startDate.getTime() - Date.now();
    if (!this.reminderCallback) return;
    var timeout = setTimeout(() => { this.reminderCallback(event, this);}, eta_ms );  // sendReminder() by default
    var shortterm = new Date(eta_ms).toISOString().slice(11,19);
    console.log('  +Setting reminder for:', event.summary, '-', event.startDate.toISOString(), 'in', shortterm );
  }
  
  sendReminder ( event ) {  // the default reminderCallback();
    const channel = this.client.channels.cache.get(this.id);
    console.log('#'+ channel.name, 'Reminding of:', event.summary, '-', event.startDate.toISOString());
    channel.send(':alarm_clock: Reminder: ' + event.summary + ' is Starting Now!\n' + event.description); //, {tts: true}
  }
  
  toJSON (name) {
    // Simplified version of the icicle for serialization by JSON.stringify.
    return {id: this.id, url: this.url, startDate: this.startDate, period: this.period};
  }
}

module.exports = Icicle;
