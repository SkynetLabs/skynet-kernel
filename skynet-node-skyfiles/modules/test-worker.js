onmessage = function(e) {
	console.log("worker has received a message");
	postMessage({someval: "hi"});
}
