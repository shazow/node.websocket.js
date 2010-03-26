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


var WebSocket = this.WebSocket = function(socket) {
    events.EventEmitter.call(this);

    socket.setTimeout(0);
    //socket.setNoDelay(true);
    socket.setEncoding('utf8');

    this.socket = socket;
    this.closed = false;
    this.readyState = 0;
    this.data = "";

    var self = this;
    socket.addListener('end', function(had_error) { self.close(had_error); });
}
sys.inherits(WebSocket, events.EventEmitter);

WebSocket.prototype.close = function(had_error) {
    if(this.closed) return;
    this.closed = true;
    this.socket.close();
    this.emit('end', had_error);
}
WebSocket.prototype.write = function(data) {
    try {
        this.socket.write('\u0000' + data + '\uffff');
    } catch(e) {
        this.close();
    }
}
WebSocket.prototype._receive = function(data) {
    if(this.closed) return; // FIXME: Do we care if we receive more data after closing?
    this.data += data;

    chunks = this.data.split('\ufffd');
    chunk_count = chunks.length - 1; // last chunk is either incomplete or ""

    for (var i = 0; i < chunk_count; i++) {
        chunk = chunks[i];
        if (chunk[0] != '\u0000') {
            this.emit('error', 'Data incorrectly framed by UA');
            this.close();
            return false;
        }

        this.emit('data', chunk.slice(1));
    }

    this.data = chunks[chunk_count];
}
WebSocket.prototype.toString = function() {
    return "[WebSocket @ " + this.socket.remoteAddress + "]";
}


var Server = this.Server = function(options) {
    events.EventEmitter.call(this);

    this.options = tools.merge({
        port: 8080,
        host: 'localhost',
        origins: '*',
        secure: false,
        tls: false
    }, options || {});

    this.connections = 0;
}
sys.inherits(Server, events.EventEmitter);

Server.prototype.listen = function(port, host) {
    var self = this;
    this.socket = tcp.createServer(function(socket) {
        if (self.options.tls) socket.setSecure();
        var ws = new WebSocket(socket);

        socket.addListener('connect', function() {
            self.clients++;
        });
        socket.addListener('end', function() {
            self.clients--;
        });
        socket.addListener('data', function handshake_listener(data) {
            socket.pause();
            socket.removeListener('data', handshake_listener);
            ws.readyState++; // Begin handshake

            var target = self.handshake(socket, data);
            if(!target) {
                ws.close();
                return; // Handshake failed
            }

            ws.readyState++; // Done handshake
            self.emit('connect', ws, target);

            socket.addListener('data', function(data) { ws._receive(data); });
            socket.resume();
        });
    });
    this.socket.listen(port, host);
};

Server.prototype.handshake = function(socket, data) {
    var headers = data.split('\r\n');
    var matches = [];

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
            this.emit('error', 'Bad handshake');
            return false;
        }
    }

    // Check origin
    if (!this._verifyOrigin(matches[2])) {
        this.emit('error', 'Bad origin');
        return false;
    }

    // Send response handshake
    socket.write(tools.substitute(responseHeaders.join('\r\n'), {
        resource: matches[0],
        host: matches[1],
        origin: matches[2],
        protocol: this.options.secure ? 'wss' : 'ws'
    }));

    return matches[0]; // Target request
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
    if (!this.options.origins || this.options.origins === '*' || this.options.origins === origin) return true;
    for (var i = 0, l = this.options.origins.length; i < l; i++) {
        if (this.options.origins[i] === origin) return true;
    }
    this.emit('error', 'Origin rejected: ' + origin);
    return false;
};


var Client = this.Client = function(options) {
    events.EventEmitter.call(this);

    this.options = tools.merge({
        port: 8080,
        host: 'localhost',
        origin: 'file://', /// FIXME: What should this be default?
        resource: '/',
        secure: false,
        tls: false
    }, options || {});
};
sys.inherits(Client, events.EventEmitter);

Client.prototype.connect = function(port, host) {
    var socket = tcp.createConnection(port, host);
    if (this.options.tls) socket.setSecure();

    var ws = new WebSocket(socket);
    var self = this;
    socket.addListener('connect', function() {
        socket.write(tools.substitute(requestHeaders.join('\r\n'), {
            resource: self.options.resource,
            host: self.options.host,
            origin: self.options.origin,
        }));
    });
    socket.addListener('data', function handshake_listener(data) {
        socket.pause();
        socket.removeListener('data', handshake_listener);
        ws.readyState++; // Begin handshake

        var ok = self.handshake(socket, data);
        if(!ok) {
            ws.close();
            return;
        }

        ws.readyState++; // Done handshake
        self.emit('connect', ws, ok);

        socket.addListener('data', function(data) { ws._receive(data); });
        socket.resume();
    });
}

Client.prototype.handshake = function(socket, data) {
    var data_sep = data.indexOf('\ufffd');
    var data_extra = false;
    if(data_sep >= 0) {
        data_extra = data.substr(data_sep);
        data = data.substr(0, data_sep);
    }

    var headers = data.split('\r\n');
    var matches = [];

    // Perform handshake
    for (var i = 0, l = headers.length, end = responseHeadersMatch.length, match; i < l; i++) {
        if (i === end) break; // handle empty lines that UA send
        match = headers[i].match(responseHeadersMatch[i]);
        if (match && match.length > 1) matches.push(match[1]);
        else if (!match) { // Bad handshake
            this.emit('error', 'Bad handshake');
            socket.forceClose()
            return false;
        }
    }

    return true;
}
