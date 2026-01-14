# [hyperclock](https://michael.malinov.com/hyperclock/legacy.html)

A fullscreen clock website.

Currently using the legacy build until I make the new version.

## Structure
- `als-client`: ambient light sensor, [arduino esplora](https://arduino.cc/esplora) client.
- `als-host`: ambient light sensor, linux host.
- `gentz`: generate timezone abbreviations list (`tzabbr.js`)
- `legacy.html`: legacy (uncustomizable) build, depends on `tzaddr.js`
- `.`: clock web-app
