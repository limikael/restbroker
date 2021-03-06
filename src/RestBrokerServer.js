const http=require("http");
const WebSocket=require("ws");
const ServerConnection=require("./ServerConnection");
const url=require("url");
const EventEmitter=require("events");
const restbrokerPackage=require("../package.json");

class RestBrokerServer extends EventEmitter {
	constructor() {
		super();

		this.httpServer=http.createServer(this.onHttpRequest);
		this.wsServer=new WebSocket.Server({server: this.httpServer});

		this.wsServer.on('connection',this.onWsConnection)

		this.connectionsById={};
		this.logEnabled=false;

		this.delay=5000;
	}

	setKey(key) {
		this.key=key;
	}

	setLogEnabled(enabled) {
		this.logEnabled=enabled;
	}

	log=(message)=>{
		if (this.logEnabled)
			console.log("** rbs: "+message);
	}

	onHttpRequest=(req, res)=>{
		this.log("HTTP request: "+req.url);

		let u=url.parse(req.url);
		let path=u.pathname.split("/").filter(x=>x);

		if (this.key && req.headers["x-api-key"]!=this.key) {
			res.statusCode=403;
			res.statusMessage="Bad api key.";
			res.end("Not authorized.");
			return;
		}

		if (path.length==0) {
			let response={
				devices: Object.keys(this.connectionsById),
				restbrokerVersion: restbrokerPackage.version
			};

			res.end(JSON.stringify(response,null,2)+"\n");
		}

		else {
			if (!Object.keys(this.connectionsById).includes(path[0])) {
				res.end("Device not connected");
				return;
			}

			let id=path[0];
			path=path.slice(1);
			req.url="/"+path.join("/")+(u.search?u.search:"");

			this.connectionsById[id].handleRequest(req,res);
		}
	}

	onWsConnection=(ws, req)=>{
		this.log("WebSocket connection.");

		let connection=new ServerConnection(this, ws, req);
		if (!connection.getId()) {
			this.log("Connection doesn't have an id, closing");
			connection.close();
			return;
		}

		if (this.key && connection.getKey()!=this.key) {
			this.log("Bad api key, closing.");
			connection.close();
			return;
		}

		let id=connection.getId();
		if (this.connectionsById[id]) {
			this.connectionsById[id].off("close",this.onConnectionClose);
			this.connectionsById[id].close();
			delete this.connectionsById[id];
		}

		connection.on("close",this.onConnectionClose);
		this.connectionsById[id]=connection;

		this.emit("connectionsChange");
	}

	onConnectionClose=(connection)=>{
		this.log("WebSocket connection closed.");

		connection.off("close",this.onConnectionClose);
		delete this.connectionsById[connection.getId()];

		this.emit("connectionsChange");
	}

	listen(port) {
		this.httpServer.listen(port);
		this.log("Listening to: "+port)
	}

	close() {
		for (let id in this.connectionsById)
			this.connectionsById[id].close();

		this.httpServer.close();
	}
}

module.exports=RestBrokerServer;
