process.on("uncaughtException", function(){ console.error("uncaughtException"); });
var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var pg = require('pg');
app.use( express.static( './public' ) ); 
app.use(bodyParser.json());

var conString = JSON.parse(process.env.VCAP_SERVICES)["compose-for-postgresql"][0]["credentials"]["uri"];

var Conversation = require('watson-developer-cloud/conversation/v1'); 
var conversation = new Conversation({
  url: 'https://gateway.watsonplatform.net/conversation/api',
  version_date: '2016-10-21',
  version: 'v1'
});
var workspace = process.env.WORKSPACE_ID || '<workspace-id>';

app.post('/api/message', function(req, res) {
  if (!req.headers.apikey || !req.headers.appsecret) {
    return res.json({
      'output': {
        'text': 'Credenciales incorrectas.'
      }
    });
  }
  if (req.headers.apikey !== process.env.API_KEY || req.headers.appsecret !== process.env.APP_SECRET) {
    return res.json({
      'output': {
        'text': 'Credenciales incorrectas.'
      }
    });
  } 
  if (!workspace || workspace === '<workspace-id>') {
    return res.json({
      'output': {
        'text': 'No se ha especificado un WORKSPACE_ID en las variables de entorno.'
      }
    });
  }
  var payload = {
    workspace_id: workspace,
    context: req.body.context || {},
    input: req.body.input || {}
  };

  conversation.message(payload, function(err, data) {
    if (err) {
      return res.status(err.code || 500).json(err);
    }
    try {
      saveData(data, payload );
    } catch (err) {
      console.error('Error saving to database', err.stack);
    }
    
    return res.json(data);
  });
});

function saveData(response, input) {
  var client = new pg.Client(conString);
  client.connect(function (err) {
    if (err) throw err;
    var conversation_id = response.context.conversation_id;
    var message = response.output.text[0];
    var confidence = "0";
    var intent = "none";
    if (response.intents[0]) {
      confidence = response.intents[0].confidence;
      intent = response.intents[0].intent;
    }
    var inputString = "none";
    if (input) {
      inputString = input.input;
      if (inputString.text) {
        inputString = inputString.text;
      } else {
        inputString = "none";
      }
    }
    var producto = "none"
    if (response.context.producto){
      if (response.context.producto == "") {
        producto = "none";
      } else {
        producto = response.context.producto;
      }
    }
    var d = new Date,
        time = [d.getMonth()+1,
             d.getDate(),
             d.getFullYear()].join('-')+' '+
            [d.getHours(),
             d.getMinutes(),
             d.getSeconds()].join(':');

    client.query('INSERT INTO "public"."messages" ("conversation_id", "message", "confidence", "intent", "datetime", "input", "product") values ($1, $2, $3, $4, $5, $6, $7)', [conversation_id, message, confidence, intent, time, inputString, producto], function (err, result) {
      if (err) throw err;
      console.log("INSERTED"); 
      client.end(function (err) {
        if (err) throw err;
      });
    });
  });
}

var port = process.env.PORT || process.env.VCAP_APP_PORT || 3000;
app.listen(port, '0.0.0.0', function() {
  console.log("Servidor iniciado en el puerto " + port );
});