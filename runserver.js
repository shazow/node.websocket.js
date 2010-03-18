var tools = require('./tools'),
    websocket = require('./websocket');


function log(msg) {
        sys.puts(msg);
}

var server = new websocket.Server(tools.argvToObject(process.ARGV));

server.addListener('connect', function(ws, target) {
    log("Request for: " + target);
});

server.listen(8000, 'localhost');

