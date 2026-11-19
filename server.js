
const express = require("express");
const session = require("express-session");
const crypto = require("crypto");

const app = express();

app.set("trust proxy", 1);
app.use(express.json());

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !SESSION_SECRET) {
  console.error("Missing environment variables!");
  process.exit(1);
}

app.use(session({
  name: "lyx.sid",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: "auto",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000
  }
}));

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>LYX SYSTEM</title>
      <style>
        body {
          background:#080808;
          color:white;
          font-family:Arial;
          text-align:center;
          padding-top:100px;
        }
        h1 {color:#a855f7;font-size:42px}
        a {
          display:inline-block;
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
      <p>Welcome to LYX Dashboard</p>
      <a href="/login">Login with Discord</a>
    </body>
    </html>
  `);
});

app.get("/login", (req, res, next) => {
  const state = crypto.randomBytes(32).toString("hex");

  req.session.oauthState = state;

  req.session.save(err => {
    if (err) return next(err);

    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "identify guilds",
      state
    });

    res.redirect(
      "https://discord.com/oauth2/authorize?" +
      params.toString()
    );
  });
});

app.get("/auth/discord/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state || !req.session.oauthState ||
        state !== req.session.oauthState) {
      return res.status(400).send(
        "Invalid OAuth state. Please return and login again."
      );
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
          code,
          redirect_uri: REDIRECT_URI
        })
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Token error:", tokenData);
      return res.status(400).send("Discord token exchange failed.");
    }

    const headers = {
      Authorization: `Bearer ${tokenData.access_token}`
    };

    const [userResponse, guildResponse] = await Promise.all([
      fetch("https://discord.com/api/users/@me", { headers }),
      fetch("https://discord.com/api/users/@me/guilds", { headers })
    ]);

    if (!userResponse.ok || !guildResponse.ok) {
      return res.status(400).send("Failed to load Discord account.");
    }

    const user = await userResponse.json();
    const guilds = await guildResponse.json();

    await new Promise((resolve, reject) => {
      req.session.regenerate(err => {
        if (err) reject(err);
        else resolve();
      });
    });

    req.session.user = {
      id: user.id,
      username: user.username,
      avatar: user.avatar
    };

    req.session.guilds = guilds.filter(guild =>
      (Number(guild.permissions) & 0x20) === 0x20
    );

    req.session.save(err => {
      if (err) {
        console.error(err);
        return res.status(500).send("Session save failed.");
      }

      res.redirect("/dashboard");
    });

  } catch (error) {
    console.error("OAuth error:", error);
    res.status(500).send("Internal dashboard error.");
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
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>LYX SYSTEM</title>
      <style>
        body {
          background:#080808;
          color:white;
          font-family:Arial;
          padding:25px;
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
        ${avatar ? `<img src="${escapeHtml(avatar)}">` : ""}
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

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("lyx.sid");
    res.redirect("/");
  });
});

app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log("LYX SYSTEM Dashboard started successfully!");
});
