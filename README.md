# musicjson
MusicXML to MusicJSON bi-directional converter
Translates MusicXML to MusicJSON format and back again!

Forked from https://github.com/saebekassebil/musicjson

## Getting Started
Install the module with: `npm install -g musicjson3`

## Examples
```javascript
var music = require('musicjson3');

music.musicJSON(xml, function(err, json) {
  // Do something with the MusicJSON data
});

music.musicXML(json, function(err, xml) {
  // Do something with the MusicXML data
});
```

## Contributing
Feel free to submit any issues regarding this library's bugs and please feel also free to submit any feature requests!

## License
Copyright (c) 2012 Saebekassebil

Copyright (c) 2014 neoScores

Licensed under the MIT license.
