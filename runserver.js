var sys = require('sys'),
    websocket = require('./websocket');


function log(name, msg) {
    sys.puts(new Date() + " [" + name + "] " + msg);
}

var server = new websocket.Server({}); // Accepts various options

var count = 0;
server.addListener('connect', function(ws, target) {
    /* Event only triggered once a websocket connection is established
     * and the handshake is completed. */
    var name = "Client " + count++;

    log(name, "Received request for: " + target);

    // Setup listeners for this specific websocket connection

    ws.addListener('data', function(data) {
        log(name, "Received: " + data);
    });
    ws.addListener('end', function() {
        log(name, "Disconnected.");
    });
    ws.addListener('error', function(msg) {
        log(name, "Transmission error: " + msg); // Things like bad UA data padding.
    });

    log(name, "Sending hi...");
    ws.write("Hi client.");
});
server.addListener('error', function(msg) {
    log('Error', msg); // Things like bad handshake, bad origin
});

server.listen(8080, 'localhost'); // This could be parsed from ARGV, up to you.
