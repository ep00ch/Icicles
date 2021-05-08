/*
MIT License
ICAL.ExpComponent code is copied from ical-expander, which was:
// Copied from https://dxr.mozilla.org/comm-central/source/calendar/timezones/zones.json
// And compiled using node compile-zones.js
// See also https://github.com/mozilla-comm/ical.js/issues/195
Copyright (c) 2016 Mikael Finstad

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

const ICAL = require('ical.js');
const fetch = require('node-fetch');
//const IcalExpander = require('ical-expander');

// Very useful functions that we will use to extend ICAL.js

ICAL.ExpComponent = function (jCal, parent)  {
  if (typeof(jCal) === 'string') {
    // jCal spec (name, properties, components)
    jCal = [jCal, [], []];
  }

  // mostly for legacy reasons.
  this.jCal = jCal;

  this.parent = parent || null;
  this.events;
}
ICAL.helpers.inherits(ICAL.Component, ICAL.ExpComponent, {
  getEvents : function (maxIterations, skipInvalidDates) {// Maybe add component name option? 
    this.maxIterations = maxIterations != null ? maxIterations : 1000;
    this.skipInvalidDates = skipInvalidDates != null ? skipInvalidDates : false;
  
    this.events = this.getAllSubcomponents('vevent').map(vevent => new ICAL.Event(vevent));
    if (this.skipInvalidDates) {
      this.events = this.events.filter((evt) => {
        try {
          evt.startDate.toJSDate();
          evt.endDate.toJSDate();
          return true;
        } catch (err) {
          // skipping events with invalid time
          return false;
        }
      });
    }
    return this;
  },
      
    between : function(after, before) {
      function isEventWithinRange(startTime, endTime) {
        return (!after || endTime >= after.getTime()) &&
        (!before || startTime <= before.getTime());
      }
      
      function getTimes(eventOrOccurrence) {
        const startTime = eventOrOccurrence.startDate.toJSDate().getTime();
        let endTime = eventOrOccurrence.endDate.toJSDate().getTime();
  
        // If it is an all day event, the end date is set to 00:00 of the next day
        // So we need to make it be 23:59:59 to compare correctly with the given range
        if (eventOrOccurrence.endDate.isDate && (endTime > startTime)) {
          endTime -= 1;
        }
  
        return { startTime, endTime };
      }
  
      const exceptions = [];
  
      this.events.forEach((event) => {
        if (event.isRecurrenceException()) exceptions.push(event);
      });
  
      const ret = {
        events: [],
        occurrences: [],
      };
  
      this.events.filter(e => !e.isRecurrenceException()).forEach((event) => {
        const exdates = [];
  
        event.component.getAllProperties('exdate').forEach((exdateProp) => {
          const exdate = exdateProp.getFirstValue();
          exdates.push(exdate.toJSDate().getTime());
        });
  
        // Recurring event is handled differently
        if (event.isRecurring()) {
          const iterator = event.iterator();
  
          let next;
          let i = 0;
  
          do {
            i += 1;
            next = iterator.next();
            if (next) {
              const occurrence = event.getOccurrenceDetails(next);
  
              const { startTime, endTime } = getTimes(occurrence);
  
              const isOccurrenceExcluded = exdates.indexOf(startTime) !== -1;
  
              // TODO check that within same day?
              const exception = exceptions.find(ex => ex.uid === event.uid && ex.recurrenceId.toJSDate().getTime() === occurrence.startDate.toJSDate().getTime());
  
              // We have passed the max date, stop
              if (before && startTime > before.getTime()) break;
  
              // Check that we are within our range
              if (isEventWithinRange(startTime, endTime)) {
                if (exception) {
                  ret.events.push(exception);
                } else if (!isOccurrenceExcluded) {
                  ret.occurrences.push(occurrence);
                }
              }
            }
          }
          while (next && (!this.maxIterations || i < this.maxIterations));
  
          return;
        }
  
        // Non-recurring event:
        const { startTime, endTime } = getTimes(event);
  
        if (isEventWithinRange(startTime, endTime)) ret.events.push(event);
      });
  
      return ret;
    },
  
    before: function (before) {
      return this.between(undefined, before);
    },
  
    after: function (after) {
      return this.between(after);
    },
  
    all: function() {
      return this.between();
    }
});

ICAL.parseFromURL = function (url, cb) { 
    var response; 
    fetch(url)
      .then(res => {response = res; return res.text()})
      .then(body => {
        //var ICALComponentEx = ICAL.helpers.extend(ICAL.Component, ComponentExpanded);
        //console.log(ICAL.Component.prototype);

        //console.log('prototype', ICAL.ExpComponent.prototype);

        const jCalData = ICAL.parse(body);
       // console.log('--', new ICAL.ExpComponent(jCalData));

        cb( null, response, new ICAL.ExpComponent(jCalData) );
      })
      .catch(err => {
        console.error(err);
        cb(err, null, response);
      })
}
