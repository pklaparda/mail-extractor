const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const parseMessage = require('gmail-api-parse-message');
const decomment = require('decomment');
const striptags = require('striptags');
// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';
// const SEARCH_WORDS = ['casher', 'kosher', 'mehadrin', 'b60', 'permitido', 'kashrus', "envios"];
const SEARCH_WORDS = ['Envios Ajdut Kosher'];

Array.prototype.unique = function () {
  let a = this.concat();
  for (let i = 0; i < a.length; ++i) {
    for (let j = i + 1; j < a.length; ++j) {
      if (a[i] === a[j])
        a.splice(j--, 1);
    }
  }
  return a;
};

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
 * Lists the mails in the user's account matching the requested parameters.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function listMessages(auth) {
  try {
    const gmail = google.gmail({ version: 'v1', auth });
    
    const messagesArraysPromises = SEARCH_WORDS.map(async word => {
      return await gmail.users.messages.list({
        userId: 'me',
        q: word
      });
    });

    let messageIds = [];
    const result = await Promise.all(messagesArraysPromises);
    result.map(res => res.data.messages.map(m => m.id))
      .forEach(arr => {
        messageIds = [...messageIds, ...arr]
      });
    messageIds = messageIds.unique();

    // no puedo usar la logica en paralelo, porque excede el numero de request x segundo...
    // const promises = messageIds.map(async id => {
    //   const mh = await gmail.users.messages.get({
    //     id: id,
    //     userId: 'me'
    //   });
    //   const msgParsed = parseMessage(mh.data);
    //   return {
    //     from: msgParsed.headers.from, 
    //     to: msgParsed.headers.to, 
    //     date: msgParsed.headers.date, 
    //     textHtml: msgParsed.textHtml,
    //     subject: msgParsed.headers.subject
    //   };
    // });
    // const msgsObjArr = await Promise.all(promises);
    let mails = [];

    for (id of messageIds) {
      const mh = await gmail.users.messages.get({
        id: id,
        userId: 'me'
      });
      const msgParsed = parseMessage(mh.data);
      mails.push({
        from: msgParsed.headers.from,
        to: msgParsed.headers.to,
        date: msgParsed.headers.date,
        textHtml: msgParsed.textHtml,
        subject: msgParsed.headers.subject
      });
    }
    writeResult(mails);

  } catch (error) {
    return console.log('The API returned an error: ' + error);
  }
}

async function writeResult(messagesArray) {
  
  messagesArray.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let resultContent = `<html><head id='principal'/>
  </head>
  <body style='padding:10px !important;background-color:firebrick;font-family:arial, sans-serif'>`;
  resultContent += `<div class="my-great-card">
    <div class="my-great-card-body">
    <h3 class="my-great-card-title">Resultado de busqueda en base a las palabras:</h3>
    <h4 class="my-great-text-muted my-great-mb-1">${SEARCH_WORDS.join(", ")}</h4>
    </div>
  </div>
  <br />`;

  messagesArray.forEach(e => {
    let t = "-sin información-";
    if(e.textHtml!==undefined){
      t = decomment(e.textHtml);
      t = striptags(t, ['a', 'div','p','h1','h2','h3','h4','h5','h6','hr','br','b','ul','li','blockquote','span','font']);
      t = striptags(t, ["td"], '\n');
      
      SEARCH_WORDS.forEach(word=>{
        const regex = new RegExp(word, "gi");
        t = t.replace(regex, `<span style='background-color:darksalmon;'>${word}</span>`);
      });
      //and this is for getting the email clear
      const regexEmail = new RegExp("Email: ", "gi");
      t = t.replace(regexEmail, "<br />Email: <span style='background-color:darksalmon;'>");
      const regexMensaje = new RegExp("Mensaje: ", "gi");
      t = t.replace(regexMensaje, "</span><br />Mensaje");
    }
    resultContent += `
    <div class="my-great-card">
      <div class="my-great-card-body">
        <span class="my-great-text-muted">${new Date(e.date).toString()}</span>
        <h3 class="my-great-card-title">${e.subject}</h5>
        <h4 class="my-great-text-muted my-great-mb-1">From: ${e.from !== undefined ? e.from.replace(/</g, '&lt;').replace(/>/g, '&gt;') : "-sin información-"}</h6>
        <h4 class="my-great-mb-2 my-great-text-muted">To: ${e.to !== undefined ? e.to.replace(/</g, '&lt;').replace(/>/g, '&gt;') : "-sin información-"}</h6>
        <div>${t}</div>
      </div>
    </div>
    `;
    resultContent += "<br />"
  });
  resultContent += `
  <script>
    document.querySelectorAll("style").forEach(s=>s.remove());
    document.querySelector("head#principal").innerHTML = "<style>.my-great-card{position: relative;display: flex;flex-direction: column;min-width: 0;word-wrap: break-word;background-color: #fff;background-clip: border-box;border: 1px solid rgba(0,0,0,.125);border-radius: .25rem;box-sizing: border-box;}.my-great-card-body{flex: 1 1 auto;padding: 1.25rem;}.my-great-card-title{margin-bottom: .75rem !important;margin-top:0.25rem !important;}.my-great-text-muted{color: #6c757d!important;}.my-great-mb-1{margin-bottom: .25rem!important;margin-top:0.25rem !important;}.my-great-mb-2{margin-bottom: .5rem!important;margin-top:0.25rem !important;}</style>";
  </script>`;
  
  resultContent += "</body></html>";
  fs.writeFile(`results/resultado_${new Date().getTime()}.html`, resultContent, (err) => {
    if (err) return console.error(err);
    console.log('se grabo el resultado en un archivo html');
  })
}