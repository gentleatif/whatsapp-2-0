const { Client, ClientInfo, MessageMedia, NoAuth } = require("whatsapp-web.js");
const csv = require("csvtojson");
const express = require("express");
const { body, validationResult } = require("express-validator");
const socketIO = require("socket.io");
const qrcode = require("qrcode");
const http = require("http");
const fs = require("fs");
const { phoneNumberFormatter } = require("./helpers/formatter");
const fileUpload = require("express-fileupload");
const bodyParser = require("body-parser");
const { constants } = require("buffer");
const port = process.env.PORT || 8000;
var cors = require("cors");

// const isLoggedIn = require("./helpers/auth");
const app = express();

// Note that this option available for versions 1.0.0 and newer.
// for parsing file from
app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: "/tmp/",
  })
);
// parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());

app.use(express.urlencoded({ extended: true }));

// parse application/json
app.use(bodyParser.json());
// for using custom style
app.use(express.static(__dirname + "/public"));

const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(
  express.urlencoded({
    extended: true,
  })
);

// const client = new Client({ puppeteer: { args: ["--no-sandbox"] } });
const client = new Client({
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});
client.on("message", (msg) => {
  if (msg.body == "!ping") {
    msg.reply("pong");
  } else if (msg.body == "good morning") {
    msg.reply("Good Mrng");
  } else if (msg.body == "!groups") {
    client.getChats().then((chats) => {
      const groups = chats.filter((chat) => chat.isGroup);

      if (groups.length == 0) {
        msg.reply("You have no group yet.");
      } else {
        let replyMsg = "*YOUR GROUPS*\n\n";
        groups.forEach((group, i) => {
          replyMsg += `ID: ${group.id._serialized}\nName: ${group.name}\n\n`;
        });
        replyMsg +=
          "_You can use the group id to send a message to the group._";
        msg.reply(replyMsg);
      }
    });
  }
});

client.initialize();

// Socket IO
io.on("connection", function (socket) {
  socket.emit("message", "Connecting...");

  client.on("qr", (qr) => {
    console.log("QR RECEIVED", qr);
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit("qr", url);
      // socket.emit("message", "QR Code received, scan please!");
    });
  });

  client.on("ready", async (e) => {
    socket.emit("message", "Whatsapp is ready!");
    socket.emit("ready", "Call send Message route");
  });
  client.on("authenticated", (e) => {
    socket.emit("authenticated", "Authentication in Process...!!");
    socket.emit("message", "Authentication in Process...!");
  });

  client.on("auth_failure", function (session) {
    socket.emit("message", "Auth failure, restarting...");
  });

  client.on("disconnected", (reason) => {
    client.logout();
    client.destroy();
    client.initialize();

    // redirect to login page
    // restart app on disconnect

    // socket.emit("status", "0");
  });
});
const checkRegisteredNumber = async function (number) {
  const isRegistered = await client.isRegisteredUser(number);
  return isRegistered;
};
const permittedUser = [
  "917463923166",
  "916202500409",
  "917226090089",
  "918488049280",
  "917463923165",
];
function isLoggedIn(req, res, next) {
  if (client.info != undefined) return next();
  res.redirect("/unauthorized");
  // return next();
}
app.get("/", (req, res) => {
  // check if logged in
  if (client.info != undefined) {
    res.redirect("/send-message");
  } else {
    res.sendFile("index.html", {
      root: __dirname,
    });
  }
});
app.get("/unauthorized", (req, res) => {
  res.sendFile("unauthorized.html", {
    root: __dirname,
  });
});
// send user for auth when clicked on login icon

app.get("/signout", function (req, res) {
  if (client.info == undefined) {
    console.log("No user is logged in");
    res.redirect("/");
  } else {
    console.log("User was logged in");
    client.info.wid.user = "";
    client.logout();
    res.redirect("/");
  }
});

// Send message

app.get("/send-message", isLoggedIn, (req, res) => {
  res.sendFile("message.html", {
    root: __dirname,
  });
});
//visit bulk msg page
app.get("/send-bulkmsg", isLoggedIn, (req, res) => {
  res.sendFile("bulkMsg.html", {
    root: __dirname,
  });
});
//visit bulk msg page
app.get("/send-media", isLoggedIn, (req, res) => {
  console.log(client);
  res.sendFile("bulkMedia.html", {
    root: __dirname,
  });
});
app.post(
  "/send-message",
  [body("number").notEmpty(), body("message").notEmpty()],
  async (req, res) => {
    const errors = validationResult(req).formatWith(({ msg }) => {
      return msg;
    });

    if (!errors.isEmpty()) {
      return res.status(422).json({
        status: false,
        message: errors.mapped(),
      });
    }

    const formattedNo = `91${req.body.number}@c.us`;

    const message = req.body.message;
    console.log(formattedNo, message);

    const isRegisteredNumber = await checkRegisteredNumber(formattedNo);

    if (!isRegisteredNumber) {
      return res.status(422).json({
        status: false,
        message: "The number is not registered",
      });
    }

    client
      .sendMessage(formattedNo, message)
      .then((response) => {
        console.log("response ====>", response);
        res.status(200).json({
          status: true,
          response: response,
        });
      })
      .catch((err) => {
        res.status(500).json({
          status: false,
          response: err,
        });
      });
  }
);

