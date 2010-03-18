var tools = require('./tools'),
    websocket = require('./websocket'),
    sys = require('sys');


function log(name, msg) {
        sys.puts("[" + name + "] " + msg);
}

function make_client(name) {
    var client = new websocket.Client(tools.argvToObject(process.ARGV));

    client.addListener('connect', function(ws) {
        log(name, "Connected.");
        ws.addListener('data', function(data) {
            log(name, "Received: " + data);
        });
        ws.addListener('close', function() {
            log(name, "Disconnected.");
        });
        ws.write('Hi server.');
    });

    client.connect();
}

for(var i=0; i<5; i++) make_client("Client " + i);

