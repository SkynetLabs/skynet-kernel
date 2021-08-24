// The worker will wait until it receives a message, then responds 
onmessage = function(event) {
	console.log("worker has received a message");
	console.log(event.data);
	postMessage({
		result: event.data.testField
	});
}
