var tcp = require('tcp'),
    sys = require('sys'),
    tools = require('./tools'),
    events = require('events');


var requestHeadersMatch = [
      /^GET (\/[^\s]*) HTTP\/1\.1$/,
      /^Upgrade: WebSocket$/,
      /^Connection: Upgrade$/,
      /^Host: (.+)$/,
      /^Origin: (.+)$/
    ],
    requestHeaders = [
      'GET {resource} HTTP/1.1',
      'Upgrade: WebSocket',
      'Connection: Upgrade',
      'Host: {host}',
      'Origin: {origin}',
      '',
      ''
    ];

var responseHeadersMatch = [
      /^HTTP\/1\.1 101 Web Socket Protocol Handshake/,
      /^Upgrade: WebSocket/,
      /^Connection: Upgrade/,
      /^WebSocket-Origin: (.+)$/,
      /^WebSocket-Location: (.+)$/
    ],
    responseHeaders = [
      'HTTP/1.1 101 Web Socket Protocol Handshake',
      'Upgrade: WebSocket',
      'Connection: Upgrade',
      'WebSocket-Origin: {origin}',
      'WebSocket-Location: {protocol}://{host}{resource}',
      '',
      ''
    ];


function log(msg) {
        sys.puts(msg);
}


var WebSocket = this.WebSocket = function(socket) {
    events.EventEmitter.call(this);

    this.socket = socket;
    this.closed = false;

    socket.setTimeout(0);
    socket.setNoDelay(true);
    socket.setEncoding('utf8');
    socket.addListener('end', function() { this.close(); });
}
sys.inherits(WebSocket, events.EventEmitter);

WebSocket.prototype.close = function() {
    if(closed) return;
    this.closed = true;
    this.socket.close();
    this.emit('disconnect');
}
WebSocket.prototype.send = function(data) {
    try {
        this.socket.write('\u0000' + data + '\uffff');
    } catch(e) {
        this.close();
    }
}
WebSocket.prototype._receive = function(data) {
    this.data += data;

    chunks = this.data.split('\ufffd');
    chunk_count = chunks.length - 1; // last chunk is either incomplete or ""

    for (var i = 0; i < chunk_count; i++) {
        chunk = chunks[i];
        if (chunk[0] != '\u0000') {
            this.log('Data incorrectly framed by UA. Dropping connection');
            this.close();
            return false;
        }

        this.emit('data', chunk.slice(1));
    }

    this.data = chunks[chunks.length - 1];
}


var Server = this.Server = function(options) {
    events.EventEmitter.call(this);

    this.options = tools.merge({
        port: 8080,
        host: 'localhost',
        origins: '*',
        tls: false
    }, options || {});

    this.connections = 0;

    var self = this;
}
sys.inherits(Server, events.EventEmitter);

Server.prototype.listen = function(port, host) {
    tcp.createServer(function(socket) {
        var ws = new WebSocket(socket);
        socket.addListener('connect', function() {
            self.clients++;
        });
        var data_listener = function(data) { // We need it named so we can unbind it later
            var ok = self.handshake(socket, data);
            if(!ok) return;

            // Delegate the rest of the handling to the WebSocket abstraction.
            socket.addListener('data', function(data) { ws._receive(data) });
            socket.removeListener('data', data_listener);
            self.emit('connect', ws);
        }
        socket.addListener('data', data_listener);
        socket.addListener('disconnect', function() {
            self.clients--;
        });
    }).listen(port, host);
};

Server.prototype.handshake = function(socket, data) {
    var headers = data.split('\r\n');

    // Serve flash policy?
    if (headers.length && headers[0].match(/<policy-file-request.*>/)) {
        this._serveFlashPolicy();
        return false;
    }

    // Perform handshake
    for (var i = 0, l = headers.length, match; i < l; i++) {
        if (i === requestHeadersMatch.length) break; // handle empty lines that UA send 
        match = headers[i].match(requestHeadersMatch[i]);
        if (match && match.length > 1) matches.push(match[1]);
        else if (!match) { // Bad handshake?
            socket.close();
            return false;
        }
    }

    // Check origin
    if (!this._verifyOrigin(matches[2])) {
        socket.close();
        return false;
    }

    // Send response handshake
    socket.write(tools.substitute(responseHeaders.join('\r\n'), {
        resource: matches[0],
        host: matches[1],
        origin: matches[2],
        protocol: this.secure ? 'wss' : 'ws'
    }));
    return true;
}

Server.prototype._serveFlashPolicy = function(socket) {
    var origins = this.options.origins;
    if (!tools.isArray(origins)) origins = [origins];

    this.socket.write('<?xml version="1.0"?>\n');
    this.socket.write('<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">\n');
    this.socket.write('<cross-domain-policy>\n');
    for (var i = 0, l = origins.length; i < l; i++) {
        this.socket.write('  <allow-access-from domain="' + origins[i] + '" to-ports="' + this.options.port + '"/>\n');
    }
    this.socket.write('</cross-domain-policy>\n');
    this.socket.close();
}

Server.prototype._verifyOrigin = function(origin) {
    if (this.options.origins === '*' || this.options.origins === origin) return true;
    if (!tools.isArray(this.options.origins)) {
        log('No valid `origins` array passed to constructor. This server wont accept any connections.', 'info');
        return false;
    }
    for (var i = 0, l = this.options.origins.length; i < l; i++) {
        if (this.options.origins[i] === origin) return true;
    }
    return false;
};


var Client = this.Client = function(options) {
    events.EventEmitter.call(this);

    this.options = tools.merge({
        port: 8080,
        host: 'localhost',
        origin: 'file://',
        tls: false
    }, options || {});
};
sys.inherits(Client, events.EventEmitter);

Client.prototype.connect = function() {
    var socket = tcp.createConnection(this.options.port, this.options.host);
    var ws = new WebSocket(socket);
    var self = this;
    socket.addListener('connect', function() {
        socket.send(tools.substitute(requestHeaders.join('\r\n'), {
            resource: self.options.resource,
            host: self.options.host,
            origin: self.options.origin,
        }));
    });
    var data_listener = function(data) { // We need it named so we can unbind it later
        var ok = self.handshake(socket, data);
        if(!ok) return;

        // Delegate the rest of the handling to the WebSocket abstraction.
        socket.addListener('data', function(data) { ws._receive(data) });
        socket.removeListener('data', data_listener);
        self.emit('connect', ws);
    }
    socket.addListener('data', data_listener);
}

Client.prototype.handshake = function(socket, data) {
    var headers = data.split('\r\n');

    // Perform handshake
    for (var i = 0, l = headers.length, end = responseHeadersMatch.length, match; i < l; i++) {
        if (i === end) break; // handle empty lines that UA send
        match = headers[i].match(responseHeadersMatch[i]);
        if (match && match.length > 1) matches.push(match[1]);
        else if (!match) { // Bad handshake
          this.socket.forceClose()
          return false;
        }
    }

    return true;
}
