const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const parseMessage = require('gmail-api-parse-message');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

inicializar();

function inicializar() {
  // Load client secrets from a local file.
  fs.readFile('credentials.json', (err, content) => {
    if (err) return console.log('Error loading client secret file:', err);
    // Authorize a client with credentials, then call the Gmail API.
    authorize(JSON.parse(content), listMessages);
  });
}

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * Lists the labels in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function listMessages(auth) {
  try {
    const gmail = google.gmail({ version: 'v1', auth });
    let result = await gmail.users.messages.list({
      userId: 'me',
      q: 'oppenheimer'
    });
    
    console.log("starting loop", new Date());

    const promises = result.data.messages.map(async message => {
      const mh = await gmail.users.messages.get({
        id: message.id,
        userId: 'me'
      });
      const msgParsed = parseMessage(mh.data);
      return {
        from: msgParsed.headers.from, 
        to: msgParsed.headers.to, 
        date: msgParsed.headers.date, 
        textHtml: msgParsed.textHtml
      };
      // return mh.data.payload.headers.find(h => h.name === "From").value
    });

    // const froms = await Promise.all(promises);
    // const uniqueArray = froms.filter((from, i) => {
    //   return froms.indexOf(from) == i;
    // });
    // console.log("froms", uniqueArray);
    // console.log("loop end", new Date());

    const msgsObjArr = await Promise.all(promises);
    writeResult(msgsObjArr);

  } catch (error) {
    return console.log('The API returned an error: ' + error);
  }
}

async function writeResult(messagesArray){
  let resultContent = "<html><body style='padding:10px;'>";
  messagesArray.forEach(e => {
    resultContent+= `<div style='border: 1px solid #009;padding: 3px;font-family: sans-serif;color: #009;'>
    <p>Date: ${e.date}</p>
    <p>From: '${e.from.replace(/</g,'&lt;').replace(/>/g,'&gt;')}'</p>
    <p>To: '${e.to.replace(/</g,'&lt;').replace(/>/g,'&gt;')}'</p>
    </div>`;
    resultContent+= e.textHtml;
    resultContent+= "<hr style='height: 3px;background-color: #009;margin: 2rem 0;' />"
  });
  resultContent+= "</body></html>";
  fs.writeFile(`resultado_${new Date().getTime()}.html`, resultContent, (err) => {
    if (err) return console.error(err);
    console.log('se grabo el resultado en un archivo html');
  })
}