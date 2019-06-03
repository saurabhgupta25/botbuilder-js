
const NamedPipe = require('../lib/');
const protocol = require('botframework-streaming-extensions-protocol');
const uuidv4 = require('uuid/v4');

class MockRequestHandler {
    constructor(request= () => any) {
        let _callback = request;
    }  

    async processRequestAsync(request) {
        return this._callback(request);
    }
}

class PendingResponse {
    constructor(){
        let validate = undefined;
        let response = undefined;
    }
    validate(value){
        if(value)
            this.validate = value;

        return this.validate;
    }
    response(value){
        if(value)
            this.response = value;

        return this.response;
    }
}

class MockFlow {
    constructor(pipeName) {
        //let _pipeName = undefined;
        let _client= undefined;
        let _server= undefined;
        let _pendingResponses= undefined;
        let _requestHandler= undefined;

        if (!pipeName) {
            pipeName = uuidv4();
        }
        this._pipeName = pipeName;

        this._requestHandler = new MockRequestHandler((request) => this.onReceive(request));
        this._client = new NamedPipe.NamedPipeClient(this._pipeName, this._requestHandler, false);
        this._server = new NamedPipe.NamedPipeServer(this._pipeName, this._requestHandler, false);
    }

    connect() {
        return new Promise((resolve, reject) => {
            let clientConnected = false;
            let serverConnected = false;

            this._server.startAsync().then(msg => {
                serverConnected = true;
                if (clientConnected && serverConnected) {
                    resolve(true);
                }
            });

            this._client.connectAsync().then(() => {
                clientConnected = true;
                if (clientConnected && serverConnected) {
                    resolve(true);
                }
            });
        });
    }

    clientSend(request, serverResponse, validate) {
        this._pendingResponses[this.getKey(request.Verb, request.Path)] = { response: serverResponse, validate: validate };
        return this._client.sendAsync(request, undefined);
    }

    serverSend(request, clientResponse, validate) {
        this._pendingResponses[this.getKey(request.Verb, request.Path)] = { response: clientResponse, validate: validate };
        return this._server.sendAsync(request, undefined);
    }

    disconnect() {
        this._client.disconnect();
        this._server.disconnect();
    }

    async onReceive(request){
        var pendingResponse = this._pendingResponses[this.getKey(request.Verb, request.Path)];
        if (pendingResponse.validate) {
            await pendingResponse.validate(request);
        }
        return pendingResponse.response;
    }

    getKey(verb, path) {
        return verb + ':' + path;
    }
}

describe('End to End Protocol Tests', () => {
    it('send from client to server', async () => {
        var mock = new MockFlow();

        await mock.connect();

        try {
            var request = Request.create('GET', '/.bot/conversations');
            var response = Response.create(200);

            var receiveResponse = await mock.clientSend(request, response);

            expect(receiveResponse.StatusCode).toBe(200);
        }
        finally {
            mock.disconnect();
        }
    });

    it('send from server to client', async () => {
        var mock = new MockFlow();

        await mock.connect();

        try {
            var request = Request.create('POST', '/.bot/conversations/activities');
            var response = Response.create(201);

            var receiveResponse = await mock.serverSend(request, response);

            expect(receiveResponse.StatusCode).toBe(201);
        }
        finally {
            mock.disconnect();
        }
    });


    it('send both', async () => {
        var mock = new MockFlow();

        await mock.connect();

        try {

            var r1 = await mock.serverSend(
                Request.create('POST', '/.bot/conversations/activities'),
                Response.create(201));

            var r2 = await mock.clientSend(
                Request.create('GET', '/.bot/conversations'),
                Response.create(200));


            expect(r1.StatusCode).toBe(201);
            expect(r2.StatusCode).toBe(200);
        }
        finally {
            mock.disconnect();
        }
    });

    it('send string body from client to server', async () => {
        var mock = new MockFlow();

        await mock.connect();

        try {
            var content = 'Streaming FTW!';
            var request = Request.create('GET', '/.bot/conversations');
            request.setBody(JSON.stringify(content));
            var response = Response.create(200);

            var receiveResponse = await mock.clientSend(request, response, async (rr) => {
                expect(rr.Streams).toBeDefined();
                expect(rr.Streams.length).toBe(1);
                let resultBody = await JSON.stringify(rr.Streams[0]);

                expect(resultBody).toBe(content);
            });

            expect(receiveResponse.StatusCode).toBe(200);
        }
        finally {
            mock.disconnect();
        }
    });

    it('send object body from client to server', async () => {
        var mock = new MockFlow();

        await mock.connect();

        try {
            var content = { message: 'Streaming FTW!' };
            var request = Request.create('GET', '/.bot/conversations');
            request.setBody(JSON.stringify(content));
            var response = Response.create(200);

            var receiveResponse = await mock.clientSend(request, response, async (rr) => {
                expect(rr.Streams).toBeDefined();
                expect(rr.Streams.length).toBe(1);
                let resultObj = await rr.Streams[0].readAsJson();

                expect(resultObj.message).toBe(content.message);
            });

            expect(receiveResponse.StatusCode).toBe(200);
        }
        finally {
            mock.disconnect();
        }
    });

    it('send object body from server to client', async () => {
        var mock = new MockFlow();

        await mock.connect();

        try {
            var content = { message: 'Streaming FTW!' };
            var request = Request.create('POST', '/.bot/conversations');
            request.setBody(JSON.stringify(content));
            var response = Response.create(200);

            var receiveResponse = await mock.serverSend(request, response, async (rr) => {
                expect(rr.Streams).toBeDefined();
                expect(rr.Streams.length).toBe(1);
                let resultObj = await rr.Streams[0].readAsJson();

                expect(resultObj.message).toBe(content.message);
            });

            expect(receiveResponse.StatusCode).toBe(200);
        }
        finally {
            mock.disconnect();
        }
    });

    it('reply with object body from server to client', async () => {
        var mock = new MockFlow();

        await mock.connect();

        try {
            var content = { message: 'Streaming FTW!' };
            var request = Request.create('GET', '/.bot/conversations');
            var response = Response.create(200);
            response.setBody(content);

            var rr = await mock.serverSend(request, response);

            expect(rr.StatusCode).toBe(200);
            expect(rr.Streams).toBeDefined();
            expect(rr.Streams.length).toBe(1);
            let resultObj = await rr.Streams[0].readAsJson();

            expect(resultObj.message).toBe(content.message);
        }
        finally {
            mock.disconnect();
        }
    });

    it('send and receive both with bodies', async () => {
        var mock = new MockFlow();

        await mock.connect();

        try {
            var requestBody = { message: 'Yo! Yo! I am the request body!!' };
            var request = Request.create('GET', '/.bot/conversations');
            request.setBody(JSON.stringify(requestBody));
            var response = Response.create(200);
            var responseBody = { message: 'I am the reply body. Hear my meow!' };
            response.setBody(responseBody);

            var rr = await mock.serverSend(request, response, async (rr) => {
                expect(rr.Streams).toBeDefined();
                expect(rr.Streams.length).toBe(1);
                let resultObj = await rr.Streams[0].readAsJson();

                expect(resultObj.message).toBe(requestBody.message);
            });

            expect(rr.StatusCode).toBe(200);
            expect(rr.Streams).toBeDefined();
            expect(rr.Streams.length).toBe(1);
            let resultObj = await rr.Streams[0].readAsJson();

            expect(resultObj.message).toBe(responseBody.message);
        }
        finally {
            mock.disconnect();
        }
    });
});