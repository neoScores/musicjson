/*
 * MusicJSON
 *  - A bi-directional converter between MusicXML and MusicJSON
 * https://github.com/saebekassebil/musicjson
 *
 * Copyright (c) 2013 Saebekassebil
 * Copyright (c) 2014 neoScores
 * Licensed under the MIT license.
 */
 'use strict';

var builder = require('xmlbuilder'),
  sax     = require('sax'),
  events  = require('events'),
  util    = require('util');

var processInstr = { // Default ProcessingIntructions
  version: '1.0',
  encoding: 'UTF-8',
  standalone: false
};

var partwise = { // Default DOCTYPE
  id: '-//Recordare//DTD MusicXML 2.0 Partwise//EN',
  url: 'http://www.musicxml.org/dtds/partwise.dtd',
  type: 'score-partwise'
};

//var doctype = 'PUBLIC "' + partwise.id + '" "' + partwise.url + '"'; // dynamically
var attrkey = '$',
    charkey = '_',
    orderkey = '%',
    orderNumberKey = '&',
    namekey = '#name',
    linekey = '#l',
    specialKeys = [attrkey, charkey, orderkey, orderNumberKey, namekey, linekey];

function assignOrderNumber(obj, name, parent) {
  //if (name in parent) { // Always assign orderNumber
  if (!(orderNumberKey in parent)) {
    parent[orderNumberKey] = 0;

    for (var child in parent)
      if (parent.hasOwnProperty(child)) {
        if (specialKeys.indexOf(child) !== -1) {
          continue;
        }

      parent[orderNumberKey]++;
      parent[child][orderkey] = parent[orderNumberKey];
    }
  }

  parent[orderNumberKey]++;
  obj[orderkey] = parent[orderNumberKey];
  /*} else { // Always assign orderNumber
    if (orderNumberKey in parent) {
      parent[orderNumberKey]++;
      obj[orderkey] = parent[orderNumberKey];
    }
  }*/
}

// XML Parser for parsing MusicXML documents
function Parser(settings) {
  events.EventEmitter.call(this);

  // Initialize sax parser
  this.sax = sax.parser(true, {
    trim: false,
    normalize: false,
    xmlns: false
  });

  // Stack to hold the tags when encountered
  this.stack = [];

  this.settings = settings || {};

  // Initialize listeners
  this.sax.onerror = this.error.bind(this);
  this.sax.onopentag = this.open.bind(this);
  this.sax.onclosetag = this.close.bind(this);
  this.sax.ontext = this.sax.oncdata = this.text.bind(this);
}
util.inherits(Parser, events.EventEmitter);

Parser.prototype.error = function(e) {
  this.emit('error', e);
};

Parser.prototype.open = function(node) {
  var key, obj = {};

  // Set the node name (deleted later)
  obj[namekey] = node.name.toLowerCase();
  obj[charkey] = '';

  obj[linekey] = this.sax.line + 1;

  // Iterate over all the attributes
  for (key in node.attributes) 
    if (node.attributes.hasOwnProperty(key)) {
      if (!(attrkey in obj)) {
        obj[attrkey] = {};
      }
      obj[attrkey][key] = node.attributes[key];
    }
  this.stack.push(obj);
};

Parser.prototype.close = function(node) {

  var obj = this.stack.pop(), name = obj[namekey], parent;

  delete obj[namekey];
  if (orderNumberKey in obj) delete obj[orderNumberKey];

  parent = this.stack[this.stack.length - 1];

  if (!obj[charkey].trim().length) { // No text content
    delete obj[charkey];
  } /*else if (Object.keys(obj).length === 1) { // Text node
    obj[charkey] = obj[charkey];
  }*///Don't do this, you can't assign an order to a string! eg: string.% = 1 won't work

  // If the object is empty, translate it to "true"
  /*if (obj && typeof obj === 'object' && !Object.keys(obj).length) {
    obj = true;
  }*///Don't do this, you can't assign an order to a boolean! eg: boolean.% = 5 won't work

  if (this.stack.length > 0) {
    // Assign order number, so that tag order is preserved
    if (this.settings.preserveOrder) {
      assignOrderNumber(obj, name, parent);
    }

    if (name in parent) {
      parent[name] = util.isArray(parent[name]) ? parent[name] : [parent[name]];
      parent[name].push(obj);
    } else {
      parent[name] = obj;
    }
  } else {
    var returnobj = {};
    returnobj[name] = obj;

    this.emit('end', returnobj);
  }
};

Parser.prototype.text = function(text) {
  var last = this.stack[this.stack.length - 1];
  if (last) {
    last[charkey] += text;
  }
};

Parser.prototype.parse = function(string, callback) {
  this.on('end', function(result) { callback(null, result); });
  this.on('error', callback);

  this.sax.write(string);
};

