# [hyperclock](https://michael.malinov.com/hyperclock/legacy.html)

A fullscreen clock website.

Currently using the legacy build until I make the new version.

![Clock installation demo](./demo.jpg)

## Structure
- `als-camera`: ambient light sensor using the webcam, to dim the screen in low light
- `als-client` and `als-host`: old als using an [arduino esplora](https://arduino.cc/esplora). kept for posterity
- `gentz`: generate timezone abbreviations list (`tzabbr.js`)
- `legacy.html`: legacy (uncustomizable) build, depends on `tzaddr.js`
- `.`: clock web-app