// bulk message
app.post("/send-bulkmsg", async (req, res) => {
  const userEnteredNo = req.body.number;
  const message = req.body.message;
  const message2 = req.body.message2;
  const salutation = req.body.salutation;
  // validation
  if (req.files == null && userEnteredNo[4] == undefined) {
    return res.status(400).json({
      status: false,
      response: "Please Provide contact no. or select file",
    });
  }
  if (salutation == "") {
    return res.status(422).json({
      status: false,
      message: "Please Enter Salutation",
    });
  }

  if (message == "") {
    return res.status(422).json({
      status: false,
      message: "Please Enter Salutation Description",
    });
  }
  // validation end
  //1. csv file No
  if (req.files && req.files.file.mimetype == "text/csv") {
    console.log("User Provided csv contacts");
    let contacts = await csv().fromFile(req.files.file.tempFilePath);
    contacts = contacts.filter((contact) => contact.Phone != undefined);
    const names = contacts.map((contact) => contact.Name.split(" ")[0]);
    contacts = contacts.map((contact) => `91${contact.Phone}@c.us`);
    contacts.forEach((singleNo, index, array) => {
      const interval = 5000;
      setTimeout(function () {
        client
          .sendMessage(
            singleNo,
            salutation + " " + names[index] + "," + "\n" + message
          )
          .then((response) => {
            client
              .sendMessage(singleNo, message2)
              .then((response) => {
                console.log("response ===>", response);
                if (index == array.length - 1) {
                  return res.status(200).json({
                    status: true,
                    response: response,
                  });
                }
              })
              .catch((err) => {
                return res.status(500).json({
                  status: false,
                  response: err,
                });
              });
          }, index * interval);
      });
    });
  }
  // 2. user entered no and not csv file
  if (userEnteredNo[4] != undefined && req.files == null) {
    console.log("User Entered Mobile No");
    // format userEntered no in desired form
    let formattedNo = [];
    const UserInputNo = JSON.parse(userEnteredNo);
    UserInputNo.forEach((num) => {
      formattedNo.push(`91${num}@c.us`);
    });
    console.log("formatted no ===>", formattedNo);

    // send message for each no.
    formattedNo.forEach((singleNo, index, array) => {
      const interval = 5000;
      setTimeout(function () {
        client
          .sendMessage(singleNo, salutation + " " + "\n" + message)
          .then((response) => {
            client
              .sendMessage(singleNo, message2)
              .then((response) => {
                console.log("response ===>", response);
                if (index == array.length - 1) {
                  return res.status(200).json({
                    status: true,
                    response: response,
                  });
                }
              })
              .catch((err) => {
                return res.status(500).json({
                  status: false,
                  response: err,
                });
              });
          }, index * interval);
      });
    });
  }
});
// Send media AND bulk message

