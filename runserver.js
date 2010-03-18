var sys = require('sys'),
    tools = require('./tools'),
    websocket = require('./websocket');


function log(name, msg) {
    sys.puts("[" + name + "] " + msg);
}

var server = new websocket.Server(tools.argvToObject(process.ARGV));

var count = 0;
server.addListener('connect', function(ws, target) {
    var name = "Client " + count++;
    log(name ,"Received request for: " + target);

    ws.addListener('data', function(data) {
        log(name, "Received: " + data);
        ws.write("Hi client.");
    });
    ws.addListener('end', function() {
        log(name, "Disconnected.");
    });
});

server.listen(8080, 'localhost');

