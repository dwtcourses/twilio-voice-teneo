require("dotenv").config();
var express = require("express");
var router = express.Router();
const chalk = require("chalk");
// const qs = require("querystring");
const VoiceResponse = require("twilio").twiml.VoiceResponse;
const TIE = require("@artificialsolutions/tie-api-client");
const Pusher = require("pusher");
const striptags = require("striptags");
const {
  PUSHER_APPID,
  PUSHER_KEY,
  PUSHER_SECRET,
  PUSHER_HOST,
  TENEO_ENGINE_URL,
  WEBHOOK_FOR_TWILIO,
  ACCOUNT_SID,
  AUTH_TOKEN,
  FIRST_INPUT_FOR_TENEO,
  LANGUAGE_STT,
  LANGUAGE_TTS,
  PORT,
  CTX_PARAMS,
} = process.env;

const pusher = new Pusher({
  appId: PUSHER_APPID,
  key: PUSHER_KEY,
  secret: PUSHER_SECRET,
  host: PUSHER_HOST,
  encrypted: false,
});
const port = PORT || 1337;
const teneoApi = TIE.init(TENEO_ENGINE_URL);
const firstInput = FIRST_INPUT_FOR_TENEO || "";
const language_STT = LANGUAGE_STT || "en-GB";
const language_TTS = LANGUAGE_TTS || "Polly.Emma";
const accountSid = ACCOUNT_SID || ""; // Only required for SMS or outbound calls
const authToken = AUTH_TOKEN || ""; // Only required for SMS or outbound calls

console.log(language_STT);
console.log(language_TTS);

/***
 * VERY BASIC SESSION HANDLER
 ***/

var keyPair = new Map();

function getSession(userId) {
  var sessionId = "";
  sessionId = keyPair.get(userId);
  if (typeof sessionId == "undefined") sessionId = null;
  return sessionId;
}

function setSession(userId, sessionId) {
  keyPair.set(userId, sessionId);
}

/* GET home page. */
router.post("/", function (req, res, next) {
  const post = req.body;
  var textToSend = "";

  console.log(post);

  if (post.CallStatus == "ringing") {
    // If first input of call, send default input to Teneo (blank here)
    textToSend = firstInput;
  } else if ((post.CallStatus = "in-progress" && post.SpeechResult)) {
    // Spoken responses
    textToSend = post.SpeechResult;
  } else if ((post.CallStatus = "in-progress" && post.Digits)) {
    // DTMF Input
    textToSend = post.Digits;
  } else {
    // Unrecognized, send blank
    textToSend = "";
  }

  var callId = post.CallSid;
  var phoneNumber = post.Caller;
  var teneoSessionId = getSession(callId);

  if (textToSend) {
    pusher.trigger("ivr", "user_input", {
      message: textToSend,
    });
  }

  let requestCtx = {
    text: textToSend,
    channel: "twilio",
    phoneNumber: phoneNumber,
  };

  if (CTX_PARAMS) {
    let params = CTX_PARAMS.split(",");
    console.log("Split params", params);
    params.forEach((elem) => {
      let pair = elem.split("=");
      requestCtx[pair[0].trim()] = pair[1].trim();
    });
  }

  console.log(`Full CTX to Teneo`, requestCtx);

  teneoApi
    .sendInput(teneoSessionId, requestCtx)
    .then((teneoResponse) => {
      setSession(callId, teneoResponse.sessionId);

      const twiml = new VoiceResponse();
      var response = null;

      var customTimeout = "auto";
      if (teneoResponse.output.parameters.twilio_customTimeout) {
        customTimeout = teneoResponse.output.parameters.twilio_customTimeout;
      }

      var customVocabulary = ""; // If the output parameter 'twilio_customVocabulary' exists, it will be used for custom vocabulary understanding.  This should be a comma separated list of words to recognize
      if (teneoResponse.output.parameters.twilio_customVocabulary) {
        customVocabulary =
          teneoResponse.output.parameters.twilio_customVocabulary;
      }

      if (teneoResponse.output.parameters.twilio_smsText) {
        // If the output parameter 'twilio_smsText' exists, send a text
        console.log(
          "SMS Sent from " +
            post.Called +
            " to " +
            phoneNumber +
            " with the message " +
            striptags(teneoResponse.output.parameters.twilio_smsText)
        );

        const client = require("twilio")(accountSid, authToken);
        client.messages
          .create({
            from: post.Called,
            body: striptags(teneoResponse.output.parameters.twilio_smsText),
            to: phoneNumber,
          })
          .then((message) => console.log(message.sid));
      }

      response = twiml.gather({
        language: "en-ZA",
        hints: customVocabulary,
        action: WEBHOOK_FOR_TWILIO,
        input: "speech dtmf",
        speechTimeout: 1,
      });

      if (teneoResponse.output.parameters.twilio_endCall == "true") {
        response.say(
          {
            voice: language_TTS,
          },
          striptags(teneoResponse.output.text)
        );
        // If the output parameter 'twilio_endcall' exists, the call will be ended
        response = twiml.hangup();
      } else {
        console.log(
          "Custom vocab: " +
            teneoResponse.output.parameters.twilio_customVocabulary
        );
        var textToSay = teneoResponse.output.text;
        if (teneoResponse.output.parameters.twilio_customOutput)
          // If the output parameter 'twilio_customOutput' exists, read this instead of output text
          textToSay = teneoResponse.output.parameters.twilio_customOutput;

        if (teneoResponse.output.parameters.tts) {
          // If the output parameter 'tts' exists, it will be used for the answer text
          textToSay = teneoResponse.output.parameters.tts;
        }

        textToSay = striptags(textToSay);

        pusher.trigger("ivr", "teneo_answer", {
          message: textToSay,
        });

        response.say(
          {
            voice: language_TTS,
          },
          textToSay
        );
      }

      console.log(chalk.yellow("Caller ID: " + callId));
      if (textToSend) console.log(chalk.green("Captured Input: " + textToSend));
      if (teneoResponse.output.text)
        console.log(chalk.blue("Spoken Output: " + textToSay));

      res.writeHead(200, { "Content-Type": "text/xml" });
      res.end(twiml.toString());
    })
    .catch(function (e) {
      console.log(e); // "oh, no!"
    });
});

console.log(
  chalk.bold(
    "Twilio will send messages to this server on: " +
      WEBHOOK_FOR_TWILIO +
      ":" +
      port
  )
);

module.exports = router;