// Translates a MusicJSON element to MusicXML
function toXML(root, el, nodeName) {
  var element, i, attr, type = typeof el, children = [];

  if (!root) {
    // Create <?xml, DOCTYPE and root element
    element = root = builder.create(nodeName, {
        version: processInstr.version,
        encoding: processInstr.encoding,
        standalone: processInstr.standalone
      }, { pubID: partwise.id, sysID: partwise.url });
  } else {
    element = root.element(nodeName);
  }

  if (type === 'number' || type === 'string') {
    return element.text(el);
  }

  for (i in el)
    if (el.hasOwnProperty(i)) {
      switch (i) {
        // Set attributes of node
        case '$':
          for (attr in el[i])
            if (el[i].hasOwnProperty(attr)){
              element.attribute(attr, el[i][attr]);
            }
        break;

        // Set textual content of node
        case '_':
          element.text(el[i]);
        break;

        case '%':
        case '#l':
          // Do nothing
        break;

        // Append child
        default:
          if (util.isArray(el[i])) {
            /*children = children.concat(el[i].map(function(el) {
              return { el: el, name: i };
            }));*/
            children = children.concat(el[i].map(map));
          } else {
            children.push({el: el[i], name: i});
          }
        break;
      }
    }

  function map (el) {
    return { el: el, name: i };
  }

  // Find all children with no ordering
  var sorted = children.filter(function(child) {
    return !(typeof child.el === 'object' && orderkey in child.el);
  });

  // Find all children with ordering, and splice them into
  // the sorted array
  children.filter(function(child) {
    return typeof child.el === 'object' && orderkey in child.el;
  }).sort(function(a, b) {
    return +a.el[orderkey] - +b.el[orderkey];
  }).forEach(function(child, i) {
    var index = +child.el[orderkey] - 1;
    sorted.splice(index, 0, child);
  });

  sorted.forEach(function(child) {
    toXML(element, child.el, child.name);
  });

  return element;
}

exports.musicJSON = function(source, callback) {
  var temp =null;
  // Get Process Instructions
  var processInstrString = source.match(/<\?xml [a-z0-9=\.\-\s\"\'\/\:]+\?>/gi);
  // Convert to string and strip "<?xml " and ">"
  processInstrString = processInstrString[0].substring(6,processInstrString[0].length-1);
  // Get version
  temp = processInstrString.match(/version=(\"|\')[0-9\.]+(\"|\')/i);
  if (temp) {
    processInstr.version = temp[0].substring(9, temp[0].length-1);
    temp = {};
  } else {
    callback('Invalid <xml> version', null);
    return;
  }
  // Get encoding
  temp = processInstrString.match(/encoding=(\"|\')[a-z0-9\-]+(\"|\')/i);
  if (temp) {
    processInstr.encoding = temp[0].substring(10, temp[0].length-1);
    temp = {};
  } else {
    callback('Invalid <xml> encoding', null);
    return;
  }
  // Get standalone // optional
  temp = processInstrString.match(/standalone=(\"|\')[a-z0-9\-]+(\"|\')/i);
  if (temp) {
    processInstr.standalone = (temp[0].substring(12, temp[0].length-1) === 'no') ? false : true;
    temp = {};
  }
  // Get the doctype
  var doctypeString = source.match(/<!DOCTYPE [a-z0-9\.\-\s\"\'\/\:]+>/gi);
  // Convert to string and strip "<!DOCTYPE " and ">"
  doctypeString = doctypeString[0].substring(10,doctypeString[0].length-1);
  // Get rootElement
  temp = doctypeString.match(/[a-z\-]+/i);
  if (temp) {
    partwise.type = temp[0];
    temp = null;
  } else {
    callback('Invalid <!DOCTYPE> rootElement', null);
    return;
  }
  // Get dtdName
  temp = doctypeString.match(/(\"|\')\-[a-z0-9\s\/\.]+(\"|\')/i);
  if (temp) {
    partwise.id = temp[0].substring(1, temp[0].length-1);
    temp = null;
  } else {
    callback('Invalid <!DOCTYPE> dtdName', null);
    return;
  }
  // Get dtdLocation
  temp = doctypeString.match(/(\"|\')[a-z0-9\:\/\.]+(\"|\')/i);
  if (temp) {
    partwise.url = temp[0].substring(1, temp[0].length-1);
    temp = null;
  } else {
    callback('Invalid <!DOCTYPE> dtdLocation', null);
    return;
  }

  var settings = { preserveOrder: true };

  if (typeof source === 'object') {
    settings.preserveOrder = source.preserveOrder;
    source = source.source;
  }

  var parser = new Parser(settings);
  var errors = [];
  function result(err, json) {
    if (err) errors.push(err);
    else {
      if (errors[0]) callback(errors, null);
      else callback(null, json);
    }
  }
  parser.parse(source, result);
};

exports.musicXML = function musicXML(source, callback) {
  var root = toXML(null, source[partwise.type], partwise.type);
  var xml = root.end({pretty: true, indent: '  ', newline:'\n'});
  callback(null, xml);
};
