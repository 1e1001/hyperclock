// Example configuration showing some basic features
// There is currently no configuration documentation,
// so you'll need to read clock.js for more info.

// Constants
const cv = "orange";
const cs = "red";
const tz = "local";
const sd = "-";
const sc = "∶"; // centered colon
const sp = ".";

const even_second = now => now.time(tz).second % 2 == 0;

return {
  // "clock face" layot
  face: {
    size: {w: 10, h: 4},
    // Center in canvas (monitor)
    position: {x: 0.5, y: 0.5},
  },
  // Spans are units of formatted text
  spans: [
    // LineSpan is a shorthand for creating an entire row of spans
    LineSpan({x: 0, y: 0, h: 2}, [
      pos => YearSpan(pos, cv, tz),
      pos => TextSpan(pos, cs, sd),
      pos => MonthSpan(pos, cv, tz),
      pos => TextSpan(pos, cs, sd),
      pos => DaySpan(pos, cv, tz),
    ]),
    LineSpan({x: 0, y: 2, h: 2}, [
      pos => HourSpan(pos, cv, tz),
      pos => ToggleSpan(even_second, TextSpan(pos, cs, sc)),
      pos => MinuteSpan(pos, cv, tz),
      pos => ToggleSpan(even_second, TextSpan(pos, cs, sc)),
      pos => SecondSpan(pos, cv, tz),
      pos => TextSpan(pos, cs, sp),
      pos => SubsecondSpan(pos, cv, tz, 1),
    ]),
  ],
};
