node.websocket.js
=================

node.websocket.js is an event-driven implementation of the [Web Socket protocol](http://tools.ietf.org/pdf/draft-hixie-thewebsocketprotocol-60.pdf) for the Evented I/O API [Node.js](http://nodejs.org/).

Inspired by [Guillermo Rauch](http://devthought.com)'s [node.websocket.js](http://github.com/Guille/node.websocket.js) which resulted in a complete rewrite.

Requirements
------------

* [Node.js](http://nodejs.org/) (tested with v0.1.33)


How to use
----------

This library allows you to create your own WebSocket server and client. There is a reference implementation of each:

The server:

	$ node runserver.js

The client:

	$ node runclient.js

Both use the websocket.js library symmetrically. Make your own server (or client) and have fun!


Author
------

Andrey Petrov <[http://github.com/shazow](http://github.com/shazow)>

Library inspired by: Guillermo Rauch <[http://devthought.com](http://devthought.com)>
