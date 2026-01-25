# [hyperclock](https://michael.malinov.com/hyperclock/)

A fullscreen clock website.

Legacy version: [4:3 layout](https://michael.malinov.com/hyperclock/legacy.html), [16:9 layout](https://michael.malinov.com/hyperclock/legacy.html?nt)

![Installation demo](./demo.jpg)

## Structure
- `als-camera`: ambient light sensor using the webcam, to dim the screen in low light
- `als-client` and `als-host`: old als using an [arduino esplora](https://arduino.cc/esplora). kept for posterity
- `gentz`: generate timezone abbreviations list (`tzabbr.js`)
- `legacy.html`: v2 build (no configuration), also depends on `tzabbr.js`
- `clock.js`, `index.html`, `sample.js`, `style.css`, `tzabbr.js`: v4 webapp
