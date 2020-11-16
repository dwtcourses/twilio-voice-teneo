require("dotenv").config();
var express = require("express");
const VoiceResponse = require("twilio").twiml.VoiceResponse;
var router = express.Router();

const accountSid = process.env.ACCOUNT_SID;
const authToken = process.env.AUTH_TOKEN;
const client = require("twilio")(accountSid, authToken);

const twilioNumber = process.env.TWILLIO_NUMBER;

router.post("/", function (req, res, next) {
  // This should be the publicly accessible URL for your application
  // Here, we just use the host for the application making the request,
  // but you can hard code it or use something different if need be
  var supportNumber = request.body.supportNumber;
  var url =
    "http://" +
    request.headers.host +
    "/outbound/" +
    encodeURIComponent(salesNumber);

  var options = {
    to: request.body.phoneNumber,
    from: twilioNumber,
    url: url,
  };

  // Place an outbound call to the user, using the TwiML instructions
  // from the /outbound route
  client.calls
    .create(options)
    .then((message) => {
      console.log(message.responseText);
      response.send({
        message: "Thank you! We will be calling you shortly.",
      });
    })
    .catch((error) => {
      console.log(error);
      response.status(500).send(error);
    });
});

router.post("/:salesNumber", function (request, response) {
  var salesNumber = request.params.salesNumber;
  var twimlResponse = new VoiceResponse();

  twimlResponse.say(
    "Thanks for contacting our support team. Our " +
      "next available representative will take your call. ",
    { voice: "alice" }
  );

  twimlResponse.dial(salesNumber);

  response.send(twimlResponse.toString());
});

module.exports = router;
