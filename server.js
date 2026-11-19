
const express = require("express");
const session = require("express-session");

const app = express();

app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000
  }
}));

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

app.get("/", (req, res) => {
  if (!req.session.user) {
    return res.send(`
      <html>
      <head>
        <title>LYX SYSTEM</title>
        <style>
          body {
            background:#080808;
            color:white;
            font-family:Arial;
            text-align:center;
            padding-top:120px;
          }
          h1 {color:#a855f7;font-size:42px}
          a {
            background:#5865F2;
            color:white;
            padding:15px 25px;
            text-decoration:none;
            border-radius:10px;
          }
        </style>
      </head>
      <body>
        <h1>LYX SYSTEM</h1>
        <h2>Dashboard</h2>
        <a href="/login">Login with Discord</a>
      </body>
      </html>
    `);
  }

  res.redirect("/dashboard");
});

app.get("/login", (req, res) => {
  const state = require("crypto").randomBytes(24).toString("hex");
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "identify guilds",
    state
  });

  res.redirect(
    "https://discord.com/oauth2/authorize?" + params.toString()
  );
});

app.get("/auth/discord/callback", async (req, res) => {
  try {
    if (!req.query.code ||
        !req.query.state ||
        req.query.state !== req.session.oauthState) {
      return res.status(400).send("Invalid OAuth state");
    }

    delete req.session.oauthState;

    const tokenResponse = await fetch(
      "https://discord.com/api/oauth2/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          grant_type: "authorization_code",
          code: req.query.code,
          redirect_uri: REDIRECT_URI
        })
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return res.status(400).send("Discord login failed");
    }

    const userResponse = await fetch(
      "https://discord.com/api/users/@me",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      }
    );

    const user = await userResponse.json();

    if (!userResponse.ok) {
      return res.status(400).send("Could not get Discord user");
    }

    const guildResponse = await fetch(
      "https://discord.com/api/users/@me/guilds",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      }
    );

    const guilds = await guildResponse.json();

    if (!guildResponse.ok) {
      return res.status(400).send("Could not get Discord servers");
    }

    await new Promise((resolve, reject) => {
      req.session.regenerate(err => err ? reject(err) : resolve());
    });

    req.session.user = user;
    req.session.guilds = guilds.filter(guild =>
      (Number(guild.permissions) & 0x20) === 0x20
    );

    res.redirect("/dashboard");

  } catch (error) {
    console.error(error);
    res.status(500).send("Dashboard error");
  }
});

app.get("/dashboard", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }

  const user = req.session.user;
  const avatar = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
    : "";

  const guilds = req.session.guilds || [];

  res.send(`
    <html>
    <head>
      <title>LYX SYSTEM</title>
      <style>
        body {
          background:#080808;
          color:white;
          font-family:Arial;
          padding:30px;
        }
        h1 {color:#a855f7}
        .card {
          background:#171717;
          padding:20px;
          margin:12px 0;
          border-radius:12px;
        }
        img {
          width:65px;
          height:65px;
          border-radius:50%;
        }
        a {color:#a855f7}
      </style>
    </head>
    <body>
      <h1>LYX SYSTEM</h1>
      <div class="card">
        <img src="${avatar}" alt="">
        <h2>${escapeHtml(user.username)}</h2>
        <p>Discord Dashboard</p>
      </div>
      <h2>Your Servers</h2>
      ${guilds.map(g => `
        <div class="card">${escapeHtml(g.name)}</div>
      `).join("")}
      <a href="/logout">Logout</a>
    </body>
    </html>
  `);
});

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("LYX SYSTEM Dashboard is running!");
});