app.post("/send-media", async (req, res) => {
  console.log("send media called");
  console.log("req.files======> ", req.files);

  const file = [];
  if (req.files?.file1 != null) {
    const img = {
      img: req.files.file1,
      caption: req.body.caption1,
    };
    file.push(img);
  }
  if (req.files?.file2 != null) {
    const img = {
      img: req.files.file2,
      caption: req.body.caption2,
    };
    file.push(img);
  }
  if (req.files?.file3 != null) {
    const img = {
      img: req.files.file3,
      caption: req.body.caption3,
    };
    file.push(img);
  }
  if (req.files?.file4 != null) {
    const img = {
      img: req.files.file4,
      caption: req.body.caption4,
    };
    file.push(img);
  }
  // if all of the above file is null then return error
  if (file.length == 0) {
    return res.status(422).json({
      status: false,
      response: "Please Provide atleast one file to send",
    });
  }

  const userEnteredNo = req.body.number;
  const data = file.map((singleFile) => {
    const data = {
      mimetype: singleFile.img.mimetype,
      name: singleFile.img.name,
      data: fs.readFileSync(singleFile.img.tempFilePath).toString("base64"),
      caption: singleFile.caption,
    };
    return data;
  });

  const files = data.map((singleData) => {
    const imgData = {
      caption: singleData.caption,
      media: new MessageMedia(
        singleData.mimetype,
        singleData.data,
        singleData.name
      ),
    };
    return imgData;
  });

  // validation for no. and file
  // Phone validation
  if (req.files?.contacts == null && userEnteredNo[4] == undefined) {
    console.log("not provided any value");
    res.status(422).json({
      status: false,
      response: "Please Select a valid .vcf/.csv Contacts or type a number",
    });
  }
  // file validation
  if (req.files?.contacts != null) {
  }

  //2. userEntered No
  if (req.files?.contacts == null && userEnteredNo[4]) {
    console.log("User Entered Mobile No");
    // format userEntered no in desired form
    let formattedNo = [];
    const UserInputNo = JSON.parse(userEnteredNo);
    UserInputNo.forEach((num) => {
      formattedNo.push(`91${num}@c.us`);
    });
    console.log(formattedNo);
    // send message for each no.
    formattedNo.forEach((singleNo, index, array) => {
      // runs files.forEach for each single No
      setTimeout(function () {
        files.forEach((singlefile, filesIndex, filesArray) => {
          const interval = 5000; // 5 sec wait for each send
          setTimeout(function () {
            // forEach no you have to send Each file
            client
              .sendMessage(singleNo, singlefile.media, {
                caption: singlefile.caption,
              })
              .then((response) => {
                if (
                  index == array.length - 1 &&
                  filesIndex == filesArray.length - 1
                ) {
                  res.status(200).json({
                    status: true,
                    response: response,
                  });
                }
              })
              .catch((err) => {
                res.status(500).json({
                  status: false,
                  response: err,
                });
              });
          }, filesIndex * interval);
        });
      }, files.length * index * 5000 + 1);

      // runs files.forEach for each single No end
    });
  }

  //4. csv file No
  if (req.files?.contacts && req.files?.contacts.mimetype == "text/csv") {
    console.log("User Provided csv contacts");
    // retrieving csv contacts
    console.log(req.files);
    let contacts = await csv().fromFile(req.files.contacts.tempFilePath);

    // filter out undefined contact
    contacts = contacts.filter((contact) => contact.Phone != undefined);
    // return only first part of fullName by splitting at space
    const names = contacts.map((contact) => contact.Name.split(" ")[0]);
    contacts = contacts.map((contact) => `91${contact.Phone}@c.us`);
    constants.forEach((singleNo, index, array) => {
      if (singleNo == undefined || singleNo == null || singleNo == "") {
        return res.status(400).json({
          status: false,
          response: "Please Select a valid .vcf/.csv Contacts",
        });
      }
    });
    constants.forEach((singleNo, index, array) => {
      if (singleNo == undefined || singleNo == null || singleNo == "") {
        return res.status(400).json({
          status: false,
          response: "Please Select a valid .vcf/.csv Contacts",
        });
      }
    });

    contacts.forEach((singleNo, index, array) => {
      // runs files.forEach for each single No
      setTimeout(function () {
        files.forEach((singlefile, filesIndex, filesArray) => {
          const interval = 5000; // 5 sec wait for each send
          setTimeout(function () {
            client
              .sendMessage(
                singleNo,
                salutation + names[index] + "\n" + message1
              )
              .then((response) => {
                client
                  .sendMessage(singleNo, singlefile.media, {
                    caption: singlefile.caption,
                  })
                  .then((response) => {
                    if (
                      index == array.length - 1 &&
                      filesIndex == filesArray.length - 1
                    ) {
                      res.status(200).json({
                        status: true,
                        response: response,
                      });
                    }
                  })
                  .catch((err) => {
                    res.status(500).json({
                      status: false,
                      response: err,
                    });
                  });
              }, filesIndex * interval);
          });
        });
      }, files.length * index * 5000 + 1);
    });
  }
});

// Send message to group
// You can use chatID or group name, yea!
app.post(
  "/send-group-message",
  [
    body("id").custom((value, { req }) => {
      if (!value && !req.body.name) {
        throw new Error("Invalid value, you can use `id` or `name`");
      }
      return true;
    }),
    body("message").notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req).formatWith(({ msg }) => {
      return msg;
    });

    if (!errors.isEmpty()) {
      return res.status(422).json({
        status: false,
        message: errors.mapped(),
      });
    }

    let chatId = req.body.id;
    const groupName = req.body.name;
    const message = req.body.message;

    // Find the group by name
    if (!chatId) {
      const group = await findGroupByName(groupName);
      if (!group) {
        return res.status(422).json({
          status: false,
          message: "No group found with name: " + groupName,
        });
      }
      chatId = group.id._serialized;
    }

    client
      .sendMessage(chatId, message)
      .then((response) => {
        res.status(200).json({
          status: true,
          response: response,
        });
      })
      .catch((err) => {
        res.status(500).json({
          status: false,
          response: err,
        });
      });
  }
);

// Clearing message on spesific chat
app.post("/clear-message", [body("number").notEmpty()], async (req, res) => {
  const errors = validationResult(req).formatWith(({ msg }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped(),
    });
  }

  const number = phoneNumberFormatter(req.body.number);

  const isRegisteredNumber = await checkRegisteredNumber(number);

  if (!isRegisteredNumber) {
    return res.status(422).json({
      status: false,
      message: "The number is not registered",
    });
  }

  const chat = await client.getChatById(number);

  chat
    .clearMessages()
    .then((status) => {
      res.status(200).json({
        status: true,
        response: status,
      });
    })
    .catch((err) => {
      res.status(500).json({
        status: false,
        response: err,
      });
    });
});

server.listen(port, function () {
  console.log("App running on : " + port);
});
