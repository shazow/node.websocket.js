var NUM_CLIENTS=1; // Number of clients to make for this demo

var tools = require('./tools'),
    websocket = require('./websocket'),
    sys = require('sys');


function log(name, msg) {
    sys.puts(new Date() + " [" + name + "] " + msg);
}

function make_client(name) {
    var client = new websocket.Client();

    client.addListener('connect', function(ws) {
        log(name, "Connected.");

        function send(data) {
            log(name, "Sending: " + data);
            ws.write(data);
        }

        ws.addListener('data', function(data) {
            log(name, "Received: " + data);

            send("Ok, bye!");
            ws.close();
        });
        ws.addListener('close', function() {
            log(name, "Disconnected.");
        });
        send('Hi server, can you hear me?');
    });
    client.addListener('error', function(msg) {
        log(name, "Error: " + msg);
    });

    client.connect(8080, 'localhost');
}

log('root', "Making " + NUM_CLIENTS + " clients...");
for(var i=0; i<NUM_CLIENTS; i++) make_client("Client " + i);
log('root', "Done.");

